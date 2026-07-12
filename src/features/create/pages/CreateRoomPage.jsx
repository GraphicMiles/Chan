import { useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { doc, setDoc, serverTimestamp, collection } from 'firebase/firestore'
import { db } from '../../../shared/lib/firebase.js'
import { useAuth } from '../../../shared/auth/hooks/useAuth.jsx'
import { extractVideoId, getThumbnail } from '../../../shared/lib/youtube.js'
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

  // Parse URL params for direct video or YouTube
  const presetVideo = searchParams.get('video') || ''
  const presetVideoUrl = searchParams.get('videoUrl') || ''
  const presetTitle = searchParams.get('title') || ''
  const presetType = searchParams.get('type') || 'youtube'

  const [title, setTitle] = useState(presetTitle)
  const [url, setUrl] = useState(presetVideo ? `https://youtube.com/watch?v=${presetVideo}` : presetVideoUrl)
  const [capacity, setCapacity] = useState(12)
  const [isPrivate, setIsPrivate] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMode, setSearchMode] = useState('youtube') // 'youtube' | 'scraper'
  const [scraperSite, setScraperSite] = useState('netnaija')
  const [videoId, setVideoId] = useState(presetVideo)
  const [videoUrl, setVideoUrl] = useState(presetVideoUrl)
  const [videoType, setVideoType] = useState(presetType) // 'youtube' | 'direct'
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)

  if (!user) return <Link to="/auth">Sign in to create a room</Link>

  const onUrlChange = (value) => {
    setUrl(value)
    // Check if it's a YouTube URL
    const id = extractVideoId(value)
    if (id) {
      setVideoId(id)
      setVideoUrl('')
      setVideoType('youtube')
      clear()
    } else if (value.match(/\.(mp4|mkv|avi|mov|webm)$/i)) {
      // Direct video URL
      setVideoUrl(value)
      setVideoId('')
      setVideoType('direct')
      clear()
    }
  }

  const onSearch = async (e) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    
    if (searchMode === 'youtube') {
      // Use scraper hook for YouTube
      await search(searchQuery.trim())
    } else {
      // Scraper mode - need URL, not query
      toast('For scraper sites, paste the page URL directly above', { variant: 'warning' })
    }
  }

  const onScrape = async (e) => {
    e.preventDefault()
    if (!url.trim()) return
    await scrape({ url: url.trim(), site: scraperSite })
  }

  const selectVideo = (item) => {
    if (item.id?.videoId) {
      // YouTube result
      setVideoId(item.id.videoId)
      setVideoUrl('')
      setVideoType('youtube')
      setUrl(`https://youtube.com/watch?v=${item.id.videoId}`)
    } else if (item.link && item.link.match(/\.(mp4|mkv|avi|mov|webm)$/i)) {
      // Direct video from scraper
      setVideoUrl(item.link)
      setVideoId('')
      setVideoType('direct')
      setUrl(item.link)
      if (item.title) setTitle(item.title)
    }
    clear()
  }

  const create = async (e) => {
    e.preventDefault()
    setError(null)
    setCreating(true)
    try {
      if (!title.trim()) throw new Error('Give the room a title')
      if (!videoId && !videoUrl) throw new Error('Pick a video (YouTube or paste a direct link)')

      const roomId = doc(collection(db, 'rooms')).id
      const inviteCode = isPrivate ? makeInviteCode() : ''
      
      const roomData = {
        hostId: user.uid,
        hostName: user.displayName || 'Host',
        title: title.trim(),
        activityType: 'youtube',
        isPrivate,
        inviteCode,
        coHosts: [],
        locked: false,
        capacity: Math.min(Math.max(Number(capacity) || 12, 1), 12),
        status: 'live',
        participantCount: 1,
        createdAt: serverTimestamp(),
        lastHeartbeat: serverTimestamp(),
      }

      if (videoType === 'youtube' && videoId) {
        roomData.videoId = videoId
        roomData.videoType = 'youtube'
      } else if (videoType === 'direct' && videoUrl) {
        roomData.videoUrl = videoUrl
        roomData.videoType = 'direct'
      }

      await setDoc(doc(db, 'rooms', roomId), roomData)

      // Initialize player state
      const playerState = {
        isPlaying: false,
        currentTime: 0,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      }
      if (videoId) playerState.videoId = videoId
      if (videoUrl) playerState.videoUrl = videoUrl
      
      await setDoc(doc(db, 'rooms', roomId, 'playerState', 'current'), playerState)

      const joinRes = await fetch('/api/room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    if (videoType === 'youtube' && videoId) {
      return getThumbnail(videoId)
    }
    return null
  }

  return (
    <div className={styles.page}>
      <Card className={styles.card}>
        <h1 className={styles.title}>Start a Room</h1>
        <p className={styles.subtitle}>Pick a YouTube video, or paste a direct video link to watch with others.</p>

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
              onClick={() => { setSearchMode('youtube'); clear() }}
            >
              YouTube
            </button>
            <button
              type="button"
              className={searchMode === 'scraper' ? styles.tabActive : styles.tab}
              onClick={() => { setSearchMode('scraper'); clear() }}
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
                placeholder="Paste the page URL (e.g., https://thenetnaija.ng/...)"
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
                Extract Video Links
              </Button>
            </>
          )}

          {results.length > 0 && (
            <div className={styles.results}>
              {results.map((item, idx) => (
                <button
                  key={item.id?.videoId || idx}
                  type="button"
                  className={styles.result}
                  onClick={() => selectVideo(item)}
                >
                  {(item.thumbnail || item.image) && (
                    <img 
                      src={item.thumbnail || item.image} 
                      alt="" 
                      className={styles.resultThumb}
                      onError={(e) => e.target.style.display = 'none'}
                    />
                  )}
                  <p className={styles.resultTitle}>{item.title || item.snippet?.title}</p>
                  <span className={styles.resultSource}>{item.source || 'youtube'}</span>
                </button>
              ))}
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

          <Button type="submit" loading={creating} fullWidth>
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
