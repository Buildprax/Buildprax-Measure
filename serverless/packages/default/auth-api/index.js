import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { Pool } from 'pg'
import https from 'https'

const TRIAL_DAYS = 14
const GRACE_DAYS = 2
const ACCESS_TOKEN_MIN = 60
const REFRESH_TOKEN_DAYS = 30
const LICENSE_CONFIRM_MESSAGE_1 = 'Trial allowed multiple devices. Paid subscription is limited to one device.'
const LICENSE_CONFIRM_MESSAGE_2 = 'By continuing, this device becomes your licensed device.'
const VERIFY_TOKEN_HOURS = 24
const RESET_TOKEN_HOURS = 24
const AUTH_API_PUBLIC_BASE = 'https://faas-syd1-c274eac6.doserverless.co/api/v1/web/fn-2ec741fb-b50c-4391-994a-0fd583e5fd49/default/auth-api'

const corsHeaders = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, private, must-revalidate',
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
  let text = ''
  try {
    if (body === undefined || body === null) {
      text = JSON.stringify({
        ok: false,
        code: 'EMPTY_PAYLOAD',
        message: 'Server tried to send an empty JSON payload (internal bug).',
      })
    } else if (typeof body === 'string') {
      text = body
    } else {
      text = JSON.stringify(body, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
    }
  } catch {
    text = JSON.stringify({ ok: false, code: 'SERIALIZE_ERROR', message: 'Could not serialize response.' })
  }
  if (typeof text !== 'string' || !text.length) {
    text = JSON.stringify({ ok: false, code: 'SERIALIZE_EMPTY', message: 'Serialized body was empty.' })
  }
  return { statusCode, headers: corsHeaders, body: text }
}

function appBaseUrl() {
  return process.env.APP_BASE_URL || 'https://buildprax.com'
}

