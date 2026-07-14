import { useState, useEffect, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import ReactPlayer from 'react-player'
import { VolumeX, Volume2, MoreVertical, Bookmark, Share2, Play, Clock, Users, Check } from 'lucide-react'
import { doc, onSnapshot, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../../shared/lib/firebase.js'
import { useAuth } from '../../../shared/auth/hooks/useAuth.jsx'
import { normalizePlaybackUrl } from '../../../shared/lib/youtube.js'
import { useToast } from '../../../shared/ui/index.js'
import styles from './MostStreamedCard.module.scss'

function youtubeUrl(videoId) {
  return videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : ''
}

export default function MostStreamedCard({ room }) {
  const { user } = useAuth()
  const { toast } = useToast()
  
  const [isMuted, setIsMuted] = useState(true) // Off by default
  const [showMenu, setShowMenu] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [playerState, setPlayerState] = useState(null)
  const [playbackError, setPlaybackError] = useState(false)
  
  const videoRef = useRef(null)
  const playerRef = useRef(null)

  const safeRoomId = room?.id || ''
  const safeTitle = room?.title || 'Untitled Stream'
  const safeHostName = room?.hostName || 'Host'
  const isDirect = room?.videoType === 'direct' || (!room?.videoId && Boolean(room?.videoUrl))
  const fallbackThumb = room?.thumbnail || room?.image || room?.poster || (isDirect ? null : getThumbnail(room?.videoId)) || null

  const streamUrl = useMemo(() => {
    if (!room) return ''
    try {
      if (isDirect) return normalizePlaybackUrl(room.videoUrl || '')
      return normalizePlaybackUrl(youtubeUrl(room.videoId || ''))
    } catch {
      return ''
    }
  }, [room, isDirect])

  // Check if saved in private Watch Later list
  useEffect(() => {
    if (!user || !safeRoomId) return undefined
    let active = true
    getDoc(doc(db, 'users', user.uid, 'watchLater', safeRoomId))
      .then((snap) => {
        if (active && snap.exists()) setIsSaved(true)
      })
      .catch(() => {})
    return () => { active = false }
  }, [user, safeRoomId])

  // Subscribe to room player state
  useEffect(() => {
    if (!safeRoomId) return undefined
    const unsub = onSnapshot(
      doc(db, 'rooms', safeRoomId, 'playerState', 'current'),
      (snap) => {
        if (snap.exists()) {
          setPlayerState(snap.data())
        }
      },
      () => {
        /* ignore snapshot error on preview */
      }
    )
    return unsub
  }, [safeRoomId])

  // Sync direct <video> playback
  useEffect(() => {
    if (!isDirect || !videoRef.current || !playerState || playbackError) return
    try {
      const baseMs = playerState.clientTimeMs || (playerState.updatedAt?.toMillis ? playerState.updatedAt.toMillis() : Date.now())
      const elapsedSec = playerState.isPlaying ? Math.max(0, (Date.now() - baseMs) / 1000) : 0
      const targetSec = (Number(playerState.currentTime) || 0) + elapsedSec
      const cur = videoRef.current.currentTime || 0

      if (Math.abs(cur - targetSec) > 2) {
        videoRef.current.currentTime = targetSec
      }
      if (playerState.isPlaying && videoRef.current.paused) {
        videoRef.current.play().catch(() => {})
      } else if (!playerState.isPlaying && !videoRef.current.paused) {
        videoRef.current.pause()
      }
    } catch {
      /* ignore video sync error */
    }
  }, [isDirect, playerState, playbackError])

  // Sync ReactPlayer (YouTube)
  useEffect(() => {
    if (isDirect || !playerRef.current || !playerState || playbackError) return
    try {
      const baseMs = playerState.clientTimeMs || (playerState.updatedAt?.toMillis ? playerState.updatedAt.toMillis() : Date.now())
      const elapsedSec = playerState.isPlaying ? Math.max(0, (Date.now() - baseMs) / 1000) : 0
      const targetSec = (Number(playerState.currentTime) || 0) + elapsedSec
      const cur = playerRef.current.getCurrentTime?.() || 0

      if (Math.abs(cur - targetSec) > 2.5) {
        playerRef.current.seekTo(targetSec, 'seconds')
      }
    } catch {
      /* ignore reactplayer sync error */
    }
  }, [isDirect, playerState, playbackError])

  const hoursWatched = useMemo(() => {
    try {
      let createdMs = null
      const created = room?.createdAt
      if (created) {
        // Firestore Timestamp — use toMillis() directly (UTC epoch ms)
        if (typeof created.toMillis === 'function') {
          createdMs = created.toMillis()
        }
        // Firestore Timestamp serialized as {seconds, nanoseconds}
        else if (typeof created.seconds === 'number') {
          createdMs = created.seconds * 1000 + Math.floor((created.nanoseconds || 0) / 1e6)
        }
        // JavaScript Date object
        else if (created instanceof Date) {
          createdMs = created.getTime()
        }
      }
      // Fallback to createdAtMs if available
      if (createdMs == null && typeof room?.createdAtMs === 'number') {
        createdMs = room.createdAtMs
      }
      // Last resort: can't determine creation time
      if (createdMs == null) return '—'

      const diffMs = Date.now() - createdMs
      const diffMins = Math.floor(diffMs / 60000)
      if (diffMins < 1) return '<1m'
      if (diffMins < 60) return `${diffMins}m`
      const diffHours = Math.floor(diffMins / 60)
      const remainingMins = diffMins % 60
      if (diffHours < 24) return remainingMins > 0 ? `${diffHours}h ${remainingMins}m` : `${diffHours}h`
      const diffDays = Math.floor(diffHours / 24)
      return `${diffDays}d`
    } catch {
      return '—'
    }
  }, [room?.createdAt, room?.createdAtMs])

  const watchers = typeof room?.participantCount === 'number' && Number.isFinite(room.participantCount) ? Math.max(0, room.participantCount) : 0
  const watchersCount = `${watchers} watching`

  if (!room || !safeRoomId) return null

  const handleWatchLater = async (e) => {
    e.stopPropagation()
    setShowMenu(false)
    if (!user) {
      toast('Sign in to save to your private Watch Later list', { variant: 'warning' })
      return
    }
    const ref = doc(db, 'users', user.uid, 'watchLater', safeRoomId)
    try {
      if (isSaved) {
        await deleteDoc(ref)
        setIsSaved(false)
        toast('Removed from Watch Later', { variant: 'success' })
      } else {
        await setDoc(ref, {
          roomId: safeRoomId,
          title: safeTitle,
          videoId: room.videoId || null,
          videoUrl: room.videoUrl || null,
          videoType: room.videoType || 'youtube',
          addedAt: serverTimestamp(),
        })
        setIsSaved(true)
        toast('Saved to Watch Later!', { variant: 'success' })
      }
    } catch (err) {
      toast(err.message || 'Could not update Watch Later list', { variant: 'error' })
    }
  }

  const handleShare = (e) => {
    e.stopPropagation()
    setShowMenu(false)
    const link = `${window.location.origin}/room/${safeRoomId}`
    if (navigator.clipboard) {
      navigator.clipboard.writeText(link).catch(() => {})
      toast('Room link copied to clipboard!', { variant: 'success' })
    }
  }

  const formattedTitle = safeTitle.length > 45 ? `${safeTitle.slice(0, 45)}...` : safeTitle

  return (
    <div className={styles.cardContainer} onClick={() => setShowMenu(false)}>
      <div className={styles.stageWrapper}>
        <div className={styles.statsPill}>
          <Clock size={12} className={styles.statIcon} />
          <span>{hoursWatched} stream time</span>
          <span className={styles.statSep}>|</span>
          <Users size={12} className={styles.statIcon} />
          <span>{watchersCount}</span>
        </div>

        <div className={styles.topRightControls}>
          <button
            type="button"
            className={styles.circleBtn}
            onClick={(e) => {
              e.stopPropagation()
              setIsMuted(!isMuted)
            }}
            title={isMuted ? 'Unmute preview audio' : 'Mute preview audio'}
          >
            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>

          <div className={styles.menuWrapper}>
            <button
              type="button"
              className={styles.circleBtn}
              onClick={(e) => {
                e.stopPropagation()
                setShowMenu(!showMenu)
              }}
              title="More options"
            >
              <MoreVertical size={16} />
            </button>

            {showMenu && (
              <div className={styles.dropdownMenu} onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={handleWatchLater}>
                  {isSaved ? <Check size={14} className={styles.savedIcon} /> : <Bookmark size={14} />}
                  <span>{isSaved ? 'In Watch Later' : 'Save to Watch Later'}</span>
                </button>
                <button type="button" onClick={handleShare}>
                  <Share2 size={14} />
                  <span>Share Stream Link</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className={styles.videoContainer}>
          {!playbackError && streamUrl ? (
            isDirect ? (
              <video
                ref={videoRef}
                src={streamUrl}
                autoPlay
                playsInline
                muted={isMuted}
                controls={false}
                onError={() => setPlaybackError(true)}
                className={styles.videoElement}
              />
            ) : (
              <div className={styles.reactPlayerWrap}>
                <ReactPlayer
                  ref={playerRef}
                  url={streamUrl}
                  playing={Boolean(playerState?.isPlaying ?? true)}
                  muted={isMuted}
                  width="100%"
                  height="100%"
                  controls={false}
                  onError={() => setPlaybackError(true)}
                  config={{
                    youtube: {
                      playerVars: { rel: 0, modestbranding: 1, playsInline: 1, controls: 0, disablekb: 1, autoplay: 1 },
                    },
                  }}
                />
              </div>
            )
          ) : fallbackThumb ? (
            <img
              src={fallbackThumb}
              alt={safeTitle}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#0c0d10',
              color: 'var(--room-text-secondary)',
              fontSize: '13px',
              padding: '20px',
              textAlign: 'center'
            }}>
              <span>Preview stream temporarily unavailable</span>
            </div>
          )}
          <div className={styles.clickBlocker} />
        </div>
      </div>

      <div className={styles.footerRow}>
        <div className={styles.titleWrap}>
          <h4 className={styles.mediaTitle} title={safeTitle}>
            {formattedTitle}
          </h4>
          <span className={styles.hostMeta}>Hosted by {safeHostName}</span>
        </div>

        <Link to={`/room/${safeRoomId}`} className={styles.watchNowBtn}>
          <Play size={15} className={styles.playIcon} />
          <span>Watch Now</span>
        </Link>
      </div>
    </div>
  )
}
