import { useState, useCallback } from 'react'
import { useToast } from '../../../shared/ui/index.js'
import { parseJsonResponse } from '../../../shared/lib/api.js'

export function useScraper() {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const { toast } = useToast()

  const scrape = useCallback(async ({ url, site, roomId }) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scrape', url, site, roomId }),
      })
      const data = await parseJsonResponse(response)
      if (!response.ok || data.success === false) {
        throw new Error(data.error || 'Scrape failed')
      }
      setResults(data.results || [])
      toast(`Found ${data.count ?? data.results?.length ?? 0} items`, { variant: 'success' })
      return data.results || []
    } catch (err) {
      setError(err.message)
      toast(err.message || 'Scrape failed', { variant: 'error' })
      return []
    } finally {
      setLoading(false)
    }
  }, [toast])

  const search = useCallback(async (query, sources = ['youtube']) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'search', query, sources }),
      })
      const data = await parseJsonResponse(response)
      if (!response.ok) throw new Error(data.error || 'Search failed')
      const list = data.results || []
      setResults(list)
      return list
    } catch (err) {
      setError(err.message)
      toast(err.message || 'Search failed', { variant: 'error' })
      return []
    } finally {
      setLoading(false)
    }
  }, [toast])

  return { scrape, search, results, setResults, loading, error }
}
