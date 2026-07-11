import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { doc, setDoc, serverTimestamp, collection } from 'firebase/firestore'
import { db } from '../lib/firebase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { extractVideoId, searchVideos, getThumbnail } from '../lib/youtube.js'

function makeInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

export default function CreateRoom() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [capacity, setCapacity] = useState(12)
  const [isPrivate, setIsPrivate] = useState(false)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [videoId, setVideoId] = useState('')
  const [error, setError] = useState(null)

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
    const items = await searchVideos(search)
    setResults(items)
  }

  const selectVideo = (id) => {
    setVideoId(id)
    setUrl(`https://youtube.com/watch?v=${id}`)
    setResults([])
  }

  const create = async (e) => {
    e.preventDefault()
    setError(null)
    if (!title.trim()) return setError('Give the room a title')
    if (!videoId) return setError('Pick a YouTube video')

    const roomId = doc(collection(db, 'rooms')).id
    const inviteCode = isPrivate ? makeInviteCode() : ''
    await setDoc(doc(db, 'rooms', roomId), {
      hostId: user.uid,
      hostName: user.displayName || user.email?.split('@')[0] || 'Host',
      title: title.trim(),
      activityType: 'youtube',
      videoId,
      isPrivate,
      inviteCode,
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

    await setDoc(doc(db, 'rooms', roomId, 'participants', user.uid), {
      displayName: user.displayName || user.email?.split('@')[0] || 'Host',
      role: 'host',
      joinedAt: serverTimestamp(),
    })

    navigate(`/room/${roomId}`)
  }

  return (
    <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="card" style={{ width: '100%', maxWidth: 540 }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '1.25rem' }}>Start a Room</h1>
        <form onSubmit={create} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <input className="input" placeholder="Room title" value={title} onChange={(e) => setTitle(e.target.value)} required />

          <input className="input" placeholder="Paste YouTube URL" value={url} onChange={(e) => onUrlChange(e.target.value)} />

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input className="input" placeholder="Or search YouTube" value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="btn secondary" type="button" onClick={onSearch}>Search</button>
          </div>

          {results.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.5rem' }}>
              {results.map((item) => (
                <button key={item.id.videoId} type="button" className="card" style={{ padding: '0.5rem', textAlign: 'left', cursor: 'pointer' }} onClick={() => selectVideo(item.id.videoId)}>
                  <img src={getThumbnail(item.id.videoId)} alt="" style={{ width: '100%', borderRadius: '0.25rem' }} />
                  <p style={{ fontSize: '0.75rem', marginTop: '0.4rem', color: 'var(--paper)', lineHeight: 1.2 }}>{item.snippet.title}</p>
                </button>
              ))}
            </div>
          )}

          {videoId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(124,137,247,0.12)', padding: '0.5rem 0.75rem', borderRadius: '0.5rem' }}>
              <img src={getThumbnail(videoId)} alt="" style={{ width: 80, borderRadius: '0.25rem' }} />
              <span className="mono">Selected: {videoId}</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <label style={{ flex: 1, color: 'var(--fog)', fontSize: '0.9rem' }}>
              Capacity
              <input className="input" type="number" min={1} max={12} value={capacity} onChange={(e) => setCapacity(e.target.value)} style={{ marginTop: '0.25rem' }} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--fog)', fontSize: '0.9rem' }}>
              <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
              Private room
            </label>
          </div>

          {isPrivate && <p className="mono" style={{ color: 'var(--fog)' }}>An invite code will be generated automatically.</p>}

          <button className="btn" type="submit">Create room</button>
        </form>
        {error && <p style={{ color: 'var(--ember)', marginTop: '1rem' }}>{error}</p>}
        <p style={{ marginTop: '1rem' }}><Link to="/">Cancel</Link></p>
      </div>
    </div>
  )
}
