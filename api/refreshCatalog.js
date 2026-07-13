import { createHash } from 'node:crypto'
import { getDb, FieldValue } from './lib/firebaseAdmin.js'
import { preflight, ok, fail, statusForError } from './lib/http.js'
import { checkIptvChannel, getPlaylistChannels } from './lib/iptv.js'

const DEFAULT_CHECK_LIMIT = 50
const MAX_CHECK_LIMIT = 100

function channelId(url) {
  return createHash('sha1').update(url).digest('hex')
}

function clampInteger(value, fallback, max) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(parsed, 0), max)
}

async function mapConcurrent(items, concurrency, worker) {
  const results = new Array(items.length)
  let cursor = 0

  async function run() {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      results[index] = await worker(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run))
  return results
}

function requireCronSecret(req) {
  const expected = process.env.CRON_SECRET
  if (!expected) throw Object.assign(new Error('CRON_SECRET is not configured'), { status: 503 })
  const actual = req.headers?.['x-cron-secret'] || req.headers?.['X-Cron-Secret']
  if (actual !== expected) throw Object.assign(new Error('Unauthorized'), { status: 401 })
}

export default async function handler(req, res) {
  if (preflight(req, res, { methods: ['POST'] })) return

  try {
    requireCronSecret(req)
    const body = req.body || {}
    const action = body.action || 'iptv'
    if (action !== 'iptv') return fail(res, 400, `Unknown catalog action: ${action}`)

    const offset = clampInteger(body.offset, 0, 100000)
    const limit = clampInteger(
      body.limit,
      clampInteger(process.env.IPTV_HEALTH_CHECK_LIMIT, DEFAULT_CHECK_LIMIT, MAX_CHECK_LIMIT),
      MAX_CHECK_LIMIT
    ) || DEFAULT_CHECK_LIMIT

    const channels = await getPlaylistChannels({ force: true })
    const batchChannels = channels.slice(offset, offset + limit)
    if (!batchChannels.length) {
      return ok(res, {
        action,
        total: channels.length,
        offset,
        checked: 0,
        healthy: 0,
        nextOffset: null,
        complete: true,
      })
    }

    const checks = await mapConcurrent(batchChannels, 8, (channel) => checkIptvChannel(channel.url))
    const db = getDb()
    const batch = db.batch()
    const collection = db.collection('mediaCatalog').doc('iptv').collection('channels')
    const checkedAt = FieldValue.serverTimestamp()

    batchChannels.forEach((channel, index) => {
      const health = checks[index]
      batch.set(collection.doc(channelId(channel.url)), {
        ...channel,
        source: 'free-tv-iptv-playlist',
        playlistUrl: process.env.IPTV_PLAYLIST_URL || 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8',
        healthy: health.healthy,
        healthStatus: health.status,
        contentType: health.contentType,
        healthError: health.error,
        checkedAt,
      }, { merge: true })
    })

    await batch.commit()

    const healthy = checks.filter((check) => check.healthy).length
    const nextOffset = offset + batchChannels.length < channels.length
      ? offset + batchChannels.length
      : null

    return ok(res, {
      action,
      total: channels.length,
      offset,
      checked: batchChannels.length,
      healthy,
      unhealthy: batchChannels.length - healthy,
      nextOffset,
      complete: nextOffset === null,
    })
  } catch (err) {
    console.error('refreshCatalog error', err)
    return fail(res, statusForError(err), err.message || 'Catalog refresh failed')
  }
}
