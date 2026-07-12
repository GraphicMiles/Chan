export const SITE_CONFIGS = {
  nkiri: {
    label: 'Nkiri',
    items: '.list-movies .movie-item, .movies-list .item, .post-item, article, .entry',
    title: '.movie-title, .entry-title, h1, h2 a, h3 a, .title, h1.entry-title',
    image: 'img[src], .poster img, .thumb img, img.wp-post-image, .featured-image img, img[data-src]',
    link: 'a[href], .download-link a, .movie-link, a[href*="/download/"], a[href*=".mp4"], a[href*=".mkv"]',
    meta: '.meta, .date, .year, .quality, .category, .posted-on',
  },
  netnaija: {
    label: 'NetNaija',
    items: '.file-item, article.post, .video-item, .content-box, article, main article',
    title: '.file-title, .entry-title h1, h1.entry-title, h1, h2, .title, header h1',
    image: 'img.wp-post-image, .featured-image img, img[src*="wp-content"], img[data-src], .post-thumbnail img, img',
    link: 'a[href*="/download/"], a[href*=".mp4"], a[href*=".mkv"], a.dlm-button, a.download-btn, a[href*=".avi"], a[href*=".mp3"]',
    meta: '.file-meta, .post-meta, .category, .date, .posted-on, .meta',
  },
  fzmovies: {
    label: 'FZMovies',
    items: '.movielist .movie, .movie-item, .content-box, .mainbox',
    title: '.moviename, .movie-title, h2 a, b a, h1, .title',
    image: 'img[src], .movieimg img, .poster img, img[data-src]',
    link: 'a[href], .downloadlink a, .movie-link, a[href*="/download/"], a[href*=".mp4"]',
    meta: '.movieinfo, .meta, small, .year, .info',
  },
  custom: {
    label: 'Custom URL',
    items: 'article, .post, .item, .card, .movie, .video, [class*="movie"], [class*="video"], [class*="post"], main, .content',
    title: 'h1, h2, h3, h4, .title, [class*="title"], [class*="name"], header h1',
    image: 'img[src], [class*="poster"] img, [class*="thumb"] img, img[data-src], .featured-image img',
    link: 'a[href], [class*="link"], a[href*=".mp4"], a[href*=".mkv"], a[href*="/download/"]',
    meta: '.meta, .date, .info, [class*="meta"], [class*="info"], .posted-on',
  },
}

export function getSiteConfig(site) {
  return SITE_CONFIGS[site] || SITE_CONFIGS.custom
}

export function resolveUrl(src, baseUrl) {
  if (!src) return null
  try {
    if (src.startsWith('http://') || src.startsWith('https://')) return src
    if (src.startsWith('//')) return `https:${src}`
    return new URL(src, baseUrl).href
  } catch {
    return src
  }
}
