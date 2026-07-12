import { useState } from 'react'
import { useAuth } from '../../shared/auth/hooks/useAuth.jsx'
import { useScraper } from '../../hooks/useScraper.js'
import { Button, Input, Card, Badge, EmptyState, Skeleton } from '../../shared/ui/index.js'
import { Header, Layout } from '../../shared/layout/index.js'
import styles from './ScraperPage.module.css'

const SEARCHABLE_SITES = [
  { value: 'imdb', label: 'IMDb' },
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

  const [mode, setMode] = useState('movies') // 'movies' | 'youtube'
  const [movieQuery, setMovieQuery] = useState('')
  const [movieSite, setMovieSite] = useState('imdb')
  const [manualUrl, setManualUrl] = useState('')
  const [ytQuery, setYtQuery] = useState('')

  const isSearchableSite = SEARCHABLE_SITES.some((s) => s.value === movieSite)

  const runMovieLookup = (e) => {
    e.preventDefault()
    if (isSearchableSite) {
      if (!movieQuery.trim()) return
      scrape({ query: movieQuery.trim(), site: movieSite })
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
        <EmptyState
          title="No results"
          description="Nothing matched that search. Try a different title, or double-check the pasted URL and site selectors."
        />
      )}

      {!loading && results.length > 0 && (
        <div className={styles.grid}>
          {results.map((item, i) => (
            <Card key={item.link || item.id || i} className={styles.resultCard}>
              {item.image || item.thumbnail ? (
                <img className={styles.thumb} src={item.image || item.thumbnail} alt="" loading="lazy" />
              ) : (
                <div className={styles.thumbPlaceholder} aria-hidden="true" />
              )}
              <div className={styles.resultBody}>
                <h4 className={styles.resultTitle}>{item.title}</h4>
                {(item.meta || item.channel) && (
                  <p className={styles.resultMeta}>{item.meta || item.channel}</p>
                )}
                <Badge variant="muted">{item.source}</Badge>
              </div>
              {(item.link || item.url) && (
                <a
                  className={styles.resultAction}
                  href={item.link || item.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open
                </a>
              )}
            </Card>
          ))}
        </div>
      )}
    </Layout>
  )
}
