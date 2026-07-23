import { useState, useCallback, useMemo, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Compass, PlayCircle, Link2, Tv, Trophy, ShieldAlert,
  Search, X, Loader2, ChevronRight, Film, AlertCircle
} from 'lucide-react'
import styles from './UnifiedSearch.module.scss'
import { useUnifiedSearch } from '../../hooks/useUnifiedSearch'
import { useAuth } from '../../shared/auth/hooks/useAuth.jsx'
import { isDirectVideoUrl, normalizePlaybackUrl } from '../../shared/lib/youtube.js'
import { Modal, Button, useToast } from '../../shared/ui/index.js'
import { apiPath, parseJsonResponse } from '../../shared/lib/api.js'
import { Capacitor } from '@capacitor/core'
import { O2TvPlugin } from '../../native/O2TvPlugin'
import { EpisodesModal } from './EpisodesModal.jsx'

const SEARCH_LAYERS = [
  { id: 'all', label: 'All Media', icon: Compass, description: 'Search across all sources' },
  { id: 'youtube', label: 'YouTube', icon: PlayCircle, description: 'Search YouTube videos' },
  { id: 'direct', label: 'Direct Links', icon: Link2, description: 'Nkiri shows via DownloadWella' },
  { id: 'iptv', label: 'IPTV', icon: Tv, description: 'Live TV channels' },
  { id: 'sports', label: 'Sports', icon: Trophy, description: 'Live sports events' },
  { id: 'nsfw', label: 'NSFW', icon: ShieldAlert, description: 'Adult content — 18+ only', adult: true },
]

const TRENDING = {
  all: ['Silo', 'House of the Dragon', 'Premier League'],
  youtube: ['Alan Walker Live', 'Top Movies 2026'],
  direct: ['Silo', 'House of the Dragon', 'Squid Game', 'The Last of Us'],
  iptv: ['CNN News', 'ESPN Sports', 'BBC World'],
  sports: ['Premier League', 'Champions League'],
  nsfw: ['Trending', 'Popular'],
}

