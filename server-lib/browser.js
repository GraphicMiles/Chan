/**
 * Serverless Puppeteer Browser Manager
 *
 * Uses @sparticuz/chromium + puppeteer-core on Vercel (production),
 * full puppeteer for local development.
 *
 * Provides:
 *   - getBrowser(): launches or reuses a browser instance
 *   - resolveWithBrowser(url, options): opens a page, waits for JS, extracts content
 *   - closeBrowser(): clean shutdown
 *
 * Designed for Vercel serverless — minimizes cold starts by reusing
 * the browser across warm invocations within the same function instance.
 */

let _browser = null
let _launchPromise = null

const IS_PRODUCTION = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production'

/**
 * Get a Puppeteer browser instance (launches if needed, reuses if warm)
 */
export async function getBrowser() {
  if (_browser && _browser.connected) {
    return _browser
  }

  // Deduplicate concurrent launch attempts
  if (_launchPromise) return _launchPromise

  _launchPromise = (async () => {
    try {
      if (IS_PRODUCTION) {
        // Production: @sparticuz/chromium (serverless-friendly)
        const chromium = (await import('@sparticuz/chromium')).default
        const puppeteer = (await import('puppeteer-core')).default

        _browser = await puppeteer.launch({
          args: [
            ...chromium.args,
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--hide-scrollbars',
            '--disable-web-security',
          ],
          defaultViewport: chromium.defaultViewport,
          executablePath: await chromium.executablePath(),
          headless: chromium.headless,
          ignoreHTTPSErrors: true,
        })
      } else {
        // Local dev: full puppeteer with bundled Chromium
        const puppeteer = (await import('puppeteer')).default
        _browser = await puppeteer.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
          ],
        })
      }

      // Auto-cleanup when browser disconnects
      _browser.on('disconnected', () => { _browser = null })

      return _browser
    } catch (err) {
      _browser = null
      throw err
    } finally {
      _launchPromise = null
    }
  })()

  return _launchPromise
}

/**
 * Close the shared browser instance
 */
export async function closeBrowser() {
  if (_browser) {
    try { await _browser.close() } catch { /* ignore */ }
    _browser = null
  }
}

/**
 * Resolve a page using Puppeteer — navigates, waits for JS/countdowns,
 * and extracts download links or direct media URLs.
 *
 * @param {string} url - The page URL to resolve
 * @param {object} options
 * @param {number} options.timeout - Max wait time in ms (default 15000)
 * @param {string} options.waitForSelector - CSS selector to wait for before extracting
 * @param {number} options.countdownSeconds - Seconds to wait for JS countdowns (default 6)
 * @param {Function} options.extractFn - Custom extraction function: (page, url) => results[]
 * @returns {Promise<Array<{title, url, source, isDirect, playableInRoom}>>}
 */
export async function resolveWithBrowser(url, options = {}) {
  const {
    timeout = 15000,
    waitForSelector = null,
    countdownSeconds = 6,
    extractFn = null,
  } = options

  let browser
  let page

  try {
    browser = await getBrowser()
    page = await browser.newPage()

    // Block unnecessary resources to speed up loading
    await page.setRequestInterception(true)
    page.on('request', (req) => {
      const resourceType = req.resourceType()
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort()
      } else {
        req.continue()
      }
    })

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    )

    // Navigate to the page
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout,
    })

    // Wait for specific selector if provided
    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout: 5000 }).catch(() => {})
    }

    // Wait for JS countdowns (many download sites have 5-10 second countdowns)
    if (countdownSeconds > 0) {
      await new Promise((r) => setTimeout(r, countdownSeconds * 1000))
    }

    // Extract results
    if (extractFn) {
      return await extractFn(page, url)
    }

    // Default extraction: find all direct media links on the page
    return await extractMediaLinks(page, url)
  } catch (err) {
    console.error('Browser resolution error:', err.message)
    return []
  } finally {
    if (page) {
      try { await page.close() } catch { /* ignore */ }
    }
    // Don't close browser — reuse for warm invocations
    // Vercel will clean up when the function instance is recycled
  }
}

/**
 * Default media link extractor — finds all .mp4/.mkv/.m3u8 links on the page
 */
