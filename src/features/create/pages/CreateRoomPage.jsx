import { useState, useEffect } from 'react'
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
import { Button, Input, Card, useToast } from '../../../shared/ui/index.js'
import styles from './CreateRoomPage.module.css'

function makeInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

export default function CreateRoomPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { toast } = useToast()
  const { scrape, results, loading: scraperLoading, error: scraperError, clear } = useScraper()

  const presetVideo = searchParams.get('video') || ''
  const presetVideoUrl = searchParams.get('videoUrl') || ''
  const presetTitle = searchParams.get('title') || ''
  const presetType = searchParams.get('type') || 'youtube'
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
  const [scraperSite, setScraperSite] = useState('netnaija')
  const [videoId, setVideoId] = useState(presetVideo)
  const [videoUrl, setVideoUrl] = useState(presetVideoUrl ? normalizePlaybackUrl(presetVideoUrl) : '')
  const [videoType, setVideoType] = useState(presetIsStream || presetVideoUrl ? 'direct' : 'youtube')
  const [isLiveStream, setIsLiveStream] = useState(presetIsLive)
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)
  const [embedWarning, setEmbedWarning] = useState(null)
  const [ytResults, setYtResults] = useState([])
  const [ytLoading, setYtLoading] = useState(false)
  const [nkiriEpisodes, setNkiriEpisodes] = useState([])
  const [nkiriLoading, setNkiriLoading] = useState(false)
  const [nkiriError, setNkiriError] = useState(null)
  const [selectedEpisode, setSelectedEpisode] = useState(null)
  const [nkiriDisplayName, setNkiriDisplayName] = useState('')

  useEffect(() => {
    if (!presetVideoUrl || !user) return

    const id = extractVideoId(presetVideoUrl)
    if (id) {
      setVideoId(id)
      setVideoUrl('')
      setVideoType('youtube')
      return
    }

    // Detect Nkiri URLs
    if (/thenkiri\.com|nkiri\.com/i.test(presetVideoUrl)) {
      // Extract a friendly display name from the URL or title
      const urlTitle = presetTitle || presetVideoUrl.split('/').filter(Boolean).pop()?.replace(/[-_]/g, ' ') || 'Nkiri Video'
      setNkiriDisplayName(urlTitle)
      setUrl('') // Clear the URL field to show friendly name instead
      setNkiriLoading(true)
      setNkiriError(null)
      user.getIdToken().then((token) => {
        return fetch('/api/media', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action: 'scrape', url: presetVideoUrl }),
        })
      })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.json()
        })
        .then((data) => {
          if (data.results && data.results.length > 0) {
            // Check if it's the "no episodes" message
            if (data.results[0].meta === 'This page has no downloadable episodes.') {
              setNkiriError('No episodes found on this page. It may be a movie page or the content structure changed.')
            } else {
              setNkiriEpisodes(data.results)
            }
          } else {
            setNkiriError('No content found. The page may not exist or may have invalid structure.')
          }
        })
        .catch((err) => {
          console.error('Nkiri fetch failed:', err)
          setNkiriError(`Failed to load content: ${err.message}. The URL may be invalid or the site may be temporarily unavailable.`)
        })
        .finally(() => setNkiriLoading(false))
      return
    }

    if (presetIsStream || isDirectVideoUrl(presetVideoUrl) || presetVideoUrl) {
      const normalized = normalizePlaybackUrl(presetVideoUrl)
      const isM3u8 = /\\.m3u8(\\?|#|$)/i.test(presetVideoUrl)
      setVideoUrl(normalized)
      setVideoType(isM3u8 ? 'iptv' : 'direct')
      setVideoId('')
    }
  }, [presetIsStream, presetVideoUrl])

  if (!user) return <Link to="/auth">Sign in to create a room</Link>

  const onUrlChange = (value) => {
    setUrl(value)
    setEmbedWarning(null)
    const id = extractVideoId(value)
    if (id) {
      setVideoId(id)
      setVideoUrl('')
      setVideoType('youtube')
      // Detect YouTube live streams
      const isYtLive = /youtube\.com\/live\//i.test(value)
      setIsLiveStream(isYtLive)
      clear()
      setYtResults([])
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
        // No client-side key — use the server-side search instead.
        // This works as long as YOUTUBE_API_KEY (or VITE_YOUTUBE_API_KEY)
        // is configured on the Vercel server.
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
      checkEmbeddable(item.id).then((r) => {
        if (!r.embeddable) setEmbedWarning(r.reason)
      })
      return
    }

    const candidate = item.link || item.url || ''
    if (item.requiresUserAction && candidate && !item.isDirect && !isDirectVideoUrl(candidate)) {
      window.open(candidate, '_blank', 'noopener,noreferrer')
      toast('Opened the page. Complete any download step there, then paste the final HTTPS video URL into Chan.', {
        variant: 'info',
        duration: 8000,
      })
      return
    }

    if (item.isDirect || isDirectVideoUrl(candidate) || candidate) {
      const normalizedCandidate = normalizePlaybackUrl(candidate)
      setVideoUrl(normalizedCandidate)
      setVideoId('')
      setVideoType('direct')
      setUrl(candidate)
      if (item.title) setTitle((t) => t || item.title)
      clear()
      toast('Direct video link selected', { variant: 'success' })
      return
    }

    if (candidate) {
      setSearchMode('scraper')
      setScraperSite('custom')
      setUrl(candidate)
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
      if (!title.trim()) throw new Error('Give the room a title')
      if (videoType === 'youtube' && !videoId) {
        throw new Error('Pick a valid YouTube video')
      }
      
      // Resolve Nkiri page → episodes, or DownloadWella landing → direct/proxy URL.
      // Server uses form-walk (no Puppeteer required on Vercel Hobby).
      let resolvedUrl = videoUrl || url || ''
      if (/downloadwella\.com|thenkiri\.com|nkiri\.com|fsmc/i.test(resolvedUrl) && !/\/api\/proxy\?/i.test(resolvedUrl)) {
        try {
          const token = await user.getIdToken()
          const res = await fetch('/api/media', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ action: 'scrape', url: resolvedUrl, options: { resolve: true } }),
          })
          const data = await res.json()
          const list = Array.isArray(data.results) ? data.results : []
          // Prefer already-playable proxy/direct results; then MP4 over MKV
          const ranked = [...list].sort((a, b) => {
            const score = (it) => {
              let s = 0
              if (it.isDirect || it.playableInRoom) s += 20
              if (/\/api\/proxy\?/i.test(it.url || it.link || '')) s += 15
              if (it.container === 'mp4' || /\.mp4/i.test(it.url || '') || /\bmp4\b/i.test(it.title || '')) s += 10
              if (it.container === 'mkv' || /\.mkv/i.test(it.url || '') || /\bmkv\b/i.test(it.title || '')) s -= 5
              if (it.requiresUserAction) s -= 20
              return s
            }
            return score(b) - score(a)
          })
          const best = ranked[0]
          if (best?.url && (best.isDirect || best.playableInRoom || /\/api\/proxy\?/i.test(best.url))) {
            resolvedUrl = best.url
          } else if (best?.url && /downloadwella\.com/i.test(best.url) && !/downloadwella\.com/i.test(resolvedUrl)) {
            // Nkiri page returned episode list — resolve the best DownloadWella link now
            const epRes = await fetch('/api/media', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ action: 'scrape', url: best.url }),
            })
            const epData = await epRes.json()
            const playable = (epData.results || []).find((r) => r.isDirect || r.playableInRoom || /\/api\/proxy\?/i.test(r.url || ''))
            if (playable?.url) resolvedUrl = playable.url
            else if (data.expired || epData.expired) {
              throw new Error(epData.results?.[0]?.meta || data.results?.[0]?.meta || 'Download link expired — pick the episode again from Nkiri for a fresh token')
            }
          } else if (data.expired || best?.requiresUserAction) {
            throw new Error(best?.meta || data.results?.[0]?.meta || 'Could not resolve DownloadWella link — try another quality (prefer MP4) or re-open Nkiri')
          }
        } catch (err) {
          console.error('Nkiri/Downloadwella resolution failed:', err)
          if (err.message && /expired|resolve|MP4|Nkiri/i.test(err.message)) throw err
        }
      }
      
      const finalDirectUrl = normalizePlaybackUrl(resolvedUrl)
      const isActualUrl = typeof finalDirectUrl === 'string' && (/^https?:\/\//i.test(finalDirectUrl) || finalDirectUrl.startsWith('/api/proxy'))
      if (videoType === 'direct') {
        if (!isActualUrl && !presetIsStream) {
          throw new Error(`Please click 'Search / Extract' to find '${url || searchQuery || 'your movie'}' and select a video from the results below, or paste a full URL starting with http:// or https://`)
        }
        if (!finalDirectUrl || (!isDirectVideoUrl(finalDirectUrl) && !presetIsStream && !finalDirectUrl.includes('/api/proxy'))) {
          throw new Error('Paste a direct video file link (.mp4 / .m3u8 / .mkv)')
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
        title: title.trim(),
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
        // Preserve IPTV / sports / NSFW type so the player treats live streams correctly
        roomData.videoType = ['iptv', 'sports', 'nsfw'].includes(presetType) ? presetType : 'direct'
        roomData.activityType = roomData.videoType === 'direct' ? 'direct' : roomData.videoType
        if (presetIsLive || isLiveStream) roomData.isLive = true
      }

      // Seed participantCount=1 + heartbeat so opportunistic cleanup never treats
      // this brand-new room as empty while the host is still joining.
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
      // Retry join a few times — cold starts / transient auth can fail once.
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
            // Brief backoff before retry
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
        // Don't leave an orphan room doc that cleanup will eventually wipe —
        // delete the half-created room, then surface the error.
        try {
          await deleteDoc(doc(db, 'rooms', roomId, 'playerState', 'current')).catch(() => {})
          await deleteDoc(doc(db, 'rooms', roomId)).catch(() => {})
        } catch {
          /* best-effort cleanup */
        }
        throw lastJoinError || new Error('Could not add host to room')
      }

      toast('Room created', { variant: 'success' })
      // Keep creating=true until navigation unmounts — prevents double-submit
      // if the user mashes Create while the router is transitioning.
      navigate(`/room/${roomId}${inviteCode ? `?invite=${inviteCode}` : ''}`)
    } catch (err) {
      console.error('Create room error:', err)
      setError(err.message || 'Could not create room. Please try again.')
      toast(err.message || 'Could not create room', { variant: 'error' })
      setCreating(false)
    }
  }

  const listResults = searchMode === 'youtube' ? ytResults : results

  return (
    <div className={styles.page}>
      <Card className={styles.card}>
        <h1 className={styles.title}>Start a Room</h1>
        <p className={styles.subtitle}>
          Pick an embeddable YouTube video, or a direct video file URL (.mp4 / .m3u8).
        </p>


        {/* Nkiri Episode Grid */}
        {(nkiriEpisodes.length > 0 || nkiriError) && (
          <div className={styles.nkiriSection}>
            <h2 className={styles.nkiriTitle}>{presetTitle || 'Select Episode'}</h2>
            {nkiriLoading ? (
              <p>Loading episodes...</p>
            ) : nkiriError ? (
              <div className={styles.nkiriError}>
                <p>{nkiriError}</p>
                <button
                  type="button"
                  className={styles.retryButton}
                  onClick={() => {
                    setNkiriEpisodes([])
                    setNkiriError(null)
                    // Re-trigger the fetch
                    const event = new CustomEvent('nkiri-retry', { detail: presetVideoUrl })
                    window.dispatchEvent(event)
                  }}
                >
                  Retry
                </button>
              </div>
            ) : (
              <div className={styles.episodeGrid}>
                {nkiriEpisodes.map((ep, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`${styles.episodeCard} ${selectedEpisode === idx ? styles.episodeSelected : ''}`}
                    onClick={() => {
                      setSelectedEpisode(idx)
                      setVideoUrl(ep.url)
                      setTitle(ep.title || `Episode ${idx + 1}`)
                    }}
                  >
                    {ep.thumbnail && (
                      <img src={ep.thumbnail} alt="" className={styles.episodeThumb} />
                    )}
                    <span className={styles.episodeTitle}>{ep.title || `Episode ${idx + 1}`}</span>
                  </button>
                ))}
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
              Direct / Scraper
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
                Paste a direct .mp4/.m3u8 link, or type a movie/show title (e.g. Silo) to search.
              </p>
              <div className={styles.row}>
                <Input
                  placeholder="Paste direct URL or search keywords (Silo, House of the Dragon...)"
                  value={nkiriDisplayName || url || searchQuery}
                  onChange={(e) => {
                    const val = e.target.value
                    setNkiriDisplayName('') // Clear friendly name when user types
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
                return (
                  <button
                    key={item.id || item.link || idx}
                    type="button"
                    className={`${styles.result} ${!playable ? styles.resultMuted : ''}`}
                    onClick={() => selectVideo(item)}
                  >
                    {(item.thumbnail || item.image) && (
                      <img
                        src={item.thumbnail || item.image}
                        alt=""
                        className={styles.resultThumb}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                    )}
                    <p className={styles.resultTitle}>{item.title}</p>
                    <span className={styles.resultSource}>
                      {playable ? 'Ready to play' : 'Select to continue'}
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

          <Button type="submit" loading={creating} fullWidth disabled={!videoId && !videoUrl} variant="cta">
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
              // Prefer explicit return path (from /media or /search), else browser history, else /media
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