function randomToken() {
  return crypto.randomBytes(24).toString('hex')
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function addHours(date, hours) {
  const d = new Date(date)
  d.setHours(d.getHours() + hours)
  return d
}

function parseBody(args) {
  if (!args || typeof args !== 'object') return {}
  if (args.email || args.password || args.name || args.token || args.refreshToken || args.preAuthToken || args.newPassword) {
    return args
  }
  const body =
    args?.http?.body ??
    args?.body ??
    args?.__ow_body ??
    args?.value ??
    (typeof args?.http?.content === 'string' ? args.http.content : null)
  if (!body) return {}
  if (typeof body === 'string') {
    try {
      return JSON.parse(body)
    } catch {
      return {}
    }
  }
  if (typeof body === 'object') return body
  return {}
}

function readToken(args) {
  const h = args.http?.headers || {}
  const raw = h.authorization || h.Authorization || ''
  if (!raw.startsWith('Bearer ')) return null
  return raw.slice(7)
}

function basePath(args) {
  let p = String(args.http?.path || '')
  const qm = p.indexOf('?')
  if (qm >= 0) p = p.slice(0, qm)
  const hm = p.indexOf('#')
  if (hm >= 0) p = p.slice(0, hm)
  // Prefer the /auth/... segment so we never match the "auth" inside "auth-api".
  const authRoute = p.indexOf('/auth/')
  if (authRoute >= 0) p = p.slice(authRoute)
  else {
    const idx = p.indexOf('/auth')
    p = idx >= 0 ? p.slice(idx) : p
  }
  while (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
  return p
}

/** Query token for GET verify-email-link (DO Functions may put query on path, top-level args, or __ow_query). */
function extractVerificationToken(args) {
  const norm = (v) => String(v || '').trim()
  const fromTop = norm(args?.token)
  if (fromTop) return fromTop
  let q = args?.http?.query
  if (typeof q === 'string' && q.length) {
    try {
      q = Object.fromEntries(new URLSearchParams(q))
    } catch {
      q = {}
    }
  }
  if (q && typeof q === 'object') {
    const t = norm(q.token)
    if (t) return t
  }
  const ow = args?.__ow_query
  if (ow) {
    const t = norm(new URLSearchParams(String(ow)).get('token'))
    if (t) return t
  }
  const path = String(args?.http?.path || '')
  const qm = path.indexOf('?')
  if (qm >= 0) {
    const t = norm(new URLSearchParams(path.slice(qm + 1)).get('token'))
    if (t) return t
  }
  const h = args?.http?.headers || {}
  const fu = h['x-forwarded-url'] || h['X-Forwarded-Url'] || h['x-original-url'] || h['X-Original-URL'] || ''
  if (fu) {
    try {
      const qi = String(fu).indexOf('?')
      if (qi >= 0) {
        const t = norm(new URLSearchParams(String(fu).slice(qi + 1)).get('token'))
        if (t) return t
      }
    } catch {
      /* ignore */
    }
  }
  return ''
}

function tokenSecret() {
  return process.env.AUTH_JWT_SECRET || 'CHANGE_ME_AUTH_SECRET'
}

/** Some DB drivers or legacy rows may not return strict boolean. */
function isEmailVerifiedValue(v) {
  if (v === true || v === 1) return true
  if (v === false || v === 0 || v === null || v === undefined) return false
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    return s === 'true' || s === 't' || s === '1' || s === 'yes'
  }
  return false
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
      id bigserial primary key,
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
  await pool.query(`alter table app_users add column if not exists licensed_device_hash text;`)
  await pool.query(`alter table app_users add column if not exists licensed_device_label text;`)
  await pool.query(`alter table app_users add column if not exists licensed_device_confirmed_at timestamptz;`)
  await pool.query(`
    create table if not exists email_verification_tokens (
      id bigserial primary key,
      user_id uuid not null references app_users(id) on delete cascade,
      token_hash text not null,
      expires_at timestamptz not null,
      used_at timestamptz,
      created_at timestamptz not null default now()
    );
  `)
  await pool.query(`
    create table if not exists password_reset_tokens (
      id bigserial primary key,
      user_id uuid not null references app_users(id) on delete cascade,
      token_hash text not null,
      expires_at timestamptz not null,
      used_at timestamptz,
      created_at timestamptz not null default now()
    );
  `)
  await pool.query(`create index if not exists idx_email_verify_user on email_verification_tokens(user_id);`)
  await pool.query(`create index if not exists idx_email_verify_token on email_verification_tokens(token_hash);`)
  await pool.query(`create index if not exists idx_reset_user on password_reset_tokens(user_id);`)
  await pool.query(`create index if not exists idx_reset_token on password_reset_tokens(token_hash);`)
}

function sendGridEmail(payload) {
  const apiKey = process.env.SENDGRID_API_KEY
  if (!apiKey) return Promise.reject(new Error('SENDGRID_API_KEY is not configured'))
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload)
    const req = https.request(
      {
        hostname: 'api.sendgrid.com',
        path: '/v3/mail/send',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = ''
        res.on('data', (chunk) => { body += chunk })
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve()
          else reject(new Error(`SendGrid error ${res.statusCode}: ${body}`))
        })
      },
    )
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

async function sendVerificationEmail(email, token) {
  const verifyUrl = `${AUTH_API_PUBLIC_BASE}/auth/verify-email-link?token=${encodeURIComponent(token)}`
  const fromEmail = process.env.FROM_EMAIL || 'support@buildprax.com'
  const textBody = [
    'Hello,',
    '',
    'Welcome to Buildprax.',
    '',
    `Please verify your account by clicking this link: ${verifyUrl}`,
    '',
    'If you experience any problems, please contact support.',
    '',
    'Buildprax Support',
    'support@buildprax.com',
  ].join('\n')
  const htmlBody = `
    <div style="font-family: Aptos, Calibri, Arial, sans-serif; font-size: 12pt; line-height: 1.5; color: #111;">
      <p>Hello,</p>
      <p>Welcome to Buildprax.</p>
      <p>
        Please verify your account by clicking
        <a href="${verifyUrl}">this link</a>.
      </p>
      <p>If you experience any problems, please contact support.</p>
      <p>Buildprax Support<br>support@buildprax.com</p>
    </div>
  `
  await sendGridEmail({
    personalizations: [{ to: [{ email }], subject: 'Verify your Buildprax account' }],
    from: { email: fromEmail, name: 'Buildprax' },
    reply_to: { email: 'support@buildprax.com', name: 'Buildprax Support' },
    categories: ['transactional', 'buildprax-account', 'email-verification'],
    content: [
      { type: 'text/plain', value: textBody },
      { type: 'text/html', value: htmlBody },
    ],
    tracking_settings: {
      click_tracking: { enable: false, enable_text: false },
      open_tracking: { enable: false },
    },
  })
}

