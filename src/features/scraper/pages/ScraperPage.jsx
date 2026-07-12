import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../../shared/auth/hooks/useAuth.jsx'
import { useScraper } from '../hooks/useScraper.js'
import { Button, Input, Card } from '../../../shared/ui/index.js'
import { Header, Layout } from '../../../shared/layout/index.js'
import styles from './ScraperPage.module.css'

export default function ScraperPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('search') // search | scrape
  const [query, setQuery] = useState('')
  const [url, setUrl] = useState('')
  const [site, setSite] = useState('imdb')
  const { scrape, search, results, loading, error } = useScraper()

  if (!user) {
    return (
      <div className={styles.container}>
        <Card>
          <p>Sign in to use media tools.</p>
          <Button as={Link} to="/auth">Join</Button>
        </Card>
      </div>
    )
  }

  const onSearch = async (e) => {
    e.preventDefault()
    if (!query.trim()) return
    await search(query.trim(), ['youtube'])
  }

  const onScrape = async (e) => {
    e.preventDefault()
    if (!url.trim()) return
    await scrape({ url: url.trim(), site })
  }

  const useInRoom = (item) => {
    if (item.source === 'youtube' && item.id) {
      // Hand off to create flow via query params
      navigate(`/create?video=${encodeURIComponent(item.id)}&title=${encodeURIComponent(item.title || '')}`)
      return
    }
    // Metadata-only scrape results: open link for manual pick
    if (item.link) window.open(item.link, '_blank', 'noopener,noreferrer')
  }

  const header = (
    <Header
      user={user}
      actions={
        <>
          <Button as={Link} to="/" variant="secondary" size="sm">Home</Button>
          <Button as={Link} to="/create" size="sm">Start a Room</Button>
        </>
      }
    />
  )

  return (
    <Layout header={header}>
      <div className={styles.container}>
        <h1 className={styles.title}>Media tools</h1>
        <p className={styles.subtitle}>
          Search YouTube (official API) or pull public list metadata from supported sites.
        </p>

        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${mode === 'search' ? styles.tabActive : ''}`}
            onClick={() => setMode('search')}
          >
            YouTube search
          </button>
          <button
            type="button"
            className={`${styles.tab} ${mode === 'scrape' ? styles.tabActive : ''}`}
            onClick={() => setMode('scrape')}
          >
            List scrape
          </button>
        </div>

        {mode === 'search' ? (
          <form onSubmit={onSearch} className={styles.form}>
            <Input
              placeholder="Search YouTube…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button type="submit" loading={loading}>Search</Button>
          </form>
        ) : (
          <form onSubmit={onScrape} className={styles.form}>
            <select
              value={site}
              onChange={(e) => setSite(e.target.value)}
              className={styles.select}
              aria-label="Site"
            >
              <option value="imdb">IMDb list</option>
            </select>
            <Input
              placeholder="Paste list page URL…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Button type="submit" loading={loading}>Scrape</Button>
          </form>
        )}

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.results}>
          {results.map((item, idx) => (
            <Card key={item.id || item.link || idx} className={styles.resultCard}>
              {(item.thumbnail || item.poster) && (
                <img
                  src={item.thumbnail || item.poster}
                  alt=""
                  className={styles.poster}
                />
              )}
              <div className={styles.info}>
                <h3 className={styles.itemTitle}>{item.title}</h3>
                {item.channel && <span className={styles.meta}>{item.channel}</span>}
                {item.year && <span className={styles.meta}>{item.year}</span>}
                {item.rating && <span className={styles.rating}>★ {item.rating}</span>}
                {item.source && <span className={styles.meta}>{item.source}</span>}
              </div>
              <Button variant="secondary" size="sm" onClick={() => useInRoom(item)}>
                {item.source === 'youtube' ? 'Use in room' : 'Open'}
              </Button>
            </Card>
          ))}
          {!loading && results.length === 0 && (
            <p className={styles.empty}>No results yet.</p>
          )}
        </div>
      </div>
    </Layout>
  )
}
