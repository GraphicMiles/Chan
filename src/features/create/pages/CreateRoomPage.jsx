import { useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { doc, setDoc, serverTimestamp, collection } from 'firebase/firestore'
import { db } from '../../../shared/lib/firebase.js'
import { useAuth } from '../../../shared/auth/hooks/useAuth.jsx'
import {
  extractVideoId,
  getThumbnail,
  isDirectVideoUrl,
  checkEmbeddable,
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
  const { scrape, search, results, loading: scraperLoading, error: scraperError, clear } = useScraper()

  const presetVideo = searchParams.get('video') || ''
  const presetVideoUrl = searchParams.get('videoUrl') || ''
  const presetTitle = searchParams.get('title') || ''
  const presetType = searchParams.get('type') || 'youtube'

  const [title, setTitle] = useState(presetTitle)
  const [url, setUrl] = useState(presetVideo ? `https://youtube.com/watch?v=${presetVideo}` : presetVideoUrl)
  const [capacity, setCapacity] = useState(12)
  const [isPrivate, setIsPrivate] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMode, setSearchMode] = useState('youtube')
  const [scraperSite, setScraperSite] = useState('netnaija')
  const [videoId, setVideoId] = useState(presetVideo)
  const [videoUrl, setVideoUrl] = useState(presetVideoUrl)
  const [videoType, setVideoType] = useState(presetType)
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)
  const [embedWarning, setEmbedWarning] = useState(null)

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
      checkEmbeddable(id).then((r) => {
        if (!r.embeddable) setEmbedWarning(r.reason)
        else if (r.title && !title) setTitle(r.title)
      })
      return
    }
    if (isDirectVideoUrl(value)) {
      setVideoUrl(value.trim())
      setVideoId('')
      setVideoType('direct')
      clear()
    }
  }

  const onSearch = async (e) => {
    e?.preventDefault?.()
    if (!searchQuery.trim()) return
    if (searchMode === 'youtube') {
      await search(searchQuery.trim(), 'youtube')
    } else {
      toast('For movie sites, paste the page URL below and tap Extract', { variant: 'warning' })
    }
  }

  const onScrape = async (e) => {
    e?.preventDefault?.()
    if (!url.trim()) {
      toast('Paste a page URL first', { variant: 'warning' })
      return
    }
    await scrape({ url: url.trim(), site: scraperSite })
  }

  const selectVideo = (item) => {
    setError(null)
    setEmbedWarning(null)

    // YouTube result
    if ((item.source === 'youtube' || item.id) && item.id && !isDirectVideoUrl(item.link || item.url)) {
      if (item.embeddable === false) {
        toast(
          'This video usually cannot play inside Chan (embed blocked — often Vevo). Pick another, or open it on YouTube.',
          { variant: 'warning', duration: 6000 }
        )
        setEmbedWarning(
          'Embed blocked for this video. You can still create the room, but viewers may only see “Video unavailable”.'
        )
      }
      setVideoId(item.id)
      setVideoUrl('')
      setVideoType('youtube')
      setUrl(item.url || item.link || `https://youtube.com/watch?v=${item.id}`)
      if (item.title) setTitle((t) => t || item.title)
      clear()
      return
    }

    const candidate = item.link || item.url || ''
    if (isDirectVideoUrl(candidate) || item.isDirect) {
      setVideoUrl(candidate)
      setVideoId('')
      setVideoType('direct')
      setUrl(candidate)
      if (item.title) setTitle((t) => t || item.title)
      clear()
      toast('Direct video link selected', { variant: 'success' })
      return
    }

    // Page link only — cannot play in room
    toast(
      'That’s a webpage link, not a playable video file. Open it, find a direct .mp4/.m3u8 URL, or pick a YouTube result.',
      { variant: 'warning', duration: 7000 }
    )
    // Keep results so user can try another; open page optional
    if (candidate) {
      // Do not clear — do not set videoId/videoUrl
    }
  }

  const create = async (e) => {
    e.preventDefault()
    setError(null)
    setCreating(true)
    try {
      if (!title.trim()) throw new Error('Give the room a title')
      if (!videoId && !videoUrl) {
        throw new Error('Pick a YouTube video or a direct video file link (.mp4 / .m3u8)')
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
        // Host join will set accurate count; start at 0 to avoid 2/12 bug
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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${joinToken}` },
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

  const getThumbnailUrl = () => {
    if (videoType === 'youtube' && videoId) return getThumbnail(videoId)
    return null
  }

  return (
    <div className={styles.page}>
      <Card className={styles.card}>
        <h1 className={styles.title}>Start a Room</h1>
        <p className={styles.subtitle}>
          Pick an embeddable YouTube video, or paste a direct video file URL (.mp4 / .m3u8) to watch together.
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
                clear()
              }}
            >
              Direct Link / Scraper
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
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      onSearch()
                    }
                  }}
                />
                <Button
                  variant="secondary"
                  type="button"
                  onClick={onSearch}
                  className={styles.searchButton}
                  loading={scraperLoading}
                >
                  Search
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className={styles.note}>
                Paste a <strong>direct</strong> .mp4/.m3u8 URL to play in Chan. Scraping a movie site often only finds
                webpage links — those cannot play inside a room.
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
              <Button type="button" variant="secondary" onClick={onScrape} loading={scraperLoading} fullWidth>
                Extract links from page
              </Button>
            </>
          )}

          {results.length > 0 && (
            <div className={styles.results}>
              {results.map((item, idx) => {
                const blocked = item.source === 'youtube' && item.embeddable === false
                const playable =
                  (item.source === 'youtube' && item.id && item.embeddable !== false) ||
                  item.isDirect ||
                  isDirectVideoUrl(item.link || item.url)
                return (
                  <button
                    key={item.id || item.link || idx}
                    type="button"
                    className={`${styles.result} ${!playable ? styles.resultMuted : ''}`}
                    onClick={() => selectVideo(item)}
                    title={
                      blocked
                        ? 'May not embed in Chan'
                        : playable
                          ? 'Use this video'
                          : 'Page link only — not playable in room'
                    }
                  >
                    {(item.thumbnail || item.image) && (
                      <img
                        src={item.thumbnail || item.image}
                        alt=""
                        className={styles.resultThumb}
                        onError={(e) => {
                          e.target.style.display = 'none'
                        }}
                      />
                    )}
                    <p className={styles.resultTitle}>{item.title}</p>
                    <span className={styles.resultSource}>
                      {item.source || 'link'}
                      {blocked ? ' · no embed' : playable ? ' · playable' : ' · page only'}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {(videoId || videoUrl) && (
            <div className={styles.selected}>
              {getThumbnailUrl() && (
                <img src={getThumbnailUrl()} alt="" className={styles.selectedThumb} />
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

          {isPrivate && <p className={styles.note}>An invite code will be generated automatically.</p>}

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
