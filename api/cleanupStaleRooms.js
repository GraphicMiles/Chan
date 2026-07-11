import admin from 'firebase-admin'
import { db } from './lib/firebaseAdmin.js'

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const STALE_MINUTES = 15

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).set(headers).end()
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).set(headers).json({ error: 'Method not allowed' })
  }

  try {
    const cutoff = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() - STALE_MINUTES * 60 * 1000)
    )
    const snap = await db
      .collection('rooms')
      .where('status', '==', 'live')
      .where('lastHeartbeat', '<', cutoff)
      .get()

    const batch = db.batch()
    let count = 0
    snap.docs.forEach((d) => {
      batch.update(d.ref, { status: 'ended', activityType: 'idle', endedAt: admin.firestore.FieldValue.serverTimestamp() })
      count++
    })
    await batch.commit()

    return res.status(200).set(headers).json({ cleaned: count })
  } catch (err) {
    console.error('cleanupStaleRooms error', err)
    return res.status(500).set(headers).json({ error: err.message || 'Internal error' })
  }
}
