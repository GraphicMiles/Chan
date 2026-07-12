import { preflight, ok, fail } from './lib/http.js'

const OMDB_BASE = 'https://www.omdbapi.com'

async function searchOMDb(query, apiKey) {
  const url = `${OMDB_BASE}/?apikey=${apiKey}&s=${encodeURIComponent(query)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`OMDb error: ${res.status}`)
  const data = await res.json()
  if (data.Response === 'False') return { results: [], count: 0 }
  const results =
    data.Search?.map((it) => ({
      title: it.Title,
      image: it.Poster !== 'N/A' ? it.Poster : null,
      link: `https://www.imdb.com/title/${it.imdbID}`,
      meta: `${it.Type} • ${it.Year}`,
      source: 'imdb',
    })) || []
  return { results, count: results.length }
}

async function searchYouTube(query, apiKey) {
  const params = new URLSearchParams({
    part: 'snippet',
    q: query,
    type: 'video',
    maxResults: '20',
    key: apiKey,
  })
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`)
  if (!res.ok) throw new Error(`YouTube error: ${res.status}`)
  const data = await res.json()
  const results =
    data.items?.map((it) => ({
      id: it.id.videoId,
      title: it.snippet.title,
      thumbnail:
        it.snippet.thumbnails?.high?.url ||
        it.snippet.thumbnails?.medium?.url ||
        it.snippet.thumbnails?.default?.url,
      channel: it.snippet.channelTitle,
      published: it.snippet.publishedAt,
      url: `https://www.youtube.com/watch?v=${it.id.videoId}`,
      source: 'youtube',
    })) || []
  return { results, count: results.length }
}

export default async function handler(req, res) {
  if (preflight(req, res)) return
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed')

  try {
    const { query, source = 'youtube' } = req.body || {}
    if (!query) return fail(res, 400, 'Query is required')

    let data
    if (source === 'omdb') {
      const key = process.env.OMDB_API_KEY
      if (!key) return fail(res, 500, 'OMDb API key not configured')
      data = await searchOMDb(query, key)
    } else if (source === 'youtube') {
      const key = process.env.YOUTUBE_API_KEY || process.env.VITE_YOUTUBE_API_KEY
      if (!key) return fail(res, 500, 'YouTube API key not configured')
      data = await searchYouTube(query, key)
    } else {
      return fail(res, 400, `Unknown source "${source}"`)
    }

    return ok(res, { query, source, count: data.count, results: data.results })
  } catch (e) {
    return fail(res, 500, e.message || 'Search failed')
  }
}
