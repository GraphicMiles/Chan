import mediaHandler from './media.js'

// Backward-compatible alias for the consolidated authenticated media endpoint.
export default function handler(req, res) {
  const body = req.body || {}
  req.body = {
    ...body,
    action: 'search',
    layer: body.layer || body.source || 'youtube',
  }
  return mediaHandler(req, res)
}
