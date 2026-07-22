import { X, Play, Loader2 } from 'lucide-react'

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(10,9,8,0.88)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '16px',
  },
  modal: {
    background: '#1D1B16',
    border: '1px solid #38352B',
    borderRadius: '10px',
    width: '100%',
    maxWidth: '860px',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
  },
  header: {
    padding: '16px 20px',
    borderBottom: '1px solid #38352B',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
    flexWrap: 'wrap',
    gap: '10px',
  },
  titleWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  title: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontWeight: 700,
    fontSize: '17px',
    color: '#F2EFE6',
    margin: 0,
    letterSpacing: '-0.3px',
  },
  badge: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: '9px',
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
    padding: '3px 8px',
    borderRadius: '20px',
    display: 'inline-flex',
    alignItems: 'center',
    fontWeight: 500,
    background: '#26231C',
    color: '#6E695C',
    border: '1px solid #38352B',
  },
  closeBtn: {
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    border: '1px solid #38352B',
    background: '#26231C',
    color: '#6E695C',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s',
    padding: 0,
    flexShrink: 0,
  },
  body: {
    padding: '20px',
    overflowY: 'auto',
    flex: 1,
  },
  grid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
  },
  loadingWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 20px',
    gap: '12px',
  },
  loadingLabel: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: '14px',
    fontWeight: 600,
    color: '#F2EFE6',
  },
  loadingSub: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: '10px',
    color: '#6E695C',
  },
}

const episodeCardBase = {
  width: 'calc(25% - 7.5px)',
  minWidth: '140px',
  background: '#14130F',
  border: '1px solid #38352B',
  borderRadius: '8px',
  overflow: 'hidden',
  cursor: 'pointer',
  transition: 'all 0.15s',
}

export function EpisodesModal({ open, showTitle, seasonNum, episodes, loading, onClose, onEpisodeClick }) {
  if (!open) return null

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.titleWrap}>
            <h3 style={styles.title}>{showTitle} — Season {seasonNum}</h3>
            {!loading && episodes.length > 0 && (
              <span style={styles.badge}>{episodes.length} episodes</span>
            )}
            <span style={{ ...styles.badge, background: 'rgba(31,122,92,0.1)', color: '#1F7A5C', borderColor: 'rgba(31,122,92,0.25)' }}>
              O2TV
            </span>
          </div>
          <button
            type="button"
            style={styles.closeBtn}
            onClick={onClose}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#FF5C3E'; e.currentTarget.style.color = '#FF5C3E' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#38352B'; e.currentTarget.style.color = '#6E695C' }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={styles.body}>
          {loading ? (
            <div style={styles.loadingWrap}>
              <Loader2 size={28} style={{ color: '#C6FF33', animation: 'spin 0.7s linear infinite' }} />
              <div style={styles.loadingLabel}>Loading episodes...</div>
              <div style={styles.loadingSub}>Fetching from O2TV</div>
            </div>
          ) : (
            <div style={styles.grid}>
              {episodes.map((ep) => (
                <EpisodeCard key={ep.number} episode={ep} onClick={() => onEpisodeClick(ep)} />
              ))}
              {episodes.length === 0 && (
                <div style={{ width: '100%', textAlign: 'center', padding: '40px 20px', color: '#6E695C', fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px' }}>
                  No episodes found for this season
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function EpisodeCard({ episode, onClick }) {
  const cardRef = { current: null }

  return (
    <div
      ref={cardRef}
      style={episodeCardBase}
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#6E695C'
        e.currentTarget.style.transform = 'translateY(-2px)'
        const playIcon = e.currentTarget.querySelector('[data-play]')
        if (playIcon) { playIcon.style.background = 'rgba(198,255,51,0.15)'; playIcon.style.borderColor = 'rgba(198,255,51,0.3)'; playIcon.style.color = '#C6FF33' }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#38352B'
        e.currentTarget.style.transform = 'none'
        const playIcon = e.currentTarget.querySelector('[data-play]')
        if (playIcon) { playIcon.style.background = 'rgba(242,239,230,0.06)'; playIcon.style.borderColor = 'rgba(242,239,230,0.12)'; playIcon.style.color = '#A8A296' }
      }}
    >
      <div style={{
        aspectRatio: '16/9',
        background: 'linear-gradient(135deg, #26231C, #2E2A20)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}>
        <span style={{
          position: 'absolute',
          top: '8px',
          left: '8px',
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '9px',
          fontWeight: 500,
          background: 'rgba(10,9,8,0.8)',
          padding: '2px 6px',
          borderRadius: '4px',
          color: '#A8A296',
        }}>
          E{String(episode.number).padStart(2, '0')}
        </span>
        <div
          data-play=""
          style={{
            width: '32px',
            height: '32px',
            background: 'rgba(242,239,230,0.06)',
            border: '1px solid rgba(242,239,230,0.12)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#A8A296',
            transition: 'all 0.15s',
          }}
        >
          <Play size={14} fill="currentColor" />
        </div>
        {episode.duration && (
          <span style={{
            position: 'absolute',
            bottom: '8px',
            right: '8px',
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '9px',
            fontWeight: 500,
            background: 'rgba(10,9,8,0.8)',
            padding: '2px 6px',
            borderRadius: '4px',
            color: '#A8A296',
          }}>
            {episode.duration}
          </span>
        )}
      </div>

      <div style={{ padding: '10px 12px' }}>
        <div style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontWeight: 600,
          fontSize: '13px',
          color: '#F2EFE6',
          marginBottom: '2px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          Episode {episode.number}
        </div>
        <div style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '10px',
          color: '#6E695C',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {episode.title}
        </div>
      </div>
    </div>
  )
}
