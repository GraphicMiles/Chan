import * as cheerio from 'cheerio'
import { preflight, ok, fail } from './lib/http.js'
import { getSiteConfig, resolveUrl } from './lib/sources.js'

const BOT_MARKERS = [
  'cf-browser-verification',
  'cf_chl_',
  'challenge-platform',
  'captcha',
  'hcaptcha',
  'px-captcha',
]

const BOT_PHRASES = [
  'checking your browser',
  'are you a human',
  'unusual traffic',
  'attention required',
  'verify you are human',
  'ddos protection',
  'security check',
]

const MEDIA_EXT_RE = /\.(mp4|m3u8|webm|ogg|mov|mkv)(\?|#|$)/i

async function fetchHtml(targetUrl) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 9000)

  try {
    const res = await fetch(targetUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        Referer: 'https://www.google.com/',
      },
    })
    clearTimeout(timeout)
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    const html = await res.text()

    const lower = html.toLowerCase()
    const isSmall = html.length < 5120

    for (const m of BOT_MARKERS) {
      if (lower.includes(m)) throw new Error('Site blocked automated access (bot challenge)')
    }
    if (isSmall) {
      for (const p of BOT_PHRASES) {
        if (lower.includes(p)) throw new Error('Site blocked automated access (bot challenge)')
      }
    }
    return html
  } catch (e) {
    clearTimeout(timeout)
    if (e.name === 'AbortError') throw new Error('Site took too long to respond (timeout)')
    throw e
  }
}

function pushUnique(out, seen, item) {
  const key = item.link || item.title
  if (!key || seen.has(key)) return
  seen.add(key)
  out.push(item)
}

function extractMediaFromHtml(html, pageUrl, siteKey) {
  const $ = cheerio.load(html)
  const out = []
  const seen = new Set()
  const pageTitle =
    $('meta[property="og:title"]').attr('content') ||
    $('h1').first().text().trim() ||
    $('title').text().trim() ||
    'Media'

  // 1) Explicit <video src> and <source src>
  $('video[src], video source[src], source[src]').each((_, el) => {
    const src = resolveUrl($(el).attr('src'), pageUrl)
    if (src && MEDIA_EXT_RE.test(src)) {
      pushUnique(out, seen, {
        title: `${pageTitle} (direct video)`,
        image: $('meta[property="og:image"]').attr('content') || null,
        link: src,
        url: src,
        meta: 'direct file',
        source: siteKey,
        isDirect: true,
      })
    }
  })

  // 2) Anchors that point at media files
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    const abs = resolveUrl(href, pageUrl)
    if (!abs || !MEDIA_EXT_RE.test(abs)) return
    const text = $(el).text().trim() || pageTitle
    pushUnique(out, seen, {
      title: text.slice(0, 200),
      image: $('meta[property="og:image"]').attr('content') || null,
      link: abs,
      url: abs,
      meta: 'file link',
      source: siteKey,
      isDirect: true,
    })
  })

  // 3) Regex scan of raw HTML for media URLs (quoted)
  const re = /https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8|webm|ogg|mov|mkv)(?:\?[^\s"'<>]*)?/gi
  const matches = html.match(re) || []
  for (const m of matches.slice(0, 20)) {
    pushUnique(out, seen, {
      title: `${pageTitle} (found on page)`,
      image: $('meta[property="og:image"]').attr('content') || null,
      link: m,
      url: m,
      meta: 'found in page',
      source: siteKey,
      isDirect: true,
    })
  }

  return out
}

function parseListingResults(html, pageUrl, siteKey) {
  const config = getSiteConfig(siteKey)
  const $ = cheerio.load(html)
  const out = []
  const seen = new Set()

  $(config.items).each((_, el) => {
    const $el = $(el)
    const title =
      $el.find(config.title).first().text().trim() ||
      $el.attr('title') ||
      $el.find('img').attr('alt') ||
      'Untitled'
    const rawImg =
      $el.find(config.image).first().attr('src') ||
      $el.find(config.image).first().attr('data-src') ||
      $el.find('img').first().attr('src') ||
      $el.find('img').first().attr('data-src')
    const img = resolveUrl(rawImg, pageUrl)

    const rawLink =
      $el.find(config.link).first().attr('href') ||
      $el.closest('a').attr('href') ||
      $el.find('a').first().attr('href')
    const link = resolveUrl(rawLink, pageUrl)
    const meta = $el.find(config.meta).first().text().trim() || null
    const isDirect = !!(link && MEDIA_EXT_RE.test(link))

    if (title && title.length > 1 && link && !seen.has(link)) {
      seen.add(link)
      out.push({
        title: title.slice(0, 200),
        image: img,
        link,
        url: link,
        meta,
        source: siteKey,
        isDirect,
        playableInRoom: isDirect,
      })
    }
  })

  return out
}

export default async function handler(req, res) {
  if (preflight(req, res)) return
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed')

  try {
    const { url, query, site } = req.body || {}
    const config = getSiteConfig(site)

    let targetUrl = url
    if (!targetUrl && query) {
      if (typeof config.buildSearchUrl !== 'function') {
        return fail(
          res,
          400,
          `"${config.label || site || 'This site'}" needs a page URL. Open the site, find the title, paste that page URL here.`
        )
      }
      targetUrl = config.buildSearchUrl(query)
    }
    if (!targetUrl) return fail(res, 400, 'URL is required')

    let parsed
    try {
      parsed = new URL(targetUrl)
    } catch {
      return fail(res, 400, 'Invalid URL')
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return fail(res, 400, 'Only http(s) URLs are allowed')
    }

    const html = await fetchHtml(targetUrl)
    const siteKey = site || 'custom'

    // Prefer real media files found on the page
    const media = extractMediaFromHtml(html, targetUrl, siteKey)
    const listing = parseListingResults(html, targetUrl, siteKey)

    // Merge: direct media first, then unique listing cards
    const seen = new Set(media.map((m) => m.link))
    const merged = [...media]
    for (const item of listing) {
      if (!seen.has(item.link)) {
        seen.add(item.link)
        merged.push(item)
      }
    }

    const results = merged.slice(0, 40)
    const directCount = results.filter((r) => r.isDirect).length

    return ok(res, {
      count: results.length,
      directCount,
      results,
      url: targetUrl,
      site: siteKey,
      hint:
        directCount === 0 && results.length > 0
          ? 'Found page links only (not .mp4 files). Open a result, or paste a direct video file URL to watch in a room.'
          : directCount === 0
            ? 'No links found. Try the exact movie page URL, or paste a direct .mp4 link.'
            : undefined,
    })
  } catch (e) {
    return fail(res, 500, e.message || 'Scrape failed')
  }
}
