import * as cheerio from 'cheerio'
import { preflight, ok, fail } from './lib/http.js'
import { getSiteConfig, resolveUrl } from './lib/sources.js'

const BOT_MARKERS = [
  'gokuprops',
  'awswafcookiedomainlist',
  'cf-chl-bypass',
  'cf_chl_opt',
  'turnstile',
  'challenge-platform',
  'captcha',
]

const BOT_PHRASES = [
  'checking your browser',
  'are you a human',
  'unusual traffic',
  'attention required',
  'verify you are human',
  'ddos protection',
  'security check',
  'please wait',
  'verifying',
]

async function fetchHtml(targetUrl) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  try {
    const res = await fetch(targetUrl, {
      signal: controller.signal,
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
      if (lower.includes(m)) throw new Error('Bot challenge detected')
    }
    if (isSmall) {
      for (const p of BOT_PHRASES) {
        if (lower.includes(p)) throw new Error('Bot challenge detected')
      }
    }
    return html
  } catch (e) {
    clearTimeout(timeout)
    throw e
  }
}

function parseResults(html, pageUrl, siteKey) {
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

    if (title && title.length > 1 && link && !seen.has(link)) {
      seen.add(link)
      out.push({ title, image: img, link, meta, source: siteKey })
    }
  })

  return out.slice(0, 40)
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
          `"${config.label}" needs a URL. Open the site, search, then paste the results page URL here.`
        )
      }
      targetUrl = config.buildSearchUrl(query)
    }
    if (!targetUrl) return fail(res, 400, 'URL is required')

    const html = await fetchHtml(targetUrl)
    const results = parseResults(html, targetUrl, site || 'custom')

    return ok(res, { count: results.length, results, url: targetUrl, site: site || 'custom' })
  } catch (e) {
    return fail(res, 500, e.message || 'Scrape failed')
  }
}
