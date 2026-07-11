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
      const snap = await db
        .collection('rooms')
        .where('inviteCode', '==', String(inviteCode).toUpperCase())
        .where('status', '==', 'live')
        .limit(1)
        .get()
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

      // Host can always rejoin; locked blocks new non-host joins.
      if (room.locked === true && room.hostId !== uid) {
        throw new Error('Room is locked — the host is not accepting new joins')
      }

      // Host always allowed; others need invite code for private rooms.
      if (room.isPrivate === true && room.hostId !== uid) {
        const code = String(inviteCode || '').toUpperCase()
        if (!code || code !== String(room.inviteCode || '').toUpperCase()) {
          throw new Error('Private room — invite code required')
        }
      }

      // Capacity check inside transaction (reads all participant docs).
      const participantsSnap = await t.get(roomRef.collection('participants'))
      if (participantsSnap.size >= (room.capacity || 12)) {
        throw new Error('Room is full — ask the host to raise capacity')
      }

      t.set(participantRef, {
        displayName,
        role: room.hostId === uid ? 'host' : 'viewer',
        muted: false,
        joinedAt: FieldValue.serverTimestamp(),
      })
      t.update(roomRef, { participantCount: participantsSnap.size + 1 })
    })

    return sendResponse(res, 200, { roomId: targetRoomId }, headers)
  } catch (err) {
    console.error('joinRoom error', err)
    const msg = err.message || 'Internal error'
    const status = /full|locked|Private|ended|not found|invite/i.test(msg) ? 400 : 500
    return sendResponse(res, status, { error: msg }, headers)
  }
}
