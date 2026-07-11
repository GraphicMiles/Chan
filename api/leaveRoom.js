import { FieldValue } from 'firebase-admin/firestore'
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
    const { roomId, uid } = req.body || {}
    if (!roomId || !uid) return res.status(400).set(headers).json({ error: 'Missing roomId or uid' })

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

    return res.status(200).set(headers).json({ success: true })
  } catch (err) {
    console.error('leaveRoom error', err)
    return res.status(500).set(headers).json({ error: err.message || 'Internal error' })
  }
}
