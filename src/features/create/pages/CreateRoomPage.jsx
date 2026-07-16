import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, Link, useSearchParams, useLocation } from 'react-router-dom'
import { doc, setDoc, deleteDoc, serverTimestamp, collection } from 'firebase/firestore'
import { db } from '../../../shared/lib/firebase.js'
import { useAuth } from '../../../shared/auth/hooks/useAuth.jsx'
import {
  extractVideoId,
  getThumbnail,
  isDirectVideoUrl,
  normalizePlaybackUrl,
  checkEmbeddable,
  searchYouTube,
  hasYouTubeApiKey,
} from '../../../shared/lib/youtube.js'
import { useScraper } from '../../../hooks/useScraper.js'
import { parseJsonResponse } from '../../../shared/lib/api.js'
import { isSuitableThumbnail } from '../../../shared/lib/mediaHelper.js'
import { Button, Input, Card, useToast } from '../../../shared/ui/index.js'
import styles from './CreateRoomPage.module.css'

function makeInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

function isO2TvUrl(value) {
  return /tvshows4mobile\.org|o2tvseries|o2tv\.org/i.test(String(value || ''))
}

function parseShowSlugFromUrl(value) {
  try {
    const u = new URL(value)
    if (!isO2TvUrl(u.href)) return null
    // CDN paths are /Show Name/... — not a tvshows4mobile slug
    if (/o2tv\.org/i.test(u.hostname)) return null
    const parts = u.pathname.split('/').filter(Boolean)
    return parts[0] || null
  } catch {
    return null
  }
}

function safeThumb(url) {
  return isSuitableThumbnail(url) ? url : null
}

