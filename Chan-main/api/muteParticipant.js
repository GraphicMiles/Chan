import { getDb } from './lib/firebaseAdmin.js'
import { verifyIdToken } from './lib/firebaseAdmin.js'
import { sendResponse } from './lib/response.js'

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return sendResponse(res, 200, undefined, headers)
    if (req.method !== 'POST') return sendResponse(res, 405, { error: 'Method not allowed' }, headers)

    const token = req.headers.authorization?.split('Bearer ')[1]
    if (!token) return sendResponse(res, 401, { error: 'Missing token' }, headers)

    const decoded = await verifyIdToken(token)
    const requesterUid = decoded.uid

    const { roomId, uid, muted } = req.body || {}
    if (!roomId || !uid || typeof muted !== 'boolean') {
      return sendResponse(res, 400, { error: 'Missing roomId, uid, or muted' }, headers)
    }

    const db = getDb()
    await db.runTransaction(async (t) => {
      const roomRef = db.collection('rooms').doc(roomId)
      const roomSnap = await t.get(roomRef)
      if (!roomSnap.exists) throw new Error('Room not found')
      const room = roomSnap.data()
      const isHost = room.hostId === requesterUid
      const isCoHost = room.coHosts?.includes(requesterUid)
      if (!isHost && !isCoHost) throw new Error('Only the host or co-hosts can mute')
      if (uid === room.hostId) throw new Error('You cannot mute the host')

      const participantRef = roomRef.collection('participants').doc(uid)
      const participantSnap = await t.get(participantRef)
      if (!participantSnap.exists) throw new Error('Participant not found')

      t.update(participantRef, { muted })
    })

    return sendResponse(res, 200, { success: true }, headers)
  } catch (err) {
    console.error('muteParticipant error', err)
    return sendResponse(res, 500, { error: err.message || 'Internal error' }, headers)
  }
}
