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
    const snap = await roomRef.get()
    if (!snap.exists) return sendResponse(res, 404, { error: 'Room not found' }, headers)
    const room = snap.data()
    if (room.hostId !== uid) return sendResponse(res, 403, { error: 'Only the host can end the room' }, headers)

    await roomRef.update({
      status: 'ended',
      activityType: 'idle',
      endedAt: FieldValue.serverTimestamp(),
    })

    return sendResponse(res, 200, { success: true }, headers)
  } catch (err) {
    console.error('endRoom error', err)
    return sendResponse(res, 500, { error: err.message || 'Internal error' }, headers)
  }
}
