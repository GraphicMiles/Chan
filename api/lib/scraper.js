/**
 * Lightweight HTML metadata helpers (Cheerio).
 * Shared by /api/media — this file is NOT a Vercel function.
 */
import * as cheerio from 'cheerio'

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

export class MediaScraper {
  constructor(userAgent = DEFAULT_UA) {
    this.userAgent = userAgent
  }

  async fetchHTML(url, { timeoutMs = 12000 } = {}) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: controller.signal,
        redirect: 'follow',
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.text()
    } finally {
      clearTimeout(timer)
    }
  }

  load(html) {
    return cheerio.load(html)
  }

  parseList($, selectors) {
    const items = []
    $(selectors.container).each((_, el) => {
      const $el = $(el)
      const title = $el.find(selectors.title).first().text().trim()
      if (!title) return
      let link = $el.find(selectors.link).first().attr('href') || ''
      let poster = $el.find(selectors.poster).first().attr('src')
        || $el.find(selectors.poster).first().attr('data-src')
        || ''
      items.push({
        title,
        year: $el.find(selectors.year).first().text().trim() || '',
        rating: $el.find(selectors.rating).first().text().trim() || '',
        poster,
        link,
        scrapedAt: new Date().toISOString(),
      })
    })
    return items
  }

  getSiteConfig(site) {
    const configs = {
      imdb: {
        container: '.lister-item, .ipc-metadata-list-summary-item',
        title: '.lister-item-header a, .ipc-title-link-wrapper',
        year: '.lister-item-year, .dli-title-metadata-item',
        rating: '.ratings-imdb-rating strong, .ipc-rating-star--rating',
        poster: '.lister-item-image img, .ipc-media img',
        link: '.lister-item-header a, .ipc-title-link-wrapper',
      },
    }
    return configs[site] || null
  }

  absoluteUrl(base, href) {
    if (!href) return ''
    try {
      return new URL(href, base).toString()
    } catch {
      return href
    }
  }
}

export const scraper = new MediaScraper()