async function createAndSendVerificationToken(userId, email) {
  const token = randomToken()
  await pool.query(
    `insert into email_verification_tokens (user_id, token_hash, expires_at) values ($1,$2,$3)`,
    [userId, hashToken(token), addHours(new Date(), VERIFY_TOKEN_HOURS).toISOString()],
  )
  await sendVerificationEmail(email, token)
}

async function sendPasswordResetEmail(email, token) {
  const resetUrl = `${appBaseUrl()}/?reset=${encodeURIComponent(token)}`
  const fromEmail = process.env.FROM_EMAIL || 'support@buildprax.com'
  const textBody = [
    'Hello,',
    '',
    'We received a request to reset the password for your Buildprax account.',
    '',
    `Open this link in your browser to choose a new password (link expires in ${RESET_TOKEN_HOURS} hours): ${resetUrl}`,
    '',
    'If you did not request this, you can ignore this email.',
    '',
    'Buildprax Support',
    'support@buildprax.com',
  ].join('\n')
  const htmlBody = `
    <div style="font-family: Aptos, Calibri, Arial, sans-serif; font-size: 12pt; line-height: 1.5; color: #111;">
      <p>Hello,</p>
      <p>We received a request to reset the password for your Buildprax account.</p>
      <p>
        <a href="${resetUrl}">Click here to set a new password</a>
        (link expires in ${RESET_TOKEN_HOURS} hours.)
      </p>
      <p>If the button or link does not work, copy and paste this URL into your browser:<br/>
        <span style="word-break: break-all;">${resetUrl}</span>
      </p>
      <p>If you did not request this, you can ignore this email.</p>
      <p>Buildprax Support<br/>support@buildprax.com</p>
    </div>
  `
  await sendGridEmail({
    personalizations: [{ to: [{ email }], subject: 'Reset your Buildprax password' }],
    from: { email: fromEmail, name: 'Buildprax' },
    reply_to: { email: 'support@buildprax.com', name: 'Buildprax Support' },
    categories: ['transactional', 'buildprax-account', 'password-reset'],
    content: [
      { type: 'text/plain', value: textBody },
      { type: 'text/html', value: htmlBody },
    ],
    tracking_settings: {
      click_tracking: { enable: false, enable_text: false },
      open_tracking: { enable: false },
    },
  })
}

async function getEntitlementStateForUser(userId, trialStartedAt) {
  const s = await pool.query(
    `select s.current_period_end, p.code as package_code
     from subscriptions s
     join subscription_plans sp on sp.id = s.plan_id
     join packages p on p.id = sp.package_id
     where s.user_id = $1 and lower(s.status) = 'active'
     order by s.current_period_end desc nulls last, s.updated_at desc
     limit 1`,
    [userId],
  )

  const now = new Date()
  if (s.rowCount) {
    const periodEnd = new Date(s.rows[0].current_period_end)
    const grace = addDays(periodEnd, GRACE_DAYS)
    const state = now <= periodEnd ? 'paid' : (now <= grace ? 'grace' : 'expired')
    return { state, packageCode: String(s.rows[0].package_code || '').toUpperCase() || null }
  }

  const start = trialStartedAt ? new Date(trialStartedAt) : now
  const trialEndsAt = addDays(start, TRIAL_DAYS)
  const graceEndsAt = addDays(new Date(trialEndsAt), GRACE_DAYS)
  const state = now <= trialEndsAt ? 'trial' : (now <= graceEndsAt ? 'grace' : 'expired')
  return { state, packageCode: null }
}

