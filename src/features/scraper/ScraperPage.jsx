import React, { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import styles from './ScraperPage.module.scss'
import { useUnifiedSearch } from '../../hooks/useUnifiedSearch.js'
import { isDirectVideoUrl, normalizePlaybackUrl } from '../../shared/lib/youtube.js'

const SITES = [
  { key: 'nkiri', label: 'Nkiri' },
  { key: 'netnaija', label: 'NetNaija' },
  { key: 'fzmovies', label: 'FZMovies' },
  { key: 'o2tv', label: 'O2TV Series' },
  { key: 'custom', label: 'Custom URL' },
]

export default function ScraperPage() {
  const navigate = useNavigate()
  const { results, loading, error, clear, search } = useUnifiedSearch()
  const [url, setUrl] = useState('')
  const [query, setQuery] = useState('')
  const [site, setSite] = useState('custom')
  const [showDirectOnly, setShowDirectOnly] = useState(false)

  const handleUrlChange = useCallback((e) => {
    const value = e.target.value
    setUrl(value)
    if (value && isDirectVideoUrl(value)) {
      toast.info('Direct video URL detected!', { autoClose: 2000 })
    }
  }, [])

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault()
    const trimmedUrl = url.trim()
    
    if (!trimmedUrl && !query.trim()) {
      toast.error('Please enter a URL or search query')
      return
    }

    // Direct video URL - go straight to create
    if (isDirectVideoUrl(trimmedUrl)) {
      const normalized = normalizePlaybackUrl(trimmedUrl)
      const title = normalized.split('/').pop()?.replace(/\.(mp4|m3u8|mkv|avi|mov|webm|ogg|flv)$/i, '') || 'Video'
      navigate(`/create?videoUrl=${encodeURIComponent(normalized)}&title=${encodeURIComponent(title)}&type=direct`)
      return
    }

    // Use unified search with 'direct' layer and honor the selected source.
    await search({
      layer: 'direct',
      query: query.trim() || trimmedUrl,
      options: { site: site === 'custom' ? undefined : site },
    })
  }, [url, query, search, navigate])

  const handleResultClick = useCallback((result) => {
    const resultUrl = result.url || result.link
    if (!resultUrl) {
      toast.error('No URL available for this result')
      return
    }

    if (result.isDirect || isDirectVideoUrl(resultUrl)) {
      navigate(`/create?videoUrl=${encodeURIComponent(resultUrl)}&title=${encodeURIComponent(result.title || 'Video')}&type=direct`)
    } else {
      setUrl(resultUrl)
      clear()
      toast.info('Loaded page URL. Click Extract to find videos.')
    }
  }, [navigate, clear])

  const handlePlayDirect = useCallback((result) => {
    const resultUrl = result.url || result.link
    if (resultUrl) {
      navigate(`/create?videoUrl=${encodeURIComponent(resultUrl)}&title=${encodeURIComponent(result.title || 'Video')}&type=direct`)
    }
  }, [navigate])

  const filteredResults = results.filter((r) => {
    if (!showDirectOnly) return true
    return r.isDirect || isDirectVideoUrl(r.url || r.link)
  })

  const directCount = results.filter((r) => r.isDirect || isDirectVideoUrl(r.url || r.link)).length
  const isDirectInput = isDirectVideoUrl(url)

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <h1>Video Scraper</h1>
        <p className={styles.subtitle}>Extract video links from movie/series sites or paste a direct .mp4/.m3u8 link</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.row}>
            <div className={styles.field}>
              <label htmlFor="site">Site</label>
              <select id="site" value={site} onChange={(e) => setSite(e.target.value)}>
                {SITES.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="url">
              Page URL or Direct Video Link
              {isDirectInput && <span className={styles.directIndicator}> - Direct Video Detected</span>}
            </label>
            <input
              id="url"
              type="url"
              value={url}
              onChange={handleUrlChange}
              placeholder="https://example.com/movie-page or https://cdn.com/video.mp4"
              className={isDirectInput ? styles.directInput : ''}
            />
            {isDirectInput && (
              <div className={styles.directHint}>
                This is a direct video link. Click "Extract Links" to create a room with it.
              </div>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor="query">Search Query (optional)</label>
            <input
              id="query"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Movie title (if searching)"
            />
          </div>

          <div className={styles.actions}>
            <button type="submit" disabled={loading || (!url.trim() && !query.trim())} className={styles.primary}>
              {loading ? 'Extracting...' : isDirectInput ? 'Create Room with Video' : 'Extract Links'}
            </button>
            <button type="button" onClick={clear} disabled={loading || (results.length === 0 && !url && !query)}>
              Clear
            </button>
          </div>
        </form>

        {error && <div className={styles.error}><strong>Error:</strong> {error}</div>}

        {results.length > 0 && (
          <div className={styles.results}>
            <div className={styles.resultsHeader}>
              <h2>
                Found {results.length} result{results.length !== 1 ? 's' : ''}
                {directCount > 0 && <span className={styles.directCount}> ({directCount} direct)</span>}
              </h2>
              <label className={styles.filter}>
                <input type="checkbox" checked={showDirectOnly} onChange={(e) => setShowDirectOnly(e.target.checked)} />
                Show direct files only
              </label>
            </div>

            {results.length > 0 && directCount === 0 && (
              <div className={styles.hint}>
                No direct video files found. These are page links - click one to open and extract further.
              </div>
            )}

            <div className={styles.grid}>
              {filteredResults.map((result, index) => {
                const isPlayable = result.isDirect || isDirectVideoUrl(result.url || result.link)
                return (
                  <div key={index} className={`${styles.card} ${isPlayable ? styles.playable : ''}`}>
                    {result.image && (
                      <div className={styles.thumbnail}>
                        <img src={result.image} alt={result.title} loading="lazy" />
                      </div>
                    )}
                    <div className={styles.content}>
                      <h3>{result.title}</h3>
                      <div className={styles.meta}>
                        {result.quality && <span className={styles.quality}>{result.quality}</span>}
                        {isPlayable ? <span className={styles.badgeDirect}>Direct</span> : <span className={styles.badgePage}>Page</span>}
                        {result.source && <span className={styles.source}>{result.source}</span>}
                      </div>
                      {result.meta && <div className={styles.metaText}>{result.meta}</div>}
                      <div className={styles.urlPreview}>{(result.url || result.link || '').slice(0, 50)}...</div>
                    </div>
                    <div className={styles.cardActions}>
                      {isPlayable ? (
                        <button onClick={() => handlePlayDirect(result)} className={styles.playBtn}>Watch in Room</button>
                      ) : (
                        <>
                          <button onClick={() => handleResultClick(result)} className={styles.openBtn}>Open Page</button>
                          <a href={result.url || result.link} target="_blank" rel="noopener noreferrer" className={styles.visitLink}>Visit ↗</a>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {results.length === 0 && !loading && !error && url && isDirectInput && (
          <div className={styles.quickAction}>
            <p>This URL is a direct video file and can be played immediately.</p>
            <button
              onClick={() => navigate(`/create?videoUrl=${encodeURIComponent(normalizePlaybackUrl(url))}&title=${encodeURIComponent(url.split('/').pop()?.replace(/\.(mp4|m3u8|mkv|avi|mov|webm|ogg|flv)$/i, '') || 'Video')}&type=direct`)}
              className={styles.primary}
            >
              Create Room Now
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