async function extractMediaLinks(page, pageUrl) {
  return await page.evaluate((originUrl) => {
    const mediaExts = /\.(mp4|m3u8|webm|mkv|avi)(\?|#|$)/i
    const results = []
    const seen = new Set()

    // Find links in <a> tags
    document.querySelectorAll('a[href]').forEach((el) => {
      const href = el.href
      if (href && mediaExts.test(href) && !seen.has(href)) {
        seen.add(href)
        results.push({
          title: el.textContent.trim() || decodeURIComponent(href.split('/').pop().split('?')[0]) || 'Video',
          url: href,
          link: href,
          source: 'browser',
          isDirect: true,
          playableInRoom: /\.(mp4|webm|m3u8)/i.test(href),
          resolvedFrom: originUrl,
        })
      }
    })

    // Find <source> and <video> elements
    document.querySelectorAll('video[src], video source[src], source[src]').forEach((el) => {
      const src = el.src
      if (src && !seen.has(src)) {
        seen.add(src)
        results.push({
          title: decodeURIComponent(src.split('/').pop().split('?')[0]) || 'Video',
          url: src,
          link: src,
          source: 'browser',
          isDirect: true,
          playableInRoom: true,
          resolvedFrom: originUrl,
        })
      }
    })

    // Find URLs in page source (inline JS, data attributes, etc.)
    const pageText = document.documentElement.innerHTML
    const urlRegex = /https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8|webm|mkv)(?:[?#][^\s"'<>]*)?/gi
    const matches = pageText.match(urlRegex) || []
    matches.forEach((raw) => {
      const clean = raw.replace(/&amp;/g, '&')
      if (!seen.has(clean)) {
        seen.add(clean)
        results.push({
          title: decodeURIComponent(clean.split('/').pop().split('?')[0]) || 'Video',
          url: clean,
          link: clean,
          source: 'browser',
          isDirect: true,
          playableInRoom: /\.(mp4|webm|m3u8)/i.test(clean),
          resolvedFrom: originUrl,
        })
      }
    })

    return results
  }, pageUrl)
}

/**
 * Extract page HTML after JS execution (for sites that render content dynamically)
 */
export async function getRenderedHtml(url, options = {}) {
  const { timeout = 10000, waitForSelector = null } = options

  let browser
  let page

  try {
    browser = await getBrowser()
    page = await browser.newPage()

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    )

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout,
    })

    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout: 5000 }).catch(() => {})
    }

    return await page.content()
  } catch (err) {
    console.error('Browser HTML extraction error:', err.message)
    return null
  } finally {
    if (page) {
      try { await page.close() } catch { /* ignore */ }
    }
  }
}

/**
 * MeetDownload resolver — handles JS countdown and token extraction
 *
 * MeetDownload URLs follow the pattern:
 *   meetdownload.com/HASH/filename
 * After JS execution + countdown, a direct download link appears.
 */
export async function resolveMeetDownload(url) {
  return await resolveWithBrowser(url, {
    countdownSeconds: 8,
    waitForSelector: 'a[href*=".mp4"], a[href*=".mkv"], a[href*="download"], .download-btn, #download',
    extractFn: async (page, pageUrl) => {
      // Wait for download button to appear
      await page.waitForFunction(() => {
        const links = document.querySelectorAll('a[href]')
        for (const link of links) {
          const href = link.href || ''
          if (href.includes('.mp4') || href.includes('.mkv') || href.includes('download')) {
            return true
          }
        }
        // Also check for download buttons that may have been created
        const btns = document.querySelectorAll('button, .btn, [class*="download"]')
        return btns.length > 0
      }, { timeout: 10000 }).catch(() => {})

      // Click any download buttons that might trigger link generation
      try {
        const downloadBtn = await page.$('a[href*="download"], button[class*="download"], .download-btn, #download')
        if (downloadBtn) {
          await downloadBtn.click()
          await new Promise((r) => setTimeout(r, 3000))
        }
      } catch { /* ignore */ }

      // Extract all media links from the rendered page
      return await extractMediaLinks(page, pageUrl)
    },
  })
}

/**
 * Waploaded resolver — handles JS-rendered search results
 *
 * Waploaded's search results are rendered client-side.
 * We load the page in Puppeteer and extract the results.
 */
export async function resolveWaploaded(url) {
  return await resolveWithBrowser(url, {
    timeout: 10000,
    countdownSeconds: 2,
    waitForSelector: 'a[href*="/movie/"], a[href*="/series/"], a[href*="/video/"], .result-item',
    extractFn: async (page, pageUrl) => {
      return await page.evaluate((originUrl) => {
        const results = []
        const seen = new Set()

        // Find media links
        document.querySelectorAll('a[href]').forEach((el) => {
          const href = el.href
          const text = el.textContent.trim()
          if (!href || seen.has(href)) return

          // Skip navigation/utility links
          if (href.includes('/search/') || href.includes('/page/') || href.includes('/feed/')) return

          const isMedia = /\/movie\/|\/series\/|\/video\/|\.mp4|\.mkv|download/i.test(href)
          if (isMedia && text) {
            seen.add(href)
            results.push({
              title: text.slice(0, 200),
              url: href,
              link: href,
              source: 'waploaded',
              isDirect: /\.(mp4|mkv|m3u8)/i.test(href),
              playableInRoom: /\.(mp4|webm|m3u8)/i.test(href),
              resolvedFrom: originUrl,
            })
          }
        })

        return results
      }, pageUrl)
    },
  })
}

/**
 * Generic browser-based resolver for any site that needs JS execution
 */
export async function resolveGenericBrowser(url, { countdown = 5, waitFor = null } = {}) {
  return await resolveWithBrowser(url, {
    countdownSeconds: countdown,
    waitForSelector: waitFor,
  })
}
