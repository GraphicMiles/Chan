import { sendResponse } from './response.js'

export const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export function preflight(req, res, { methods = ['GET', 'POST'] } = {}) {
  if (req.method === 'OPTIONS') {
    sendResponse(res, 200, { ok: true })
    return true
  }
  if (!methods.includes(req.method)) {
    sendResponse(res, 405, { error: `Method ${req.method} not allowed` })
    return true
  }
  return false
}

export function ok(res, body, status = 200) {
  sendResponse(res, status, { success: true, ...body })
}

export function fail(res, status, error) {
  sendResponse(res, status, { success: false, error })
}
