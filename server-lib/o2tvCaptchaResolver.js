/**
 * O2TV Captcha Resolver
 *
 * Resolves o2tv CDN URLs by:
 * 1. Following the download page → captcha page flow
 * 2. Solving the captcha using Groq vision API
 * 3. Following the redirect to the actual CDN URL
 *
 * The CDN URLs have random per-file suffixes (otv-XXXXX) that can only be
 * discovered through the download page, which is protected by a simple
 * text captcha. This module automates the full resolution chain.
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const VISION_MODEL = 'llama-3.2-11b-vision-preview'

// ─── Suffix cache shared with o2tvResolver.js ───
// We export the cache so both modules can share it
export const suffixCache = new Map()
const CACHE_TTL = 4 * 60 * 60 * 1000 // 4 hours

const CDN_HOSTS = ['d6', 'd2', 'd4', 'd8', 'd1']
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// ─── Fetch with timeout ───
async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(timer)
    return res
  } catch (err) {
    clearTimeout(timer)
    throw err
  }
}

// ─── HEAD-probe a CDN URL ───
async function probeUrl(url) {
  try {
    const res = await fetchWithTimeout(url, {
      method: 'HEAD',
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
    }, 4000)
    return res.ok || res.status === 206
  } catch { return false }
}

// ─── Build a CDN URL ───
function buildCdnUrl(cdnHost, showName, seasonNum, epNum, suffix) {
  const encoded = encodeURIComponent(showName)
  const s = String(seasonNum).padStart(2, '0')
  const e = String(epNum).padStart(2, '0')
  if (suffix) {
    return `http://${cdnHost}.o2tv.org/${encoded}/Season%20${s}/${encoded}%20-%20S${s}E${e}%20(TvShows4Mobile.Com)%20${encodeURIComponent(suffix)}.mp4`
  }
  return `http://${cdnHost}.o2tv.org/${encoded}/Season%20${s}/${encoded}%20-%20S${s}E${e}%20(TvShows4Mobile.Com).mp4`
}

/**
 * Solve a captcha image using Groq vision API
 * @param {Buffer} imageBuffer - PNG image data
 * @returns {Promise<string>} - The captcha text
 */
async function solveCaptchaWithGroq(imageBuffer) {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY not configured — cannot solve captcha')
  }

  const base64 = imageBuffer.toString('base64')
  const dataUrl = `data:image/png;base64,${base64}`

  const res = await fetchWithTimeout(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Read the text in this captcha image. Reply with ONLY the exact text characters shown, no explanation, no quotes, no extra words. Just the text.',
          },
          {
            type: 'image_url',
            image_url: { url: dataUrl },
          },
        ],
      }],
      max_tokens: 20,
      temperature: 0.1,
    }),
  }, 15000)

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `Groq API returned HTTP ${res.status}`)
  }

  const data = await res.json()
  const text = data.choices?.[0]?.message?.content?.trim() || ''
  // Clean up the response — remove any non-alphanumeric chars the model might add
  return text.replace(/[^a-zA-Z0-9]/g, '').trim()
}

/**
 * Resolve an o2tv download ID through the captcha
 *
 * Full flow:
 * 1. GET /download/{id} → 302 to /areyouhuman.php?fid={id}
 * 2. GET /areyouhuman.php → page with captcha image
 * 3. GET /simplecaptcha1/simple-php-captcha.php → captcha image
 * 4. Solve captcha with Groq vision
 * 5. POST captchainput={answer}&submit=Continue+Download
 * 6. Follow redirects → CDN URL
 *
 * @param {number} fileId - The download file ID from the episode page
 * @param {object} sessionCookies - Cookie string from previous requests
 * @returns {Promise<string|null>} - The CDN URL, or null if failed
 */