async function issueSessionTokens(user, rememberMe) {
  const now = new Date()
  const accessExp = addDays(now, 0)
  accessExp.setMinutes(accessExp.getMinutes() + ACCESS_TOKEN_MIN)
  const refreshExp = addDays(now, rememberMe ? REFRESH_TOKEN_DAYS : 7)

  const sub = String(user.id)
  const accessToken = jwt.sign({ sub, email: user.email, typ: 'access' }, tokenSecret(), { expiresIn: `${ACCESS_TOKEN_MIN}m` })
  const refreshToken = jwt.sign({ sub, email: user.email, typ: 'refresh' }, tokenSecret(), { expiresIn: `${rememberMe ? REFRESH_TOKEN_DAYS : 7}d` })

  await pool.query(
    `insert into auth_sessions (user_id, refresh_token_hash, expires_at) values ($1,$2,$3)`,
    [user.id, refreshHash(refreshToken), refreshExp.toISOString()],
  )

  return {
    ok: true,
    accessToken,
    refreshToken,
    accessTokenExpiresAt: accessExp.toISOString(),
    refreshTokenExpiresAt: refreshExp.toISOString(),
    user: { id: user.id, email: user.email, emailVerified: true },
  }
}

async function signup(body) {
  const email = String(body.email || '').trim().toLowerCase()
  const password = String(body.password || '')
  const name = String(body.name || '').trim()
  if (!email || !email.includes('@') || password.length < 6) {
    return json(400, { ok: false, code: 'INVALID_INPUT', message: 'Invalid signup payload.' })
  }
  if (!String(process.env.SENDGRID_API_KEY || '').trim()) {
    console.error('[auth-api] SENDGRID_API_KEY is not set — cannot send verification email')
    return json(503, {
      ok: false,
      code: 'EMAIL_SERVICE_UNAVAILABLE',
      message:
        'Sign up is temporarily unavailable because email is not configured on the server. Please try again later or contact support@buildprax.com.',
    })
  }
  const passHash = await bcrypt.hash(password, 10)
  try {
    const r = await pool.query(
      `insert into app_users (email, password_hash, full_name, is_active, email_verified, trial_started_at)
       values ($1,$2,$3,true,false,now())
       returning id`,
      [email, passHash, name || null],
    )
    const newUserId = r.rows[0].id
    try {
      await createAndSendVerificationToken(newUserId, email)
    } catch (sendErr) {
      console.error('[auth-api] signup verification email failed', email, String(sendErr?.message || sendErr))
      try {
        await pool.query(`delete from app_users where id = $1`, [newUserId])
      } catch (delErr) {
        console.error('[auth-api] rollback new user after email failure failed', String(delErr?.message || delErr))
      }
      return json(503, {
        ok: false,
        code: 'VERIFICATION_EMAIL_FAILED',
        message:
          'We could not send the verification email, so your account was not kept. Try again in a few minutes, check that your address is correct, or contact support@buildprax.com.',
      })
    }
    return json(200, {
      ok: true,
      userId: newUserId,
      emailVerified: false,
      requiresEmailVerification: true,
      verificationEmailSent: true,
    })
  } catch (e) {
    if (String(e.message).includes('duplicate key')) {
      const existing = await pool.query(
        `select id, email, coalesce(email_verified,false) as email_verified from app_users where email = $1 limit 1`,
        [email],
      )
      if (existing.rowCount && !isEmailVerifiedValue(existing.rows[0].email_verified)) {
        let verificationEmailSent = true
        try {
          await createAndSendVerificationToken(existing.rows[0].id, existing.rows[0].email)
        } catch (sendErr) {
          verificationEmailSent = false
          console.error('[auth-api] duplicate-unverified resend failed', email, String(sendErr?.message || sendErr))
        }
        return json(200, {
          ok: true,
          emailVerified: false,
          requiresEmailVerification: true,
          verificationEmailSent,
          message: verificationEmailSent
            ? 'Account already exists and is not verified. A new verification email has been sent.'
            : 'Account already exists and is not verified. Verification email could not be sent right now.',
        })
      }
      return json(409, { ok: false, code: 'EMAIL_EXISTS', message: 'Email already exists.' })
    }
    return json(500, { ok: false, code: 'SERVER_ERROR', message: 'Signup failed.' })
  }
}

