import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import {
  PlayCircle, Link2, Tv, Trophy, ShieldAlert, Search, X, Play,
  ArrowUpRight, SlidersHorizontal, Clock, Eye, Radio, Film,
  AlertCircle, Loader2
} from 'lucide-react'
import styles from './UnifiedSearch.module.scss'
import { useUnifiedSearch } from '../../hooks/useUnifiedSearch'
import { useAuth } from '../../shared/auth/hooks/useAuth.jsx'
import { isDirectVideoUrl, normalizePlaybackUrl } from '../../shared/lib/youtube.js'
import { Modal, Button } from '../../shared/ui/index.js'

const SEARCH_LAYERS = [
  { id: 'youtube', label: 'YouTube', icon: PlayCircle, placeholder: 'Search YouTube videos...', description: 'Search millions of YouTube videos with instant playback' },
  { id: 'direct', label: 'Direct Links', icon: Link2, placeholder: 'Search movies/shows or paste direct URL (.mp4/.m3u8)...', description: 'Find direct MP4/M3U8 links from top movie and series sites' },
  { id: 'iptv', label: 'Live TV', icon: Tv, placeholder: 'Search channels (CNN, ESPN, HBO)...', description: 'Watch live TV channels and 24/7 streaming networks' },
  { id: 'sports', label: 'Sports', icon: Trophy, placeholder: 'Search team, league, or match...', description: 'Find live sports matches, scores, and streaming fixtures' },
  { id: 'nsfw', label: 'NSFW', icon: ShieldAlert, placeholder: 'Search adult content (18+ only)...', description: 'Adult content - legal age verification required', adult: true },
]

const TRENDING_SUGGESTIONS = {
  youtube: ['Top 10 Movies 2026', 'House of the Dragon', 'Alan Walker Stay', 'Afrobeats Hits', 'Burn', 'Silo Season 3', 'Burna Boy Live', 'Gaming Highlights'],
  direct: ['House of the Dragon', 'Silo Season 2', 'Squid Game Season 2', 'The Last of Us', 'Stranger Things', 'Deadpool & Wolverine', 'Gladiator 2', 'Dune Part Two'],
  iptv: ['CNN News Live', 'ESPN Sports 24/7', 'HBO HD Channel', 'BBC World News', 'Sky Sports Live', 'Discovery Channel', 'Al Jazeera Live News'],
  sports: ['Premier League Highlights', 'Real Madrid vs Barcelona', 'Arsenal vs Chelsea', 'Champions League Goals', 'NBA Finals Live', 'Formula 1 Grand Prix'],
  nsfw: ['Trending Scenes', 'College Action 2026', 'Yoga Studio Scene', 'After Class Party', 'Summer Vacation', 'Weekend Party HD'],
}

