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
  
  const [isMuted, setIsMuted] = useState(true) // Off by default as requested
  const [showMenu, setShowMenu] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [playerState, setPlayerState] = useState(null)
  
  const videoRef = useRef(null)
  const playerRef = useRef(null)

  const isDirect = room?.videoType === 'direct' || (!room?.videoId && room?.videoUrl)
  const streamUrl = useMemo(() => {
    if (!room) return ''
    if (isDirect) return normalizePlaybackUrl(room.videoUrl)
    return normalizePlaybackUrl(youtubeUrl(room.videoId))
  }, [room, isDirect])

  // Check if saved in private Watch Later list
  useEffect(() => {
    if (!user || !room?.id) return undefined
    let active = true
    getDoc(doc(db, 'users', user.uid, 'watchLater', room.id))
      .then((snap) => {
        if (active && snap.exists()) setIsSaved(true)
      })
      .catch(() => {})
    return () => { active = false }
  }, [user, room?.id])

  // Subscribe to room player state to keep auto-playing video synchronized with room participants
  useEffect(() => {
    if (!room?.id) return undefined
    const unsub = onSnapshot(
      doc(db, 'rooms', room.id, 'playerState', 'current'),
      (snap) => {
        if (snap.exists()) {
          setPlayerState(snap.data())
        }
      }
    )
    return unsub
  }, [room?.id])

  // Sync direct <video> playback to current room time
  useEffect(() => {
    if (!isDirect || !videoRef.current || !playerState) return
    const baseMs = playerState.clientTimeMs || (playerState.updatedAt?.toMillis ? playerState.updatedAt.toMillis() : Date.now())
    const elapsedSec = playerState.isPlaying ? Math.max(0, (Date.now() - baseMs) / 1000) : 0
    const targetSec = (playerState.currentTime || 0) + elapsedSec
    const cur = videoRef.current.currentTime || 0

    if (Math.abs(cur - targetSec) > 2) {
      videoRef.current.currentTime = targetSec
    }
    if (playerState.isPlaying && videoRef.current.paused) {
      videoRef.current.play().catch(() => {})
    } else if (!playerState.isPlaying && !videoRef.current.paused) {
      videoRef.current.pause()
    }
  }, [isDirect, playerState])

  // Sync ReactPlayer (YouTube) to current room time
  useEffect(() => {
    if (isDirect || !playerRef.current || !playerState) return
    const baseMs = playerState.clientTimeMs || (playerState.updatedAt?.toMillis ? playerState.updatedAt.toMillis() : Date.now())
    const elapsedSec = playerState.isPlaying ? Math.max(0, (Date.now() - baseMs) / 1000) : 0
    const targetSec = (playerState.currentTime || 0) + elapsedSec
    const cur = playerRef.current.getCurrentTime?.() || 0

    if (Math.abs(cur - targetSec) > 2.5) {
      playerRef.current.seekTo(targetSec, 'seconds')
    }
  }, [isDirect, playerState])

  if (!room) return null

  const hoursWatched = useMemo(() => {
    const createdMs = room.createdAt?.toMillis?.() || Date.now()
    const diffHours = (Date.now() - createdMs) / 3600000
    return `${Math.max(1, Math.round(diffHours))}h`
  }, [room.createdAt])

  const watchersCount = `${room.participantCount || 1} watching`

  const handleWatchLater = async (e) => {
    e.stopPropagation()
    setShowMenu(false)
    if (!user) {
      toast('Sign in to save to your private Watch Later list', { variant: 'warning' })
      return
    }
    const ref = doc(db, 'users', user.uid, 'watchLater', room.id)
    try {
      if (isSaved) {
        await deleteDoc(ref)
        setIsSaved(false)
        toast('Removed from Watch Later', { variant: 'success' })
      } else {
        await setDoc(ref, {
          roomId: room.id,
          title: room.title,
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
    const link = `${window.location.origin}/room/${room.id}`
    if (navigator.clipboard) {
      navigator.clipboard.writeText(link)
      toast('Room link copied to clipboard!', { variant: 'success' })
    }
  }

  const formattedTitle = room.title.length > 45 ? `${room.title.slice(0, 45)}...` : room.title

  return (
    <div className={styles.cardContainer} onClick={() => setShowMenu(false)}>
      <div className={styles.stageWrapper}>
        {/* Top Left Stats Overlay Pill */}
        <div className={styles.statsPill}>
          <Clock size={12} className={styles.statIcon} />
          <span>{hoursWatched} stream time</span>
          <span className={styles.statSep}>|</span>
          <Users size={12} className={styles.statIcon} />
          <span>{watchersCount}</span>
        </div>

        {/* Top Right Controls (Mute & ⋮ Menu) */}
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

        {/* Synchronized Auto-Playing Preview Video */}
        <div className={styles.videoContainer}>
          {isDirect ? (
            <video
              ref={videoRef}
              src={streamUrl}
              autoPlay
              playsInline
              muted={isMuted}
              controls={false}
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
                config={{
                  youtube: {
                    playerVars: { rel: 0, modestbranding: 1, playsInline: 1, controls: 0, disablekb: 1, autoplay: 1 },
                  },
                }}
              />
            </div>
          )}
          {/* Transparent click-blocker layer so users can't pause or seek the preview directly */}
          <div className={styles.clickBlocker} />
        </div>
      </div>

      {/* Bottom Footer Section */}
      <div className={styles.footerRow}>
        <div className={styles.titleWrap}>
          <h4 className={styles.mediaTitle} title={room.title}>
            {formattedTitle}
          </h4>
          <span className={styles.hostMeta}>Hosted by {room.hostName}</span>
        </div>

        <Link to={`/room/${room.id}`} className={styles.watchNowBtn}>
          <Play size={15} className={styles.playIcon} />
          <span>Watch Now</span>
        </Link>
      </div>
    </div>
  )
}
