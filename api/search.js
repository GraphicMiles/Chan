import { sendResponse } from './lib/response.js';

export default async function handler(req, res) {
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

  const { query, source = 'youtube' } = req.body || {};
  
  if (!query) {
    return sendResponse(res, 400, { error: 'Query required' });
  }

  try {
    const results = [];

    if (source === 'youtube') {
      const apiKey = process.env.VITE_YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY;
      
      if (!apiKey) {
        return sendResponse(res, 500, { error: 'YouTube API key not configured' });
      }

      const ytRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?` +
        `part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=12&key=${apiKey}`
      );
      
      const ytData = await ytRes.json();
      
      results.push(...(ytData.items || []).map(item => ({
        id: item.id.videoId,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
        channel: item.snippet.channelTitle,
        published: item.snippet.publishedAt,
        url: `https://youtube.com/watch?v=${item.id.videoId}`,
        source: 'youtube'
      })));
    }

    return sendResponse(res, 200, {
      success: true,
      query,
      count: results.length,
      results
    });

  } catch (err) {
    console.error('Search error:', err);
    return sendResponse(res, 500, { error: err.message });
  }
}
