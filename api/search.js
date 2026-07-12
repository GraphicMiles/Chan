// api/search.js — YouTube + Aggregator Search
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { query, source = 'youtube' } = req.body || {};
  
  if (!query) return res.status(400).json({ error: 'Query required' });

  try {
    const results = [];

    if (source === 'youtube') {
      const apiKey = process.env.VITE_YOUTUBE_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'YouTube API key not configured' });
      }

      const ytRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=12&key=${apiKey}`
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

    return res.status(200).json({
      success: true,
      query,
      count: results.length,
      results
    });

  } catch (err) {
    console.error('Search error:', err);
    return res.status(500).json({ error: err.message });
  }
}