export default function CreateRoomPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { toast } = useToast()
  const { scrape, results, loading: scraperLoading, error: scraperError, clear } = useScraper()
  const o2AbortRef = useRef(0)

  const presetVideo = searchParams.get('video') || ''
  const presetVideoUrl = searchParams.get('videoUrl') || ''
  const presetTitle = searchParams.get('title') || ''
  const presetType = searchParams.get('type') || 'youtube'
  const presetThumb = safeThumb(searchParams.get('thumbnail') || '')
  const presetShowSlug = searchParams.get('showSlug') || parseShowSlugFromUrl(presetVideoUrl) || ''
  const presetShowName = searchParams.get('showName') || presetTitle || ''
  const presetIsStream = ['direct', 'iptv', 'sports', 'nsfw'].includes(presetType)
  const presetIsLive = searchParams.get('isLive') === 'true' || presetType === 'iptv' || presetType === 'sports' || /youtube\.com\/live\//i.test(presetVideoUrl || '')

  const [title, setTitle] = useState(presetTitle)
  const [url, setUrl] = useState(
    presetVideo ? `https://youtube.com/watch?v=${presetVideo}` : presetVideoUrl
  )
  const [capacity, setCapacity] = useState(12)
  const [isPrivate, setIsPrivate] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMode, setSearchMode] = useState(
    presetType === 'direct' || presetVideoUrl ? 'scraper' : 'youtube'
  )
  const [scraperSite, setScraperSite] = useState('o2tv')
  const [videoId, setVideoId] = useState(presetVideo)
  // Never seed videoUrl with an O2TV *page* link — that is not playable until episode resolve
  const [videoUrl, setVideoUrl] = useState(() => {
    if (!presetVideoUrl) return ''
    if (isO2TvUrl(presetVideoUrl) && !isDirectVideoUrl(presetVideoUrl) && !/\/api\/proxy\?/i.test(presetVideoUrl)) {
      return ''
    }
    return normalizePlaybackUrl(presetVideoUrl)
  })
  // Preserve iptv/sports/nsfw from /media navigation — don't collapse everything to 'direct'
  const [videoType, setVideoType] = useState(() => {
    if (presetType === 'youtube' && !presetVideoUrl) return 'youtube'
    if (['iptv', 'sports', 'nsfw', 'direct'].includes(presetType)) return presetType
    if (presetVideoUrl && /\.m3u8(\?|#|$)/i.test(presetVideoUrl)) return 'iptv'
    if (presetIsStream || presetVideoUrl) return 'direct'
    return 'youtube'
  })
  const [isLiveStream, setIsLiveStream] = useState(presetIsLive)
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)
  const [embedWarning, setEmbedWarning] = useState(null)
  const [ytResults, setYtResults] = useState([])
  const [ytLoading, setYtLoading] = useState(false)

  // O2TV hierarchical browse state
  // stage: null | 'seasons' | 'episodes' | 'ready'
  const [o2Stage, setO2Stage] = useState(null)
  const [o2Loading, setO2Loading] = useState(false)
  const [o2Error, setO2Error] = useState(null)
  const [o2ShowSlug, setO2ShowSlug] = useState(presetShowSlug)
  const [o2ShowName, setO2ShowName] = useState(presetShowName)
  const [o2Thumbnail, setO2Thumbnail] = useState(presetThumb)
  const [o2SeasonNum, setO2SeasonNum] = useState(null)
  const [o2Seasons, setO2Seasons] = useState([])
  const [o2Episodes, setO2Episodes] = useState([])
  const [selectedSeasonIdx, setSelectedSeasonIdx] = useState(null)
  const [selectedEpisodeIdx, setSelectedEpisodeIdx] = useState(null)
  const [resolvingEpisode, setResolvingEpisode] = useState(false)

  const mediaPost = useCallback(async (body) => {
    if (!user) throw new Error('Sign in required')
    const token = await user.getIdToken()
    const res = await fetch('/api/media', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    let data = null
    try {
      data = JSON.parse(text)
    } catch {
      const isTimeout = res.status === 504 || /timeout|504/i.test(text)
      throw new Error(
        isTimeout
          ? 'Request timed out — try again.'
          : `Request failed (HTTP ${res.status})`
      )
    }
    if (!res.ok || data?.success === false) {
      throw new Error(data?.error || `Request failed (HTTP ${res.status})`)
    }
    return data
  }, [user])

  const loadO2Seasons = useCallback(async ({ showSlug, showName, thumbnail } = {}) => {
    const slug = showSlug || o2ShowSlug
    if (!slug) {
      setO2Error('Missing show reference. Go back and pick a show from search.')
      return
    }
    const reqId = ++o2AbortRef.current
    setO2Loading(true)
    setO2Error(null)
    setO2Stage('seasons')
    setO2Seasons([])
    setO2Episodes([])
    setSelectedSeasonIdx(null)
    setSelectedEpisodeIdx(null)
    setVideoUrl('')
    try {
      const data = await mediaPost({
        action: 'o2tvSeasons',
        showSlug: slug,
        showName: showName || o2ShowName || presetTitle,
        thumbnail: thumbnail || o2Thumbnail || undefined,
      })
      if (reqId !== o2AbortRef.current) return
      const list = Array.isArray(data.results) ? data.results : []
      setO2Seasons(list)
      if (data.showName) setO2ShowName(data.showName)
      if (data.showSlug) setO2ShowSlug(data.showSlug)
      if (data.thumbnail) setO2Thumbnail(safeThumb(data.thumbnail) || o2Thumbnail)
      if (!list.length) {
        setO2Error('No seasons found for this show. Try another result or paste a direct .mp4 link.')
      }
    } catch (err) {
      if (reqId !== o2AbortRef.current) return
      console.error('O2TV seasons failed:', err)
      setO2Error(err.message || 'Failed to load seasons')
    } finally {
      if (reqId === o2AbortRef.current) setO2Loading(false)
    }
  }, [mediaPost, o2ShowSlug, o2ShowName, o2Thumbnail, presetTitle])

  const loadO2Episodes = useCallback(async (seasonNum, seasonIdx = null) => {
    if (!o2ShowSlug || !seasonNum) return
    const reqId = ++o2AbortRef.current
    setO2Loading(true)
    setO2Error(null)
    setO2Stage('episodes')
    setO2Episodes([])
    setO2SeasonNum(seasonNum)
    setSelectedSeasonIdx(seasonIdx)
    setSelectedEpisodeIdx(null)
    setVideoUrl('')
    try {
      const data = await mediaPost({
        action: 'o2tvEpisodes',
        showSlug: o2ShowSlug,
        showName: o2ShowName,
        seasonNum,
        thumbnail: o2Thumbnail || undefined,
      })
      if (reqId !== o2AbortRef.current) return
      const list = Array.isArray(data.results) ? data.results : []
      setO2Episodes(list)
      if (data.thumbnail) setO2Thumbnail(safeThumb(data.thumbnail) || o2Thumbnail)
      if (!list.length) {
        setO2Error(`No episodes found for Season ${seasonNum}. Try another season.`)
      }
    } catch (err) {
      if (reqId !== o2AbortRef.current) return
      console.error('O2TV episodes failed:', err)
      setO2Error(err.message || 'Failed to load episodes')
    } finally {
      if (reqId === o2AbortRef.current) setO2Loading(false)
    }
  }, [mediaPost, o2ShowSlug, o2ShowName, o2Thumbnail])

  const resolveO2Episode = useCallback(async (ep, idx) => {
    if (!ep) return
    const seasonNum = ep.seasonNum || o2SeasonNum || 1
    const episodeNum = ep.episodeNum || ep.number || (idx + 1)
    const reqId = ++o2AbortRef.current
    setResolvingEpisode(true)
    setO2Error(null)
    setSelectedEpisodeIdx(idx)
    try {
      const data = await mediaPost({
        action: 'o2tvResolve',
        showSlug: ep.showSlug || o2ShowSlug,
        showName: ep.showName || o2ShowName,
        seasonNum,
        episodeNum,
        thumbnail: ep.thumbnail || o2Thumbnail || undefined,
      })
      if (reqId !== o2AbortRef.current) return
      const best = (data.results || []).find((r) => r.isDirect || r.playableInRoom || /\/api\/proxy\?/i.test(r.url || ''))
        || (data.results || [])[0]
      if (!best?.url) {
        throw new Error('Could not resolve a playable link for this episode')
      }
      const playUrl = normalizePlaybackUrl(best.url)
      setVideoUrl(playUrl)
      setVideoType('direct')
      setVideoId('')
      setO2Stage('ready')
      const epTitle = best.title || ep.title || `${o2ShowName} S${String(seasonNum).padStart(2, '0')}E${String(episodeNum).padStart(2, '0')}`
      setTitle((t) => t || epTitle)
      if (best.thumbnail) setO2Thumbnail(safeThumb(best.thumbnail) || o2Thumbnail)
      toast('Episode ready — create the room when you are set', { variant: 'success' })
    } catch (err) {
      if (reqId !== o2AbortRef.current) return
      console.error('O2TV resolve failed:', err)
      setO2Error(err.message || 'Failed to resolve episode')
      setVideoUrl('')
      toast(err.message || 'Failed to resolve episode', { variant: 'error' })
    } finally {
      if (reqId === o2AbortRef.current) setResolvingEpisode(false)
    }
  }, [mediaPost, o2ShowSlug, o2ShowName, o2SeasonNum, o2Thumbnail, toast])

  // Bootstrap from search navigation / deep link
  useEffect(() => {
    if (!presetVideoUrl || !user) return

    const id = extractVideoId(presetVideoUrl)
    if (id) {
      setVideoId(id)
      setVideoUrl('')
      setVideoType('youtube')
      return
    }

    // Already a direct playable file / proxy URL
    if (isDirectVideoUrl(presetVideoUrl) || /\/api\/proxy\?/i.test(presetVideoUrl)) {
      const normalized = normalizePlaybackUrl(presetVideoUrl)
      const isM3u8 = /\.m3u8(\?|#|$)/i.test(presetVideoUrl)
      setVideoUrl(normalized)
      setVideoType(isM3u8 ? 'iptv' : 'direct')
      setVideoId('')
      // CDN o2tv.org mp4 may still need proxy — normalizePlaybackUrl usually wraps it
      return
    }

    // O2TV hierarchical entry
    if (isO2TvUrl(presetVideoUrl) || presetShowSlug) {
      const slug = presetShowSlug || parseShowSlugFromUrl(presetVideoUrl)
      const name = presetShowName || presetTitle || 'TV Show'
      setO2ShowSlug(slug || '')
      setO2ShowName(name)
      setO2Thumbnail(presetThumb)
      setUrl('')
      setVideoUrl('')
      setVideoType('direct')
      setSearchMode('scraper')
      if (slug) {
        loadO2Seasons({ showSlug: slug, showName: name, thumbnail: presetThumb })
      } else {
        // Fall back to scrape path which uses resolveO2TvPage hierarchy
        setO2Loading(true)
        setO2Error(null)
        mediaPost({ action: 'scrape', url: presetVideoUrl })
          .then((data) => {
            const list = data.results || []
            if (data.stage === 'seasons' || list.some((r) => r.o2tvKind === 'season')) {
              setO2Seasons(list)
              setO2Stage('seasons')
              if (data.showSlug) setO2ShowSlug(data.showSlug)
              if (data.showName) setO2ShowName(data.showName)
              if (data.thumbnail) setO2Thumbnail(safeThumb(data.thumbnail))
            } else if (data.stage === 'episodes' || list.some((r) => r.o2tvKind === 'episode')) {
              setO2Episodes(list)
              setO2Stage('episodes')
              if (data.showSlug) setO2ShowSlug(data.showSlug)
              if (data.showName) setO2ShowName(data.showName)
              if (data.seasonNum) setO2SeasonNum(data.seasonNum)
              if (data.thumbnail) setO2Thumbnail(safeThumb(data.thumbnail))
            } else if (list.some((r) => r.isDirect || r.playableInRoom)) {
              const best = list.find((r) => r.isDirect || r.playableInRoom) || list[0]
              setVideoUrl(normalizePlaybackUrl(best.url))
              setTitle((t) => t || best.title || name)
              setO2Stage('ready')
            } else {
              setO2Error('No seasons or episodes found. Try another show.')
            }
          })
          .catch((err) => {
            console.error('O2TV bootstrap failed:', err)
            setO2Error(err.message || 'Failed to load show')
          })
          .finally(() => setO2Loading(false))
      }
      return
    }

    if (presetIsStream || presetVideoUrl) {
      const normalized = normalizePlaybackUrl(presetVideoUrl)
      const isM3u8 = /\.m3u8(\?|#|$)/i.test(presetVideoUrl)
      setVideoUrl(normalized)
      setVideoType(isM3u8 ? 'iptv' : 'direct')
      setVideoId('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bootstrap once from query params
  }, [presetVideoUrl, user?.uid])

  if (!user) return <Link to="/auth">Sign in to create a room</Link>

  const onUrlChange = (value) => {
    setUrl(value)
    setEmbedWarning(null)
    const id = extractVideoId(value)
    if (id) {
      setVideoId(id)
      setVideoUrl('')
      setVideoType('youtube')
      const isYtLive = /youtube\.com\/live\//i.test(value)
      setIsLiveStream(isYtLive)
      clear()
      setYtResults([])
      setO2Stage(null)
      checkEmbeddable(id).then((r) => {
        if (!r.embeddable) setEmbedWarning(r.reason)
        else if (r.title && !title) setTitle(r.title)
      })
      return
    }
    if (isDirectVideoUrl(value) || /\.(mp4|m3u8|mkv|avi|mov|webm|flv|ts)(\?|#|$)/i.test(value)) {
      const playbackUrl = normalizePlaybackUrl(value.trim())
      const isM3u8 = /\.m3u8(\?|#|$)/i.test(value)
      setVideoUrl(playbackUrl)
      setVideoId('')
      setVideoType(isM3u8 ? 'iptv' : 'direct')
      clear()
      setYtResults([])
      setO2Stage(null)
    }
  }

  const onYtSearch = async (e) => {
    e?.preventDefault?.()
    if (!searchQuery.trim()) return
    setYtLoading(true)
    setError(null)
    try {
      let items = []
      if (hasYouTubeApiKey()) {
        items = await searchYouTube(searchQuery.trim(), 12)
      } else {
        const token = await user.getIdToken()
        const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/media`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: 'search',
            layer: 'youtube',
            query: searchQuery.trim(),
            options: { limit: 12 },
          }),
        })
        const data = await res.json()
        if (!res.ok || !data.success) {
          throw new Error(data.error || `YouTube search failed (HTTP ${res.status})`)
        }
        items = (data.results || []).map((it) => ({
          id: it.id,
          title: it.title,
          thumbnail: it.thumbnail,
          channel: it.channel,
          source: 'youtube',
          url: `https://www.youtube.com/watch?v=${it.id}`,
          embeddable: it.embeddable !== false,
        }))
      }
      setYtResults(
        items.map((it) => ({
          id: it.id,
          title: it.title,
          thumbnail: it.thumbnail,
          channel: it.channel,
          source: 'youtube',
          url: `https://www.youtube.com/watch?v=${it.id}`,
          embeddable: it.embeddable !== false,
        }))
      )
      if (!items.length) toast('No YouTube results', { variant: 'warning' })
    } catch (err) {
      toast(err.message || 'YouTube search failed', { variant: 'error' })
      setYtResults([])
    } finally {
      setYtLoading(false)
    }
  }

  const onScrape = async (e) => {
    e?.preventDefault?.()
    if (!url.trim() && !searchQuery.trim()) {
      toast('Paste a page URL or enter a title to search', { variant: 'warning' })
      return
    }
    if (isDirectVideoUrl(url)) {
      onUrlChange(url)
      toast('Direct video link selected', { variant: 'success' })
      return
    }
    // If user pasted an O2TV show page, enter hierarchical flow
    if (isO2TvUrl(url.trim())) {
      const slug = parseShowSlugFromUrl(url.trim())
      if (slug) {
        setO2ShowSlug(slug)
        setO2ShowName(searchQuery.trim() || title || slug.replace(/-/g, ' '))
        loadO2Seasons({
          showSlug: slug,
          showName: searchQuery.trim() || title || slug.replace(/-/g, ' '),
          thumbnail: o2Thumbnail,
        })
        return
      }
    }
    setO2Stage(null)
    await scrape({
      url: url.trim() || undefined,
      query: searchQuery.trim() || undefined,
      site: scraperSite,
    })
  }

  const selectVideo = (item) => {
    setError(null)
    setEmbedWarning(null)

    if (item.source === 'youtube' && item.id) {
      setVideoId(item.id)
      setVideoUrl('')
      setVideoType('youtube')
      setUrl(item.url || `https://youtube.com/watch?v=${item.id}`)
      if (item.title) setTitle((t) => t || item.title)
      setYtResults([])
      clear()
      setO2Stage(null)
      checkEmbeddable(item.id).then((r) => {
        if (!r.embeddable) setEmbedWarning(r.reason)
      })
      return
    }

    const candidate = item.link || item.url || ''
    const candidateStr = typeof candidate === 'string' ? candidate : ''
    const itemTitle = typeof item.title === 'string' ? item.title : (item.title != null ? String(item.title) : '')

    // Already playable (proxy / mp4) — never force into season browser
    if (item.isDirect || item.playableInRoom || isDirectVideoUrl(candidateStr) || /\/api\/proxy\?/i.test(candidateStr)) {
      if (!candidateStr) {
        toast('That result has no usable URL.', { variant: 'warning' })
        return
      }
      const normalizedCandidate = normalizePlaybackUrl(candidateStr)
      setVideoUrl(normalizedCandidate)
      setVideoId('')
      setVideoType('direct')
      setUrl(candidateStr)
      if (itemTitle) setTitle((t) => t || itemTitle)
      if (item.thumbnail || item.image) setO2Thumbnail(safeThumb(item.thumbnail || item.image))
      clear()
      setO2Stage(null)
      toast('Direct video link selected', { variant: 'success' })
      return
    }

    // O2TV show listing → seasons browser (page URLs only)
    const isO2ShowBrowse =
      item.o2tvKind === 'show'
      || (
        (item.source === 'o2tv' || isO2TvUrl(candidateStr))
        && !item.isDirect
        && !isDirectVideoUrl(candidateStr)
        && !/\/api\/proxy\?/i.test(candidateStr)
      )

    if (isO2ShowBrowse) {
      const slug = item.showSlug || parseShowSlugFromUrl(candidateStr)
      const name = (typeof item.showName === 'string' && item.showName) || itemTitle || 'TV Show'
      const thumb = safeThumb(item.thumbnail || item.image)
      if (slug) {
        setO2ShowSlug(slug)
        setO2ShowName(name)
        if (thumb) setO2Thumbnail(thumb)
        if (itemTitle) setTitle((t) => t || name)
        clear()
        loadO2Seasons({ showSlug: slug, showName: name, thumbnail: thumb })
        return
      }
    }

    if (item.requiresUserAction && candidateStr && !item.isDirect && !isDirectVideoUrl(candidateStr)) {
      window.open(candidateStr, '_blank', 'noopener,noreferrer')
      toast('Opened the page. Complete any download step there, then paste the final HTTPS video URL into Chan.', {
        variant: 'info',
        duration: 8000,
      })
      return
    }

    if (candidateStr && (item.isDirect || isDirectVideoUrl(candidateStr) || /\/api\/proxy\?/i.test(candidateStr))) {
      const normalizedCandidate = normalizePlaybackUrl(candidateStr)
      setVideoUrl(normalizedCandidate)
      setVideoId('')
      setVideoType('direct')
      setUrl(candidateStr)
      if (itemTitle) setTitle((t) => t || itemTitle)
      if (item.thumbnail || item.image) setO2Thumbnail(safeThumb(item.thumbnail || item.image))
      clear()
      setO2Stage(null)
      toast('Direct video link selected', { variant: 'success' })
      return
    }

    if (candidateStr) {
      setSearchMode('scraper')
      setScraperSite('custom')
      setUrl(candidateStr)
      setYtResults([])
      toast('Page link loaded. Click Extract links to look for a playable file.', {
        variant: 'info',
        duration: 6000,
      })
    } else {
      toast('That result has no usable URL.', { variant: 'warning' })
    }
  }

  const create = async (e) => {
    e.preventDefault()
    setError(null)
    setCreating(true)
    try {
      const roomTitle = typeof title === 'string' ? title.trim() : ''
      if (!roomTitle) throw new Error('Give the room a title')
      if (videoType === 'youtube' && !videoId) {
        throw new Error('Pick a valid YouTube video')
      }

      let resolvedUrl = (typeof videoUrl === 'string' && videoUrl) || (typeof url === 'string' && url) || ''
      if (resolvedUrl && typeof resolvedUrl !== 'string') {
        throw new Error('Invalid video URL — pick an episode again')
      }

      // Only re-resolve page URLs that are not already proxied / direct files
      if (
        isO2TvUrl(resolvedUrl)
        && !/\/api\/proxy\?/i.test(resolvedUrl)
        && !isDirectVideoUrl(resolvedUrl)
      ) {
        throw new Error('Pick a season and episode first, then create the room')
      }

      if (
        /downloadwella\.com|fsmc/i.test(resolvedUrl)
        && !/\/api\/proxy\?/i.test(resolvedUrl)
      ) {
        try {
          const data = await mediaPost({
            action: 'scrape',
            url: resolvedUrl,
            options: { resolve: true },
          })
          const list = Array.isArray(data.results) ? data.results : []
          const ranked = [...list].sort((a, b) => {
            const score = (it) => {
              let s = 0
              if (it.isDirect || it.playableInRoom) s += 20
              if (/\/api\/proxy\?/i.test(it.url || it.link || '')) s += 15
              if (it.container === 'mp4' || /\.mp4/i.test(it.url || '')) s += 10
              if (it.container === 'mkv' || /\.mkv/i.test(it.url || '')) s -= 5
              if (it.requiresUserAction) s -= 20
              return s
            }
            return score(b) - score(a)
          })
          const best = ranked[0]
          if (best?.url && (best.isDirect || best.playableInRoom || /\/api\/proxy\?/i.test(best.url))) {
            resolvedUrl = best.url
          } else if (data.expired || best?.requiresUserAction) {
            throw new Error(best?.meta || 'Could not resolve download link')
          }
        } catch (err) {
          console.error('Download resolution failed:', err)
          if (err.message && /expired|resolve|download/i.test(err.message)) throw err
        }
      }

      const finalDirectUrl = normalizePlaybackUrl(resolvedUrl)
      const isActualUrl = typeof finalDirectUrl === 'string' && (/^https?:\/\//i.test(finalDirectUrl) || finalDirectUrl.startsWith('/api/proxy'))
      if (videoType === 'direct' || videoType === 'iptv' || videoType === 'sports' || videoType === 'nsfw') {
        if (!isActualUrl && !presetIsStream) {
          throw new Error(
            o2Stage && o2Stage !== 'ready'
              ? 'Select a season and episode first'
              : `Please search and select a video, or paste a full URL starting with http:// or https://`
          )
        }
        if (!finalDirectUrl || (!isDirectVideoUrl(finalDirectUrl) && !presetIsStream && !finalDirectUrl.includes('/api/proxy'))) {
          throw new Error('Paste a direct video file link (.mp4 / .m3u8 / .mkv) or pick an episode')
        }
      }

      if (videoType === 'youtube' && videoId) {
        const check = await checkEmbeddable(videoId)
        if (!check.embeddable) {
          throw new Error(
            check.reason ||
              'This YouTube video cannot be embedded in Chan. Choose a different video.'
          )
        }
      }

      const roomId = doc(collection(db, 'rooms')).id
      const inviteCode = isPrivate ? makeInviteCode() : ''

      const roomData = {
        hostId: user.uid,
        hostName: user.displayName || 'Host',
        title: roomTitle,
        activityType: videoType === 'direct' ? 'direct' : 'youtube',
        isPrivate,
        inviteCode,
        coHosts: [],
        locked: false,
        capacity: Math.min(Math.max(Number(capacity) || 12, 1), 12),
        participantCount: 0,
        status: 'live',
        createdAt: serverTimestamp(),
        lastHeartbeat: serverTimestamp(),
      }

      if (videoType === 'youtube' && videoId) {
        roomData.videoId = videoId
        roomData.videoType = 'youtube'
      } else if (finalDirectUrl) {
        roomData.videoUrl = finalDirectUrl
        // Prefer explicit state (iptv/nsfw/sports), then query preset, then direct
        const streamType = ['iptv', 'sports', 'nsfw'].includes(videoType)
          ? videoType
          : (['iptv', 'sports', 'nsfw'].includes(presetType) ? presetType : 'direct')
        roomData.videoType = streamType
        roomData.activityType = streamType === 'direct' ? 'direct' : streamType
        if (presetIsLive || isLiveStream || streamType === 'iptv' || streamType === 'sports') {
          roomData.isLive = true
        }
        if (o2Thumbnail) roomData.thumbnail = o2Thumbnail
      }

      roomData.participantCount = 1

      await setDoc(doc(db, 'rooms', roomId), roomData)

      const playerState = {
        isPlaying: false,
        currentTime: 0,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      }
      if (videoId) playerState.videoId = videoId
      if (finalDirectUrl) playerState.videoUrl = finalDirectUrl

      await setDoc(doc(db, 'rooms', roomId, 'playerState', 'current'), playerState)

      const joinToken = await user.getIdToken()
      let joinOk = false
      let lastJoinError = null
      for (let attempt = 0; attempt < 3 && !joinOk; attempt += 1) {
        try {
          const joinRes = await fetch('/api/room', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${joinToken}`,
            },
            body: JSON.stringify({
              action: 'join',
              roomId,
              uid: user.uid,
              displayName: user.displayName || 'Host',
              inviteCode: inviteCode || undefined,
            }),
          })
          const joinData = await parseJsonResponse(joinRes)
          if (!joinRes.ok) {
            lastJoinError = new Error(joinData.error || 'Could not add host to room')
            await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
            continue
          }
          joinOk = true
        } catch (err) {
          lastJoinError = err
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
        }
      }
      if (!joinOk) {
        try {
          await deleteDoc(doc(db, 'rooms', roomId, 'playerState', 'current')).catch(() => {})
          await deleteDoc(doc(db, 'rooms', roomId)).catch(() => {})
        } catch {
          /* best-effort cleanup */
        }
        throw lastJoinError || new Error('Could not add host to room')
      }

      toast('Room created', { variant: 'success' })
      navigate(`/room/${roomId}${inviteCode ? `?invite=${inviteCode}` : ''}`)
    } catch (err) {
      console.error('Create room error:', err)
      setError(err.message || 'Could not create room. Please try again.')
      toast(err.message || 'Could not create room', { variant: 'error' })
      setCreating(false)
    }
  }

  const listResults = searchMode === 'youtube' ? ytResults : results
  const showO2Browser = o2Stage === 'seasons' || o2Stage === 'episodes' || o2Stage === 'ready' || o2Loading || o2Error
  const canCreate = Boolean(videoId || videoUrl)

  return (
    <div className={styles.page}>
      <Card className={styles.card}>
        <h1 className={styles.title}>Start a Room</h1>
        <p className={styles.subtitle}>
          Pick YouTube, search TV shows (O2TV / progressive MP4), or paste a direct .mp4 / .m3u8 link.
        </p>

        {/* O2TV hierarchical browser: show → seasons → episodes → resolve */}
        {showO2Browser && (
          <div className={styles.nkiriSection}>
            <div className={styles.o2Header}>
              {o2Thumbnail && (
                <img
                  src={o2Thumbnail}
                  alt=""
                  className={styles.o2Poster}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              )}
              <div className={styles.o2HeaderText}>
                <h2 className={styles.nkiriTitle}>
                  {o2ShowName || presetTitle || 'Select season / episode'}
                </h2>
                <p className={styles.o2Breadcrumb}>
                  {o2Stage === 'seasons' && 'Choose a season'}
                  {o2Stage === 'episodes' && (
                    <>
                      Season {o2SeasonNum}
                      {' · '}
                      <button
                        type="button"
                        className={styles.o2BackLink}
                        onClick={() => {
                          setO2Stage('seasons')
                          setO2Episodes([])
                          setSelectedSeasonIdx(null)
                          setSelectedEpisodeIdx(null)
                          setVideoUrl('')
                          setO2Error(null)
                        }}
                      >
                        ← All seasons
                      </button>
                    </>
                  )}
                  {o2Stage === 'ready' && 'Episode ready to play'}
                </p>
              </div>
            </div>

            {o2Loading && (
              <p className={styles.o2Status}>
                {o2Stage === 'episodes' ? 'Loading episodes…' : 'Loading seasons…'}
              </p>
            )}

            {o2Error && !o2Loading && (
              <div className={styles.nkiriError}>
                <p>{o2Error}</p>
                <button
                  type="button"
                  className={styles.retryButton}
                  onClick={() => {
                    setO2Error(null)
                    if (o2Stage === 'episodes' && o2SeasonNum) {
                      loadO2Episodes(o2SeasonNum, selectedSeasonIdx)
                    } else if (o2ShowSlug) {
                      loadO2Seasons({ showSlug: o2ShowSlug, showName: o2ShowName, thumbnail: o2Thumbnail })
                    }
                  }}
                >
                  Retry
                </button>
              </div>
            )}

            {!o2Loading && o2Stage === 'seasons' && o2Seasons.length > 0 && (
              <div className={styles.episodeGrid}>
                {o2Seasons.map((season, idx) => (
                  <button
                    key={season.seasonNum || season.url || idx}
                    type="button"
                    className={`${styles.episodeCard} ${selectedSeasonIdx === idx ? styles.episodeSelected : ''}`}
                    onClick={() => loadO2Episodes(season.seasonNum || idx + 1, idx)}
                  >
                    {(season.thumbnail || o2Thumbnail) && (
                      <img
                        src={season.thumbnail || o2Thumbnail}
                        alt=""
                        className={styles.episodeThumb}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                    )}
                    <span className={styles.episodeTitle}>
                      {season.label || season.title || `Season ${season.seasonNum || idx + 1}`}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {!o2Loading && o2Stage === 'episodes' && o2Episodes.length > 0 && (
              <div className={styles.episodeGrid}>
                {o2Episodes.map((ep, idx) => (
                  <button
                    key={ep.episodeNum || ep.url || idx}
                    type="button"
                    className={`${styles.episodeCard} ${selectedEpisodeIdx === idx ? styles.episodeSelected : ''}`}
                    disabled={resolvingEpisode}
                    onClick={() => resolveO2Episode(ep, idx)}
                  >
                    {(ep.thumbnail || o2Thumbnail) && (
                      <img
                        src={ep.thumbnail || o2Thumbnail}
                        alt=""
                        className={styles.episodeThumb}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                    )}
                    <span className={styles.episodeTitle}>
                      {ep.label || ep.title || `Episode ${ep.episodeNum || idx + 1}`}
                    </span>
                    {resolvingEpisode && selectedEpisodeIdx === idx && (
                      <span className={styles.o2Resolving}>Resolving…</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {o2Stage === 'ready' && videoUrl && (
              <div className={styles.o2Ready}>
                <span className={styles.selectedText}>Episode resolved — ready to create room</span>
                <button
                  type="button"
                  className={styles.o2BackLink}
                  onClick={() => {
                    setO2Stage('episodes')
                    setVideoUrl('')
                    setSelectedEpisodeIdx(null)
                  }}
                >
                  Change episode
                </button>
              </div>
            )}
          </div>
        )}

        <form onSubmit={create} className={styles.form}>
          <Input
            placeholder="Room title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={80}
          />

          <div className={styles.tabs}>
            <button
              type="button"
              className={searchMode === 'youtube' ? styles.tabActive : styles.tab}
              onClick={() => {
                setSearchMode('youtube')
                clear()
              }}
            >
              YouTube
            </button>
            <button
              type="button"
              className={searchMode === 'scraper' ? styles.tabActive : styles.tab}
              onClick={() => {
                setSearchMode('scraper')
                setYtResults([])
              }}
            >
              TV Shows / Direct
            </button>
          </div>

          {searchMode === 'youtube' ? (
            <>
              <Input
                placeholder="Paste YouTube URL"
                value={url}
                onChange={(e) => onUrlChange(e.target.value)}
              />
              <div className={styles.row}>
                <Input
                  placeholder="Or search YouTube"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <Button
                  variant="secondary"
                  type="button"
                  onClick={onYtSearch}
                  className={styles.searchButton}
                  loading={ytLoading}
                >
                  Search
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className={styles.note}>
                Search TV shows (O2TV) or paste a direct .mp4 / .m3u8 link. Pick a season, then an episode.
              </p>
              <div className={styles.row}>
                <Input
                  placeholder="Paste direct URL or search keywords (Silo, House of the Dragon...)"
                  value={url || searchQuery}
                  onChange={(e) => {
                    const val = e.target.value
                    onUrlChange(val)
                    setSearchQuery(val)
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onScrape}
                  loading={scraperLoading}
                >
                  Search / Extract
                </Button>
              </div>
            </>
          )}

          {listResults.length > 0 && (
            <div className={styles.results}>
              {listResults.map((item, idx) => {
                const playable =
                  (item.source === 'youtube' && item.id) ||
                  item.isDirect ||
                  isDirectVideoUrl(item.link || item.url)
                const thumb = safeThumb(item.thumbnail || item.image)
                return (
                  <button
                    key={item.id || item.link || item.url || idx}
                    type="button"
                    className={`${styles.result} ${!playable ? styles.resultMuted : ''}`}
                    onClick={() => selectVideo(item)}
                  >
                    {thumb && (
                      <img
                        src={thumb}
                        alt=""
                        className={styles.resultThumb}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                    )}
                    <p className={styles.resultTitle}>{item.title}</p>
                    <span className={styles.resultSource}>
                      {item.o2tvKind === 'show' || item.source === 'o2tv'
                        ? 'TV show — open seasons'
                        : playable
                          ? 'Ready to play'
                          : 'Select to continue'}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {(videoId || videoUrl) && (
            <div className={styles.selected}>
              {videoType === 'youtube' && videoId && (
                <img src={getThumbnail(videoId)} alt="" className={styles.selectedThumb} />
              )}
              {videoType !== 'youtube' && o2Thumbnail && (
                <img
                  src={o2Thumbnail}
                  alt=""
                  className={styles.selectedThumb}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              )}
              <span className={styles.selectedText}>
                {videoType === 'youtube' ? `YouTube: ${videoId}` : 'Direct video link selected'}
              </span>
            </div>
          )}

          {embedWarning && <p className={styles.warning}>{embedWarning}</p>}

          <div className={styles.settings}>
            <label className={styles.setting}>
              <span className={styles.note}>Capacity</span>
              <Input
                type="number"
                min={1}
                max={12}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </label>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
              />
              Private room
            </label>
          </div>

          <Button type="submit" loading={creating} fullWidth disabled={!canCreate || resolvingEpisode} variant="cta">
            Create Room
          </Button>
        </form>

        {error && <p className={styles.error}>{error}</p>}
        {scraperError && <p className={styles.error}>{scraperError}</p>}

        <p className={styles.footer}>
          <button
            type="button"
            className={styles.cancelLink}
            onClick={() => {
              const from = location.state?.from
              if (from) navigate(from)
              else if (window.history.length > 1) navigate(-1)
              else navigate('/media')
            }}
          >
            Cancel
          </button>
        </p>
      </Card>
    </div>
  )
}
