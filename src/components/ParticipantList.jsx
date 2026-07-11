import { SyncPulse } from './SyncPulse.jsx'

export default function ParticipantList({ participants, hostId }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <h3 style={{ fontSize: '1rem' }}>Participants</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {participants.map((p) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ position: 'relative' }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'var(--drift)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  color: 'var(--depth)',
                }}
              >
                {(p.displayName || 'V').charAt(0).toUpperCase()}
              </div>
              {p.id === hostId && (
                <div style={{ position: 'absolute', inset: -4 }}>
                  <SyncPulse active size={40} />
                </div>
              )}
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 500, fontSize: '0.95rem' }}>{p.displayName}</span>
              {p.id === hostId && <span className="mono" style={{ color: 'var(--drift)' }}>Host</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