async function login(body) {
  const email = String(body.email || '').trim().toLowerCase()
  const password = String(body.password || '')
  const rememberMe = !!body.rememberMe
  const deviceFingerprint = String(body.deviceFingerprint || '').trim()
  const deviceLabel = String(body.deviceLabel || '').trim()
  const isDesktopClient = String(body.clientType || '').toLowerCase() === 'desktop'
  const r = await pool.query(
    `select id, email, password_hash, coalesce(email_verified,false) as email_verified, is_active,
            trial_started_at, licensed_device_hash, licensed_device_label
     from app_users where email = $1`,
    [email],
  )
  if (!r.rowCount) return json(401, { ok: false, code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' })
  const user = r.rows[0]
  const ok = await bcrypt.compare(password, user.password_hash || '')
  if (!ok) return json(401, { ok: false, code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' })
  if (!user.is_active) return json(423, { ok: false, code: 'ACCOUNT_LOCKED', message: 'Account temporarily locked.' })
  if (!isEmailVerifiedValue(user.email_verified)) {
    return json(403, { ok: false, code: 'EMAIL_NOT_VERIFIED', message: 'Please verify your email address before signing in.' })
  }

  const entitlement = await getEntitlementStateForUser(user.id, user.trial_started_at)
  const requiresLicensedDeviceConfirmation = isDesktopClient && (entitlement.state === 'paid' || entitlement.state === 'grace')

  if (requiresLicensedDeviceConfirmation) {
    if (!deviceFingerprint) {
      return json(400, { ok: false, code: 'DEVICE_REQUIRED', message: 'Device information is required for paid login.' })
    }
    if (!user.licensed_device_hash) {
      const preAuthToken = jwt.sign(
        { sub: String(user.id), email: user.email, typ: 'device_confirm', rememberMe, deviceFingerprint, deviceLabel },
        tokenSecret(),
        { expiresIn: '10m' },
      )
      return json(200, {
        ok: false,
        code: 'LICENSED_DEVICE_CONFIRMATION_REQUIRED',
        confirmationRequired: true,
        message: LICENSE_CONFIRM_MESSAGE_1,
        confirmationLine1: LICENSE_CONFIRM_MESSAGE_1,
        confirmationLine2: LICENSE_CONFIRM_MESSAGE_2,
        preAuthToken,
      })
    }
    if (user.licensed_device_hash !== deviceFingerprint) {
      return json(423, {
        ok: false,
        code: 'LICENSED_DEVICE_MISMATCH',
        message:
          `This paid subscription is already assigned to another device (${user.licensed_device_label || 'licensed device'}). `
          + 'To use this seat on a different computer, contact support@buildprax.com so we can move the licence for you.',
      })
    }
  }

  const session = await issueSessionTokens(user, rememberMe)
  if (!session || session.ok !== true || !session.accessToken || !session.refreshToken) {
    return json(500, {
      ok: false,
      code: 'SESSION_ISSUE',
      message: 'Could not create a session (missing tokens). Please try again.',
    })
  }
  return json(200, session)
}

async function confirmLicensedDevice(body) {
  const preAuthToken = String(body.preAuthToken || '')
  if (!preAuthToken) return json(400, { ok: false, code: 'INVALID_INPUT', message: 'Missing device confirmation token.' })

  let decoded
  try {
    decoded = jwt.verify(preAuthToken, tokenSecret())
  } catch {
    return json(401, { ok: false, code: 'TOKEN_EXPIRED', message: 'Device confirmation token expired.' })
  }
  if (decoded?.typ !== 'device_confirm' || !decoded?.sub || !decoded?.deviceFingerprint) {
    return json(400, { ok: false, code: 'INVALID_INPUT', message: 'Invalid device confirmation token.' })
  }

  const r = await pool.query(
    `select id, email, licensed_device_hash, licensed_device_label from app_users where id = $1`,
    [decoded.sub],
  )
  if (!r.rowCount) return json(404, { ok: false, code: 'NOT_FOUND', message: 'User not found.' })
  const user = r.rows[0]

  if (!user.licensed_device_hash) {
    await pool.query(
      `update app_users set licensed_device_hash = $2, licensed_device_label = $3, licensed_device_confirmed_at = now() where id = $1`,
      [user.id, decoded.deviceFingerprint, decoded.deviceLabel || null],
    )
  } else if (user.licensed_device_hash !== decoded.deviceFingerprint) {
    return json(423, {
      ok: false,
      code: 'LICENSED_DEVICE_MISMATCH',
      message:
        `This paid subscription is already assigned to another device (${user.licensed_device_label || 'licensed device'}). `
        + 'To use this seat on a different computer, contact support@buildprax.com so we can move the licence for you.',
    })
  }

  const session = await issueSessionTokens(user, !!decoded.rememberMe)
  if (!session || session.ok !== true || !session.accessToken || !session.refreshToken) {
    return json(500, {
      ok: false,
      code: 'SESSION_ISSUE',
      message: 'Could not create a session (missing tokens). Please try again.',
    })
  }
  return json(200, session)
}

async function verifyEmail(body) {
  const token = String(body.token || '')
  if (!token) return json(400, { ok: false, code: 'INVALID_INPUT', message: 'Missing verification token.' })
  const tokenHash = hashToken(token)
  const r = await pool.query(
    `select id, user_id, expires_at, used_at from email_verification_tokens where token_hash = $1 order by id desc limit 1`,
    [tokenHash],
  )
  if (!r.rowCount) return json(400, { ok: false, code: 'INVALID_TOKEN', message: 'Verification token is invalid.' })
  const row = r.rows[0]
  if (row.used_at) {
    const u = await pool.query(`select coalesce(email_verified,false) as email_verified from app_users where id = $1`, [row.user_id])
    if (u.rowCount && isEmailVerifiedValue(u.rows[0].email_verified)) {
      return json(200, { ok: true, emailVerified: true, alreadyVerified: true })
    }
    return json(400, { ok: false, code: 'TOKEN_USED', message: 'Verification token was already used.' })
  }
  if (new Date() > new Date(row.expires_at)) return json(400, { ok: false, code: 'TOKEN_EXPIRED', message: 'Verification token has expired.' })
  await pool.query(`update app_users set email_verified = true where id = $1`, [row.user_id])
  await pool.query(`update email_verification_tokens set used_at = now() where id = $1`, [row.id])
  return json(200, { ok: true, emailVerified: true })
}

async function verifyEmailByTokenString(token) {
  if (!token) return { ok: false, code: 'INVALID_INPUT', message: 'Missing verification token.' }
  const tokenHash = hashToken(token)
  const r = await pool.query(
    `select id, user_id, expires_at, used_at from email_verification_tokens where token_hash = $1 order by id desc limit 1`,
    [tokenHash],
  )
  if (!r.rowCount) return { ok: false, code: 'INVALID_TOKEN', message: 'Verification token is invalid.' }
  const row = r.rows[0]
  if (row.used_at) {
    const u = await pool.query(`select coalesce(email_verified,false) as email_verified from app_users where id = $1`, [row.user_id])
    if (u.rowCount && isEmailVerifiedValue(u.rows[0].email_verified)) {
      return { ok: true, alreadyVerified: true }
    }
    return { ok: false, code: 'TOKEN_USED', message: 'Verification token was already used.' }
  }
  if (new Date() > new Date(row.expires_at)) return { ok: false, code: 'TOKEN_EXPIRED', message: 'Verification token has expired.' }
  await pool.query(`update app_users set email_verified = true where id = $1`, [row.user_id])
  await pool.query(`update email_verification_tokens set used_at = now() where id = $1`, [row.id])
  return { ok: true }
}

async function resendVerification(body) {
  const email = String(body.email || '').trim().toLowerCase()
  if (!email || !email.includes('@')) return json(400, { ok: false, code: 'INVALID_INPUT', message: 'Please enter a valid email.' })
  const r = await pool.query(`select id, email, email_verified from app_users where email = $1`, [email])
  if (!r.rowCount) return json(200, { ok: true })
  const user = r.rows[0]
  if (isEmailVerifiedValue(user.email_verified)) return json(200, { ok: true, alreadyVerified: true })
  try {
    await createAndSendVerificationToken(user.id, user.email)
    return json(200, { ok: true, sent: true })
  } catch (sendErr) {
    console.error('[auth-api] resend verification failed', email, String(sendErr?.message || sendErr))
    return json(500, { ok: false, code: 'EMAIL_SEND_FAILED', message: 'Could not send verification email right now.' })
  }
}

async function requestPasswordReset(body) {
  const email = String(body.email || '').trim().toLowerCase()
  if (!email) return json(200, { ok: true })
  const r = await pool.query(`select id, email from app_users where email = $1`, [email])
  if (!r.rowCount) return json(200, { ok: true })
  const user = r.rows[0]
  const token = randomToken()
  await pool.query(
    `insert into password_reset_tokens (user_id, token_hash, expires_at) values ($1,$2,$3)`,
    [user.id, hashToken(token), addHours(new Date(), RESET_TOKEN_HOURS).toISOString()],
  )
  try {
    await sendPasswordResetEmail(user.email, token)
  } catch (sendErr) {
    console.error('[auth-api] password reset email failed', email, String(sendErr?.message || sendErr))
    return json(500, {
      ok: false,
      code: 'EMAIL_SEND_FAILED',
      message:
        'Could not send the password reset email right now. Please try again in a few minutes or contact support@buildprax.com.',
    })
  }
  return json(200, { ok: true })
}

async function resetPassword(body) {
  const token = String(body.token || '')
  const newPassword = String(body.newPassword || '')
  if (!token || newPassword.length < 6) {
    return json(400, { ok: false, code: 'INVALID_INPUT', message: 'Invalid reset payload.' })
  }
  const tokenHash = hashToken(token)
  const r = await pool.query(
    `select id, user_id, expires_at, used_at from password_reset_tokens where token_hash = $1 order by id desc limit 1`,
    [tokenHash],
  )
  if (!r.rowCount) return json(400, { ok: false, code: 'INVALID_TOKEN', message: 'Reset token is invalid.' })
  const row = r.rows[0]
  if (row.used_at) return json(400, { ok: false, code: 'TOKEN_USED', message: 'Reset token was already used.' })
  if (new Date() > new Date(row.expires_at)) return json(400, { ok: false, code: 'TOKEN_EXPIRED', message: 'Reset token has expired.' })
  const passHash = await bcrypt.hash(newPassword, 10)
  // Reset link was sent to this user's inbox — treat as email ownership proof.
  await pool.query(
    `update app_users set password_hash = $2, email_verified = true where id = $1`,
    [row.user_id, passHash],
  )
  await pool.query(`update password_reset_tokens set used_at = now() where id = $1`, [row.id])
  return json(200, { ok: true, emailVerified: true })
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
  const sub = String(decoded.sub)
  const accessToken = jwt.sign({ sub, email: decoded.email, typ: 'access' }, tokenSecret(), { expiresIn: `${ACCESS_TOKEN_MIN}m` })
  const newRefresh = jwt.sign({ sub, email: decoded.email, typ: 'refresh' }, tokenSecret(), { expiresIn: `${REFRESH_TOKEN_DAYS}d` })

  await pool.query(`update auth_sessions set revoked_at = now() where id = $1`, [s.rows[0].id])
  await pool.query(`insert into auth_sessions (user_id, refresh_token_hash, expires_at) values ($1,$2,$3)`, [sub, refreshHash(newRefresh), refreshExp.toISOString()])

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
     order by s.current_period_end desc nulls last, s.updated_at desc
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
  try {
    if (args.http?.method === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
    await ensureSchema()
    const p = basePath(args)
    const body = parseBody(args)
    const method = String(args.http?.method || 'POST').toUpperCase()

    if (method === 'GET' && p.endsWith('/auth/ping')) {
      return json(200, { ok: true, ping: true, time: new Date().toISOString() })
    }
    if (method === 'GET' && p.endsWith('/auth/health')) {
      const sendgridConfigured = !!String(process.env.SENDGRID_API_KEY || '').trim()
      let dbOk = false
      let dbError = ''
      try {
        await pool.query('select 1 as health_check')
        dbOk = true
      } catch (e) {
        dbError = String(e?.message || e).slice(0, 240)
      }
      const ok = dbOk && sendgridConfigured
      return json(ok ? 200 : 503, {
        ok,
        time: new Date().toISOString(),
        db: dbOk ? 'up' : 'down',
        sendgrid: sendgridConfigured ? 'configured' : 'missing',
        ...(dbOk ? {} : { dbError }),
      })
    }

    if (method === 'POST' && p.endsWith('/auth/signup')) return signup(body)
    // `/auth/session` mirrors `/auth/login` so browsers/SW caches cannot serve a stale OPTIONS 204 for the POST URL.
    if (method === 'POST' && (p.endsWith('/auth/login') || p.endsWith('/auth/session'))) return login(body)
    if (method === 'POST' && p.endsWith('/auth/verify-email')) return verifyEmail(body)
    if (method === 'GET' && p.endsWith('/auth/verify-email-link')) {
      const token = extractVerificationToken(args)
      const result = await verifyEmailByTokenString(token)
      const target = result.ok
        ? `${appBaseUrl()}/account-verified.html?status=success`
        : `${appBaseUrl()}/account-verified.html?status=error&reason=${encodeURIComponent(result.message || 'Verification failed')}`
      return {
        statusCode: 302,
        headers: { Location: target, 'Cache-Control': 'no-store' },
        body: '',
      }
    }
    if (method === 'POST' && p.endsWith('/auth/resend-verification')) return resendVerification(body)
    if (method === 'POST' && p.endsWith('/auth/request-password-reset')) return requestPasswordReset(body)
    if (method === 'POST' && p.endsWith('/auth/reset-password')) return resetPassword(body)
    if (method === 'POST' && p.endsWith('/auth/device-license/confirm')) return confirmLicensedDevice(body)
    if (method === 'POST' && p.endsWith('/auth/refresh')) return refresh(body)

    if ((method === 'GET' || method === 'POST') && (p.endsWith('/me/entitlement') || p.endsWith('/auth/entitlement'))) {
      const userId = await authUser(args)
      if (!userId) return json(401, { ok: false, code: 'TOKEN_EXPIRED', message: 'Access token expired.' })
      return entitlement(userId)
    }

    return json(404, { ok: false, code: 'NOT_FOUND', message: `Route not found: ${method} ${p}` })
  } catch (err) {
    return json(500, {
      ok: false,
      code: 'SERVER_ERROR',
      message: err?.message || 'Unhandled auth-api error.',
    })
  }
}

// force redeploy Sat 11 Apr 2026 — basePath strips ?query so POST /auth/session?cb= matches
