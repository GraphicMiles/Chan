import { useState } from 'react';
import { useToast } from '../../../shared/ui';

export function useScraper() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();

  const scrape = async ({ url, site, roomId }) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/scrapeMedia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, site, roomId })
      });

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Scrape failed');
      }

      setResults(data.results);
      toast(`Found ${data.count} items`, { variant: 'success' });
      
    } catch (err) {
      setError(err.message);
      toast(err.message, { variant: 'danger' });
    } finally {
      setLoading(false);
    }
  };

  const search = async (query, sources = ['youtube']) => {
    setLoading(true);
    
    try {
      const response = await fetch('/api/searchMedia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, sources })
      });
      
      const data = await response.json();
      return data.results || [];
      
    } finally {
      setLoading(false);
    }
  };

  return { scrape, search, results, loading, error };
}