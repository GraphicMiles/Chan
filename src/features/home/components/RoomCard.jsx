import { Link } from 'react-router-dom'
import { Users, Monitor, Play } from 'lucide-react'
import { getThumbnail } from '../../../shared/lib/youtube.js'
import styles from './RoomCard.module.css'

export default function RoomCard({ room }) {
  if (!room || !room.id) return null

  const isDirectVideo = room.videoType === 'direct' || (!room.videoId && Boolean(room.videoUrl))
  const thumb = room?.thumbnail || room?.image || room?.poster || (isDirectVideo ? null : getThumbnail(room.videoId)) || null
  const source = isDirectVideo ? 'Direct' : 'YouTube'
  const safeTitle = room.title || 'Untitled Room'
  const safeHostName = room.hostName || 'Host'
  const startedAt = room.createdAt?.toDate?.()
  const timeAgo = startedAt ? getRelativeTime(startedAt) : null
  const watchers = typeof room?.participantCount === 'number' && Number.isFinite(room.participantCount) ? Math.max(0, room.participantCount) : 0

  return (
    <Link to={`/room/${room.id}`} className={styles.card}>
      <div className={styles.thumb}>
        {thumb ? (
          <img src={thumb} alt={safeTitle} className={styles.thumbImg} loading="lazy" />
        ) : (
          <div className={styles.thumbPlaceholder}>
            <Monitor size={32} />
          </div>
        )}
        <span className={styles.badgeLive}>
          <span className={styles.liveDot} />
          LIVE
        </span>
        <span className={styles.badgeSource}>
          {isDirectVideo ? <Monitor size={11} /> : <Play size={11} />}
          {source}
        </span>
      </div>
      
      <div className={styles.body}>
        <div className={styles.cardHeader}>
          <div className={styles.kicker}>{source}</div>
          <h3 className={styles.title} title={safeTitle}>{safeTitle}</h3>
          <div className={styles.metaRow}>
            <span>by <strong>{safeHostName}</strong></span>
            {timeAgo && (
              <>
                <span className={styles.metaSep}>·</span>
                <span>Started {timeAgo}</span>
              </>
            )}
          </div>
        </div>

        <div className={styles.cardFooter}>
          <div className={styles.viewers}>
            <Users size={14} />
            <span>{watchers}/{Number(room.capacity) || 12} watching</span>
          </div>
          <span className={styles.joinBtn}>
            <Play size={12} />
            <span>Join</span>
          </span>
        </div>
      </div>
    </Link>
  )
}

function getRelativeTime(date) {
  try {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return null
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
    if (seconds < 60) return 'just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    return date.toLocaleDateString()
  } catch {
    return null
  }
}
