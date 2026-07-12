/**
 * Consolidated host moderation endpoint (counts as 1 Vercel function).
 *
 * POST /api/moderate
 * Authorization: Bearer <Firebase ID token>
 * body: { action: 'kick' | 'promote' | 'mute', roomId, uid, ... }
 *
 * Replaces: kickParticipant, promoteParticipant, muteParticipant
 */
import { getDb, FieldValue, verifyIdToken } from './lib/firebaseAdmin.js'
import { preflight, ok, fail, statusForError } from './lib/http.js'

async function requireUser(req) {
  const token = req.headers.authorization?.split('Bearer ')[1]
  if (!token) throw Object.assign(new Error('Missing token'), { status: 401 })
  try {
    return await verifyIdToken(token)
  } catch {
    throw Object.assign(new Error('Invalid or expired token'), { status: 401 })
  }
}

async function kick(db, requesterUid, body) {
  const { roomId, uid } = body || {}
  if (!roomId || !uid) throw new Error('Missing roomId or uid')

  await db.runTransaction(async (t) => {
    const roomRef = db.collection('rooms').doc(roomId)
    const roomSnap = await t.get(roomRef)
    if (!roomSnap.exists) throw new Error('Room not found')
    const room = roomSnap.data()
    if (room.hostId !== requesterUid) throw new Error('Only the host can kick participants')
    if (uid === requesterUid) throw new Error('You cannot kick yourself')

    const participantRef = roomRef.collection('participants').doc(uid)
    const participantSnap = await t.get(participantRef)
    if (!participantSnap.exists) throw new Error('Participant not found')

    t.delete(participantRef)
    const next = Math.max(0, (room.participantCount || 1) - 1)
    const update = { participantCount: next }
    if (Array.isArray(room.coHosts) && room.coHosts.includes(uid)) {
      update.coHosts = FieldValue.arrayRemove(uid)
    }
    t.update(roomRef, update)
  })

  return { success: true }
}

async function promote(db, requesterUid, body) {
  const { roomId, uid, role } = body || {}
  if (!roomId || !uid || !role) throw new Error('Missing roomId, uid, or role')
  if (!['co-host', 'viewer'].includes(role)) throw new Error('Invalid role')

  await db.runTransaction(async (t) => {
    const roomRef = db.collection('rooms').doc(roomId)
    const roomSnap = await t.get(roomRef)
    if (!roomSnap.exists) throw new Error('Room not found')
    const room = roomSnap.data()
    if (room.hostId !== requesterUid) throw new Error('Only the host can assign roles')
    if (uid === requesterUid) throw new Error('You cannot change your own role')

    const participantRef = roomRef.collection('participants').doc(uid)
    const participantSnap = await t.get(participantRef)
    if (!participantSnap.exists) throw new Error('Participant not found')

    t.update(participantRef, { role })
    t.update(roomRef, {
      coHosts: role === 'co-host' ? FieldValue.arrayUnion(uid) : FieldValue.arrayRemove(uid),
    })
  })

  return { success: true }
}

async function mute(db, requesterUid, body) {
  const { roomId, uid, muted } = body || {}
  if (!roomId || !uid || typeof muted !== 'boolean') {
    throw new Error('Missing roomId, uid, or muted')
  }

  await db.runTransaction(async (t) => {
    const roomRef = db.collection('rooms').doc(roomId)
    const roomSnap = await t.get(roomRef)
    if (!roomSnap.exists) throw new Error('Room not found')
    const room = roomSnap.data()
    const isHost = room.hostId === requesterUid
    const isCoHost = Array.isArray(room.coHosts) && room.coHosts.includes(requesterUid)
    if (!isHost && !isCoHost) throw new Error('Only the host or co-hosts can mute')
    if (uid === room.hostId) throw new Error('You cannot mute the host')

    const participantRef = roomRef.collection('participants').doc(uid)
    const participantSnap = await t.get(participantRef)
    if (!participantSnap.exists) throw new Error('Participant not found')

    t.update(participantRef, { muted })
  })

  return { success: true }
}

export default async function handler(req, res) {
  try {
    if (preflight(req, res, { methods: ['POST'] })) return

    const decoded = await requireUser(req)
    const body = req.body || {}
    const action = String(body.action || '').toLowerCase()
    if (!action) return fail(res, 400, 'Missing action (kick | promote | mute)')

    const db = getDb()
    let result
    if (action === 'kick') result = await kick(db, decoded.uid, body)
    else if (action === 'promote') result = await promote(db, decoded.uid, body)
    else if (action === 'mute') result = await mute(db, decoded.uid, body)
    else return fail(res, 400, `Unknown action: ${action}`)

    return ok(res, result)
  } catch (err) {
    console.error('moderate API error', err)
    const status = err.status || statusForError(err)
    return fail(res, status, err.message || 'Internal error')
  }
}
