import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import styles from './UnifiedSearch.module.scss'
import { useUnifiedSearch } from '../../hooks/useUnifiedSearch'
import { useAuth } from '../../shared/auth/hooks/useAuth.jsx'
import { isDirectVideoUrl, isMixedContentUrl, normalizeDirectUrl, normalizePlaybackUrl } from '../../shared/lib/youtube.js'

const SEARCH_LAYERS = [
  { id: 'youtube', label: 'YouTube', icon: '▶️', color: '#FF0000', placeholder: 'Search YouTube videos...', description: 'Search millions of YouTube videos' },
  { id: 'direct', label: 'Direct Links', icon: '🔗', color: '#4CAF50', placeholder: 'Search movies/shows or paste URL...', description: 'Find direct MP4/M3U8 links from movie sites' },
  { id: 'iptv', label: 'Live TV', icon: '📺', color: '#2196F3', placeholder: 'Search channels (CNN, ESPN, HBO)...', description: 'Watch live TV channels and streams' },
  { id: 'sports', label: 'Sports', icon: '⚽', color: '#FF9800', placeholder: 'Search team, league, or match...', description: 'Find live sports matches and events' },
  { id: 'nsfw', label: 'NSFW', icon: '🔞', color: '#E91E63', placeholder: 'Search adult content (18+ only)...', description: 'Adult content - verification required', adult: true },
]

