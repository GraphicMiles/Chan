import admin from 'firebase-admin'
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
    const { roomId, uid, displayName, inviteCode } = req.body || {}

    let targetRoomId = roomId

    if (!targetRoomId && inviteCode) {
      const snap = await db.collection('rooms').where('inviteCode', '==', inviteCode.toUpperCase()).where('status', '==', 'live').limit(1).get()
      if (snap.empty) return res.status(404).set(headers).json({ error: 'Room not found or invite code invalid' })
      targetRoomId = snap.docs[0].id
    }

    if (!targetRoomId || !uid || !displayName) {
      return res.status(400).set(headers).json({ error: 'Missing roomId, uid, or displayName' })
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
        joinedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      t.update(roomRef, { participantCount: participantsSnap.size + 1 })
    })

    return res.status(200).set(headers).json({ roomId: targetRoomId })
  } catch (err) {
    console.error('joinRoom error', err)
    return res.status(500).set(headers).json({ error: err.message || 'Internal error' })
  }
}
