import { Link } from 'react-router-dom'
import { Radio, Users } from 'lucide-react'
import { getThumbnail } from '../../../shared/lib/youtube.js'
import { Card, Badge, Avatar } from '../../../shared/ui/index.js'
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
          <div className={styles.thumbPlaceholder}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
              <line x1="7" y1="2" x2="7" y2="22"></line>
              <line x1="17" y1="2" x2="17" y2="22"></line>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <line x1="2" y1="7" x2="7" y2="7"></line>
              <line x1="2" y1="17" x2="7" y2="17"></line>
              <line x1="17" y1="17" x2="22" y2="17"></line>
              <line x1="17" y1="7" x2="22" y2="7"></line>
            </svg>
          </div>
        )}
        <div className={styles.scrim} />
        <div className={styles.badge}>
          <Badge variant="live" icon={Radio} pulse>Live</Badge>
        </div>
        <div className={styles.viewerCount}>
          <Users size={14} />
          <span>{room.participantCount}/{room.capacity || 12}</span>
        </div>
      </div>
      <div className={styles.meta}>
        <h3 className={styles.title}>{room.title}</h3>
        <div className={styles.host}>
          <Avatar name={room.hostName} uid={room.hostId} size={22} isHost />
          <span>{room.hostName}</span>
        </div>
      </div>
    </Card>
  )
}
