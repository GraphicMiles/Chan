import { getDb, FieldValue, Timestamp } from './lib/firebaseAdmin.js'
import { sendResponse } from './lib/response.js'

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-cron-secret',
}

const STALE_MINUTES = 15

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return sendResponse(res, 200, undefined, headers)
    if (req.method !== 'POST' && req.method !== 'GET') {
      return sendResponse(res, 405, { error: 'Method not allowed' }, headers)
    }

    const cronSecret = process.env.CRON_SECRET
    if (cronSecret) {
      const provided = req.headers['x-cron-secret']
      if (provided !== cronSecret) {
        return sendResponse(res, 401, { error: 'Unauthorized' }, headers)
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

    return sendResponse(res, 200, { cleaned: count }, headers)
  } catch (err) {
    console.error('cleanupStaleRooms error', err)
    return sendResponse(res, 500, { error: err.message || 'Internal error' }, headers)
  }
}
