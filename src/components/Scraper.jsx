import { useState } from 'react';
import { useScraper } from '../hooks/useScraper';

export function Scraper() {
  const [url, setUrl] = useState('');
  const [site, setSite] = useState('nkiri');
  const [query, setQuery] = useState('');
  const { scrape, search, results, loading, error, clear } = useScraper();

  return (
    <div style={{ padding: 20, maxWidth: 800 }}>
      <h2>Media Scraper</h2>
      
      {/* YouTube Search */}
      <div style={{ marginBottom: 30, padding: 20, background: '#1a1a1a', borderRadius: 8 }}>
        <h3>YouTube Search</h3>
        <input 
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search videos..."
          style={{ padding: 10, width: 300, marginRight: 10 }}
        />
        <button onClick={() => search(query)} disabled={loading}>
          {loading ? '...' : 'Search'}
        </button>
      </div>

      {/* Site Scraper */}
      <div style={{ marginBottom: 30, padding: 20, background: '#1a1a1a', borderRadius: 8 }}>
        <h3>Scrape Movie Site</h3>
        <select value={site} onChange={e => setSite(e.target.value)} style={{ padding: 10, marginRight: 10 }}>
          <option value="nkiri">Nkiri</option>
          <option value="netnaija">NetNaija</option>
          <option value="fzmovies">FZMovies</option>
          <option value="imdb">IMDb</option>
        </select>
        <input 
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://site.com/movies"
          style={{ padding: 10, width: 300, marginRight: 10 }}
        />
        <button onClick={() => scrape({ url, site })} disabled={loading}>
          {loading ? 'Scraping...' : 'Scrape'}
        </button>
        <button onClick={clear} style={{ marginLeft: 10 }}>Clear</button>
      </div>

      {error && <div style={{ color: '#ff4444', marginBottom: 20 }}>{error}</div>}

      {/* Results */}
      <div style={{ display: 'grid', gap: 15 }}>
        {results.map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 15, padding: 15, background: '#252525', borderRadius: 8 }}>
            {item.image && (
              <img src={item.image} alt="" style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 4 }} />
            )}
            <div style={{ flex: 1 }}>
              <h4 style={{ margin: '0 0 5px 0' }}>{item.title}</h4>
              {item.meta && <p style={{ margin: 0, color: '#888', fontSize: 14 }}>{item.meta}</p>}
              {item.channel && <p style={{ margin: '5px 0 0 0', color: '#888', fontSize: 14 }}>{item.channel}</p>}
            </div>
            {item.url && (
              <a href={item.url} target="_blank" rel="noreferrer" style={{ padding: '8px 16px', background: '#3b82f6', color: 'white', textDecoration: 'none', borderRadius: 4, height: 'fit-content' }}>
                Watch
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
