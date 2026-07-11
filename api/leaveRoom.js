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
    const { roomId, uid } = req.body || {}
    if (!roomId || !uid) return sendResponse(res, 400, { error: 'Missing roomId or uid' }, headers)

    const roomRef = db.collection('rooms').doc(roomId)
    const participantRef = roomRef.collection('participants').doc(uid)

    await db.runTransaction(async (t) => {
      const roomSnap = await t.get(roomRef)
      if (!roomSnap.exists) throw new Error('Room not found')
      const room = roomSnap.data()
      if (room.status !== 'live') throw new Error('Room has ended')

      const participantSnap = await t.get(participantRef)
      if (!participantSnap.exists) return

      t.delete(participantRef)
      t.update(roomRef, { participantCount: FieldValue.increment(-1) })
    })

    return sendResponse(res, 200, { success: true }, headers)
  } catch (err) {
    console.error('leaveRoom error', err)
    return sendResponse(res, 500, { error: err.message || 'Internal error' }, headers)
  }
}
