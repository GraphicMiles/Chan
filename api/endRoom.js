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
    const { roomId, uid } = req.body || {}
    if (!roomId || !uid) return res.status(400).set(headers).json({ error: 'Missing roomId or uid' })

    const roomRef = db.collection('rooms').doc(roomId)
    const snap = await roomRef.get()
    if (!snap.exists) return res.status(404).set(headers).json({ error: 'Room not found' })
    const room = snap.data()
    if (room.hostId !== uid) return res.status(403).set(headers).json({ error: 'Only the host can end the room' })

    await roomRef.update({
      status: 'ended',
      activityType: 'idle',
      endedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    return res.status(200).set(headers).json({ success: true })
  } catch (err) {
    console.error('endRoom error', err)
    return res.status(500).set(headers).json({ error: err.message || 'Internal error' })
  }
}
