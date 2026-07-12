import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../shared/auth/hooks/useAuth.jsx'
import { useScraper } from '../../hooks/useScraper.js'
import { isDirectVideoUrl } from '../../shared/lib/youtube.js'
import { Button, Input, Card, Badge, EmptyState, Skeleton, useToast } from '../../shared/ui/index.js'
import { Header, Layout } from '../../shared/layout/index.js'
import styles from './ScraperPage.module.css'

const SEARCHABLE_SITES = [{ value: 'omdb', label: 'IMDb (via OMDb)' }]

const MANUAL_SITES = [
  { value: 'nkiri', label: 'Nkiri' },
  { value: 'netnaija', label: 'NetNaija' },
  { value: 'fzmovies', label: 'FZMovies' },
  { value: 'custom', label: 'Other (custom page)' },
]

export function ScraperPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { toast } = useToast()
  const { scrape, search, results, lastQuery, loading, error, clear } = useScraper()

  const [mode, setMode] = useState('movies')
  const [movieQuery, setMovieQuery] = useState('')
  const [movieSite, setMovieSite] = useState('omdb')
  const [manualUrl, setManualUrl] = useState('')
  const [ytQuery, setYtQuery] = useState('')

  const isSearchableSite = SEARCHABLE_SITES.some((s) => s.value === movieSite)

  const runMovieLookup = (e) => {
    e.preventDefault()
    if (isSearchableSite) {
      if (!movieQuery.trim()) return
      search(movieQuery.trim(), movieSite)
    } else {
      if (!manualUrl.trim()) return
      scrape({ url: manualUrl.trim(), site: movieSite })
    }
  }

  const runYoutubeSearch = (e) => {
    e.preventDefault()
    if (!ytQuery.trim()) return
    search(ytQuery.trim(), 'youtube')
  }

  const switchMode = (next) => {
    setMode(next)
    clear()
  }

  const startYoutubeRoom = (item) => {
    if (!item?.id) return
    if (item.embeddable === false) {
      toast(
        'This video often cannot embed in Chan (Vevo/label). Open on YouTube or pick another.',
        { variant: 'warning', duration: 6000 }
      )
    }
    const q = new URLSearchParams({
      video: item.id,
      title: item.title || 'Watch Party',
      type: 'youtube',
    })
    navigate(`/create?${q.toString()}`)
  }

  const startDirectRoom = (videoUrl, title) => {
    if (!isDirectVideoUrl(videoUrl)) {
      toast('That is not a direct video file URL (.mp4 / .m3u8).', { variant: 'error' })
      return
    }
    const q = new URLSearchParams({
      videoUrl,
      title: title || 'Watch Party',
      type: 'direct',
    })
    navigate(`/create?${q.toString()}`)
  }

  return (
    <Layout
      header={
        <Header
          user={user}
          actions={
            user && (
              <Button variant="ghost" size="sm" onClick={logout}>
                Sign out
              </Button>
            )
          }
        />
      }
      wide
    >
      <div className={styles.intro}>
        <h1 className={styles.title}>Discover</h1>
        <p className={styles.subtitle}>
          Search on demand. YouTube results prefer embeddable videos. Movie-site scrape finds links on a page you paste —
          only direct media files can play in a room.
        </p>
      </div>

      <div className={styles.tabs}>
        <button
          type="button"
          className={mode === 'movies' ? styles.tabActive : styles.tab}
          onClick={() => switchMode('movies')}
        >
          Movies &amp; shows
        </button>
        <button
          type="button"
          className={mode === 'youtube' ? styles.tabActive : styles.tab}
          onClick={() => switchMode('youtube')}
        >
          YouTube
        </button>
      </div>

      {mode === 'movies' ? (
        <Card className={styles.panel}>
          <form className={styles.form} onSubmit={runMovieLookup}>
            <select
              className={styles.select}
              value={movieSite}
              onChange={(e) => setMovieSite(e.target.value)}
            >
              <optgroup label="Search by title">
                {SEARCHABLE_SITES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Paste a page URL">
                {MANUAL_SITES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            </select>

            {isSearchableSite ? (
              <Input
                className={styles.grow}
                value={movieQuery}
                onChange={(e) => setMovieQuery(e.target.value)}
                placeholder='Search a title, e.g. "Superman 2025"'
              />
            ) : (
              <Input
                className={styles.grow}
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                placeholder="Paste the exact page URL to read"
              />
            )}

            <Button type="submit" loading={loading}>
              Search
            </Button>
            {results.length > 0 && (
              <Button type="button" variant="secondary" onClick={clear}>
                Clear
              </Button>
            )}
          </form>
          {!isSearchableSite && (
            <p className={styles.hint}>
              Open the site yourself, go to the title page, paste that URL. We extract on-page media URLs when present;
              many sites only expose HTML download pages (Open/Copy only).
            </p>
          )}
        </Card>
      ) : (
        <Card className={styles.panel}>
          <form className={styles.form} onSubmit={runYoutubeSearch}>
            <Input
              className={styles.grow}
              value={ytQuery}
              onChange={(e) => setYtQuery(e.target.value)}
              placeholder="Search YouTube videos..."
            />
            <Button type="submit" loading={loading}>
              Search
            </Button>
            {results.length > 0 && (
              <Button type="button" variant="secondary" onClick={clear}>
                Clear
              </Button>
            )}
          </form>
        </Card>
      )}

      {error && (
        <Card className={styles.errorCard}>
          <strong>Search failed:</strong> {error}
        </Card>
      )}

      {loading && (
        <div className={styles.grid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className={styles.skeletonCard}>
              <Skeleton height={120} rounded="md" />
              <Skeleton height={16} style={{ marginTop: 12 }} />
              <Skeleton height={12} width="60%" style={{ marginTop: 8 }} />
            </Card>
          ))}
        </div>
      )}

      {!loading && !error && results.length === 0 && lastQuery && (
        <div className={styles.empty}>
          <EmptyState title="No results" description="Try a different query or check the URL." />
        </div>
      )}

      {!loading && !error && results.length === 0 && !lastQuery && (
        <div className={styles.empty}>
          <EmptyState title="Ready" description="Search for movies or YouTube videos above." />
        </div>
      )}

      {!loading && !error && results.length > 0 && (
        <div className={styles.grid}>
          {results.map((r, idx) => {
            const href = r.link || r.url
            const direct = r.isDirect || isDirectVideoUrl(href)
            const isYt = r.source === 'youtube' && r.id
            const embedBlocked = isYt && r.embeddable === false

            return (
              <Card key={r.id || href || idx} className={styles.card}>
                {r.image || r.thumbnail ? (
                  <img
                    className={styles.thumb}
                    src={r.image || r.thumbnail}
                    alt=""
                    loading="lazy"
                    onError={(e) => {
                      e.target.style.display = 'none'
                    }}
                  />
                ) : (
                  <div className={styles.thumbPlaceholder}>No image</div>
                )}
                <div className={styles.cardTitle} title={r.title}>
                  {r.title}
                </div>
                <div className={styles.cardMeta}>
                  {r.meta || r.channel || r.source}
                  {embedBlocked ? ' · may not embed' : ''}
                  {direct ? ' · direct file' : ''}
                </div>
                <div className={styles.cardActions}>
                  {href && (
                    <Button as="a" href={href} target="_blank" rel="noreferrer" size="sm">
                      Open
                    </Button>
                  )}
                  {href && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(href)
                        toast('Copied', { variant: 'success' })
                      }}
                    >
                      Copy
                    </Button>
                  )}
                  {isYt && (
                    <Button size="sm" onClick={() => startYoutubeRoom(r)}>
                      Start room
                    </Button>
                  )}
                  {direct && !isYt && (
                    <Button size="sm" onClick={() => startDirectRoom(href, r.title)}>
                      Watch in room
                    </Button>
                  )}
                </div>
                <Badge variant="secondary" className={styles.badge}>
                  {r.source}
                </Badge>
              </Card>
            )
          })}
        </div>
      )}
    </Layout>
  )
}
