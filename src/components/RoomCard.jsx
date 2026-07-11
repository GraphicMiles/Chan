import { Link } from 'react-router-dom'
import { getThumbnail } from '../lib/youtube.js'
import { SyncPulse } from './SyncPulse.jsx'

export default function RoomCard({ room }) {
  const thumb = getThumbnail(room.videoId || 'dQw4w9WgXcQ')
  return (
    <Link to={`/room/${room.id}`} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', textDecoration: 'none' }}>
      <div style={{ position: 'relative', aspectRatio: '16/9', borderRadius: '0.5rem', overflow: 'hidden', background: 'var(--depth)' }}>
        <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(12,14,22,0.8)', padding: '4px 8px', borderRadius: '1rem' }}>
          <SyncPulse active size={14} />
          <span style={{ color: 'var(--ember)', fontWeight: 600, fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>LIVE</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <h3 style={{ fontSize: '1.1rem', color: 'var(--paper)' }}>{room.title}</h3>
        <span style={{ color: 'var(--fog)', fontSize: '0.9rem' }}>Host: {room.hostName}</span>
        <span className="mono">{room.participantCount}/{room.capacity || 12} watching</span>
      </div>
    </Link>
  )
}
