/**
 * Same-origin auth façade: browser → https://buildprax.com/api/auth/auth/… → DigitalOcean auth function.
 * Node 18+ only (fetch). No npm dependencies.
 */
import http from 'http'
import { Readable } from 'stream'

const UPSTREAM = String(
  process.env.AUTH_API_UPSTREAM ||
    'https://faas-syd1-c274eac6.doserverless.co/api/v1/web/fn-2ec741fb-b50c-4391-994a-0fd583e5fd49/default/auth-api',
).replace(/\/$/, '')
const PREFIX = String(process.env.PROXY_STRIP_PREFIX || '/api/auth').replace(/\/$/, '')
const PORT = Number(process.env.PORT || 8080)

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
])

function forwardHeaders(req) {
  const out = {}
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    const k = req.rawHeaders[i]
    const v = req.rawHeaders[i + 1]
    if (v == null) continue
    if (HOP_BY_HOP.has(String(k).toLowerCase())) continue
    out[k] = v
  }
  return out
}

/**
 * Ingress often strips the public route prefix (/api/auth) before the request hits this process.
 * Browser: /api/auth/healthz  →  container may see /healthz
 * Browser: /api/auth/auth/session  →  container may see /auth/session
 */
function normalizeIncomingPath(full) {
  if (full.startsWith(`${PREFIX}/`) || full === PREFIX) return full
  const qi = full.indexOf('?')
  const pathOnly = qi >= 0 ? full.slice(0, qi) : full
  const qs = qi >= 0 ? full.slice(qi) : ''
  if (pathOnly === '/healthz' || pathOnly === '/healthz/') {
    return `${PREFIX}/healthz${qs}`
  }
  if (pathOnly.startsWith('/auth')) {
    return `${PREFIX}${pathOnly}${qs}`
  }
  return full
}

function buildTargetUrl(fullPathAndQuery) {
  let rest = fullPathAndQuery.slice(PREFIX.length) || '/'
  if (!rest.startsWith('/')) rest = `/${rest}`
  return `${UPSTREAM}${rest}`
}

function sendJson(res, status, body) {
  const buf = Buffer.from(JSON.stringify(body))
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': buf.length,
  })
  res.end(buf)
}

const server = http.createServer(async (req, res) => {
  const full = normalizeIncomingPath(String(req.url || '/').split('#')[0])

  if (full === `${PREFIX}/healthz` || full.startsWith(`${PREFIX}/healthz?`)) {
    return sendJson(res, 200, { ok: true, proxy: true, prefix: PREFIX, upstream: UPSTREAM })
  }

  if (!full.startsWith(`${PREFIX}/`) && full !== PREFIX) {
    res.writeHead(404)
    return res.end('')
  }

  const targetUrl = buildTargetUrl(full)
  const method = String(req.method || 'GET').toUpperCase()
  const hasBody = !['GET', 'HEAD'].includes(method)

  try {
    const init = {
      method,
      headers: forwardHeaders(req),
      redirect: 'manual',
    }
    if (hasBody) {
      init.body = Readable.toWeb(req)
      init.duplex = 'half'
    }

    const upstream = await fetch(targetUrl, init)
    const buf = Buffer.from(await upstream.arrayBuffer())
    let status = upstream.status
    let payload = buf
    let contentType = upstream.headers.get('content-type') || ''

    const emptyLogin =
      hasBody &&
      (status === 204 ||
        status === 304 ||
        (status === 200 && buf.length === 0) ||
        (status === 200 && !String(contentType).toLowerCase().includes('json') && buf.length === 0))

    if (emptyLogin) {
      status = 502
      contentType = 'application/json; charset=utf-8'
      payload = Buffer.from(
        JSON.stringify({
          ok: false,
          code: 'UPSTREAM_EMPTY',
          message: 'Authentication service returned an empty response. Please try again.',
        }),
      )
    }

    const outHeaders = {
      'cache-control': 'no-store, no-cache, private, must-revalidate',
    }
    if (contentType) outHeaders['content-type'] = contentType

    const loc = upstream.headers.get('location')
    if (loc) outHeaders.location = loc

    for (const name of ['content-security-policy', 'x-request-id', 'x-openwhisk-activation-id']) {
      const v = upstream.headers.get(name)
      if (v) outHeaders[name] = v
    }
    outHeaders['content-length'] = payload.length

    res.writeHead(status, outHeaders)
    res.end(payload)
  } catch (err) {
    sendJson(res, 502, {
      ok: false,
      code: 'PROXY_ERROR',
      message: err?.message || 'Could not reach authentication service.',
    })
  }
})

server.listen(PORT, () => {
  console.log(`auth-proxy ${PREFIX} → ${UPSTREAM} (port ${PORT})`)
})
