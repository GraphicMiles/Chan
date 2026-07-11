import { getDb, FieldValue, Timestamp } from './lib/firebaseAdmin.js'

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-cron-secret',
}

const STALE_MINUTES = 15

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return res.status(200).set(headers).end()
    if (req.method !== 'POST' && req.method !== 'GET') {
      return res.status(405).set(headers).json({ error: 'Method not allowed' })
    }

    const cronSecret = process.env.CRON_SECRET
    if (cronSecret) {
      const provided = req.headers['x-cron-secret']
      if (provided !== cronSecret) {
        return res.status(401).set(headers).json({ error: 'Unauthorized' })
      }
    }

    const db = getDb()
    const cutoff = Timestamp.fromDate(
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
      batch.update(d.ref, { status: 'ended', activityType: 'idle', endedAt: FieldValue.serverTimestamp() })
      count++
    })
    await batch.commit()

    return res.status(200).set(headers).json({ cleaned: count })
  } catch (err) {
    console.error('cleanupStaleRooms error', err)
    return res.status(500).set(headers).json({ error: err.message || 'Internal error' })
  }
}
