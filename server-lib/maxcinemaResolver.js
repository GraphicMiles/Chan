/**
 * MaxCinema Resolver
 *
 * Resolves the download chain for maxcinema.name.ng:
 *
 *   Search: /search_result/1?search={query}
 *     → results with movie/series info page links
 *
 *   Movie info page: /download/{slug}
 *     → contains /download/movie/{id}?method=server
 *
 *   Series info page: /download/{slug}?season={s}&episode={e}
 *     → contains /download/series/{internalId}/{s}/{e}?method=server
 *
 *   Server URL: /download/movie/{id}?method=server
 *     → 302 redirect → Koyeb CDN (direct .mkv/.mp4 file)
 *
 * No Puppeteer needed — the server URL is a regular <a> link that
 * returns a 302 redirect to the actual CDN file.
 *
 * Note: Most files are MKV which won't play natively in browser.
 */

import * as cheerio from 'cheerio'
import { resolveDoodUrl, isDoodUrl } from './doodResolver.js'

const BASE_URL = 'https://www.maxcinema.name.ng'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * Search maxcinema.name.ng
 * @param {string} query - Search term
 * @param {number} limit - Max results
 * @returns {Promise<Array<{title, url, thumbnail, source}>>}
 */
export async function searchMaxCinema(query, limit = 15) {
  const searchUrl = `${BASE_URL}/search_result/1?search=${encodeURIComponent(query)}`
  const html = await fetchHtml(searchUrl)
  if (!html) return []

  const $ = cheerio.load(html)
  const results = []
  const seen = new Set()

  // Search results have links like /movie/{Title}/{id} or /series/{Title}/{id}/{season}/{episode}
  $('a[href*="/movie/"], a[href*="/series/"]').each((_, el) => {
    const href = $(el).attr('href') || ''
    if (!href || seen.has(href)) return
    // Skip navigation links
    if (href.includes('/search_result') || href.includes('/genre/')) return

    seen.add(href)

    // Get the title from the link text or nearby <strong>
    let title = $(el).find('strong, b').first().text().trim() ||
                $(el).text().trim().replace(/\s+/g, ' ')
    // Clean up: remove leading ratings like "8.7" and type labels "movie", "series"
    title = title
      .replace(/^\d+\.?\d*\s*/, '')       // Remove leading rating "8.7"
      .replace(/\b(movie|series)\b/gi, '')  // Remove type labels
      .replace(/\b\d{4}\s*HD\b/i, '')      // Remove "2026 HD"
      .replace(/\s+/g, ' ')
      .trim()
    // Filter out short/generic text
    if (title.length < 2 || title.length > 300) return

    // Determine type from URL
    const isMovie = href.includes('/movie/')
    const isSeries = href.includes('/series/')

    // Get thumbnail from closest container or img
    const container = $(el).closest('div, article, section, li')
    let img = container.find('img[src]').first().attr('src') ||
              $(el).find('img[src]').first().attr('src') ||
              container.find('img[data-src]').first().attr('data-src') || null

    // MaxCinema uses TMDB images — very high quality thumbnails
    // Filter out unsuitable ones
    if (img && /logo|banner|favicon|1x1|pixel/i.test(img)) {
      img = null
    }

    // Build info page URL
    let infoUrl
    if (isMovie) {
      // /movie/{Title}/{id} → extract slug for info page
      const movieMatch = href.match(/\/movie\/([^/]+)\/(\d+)/)
      if (movieMatch) {
        const slug = movieMatch[1].replace(/%20/g, '-').toLowerCase()
        infoUrl = `${BASE_URL}/download/${slug}`
      } else {
        infoUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`
      }
    } else if (isSeries) {
      // /series/{Title}/{id}/{season}/{episode} → extract slug
      const seriesMatch = href.match(/\/series\/([^/]+)\/(\d+)\/(\d+)\/(\d+)/)
      if (seriesMatch) {
        const slug = seriesMatch[1].replace(/%20/g, '-').toLowerCase()
        const season = seriesMatch[3]
        const episode = seriesMatch[4]
        infoUrl = `${BASE_URL}/download/${slug}?season=${season}&episode=${episode}`
      } else {
        infoUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`
      }
    } else {
      infoUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`
    }

    results.push({
      title,
      url: infoUrl,
      link: infoUrl,
      thumbnail: img,
      image: img,
      source: 'maxcinema',
      type: 'direct',
      isDirect: false, // info page, needs resolution
      playableInRoom: false,
      meta: isSeries ? 'Series' : (isMovie ? 'Movie' : null),
    })

    if (results.length >= limit) return false
  })

  return results
}

/**
 * Resolve a MaxCinema info page URL to a direct CDN file URL
 * @param {string} infoPageUrl - The /download/{slug} or /download/{slug}?season=s&episode=e URL
 * @returns {Promise<Array<{title, url, source, isDirect, playableInRoom}>>}
 */
export async function resolveMaxCinemaChain(infoPageUrl) {
  const hostname = new URL(infoPageUrl).hostname.toLowerCase()

  // If already a server URL, resolve the redirect
  if (hostname.includes('maxcinema') && infoPageUrl.includes('method=server')) {
    return resolveServerUrl(infoPageUrl)
  }

  // If it's an episode detail page (/download/series/{slug}/s{X}/e{Y}/{id})
  if (hostname.includes('maxcinema') && /\/download\/(series|movie)\//.test(infoPageUrl)) {
    return resolveServerUrl(infoPageUrl)
  }

  // If it's a Koyeb CDN URL, it's already direct
  if (hostname.includes('koyeb.app')) {
    const filename = decodeURIComponent(new URL(infoPageUrl).searchParams.get('name') || infoPageUrl.split('/').pop() || 'Video')
    const isMkv = filename.endsWith('.mkv') || infoPageUrl.includes('.mkv')
    return [{
      title: filename.replace(/[\[\]_]/g, ' ').replace(/\s+/g, ' ').trim(),
      url: infoPageUrl,
      link: infoPageUrl,
      source: 'maxcinema',
      type: 'direct',
      isDirect: true,
      playableInRoom: true, // MKV is remuxed to MP4 by proxy
      quality: isMkv ? 'MKV' : 'HD',
      meta: isMkv ? 'MKV — auto-converted to MP4 for playback' : null,
    }]
  }

  // Info page — extract the server download link
  const html = await fetchHtml(infoPageUrl)
  if (!html) return []

  // Extract metadata from info page
  const $ = cheerio.load(html)
  const pageTitle = $('h1').first().text().trim() ||
                    $('meta[property="og:title"]').attr('content')?.replace(/^Download\s*/i, '') ||
                    $('title').first().text().replace(/\s*\|\s*MaxCinema\s*$/i, '').replace(/^Download\s*/i, '') || ''
  const thumb = $('img[src*="image.tmdb.org"]').first().attr('src') || null

  // Find the server download link
  // Pattern: href="/download/movie/{id}?method=server" or href="/download/series/{id}/{s}/{e}?method=server"
  const serverLink = $('a[href*="method=server"]').first().attr('href')
  if (!serverLink) {
    // Some pages don't have ?method=server in the HTML — the link is just /download/movie/{id}
    // We add ?method=server ourselves to trigger the server redirect
    const altLink = $('a[href*="/download/movie/"], a[href*="/download/series/"]').first().attr('href')
    if (altLink) {
      let fullUrl = altLink.startsWith('http') ? altLink : `${BASE_URL}${altLink}`
      // Add ?method=server if not already present
      if (!fullUrl.includes('method=server')) {
        fullUrl += (fullUrl.includes('?') ? '&' : '?') + 'method=server'
      }
      const results = await resolveServerUrl(fullUrl)
      return results.map(r => ({
        ...r,
        title: (!r.title || r.title === 'Video' || r.title.trim().length < 2) ? pageTitle : r.title,
        thumbnail: r.thumbnail || thumb,
        image: r.image || thumb,
      }))
    }
    return []
  }

  const fullServerUrl = serverLink.startsWith('http') ? serverLink : `${BASE_URL}${serverLink}`
  const results = await resolveServerUrl(fullServerUrl)

  // Apply page metadata
  return results.map(r => ({
    ...r,
    title: (!r.title || r.title === 'Video' || r.title.trim().length < 2) ? pageTitle : r.title,
    thumbnail: r.thumbnail || thumb,
    image: r.image || thumb,
  }))
}

/**
 * Resolve a server download URL by following the 302 redirect
 * The server URL pattern: /download/movie/{id}?method=server
 * or: /download/series/{internalId}/{s}/{e}?method=server
 * Returns 302 → Koyeb CDN with direct file
 */
async function resolveServerUrl(serverUrl) {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)

    const res = await fetch(serverUrl, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'manual',
      headers: {
        'User-Agent': UA,
        'Accept': '*/*',
        'Referer': BASE_URL,
      },
    })
    clearTimeout(timer)

    // Expect 302 redirect
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (location) {
        // Get filename from the redirect URL's query param or path
        const parsed = new URL(location)
        const nameParam = parsed.searchParams.get('name') || ''
        const isKoyeb = parsed.hostname.includes('koyeb.app')

        // For Koyeb CDN: decode the name parameter
        // For other CDNs (dood.li, etc.): try to resolve the actual video URL
        if (!isKoyeb) {
          // Try DoodStream resolution first
          if (isDoodUrl(location)) {
            try {
              const doodResolved = await resolveDoodUrl(location)
              if (doodResolved && doodResolved.videoUrl) {
                // Route through proxy for HTTPS + reliability
                const videoUrl = `/api/proxy?url=${encodeURIComponent(doodResolved.videoUrl)}`
                return [{
                  title: '', // Will be filled by page title fallback
                  url: videoUrl,
                  link: videoUrl,
                  source: 'maxcinema',
                  type: 'direct',
                  isDirect: true,
                  playableInRoom: true,
                  quality: 'HD',
                  meta: 'DoodStream — auto-resolved for playback',
                  resolvedFrom: serverUrl,
                }]
              }
            } catch (err) {
              console.error('MaxCinema→DoodStream resolve error:', err.message)
            }
          }

          // External CDN (not resolvable) — return as a direct link needing proxy
          const isMkv = location.toLowerCase().includes('.mkv')
          const isMp4 = location.toLowerCase().includes('.mp4')
          return [{
            title: '', // Will be filled by page title fallback
            url: location,
            link: location,
            source: 'maxcinema',
            type: 'direct',
            isDirect: true,
            playableInRoom: false, // External CDN needs proxy
            quality: 'HD',
            meta: 'External CDN link — may need proxy',
            resolvedFrom: serverUrl,
          }]
        }

        // Decode name — it may be base64-encoded or URL-encoded
        let decodedName = nameParam
        if (nameParam && !nameParam.includes('_') && !nameParam.includes('.') && nameParam.length > 10) {
          // Likely base64 — try decoding
          try {
            const decoded = Buffer.from(nameParam, 'base64').toString('utf-8')
            if (decoded && /[a-zA-Z]/.test(decoded) && decoded.length < 500) {
              decodedName = decoded
            }
          } catch { /* not base64, use as-is */ }
        }

        const filename = decodeURIComponent(decodedName || parsed.pathname.split('/').pop() || 'Video')

        // Clean up the filename: [MaxCinema.name.ng]_michael → Michael
        let cleanTitle = filename
          .replace(/^\[.*?\]\s*_?/i, '') // Remove [MaxCinema.name.ng]_ prefix
          .replace(/_/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()

        // Capitalize words
        cleanTitle = cleanTitle.replace(/\b\w/g, c => c.toUpperCase())

        // If the cleanTitle is garbled (looks like a hash with no spaces), use a fallback
        if (cleanTitle.length < 2 || (/^[a-z0-9+/=]+$/i.test(cleanTitle) && cleanTitle.length > 15 && !cleanTitle.includes(' '))) {
          cleanTitle = ''  // Will be replaced by page title from caller
        }

        // Try to get file size and format from the CDN (quick HEAD request)
        let fileSize = null
        let detectedFormat = null
        try {
          const cdnController = new AbortController()
          const cdnTimer = setTimeout(() => cdnController.abort(), 5000)
          const cdnRes = await fetch(location, {
            method: 'HEAD',
            signal: cdnController.signal,
            headers: { 'User-Agent': UA, 'Range': 'bytes=0-0' },
          })
          clearTimeout(cdnTimer)

          // Detect format from Content-Type or Content-Disposition
          const contentType = cdnRes.headers.get('content-type') || ''
          const contentDisposition = cdnRes.headers.get('content-disposition') || ''
          if (contentType.includes('matroska') || contentDisposition.includes('.mkv')) {
            detectedFormat = 'mkv'
          } else if (contentType.includes('mp4') || contentDisposition.includes('.mp4')) {
            detectedFormat = 'mp4'
          }

          const contentLength = cdnRes.headers.get('content-range')?.split('/')?.[1] ||
                               cdnRes.headers.get('content-length')
          if (contentLength) {
            const bytes = parseInt(contentLength, 10)
            if (bytes > 0) {
              fileSize = bytes >= 1_073_741_824
                ? `${(bytes / 1_073_741_824).toFixed(1)} GB`
                : `${(bytes / 1_048_576).toFixed(0)} MB`
            }
          }
        } catch { /* ignore size check failure */ }

        // Detect format from CDN probe or filename clues
        const isMkv = detectedFormat === 'mkv' || nameParam.toLowerCase().includes('.mkv') || location.toLowerCase().includes('.mkv')
        const isMp4 = detectedFormat === 'mp4' || nameParam.toLowerCase().includes('.mp4') || location.toLowerCase().includes('.mp4')

        if (fileSize && !cleanTitle.includes(fileSize)) {
          cleanTitle = `${cleanTitle} (${fileSize})`
        }

        return [{
          title: cleanTitle,
          url: location,
          link: location,
          source: 'maxcinema',
          type: 'direct',
          isDirect: true,
          playableInRoom: true, // MKV is remuxed to MP4 by proxy
          quality: isMkv ? 'MKV' : (isMp4 ? 'HD' : 'HD'),
          meta: isMkv ? 'MKV — auto-converted to MP4 for playback' : null,
          resolvedFrom: serverUrl,
        }]
      }
    }

    // If not a redirect, try to get the response body and look for direct links
    return [{
      title: 'Download',
      url: serverUrl,
      link: serverUrl,
      source: 'maxcinema',
      type: 'direct',
      isDirect: false,
      requiresUserAction: true,
      meta: 'Could not resolve download server automatically',
    }]
  } catch (err) {
    console.error('MaxCinema server resolution error:', err.message)
    return []
  }
}

/**
 * Fetch HTML content with retries
 */
async function fetchHtml(url, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      })
      clearTimeout(timeout)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch (err) {
      if (attempt === retries) {
        console.error(`MaxCinema fetchHtml failed for ${url}: ${err.message}`)
        return null
      }
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
    }
  }
  return null
}
