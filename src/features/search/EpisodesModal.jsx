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
    animation: 'fadeIn 0.2s ease',
  },
  modal: {
    background: '#1D1B16',
    border: '1px solid #38352B',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '880px',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 32px 64px rgba(0,0,0,0.6)',
    animation: 'slideUp 0.25s ease',
  },
  header: {
    padding: '18px 24px',
    borderBottom: '1px solid #38352B',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
  },
  titleWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  title: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontWeight: 700,
    fontSize: '18px',
    color: '#F2EFE6',
    margin: 0,
  },
  countBadge: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: '9px',
    letterSpacing: '1px',
    textTransform: 'uppercase',
    padding: '3px 9px',
    borderRadius: '20px',
    display: 'inline-flex',
    alignItems: 'center',
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
  },
  body: {
    padding: '24px',
    overflowY: 'auto',
    flex: 1,
  },
  grid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
  },
  loadingWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
    gap: '12px',
  },
  loadingLabel: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: '11px',
    color: '#6E695C',
  },
}

const episodeCardStyle = {
  width: 'calc(25% - 9px)',
  minWidth: '150px',
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
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.titleWrap}>
            <h3 style={styles.title}>{showTitle} — Season {seasonNum}</h3>
            {!loading && (
              <span style={styles.countBadge}>{episodes.length} episode{episodes.length !== 1 ? 's' : ''}</span>
            )}
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

        {/* Body */}
        <div style={styles.body}>
          {loading ? (
            <div style={styles.loadingWrap}>
              <Loader2 size={24} style={{ color: '#C6FF33', animation: 'spin 0.8s linear infinite' }} />
              <div style={styles.loadingLabel}>Loading episodes...</div>
            </div>
          ) : (
            <div style={styles.grid}>
              {episodes.map((ep) => (
                <EpisodeCard key={ep.number} episode={ep} onClick={() => onEpisodeClick(ep)} />
              ))}
              {episodes.length === 0 && (
                <div style={{ width: '100%', textAlign: 'center', padding: '40px 20px', color: '#6E695C', fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px' }}>
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
  return (
    <div
      style={episodeCardStyle}
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#C6FF33'
        e.currentTarget.style.transform = 'translateY(-3px)'
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)'
        const playIcon = e.currentTarget.querySelector('[data-play]')
        if (playIcon) { playIcon.style.background = '#C6FF33'; playIcon.style.color = '#14130F' }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#38352B'
        e.currentTarget.style.transform = 'none'
        e.currentTarget.style.boxShadow = 'none'
        const playIcon = e.currentTarget.querySelector('[data-play]')
        if (playIcon) { playIcon.style.background = 'rgba(198,255,51,0.15)'; playIcon.style.color = '#C6FF33' }
      }}
    >
      {/* Thumbnail */}
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
          background: 'rgba(20,19,15,0.85)',
          padding: '2px 6px',
          borderRadius: '4px',
          color: '#A8A296',
          letterSpacing: '1px',
        }}>
          E{String(episode.number).padStart(2, '0')}
        </span>
        <div
          data-play=""
          style={{
            width: '36px',
            height: '36px',
            background: 'rgba(198,255,51,0.15)',
            border: '1px solid rgba(198,255,51,0.4)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#C6FF33',
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
            background: 'rgba(20,19,15,0.85)',
            padding: '2px 6px',
            borderRadius: '4px',
            color: '#A8A296',
          }}>
            {episode.duration}
          </span>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '12px' }}>
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
