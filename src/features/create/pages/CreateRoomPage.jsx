import { useState, useEffect } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { doc, setDoc, serverTimestamp, collection } from 'firebase/firestore'
import { db } from '../../../shared/lib/firebase.js'
import { useAuth } from '../../../shared/auth/hooks/useAuth.jsx'
import {
  extractVideoId,
  getThumbnail,
  isDirectVideoUrl,
  isMixedContentUrl,
  normalizeDirectUrl,
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
  const [searchParams] = useSearchParams()
  const { toast } = useToast()
  const { scrape, results, loading: scraperLoading, error: scraperError, clear } = useScraper()

  const presetVideo = searchParams.get('video') || ''
  const presetVideoUrl = searchParams.get('videoUrl') || ''
  const presetTitle = searchParams.get('title') || ''
  const presetType = searchParams.get('type') || 'youtube'
  const presetIsStream = presetType === 'direct' || presetType === 'iptv' || presetType === 'sports'

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
  const [videoUrl, setVideoUrl] = useState(presetVideoUrl)
  const [videoType, setVideoType] = useState(presetIsStream ? 'direct' : 'youtube')
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)
  const [embedWarning, setEmbedWarning] = useState(null)
  const [ytResults, setYtResults] = useState([])
  const [ytLoading, setYtLoading] = useState(false)

  useEffect(() => {
    if (!presetVideoUrl) return

    const id = extractVideoId(presetVideoUrl)
    if (id) {
      setVideoId(id)
      setVideoUrl('')
      setVideoType('youtube')
      return
    }

    if (presetIsStream || isDirectVideoUrl(presetVideoUrl)) {
      setVideoUrl(normalizeDirectUrl(presetVideoUrl))
      setVideoType('direct')
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
      clear()
      setYtResults([])
      checkEmbeddable(id).then((r) => {
        if (!r.embeddable) setEmbedWarning(r.reason)
        else if (r.title && !title) setTitle(r.title)
      })
      return
    }
    if (isDirectVideoUrl(value)) {
      setVideoUrl(normalizeDirectUrl(value.trim()))
      setVideoId('')
      setVideoType('direct')
      setEmbedWarning(
        isMixedContentUrl(value)
          ? 'This HTTP stream will be blocked by an HTTPS deployment. Use an HTTPS source.'
          : null
      )
      clear()
      setYtResults([])
    }
  }

  const onYtSearch = async (e) => {
    e?.preventDefault?.()
    if (!searchQuery.trim()) return
    if (!hasYouTubeApiKey()) {
      toast('Add VITE_YOUTUBE_API_KEY for YouTube search, or paste a video URL', {
        variant: 'warning',
      })
      return
    }
    setYtLoading(true)
    setError(null)
    try {
      const items = await searchYouTube(searchQuery.trim(), 12)
      setYtResults(
        items.map((it) => ({
          id: it.id,
          title: it.title,
          thumbnail: it.thumbnail,
          channel: it.channelTitle,
          source: 'youtube',
          url: `https://www.youtube.com/watch?v=${it.id}`,
          embeddable: true,
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
    if (!url.trim()) {
      toast('Paste a page URL first', { variant: 'warning' })
      return
    }
    if (isDirectVideoUrl(url)) {
      onUrlChange(url)
      toast('Direct video link selected', { variant: 'success' })
      return
    }
    await scrape({ url: url.trim(), site: scraperSite })
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
    if (item.isDirect || isDirectVideoUrl(candidate)) {
      setVideoUrl(normalizeDirectUrl(candidate))
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
      if (
        videoType === 'direct' &&
        (!videoUrl || (!isDirectVideoUrl(videoUrl) && !presetIsStream))
      ) {
        throw new Error('Paste a direct video file link (.mp4 / .m3u8)')
      }
      if (videoType === 'direct' && isMixedContentUrl(videoUrl)) {
        throw new Error('This HTTP stream cannot play from the secure app. Use an HTTPS video source.')
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
      } else if (videoType === 'direct' && videoUrl) {
        roomData.videoUrl = videoUrl
        roomData.videoType = 'direct'
        roomData.activityType = 'direct'
      }

      await setDoc(doc(db, 'rooms', roomId), roomData)

      const playerState = {
        isPlaying: false,
        currentTime: 0,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      }
      if (videoId) playerState.videoId = videoId
      if (videoUrl) playerState.videoUrl = videoUrl

      await setDoc(doc(db, 'rooms', roomId, 'playerState', 'current'), playerState)

      const joinToken = await user.getIdToken()
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
      if (!joinRes.ok) throw new Error(joinData.error || 'Could not add host to room')

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

  return (
    <div className={styles.page}>
      <Card className={styles.card}>
        <h1 className={styles.title}>Start a Room</h1>
        <p className={styles.subtitle}>
          Pick an embeddable YouTube video, or a direct video file URL (.mp4 / .m3u8).
        </p>

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
                Prefer a direct .mp4/.m3u8 URL. Scraping often only finds webpage links.
              </p>
              <select
                className={styles.select}
                value={scraperSite}
                onChange={(e) => setScraperSite(e.target.value)}
              >
                <option value="netnaija">NetNaija</option>
                <option value="nkiri">Nkiri</option>
                <option value="fzmovies">FZMovies</option>
                <option value="custom">Other Site</option>
              </select>
              <Input
                placeholder="Page URL or direct .mp4 link"
                value={url}
                onChange={(e) => onUrlChange(e.target.value)}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={onScrape}
                loading={scraperLoading}
                fullWidth
              >
                Extract links
              </Button>
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
                      {item.source || 'link'}
                      {playable ? ' · playable' : ' · page only'}
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

          <Button type="submit" loading={creating} fullWidth disabled={!videoId && !videoUrl}>
            Create room
          </Button>
        </form>

        {error && <p className={styles.error}>{error}</p>}
        {scraperError && <p className={styles.error}>{scraperError}</p>}

        <p className={styles.footer}>
          <Link to="/">Cancel</Link>
        </p>
      </Card>
    </div>
  )
}
