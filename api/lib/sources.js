export const SITE_CONFIGS = {
  nkiri: {
    label: 'Nkiri',
    items: '.list-movies .movie-item, .movies-list .item, .post-item, article',
    title: '.movie-title, .entry-title, h2 a, h3 a, .title',
    image: 'img[src], .poster img, .thumb img',
    link: 'a[href], .download-link a, .movie-link',
    meta: '.meta, .date, .year, .quality, .category',
  },
  netnaija: {
    label: 'NetNaija',
    items: '.file-item, .video-item, .post-item, article',
    title: '.file-title, .video-title, h2 a, h3 a, .title a',
    image: 'img[src], .thumbnail img, .poster img',
    link: 'a[href], .download-btn, .file-link',
    meta: '.meta, .file-meta, .category, .date',
  },
  fzmovies: {
    label: 'FZMovies',
    items: '.movielist .movie, .movie-item, .content-box',
    title: '.moviename, .movie-title, h2 a, b a',
    image: 'img[src], .movieimg img, .poster img',
    link: 'a[href], .downloadlink a, .movie-link',
    meta: '.movieinfo, .meta, small, .year',
  },
  custom: {
    label: 'Custom URL',
    items: 'article, .post, .item, .card, .movie, .video, [class*="movie"], [class*="video"], [class*="post"]',
    title: 'h1, h2, h3, h4, .title, [class*="title"], [class*="name"]',
    image: 'img[src], [class*="poster"] img, [class*="thumb"] img',
    link: 'a[href], [class*="link"]',
    meta: '.meta, .date, .info, [class*="meta"], [class*="info"]',
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
