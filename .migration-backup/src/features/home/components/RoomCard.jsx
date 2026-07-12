import { Link } from 'react-router-dom'
import { getThumbnail } from '../../../shared/lib/youtube.js'
import { Card, Badge, Avatar } from '../../../shared/ui/index.js'
import { SyncPulse } from '../../../shared/components/SyncPulse.jsx'
import styles from './RoomCard.module.css'

export default function RoomCard({ room }) {
  const isDirectVideo = room.videoType === 'direct' || (!room.videoId && room.videoUrl)
  const thumb = isDirectVideo ? null : getThumbnail(room.videoId)
  return (
    <Card interactive clickable as={Link} to={`/room/${room.id}`} className={styles.link}>
      <div className={styles.thumbWrap}>
        {thumb ? (
          <img src={thumb} alt="" className={styles.thumb} />
        ) : (
          <div className={styles.thumb} style={{
            background: 'var(--surface-2, #1e1e2e)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2.5rem',
          }}>
            🎬
          </div>
        )}
        <div className={styles.badge}>
          <Badge variant="live">
            <SyncPulse active size={14} />
            Live
          </Badge>
        </div>
      </div>
      <div className={styles.meta}>
        <h3 className={styles.title}>{room.title}</h3>
        <span className={styles.host}>Host: {room.hostName}</span>
      </div>
      <div className={styles.footer}>
        <span className={styles.viewers}>
          <Avatar name={room.hostName} uid={room.hostId} size={20} />
          {room.participantCount}/{room.capacity || 12} watching
        </span>
      </div>
    </Card>
  )
}
