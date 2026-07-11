import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { doc, setDoc, serverTimestamp, collection } from 'firebase/firestore'
import { db } from '../../../shared/lib/firebase.js'
import { useAuth } from '../../../shared/auth/hooks/useAuth.jsx'
import { extractVideoId, searchVideos, getThumbnail } from '../../../shared/lib/youtube.js'
import { parseJsonResponse } from '../../../shared/lib/api.js'
import { Button, Input, Card, useToast } from '../../../shared/ui/index.js'
import styles from './CreateRoomPage.module.css'

function makeInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

export default function CreateRoomPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [capacity, setCapacity] = useState(12)
  const [isPrivate, setIsPrivate] = useState(false)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [videoId, setVideoId] = useState('')
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)
  const [searching, setSearching] = useState(false)

  if (!user) return <Link to="/auth">Sign in to create a room</Link>

  const onUrlChange = (value) => {
    setUrl(value)
    const id = extractVideoId(value)
    if (id) {
      setVideoId(id)
      setSearch('')
      setResults([])
    }
  }

  const onSearch = async (e) => {
    e.preventDefault()
    if (!search.trim()) return
    setSearching(true)
    try {
      const items = await searchVideos(search)
      setResults(items)
      if (!items.length) toast('No videos found', { variant: 'warning' })
    } catch (err) {
      toast(err.message || 'Search failed', { variant: 'error' })
    } finally {
      setSearching(false)
    }
  }

  const selectVideo = (id) => {
    setVideoId(id)
    setUrl(`https://youtube.com/watch?v=${id}`)
    setResults([])
  }

  const create = async (e) => {
    e.preventDefault()
    setError(null)
    setCreating(true)
    try {
      if (!title.trim()) throw new Error('Give the room a title')
      if (!videoId) throw new Error('Pick a YouTube video')

      const roomId = doc(collection(db, 'rooms')).id
      const inviteCode = isPrivate ? makeInviteCode() : ''
      await setDoc(doc(db, 'rooms', roomId), {
        hostId: user.uid,
        hostName: user.displayName || 'Host',
        title: title.trim(),
        activityType: 'youtube',
        videoId,
        isPrivate,
        inviteCode,
        coHosts: [],
        locked: false,
        capacity: Math.min(Math.max(Number(capacity) || 12, 1), 12),
        status: 'live',
        participantCount: 1,
        createdAt: serverTimestamp(),
        lastHeartbeat: serverTimestamp(),
      })

      await setDoc(doc(db, 'rooms', roomId, 'playerState', 'current'), {
        videoId,
        isPlaying: false,
        currentTime: 0,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      })

      const joinRes = await fetch('/api/joinRoom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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

  return (
    <div className={styles.page}>
      <Card className={styles.card}>
        <h1 className={styles.title}>Start a Room</h1>
        <p className={styles.subtitle}>Pick a YouTube video and invite others to watch with you.</p>

        <form onSubmit={create} className={styles.form}>
          <Input
            placeholder="Room title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={80}
          />

          <Input
            placeholder="Paste YouTube URL"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
          />

          <div className={styles.row}>
            <Input
              placeholder="Or search YouTube"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button
              variant="secondary"
              type="button"
              onClick={onSearch}
              className={styles.searchButton}
              loading={searching}
            >
              Search
            </Button>
          </div>

          {results.length > 0 && (
            <div className={styles.results}>
              {results.map((item) => (
                <button
                  key={item.id.videoId}
                  type="button"
                  className={styles.result}
                  onClick={() => selectVideo(item.id.videoId)}
                >
                  <img src={getThumbnail(item.id.videoId)} alt="" className={styles.resultThumb} />
                  <p className={styles.resultTitle}>{item.snippet.title}</p>
                </button>
              ))}
            </div>
          )}

          {videoId && (
            <div className={styles.selected}>
              <img src={getThumbnail(videoId)} alt="" className={styles.selectedThumb} />
              <span className={styles.selectedText}>Selected: {videoId}</span>
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

        <p className={styles.footer}>
          <Link to="/">Cancel</Link>
        </p>
      </Card>
    </div>
  )
}
