import { preflight, ok, fail } from './lib/http.js';

export default async function handler(req, res) {
  if (preflight(req, res, { methods: ['POST'] })) return;

  const { query, source = 'youtube' } = req.body || {};

  if (!query) {
    return fail(res, 400, 'Query required');
  }

  try {
    const results = [];

    if (source === 'youtube') {
      const apiKey = process.env.YOUTUBE_API_KEY || process.env.VITE_YOUTUBE_API_KEY;

      if (!apiKey) {
        return fail(res, 500, 'YouTube API key not configured');
      }

      const ytRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?` +
          `part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=12&key=${apiKey}`
      );

      if (!ytRes.ok) {
        const errBody = await ytRes.json().catch(() => ({}));
        throw new Error(errBody?.error?.message || `YouTube API responded with HTTP ${ytRes.status}`);
      }

      const ytData = await ytRes.json();

      results.push(
        ...(ytData.items || []).map((item) => ({
          id: item.id.videoId,
          title: item.snippet.title,
          thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
          channel: item.snippet.channelTitle,
          published: item.snippet.publishedAt,
          url: `https://youtube.com/watch?v=${item.id.videoId}`,
          source: 'youtube',
        }))
      );
    } else {
      return fail(res, 400, `Unknown source "${source}"`);
    }

    return ok(res, {
      success: true,
      query,
      count: results.length,
      results,
    });
  } catch (err) {
    console.error('Search error:', err);
    return fail(res, 502, err.message);
  }
}