export default function UnifiedSearch() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const { toast } = useToast()
  const isMediaRoute = location.pathname === '/media'

  const [activeLayer, setActiveLayer] = useState(isMediaRoute ? 'direct' : 'all')
  const [query, setQuery] = useState('')
  const [adultVerified, setAdultVerified] = useState(false)
  const [showNsfwModal, setShowNsfwModal] = useState(false)
  const [pendingNsfwAction, setPendingNsfwAction] = useState(null)

  // Direct Links hierarchical state
  const [directResults, setDirectResults] = useState(null)
  const [directLoading, setDirectLoading] = useState(false)
  const [episodesModal, setEpisodesModal] = useState(null)

  const { results, loading, error, search, clear, hasMore, loadMore } = useUnifiedSearch()
  const isNativeApp = Capacitor.isNativePlatform()
  const useLegacyO2TvNative = isNativeApp && import.meta.env.VITE_DIRECT_PROVIDER === 'o2tv'

  const currentLayer = useMemo(() => SEARCH_LAYERS.find(l => l.id === activeLayer), [activeLayer])
  const CurrentLayerIcon = currentLayer?.icon || Film
  const trending = TRENDING[activeLayer] || TRENDING.all

  const runSearch = useCallback(async (targetQuery = query.trim()) => {
    if (!targetQuery) {
      toast('Please enter a search query', { variant: 'warning' })
      return
    }
    if (activeLayer === 'nsfw' && !adultVerified) {
      setPendingNsfwAction({ type: 'search', query: targetQuery })
      setShowNsfwModal(true)
      return
    }
    if (activeLayer === 'direct') {
      await searchDirect(targetQuery)
      return
    }
    await search({
      layer: activeLayer,
      query: targetQuery,
      options: { adultVerified, resolve: activeLayer === 'nsfw' },
    })
  // searchDirect is declared below; keeping this dependency list stable avoids
  // rebuilding the submit handler during in-flight searches.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLayer, query, search, adultVerified, toast])

  const searchDirect = useCallback(async (targetQuery) => {
    if (!user) {
      toast('Sign in to search', { variant: 'warning' })
      return
    }
    setDirectLoading(true)
    setDirectResults(null)
    setEpisodesModal(null)

    try {
      if (useLegacyO2TvNative) {
        const native = await O2TvPlugin.search({ query: targetQuery })
        const shows = Array.isArray(native?.shows) ? native.shows : []
        if (shows.length === 0) {
          toast('No O2TV shows found. Try another title or use All Media.', { variant: 'warning' })
          return
        }
        const firstShow = shows[0]
        const showSlug = firstShow.showSlug || firstShow.slug || ''
        const showName = firstShow.showName || firstShow.name || firstShow.title || targetQuery
        let seasons = []
        if (showSlug) {
          const nativeSeasons = await O2TvPlugin.getSeasons({ showSlug })
          seasons = (nativeSeasons?.seasons || []).map(s => ({
            number: s.number,
            label: s.label || `Season ${s.number}`,
            url: s.url,
          }))
        }
        setDirectResults({
          title: showName,
          showSlug,
          url: firstShow.url || '',
          thumbnail: null,
          seasons,
          nativeShows: shows,
        })
        if (!seasons.length) {
          toast('Show found, but no seasons were detected. Try another result.', { variant: 'warning' })
        }
        return
      }

      const token = await user.getIdToken()
      const res = await fetch(apiPath('/api/media'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'search', layer: 'direct', query: targetQuery, options: { limit: 20 } }),
      })
      const data = await parseJsonResponse(res)
      const items = data.results || []

      if (items.length === 0) {
        toast(data.error || 'No results found. Try a different query.', { variant: 'warning' })
        setDirectLoading(false)
        return
      }

      if (items.some(item => item.source === 'nkiri' || item.provider === 'nkiri')) {
        setDirectResults({
          title: `${items.length} Nkiri result${items.length === 1 ? '' : 's'}`,
          showSlug: '',
          url: '',
          thumbnail: null,
          seasons: [],
          flatResults: items,
        })
        return
      }

      // Group by show
      const shows = new Map()
      for (const item of items) {
        if (item.o2tvKind === 'show' || item.showSlug) {
          const key = item.showSlug || item.title
          if (!shows.has(key)) {
            shows.set(key, {
              title: item.showName || item.title,
              showSlug: item.showSlug || '',
              url: item.url || item.link || '',
              thumbnail: item.thumbnail || item.image || null,
              seasons: [],
            })
          }
        }
      }

      if (shows.size > 0) {
        const firstShow = Array.from(shows.values())[0]
        const seasons = await fetchSeasons(firstShow.showSlug, firstShow.showName)
        setDirectResults({
          title: firstShow.title,
          showSlug: firstShow.showSlug,
          url: firstShow.url,
          thumbnail: firstShow.thumbnail,
          seasons,
        })
      } else {
        setDirectResults({
          title: targetQuery,
          showSlug: '',
          url: '',
          thumbnail: null,
          seasons: [],
          flatResults: items,
        })
      }
    } catch (err) {
      toast(err.message || 'Search failed', { variant: 'error' })
    } finally {
      setDirectLoading(false)
    }
  // fetchSeasons is declared below; keep searchDirect stable for active requests.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, toast, isNativeApp, useLegacyO2TvNative])

  const fetchSeasons = useCallback(async (showSlug, showName) => {
    if (!showSlug || !user) return []
    try {
      if (isNativeApp) {
        const nativeSeasons = await O2TvPlugin.getSeasons({ showSlug })
        return (nativeSeasons?.seasons || []).map(s => ({
          number: s.number,
          label: s.label || `Season ${s.number}`,
          url: s.url,
        }))
      }

      const token = await user.getIdToken()
      const res = await fetch(apiPath('/api/media'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'o2tvSeasons', showSlug, showName }),
      })
      const data = await parseJsonResponse(res)
      return (data.results || []).map(s => ({
        number: s.seasonNum,
        label: s.label || `Season ${s.seasonNum}`,
        url: s.url,
      }))
    } catch {
      return []
    }
  }, [user, isNativeApp])

  const fetchEpisodes = useCallback(async (seasonUrl, seasonNum, showSlug, showName) => {
    if (!user) return
    setEpisodesModal({ seasonNum, episodes: [], loading: true })
    try {
      if (isNativeApp) {
        const nativeEpisodes = await O2TvPlugin.getEpisodes({ showSlug, seasonNum })
        const episodes = (nativeEpisodes?.episodes || []).map(ep => ({
          number: ep.number,
          title: ep.title || `Episode ${ep.number}`,
          url: ep.url,
          native: true,
          showSlug,
          showName,
          seasonNum,
        }))
        setEpisodesModal({ seasonNum, episodes, loading: false })
        return
      }

      const token = await user.getIdToken()
      const res = await fetch(apiPath('/api/media'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'o2tvEpisodes', showSlug, showName, seasonNum }),
      })
      const data = await parseJsonResponse(res)
      const episodes = (data.results || []).map(ep => ({
        number: ep.episodeNum,
        title: ep.label || ep.title || `Episode ${ep.episodeNum}`,
        url: ep.url,
      }))
      setEpisodesModal({ seasonNum, episodes, loading: false })
    } catch (err) {
      toast(err.message || 'Failed to load episodes', { variant: 'error' })
      setEpisodesModal(null)
    }
  }, [user, toast, isNativeApp])


  const fetchNkiriEpisodes = useCallback(async (showUrl, showTitle) => {
    if (!user || !showUrl) return
    setEpisodesModal({ seasonNum: 1, episodes: [], loading: true })
    try {
      const token = await user.getIdToken()
      const res = await fetch(apiPath('/api/media'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'nkiriEpisodes', url: showUrl, title: showTitle }),
      })
      const data = await parseJsonResponse(res)
      if (!res.ok || data.success === false) throw new Error(data.error || 'Could not load episodes')
      const episodes = (data.results || []).map(ep => ({
        number: ep.episodeNum,
        title: ep.title || ep.label || `Episode ${ep.episodeNum}`,
        url: ep.url,
        source: 'nkiri',
        provider: 'downloadwella',
        container: ep.container,
      }))
      setDirectResults(prev => prev ? { ...prev, title: showTitle || prev.title } : prev)
      setEpisodesModal({ seasonNum: 1, episodes, loading: false })
      if (!episodes.length) toast('No DownloadWella episode links found for this Nkiri result.', { variant: 'warning' })
    } catch (err) {
      toast(err.message || 'Could not load Nkiri episodes', { variant: 'error' })
      setEpisodesModal(null)
    }
  }, [user, toast])

  const handleEpisodeClick = useCallback(async (episode) => {
    if (!user) {
      toast('Sign in to watch', { variant: 'warning' })
      return
    }
    if (!episode.url) {
      toast('No playable URL for this episode', { variant: 'error' })
      return
    }

    setEpisodesModal(null)
    toast(`Resolving ${episode.title}...`, { variant: 'info' })

    try {
      const token = await user.getIdToken()
      if (episode.source === 'nkiri' || episode.provider === 'downloadwella') {
        const res = await fetch(apiPath('/api/media'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: 'nkiriResolve', url: episode.url, title: episode.title }),
        })
        const data = await parseJsonResponse(res)
        if (!res.ok || data.success === false) throw new Error(data.error || 'Could not create direct link')
        const directItem = data.results?.[0]
        if (directItem?.url) {
          const params = new URLSearchParams({
            videoUrl: normalizePlaybackUrl(directItem.url),
            title: directItem.title || episode.title || 'Nkiri Video',
            type: 'direct',
          })
          navigate(`/create?${params.toString()}`, { state: { from: location.pathname } })
          return
        }
        throw new Error('No playable stream returned')
      }

      if (isNativeApp && (episode.native || directResults?.showSlug)) {
        const showSlug = episode.showSlug || directResults?.showSlug || ''
        const showName = episode.showName || directResults?.title || ''
        const seasonNum = episode.seasonNum || episodesModal?.seasonNum || 1
        const epNum = episode.number || episode.episodeNum || 1
        const resolved = await O2TvPlugin.resolveEpisode({
          showName,
          showSlug,
          seasonNum,
          epNum,
          captchaSolverEndpoint: apiPath('/api/media'),
          authToken: token,
        })
        if (resolved?.url) {
          const params = new URLSearchParams({
            videoUrl: normalizePlaybackUrl(resolved.url),
            title: episode.title || `${showName} S${seasonNum}E${epNum}`,
            type: 'direct',
          })
          navigate(`/create?${params.toString()}`, { state: { from: location.pathname } })
          return
        }
        throw new Error('Native resolver could not get a playable link. Try another episode.')
      }

      const res = await fetch(apiPath('/api/media'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'scrape', url: episode.url, options: { resolve: true } }),
      })
      const data = await parseJsonResponse(res)
      const directItem = data.results?.find(r => r.isDirect || r.playableInRoom) || data.results?.[0]

      if (directItem?.url) {
        const playbackUrl = normalizePlaybackUrl(directItem.url)
        const params = new URLSearchParams({
          videoUrl: playbackUrl,
          title: directItem.title || episode.title,
          type: 'direct',
        })
        navigate(`/create?${params.toString()}`, { state: { from: location.pathname } })
      } else {
        const params = new URLSearchParams({
          videoUrl: episode.url,
          title: episode.title,
          type: 'direct',
          showSlug: directResults?.showSlug || '',
          showName: directResults?.title || '',
          seasonNum: String(episodesModal?.seasonNum || ''),
          episodeNum: String(episode.number || ''),
        })
        navigate(`/create?${params.toString()}`, { state: { from: location.pathname } })
      }
    } catch (err) {
      toast(err.message || 'Could not resolve episode', { variant: 'error' })
    }
  }, [user, toast, navigate, location.pathname, directResults, episodesModal, isNativeApp])

  const handleLayerClick = useCallback((layerId) => {
    if (layerId === 'nsfw' && !adultVerified) {
      setPendingNsfwAction({ type: 'switch', layer: layerId })
      setShowNsfwModal(true)
      return
    }
    setActiveLayer(layerId)
    clear()
    setDirectResults(null)
    setEpisodesModal(null)
  }, [adultVerified, clear])

  const handleTrendingClick = useCallback((item) => {
    setQuery(item)
    setTimeout(() => runSearch(item), 50)
  }, [runSearch])

  const handleNsfwConfirm = useCallback(() => {
    setAdultVerified(true)
    setShowNsfwModal(false)
    if (pendingNsfwAction?.type === 'switch') {
      setActiveLayer(pendingNsfwAction.layer)
    } else if (pendingNsfwAction?.type === 'search') {
      setTimeout(() => runSearch(pendingNsfwAction.query), 50)
    }
    setPendingNsfwAction(null)
  }, [pendingNsfwAction, runSearch])

  const clearSearch = useCallback(() => {
    setQuery('')
    clear()
    setDirectResults(null)
    setEpisodesModal(null)
  }, [clear])

  // Apply dark theme when media page mounts
  useEffect(() => {
    document.body.classList.add('room-theme')
    return () => document.body.classList.remove('room-theme')
  }, [])

  return (
    <div className={styles.unifiedSearch}>
      {/* Header */}
      <div className={styles.header}>
        <h1>Media Browser</h1>
        <p className={styles.subtitle}>Search movies, shows, live TV, and sports — watch together in sync</p>
      </div>

      {/* Layer Tabs */}
      <div className={styles.layerTabs}>
        {SEARCH_LAYERS.map(layer => {
          const Icon = layer.icon
          return (
            <button
              key={layer.id}
              type="button"
              className={`${styles.tab} ${activeLayer === layer.id ? styles.active : ''} ${layer.adult ? styles.adult : ''}`}
              onClick={() => handleLayerClick(layer.id)}
            >
              <Icon size={14} />
              <span className={styles.label}>{layer.label}</span>
            </button>
          )
        })}
      </div>

      {/* Layer Description */}
      <div className={styles.layerInfo}>
        <CurrentLayerIcon size={16} className={styles.layerIcon} />
        <p>{currentLayer?.description || ''}</p>
      </div>

      {/* Search Form */}
      <div className={styles.searchForm}>
        <form onSubmit={(e) => { e.preventDefault(); runSearch() }} className={styles.searchBarWrapper}>
          <div className={styles.inputInner}>
            <Search size={16} className={styles.searchIcon} />
            <input
              id="unified-search-input"
              type="text"
              className={styles.searchInput}
              placeholder={currentLayer?.placeholder || 'Search...'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className={styles.searchButtonsRow}>
            {query && (
              <button type="button" onClick={clearSearch} className={styles.clearBtn} title="Clear">
                <X size={14} />
              </button>
            )}
            <button type="submit" className={styles.searchBtn} disabled={loading || directLoading}>
              {loading || directLoading ? <Loader2 size={14} className={styles.spin} /> : <Search size={14} />}
              Search
            </button>
          </div>
        </form>

        {/* Trending */}
        {trending.length > 0 && (
          <div className={styles.trendingContainer}>
            <div className={styles.trendingHeader}>Trending</div>
            <div className={styles.trendingPills}>
              {trending.map((item, i) => (
                <button key={i} type="button" className={styles.trendingPill} onClick={() => handleTrendingClick(item)}>
                  {item}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className={styles.error}>
          <AlertCircle size={16} />
          <span>{error}</span>
          <button type="button" onClick={clearSearch}>Dismiss</button>
        </div>
      )}

      {/* Direct Links: Loading */}
      {activeLayer === 'direct' && directLoading && (
        <div className={styles.loading}>
          <Loader2 size={32} className={styles.spinnerLarge} />
          <p>Searching Nkiri...</p>
        </div>
      )}

      {/* Direct Links: Results */}
      {activeLayer === 'direct' && directResults && !directLoading && (
        <div className={styles.directResults}>
          <div className={styles.directHeader}>
            <div className={styles.directHeaderLeft}>
              <h2 className={styles.directTitle}>{directResults.title}</h2>
              <span className={styles.badgeLime}>NKIRI</span>
              {directResults.seasons.length > 0 && (
                <span className={styles.badgeFaint}>{directResults.seasons.length} seasons found</span>
              )}
            </div>
          </div>

          {directResults.seasons.length > 0 ? (
            <div className={styles.seasonsGrid}>
              {directResults.seasons.map(season => (
                <div
                  key={season.number}
                  className={styles.seasonCard}
                  onClick={() => fetchEpisodes(season.url, season.number, directResults.showSlug, directResults.title)}
                >
                  <div className={styles.seasonPoster}>S{season.number}</div>
                  <div className={styles.seasonInfo}>
                    <div className={styles.seasonTitle}>{season.label}</div>
                    <div className={styles.seasonMeta}>O2TV · HD</div>
                  </div>
                  <ChevronRight size={16} className={styles.seasonChevron} />
                </div>
              ))}
            </div>
          ) : directResults.flatResults?.length > 0 ? (
            <div className={styles.resultsGrid}>
              {directResults.flatResults.map((result, idx) => (
                <div
                  key={result.url || idx}
                  className={styles.resultCard}
                  onClick={() => {
                    if (result.source === 'nkiri' || result.provider === 'nkiri' || result.requiresEpisodes) {
                      fetchNkiriEpisodes(result.url || result.link, result.title)
                      return
                    }
                    const params = new URLSearchParams({
                      videoUrl: normalizePlaybackUrl(result.url || result.link || ''),
                      title: result.title || 'Video',
                      type: 'direct',
                    })
                    navigate(`/create?${params.toString()}`, { state: { from: location.pathname } })
                  }}
                >
                  <div className={styles.info}>
                    <h3 className={styles.title}>{result.title}</h3>
                    <div className={styles.meta}>
                      <span className={styles.source}>{result.source}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.empty}>
              <p>No episodes found. Try another Nkiri result.</p>
            </div>
          )}
        </div>
      )}

      {/* Other Layers: Results */}
      {activeLayer !== 'direct' && results.length > 0 && (
        <>
          <div className={styles.resultsHeader}>
            <h2>{results.length} result{results.length !== 1 ? 's' : ''}</h2>
            <button type="button" onClick={clearSearch} className={styles.clearAll}>Clear All</button>
          </div>

          <div className={styles.resultsGrid}>
            {results.map((result, idx) => (
              <ResultCard key={result.id || result.url || idx} result={result} layer={activeLayer} />
            ))}
          </div>

          {hasMore && (
            <div className={styles.loadMore}>
              <button type="button" onClick={loadMore} disabled={loading}>
                {loading ? <Loader2 size={14} className={styles.spin} /> : null}
                {loading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </>
      )}

      {/* Empty State */}
      {!loading && !directLoading && results.length === 0 && !directResults && !error && (
        <div className={styles.initial}>
          <div className={styles.initialIcon}>
            <CurrentLayerIcon size={28} />
          </div>
          <h3>{query ? 'Ready to search' : 'Search for something'}</h3>
          <p>
            {query
              ? `Tap Search to find "${query}" in ${currentLayer?.label?.toLowerCase() || 'all sources'}`
              : `Enter a query above to find ${currentLayer?.label?.toLowerCase() || 'content'}`
            }
          </p>
        </div>
      )}

      {/* Episodes Modal */}
      {episodesModal && (
        <EpisodesModal
          open={Boolean(episodesModal)}
          showTitle={directResults?.title || 'Show'}
          seasonNum={episodesModal.seasonNum}
          episodes={episodesModal.episodes}
          loading={episodesModal.loading}
          onClose={() => setEpisodesModal(null)}
          onEpisodeClick={handleEpisodeClick}
        />
      )}

      {/* NSFW Modal */}
      <Modal open={showNsfwModal} title="Age Verification Required" icon={ShieldAlert} onClose={() => setShowNsfwModal(false)}>
        <div className={styles.nsfwModalBody}>
          <p className={styles.nsfwModalText}>You must be 18 or older to access adult content.</p>
          <p className={styles.nsfwModalSubtext}>By continuing, you confirm you are of legal age in your jurisdiction.</p>
          <div className={styles.nsfwModalActions}>
            <Button variant="secondary" onClick={() => setShowNsfwModal(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleNsfwConfirm}>I am 18+</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// Result Card Component
function ResultCard({ result, layer }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const { toast } = useToast()
  const thumb = result.thumbnail || result.image || null

  const handleClick = useCallback(async () => {
    if ((result.type || layer) === 'youtube' && result.id) {
      navigate(`/create?video=${result.id}&title=${encodeURIComponent(result.title || 'Untitled')}&type=youtube`, { state: { from: location.pathname } })
      return
    }
    if (result.type === 'iptv' || result.isLive) {
      const liveUrl = result.rawUrl || result.url || result.link
      const playback = /\/api\/proxy\?/i.test(String(result.url || ''))
        ? String(result.url)
        : normalizePlaybackUrl(liveUrl, { forceProxy: true })
      const params = new URLSearchParams({
        videoUrl: playback,
        title: result.title || 'Live Stream',
        type: result.type === 'sports' ? 'sports' : 'iptv',
        isLive: 'true',
      })
      navigate(`/create?${params.toString()}`, { state: { from: location.pathname } })
      return
    }
    const sourceKey = String(result.source || '').toLowerCase()
    if (sourceKey === 'o2tv' || result.o2tvKind === 'show' || /tvshows4mobile|o2tv/i.test(result.url || '')) {
      const params = new URLSearchParams({
        videoUrl: result.url || '',
        title: result.title || 'Untitled',
        type: 'direct',
      })
      if (result.showSlug) params.set('showSlug', result.showSlug)
      if (result.showName) params.set('showName', result.showName)
      navigate(`/create?${params.toString()}`, { state: { from: location.pathname } })
      return
    }
    if (result.isDirect || result.playableInRoom || isDirectVideoUrl(result.url || '')) {
      const params = new URLSearchParams({
        videoUrl: normalizePlaybackUrl(result.url || result.link || ''),
        title: result.title || 'Video',
        type: ['iptv', 'sports', 'nsfw'].includes(result.type) ? result.type : 'direct',
      })
      navigate(`/create?${params.toString()}`, { state: { from: location.pathname } })
      return
    }
    if (user) {
      try {
        const token = await user.getIdToken()
        const res = await fetch(apiPath('/api/media'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: 'scrape', url: result.url || result.link, options: { resolve: true } }),
        })
        const data = await parseJsonResponse(res)
        const directItem = data.results?.find(r => r.isDirect || r.playableInRoom)
        if (directItem?.url) {
          const params = new URLSearchParams({
            videoUrl: normalizePlaybackUrl(directItem.url),
            title: directItem.title || result.title || 'Video',
            type: 'direct',
          })
          navigate(`/create?${params.toString()}`, { state: { from: location.pathname } })
          return
        }
      } catch { /* fallback */ }
    }
    toast('Could not resolve this result. Try another option.', { variant: 'error' })
  }, [result, layer, navigate, location.pathname, user, toast])

  return (
    <div className={styles.resultCard} onClick={handleClick}>
      <div className={styles.thumbnail}>
        {thumb ? (
          <>
            <div className={styles.thumbnailBg} style={{ backgroundImage: `url(${thumb})` }} />
            <img src={thumb} alt={result.title} loading="lazy" className={styles.thumbnailImg} onError={(e) => { e.currentTarget.style.display = 'none' }} />
          </>
        ) : null}
        <div className={styles.noThumbnail} style={{ display: thumb ? 'none' : 'flex' }}>
          <Film size={28} />
        </div>
        {result.duration && <span className={styles.duration}>{result.duration}</span>}
        {result.isLive && <span className={styles.liveBadge}>LIVE</span>}
        {result.quality && <span className={styles.qualityBadge}>{result.quality}</span>}
      </div>
      <div className={styles.info}>
        <h3 className={styles.title}>{result.title}</h3>
        <div className={styles.meta}>
          {result.views && <span>{parseInt(result.views).toLocaleString()} views</span>}
          {result.source && <span className={styles.source}>{result.source}</span>}
        </div>
      </div>
      <div className={styles.actions}>
        <button type="button" className={`${styles.watchBtn} ${result.isLive ? styles.liveBtn : ''}`} onClick={(e) => { e.stopPropagation(); handleClick() }}>
          {result.isLive ? 'Watch Live' : 'Watch in Room'}
        </button>
      </div>
    </div>
  )
}
