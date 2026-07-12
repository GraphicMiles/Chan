import { useState } from 'react';
import { useScraper } from '../hooks/useScraper';
import { Button, Input, Card, Spinner } from '../../../shared/ui';
import styles from './ScraperPage.module.css';

export function ScraperPage() {
  const [url, setUrl] = useState('');
  const [site, setSite] = useState('imdb');
  const { scrape, results, loading, error } = useScraper();

  const handleScrape = () => {
    if (!url) return;
    scrape({ url, site });
  };

  const handleAddToRoom = (item) => {
    // Integrate with your room feature
    console.log('Adding to room:', item);
  };

  return (
    <div className={styles.container}>
      <h1>Media Scraper</h1>
      
      <div className={styles.form}>
        <select 
          value={site} 
          onChange={(e) => setSite(e.target.value)}
          className={styles.select}
        >
          <option value="imdb">IMDb</option>
          <option value="custom">Custom</option>
        </select>
        
        <Input
          placeholder="Enter URL to scrape..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className={styles.input}
        />
        
        <Button onClick={handleScrape} loading={loading}>
          Scrape
        </Button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.results}>
        {results.map((item, idx) => (
          <Card key={idx} className={styles.resultCard}>
            {item.poster && (
              <img src={item.poster} alt={item.title} className={styles.poster} />
            )}
            <div className={styles.info}>
              <h3>{item.title}</h3>
              {item.year && <span className={styles.meta}>{item.year}</span>}
              {item.rating && <span className={styles.rating}>★ {item.rating}</span>}
            </div>
            <Button 
              variant="secondary" 
              size="sm"
              onClick={() => handleAddToRoom(item)}
            >
              Add to Room
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}