export default function UnifiedSearch() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const [activeLayer, setActiveLayer] = useState('youtube')
  const [query, setQuery] = useState('')
  const [adultVerified, setAdultVerified] = useState(false)
  const [showNsfwModal, setShowNsfwModal] = useState(false)
  const [pendingNsfwAction, setPendingNsfwAction] = useState(null)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({ hdOnly: false, liveOnly: false })
  
  const { results, loading, error, search, clear, hasMore, loadMore, searchMeta } = useUnifiedSearch()
  
  const currentLayer = useMemo(() => SEARCH_LAYERS.find(l => l.id === activeLayer), [activeLayer])
  const CurrentLayerIcon = currentLayer?.icon || Film

  const runSearchWithVerification = useCallback(async (verifiedState, targetQuery = query.trim()) => {
    if (!targetQuery) {
      toast.error('Please enter a search query')
      return
    }
    await search({ 
      layer: activeLayer, 
      query: targetQuery,
      options: { 
        adultVerified: verifiedState,
        filters: showFilters ? filters : undefined,
        resolve: activeLayer === 'direct' || activeLayer === 'nsfw'
      }
    })
  }, [activeLayer, query, filters, showFilters, search])

  const handleSearch = useCallback(async (e) => {
    e?.preventDefault()
    if (!query.trim()) {
      toast.error('Please enter a search query')
      return
    }
    
    if (activeLayer === 'nsfw' && !adultVerified) {
      setPendingNsfwAction({ type: 'search' })
      setShowNsfwModal(true)
      return
    }
    
    await runSearchWithVerification(adultVerified, query.trim())
  }, [activeLayer, query, adultVerified, runSearchWithVerification])

  const handleTrendingClick = useCallback((item) => {
    setQuery(item)
    if (activeLayer === 'nsfw' && !adultVerified) {
      setPendingNsfwAction({ type: 'trending', query: item })
      setShowNsfwModal(true)
      return
    }
    runSearchWithVerification(adultVerified, item)
  }, [activeLayer, adultVerified, runSearchWithVerification])

  const handleLayerClick = useCallback((layerId) => {
    if (layerId === 'nsfw' && !adultVerified) {
      setPendingNsfwAction({ type: 'tab' })
      setShowNsfwModal(true)
      return
    }
    setActiveLayer(layerId)
    clear()
    setQuery('')
  }, [adultVerified, clear])

  const handleNsfwConfirm = useCallback(() => {
    setAdultVerified(true)
    setShowNsfwModal(false)
    if (pendingNsfwAction?.type === 'tab') {
      setActiveLayer('nsfw')
      clear()
      setQuery('')
    } else if (pendingNsfwAction?.type === 'search') {
      runSearchWithVerification(true, query.trim())
    } else if (pendingNsfwAction?.type === 'trending' && pendingNsfwAction.query) {
      runSearchWithVerification(true, pendingNsfwAction.query)
    }
    setPendingNsfwAction(null)
  }, [pendingNsfwAction, query, clear, runSearchWithVerification])

  const handleNsfwCancel = useCallback(() => {
    setShowNsfwModal(false)
    setPendingNsfwAction(null)
    if (activeLayer === 'nsfw' && !adultVerified) {
      setActiveLayer('youtube')
      clear()
      setQuery('')
    }
  }, [activeLayer, adultVerified, clear])

  const handleLoadMore = useCallback(() => {
    if (hasMore && !loading) {
      loadMore()
    }
  }, [hasMore, loading, loadMore])

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
    if (result.requiresUserAction && resultUrl) {
      window.open(resultUrl, '_blank', 'noopener,noreferrer')
      toast.info('The provider requires a normal download step. Complete it there, then paste the final HTTPS URL into Chan if needed.')
      return
    }
    const playable = result.isDirect || isDirectVideoUrl(resultUrl)
    if (!resultUrl || !playable) {
      toast.error('This result is not a playable video stream')
      return
    }
    const playbackUrl = normalizePlaybackUrl(resultUrl)
    const thumb = result.thumbnail || result.image || ''
    const params = new URLSearchParams({
      videoUrl: playbackUrl,
      title: result.title || 'Untitled',
      type: ['iptv', 'sports', 'nsfw'].includes(result.type) ? result.type : 'direct',
      thumbnail: thumb,
    })
    
    if (result.matchInfo) params.set('matchInfo', JSON.stringify(result.matchInfo))
    if (result.isLive) params.set('isLive', 'true')
    
    navigate(`/create?${params.toString()}`)
  }, [navigate, activeLayer])

  const handleDirectUrlSubmit = useCallback(() => {
    if (isDirectVideoUrl(query)) {
      const normalized = normalizePlaybackUrl(query.trim())
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

  if (authLoading) return <div className={styles.loading}>Loading...</div>
  if (!user) return <Navigate to="/auth" replace />

  return (
    <div className={styles.unifiedSearch}>
      <div className={styles.header}>
        <h1>Find Something to Watch</h1>
        <p className={styles.subtitle}>Search across YouTube, movie sites, live TV, sports, and more</p>
      </div>
      
      <div className={styles.layerTabs}>
        {SEARCH_LAYERS.map(layer => {
          const LayerIcon = layer.icon
          return (
            <button
              key={layer.id}
              type="button"
              className={`${styles.tab} ${activeLayer === layer.id ? styles.active : ''} ${layer.adult ? styles.adult : ''}`}
              onClick={() => handleLayerClick(layer.id)}
            >
              <LayerIcon size={16} />
              <span className={styles.label}>{layer.label}</span>
              {layer.adult && <span className={styles.adultBadge}>18+</span>}
            </button>
          )
        })}
      </div>

      <div className={styles.layerInfo}>
        <CurrentLayerIcon size={16} className={styles.layerIcon} />
        <p>{currentLayer?.description}</p>
      </div>

      <form onSubmit={handleSearch} className={styles.searchForm}>
        <div className={styles.searchBarWrapper}>
          <div className={styles.inputInner}>
            <Search size={18} className={styles.searchIcon} />
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
              <button type="button" className={styles.clearBtn} onClick={clearSearch} title="Clear search">
                <X size={16} />
              </button>
            )}
          </div>
          
          <div className={styles.searchButtonsRow}>
            <button 
              type="submit" 
              disabled={loading || !query.trim()}
              className={styles.searchBtn}
            >
              <Search size={16} />
              <span>Search</span>
            </button>
            
            {isDirectVideoUrl(query) && (
              <button 
                type="button" 
                onClick={handleDirectUrlSubmit}
                className={styles.directBtn}
              >
                <Play size={14} />
                <span>Play Direct</span>
              </button>
            )}
          </div>
        </div>

        {!query && (
          <div className={styles.trendingContainer}>
            <span className={styles.trendingHeader}>Trending</span>
            <div className={styles.trendingPills}>
              {(TRENDING_SUGGESTIONS[activeLayer] || TRENDING_SUGGESTIONS.youtube).map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={styles.trendingPill}
                  onClick={() => handleTrendingClick(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        )}
        
        <div className={styles.filterToggle}>
          <button type="button" onClick={() => setShowFilters(!showFilters)}>
            <SlidersHorizontal size={14} />
            <span>{showFilters ? 'Hide Filters' : 'Show Filters'}</span>
          </button>
        </div>
        
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

      {error && (
        <div className={styles.error}>
          <AlertCircle size={16} />
          <span>{error}</span>
          <button type="button" onClick={() => search({ layer: activeLayer, query, options: { adultVerified } })}>
            Retry
          </button>
        </div>
      )}

      {loading && results.length === 0 && (
        <div className={styles.loading}>
          <Loader2 size={32} className={styles.spinnerLarge} />
          <p>Searching {currentLayer?.label}...</p>
        </div>
      )}

      {filteredResults.length > 0 && (
        <div className={styles.results}>
          <div className={styles.resultsHeader}>
            <h2>
              {filteredResults.length} result{filteredResults.length !== 1 ? 's' : ''} 
              {results.length !== filteredResults.length && ` (filtered from ${results.length})`}
            </h2>
            <div className={styles.resultActions}>
              <button type="button" onClick={clear} className={styles.clearAll}>Clear All</button>
            </div>
          </div>

          <div className={styles.resultsGrid}>
            {filteredResults.map((result, idx) => {
              const thumb = result.thumbnail || result.image || null
              return (
                <div 
                  key={`${result.id || result.url || idx}`}
                  className={`${styles.resultCard} ${styles[result.type || activeLayer]} ${result.isLive ? styles.live : ''}`}
                  onClick={() => handleResultSelect(result)}
                >
                  <div className={styles.thumbnail}>
                    {thumb ? (
                      <img src={thumb} alt={result.title} loading="lazy" />
                    ) : (
                      <div className={styles.noThumbnail}>
                        <CurrentLayerIcon size={32} />
                      </div>
                    )}
                    
                    {result.duration && (
                      <span className={styles.duration}>
                        <Clock size={10} />
                        {result.duration}
                      </span>
                    )}
                    {result.isLive && (
                      <span className={styles.liveBadge}>
                        <Radio size={10} />
                        LIVE
                      </span>
                    )}
                    {result.quality && (
                      <span className={styles.qualityBadge}>{result.quality}</span>
                    )}
                    {result.isNSFW && (
                      <span className={styles.nsfwBadge}>18+</span>
                    )}
                  </div>
                  
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
                          <Eye size={10} />
                          {parseInt(result.views).toLocaleString()}
                        </span>
                      )}
                      {result.year && (
                        <span className={styles.year}>{result.year}</span>
                      )}
                    </div>

                    {result.description && (
                      <p className={styles.description}>{result.description.slice(0, 120)}...</p>
                    )}

                    {activeLayer === 'sports' && result.matchInfo && (
                      <div className={styles.matchInfo}>
                        <div className={styles.teams}>{result.matchInfo.teams}</div>
                        <div className={styles.matchDetails}>
                          <span className={styles.time}>{result.matchInfo.time}</span>
                          <span className={styles.competition}>{result.matchInfo.competition}</span>
                          {result.isLive && <span className={styles.liveIndicator}>LIVE NOW</span>}
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

                    {activeLayer === 'iptv' && result.program && (
                      <div className={styles.program}>
                        <div className={styles.nowPlaying}>
                          <span className={styles.progLabel}>Now:</span> {result.program.now}
                        </div>
                        {result.program.next && (
                          <div className={styles.next}>
                            <span className={styles.progLabel}>Next:</span> {result.program.next}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className={styles.actions}>
                    <button 
                      type="button"
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
                        <ArrowUpRight size={16} />
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {hasMore && (
            <div className={styles.loadMore}>
              <button type="button" onClick={handleLoadMore} disabled={loading}>
                {loading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      )}

      {!loading && filteredResults.length === 0 && query && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <Search size={32} />
          </div>
          <h3>No results found</h3>
          <p>No {currentLayer?.label} results for &quot;{query}&quot;</p>
          
          {activeLayer === 'direct' && (
            <div className={styles.multiLayerAlert}>
              <h4>Multi Layer Direct Search Completed</h4>
              <p>
                We checked across primary movie & series sites (Nkiri, NetNaija, FZMovies, O2TV) and multiple query formats (/s=, /search, /q=, /k=) and found 0 direct links for &quot;{query}&quot;.
              </p>
              <div className={styles.alertTips}>
                <span>• Try simplifying your keywords (e.g. search &quot;Silo&quot; instead of exact episode name)</span>
                <span>• Or paste a direct .mp4 / .m3u8 video URL directly into the search bar to play immediately!</span>
              </div>
            </div>
          )}

          {activeLayer === 'nsfw' && !adultVerified && (
            <p className={styles.verifyPrompt}>Age verification required for NSFW content</p>
          )}
          <button type="button" onClick={() => { setQuery(''); document.getElementById('unified-search-input')?.focus(); }}>
            Clear Search
          </button>
        </div>
      )}

      {!query && !loading && results.length === 0 && (
        <div className={styles.initial}>
          <div className={styles.initialIcon}>
            <CurrentLayerIcon size={32} />
          </div>
          <h3>Start Searching</h3>
          <p>Enter a query above or choose a trending topic to search {currentLayer?.label}</p>
          <div className={styles.tips}>
            <p>Tips:</p>
            <ul>
              <li>Click any trending pill above to search instantly</li>
              <li>For direct links, you can paste a full URL (.mp4/.m3u8)</li>
              <li>Press Ctrl+K to quickly focus the search box</li>
            </ul>
          </div>
        </div>
      )}

      <Modal
        open={showNsfwModal}
        title="Adult Content Verification (18+)"
        icon={ShieldAlert}
        onClose={handleNsfwCancel}
      >
        <div className={styles.nsfwModalBody}>
          <p className={styles.nsfwModalText}>
            This section contains sexually explicit material restricted to adults aged 18 years and older (or the age of legal majority in your jurisdiction).
          </p>
          <p className={styles.nsfwModalSubtext}>
            By continuing, you confirm that you are at least 18 years old, that accessing adult content is permitted by the laws where you reside, and that you wish to view such material.
          </p>
          <div className={styles.nsfwModalActions}>
            <Button variant="secondary" onClick={handleNsfwCancel}>
              Cancel / Leave
            </Button>
            <Button variant="danger" onClick={handleNsfwConfirm}>
              I Am 18+ — Continue
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
