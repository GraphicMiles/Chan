import { useState, useRef } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../shared/auth/hooks/useAuth.jsx'
import { useRoom } from '../hooks/useRoom.js'
import { usePlayerSync } from '../hooks/usePlayerSync.js'
import VideoPlayer from '../components/VideoPlayer.jsx'
import ScreenShare from '../components/ScreenShare.jsx'
import Chat from '../components/Chat.jsx'
import ParticipantList from '../components/ParticipantList.jsx'
import { SyncPulse } from '../../../shared/components/SyncPulse.jsx'
import { extractVideoId } from '../../../shared/lib/youtube.js'
import { isDisplayMediaSupported } from '../services/livekit.js'
import { Button, Input, Card, IconButton } from '../../../shared/ui/index.js'
import { Layout } from '../../../shared/layout/index.js'
import styles from './RoomPage.module.css'

export default function RoomPage() {
  const { roomId } = useParams()
  const [searchParams] = useSearchParams()
  const inviteCode = searchParams.get('invite')
  const { user } = useAuth()
  const navigate = useNavigate()
  const [showChat, setShowChat] = useState(true)
  const [newVideoUrl, setNewVideoUrl] = useState('')
  const [showVideoInput, setShowVideoInput] = useState(false)
  const playerRef = useRef(null)
  const { room, participants, messages, error, joined, activityType, endRoom, sendMessage, updateRoom, typing, setTyping } = useRoom(roomId, inviteCode)
  const { isHost, writePlayerState } = usePlayerSync(roomId, room, playerRef)

  if (!user) return <div className={styles.loading}><Link to="/auth">Sign in to join</Link></div>
  if (error) return <div className={styles.error}>{error}</div>
  if (!room) return <div className={styles.loading}>Loading room…</div>
  if (!joined) return <div className={styles.joining}>Joining room…</div>

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

  const header = (
    <header className={styles.header}>
      <div className={styles.roomTitle}>
        <Link to="/" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--text-primary)', fontSize: '1.25rem', textDecoration: 'none' }}>
          Chan
        </Link>
        <SyncPulse active size={18} />
        <h1 className={styles.titleText}>{room.title}</h1>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {isHost && room.isPrivate && (
          <Button variant="secondary" size="sm" onClick={copyInvite}>Copy invite</Button>
        )}
        <IconButton onClick={() => setShowChat((s) => !s)} active={showChat}>
          {showChat ? '💬' : '🗨️'}
        </IconButton>
        {isHost ? (
          <Button variant="danger" size="sm" onClick={endRoom}>End room</Button>
        ) : (
          <Button variant="danger" size="sm" onClick={() => navigate('/')}>Leave</Button>
        )}
      </div>
    </header>
  )

  return (
    <Layout header={header} wide className={styles.layout}>
      <div className={styles.main}>
        <div className={styles.stage}>
          <div className={styles.playerWrap}>
            {isYoutube ? (
              <VideoPlayer videoId={room.videoId} isHost={isHost} onReady={onPlayerReady} onPlayerEvent={onPlayerEvent} />
            ) : (
              <ScreenShare roomId={roomId} isHost={isHost} user={user} />
            )}
          </div>

          {isHost && (
            <Card>
              <div className={styles.controls}>
                <Button variant="secondary" size="sm" onClick={() => setShowVideoInput((s) => !s)}>Change video</Button>
                {isYoutube ? (
                  <Button variant="secondary" size="sm" onClick={() => switchActivity('screenshare')}>
                    {isDisplayMediaSupported() ? 'Share screen' : 'Share camera'}
                  </Button>
                ) : (
                  <Button variant="secondary" size="sm" onClick={() => switchActivity('youtube')}>
                    {isDisplayMediaSupported() ? 'Stop screen share' : 'Stop camera share'}
                  </Button>
                )}
              </div>
              {showVideoInput && (
                <form onSubmit={changeVideo} className={styles.videoForm}>
                  <Input placeholder="Paste new YouTube URL" value={newVideoUrl} onChange={(e) => setNewVideoUrl(e.target.value)} />
                  <Button type="submit">Update</Button>
                </form>
              )}
            </Card>
          )}

          <div className={styles.grid}>
            <ParticipantList participants={participants} hostId={room.hostId} />
            <Card className={styles.infoCard}>
              <h3 style={{ fontSize: '1rem', margin: 0 }}>Room info</h3>
              <p className="mono">Capacity: {participants.length}/{room.capacity}</p>
              <p className="mono">Mode: {isYoutube ? 'YouTube' : 'Screen share'}</p>
              {room.isPrivate && <p className="mono">Invite: {room.inviteCode}</p>}
            </Card>
          </div>
        </div>

        {showChat && (
          <>
            <div className={styles.overlay} onClick={() => setShowChat(false)} />
            <aside className={`${styles.sidebar} ${showChat ? styles.open : ''}`}>
              <div className={styles.sidebarHeader}>
                <h3 className={styles.sidebarTitle}>Chat</h3>
                <IconButton onClick={() => setShowChat(false)}>✕</IconButton>
              </div>
              <div className={styles.sidebarContent}>
                <Chat messages={messages} sendMessage={sendMessage} user={user} roomId={roomId} typing={typing} setTyping={setTyping} />
              </div>
            </aside>
          </>
        )}
      </div>
    </Layout>
  )
}
