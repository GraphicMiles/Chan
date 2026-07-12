import * as cheerio from 'cheerio';
import { preflight, ok, fail } from './lib/http.js';
import { getSiteConfig, resolveUrl } from './lib/sources.js';

const FETCH_TIMEOUT_MS = 8000;

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!response.ok) {
      throw new Error(`Site responded with HTTP ${response.status}`);
    }
    const html = await response.text();
    // Bot-protection services (Cloudflare/AWS WAF, etc.) return a 2xx
    // "challenge" page instead of a normal error. These are always small
    // (a few KB at most) -- checking keywords only on short pages avoids
    // false positives on long, legitimate pages that happen to mention
    // "captcha" somewhere (e.g. in a footer notice).
    const trimmed = html.trim();
    const isShort = trimmed.length < 5000;
    const lower = trimmed.toLowerCase();
    const hasStrongWafSignal = /gokuprops|awswafcookiedomainlist|cf-chl-bypass|cf_chl_opt/.test(lower);
    const hasWeakChallengeSignal =
      isShort && /checking your browser|are you a human|unusual traffic|attention required|verify you are human/.test(lower);
    if (trimmed.length < 200 || hasStrongWafSignal || hasWeakChallengeSignal) {
      throw new Error('This site blocked the request as automated traffic (bot-protection challenge) — it cannot be scraped from a server.');
    }
    return html;
  } finally {
    clearTimeout(timer);
  }
}

function parseResults(html, url, site) {
  const $ = cheerio.load(html);
  const config = getSiteConfig(site);
  const results = [];
  const seenLinks = new Set();

  $(config.items).each((i, el) => {
    const $el = $(el);
    const title = $el.find(config.title).first().text().trim();
    const image = $el.find(config.image).first().attr('src') || $el.find(config.image).first().attr('data-src');
    const rawLink = $el.find(config.link).first().attr('href');
    const link = resolveUrl(rawLink, url);
    const meta = $el.find(config.meta).first().text().trim();

    if (title && title.length > 1 && !seenLinks.has(link)) {
      seenLinks.add(link);
      results.push({
        title: title.substring(0, 200),
        image: resolveUrl(image, url),
        link,
        meta: meta?.substring(0, 100) || null,
        source: site || 'custom',
      });
    }
  });

  return results.slice(0, 40);
}

export default async function handler(req, res) {
  if (preflight(req, res, { methods: ['POST'] })) return;

  const { url, query, site } = req.body || {};
  const config = getSiteConfig(site);

  // Two ways to trigger a search:
  // 1. `query` + a site that has a verified `buildSearchUrl` (e.g. IMDb) -> we build the URL.
  // 2. `url` -> the user pasted the exact page to scrape (any site, on-demand, no automation).
  let targetUrl = url;
  if (!targetUrl && query) {
    if (typeof config.buildSearchUrl !== 'function') {
      return fail(res, 400, `"${config.label}" needs a URL — paste the page to search, or pick a site with built-in search (IMDb).`);
    }
    targetUrl = config.buildSearchUrl(query);
  }

  if (!targetUrl) {
    return fail(res, 400, 'Provide a "url" to scrape, or a "query" with a site that supports search (IMDb).');
  }

  try {
    const html = await fetchHtml(targetUrl);
    const results = parseResults(html, targetUrl, site);

    return ok(res, {
      success: true,
      count: results.length,
      url: targetUrl,
      site: site || 'custom',
      results,
    });
  } catch (err) {
    console.error('Scrape error:', err);
    const message = err.name === 'AbortError' ? 'Request timed out' : err.message;
    return fail(res, 502, message);
  }
}
