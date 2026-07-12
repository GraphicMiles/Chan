import { useState, useCallback, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../shared/auth/hooks/useAuth.jsx'
import { useToast } from '../../shared/ui/index.js'
import { Button, Input, Card, EmptyState, Spinner } from '../../shared/ui/index.js'
import { Header, Layout } from '../../shared/layout/index.js'
import { useScraper } from '../../hooks/useScraper.js'
import { isDirectVideoUrl, normalizeDirectUrl } from '../../shared/lib/youtube.js'
import styles from './ScraperPage.module.css'

const SITES = [
  { key: 'nkiri', label: 'Nkiri' },
  { key: 'netnaija', label: 'NetNaija' },
  { key: 'fzmovies', label: 'FZMovies' },
  { key: 'custom', label: 'Custom URL' },
]

export default function ScraperPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { toast } = useToast()
  const { results, loading, error, clear, scrape } = useScraper()
  const [url, setUrl] = useState('')
  const [query, setQuery] = useState('')
  const [site, setSite] = useState('custom')
  const [showDirectOnly, setShowDirectOnly] = useState(false)

  const handleUrlChange = useCallback((e) => {
    const value = e.target.value
    setUrl(value)
    if (value && isDirectVideoUrl(value)) {
      toast('Direct video URL detected', { variant: 'info', duration: 2000 })
    }
  }, [toast])

  const goCreateDirect = useCallback(
    (videoUrl, title) => {
      const normalized = normalizeDirectUrl(videoUrl)
      navigate(
        `/create?videoUrl=${encodeURIComponent(normalized)}&title=${encodeURIComponent(
          title || 'Video'
        )}&type=direct`
      )
    },
    [navigate]
  )

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault()
      const trimmedUrl = url.trim()

      if (!trimmedUrl && !query.trim()) {
        toast('Please enter a URL or search query', { variant: 'error' })
        return
      }

      if (isDirectVideoUrl(trimmedUrl)) {
        const normalized = normalizeDirectUrl(trimmedUrl)
        const title =
          normalized.split('/').pop()?.replace(/\.(mp4|m3u8|mkv|avi|mov|webm|ogg|flv)$/i, '') ||
          'Video'
        goCreateDirect(normalized, title)
        return
      }

      await scrape({ url: trimmedUrl || undefined, query: query.trim() || undefined, site })
    },
    [url, query, site, scrape, toast, goCreateDirect]
  )

  const handleResultClick = useCallback(
    (result) => {
      const resultUrl = result.url || result.link
      if (!resultUrl) {
        toast('No URL available for this result', { variant: 'error' })
        return
      }
      if (result.isDirect || isDirectVideoUrl(resultUrl)) {
        goCreateDirect(resultUrl, result.title || 'Video')
      } else {
        setUrl(resultUrl)
        clear()
        toast('Loaded page URL. Click Extract to find videos.', { variant: 'info' })
      }
    },
    [clear, toast, goCreateDirect]
  )

  const filteredResults = useMemo(() => {
    if (!showDirectOnly) return results
    return results.filter((r) => r.isDirect || isDirectVideoUrl(r.url || r.link))
  }, [results, showDirectOnly])

  const directCount = useMemo(
    () => results.filter((r) => r.isDirect || isDirectVideoUrl(r.url || r.link)).length,
    [results]
  )

  const isDirectInput = isDirectVideoUrl(url)

  if (!user) {
    return (
      <Layout header={<Header />}>
        <EmptyState
          title="Sign in required"
          description="Join anonymously to use media tools."
          action={
            <Button as={Link} to="/auth">
              Join
            </Button>
          }
        />
      </Layout>
    )
  }

  return (
    <Layout
      header={
        <Header
          user={user}
          actions={
            <>
              <Button as={Link} to="/create" size="sm">
                Start a Room
              </Button>
              <Button variant="ghost" size="sm" onClick={logout}>
                Sign out
              </Button>
            </>
          }
        />
      }
      wide
    >
      <div className={styles.intro}>
        <h1 className={styles.title}>Discover</h1>
        <p className={styles.subtitle}>
          Paste a page URL to extract on-page links, or a direct .mp4 / .m3u8 URL to start a room.
        </p>
      </div>

      <Card className={styles.panel}>
        <form onSubmit={handleSubmit} className={styles.form}>
          <select
            className={styles.select}
            value={site}
            onChange={(e) => setSite(e.target.value)}
            aria-label="Site"
          >
            {SITES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <Input
            className={styles.grow}
            value={url}
            onChange={handleUrlChange}
            placeholder="https://… page URL or direct video file"
          />
          <Input
            className={styles.grow}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Optional search query (supported sites only)"
          />
          <Button type="submit" loading={loading}>
            {isDirectInput ? 'Use in room' : 'Extract links'}
          </Button>
          {(results.length > 0 || url || query) && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                clear()
                setUrl('')
                setQuery('')
              }}
            >
              Clear
            </Button>
          )}
        </form>
        {isDirectInput && (
          <p className={styles.hint}>Direct video URL detected — submit to open create room.</p>
        )}
        {!isDirectInput && (
          <p className={styles.hint}>
            Page scrapes often return HTML links, not files. Only results marked Direct can play in a
            room.
          </p>
        )}
      </Card>

      {error && (
        <Card className={styles.errorCard}>
          <strong>Error:</strong> {error}
        </Card>
      )}

      {loading && (
        <div className={styles.loadingRow}>
          <Spinner /> Extracting…
        </div>
      )}

      {!loading && results.length > 0 && (
        <>
          <div className={styles.resultsHeader}>
            <h2>
              {results.length} result{results.length === 1 ? '' : 's'}
              {directCount > 0 ? ` · ${directCount} direct` : ''}
            </h2>
            <label className={styles.filter}>
              <input
                type="checkbox"
                checked={showDirectOnly}
                onChange={(e) => setShowDirectOnly(e.target.checked)}
              />
              Direct files only
            </label>
          </div>

          {directCount === 0 && (
            <p className={styles.hint}>
              No direct video files found. Open a page result to dig further, or paste a direct
              .mp4/.m3u8 link.
            </p>
          )}

          <div className={styles.grid}>
            {filteredResults.map((result, index) => {
              const href = result.url || result.link
              const playable = result.isDirect || isDirectVideoUrl(href)
              return (
                <Card key={result.id ?? index} className={styles.card}>
                  {result.image ? (
                    <img
                      className={styles.thumb}
                      src={result.image}
                      alt=""
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  ) : (
                    <div className={styles.thumbPlaceholder}>No image</div>
                  )}
                  <div className={styles.cardTitle}>{result.title}</div>
                  <div className={styles.cardMeta}>
                    {result.quality && <span>{result.quality} · </span>}
                    {playable ? 'Direct' : 'Page'}
                    {result.source ? ` · ${result.source}` : ''}
                  </div>
                  <div className={styles.cardActions}>
                    {playable ? (
                      <Button size="sm" onClick={() => goCreateDirect(href, result.title)}>
                        Watch in room
                      </Button>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => handleResultClick(result)}>
                        Use as page URL
                      </Button>
                    )}
                    {href && (
                      <Button as="a" href={href} target="_blank" rel="noreferrer" size="sm" variant="ghost">
                        Open
                      </Button>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        </>
      )}

      {!loading && !error && results.length === 0 && (
        <div className={styles.empty}>
          <EmptyState title="Ready" description="Paste a URL above and extract links." />
        </div>
      )}
    </Layout>
  )
}
