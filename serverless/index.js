import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { Pool } from 'pg'

const TRIAL_DAYS = 14
const GRACE_DAYS = 2
const ACCESS_TOKEN_MIN = 60
const REFRESH_TOKEN_DAYS = 30

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-App-Platform,X-App-Version',
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
})

function json(statusCode, body) {
  return { statusCode, headers: corsHeaders, body }
}

function parseBody(args) {
  const body = args.http?.body ?? args.body
  if (!body) return {}
  if (typeof body === 'string') {
    try { return JSON.parse(body) } catch { return {} }
  }
  return body
}

function readToken(args) {
  const h = args.http?.headers || {}
  const raw = h.authorization || h.Authorization || ''
  if (!raw.startsWith('Bearer ')) return null
  return raw.slice(7)
}

function basePath(args) {
  const p = args.http?.path || ''
  // supports /api/auth-api/login or /auth/login
  const idx = p.indexOf('/auth')
  return idx >= 0 ? p.slice(idx) : p
}

function tokenSecret() {
  return process.env.AUTH_JWT_SECRET || 'CHANGE_ME_AUTH_SECRET'
}

function refreshHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

async function ensureSchema() {
  await pool.query(`
    create table if not exists auth_sessions (
      id uuid primary key default uuid_generate_v4(),
      user_id uuid not null references app_users(id) on delete cascade,
      refresh_token_hash text not null,
      expires_at timestamptz not null,
      revoked_at timestamptz,
      created_at timestamptz not null default now()
    );
  `)
  await pool.query(`create index if not exists idx_auth_sessions_user_id on auth_sessions(user_id);`)
  await pool.query(`create index if not exists idx_auth_sessions_refresh_hash on auth_sessions(refresh_token_hash);`)
  await pool.query(`alter table app_users add column if not exists email_verified boolean not null default false;`)
  await pool.query(`alter table app_users add column if not exists trial_started_at timestamptz;`)
}

async function signup(body) {
  const email = String(body.email || '').trim().toLowerCase()
  const password = String(body.password || '')
  const name = String(body.name || '').trim()
  if (!email || !email.includes('@') || password.length < 6) {
    return json(400, { ok: false, code: 'INVALID_INPUT', message: 'Invalid signup payload.' })
  }
  const passHash = await bcrypt.hash(password, 10)
  try {
    const r = await pool.query(
      `insert into app_users (email, password_hash, full_name, is_active, email_verified, trial_started_at)
       values ($1,$2,$3,true,false,now())
       returning id`,
      [email, passHash, name || null],
    )
    return json(200, { ok: true, userId: r.rows[0].id, emailVerified: false })
  } catch (e) {
    if (String(e.message).includes('duplicate key')) {
      return json(409, { ok: false, code: 'EMAIL_EXISTS', message: 'Email already exists.' })
    }
    return json(500, { ok: false, code: 'SERVER_ERROR', message: 'Signup failed.' })
  }
}

