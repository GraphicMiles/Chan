import { useState, useRef } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { useRoom } from '../hooks/useRoom.js'
import { usePlayerSync } from '../hooks/usePlayerSync.js'
import VideoPlayer from './VideoPlayer.jsx'
import ScreenShare from './ScreenShare.jsx'
import Chat from './Chat.jsx'
import ParticipantList from './ParticipantList.jsx'
import { SyncPulse } from './SyncPulse.jsx'
import { extractVideoId } from '../lib/youtube.js'

export default function Room() {
  const { roomId } = useParams()
  const [searchParams] = useSearchParams()
  const inviteCode = searchParams.get('invite')
  const { user } = useAuth()
  const navigate = useNavigate()
  const [showChat, setShowChat] = useState(true)
  const [newVideoUrl, setNewVideoUrl] = useState('')
  const [showVideoInput, setShowVideoInput] = useState(false)
  const playerRef = useRef(null)
  const { room, participants, messages, error, joined, activityType, endRoom, sendMessage, updateRoom } = useRoom(roomId, inviteCode)
  const { isHost, writePlayerState } = usePlayerSync(roomId, room, playerRef)

  if (!user) return <Link to="/auth">Sign in to join</Link>
  if (error) return <div style={{ padding: '2rem', color: 'var(--ember)' }}>{error}</div>
  if (!room) return <div style={{ padding: '2rem', color: 'var(--fog)' }}>Loading room…</div>
  if (!joined) return <div style={{ padding: '2rem', color: 'var(--fog)' }}>Joining room…</div>

  const isYoutube = activityType === 'youtube'

  const switchActivity = async (type) => {
    await updateRoom({ activityType: type })
  }

  const changeVideo = async (e) => {
    e.preventDefault()
    const id = extractVideoId(newVideoUrl)
    if (!id) return alert('Invalid YouTube URL')
    await updateRoom({ videoId: id, activityType: 'youtube' })
    await writePlayerState({ videoId: id, isPlaying: false, currentTime: 0 })
    setNewVideoUrl('')
    setShowVideoInput(false)
  }

  const onPlayerReady = (player) => {
    playerRef.current = player || null
  }

  const onPlayerEvent = (patch) => {
    if (isHost) writePlayerState(patch)
  }

  const copyInvite = () => {
    if (!room.inviteCode) return
    const url = `${window.location.origin}/room/${roomId}?invite=${room.inviteCode}`
    navigator.clipboard.writeText(url)
    alert('Invite link copied')
  }

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
          <Link to="/" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--paper)', fontSize: '1.25rem' }}>Chan</Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
            <SyncPulse active size={18} />
            <h1 style={{ fontSize: '1.05rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{room.title}</h1>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isHost && room.isPrivate && (
            <button className="btn secondary" onClick={copyInvite}>Copy invite</button>
          )}
          <button className="btn secondary" onClick={() => setShowChat((s) => !s)}>{showChat ? 'Hide chat' : 'Show chat'}</button>
          {isHost ? (
            <button className="btn danger" onClick={endRoom}>End room</button>
          ) : (
            <button className="btn danger" onClick={() => navigate('/')}>Leave</button>
          )}
        </div>
      </header>

      <main style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        <div style={{ flex: 1, minWidth: 0, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
          {isYoutube ? (
            <VideoPlayer videoId={room.videoId} isHost={isHost} onReady={onPlayerReady} onPlayerEvent={onPlayerEvent} />
          ) : (
            <ScreenShare roomId={roomId} isHost={isHost} user={user} />
          )}

          {isHost && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                <button className="btn secondary" onClick={() => setShowVideoInput((s) => !s)}>Change video</button>
                {isYoutube ? (
                  <button className="btn secondary" onClick={() => switchActivity('screenshare')}>Share screen</button>
                ) : (
                  <button className="btn secondary" onClick={() => switchActivity('youtube')}>Stop screen share</button>
                )}
              </div>
              {showVideoInput && (
                <form onSubmit={changeVideo} style={{ display: 'flex', gap: '0.5rem' }}>
                  <input className="input" placeholder="Paste new YouTube URL" value={newVideoUrl} onChange={(e) => setNewVideoUrl(e.target.value)} style={{ flex: 1 }} />
                  <button className="btn" type="submit">Update</button>
                </form>
              )}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            <ParticipantList participants={participants} hostId={room.hostId} />
            <div className="card">
              <h3 style={{ fontSize: '1rem' }}>Room info</h3>
              <p className="mono">Capacity: {participants.length}/{room.capacity}</p>
              <p className="mono">Mode: {isYoutube ? 'YouTube' : 'Screen share'}</p>
              {room.isPrivate && <p className="mono">Invite: {room.inviteCode}</p>}
            </div>
          </div>
        </div>

        {showChat && (
          <div style={{ width: 320, maxWidth: '100%', borderLeft: '1px solid rgba(255,255,255,0.08)', padding: '1rem', display: 'flex', flexDirection: 'column' }}>
            <Chat messages={messages} sendMessage={sendMessage} />
          </div>
        )}
      </main>
    </div>
  )
}
