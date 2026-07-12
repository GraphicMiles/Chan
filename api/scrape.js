// api/scrape.js — Deployable Vercel Serverless Function
import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url, site } = req.body || {};
  
  if (!url) return res.status(400).json({ error: 'URL required' });

  try {
    // Fetch with browser headers
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
      }
    });

    if (!response.ok) {
      return res.status(500).json({ error: `HTTP ${response.status}` });
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const results = [];

    // Site-specific selectors
    const configs = {
      nkiri: {
        items: 'article.post-item, .movie-item, .post',
        title: 'h2 a, .entry-title a, h3 a',
        image: 'img',
        link: 'a',
        meta: '.posted-on, .meta, .cat-links'
      },
      netnaija: {
        items: '.file-thumb, .video-thumb, .result-item',
        title: 'a',
        image: 'img',
        link: 'a',
        meta: '.meta, .file-info'
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

    const config = configs[site] || configs.nkiri; // default to nkiri style

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

    return res.status(200).json({
      success: true,
      count: results.length,
      url: url,
      results: results.slice(0, 30)
    });

  } catch (err) {
    console.error('Scrape error:', err);
    return res.status(500).json({ error: err.message });
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
