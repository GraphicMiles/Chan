// Search aggregator - POST /api/searchMedia
import { sendResponse } from './lib/response.js';
import { getDb } from './lib/firebaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendResponse(res, 405, { error: 'Method not allowed' });
  }

  const { query, sources = ['youtube'] } = req.body || {};
  
  if (!query) {
    return sendResponse(res, 400, { error: 'Query required' });
  }

  try {
    const results = [];
    
    // YouTube Data API search (using your existing VITE_YOUTUBE_API_KEY)
    if (sources.includes('youtube')) {
      const ytResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/search?` +
        `part=snippet&q=${encodeURIComponent(query)}&` +
        `type=video&maxResults=10&key=${process.env.VITE_YOUTUBE_API_KEY}`
      );
      const ytData = await ytResponse.json();
      
      results.push(...(ytData.items || []).map(item => ({
        source: 'youtube',
        id: item.id.videoId,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails.medium?.url,
        channel: item.snippet.channelTitle,
        publishedAt: item.snippet.publishedAt
      })));
    }

    return sendResponse(res, 200, { 
      success: true,
      query,
      count: results.length,
      results 
    });

  } catch (err) {
    return sendResponse(res, 500, { error: err.message });
  }
}