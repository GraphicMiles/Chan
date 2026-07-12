// Shared scraping utilities using cheerio (lightweight) or puppeteer (JS-rendered)
import * as cheerio from 'cheerio';

export class MediaScraper {
  constructor() {
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  }

  async fetchHTML(url) {
    const response = await fetch(url, {
      headers: { 'User-Agent': this.userAgent }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  }

  parseMovies($, selectors) {
    const movies = [];
    $(selectors.container).each((_, el) => {
      const $el = $(el);
      movies.push({
        title: $el.find(selectors.title).text().trim(),
        year: $el.find(selectors.year).text().trim(),
        rating: $el.find(selectors.rating).text().trim(),
        poster: $el.find(selectors.poster).attr('src'),
        link: $el.find(selectors.link).attr('href'),
        scrapedAt: new Date().toISOString()
      });
    });
    return movies;
  }

  // Site-specific configs
  getSiteConfig(site) {
    const configs = {
      'imdb': {
        container: '.lister-item',
        title: '.lister-item-header a',
        year: '.lister-item-year',
        rating: '.ratings-imdb-rating strong',
        poster: '.lister-item-image img',
        link: '.lister-item-header a'
      },
      // Add more sites here
    };
    return configs[site] || null;
  }
}

export const scraper = new MediaScraper();