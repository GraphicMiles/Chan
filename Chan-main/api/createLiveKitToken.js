import jwt from 'jsonwebtoken'
import { getDb } from './lib/firebaseAdmin.js'
import { sendResponse } from './lib/response.js'

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return sendResponse(res, 200, undefined, headers)
    if (req.method !== 'POST') return sendResponse(res, 405, { error: 'Method not allowed' }, headers)

    const db = getDb()
    const { roomId, uid, role } = req.body || {}
    if (!roomId || !uid || !role) {
      return sendResponse(res, 400, { error: 'Missing roomId, uid, or role' }, headers)
    }

    const roomRef = db.collection('rooms').doc(roomId)
    const snap = await roomRef.get()
    if (!snap.exists) return sendResponse(res, 404, { error: 'Room not found' }, headers)
    const room = snap.data()

    const isHost = room.hostId === uid
    if (role === 'host' && !isHost) {
      return sendResponse(res, 403, { error: 'Only the host can publish' }, headers)
    }

    const apiKey = process.env.LIVEKIT_API_KEY
    const apiSecret = process.env.LIVEKIT_API_SECRET
    if (!apiKey || !apiSecret) {
      return sendResponse(res, 500, { error: 'LiveKit credentials not configured' }, headers)
    }

    const token = jwt.sign(
      {
        video: {
          roomJoin: true,
          room: roomId,
          canPublish: isHost,
          canSubscribe: true,
          canPublishData: false,
        },
      },
      apiSecret,
      {
        issuer: apiKey,
        subject: uid,
        expiresIn: '10m',
      }
    )

    return sendResponse(res, 200, { token }, headers)
  } catch (err) {
    console.error('createLiveKitToken error', err)
    return sendResponse(res, 500, { error: err.message || 'Internal error' }, headers)
  }
}
