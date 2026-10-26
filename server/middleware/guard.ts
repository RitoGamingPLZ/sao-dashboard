// Optional password (HTTP Basic, set DASHBOARD_PASSWORD) for everything, and
// for API writes: same-origin JSON only, so another site can't drive the bots.

import { timingSafeEqual } from 'node:crypto'

function isAuthorized(header: string | undefined, expected: string) {
  const match = /^Basic (.+)$/.exec(header || '')
  if (!match) return false
  const given = Buffer.from(Buffer.from(match[1]!, 'base64').toString().split(':').slice(1).join(':'))
  const wanted = Buffer.from(expected)
  return given.length === wanted.length && timingSafeEqual(given, wanted)
}

// Only answer to known host names, so a DNS-rebinding page (evil.example
// resolving to 127.0.0.1) can't reach the API. Add more with DASHBOARD_HOSTS=a.lan,b.lan.
const ALLOWED_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]', ...(process.env.DASHBOARD_HOSTS || '').split(',').map((h) => h.trim()).filter(Boolean)])
const hostnameOf = (host: string) => host.replace(/:\d+$/, '').toLowerCase()

export default defineEventHandler((event) => {
  setResponseHeaders(event, { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' })
  if (!ALLOWED_HOSTNAMES.has(hostnameOf(getRequestHeader(event, 'host') || ''))) {
    throw createError({ statusCode: 421, message: 'Unknown host — add it to DASHBOARD_HOSTS' })
  }
  const dashboardPassword = process.env.DASHBOARD_PASSWORD
  if (dashboardPassword && !isAuthorized(getRequestHeader(event, 'authorization'), dashboardPassword)) {
    setResponseHeader(event, 'WWW-Authenticate', 'Basic realm="SAO dashboard"')
    throw createError({ statusCode: 401, message: 'Password required' })
  }
  if (!event.path.startsWith('/api/') || event.method === 'GET') return
  const origin = getRequestHeader(event, 'origin')
  const host = getRequestHeader(event, 'host')
  const isSameOrigin = !origin || origin === `http://${host}` || origin === `https://${host}`
  const isJson = (getRequestHeader(event, 'content-type') || '').startsWith('application/json')
  if (!isSameOrigin || !isJson) {
    setResponseStatus(event, 403)
    return { error: 'Cross-site or non-JSON request refused' }
  }
})
