import { getDb, FieldValue } from './lib/firebaseAdmin.js'
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
    const { roomId, uid, displayName, inviteCode } = req.body || {}

    let targetRoomId = roomId

    if (!targetRoomId && inviteCode) {
      const snap = await db.collection('rooms').where('inviteCode', '==', inviteCode.toUpperCase()).where('status', '==', 'live').limit(1).get()
      if (snap.empty) return sendResponse(res, 404, { error: 'Room not found or invite code invalid' }, headers)
      targetRoomId = snap.docs[0].id
    }

    if (!targetRoomId || !uid || !displayName) {
      return sendResponse(res, 400, { error: 'Missing roomId, uid, or displayName' }, headers)
    }

    const roomRef = db.collection('rooms').doc(targetRoomId)
    const participantRef = roomRef.collection('participants').doc(uid)

    await db.runTransaction(async (t) => {
      const roomSnap = await t.get(roomRef)
      if (!roomSnap.exists) throw new Error('Room not found')
      const room = roomSnap.data()
      if (room.status !== 'live') throw new Error('Room has ended')

      const participantSnap = await t.get(participantRef)
      if (participantSnap.exists) return

      const participantsSnap = await roomRef.collection('participants').get()
      if (participantsSnap.size >= room.capacity) throw new Error('Room is full')

      t.set(participantRef, {
        displayName,
        role: room.hostId === uid ? 'host' : 'viewer',
        joinedAt: FieldValue.serverTimestamp(),
      })
      t.update(roomRef, { participantCount: participantsSnap.size + 1 })
    })

    return sendResponse(res, 200, { roomId: targetRoomId }, headers)
  } catch (err) {
    console.error('joinRoom error', err)
    return sendResponse(res, 500, { error: err.message || 'Internal error' }, headers)
  }
}