export async function resolveO2TvCaptcha(fileId) {
  const BASE = 'https://tvshows4mobile.org'
  let cookies = ''

  // Step 1: Get a session by visiting the download page
  const dlRes = await fetchWithTimeout(`${BASE}/download/${fileId}`, {
    redirect: 'manual',
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html',
    },
  }, 8000)

  // Collect cookies
  const setCookies = dlRes.headers.getSetCookie?.() || []
  cookies = setCookies.map(c => c.split(';')[0]).join('; ')

  // Step 2: Follow to the captcha page
  const captchaPageUrl = `${BASE}/areyouhuman.php?fid=${fileId}`
  const captchaPageRes = await fetchWithTimeout(captchaPageUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      'Cookie': cookies,
      'Referer': `${BASE}/download/${fileId}`,
    },
  }, 8000)

  // Collect more cookies
  const moreCookies = captchaPageRes.headers.getSetCookie?.() || []
  cookies = [cookies, ...moreCookies.map(c => c.split(';')[0])].filter(Boolean).join('; ')

  // Step 3: Download the captcha image
  const captchaImgUrl = `${BASE}/simplecaptcha1/simple-php-captcha.php?_CAPTCHA&t=${Date.now()}`
  const imgRes = await fetchWithTimeout(captchaImgUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      'Cookie': cookies,
      'Referer': captchaPageUrl,
    },
  }, 8000)

  const contentType = imgRes.headers.get('content-type') || ''
  if (!contentType.includes('image')) {
    throw new Error('Captcha image not received — got ' + contentType)
  }

  const imgBuffer = Buffer.from(await imgRes.arrayBuffer())

  // Step 4: Solve the captcha with Groq vision
  let captchaAnswer = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      captchaAnswer = await solveCaptchaWithGroq(imgBuffer)
      if (captchaAnswer && captchaAnswer.length >= 3) break
    } catch (err) {
      console.error(`Captcha solve attempt ${attempt + 1} failed:`, err.message)
    }
  }

  if (!captchaAnswer || captchaAnswer.length < 3) {
    throw new Error('Failed to solve captcha after 3 attempts')
  }

  console.log(`Captcha solved: "${captchaAnswer}" for file ID ${fileId}`)

  // Step 5: POST the captcha answer
  const postRes = await fetchWithTimeout(captchaPageUrl, {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'Cookie': cookies,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': captchaPageUrl,
      'Origin': BASE,
    },
    body: `captchainput=${encodeURIComponent(captchaAnswer)}&submit=Continue+Download`,
    redirect: 'manual',
  }, 8000)

  // Step 6: Follow redirects to get the final CDN URL
  let currentUrl = postRes.headers.get('location')
  const postCookies = postRes.headers.getSetCookie?.() || []
  cookies = [cookies, ...postCookies.map(c => c.split(';')[0])].filter(Boolean).join('; ')

  if (!currentUrl) {
    // Maybe the captcha was wrong — check response
    const body = await postRes.text().catch(() => '')
    if (body.includes('Does Not Match') || body.includes('incorrect')) {
      throw new Error('Captcha answer was incorrect')
    }
    throw new Error('No redirect after captcha submission')
  }

  // Follow up to 5 redirects
  for (let i = 0; i < 5; i++) {
    if (!currentUrl) break

    // If it's a relative URL, make it absolute
    if (currentUrl.startsWith('/')) {
      currentUrl = `${BASE}${currentUrl}`
    }

    // Check if we've reached a direct media URL
    if (/\.(mp4|mkv|m3u8|webm)(\?|#|$)/i.test(currentUrl)) {
      return currentUrl
    }

    // Check if it's a CDN URL we recognize
    if (currentUrl.includes('o2tv.org')) {
      return currentUrl
    }

    // Follow the redirect
    try {
      const redirRes = await fetchWithTimeout(currentUrl, {
        redirect: 'manual',
        headers: {
          'User-Agent': USER_AGENT,
          'Cookie': cookies,
          'Referer': BASE,
        },
      }, 8000)

      const moreRedirectCookies = redirRes.headers.getSetCookie?.() || []
      cookies = [cookies, ...moreRedirectCookies.map(c => c.split(';')[0])].filter(Boolean).join('; ')

      const nextLocation = redirRes.headers.get('location')
      if (!nextLocation) {
        // We've reached the final page — check for direct URLs in the response
        if (redirRes.ok) {
          const body = await redirRes.text().catch(() => '')
          // Extract any .mp4/.mkv URLs from the page
          const mediaMatch = body.match(/https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/i)
          if (mediaMatch) return mediaMatch[0]
          const mkvMatch = body.match(/https?:\/\/[^\s"'<>]+\.mkv[^\s"'<>]*/i)
          if (mkvMatch) return mkvMatch[0]
        }
        break
      }
      currentUrl = nextLocation
    } catch {
      break
    }
  }

  return currentUrl || null
}

/**
 * Classify an O2TV episode download option by quality.
 * Prefer basic progressive MP4 — HD is too large for proxy/Hobby, 3gp is too low.
 *
 * Rank (lower = try first):
 *   0 = basic Mp4 ("Basic Quality, Small Size")  ← preferred
 *   1 = other/unknown mp4-like
 *   2 = HD Mp4 ("Highest Quality, Largest Size") ← fallback only
 *   3 = 3gp / low ("Lowest Quality")             ← last resort
 */
function classifyO2TvDownload(label, context = '') {
  const text = `${label || ''} ${context || ''}`.toLowerCase()
  if (/\b3gp\b/.test(text) || /lowest quality|smallest size/.test(text)) {
    return { tier: '3gp', rank: 3, quality: '3gp' }
  }
  if (/\bhd\b/.test(text) || /highest quality|largest size/.test(text)) {
    return { tier: 'hd', rank: 2, quality: 'HD' }
  }
  // Explicit basic / standard mp4
  if (
    /\bmp4\b/.test(text)
    || /basic quality|small size/.test(text)
    || /in mp4 format/.test(text)
  ) {
    // "in Mp4 Format" without HD/3gp nearby → basic
    if (!/\bhd\b/.test(text) && !/\b3gp\b/.test(text)) {
      return { tier: 'basic', rank: 0, quality: 'MP4' }
    }
  }
  return { tier: 'unknown', rank: 1, quality: 'MP4' }
}

/**
 * Parse episode HTML into ranked download options (id + quality label).
 */
function parseO2TvDownloadOptions(epHtml) {
  const options = []
  const seen = new Set()

  // Anchor text is the best signal: "… in Mp4 Format" / "… in HD Mp4 Format" / "… in 3gp Format"
  const anchorRe = /href=["'](?:https?:\/\/(?:www\.)?tvshows4mobile\.org)?\/download\/(\d+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let m
  while ((m = anchorRe.exec(epHtml)) !== null) {
    const id = parseInt(m[1], 10)
    if (!id || seen.has(id)) continue
    seen.add(id)
    const label = String(m[2] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    const context = epHtml.slice(Math.max(0, m.index - 280), Math.min(epHtml.length, m.index + 120))
    const classified = classifyO2TvDownload(label, context)
    options.push({
      fileId: id,
      label: label || `Download ${id}`,
      ...classified,
    })
  }

  // Fallback: bare /download/IDs without parseable anchors
  if (!options.length) {
    const idRe = /\/download\/(\d+)/g
    let im
    while ((im = idRe.exec(epHtml)) !== null) {
      const id = parseInt(im[1], 10)
      if (!id || seen.has(id)) continue
      seen.add(id)
      options.push({
        fileId: id,
        label: `Download ${id}`,
        tier: 'unknown',
        rank: 1,
        quality: 'MP4',
      })
    }
  }

  // Prefer basic MP4 → unknown → HD → 3gp
  options.sort((a, b) => a.rank - b.rank || a.fileId - b.fileId)
  return options
}

/**
 * Resolve an o2tv episode by:
 * 1. Getting download options from the episode page (ranked by quality)
 * 2. Prefer basic Mp4 (not HD, not 3gp)
 * 3. Solving captcha for the best option, falling back down the list
 * 4. Following redirects to get the CDN URL
 *
 * @param {string} showSlug - e.g., "House-of-the-Dragon-otviao8f"
 * @param {number} seasonNum - Season number (1-based)
 * @param {number} epNum - Episode number (1-based)
 * @returns {Promise<Array<{title, url, source, isDirect, playableInRoom, quality}>>}
 */
export async function resolveO2TvEpisodeViaCaptcha(showSlug, seasonNum, epNum) {
  const BASE = 'https://tvshows4mobile.org'
  const seasonPath = `Season-${String(seasonNum).padStart(2, '0')}`
  const episodePath = `Episode-${String(epNum).padStart(2, '0')}`
  const episodeUrl = `${BASE}/${showSlug}/${seasonPath}/${episodePath}/`

  // Step 1: Fetch the episode page
  const epRes = await fetchWithTimeout(episodeUrl, {
    headers: { 'User-Agent': USER_AGENT },
  }, 8000)

  if (!epRes.ok) return []

  const epHtml = await epRes.text()

  // Step 2: Ranked download options — basic Mp4 first, never prefer HD/3gp
  const options = parseO2TvDownloadOptions(epHtml)
  if (!options.length) return []

  // Derive the show name from slug for the title
  const showName = showSlug
    .replace(/-otv[a-z0-9]+$/i, '')
    .replace(/-/g, ' ')
    .trim()

  const s = String(seasonNum).padStart(2, '0')
  const e = String(epNum).padStart(2, '0')
  const title = `${showName} - S${s}E${e}`

  console.log(
    `O2TV quality order for ${showSlug} S${s}E${e}:`,
    options.map((o) => `${o.fileId}:${o.tier}`).join(' → '),
  )

  // Step 3: Try best quality first (basic), then fallbacks
  for (const opt of options) {
    try {
      const cdnUrl = await resolveO2TvCaptcha(opt.fileId)
      if (cdnUrl) {
        // Cache the suffix for future use
        const suffixMatch = cdnUrl.match(/otv-([a-z0-9]+)/i)
        if (suffixMatch) {
          const suffix = `otv-${suffixMatch[1]}`
          const cacheKey = `${showName}|S${s}E${e}`
          suffixCache.set(cacheKey, { suffix, ts: Date.now() })
        }

        return [{
          title,
          url: cdnUrl,
          link: cdnUrl,
          source: 'o2tv',
          isDirect: true,
          playableInRoom: /\.(mp4|webm|m3u8)/i.test(cdnUrl),
          quality: opt.quality || 'MP4',
          qualityTier: opt.tier,
          resolvedFileId: opt.fileId,
        }]
      }
    } catch (err) {
      console.error(`Captcha resolution failed for file ${opt.fileId} (${opt.tier}):`, err.message)
    }
  }

  return []
}
