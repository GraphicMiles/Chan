// Shared site configs for the on-demand media scraper.
// Each entry describes how to parse a listing/search-results page for a given site.
//
// `buildSearchUrl(query)` is OPTIONAL. Only add it for sites you have verified you're
// allowed to query programmatically (e.g. a public metadata catalog like IMDb).
// For any other site, users paste the exact page URL themselves (see ScraperPage) --
// this app does not maintain or guess mirror domains for third-party sites.
//
// Selectors are best-effort. Real-world sites change markup often; if a site returns
// 0 results, the selectors below likely need updating for that site's current HTML.
export const SITE_CONFIGS = {
  imdb: {
    label: 'IMDb',
    buildSearchUrl: (query) => `https://www.imdb.com/find/?q=${encodeURIComponent(query)}&s=tt`,
    items: '.ipc-metadata-list-summary-item, .find-result-item, .lister-item, li.find-title-result',
    title: '.ipc-metadata-list-summary-item__t, .ipc-title__text, .lister-item-header a, a.ipc-metadata-list-summary-item__t',
    image: 'img',
    link: 'a',
    meta: '.ipc-metadata-list-summary-item__li, .lister-item-year, .find-result-item .result_text',
  },
  nkiri: {
    label: 'Nkiri',
    items: 'article.post-item, .movie-item, .post, article',
    title: 'h2 a, .entry-title a, h3 a, h2, h3',
    image: 'img',
    link: 'a',
    meta: '.posted-on, .meta, time',
  },
  netnaija: {
    label: 'NetNaija',
    items: '.file-thumb, .video-thumb, .result-item, article',
    title: 'a, h2, h3',
    image: 'img',
    link: 'a',
    meta: '.meta, time',
  },
  fzmovies: {
    label: 'FZMovies',
    items: '.mainbox, .moviebox, .content, article',
    title: 'a, h2, h3',
    image: 'img',
    link: 'a',
    meta: '.info, time',
  },
  custom: {
    label: 'Custom site (paste a URL)',
    // Generic fallback selectors for an arbitrary page the user pastes a link to.
    items: 'article, .item, .post, li',
    title: 'h1, h2, h3, a',
    image: 'img',
    link: 'a',
    meta: 'time, .meta, .date',
  },
};

export function getSiteConfig(site) {
  return SITE_CONFIGS[site] || SITE_CONFIGS.custom;
}

export function resolveUrl(src, baseUrl) {
  if (!src) return null;
  if (src.startsWith('http')) return src;
  if (src.startsWith('//')) return `https:${src}`;
  if (src.startsWith('/')) {
    const base = new URL(baseUrl);
    return `${base.protocol}//${base.host}${src}`;
  }
  try {
    return new URL(src, baseUrl).href;
  } catch {
    return src;
  }
}
