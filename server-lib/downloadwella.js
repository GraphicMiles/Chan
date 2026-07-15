import * as cheerio from 'cheerio'
import { isSuitableThumbnail } from './sources.js'

const DOWNLOAD_HOST = 'downloadwella.com'
const MEDIA_RE = /\.(mp4|mkv|m3u8|webm|mov|avi|flv|ts)(?:\?|#|$)/i
const MAX_REDIRECTS = 5
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

function isDownloadHost(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase()
    return hostname === DOWNLOAD_HOST || hostname.endsWith(`.${DOWNLOAD_HOST}`)
  } catch {
    return false
  }
}

function isAllowedMediaUrl(value) {
  try {
    const parsed = new URL(value)
    // Allow http + https (some CDN edges still serve http)
    if (!['https:', 'http:'].includes(parsed.protocol)) return false
    const hostname = parsed.hostname.toLowerCase()
    // Path may encode the extension only in the filename portion
    const looksLikeMedia = MEDIA_RE.test(parsed.pathname)
      || MEDIA_RE.test(parsed.href)
      || /\/d\/[a-z0-9]+/i.test(parsed.pathname)
    if (!looksLikeMedia) return false
    // Accept any downloadwella / fsmc CDN host used for hotlink tokens
    const isGeneratedFile = hostname === DOWNLOAD_HOST
      || hostname.endsWith(`.${DOWNLOAD_HOST}`)
      || hostname.includes('downloadwella')
      || hostname.includes('fsmc')
      || (hostname === DOWNLOAD_HOST && parsed.pathname.startsWith('/d/'))
    return isGeneratedFile
  } catch {
    return false
  }
}

function mergeCookies(previous, response) {
  const jar = new Map()
  for (const part of String(previous || '').split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name && rest.length) jar.set(name, rest.join('='))
  }

  const setCookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : String(response.headers.get('set-cookie') || '').split(/,(?=[^;]+=[^;]+)/)

  for (const cookie of setCookies) {
    const [pair] = cookie.split(';')
    const [name, ...rest] = pair.trim().split('=')
    if (name && rest.length) jar.set(name, rest.join('='))
  }
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ')
}

function formFields($, form) {
  const fields = new URLSearchParams()
  form.find('input[name], textarea[name], select[name]').each((_, element) => {
    const name = $(element).attr('name')
    if (!name) return
    const value = $(element).attr('value') || $(element).text() || ''
    fields.set(name, value)
  })
  return fields
}

function directUrlsFromHtml(html, pageUrl) {
  const $ = cheerio.load(html)
  const urls = new Set()
  const add = (raw) => {
    if (!raw) return
    const decoded = raw.replace(/&amp;/g, '&').replace(/&#40;|&#41;/g, (match) => match === '&#40;' ? '(' : ')')
    try {
      const absolute = new URL(decoded, pageUrl).href
      if (isAllowedMediaUrl(absolute)) urls.add(absolute)
    } catch {
      /* ignore malformed links */
    }
  }

  $('a[href], source[src], video[src]').each((_, element) => {
    add($(element).attr('href') || $(element).attr('src'))
  })

  const rawMatches = html.match(/https?:[^\s"'<>]+\.(?:mp4|mkv|m3u8|webm|mov|avi|flv|ts)(?:\?[^\s"'<>]*)?/gi) || []
  rawMatches.forEach(add)
  return [...urls]
}

function extractPageThumbnail(html, pageUrl) {
  try {
    const $ = cheerio.load(html)
    const candidates = [
      $('meta[property="og:image"]').attr('content'),
      $('meta[name="twitter:image"]').attr('content'),
      $('.poster img, .thumb img, article img, .post-thumbnail img').first().attr('src'),
      $('img[src]').first().attr('src')
    ]
    for (const raw of candidates) {
      if (!raw) continue
      try {
        const resolved = new URL(raw, pageUrl).href
        if (isSuitableThumbnail(resolved)) return resolved
      } catch {
        /* ignore invalid url */
      }
    }
    return null
  } catch {
    return null
  }
}

async function request(url, options = {}) {
  const { headers = {}, ...rest } = options
  return fetch(url, {
    ...rest,
    redirect: 'manual',
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      ...headers,
    },
  })
}

/**
 * After we have a direct /d/... URL, verify it returns video bytes (not HTML).
 * Returns the same URL if ok, or null if the token is dead.
 */
async function probeDirectUrl(mediaUrl) {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6000)
    try {
      const res = await fetch(mediaUrl, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: '*/*',
          Range: 'bytes=0-1',
          Referer: 'https://downloadwella.com/',
          Origin: 'https://downloadwella.com',
        },
      })
      if (!res.ok && res.status !== 206) return null
      const ct = res.headers.get('content-type') || ''
      if (/text\/html|application\/json/i.test(ct)) return null
      // Drain body quickly
      await res.arrayBuffer().catch(() => {})
      return mediaUrl
    } finally {
      clearTimeout(timer)
    }
  } catch {
    // Probe timed out / network error — still return the URL; player may work
    return mediaUrl
  }
}

