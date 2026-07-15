import * as cheerio from 'cheerio';

const query = 'House of the Dragon';
const NKIRI_BASE = 'https://thenkiri.com';
const searchUrl = NKIRI_BASE + '/?s=' + encodeURIComponent(query);

console.log('Fetching:', searchUrl);

const res = await fetch(searchUrl, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html',
    'Referer': NKIRI_BASE + '/'
  },
  redirect: 'follow'
});

console.log('Status:', res.status);
console.log('URL:', res.url);

const html = await res.text();
console.log('HTML length:', html.length);

const $ = cheerio.load(html);

// Test each selector
const selectors = ['.search-entry-inner a[href]', 'article a[href]', '.post-item a[href]', 'h2 a[href]', 'h3 a[href]'];
let allLinks = [];

for (const sel of selectors) {
  const links = [];
  $(sel).each((_, el) => {
    const href = $(el).attr('href') || '';
    const title = $(el).attr('title') || $(el).text().trim() || '';
    if (href.startsWith(NKIRI_BASE) && !/\/(page|category|tag|search)\//i.test(href)) {
      links.push({ href, title: title.slice(0, 80) });
    }
  });
  console.log(`${sel}: ${links.length} links`);
  if (links.length > 0 && allLinks.length === 0) {
    allLinks = links;
    links.slice(0, 3).forEach(l => console.log('  -', l.href));
  }
}

console.log('\nTotal unique links found:', allLinks.length);

// Test softTitleMatch
function softTitleMatch(title, query) {
  if (!title || !query) return true;
  const titleLower = title.toLowerCase();
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
  return queryWords.every(word => titleLower.includes(word));
}

const filtered = allLinks.filter(l => softTitleMatch(l.title, query));
console.log('After softTitleMatch filter:', filtered.length);
filtered.slice(0, 3).forEach(l => console.log('  -', l.title));