async function login(body) {
  const email = String(body.email || '').trim().toLowerCase()
  const password = String(body.password || '')
  const rememberMe = !!body.rememberMe
  const r = await pool.query(
    `select id, email, password_hash, coalesce(email_verified,false) as email_verified, is_active
     from app_users where email = $1`,
    [email],
  )
  if (!r.rowCount) return json(401, { ok: false, code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' })
  const user = r.rows[0]
  const ok = await bcrypt.compare(password, user.password_hash || '')
  if (!ok) return json(401, { ok: false, code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' })
  if (!user.is_active) return json(423, { ok: false, code: 'ACCOUNT_LOCKED', message: 'Account temporarily locked.' })
  if (!user.email_verified) return json(403, { ok: false, code: 'EMAIL_NOT_VERIFIED', message: 'Please verify your email first.' })

  const now = new Date()
  const accessExp = addDays(now, 0)
  accessExp.setMinutes(accessExp.getMinutes() + ACCESS_TOKEN_MIN)
  const refreshExp = addDays(now, rememberMe ? REFRESH_TOKEN_DAYS : 7)

  const accessToken = jwt.sign({ sub: user.id, email: user.email, typ: 'access' }, tokenSecret(), { expiresIn: `${ACCESS_TOKEN_MIN}m` })
  const refreshToken = jwt.sign({ sub: user.id, email: user.email, typ: 'refresh' }, tokenSecret(), { expiresIn: `${rememberMe ? REFRESH_TOKEN_DAYS : 7}d` })
  await pool.query(
    `insert into auth_sessions (user_id, refresh_token_hash, expires_at) values ($1,$2,$3)`,
    [user.id, refreshHash(refreshToken), refreshExp.toISOString()],
  )
  return json(200, {
    ok: true,
    accessToken,
    refreshToken,
    accessTokenExpiresAt: accessExp.toISOString(),
    refreshTokenExpiresAt: refreshExp.toISOString(),
    user: { id: user.id, email: user.email, emailVerified: true },
  })
}

async function refresh(body) {
  const rt = String(body.refreshToken || '')
  if (!rt) return json(401, { ok: false, code: 'REFRESH_INVALID', message: 'Refresh token invalid or revoked.' })
  let decoded
  try {
    decoded = jwt.verify(rt, tokenSecret())
  } catch {
    return json(401, { ok: false, code: 'REFRESH_INVALID', message: 'Refresh token invalid or revoked.' })
  }
  const h = refreshHash(rt)
  const s = await pool.query(`select * from auth_sessions where refresh_token_hash = $1 and revoked_at is null`, [h])
  if (!s.rowCount) return json(401, { ok: false, code: 'REFRESH_INVALID', message: 'Refresh token invalid or revoked.' })

  const now = new Date()
  const accessExp = addDays(now, 0)
  accessExp.setMinutes(accessExp.getMinutes() + ACCESS_TOKEN_MIN)
  const refreshExp = addDays(now, REFRESH_TOKEN_DAYS)
  const accessToken = jwt.sign({ sub: decoded.sub, email: decoded.email, typ: 'access' }, tokenSecret(), { expiresIn: `${ACCESS_TOKEN_MIN}m` })
  const newRefresh = jwt.sign({ sub: decoded.sub, email: decoded.email, typ: 'refresh' }, tokenSecret(), { expiresIn: `${REFRESH_TOKEN_DAYS}d` })

  await pool.query(`update auth_sessions set revoked_at = now() where id = $1`, [s.rows[0].id])
  await pool.query(`insert into auth_sessions (user_id, refresh_token_hash, expires_at) values ($1,$2,$3)`, [decoded.sub, refreshHash(newRefresh), refreshExp.toISOString()])

  return json(200, {
    ok: true,
    accessToken,
    refreshToken: newRefresh,
    accessTokenExpiresAt: accessExp.toISOString(),
    refreshTokenExpiresAt: refreshExp.toISOString(),
  })
}

async function entitlement(userId) {
  const u = await pool.query(
    `select id, email, trial_started_at from app_users where id = $1`,
    [userId],
  )
  if (!u.rowCount) return json(404, { ok: false, code: 'NOT_FOUND', message: 'User not found.' })
  const user = u.rows[0]
  const s = await pool.query(
    `select s.current_period_end, s.status, p.code as package_code
     from subscriptions s
     join subscription_plans sp on sp.id = s.plan_id
     join packages p on p.id = sp.package_id
     where s.user_id = $1 and lower(s.status) = 'active'
     order by s.updated_at desc
     limit 1`,
    [userId],
  )
  const now = new Date()
  let state = 'expired'
  let packageCode = null
  let trialEndsAt = null
  let paidEndsAt = null
  let graceEndsAt = null

  if (s.rowCount) {
    packageCode = String(s.rows[0].package_code || '').toUpperCase()
    paidEndsAt = new Date(s.rows[0].current_period_end).toISOString()
    const grace = addDays(new Date(s.rows[0].current_period_end), GRACE_DAYS)
    graceEndsAt = grace.toISOString()
    state = now <= new Date(s.rows[0].current_period_end) ? 'paid' : (now <= grace ? 'grace' : 'expired')
  } else {
    const start = user.trial_started_at ? new Date(user.trial_started_at) : now
    trialEndsAt = addDays(start, TRIAL_DAYS).toISOString()
    graceEndsAt = addDays(new Date(trialEndsAt), GRACE_DAYS).toISOString()
    state = now <= new Date(trialEndsAt) ? 'trial' : (now <= new Date(graceEndsAt) ? 'grace' : 'expired')
  }

  const m = {
    QTZ: { measure: true, boq: false, certificates: false, feasibility: false },
    EMD: { measure: true, boq: false, certificates: false, feasibility: true },
    SAP: { measure: true, boq: true, certificates: true, feasibility: false },
    DMD: { measure: true, boq: true, certificates: true, feasibility: true },
  }
  const moduleEntitlements = state === 'trial' ? m.DMD : (m[packageCode] || { measure: false, boq: false, certificates: false, feasibility: false })

  return json(200, {
    ok: true,
    state,
    packageCode: packageCode || null,
    trialEndsAt,
    paidEndsAt,
    graceEndsAt,
    moduleEntitlements,
    serverNow: now.toISOString(),
  })
}

async function authUser(args) {
  const at = readToken(args)
  if (!at) return null
  try {
    const d = jwt.verify(at, tokenSecret())
    return d.sub
  } catch {
    return null
  }
}

export async function main(args) {
  if (args.http?.method === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  await ensureSchema()
  const p = basePath(args)
  const body = parseBody(args)
  const method = String(args.http?.method || 'POST').toUpperCase()

  if (method === 'POST' && p.endsWith('/auth/signup')) return signup(body)
  if (method === 'POST' && p.endsWith('/auth/login')) return login(body)
  if (method === 'POST' && p.endsWith('/auth/refresh')) return refresh(body)

  if (method === 'GET' && p.endsWith('/me/entitlement')) {
    const userId = await authUser(args)
    if (!userId) return json(401, { ok: false, code: 'TOKEN_EXPIRED', message: 'Access token expired.' })
    return entitlement(userId)
  }

  return json(404, { ok: false, code: 'NOT_FOUND', message: `Route not found: ${method} ${p}` })
}