async function filterLiveDirectUrls(urls) {
  if (!urls?.length) return []
  const probed = await Promise.all(urls.map((u) => probeDirectUrl(u)))
  return probed.filter(Boolean)
}

export async function resolveDownloadwellaPage(pageUrl) {
  if (!isDownloadHost(pageUrl)) return { directUrls: [], thumbnail: null, requiresUserAction: false }

  // Fast path: the URL itself is already a /d/ media link
  if (isAllowedMediaUrl(pageUrl)) {
    const live = await probeDirectUrl(pageUrl)
    if (live) return { directUrls: [live], thumbnail: null, requiresUserAction: false }
  }

  let currentUrl = pageUrl
  let cookies = ''
  let html = ''

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await request(currentUrl, {
      headers: { Referer: 'https://downloadwella.com/', ...(cookies ? { Cookie: cookies } : {}) },
    })
    cookies = mergeCookies(cookies, response)

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) break
      const next = new URL(location, currentUrl).href
      // Redirect may go straight to the media CDN file
      if (isAllowedMediaUrl(next)) {
        const live = await probeDirectUrl(next)
        if (live) return { directUrls: [live], thumbnail: null, requiresUserAction: false }
      }
      if (!isDownloadHost(next)) break
      currentUrl = next
      continue
    }

    if (!response.ok) break
    html = await response.text()
    break
  }

  if (!html) return { directUrls: [], thumbnail: null, requiresUserAction: true }

  const thumbnail = extractPageThumbnail(html, currentUrl)
  const pageDirectUrls = await filterLiveDirectUrls(directUrlsFromHtml(html, currentUrl))
  if (pageDirectUrls.length) return { directUrls: pageDirectUrls, thumbnail, requiresUserAction: false }

  const $ = cheerio.load(html)
  // Prefer download2 form; fall back to any form with op=download*
  let form = $('form').filter((_, element) => $(element).find('input[name="op"][value="download2"]').length > 0).first()
  if (!form.length) {
    form = $('form').filter((_, element) => {
      const op = $(element).find('input[name="op"]').attr('value') || ''
      return /download/i.test(op)
    }).first()
  }
  if (!form.length) return { directUrls: [], thumbnail, requiresUserAction: true }

  const action = form.attr('action')
    ? new URL(form.attr('action'), currentUrl).href
    : currentUrl
  if (!isDownloadHost(action) && !isAllowedMediaUrl(action)) {
    return { directUrls: [], thumbnail, requiresUserAction: true }
  }

  const fields = formFields($, form)
  // Ensure method_free / download1 progression if present
  if (!fields.has('method_free') && form.find('input[name="method_free"]').length) {
    fields.set('method_free', form.find('input[name="method_free"]').attr('value') || 'Free Download')
  }

  const response = await request(action, {
    method: 'POST',
    headers: {
      Referer: currentUrl,
      Origin: 'https://downloadwella.com',
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(cookies ? { Cookie: cookies } : {}),
    },
    body: fields.toString(),
  })
  cookies = mergeCookies(cookies, response)

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location')
    if (location) {
      const next = new URL(location, action).href
      if (isAllowedMediaUrl(next)) {
        const live = await probeDirectUrl(next)
        if (live) return { directUrls: [live], thumbnail, requiresUserAction: false }
      }
      if (isDownloadHost(next)) {
        const redirected = await request(next, {
          headers: { Referer: action, ...(cookies ? { Cookie: cookies } : {}) },
        })
        cookies = mergeCookies(cookies, redirected)
        if (redirected.status >= 300 && redirected.status < 400) {
          const loc2 = redirected.headers.get('location')
          if (loc2) {
            const next2 = new URL(loc2, next).href
            if (isAllowedMediaUrl(next2)) {
              const live = await probeDirectUrl(next2)
              if (live) return { directUrls: [live], thumbnail, requiresUserAction: false }
            }
          }
        }
        if (redirected.ok) {
          const redirectedHtml = await redirected.text()
          const urls = await filterLiveDirectUrls(directUrlsFromHtml(redirectedHtml, redirected.url || next))
          return {
            directUrls: urls,
            thumbnail: extractPageThumbnail(redirectedHtml, redirected.url || next) || thumbnail,
            requiresUserAction: urls.length === 0,
          }
        }
      }
    }
    return { directUrls: [], thumbnail, requiresUserAction: true }
  }

  if (!response.ok) return { directUrls: [], thumbnail, requiresUserAction: true }
  const resultHtml = await response.text()
  const directUrls = await filterLiveDirectUrls(directUrlsFromHtml(resultHtml, action))
  return {
    directUrls,
    thumbnail: extractPageThumbnail(resultHtml, action) || thumbnail,
    requiresUserAction: directUrls.length === 0,
  }
}
