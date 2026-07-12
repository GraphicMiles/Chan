import { sendResponse } from './response.js'

export const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-cron-secret',
}

/** Standard OPTIONS / method guard. Returns true if the request was fully handled. */
export function preflight(req, res, { methods = ['POST'] } = {}) {
  if (req.method === 'OPTIONS') {
    sendResponse(res, 200, undefined, JSON_HEADERS)
    return true
  }
  if (!methods.includes(req.method)) {
    sendResponse(res, 405, { error: 'Method not allowed' }, JSON_HEADERS)
    return true
  }
  return false
}

export function ok(res, body, status = 200) {
  return sendResponse(res, status, body, JSON_HEADERS)
}

export function fail(res, status, error) {
  return sendResponse(res, status, { error }, JSON_HEADERS)
}

/** Map known domain errors to 4xx. */
export function statusForError(err) {
  const msg = err?.message || ''
  if (/Missing|required|Invalid|full|locked|Private|ended|not found|invite|Only the|cannot/i.test(msg)) {
    if (/Only the|cannot kick|cannot mute|cannot change/i.test(msg)) return 403
    if (/not found/i.test(msg)) return 404
    return 400
  }
  if (/Unauthorized|token|Unauthenticated/i.test(msg)) return 401
  return 500
}
