import { useState } from 'react';
import { useScraper } from '../../hooks/useScraper';

export function ScraperPage() {
  const [url, setUrl] = useState('');
  const [site, setSite] = useState('nkiri');
  const [query, setQuery] = useState('');
  const { scrape, search, results, loading, error, clear } = useScraper();

  const styles = {
    container: { padding: 24, maxWidth: 900, margin: '0 auto', color: '#fff' },
    section: { marginBottom: 32, padding: 24, background: '#1a1a1a', borderRadius: 12 },
    input: { padding: 12, width: 280, marginRight: 12, borderRadius: 6, border: '1px solid #333', background: '#252525', color: '#fff' },
    select: { padding: 12, marginRight: 12, borderRadius: 6, border: '1px solid #333', background: '#252525', color: '#fff' },
    button: { padding: '12px 24px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' },
    results: { display: 'grid', gap: 16, marginTop: 24 },
    card: { display: 'flex', gap: 16, padding: 16, background: '#252525', borderRadius: 8, alignItems: 'center' },
    thumb: { width: 120, height: 80, objectFit: 'cover', borderRadius: 4 },
    title: { margin: '0 0 4px 0', fontSize: 16 },
    meta: { margin: 0, color: '#888', fontSize: 13 },
    error: { color: '#ff4444', marginBottom: 16 }
  };

  return (
    <div style={styles.container}>
      <h1>Media Scraper</h1>
      
      <div style={styles.section}>
        <h3>YouTube Search</h3>
        <input 
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search videos..."
          style={styles.input}
        />
        <button onClick={() => search(query)} disabled={loading} style={styles.button}>
          {loading ? '...' : 'Search'}
        </button>
      </div>

      <div style={styles.section}>
        <h3>Scrape Movie Site</h3>
        <select value={site} onChange={e => setSite(e.target.value)} style={styles.select}>
          <option value="nkiri">Nkiri</option>
          <option value="netnaija">NetNaija</option>
          <option value="fzmovies">FZMovies</option>
          <option value="imdb">IMDb</option>
        </select>
        <input 
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://site.com/movies"
          style={{...styles.input, width: 320}}
        />
        <button onClick={() => scrape({ url, site })} disabled={loading} style={styles.button}>
          {loading ? 'Scraping...' : 'Scrape'}
        </button>
        <button onClick={clear} style={{...styles.button, marginLeft: 8, background: '#666'}}>Clear</button>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.results}>
        {results.map((item, i) => (
          <div key={i} style={styles.card}>
            {item.image && <img src={item.image} alt="" style={styles.thumb} />}
            <div style={{flex: 1}}>
              <h4 style={styles.title}>{item.title}</h4>
              {item.meta && <p style={styles.meta}>{item.meta}</p>}
              {item.channel && <p style={styles.meta}>{item.channel}</p>}
            </div>
            {item.url && (
              <a href={item.url} target="_blank" rel="noreferrer" style={styles.button}>
                Watch
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
