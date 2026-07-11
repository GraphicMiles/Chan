import jwt from 'jsonwebtoken'
import { getDb } from './lib/firebaseAdmin.js'

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return res.status(200).set(headers).end()
    if (req.method !== 'POST') return res.status(405).set(headers).json({ error: 'Method not allowed' })

    const db = getDb()
    const { roomId, uid, role } = req.body || {}
    if (!roomId || !uid || !role) {
      return res.status(400).set(headers).json({ error: 'Missing roomId, uid, or role' })
    }

    const roomRef = db.collection('rooms').doc(roomId)
    const snap = await roomRef.get()
    if (!snap.exists) return res.status(404).set(headers).json({ error: 'Room not found' })
    const room = snap.data()

    const isHost = room.hostId === uid
    if (role === 'host' && !isHost) {
      return res.status(403).set(headers).json({ error: 'Only the host can publish' })
    }

    const apiKey = process.env.LIVEKIT_API_KEY
    const apiSecret = process.env.LIVEKIT_API_SECRET
    if (!apiKey || !apiSecret) {
      return res.status(500).set(headers).json({ error: 'LiveKit credentials not configured' })
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

    return res.status(200).set(headers).json({ token })
  } catch (err) {
    console.error('createLiveKitToken error', err)
    return res.status(500).set(headers).json({ error: err.message || 'Internal error' })
  }
}
