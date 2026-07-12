import { getDb, FieldValue, Timestamp } from './lib/firebaseAdmin.js'
import { preflight, ok, fail, statusForError, JSON_HEADERS } from './lib/http.js'
import { sendResponse } from './lib/response.js'

const STALE_MINUTES = 15

export default async function handler(req, res) {
  try {
    // Allow GET for simple cron pings as well as POST
    if (req.method === 'OPTIONS') {
      return sendResponse(res, 200, { ok: true }, JSON_HEADERS)
    }
    if (req.method !== 'POST' && req.method !== 'GET') {
      return fail(res, 405, 'Method not allowed')
    }

    const cronSecret = process.env.CRON_SECRET
    if (cronSecret) {
      const provided = req.headers['x-cron-secret']
      if (provided !== cronSecret) {
        return fail(res, 401, 'Unauthorized')
      }
    }

    const db = getDb()
    const cutoff = Timestamp.fromDate(new Date(Date.now() - STALE_MINUTES * 60 * 1000))
    const snap = await db
      .collection('rooms')
      .where('status', '==', 'live')
      .where('lastHeartbeat', '<', cutoff)
      .get()

    if (snap.empty) return ok(res, { cleaned: 0 })

    const batch = db.batch()
    let count = 0
    snap.docs.forEach((d) => {
      batch.update(d.ref, {
        status: 'ended',
        activityType: 'idle',
        endedAt: FieldValue.serverTimestamp(),
      })
      count += 1
    })
    await batch.commit()

    return ok(res, { cleaned: count })
  } catch (err) {
    console.error('cleanupStaleRooms error', err)
    return fail(res, statusForError(err), err.message || 'Internal error')
  }
}
