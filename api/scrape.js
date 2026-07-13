import mediaHandler from './media.js'

// Backward-compatible alias for the consolidated authenticated media endpoint.
export default function handler(req, res) {
  req.body = { ...(req.body || {}), action: 'scrape' }
  return mediaHandler(req, res)
}
