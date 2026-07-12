import { useEffect, useRef, useState } from 'react'
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
import { Button, Input, Card, IconButton, Modal, useToast } from '../../../shared/ui/index.js'
import { Layout } from '../../../shared/layout/index.js'
import ShareRoom from '../components/ShareRoom.jsx'
import styles from './RoomPage.module.css'

export default function RoomPage() {
  const { roomId } = useParams()
  const [searchParams] = useSearchParams()
  const inviteCode = searchParams.get('invite')
  const { user } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [showChat, setShowChat] = useState(() => (typeof window !== 'undefined' ? window.innerWidth > 768 : true))
  const [newVideoUrl, setNewVideoUrl] = useState('')
  const [showVideoInput, setShowVideoInput] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [endConfirmOpen, setEndConfirmOpen] = useState(false)
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [shareBanner, setShareBanner] = useState('')
  const [busy, setBusy] = useState(false)
  const playerRef = useRef(null)
  const prevActivity = useRef(null)

  const {
    room,
    participants,
    messages,
    error,
    joined,
    activityType,
    endRoom,
    leave,
    sendMessage,
    updateRoom,
    typing,
    setTyping,
    kickParticipant,
    promoteParticipant,
    muteParticipant,
  } = useRoom(roomId, inviteCode)

  const { isHost, writePlayerState, canControl } = usePlayerSync(roomId, room, playerRef)

  useEffect(() => {
    if (!activityType) return
    if (prevActivity.current && prevActivity.current !== activityType) {
      if (activityType === 'screenshare') {
        const hostName = room?.hostName || 'Host'
        setShareBanner(`${hostName} is sharing their screen`)
        const t = window.setTimeout(() => setShareBanner(''), 3500)
        return () => window.clearTimeout(t)
      }
    }
    prevActivity.current = activityType
  }, [activityType, room?.hostName])

  useEffect(() => {
    if (!showChat) return
    const onKey = (e) => {
      if (e.key === 'Escape' && window.innerWidth <= 768) setShowChat(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showChat])

  if (!user) {
    return (
      <div className={styles.loading}>
        <Link to="/auth">Sign in to join</Link>
      </div>
    )
  }
  if (error) {
    return (
      <div className={styles.error}>
        <p>{error}</p>
        <Button as={Link} to="/" variant="secondary">Back home</Button>
      </div>
    )
  }
  if (!room) return <div className={styles.loading}>Loading room…</div>
  if (!joined) return <div className={styles.joining}>Joining room…</div>

  // isDirectVideo is derived from the room doc's videoType (source of truth).
  // isYoutube must exclude direct-video rooms — both had activityType 'youtube'
  // in older data, so checking videoType is the only reliable way to distinguish.
  const isDirectVideo = room?.videoType === 'direct'
  const isYoutube = !isDirectVideo && (activityType === 'youtube' || activityType === 'direct')
  const canShareScreen = isDisplayMediaSupported()

  const switchActivity = async (type) => {
    if (type === 'screenshare' && !canShareScreen) {
      toast('Screen share needs a desktop browser. On mobile, only watching is supported.', { variant: 'warning' })
      return
    }
    try {
      setBusy(true)
      await updateRoom({ activityType: type })
    } catch (err) {
      toast(err.message || 'Could not switch mode', { variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const changeVideo = async (e) => {
    e.preventDefault()
    const id = extractVideoId(newVideoUrl)
    const isDirect = newVideoUrl.match(/\.(mp4|mkv|avi|mov|webm)$/i)
    
    try {
      setBusy(true)
      
      if (id) {
        // YouTube video
        await updateRoom({ 
          videoId: id, 
          videoUrl: null,
          videoType: 'youtube',
          activityType: 'youtube' 
        })
        await writePlayerState({ videoId: id, videoUrl: null, isPlaying: false, currentTime: 0 })
      } else if (isDirect) {
        // Direct video URL
        await updateRoom({ 
          videoId: null, 
          videoUrl: newVideoUrl,
          videoType: 'direct',
          activityType: 'direct' 
        })
        await writePlayerState({ videoId: null, videoUrl: newVideoUrl, isPlaying: false, currentTime: 0 })
      } else {
        toast('Paste a valid YouTube URL or direct video link (.mp4, .mkv, etc.)', { variant: 'error' })
        return
      }
      
      setNewVideoUrl('')
      setShowVideoInput(false)
      toast('Video updated', { variant: 'success' })
    } catch (err) {
      toast(err.message || 'Could not update video', { variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const saveTitle = async () => {
    const next = titleDraft.trim()
    if (!next || next === room.title) {
      setEditingTitle(false)
      return
    }
    try {
      await updateRoom({ title: next })
      toast('Title updated', { variant: 'success' })
      setEditingTitle(false)
    } catch (err) {
      toast(err.message || 'Could not update title', { variant: 'error' })
    }
  }

  const toggleLock = async () => {
    try {
      await updateRoom({ locked: !room.locked })
      toast(room.locked ? 'Room unlocked' : 'Room locked — new joins blocked', { variant: 'success' })
    } catch (err) {
      toast(err.message || 'Could not update lock', { variant: 'error' })
    }
  }

  const confirmEnd = async () => {
    try {
      setBusy(true)
      await endRoom()
    } catch (err) {
      toast(err.message || 'Could not end room', { variant: 'error' })
      setBusy(false)
    }
  }

  const confirmLeave = async () => {
    try {
      setBusy(true)
      await leave()
      navigate('/')
    } catch (err) {
      toast(err.message || 'Could not leave', { variant: 'error' })
      setBusy(false)
    }
  }

  const requestLeave = () => {
    if (isHost && activityType === 'screenshare') {
      setLeaveConfirmOpen(true)
      return
    }
    confirmLeave()
  }

  const onPlayerReady = (player) => {
    playerRef.current = player || null
  }

  const onPlayerEvent = (patch) => {
    if (canControl) writePlayerState(patch)
  }

  const header = (
    <header className={styles.header}>
      <div className={styles.roomTitle}>
        <Link to="/" className={styles.brand}>
          Chan
        </Link>
        <SyncPulse active size={18} />
        {editingTitle && isHost ? (
          <form
            className={styles.titleEdit}
            onSubmit={(e) => {
              e.preventDefault()
              saveTitle()
            }}
          >
            <Input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              maxLength={80}
              autoFocus
            />
            <Button type="submit" size="sm">Save</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditingTitle(false)}>Cancel</Button>
          </form>
        ) : (
          <h1 className={styles.titleText}>{room.title}</h1>
        )}
        {room.locked && <span className={styles.lockBadge}>Locked</span>}
        {isDirectVideo && <span className={styles.badge}>Direct</span>}
      </div>
      <div className={styles.headerActions}>
        <Button variant="secondary" size="sm" onClick={() => setShareOpen(true)}>Share</Button>
        <IconButton onClick={() => setShowChat((s) => !s)} active={showChat} aria-label="Toggle chat">
          {showChat ? '💬' : '🗨️'}
        </IconButton>
        {isHost ? (
          <Button variant="danger" size="sm" onClick={() => setEndConfirmOpen(true)}>End room</Button>
        ) : (
          <Button variant="danger" size="sm" onClick={requestLeave}>Leave</Button>
        )}
      </div>
    </header>
  )

  return (
    <Layout header={header} wide className={styles.layout}>
      <div className={styles.main}>
        <div className={styles.stage}>
          <div className={styles.playerWrap}>
            {isYoutube || isDirectVideo ? (
              <VideoPlayer
                videoId={room.videoId}
                videoUrl={room.videoUrl}
                videoType={room.videoType || 'youtube'}
                canControl={canControl}
                onReady={onPlayerReady}
                onPlayerEvent={onPlayerEvent}
              />
            ) : (
              <ScreenShare roomId={roomId} isHost={isHost} user={user} />
            )}
            {shareBanner && <div className={styles.shareBanner}>{shareBanner}</div>}
          </div>

          {canControl && (
            <Card className={styles.controlsCard}>
              <div className={styles.controls}>
                <Button variant="secondary" size="sm" onClick={() => setShowVideoInput((s) => !s)}>
                  Change video
                </Button>
                {(isYoutube || isDirectVideo) ? (
                  canShareScreen ? (
                    <Button variant="secondary" size="sm" loading={busy} onClick={() => switchActivity('screenshare')}>
                      Share screen
                    </Button>
                  ) : (
                    <span className={styles.screenNote}>Screen share needs a desktop browser</span>
                  )
                ) : (
                  <Button variant="secondary" size="sm" loading={busy} onClick={() => switchActivity(room?.videoType === 'direct' ? 'direct' : 'youtube')}>
                    Stop screen share
                  </Button>
                )}
                {isHost && (
                  <>
                    <Button variant="secondary" size="sm" onClick={toggleLock}>
                      {room.locked ? 'Unlock room' : 'Lock room'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setTitleDraft(room.title || '')
                        setEditingTitle(true)
                      }}
                    >
                      Edit title
                    </Button>
                  </>
                )}
              </div>
              {showVideoInput && (
                <form onSubmit={changeVideo} className={styles.videoForm}>
                  <Input
                    placeholder="Paste YouTube URL or direct video link (.mp4, .mkv)"
                    value={newVideoUrl}
                    onChange={(e) => setNewVideoUrl(e.target.value)}
                  />
                  <Button type="submit" loading={busy}>Update</Button>
                </form>
              )}
            </Card>
          )}

          <div className={styles.metaBar}>
            <button
              type="button"
              className={styles.metaToggle}
              onClick={() => setDetailsOpen((s) => !s)}
              aria-expanded={detailsOpen}
            >
              <span>
                {participants.length}/{room.capacity} watching · {isDirectVideo ? 'Direct Video' : isYoutube ? 'YouTube' : 'Screen share'}
              </span>
              <span className={styles.metaChevron}>{detailsOpen ? '▾' : '▸'}</span>
            </button>
            {detailsOpen && (
              <div className={styles.details}>
                <ParticipantList
                  participants={participants}
                  hostId={room.hostId}
                  coHosts={room.coHosts}
                  currentUserId={user?.uid}
                  isHost={isHost}
                  canControl={canControl}
                  onKick={async (uid) => {
                    try {
                      await kickParticipant(uid)
                      toast('Participant removed', { variant: 'success' })
                    } catch (err) {
                      toast(err.message || 'Kick failed', { variant: 'error' })
                    }
                  }}
                  onPromote={async (uid, role) => {
                    try {
                      await promoteParticipant(uid, role)
                      toast(role === 'co-host' ? 'Promoted to co-host' : 'Demoted to viewer', { variant: 'success' })
                    } catch (err) {
                      toast(err.message || 'Update failed', { variant: 'error' })
                    }
                  }}
                  onMute={async (uid, muted) => {
                    try {
                      await muteParticipant(uid, muted)
                      toast(muted ? 'Muted' : 'Unmuted', { variant: 'success' })
                    } catch (err) {
                      toast(err.message || 'Mute failed', { variant: 'error' })
                    }
                  }}
                />
                <Card className={styles.infoCard}>
                  <h3 className={styles.infoTitle}>Room info</h3>
                  <p className="mono">Host: {room.hostName}</p>
                  <p className="mono">Capacity: {participants.length}/{room.capacity}</p>
                  <p className="mono">Mode: {isDirectVideo ? 'Direct Video' : isYoutube ? 'YouTube' : 'Screen share'}</p>
                  {room.isPrivate && <p className="mono">Invite: {room.inviteCode}</p>}
                  {room.locked && <p className="mono">Joins locked</p>}
                </Card>
              </div>
            )}
          </div>
        </div>

        {showChat && (
          <>
            <div className={styles.overlay} onClick={() => setShowChat(false)} />
            <aside className={`${styles.sidebar} ${showChat ? styles.open : ''}`} role="dialog" aria-label="Chat">
              <div className={styles.sidebarHeader}>
                <h3 className={styles.sidebarTitle}>Chat</h3>
                <IconButton onClick={() => setShowChat(false)} aria-label="Close chat">✕</IconButton>
              </div>
              <div className={styles.sidebarContent}>
                <Chat
                  messages={messages}
                  sendMessage={sendMessage}
                  user={user}
                  roomId={roomId}
                  typing={typing}
                  setTyping={setTyping}
                />
              </div>
            </aside>
          </>
        )}
      </div>

      <ShareRoom room={room} roomId={roomId} open={shareOpen} onClose={() => setShareOpen(false)} />

      <Modal open={endConfirmOpen} title="End this room?" onClose={() => setEndConfirmOpen(false)}>
        <p className={styles.confirmText}>
          This ends the room for everyone. Viewers will be disconnected and the room will be marked ended.
        </p>
        <div className={styles.confirmActions}>
          <Button variant="secondary" onClick={() => setEndConfirmOpen(false)}>Cancel</Button>
          <Button variant="danger" loading={busy} onClick={confirmEnd}>End room</Button>
        </div>
      </Modal>

      <Modal open={leaveConfirmOpen} title="Leave while sharing?" onClose={() => setLeaveConfirmOpen(false)}>
        <p className={styles.confirmText}>
          You are currently sharing your screen. Leaving will stop the share for everyone.
        </p>
        <div className={styles.confirmActions}>
          <Button variant="secondary" onClick={() => setLeaveConfirmOpen(false)}>Stay</Button>
          <Button variant="danger" loading={busy} onClick={confirmLeave}>Leave room</Button>
        </div>
      </Modal>
    </Layout>
  )
        }
