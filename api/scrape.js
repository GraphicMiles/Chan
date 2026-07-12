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

const MEDIA_EXT_RE = /\.(mp4|m3u8|webm|ogg|mov|mkv|avi|flv)(\?|#|$)/i

// Check if URL is a direct video file
function isDirectVideoFile(url) {
  if (!url) return false
  try {
    const u = new URL(url)
    return MEDIA_EXT_RE.test(u.pathname)
  } catch {
    return MEDIA_EXT_RE.test(url)
  }
}

// Generate site-specific headers to avoid 403s
function getHeadersForUrl(targetUrl) {
  try {
    const url = new URL(targetUrl)
    const referer = `${url.protocol}//${url.hostname}/`
    
    // Site-specific headers
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
    }
    
    // Add Referer for sites that require it
    if (url.hostname.includes('o2tv.org')) {
      headers['Referer'] = 'http://d6.o2tv.org/'
      headers['Origin'] = 'http://d6.o2tv.org'
    } else if (url.hostname.includes('thenetnaija.ng')) {
      headers['Referer'] = 'https://thenetnaija.ng/'
    } else {
      headers['Referer'] = referer
    }
    
    return headers
  } catch {
    return {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': '*/*',
    }
  }
}

async function fetchHtml(targetUrl) {
  // If it's a direct video file, don't try to fetch as HTML
  if (isDirectVideoFile(targetUrl)) {
    return { isDirectFile: true, url: targetUrl }
  }
  
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000) // Increased timeout

  try {
    const headers = getHeadersForUrl(targetUrl)
    
    const res = await fetch(targetUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers,
    })
    
    clearTimeout(timeout)
    
    if (!res.ok) {
      // If we got a 403, try with different headers
      if (res.status === 403) {
        throw new Error(`HTTP 403: Access denied (hotlink protection). Try a different URL or copy the link address manually.`)
      }
      throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    }
    
    const contentType = res.headers.get('content-type') || ''
    
    // If response is a video file, return as direct
    if (contentType.includes('video/') || contentType.includes('application/octet-stream')) {
      return { isDirectFile: true, url: targetUrl, contentType }
    }
    
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
    return { html, isDirectFile: false }
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

  // 3) Look for download buttons with data attributes
  $('[data-download], [data-url], [data-file], .download-btn, #download-btn, .dl-link').each((_, el) => {
    const dataUrl = $(el).attr('data-download') || $(el).attr('data-url') || $(el).attr('data-file')
    if (dataUrl && MEDIA_EXT_RE.test(dataUrl)) {
      const abs = resolveUrl(dataUrl, pageUrl)
      pushUnique(out, seen, {
        title: `${pageTitle} (download)`,
        image: $('meta[property="og:image"]').attr('content') || null,
        link: abs,
        url: abs,
        meta: 'download button',
        source: siteKey,
        isDirect: true,
      })
    }
  })

  // 4) Regex scan of raw HTML for media URLs (quoted)
  const re = /https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8|webm|ogg|mov|mkv|avi|flv)(?:\?[^\s"'<>]*)?/gi
  const matches = html.match(re) || []
  for (const m of matches.slice(0, 30)) {
    const cleanUrl = m.replace(/&amp;/g, '&')
    pushUnique(out, seen, {
      title: `${pageTitle} (found on page)`,
      image: $('meta[property="og:image"]').attr('content') || null,
      link: cleanUrl,
      url: cleanUrl,
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

    // Check if this is a direct video URL first
    if (isDirectVideoFile(targetUrl)) {
      const title = decodeURIComponent(parsed.pathname.split('/').pop() || 'Video')
      return ok(res, {
        count: 1,
        directCount: 1,
        results: [{
          title: title.replace(/\.(mp4|m3u8|mkv|avi|mov)$/i, ''),
          image: null,
          link: targetUrl,
          url: targetUrl,
          meta: 'direct file',
          source: 'direct',
          isDirect: true,
          playableInRoom: true,
        }],
        url: targetUrl,
        site: 'direct',
        hint: undefined,
      })
    }

    const fetchResult = await fetchHtml(targetUrl)
    
    // If fetch returned a direct file detection
    if (fetchResult.isDirectFile) {
      const title = decodeURIComponent(parsed.pathname.split('/').pop() || 'Video')
      return ok(res, {
        count: 1,
        directCount: 1,
        results: [{
          title: title.replace(/\.(mp4|m3u8|mkv|avi|mov)$/i, ''),
          image: null,
          link: fetchResult.url,
          url: fetchResult.url,
          meta: 'direct file',
          source: 'direct',
          isDirect: true,
          playableInRoom: true,
        }],
        url: targetUrl,
        site: 'direct',
      })
    }
    
    const siteKey = site || 'custom'
    const html = fetchResult.html

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
    console.error('Scrape error:', e)
    return fail(res, 500, e.message || 'Scrape failed')
  }
      }
