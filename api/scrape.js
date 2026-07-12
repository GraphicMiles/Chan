import { sendResponse } from './lib/response.js';
import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  // Use preflight from http.js if you want, or manual CORS:
  if (req.method === 'OPTIONS') {
    return sendResponse(res, 200, {}, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
  }
  
  if (req.method !== 'POST') {
    return sendResponse(res, 405, { error: 'Method not allowed' });
  }

  const { url, site } = req.body || {};
  
  if (!url) {
    return sendResponse(res, 400, { error: 'URL required' });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    });

    if (!response.ok) {
      return sendResponse(res, 500, { error: `HTTP ${response.status}` });
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const results = [];

    const configs = {
      nkiri: {
        items: 'article.post-item, .movie-item, .post',
        title: 'h2 a, .entry-title a, h3 a',
        image: 'img',
        link: 'a',
        meta: '.posted-on, .meta'
      },
      netnaija: {
        items: '.file-thumb, .video-thumb, .result-item',
        title: 'a',
        image: 'img',
        link: 'a',
        meta: '.meta'
      },
      fzmovies: {
        items: '.mainbox, .moviebox, .content',
        title: 'a',
        image: 'img',
        link: 'a',
        meta: '.info'
      },
      imdb: {
        items: '.lister-item, .ipc-metadata-list-summary-item',
        title: '.lister-item-header a, .ipc-title__text',
        image: '.lister-item-image img, .ipc-image',
        link: 'a',
        meta: '.lister-item-year'
      }
    };

    const config = configs[site] || configs.nkiri;

    $(config.items).each((i, el) => {
      const $el = $(el);
      const title = $el.find(config.title).first().text().trim();
      const image = $el.find(config.image).attr('src') || $el.find(config.image).attr('data-src');
      const link = $el.find(config.link).attr('href');
      const meta = $el.find(config.meta).text().trim();

      if (title && title.length > 1) {
        results.push({
          title: title.substring(0, 200),
          image: resolveUrl(image, url),
          link: resolveUrl(link, url),
          meta: meta?.substring(0, 100) || null,
          source: site || 'unknown'
        });
      }
    });

    return sendResponse(res, 200, {
      success: true,
      count: results.length,
      url: url,
      results: results.slice(0, 30)
    });

  } catch (err) {
    console.error('Scrape error:', err);
    return sendResponse(res, 500, { error: err.message });
  }
}

function resolveUrl(src, baseUrl) {
  if (!src) return null;
  if (src.startsWith('http')) return src;
  if (src.startsWith('//')) return `https:${src}`;
  if (src.startsWith('/')) {
    const base = new URL(baseUrl);
    return `${base.protocol}//${base.host}${src}`;
  }
  return src;
}
