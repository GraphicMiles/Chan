import { useState } from 'react'
import { useAuth } from '../../shared/auth/hooks/useAuth.jsx'
import { useScraper } from '../../hooks/useScraper.js'
import { Button, Input, Card, Badge, EmptyState, Skeleton } from '../../shared/ui/index.js'
import { Header, Layout } from '../../shared/layout/index.js'
import styles from './ScraperPage.module.css'

const SEARCHABLE_SITES = [
  { value: 'omdb', label: 'IMDb (via OMDb)' },
]

const MANUAL_SITES = [
  { value: 'nkiri', label: 'Nkiri' },
  { value: 'netnaija', label: 'NetNaija' },
  { value: 'fzmovies', label: 'FZMovies' },
  { value: 'custom', label: 'Other (custom page)' },
]

export function ScraperPage() {
  const { user, logout } = useAuth()
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
    search(ytQuery.trim())
  }

  const switchMode = (next) => {
    setMode(next)
    clear()
  }

  return (
    <Layout header={<Header user={user} actions={user && <Button variant="ghost" size="sm" onClick={logout}>Sign out</Button>} />} wide>
      <div className={styles.intro}>
        <h1 className={styles.title}>Discover</h1>
        <p className={styles.subtitle}>
          Search on demand — nothing runs automatically or in the background. Every lookup here fires once, only when you ask for it.
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
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </optgroup>
              <optgroup label="Paste a page URL">
                {MANUAL_SITES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
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

            <Button type="submit" loading={loading}>Search</Button>
            {results.length > 0 && (
              <Button type="button" variant="secondary" onClick={clear}>Clear</Button>
            )}
          </form>
          {!isSearchableSite && (
            <p className={styles.hint}>
              This site doesn't have built-in search — open it yourself, search for your title, then paste the results page URL above.
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
            <Button type="submit" loading={loading}>Search</Button>
            {results.length > 0 && (
              <Button type="button" variant="secondary" onClick={clear}>Clear</Button>
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
          <EmptyState
            title="No results"
            description="Try a different query or check the URL."
          />
        </div>
      )}

      {!loading && !error && results.length === 0 && !lastQuery && (
        <div className={styles.empty}>
          <EmptyState
            title="Ready"
            description="Search for movies or YouTube videos above."
          />
        </div>
      )}

      {!loading && !error && results.length > 0 && (
        <div className={styles.grid}>
          {results.map((r, idx) => (
            <Card key={idx} className={styles.card}>
              {r.image || r.thumbnail ? (
                <img
                  className={styles.thumb}
                  src={r.image || r.thumbnail}
                  alt={r.title}
                  loading="lazy"
                />
              ) : (
                <div className={styles.thumb} style={{ background: 'var(--surface-2)' }} />
              )}
              <div className={styles.cardTitle} title={r.title}>
                {r.title}
              </div>
              <div className={styles.cardMeta}>
                {r.meta || r.channel || r.source}
              </div>
              <div className={styles.cardActions}>
                <Button
                  as="a"
                  href={r.link || r.url}
                  target="_blank"
                  rel="noreferrer"
                  size="sm"
                >
                  Open
                </Button>
                {r.link && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigator.clipboard.writeText(r.link)}
                  >
                    Copy link
                  </Button>
                )}
              </div>
              <Badge variant="secondary" style={{ position: 'absolute', top: 8, right: 8 }}>
                {r.source}
              </Badge>
            </Card>
          ))}
        </div>
      )}
    </Layout>
  )
}
