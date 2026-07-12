import jwt from 'jsonwebtoken'
import { getDb } from './lib/firebaseAdmin.js'
import { preflight, ok, fail, statusForError } from './lib/http.js'

export default async function handler(req, res) {
  try {
    if (preflight(req, res, { methods: ['POST'] })) return

    const { roomId, uid, role } = req.body || {}
    if (!roomId || !uid || !role) {
      return fail(res, 400, 'Missing roomId, uid, or role')
    }

    const db = getDb()
    const snap = await db.collection('rooms').doc(roomId).get()
    if (!snap.exists) return fail(res, 404, 'Room not found')
    const room = snap.data()

    const isHost = room.hostId === uid
    if (role === 'host' && !isHost) {
      return fail(res, 403, 'Only the host can publish')
    }

    const apiKey = process.env.LIVEKIT_API_KEY
    const apiSecret = process.env.LIVEKIT_API_SECRET
    if (!apiKey || !apiSecret) {
      return fail(res, 500, 'LiveKit credentials not configured')
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

    return ok(res, { token })
  } catch (err) {
    console.error('createLiveKitToken error', err)
    return fail(res, statusForError(err), err.message || 'Internal error')
  }
}
