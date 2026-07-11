import { AccessToken } from 'livekit-server-sdk'
import { db } from './lib/firebaseAdmin.js'

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).set(headers).end()
  if (req.method !== 'POST') return res.status(405).set(headers).json({ error: 'Method not allowed' })

  try {
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

    const at = new AccessToken(apiKey, apiSecret, { identity: uid })
    at.addGrant({
      roomJoin: true,
      room: roomId,
      canPublish: isHost,
      canSubscribe: true,
      canPublishData: false,
    })
    at.ttl = '10m'

    const token = await at.toJwt()
    return res.status(200).set(headers).json({ token })
  } catch (err) {
    console.error('createLiveKitToken error', err)
    return res.status(500).set(headers).json({ error: err.message || 'Internal error' })
  }
}