export default function UnifiedSearch() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const [activeLayer, setActiveLayer] = useState('youtube')
  const [query, setQuery] = useState('')
  const [adultVerified, setAdultVerified] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({ hdOnly: false, liveOnly: false })
  
  const { results, loading, error, search, clear, hasMore, loadMore } = useUnifiedSearch()
  
  const currentLayer = useMemo(() => SEARCH_LAYERS.find(l => l.id === activeLayer), [activeLayer])

  const handleSearch = useCallback(async (e) => {
    e?.preventDefault()
    if (!query.trim()) {
      toast.error('Please enter a search query')
      return
    }
    
    // Age verification for NSFW. Use the local value immediately because
    // React state updates are asynchronous.
    let verified = adultVerified
    if (activeLayer === 'nsfw' && !verified) {
      const confirmed = window.confirm('This content is for adults 18+ only. By clicking OK, you confirm you are of legal age to view adult content.')
      if (!confirmed) {
        toast.info('Age verification required')
        return
      }
      verified = true
      setAdultVerified(true)
    }
    
    await search({ 
      layer: activeLayer, 
      query: query.trim(),
      options: { 
        adultVerified: verified,
        filters: showFilters ? filters : undefined
      }
    })
  }, [activeLayer, query, adultVerified, filters, showFilters, search])

  const handleLoadMore = useCallback(() => {
    if (hasMore && !loading) {
      loadMore()
    }
  }, [hasMore, loading, loadMore])

  // Keyboard shortcut: Ctrl+K to focus search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault()
        document.getElementById('unified-search-input')?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleResultSelect = useCallback((result) => {
    // YouTube rooms should receive the video ID, not a watch-page URL. The
    // create-room page can then validate and persist videoId correctly.
    if ((result.type || activeLayer) === 'youtube' && result.id) {
      const params = new URLSearchParams({
        video: result.id,
        title: result.title || 'Untitled',
        type: 'youtube',
      })
      navigate(`/create?${params.toString()}`)
      return
    }

    const resultUrl = result.url || result.link
    const playable = result.isDirect || isDirectVideoUrl(resultUrl)
    if (!resultUrl || !playable) {
      toast.error('This result is not a playable video stream')
      return
    }
    const playbackUrl = normalizePlaybackUrl(resultUrl)
    if (isMixedContentUrl(playbackUrl)) {
      toast.error('This HTTP stream is blocked by the secure app. Choose an HTTPS source.')
      return
    }

    const params = new URLSearchParams({
      videoUrl: playbackUrl,
      title: result.title || 'Untitled',
      type: result.type === 'iptv' || result.type === 'sports' ? result.type : 'direct',
      thumbnail: result.thumbnail || '',
    })
    
    if (result.matchInfo) params.set('matchInfo', JSON.stringify(result.matchInfo))
    if (result.isLive) params.set('isLive', 'true')
    
    navigate(`/create?${params.toString()}`)
  }, [navigate, activeLayer])

  const handleDirectUrlSubmit = useCallback(() => {
    if (isDirectVideoUrl(query)) {
      const normalized = normalizePlaybackUrl(query.trim())
      if (isMixedContentUrl(normalized)) {
        toast.error('This HTTP stream is blocked by the secure app. Choose an HTTPS source.')
        return
      }
      const title = normalized.split('/').pop()?.replace(/\.(mp4|m3u8|mkv|avi|mov|webm|ogg|flv|ts)$/i, '') || 'Direct Video'
      navigate(`/create?videoUrl=${encodeURIComponent(normalized)}&title=${encodeURIComponent(title)}&type=direct`)
    }
  }, [query, navigate])

  const clearSearch = useCallback(() => {
    setQuery('')
    clear()
    document.getElementById('unified-search-input')?.focus()
  }, [clear])

  const filteredResults = useMemo(() => {
    if (!showFilters) return results
    
    return results.filter(r => {
      if (filters.hdOnly && !['720p', '1080p', '4K', 'HD'].some(q => (r.quality || '').includes(q))) {
        return false
      }
      if (filters.liveOnly && !r.isLive) {
        return false
      }
      return true
    })
  }, [results, filters, showFilters])

  if (authLoading) return <div className={styles.loading}>Loading…</div>
  if (!user) return <Navigate to="/auth" replace />

  return (
    <div className={styles.unifiedSearch}>
      <div className={styles.header}>
        <h1>Find Something to Watch</h1>
        <p className={styles.subtitle}>Search across YouTube, movie sites, live TV, sports, and more</p>
      </div>
      
      {/* Layer Tabs */}
      <div className={styles.layerTabs}>
        {SEARCH_LAYERS.map(layer => (
          <button
            key={layer.id}
            className={`${styles.tab} ${activeLayer === layer.id ? styles.active : ''} ${layer.adult ? styles.adult : ''}`}
            onClick={() => {
              setActiveLayer(layer.id)
              clear()
              setQuery('')
            }}
            style={{ 
              borderColor: activeLayer === layer.id ? layer.color : 'transparent',
              backgroundColor: activeLayer === layer.id ? `${layer.color}20` : undefined
            }}
          >
            <span className={styles.icon}>{layer.icon}</span>
            <span className={styles.label}>{layer.label}</span>
            {layer.adult && <span className={styles.adultBadge}>18+</span>}
          </button>
        ))}
      </div>

      {/* Layer Description */}
      <div className={styles.layerInfo} style={{ borderLeftColor: currentLayer?.color }}>
        <p>{currentLayer?.description}</p>
      </div>

      {/* Search Input */}
      <form onSubmit={handleSearch} className={styles.searchForm}>
        <div className={styles.inputWrapper}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            id="unified-search-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={currentLayer?.placeholder || 'Search...'}
            className={styles.searchInput}
            disabled={loading}
          />
          {query && (
            <button type="button" className={styles.clearBtn} onClick={clearSearch}>
              ✕
            </button>
          )}
          <button 
            type="submit" 
            disabled={loading || !query.trim()}
            className={styles.searchBtn}
          >
            {loading ? <span className={styles.spinner}></span> : 'Search'}
          </button>
          {isDirectVideoUrl(query) && (
            <button 
              type="button" 
              onClick={handleDirectUrlSubmit}
              className={styles.directBtn}
            >
              Play Direct
            </button>
          )}
        </div>
        
        {/* Filters Toggle */}
        <div className={styles.filterToggle}>
          <button type="button" onClick={() => setShowFilters(!showFilters)}>
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
        </div>
        
        {/* Filters */}
        {showFilters && (
          <div className={styles.filters}>
            <label>
              <input 
                type="checkbox" 
                checked={filters.hdOnly} 
                onChange={(e) => setFilters(f => ({ ...f, hdOnly: e.target.checked }))}
              />
              HD Only (720p+)
            </label>
            <label>
              <input 
                type="checkbox" 
                checked={filters.liveOnly} 
                onChange={(e) => setFilters(f => ({ ...f, liveOnly: e.target.checked }))}
              />
              Live Only
            </label>
          </div>
        )}
      </form>

      {/* Error */}
      {error && (
        <div className={styles.error}>
          <strong>Error:</strong> {error}
          <button onClick={() => search({ layer: activeLayer, query, options: { adultVerified } })}>
            Retry
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && results.length === 0 && (
        <div className={styles.loading}>
          <div className={styles.spinnerLarge}></div>
          <p>Searching {currentLayer?.label}...</p>
        </div>
      )}

      {/* Results */}
      {filteredResults.length > 0 && (
        <div className={styles.results}>
          <div className={styles.resultsHeader}>
            <h2>
              {filteredResults.length} result{filteredResults.length !== 1 ? 's' : ''} 
              {results.length !== filteredResults.length && ` (filtered from ${results.length})`}
            </h2>
            <div className={styles.resultActions}>
              <button onClick={clear} className={styles.clearAll}>Clear All</button>
            </div>
          </div>

          <div className={styles.resultsGrid}>
            {filteredResults.map((result, idx) => (
              <div 
                key={`${result.id || result.url || idx}`}
                className={`${styles.resultCard} ${styles[result.type || activeLayer]} ${result.isLive ? styles.live : ''}`}
                onClick={() => handleResultSelect(result)}
              >
                {/* Thumbnail */}
                <div className={styles.thumbnail}>
                  {result.thumbnail ? (
                    <img src={result.thumbnail} alt={result.title} loading="lazy" />
                  ) : (
                    <div className={styles.noThumbnail}>{currentLayer?.icon}</div>
                  )}
                  
                  {/* Overlays */}
                  {result.duration && (
                    <span className={styles.duration}>{result.duration}</span>
                  )}
                  {result.isLive && (
                    <span className={styles.liveBadge}>● LIVE</span>
                  )}
                  {result.quality && (
                    <span className={styles.qualityBadge}>{result.quality}</span>
                  )}
                  {result.isNSFW && (
                    <span className={styles.nsfwBadge}>18+</span>
                  )}
                </div>
                
                {/* Info */}
                <div className={styles.info}>
                  <h3 className={styles.title} title={result.title}>
                    {result.title}
                  </h3>
                  
                  <div className={styles.meta}>
                    {result.channel && (
                      <span className={styles.channel}>{result.channel}</span>
                    )}
                    {result.source && (
                      <span className={styles.source}>{result.source}</span>
                    )}
                    {result.views && (
                      <span className={styles.views}>
                        {parseInt(result.views).toLocaleString()} views
                      </span>
                    )}
                    {result.year && (
                      <span className={styles.year}>{result.year}</span>
                    )}
                  </div>

                  {result.description && (
                    <p className={styles.description}>{result.description.slice(0, 120)}...</p>
                  )}

                  {/* Sports-specific info */}
                  {activeLayer === 'sports' && result.matchInfo && (
                    <div className={styles.matchInfo}>
                      <div className={styles.teams}>{result.matchInfo.teams}</div>
                      <div className={styles.matchDetails}>
                        <span className={styles.time}>{result.matchInfo.time}</span>
                        <span className={styles.competition}>{result.matchInfo.competition}</span>
                        {result.isLive && <span className={styles.liveIndicator}>● LIVE NOW</span>}
                      </div>
                      {result.channelCandidates?.length > 0 && (
                        <div className={styles.candidates}>
                          Candidate channels: {result.channelCandidates.join(', ')}
                        </div>
                      )}
                      {result.channelAvailable === false && (
                        <div className={styles.noChannel}>No mapped IPTV channel for this fixture</div>
                      )}
                    </div>
                  )}

                  {/* IPTV-specific info */}
                  {activeLayer === 'iptv' && result.program && (
                    <div className={styles.program}>
                      <div className={styles.nowPlaying}>
                        <span className={styles.label}>Now:</span> {result.program.now}
                      </div>
                      {result.program.next && (
                        <div className={styles.next}>
                          <span className={styles.label}>Next:</span> {result.program.next}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className={styles.actions}>
                  <button 
                    className={`${styles.watchBtn} ${result.isLive ? styles.liveBtn : ''}`}
                    disabled={result.channelAvailable === false}
                  >
                    {result.isLive ? 'Watch Live' : 'Watch in Room'}
                  </button>
                  {(result.url || result.link) && (
                    <a 
                      href={result.url || result.link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className={styles.externalLink}
                      onClick={(e) => e.stopPropagation()}
                    >
                      ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Load More */}
          {hasMore && (
            <div className={styles.loadMore}>
              <button onClick={handleLoadMore} disabled={loading}>
                {loading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredResults.length === 0 && query && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🔍</div>
          <h3>No results found</h3>
          <p>No {currentLayer?.label} results for "{query}"</p>
          {activeLayer === 'nsfw' && !adultVerified && (
            <p className={styles.verifyPrompt}>Age verification required for NSFW content</p>
          )}
          <button onClick={() => { setQuery(''); document.getElementById('unified-search-input')?.focus(); }}>
            Clear Search
          </button>
        </div>
      )}

      {/* Initial State */}
      {!query && !loading && results.length === 0 && (
        <div className={styles.initial}>
          <div className={styles.initialIcon}>{currentLayer?.icon}</div>
          <h3>Start Searching</h3>
          <p>Enter a query above to search {currentLayer?.label}</p>
          <div className={styles.tips}>
            <p>Tips:</p>
            <ul>
              <li>Use specific titles for better results</li>
              <li>For direct links, you can paste a full URL</li>
              <li>Press Ctrl+K to quickly focus the search box</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
    }
