import { getDb, FieldValue } from './lib/firebaseAdmin.js'
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

    const { roomId, uid } = req.body || {}
    if (!roomId || !uid) {
      return sendResponse(res, 400, { error: 'Missing roomId or uid' }, headers)
    }

    const db = getDb()
    await db.runTransaction(async (t) => {
      const roomRef = db.collection('rooms').doc(roomId)
      const roomSnap = await t.get(roomRef)
      if (!roomSnap.exists) throw new Error('Room not found')
      const room = roomSnap.data()
      if (room.hostId !== requesterUid) throw new Error('Only the host can kick participants')
      if (uid === requesterUid) throw new Error('You cannot kick yourself')

      const participantRef = roomRef.collection('participants').doc(uid)
      const participantSnap = await t.get(participantRef)
      if (!participantSnap.exists) throw new Error('Participant not found')

      t.delete(participantRef)
      t.update(roomRef, { participantCount: FieldValue.increment(-1) })
      if (room.coHosts?.includes(uid)) {
        t.update(roomRef, { coHosts: FieldValue.arrayRemove(uid) })
      }
    })

    return sendResponse(res, 200, { success: true }, headers)
  } catch (err) {
    console.error('kickParticipant error', err)
    return sendResponse(res, 500, { error: err.message || 'Internal error' }, headers)
  }
}
