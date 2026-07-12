// Main scraping endpoint - POST /api/scrapeMedia
import { sendResponse } from './lib/response.js';
import { getDb } from './lib/firebaseAdmin.js';
import { scraper } from './lib/scraper.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendResponse(res, 405, { error: 'Method not allowed' });
  }

  const { url, site, roomId } = req.body || {};
  
  if (!url || !site) {
    return sendResponse(res, 400, { error: 'url and site required' });
  }

  try {
    const db = getDb();
    const html = await scraper.fetchHTML(url);
    const $ = cheerio.load(html);
    
    const config = scraper.getSiteConfig(site);
    if (!config) {
      return sendResponse(res, 400, { error: 'Unknown site config' });
    }

    const results = scraper.parseMovies($, config);
    
    // Store in Firestore if roomId provided
    if (roomId && results.length > 0) {
      const batch = db.batch();
      const scrapeRef = db.collection('scrapes').doc();
      
      batch.set(scrapeRef, {
        roomId,
        url,
        site,
        results,
        createdAt: new Date(),
        resultCount: results.length
      });
      
      await batch.commit();
    }

    return sendResponse(res, 200, { 
      success: true, 
      count: results.length,
      results: results.slice(0, 20) // Limit response
    });

  } catch (err) {
    console.error('Scrape error:', err);
    return sendResponse(res, 500, { error: err.message });
  }
}