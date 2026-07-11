// Vercel Node.js functions use the native http.ServerResponse.
// res.status().set().json() is NOT supported; res.writeHead/end is standard.
export function sendResponse(res, status, body, headers) {
  res.writeHead(status, headers)
  res.end(body === undefined ? '' : JSON.stringify(body))
}
