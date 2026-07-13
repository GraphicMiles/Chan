const DEFAULT_PLAYLIST_URL = 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8'
const CACHE_TTL_MS = 5 * 60 * 1000
const FETCH_TIMEOUT_MS = 8000

let playlistCache = { expiresAt: 0, channels: [] }

function readAttribute(line, name) {
  const match = line.match(new RegExp(`${name}="([^"]*)"`, 'i'))
  return match?.[1] || ''
}

function isSupportedStreamUrl(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    if (host.includes('youtube.com') || host.includes('youtu.be') || host.includes('twitch.tv')) {
      return false
    }
    // The current player supports HLS and browser-playable files, not MPEG-DASH.
    if (/\.mpd(?:\?|#|$)/i.test(url.pathname)) return false
    return !value.includes('...')
  } catch {
    return false
  }
}

function normalizeChannel(channel) {
  if (!channel?.name || !isSupportedStreamUrl(channel.url)) return null
  return {
    name: String(channel.name).trim(),
    url: channel.url,
    group: String(channel.group || 'Live TV').trim(),
    country: String(channel.country || '').trim(),
    logo: channel.logo || null,
  }
}

export function parseM3U(text) {
  const channels = []
  const lines = String(text || '').split(/\r?\n/)
  let metadata = null

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    if (line.toUpperCase().startsWith('#EXTINF')) {
      const comma = line.indexOf(',')
      metadata = {
        name: comma >= 0 ? line.slice(comma + 1).trim() : readAttribute(line, 'tvg-name'),
        group: readAttribute(line, 'group-title') || 'Live TV',
        country: readAttribute(line, 'tvg-country'),
        logo: readAttribute(line, 'tvg-logo') || null,
      }
      continue
    }

    if (line.startsWith('#')) continue
    if (!metadata) continue

    const channel = normalizeChannel({ ...metadata, url: line })
    if (channel) channels.push(channel)
    metadata = null
  }

  return channels
}

function parseConfiguredChannels() {
  const raw = process.env.IPTV_CHANNELS_JSON
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(normalizeChannel).filter(Boolean) : []
  } catch {
    console.error('IPTV_CHANNELS_JSON is not valid JSON')
    return []
  }
}

async function fetchPlaylist(url) {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:') throw new Error('IPTV playlist URL must use HTTPS')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(parsed, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Chan IPTV catalog/1.0', Accept: 'application/vnd.apple.mpegurl,text/plain' },
    })
    if (!response.ok) throw new Error(`IPTV playlist returned HTTP ${response.status}`)
    return parseM3U(await response.text())
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('IPTV playlist timed out')
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export async function getIptvChannels(extraChannels = []) {
  const configured = [...parseConfiguredChannels(), ...extraChannels.map(normalizeChannel).filter(Boolean)]
  const playlistUrl = process.env.IPTV_PLAYLIST_URL || DEFAULT_PLAYLIST_URL

  if (playlistCache.expiresAt > Date.now()) {
    return [...playlistCache.channels, ...configured]
  }

  try {
    const playlistChannels = await fetchPlaylist(playlistUrl)
    const unique = new Map()
    for (const channel of [...playlistChannels, ...configured]) unique.set(channel.url, channel)
    playlistCache = { expiresAt: Date.now() + CACHE_TTL_MS, channels: [...unique.values()] }
    return [...playlistCache.channels]
  } catch (error) {
    console.error('IPTV playlist error:', error.message)
    if (configured.length) return configured
    throw Object.assign(new Error('IPTV playlist is currently unavailable'), { status: 503 })
  }
}
