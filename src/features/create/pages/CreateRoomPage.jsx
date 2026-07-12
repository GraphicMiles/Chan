import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import styles from './CreateRoomPage.module.scss'
import { useAuth } from '../../auth/AuthContext'
import { createRoom, joinRoom } from '../../../api/rooms'
import { extractVideoId, buildYouTubeEmbedUrl, isDirectVideoUrl, normalizeDirectUrl } from '../../../shared/lib/youtube.js'
import { useScraper } from '../../../hooks/useScraper.js'
import { ScraperResultCard } from '../../scraper/components/ScraperResultCard.jsx'

const MAX_TITLE = 120
const MAX_DESC = 500

export default function CreateRoomPage() {
  const { user, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  
  const [title, setTitle] = useState('')
  const [description, setDesc] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [videoType, setVideoType] = useState('youtube')
  const [videoId, setVideoId] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [url, setUrl] = useState('')
  const [embedWarning, setEmbedWarning] = useState(null)
  const [creating, setCreating] = useState(false)
  const [selectedResult, setSelectedResult] = useState(null)
  const [mode, setMode] = useState('youtube')
  const fileInputRef = useRef(null)
  
  const { results, loading, error, clear, scrape } = useScraper()

  // Load from URL params (e.g., from scraper redirect)
  useEffect(() => {
    const videoUrlParam = searchParams.get('videoUrl')
    const titleParam = searchParams.get('title')
    const typeParam = searchParams.get('type')
    
    if (videoUrlParam) {
      const decodedUrl = decodeURIComponent(videoUrlParam)
      setVideoUrl(decodedUrl)
      setUrl(decodedUrl)
      
      if (typeParam === 'direct' || isDirectVideoUrl(decodedUrl)) {
        setMode('direct')
        setVideoType('direct')
        setVideoId('')
      }
      
      if (titleParam) {
        setTitle(decodeURIComponent(titleParam))
      }
    }
  }, [searchParams])

  const onTitleChange = (v) => setTitle(v.slice(0, MAX_TITLE))
  const onDescChange = (v) => setDesc(v.slice(0, MAX_DESC))

  const onUrlChange = (value) => {
    setUrl(value)
    setEmbedWarning(null)
    clear()
    setSelectedResult(null)
    
    const id = extractVideoId(value)
    if (id) {
      setVideoId(id)
      setVideoUrl('')
      setVideoType('youtube')
      setMode('youtube')
      return
    }
    
    // Check for direct video URL
    if (isDirectVideoUrl(value)) {
      const normalized = normalizeDirectUrl(value.trim())
      setVideoUrl(normalized)
      setVideoId('')
      setVideoType('direct')
      setMode('direct')
      toast.success('Direct video URL detected')
      return
    }
    
    // Reset if empty
    if (!value.trim()) {
      setVideoId('')
      setVideoUrl('')
      setVideoType('youtube')
    }
  }

  const handleScrape = async () => {
    if (!url.trim()) {
      toast.error('Please enter a URL')
      return
    }
    
    // If it's a direct URL, no need to scrape
    if (isDirectVideoUrl(url)) {
      const normalized = normalizeDirectUrl(url.trim())
      setVideoUrl(normalized)
      setVideoType('direct')
      setMode('direct')
      toast.success('Direct video URL ready to play')
      return
    }
    
    try {
      await scrape({ url })
    } catch (e) {
      toast.error(e.message || 'Failed to extract links')
    }
  }

  const handleResultSelect = (result) => {
    setSelectedResult(result)
    
    if (result.isDirect && result.url) {
      setVideoUrl(result.url)
      setVideoType('direct')
      setVideoId('')
      setMode('direct')
      if (result.title && !title) {
        setTitle(result.title)
      }
    } else if (result.link) {
      // For non-direct results, we might need to scrape further
      setUrl(result.link)
      toast.info('This is a page link. You may need to open it and extract the video.')
    }
  }

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error('Please enter a room title')
      return
    }
    
    let finalVideoUrl = ''
    
    if (mode === 'youtube' && videoId) {
      finalVideoUrl = buildYouTubeEmbedUrl(videoId)
    } else if (mode === 'direct' && videoUrl) {
      finalVideoUrl = videoUrl
    } else if (mode === 'upload' && fileInputRef.current?.files?.[0]) {
      toast.error('File upload not yet implemented')
      return
    } else {
      toast.error('Please provide a valid video source')
      return
    }
    
    if (!finalVideoUrl) {
      toast.error('Please provide a video URL')
      return
    }
    
    setCreating(true)
    
    try {
      const room = await createRoom({
        title: title.trim(),
        description: description.trim(),
        isPublic,
        videoUrl: finalVideoUrl,
        videoType: mode,
      })
      
      toast.success('Room created!')
      navigate(`/room/${room.id}`)
    } catch (e) {
      toast.error(e.message || 'Failed to create room')
    } finally {
      setCreating(false)
    }
  }

  const canCreate = useMemo(() => {
    if (!title.trim()) return false
    if (mode === 'youtube' && !videoId) return false
    if (mode === 'direct' && !videoUrl) return false
    return true
  }, [title, mode, videoId, videoUrl])

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1>Create a Watch Room</h1>
        
        <div className={styles.tabs}>
          <button
            className={mode === 'youtube' ? styles.active : ''}
            onClick={() => setMode('youtube')}
          >
            YouTube
          </button>
          <button
            className={mode === 'direct' ? styles.active : ''}
            onClick={() => setMode('direct')}
          >
            Direct URL / Scrape
          </button>
        </div>

        <div className={styles.field}>
          <label>Room Title</label>
          <input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="e.g., Movie Night - Westworld S04E01"
            maxLength={MAX_TITLE}
          />
          <span className={styles.hint}>{title.length}/{MAX_TITLE}</span>
        </div>

        <div className={styles.field}>
          <label>Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => onDescChange(e.target.value)}
            placeholder="What's this about?"
            maxLength={MAX_DESC}
            rows={3}
          />
          <span className={styles.hint}>{description.length}/{MAX_DESC}</span>
        </div>

        <div className={styles.field}>
          <label>Visibility</label>
          <div className={styles.toggleRow}>
            <button
              className={isPublic ? styles.active : ''}
              onClick={() => setIsPublic(true)}
            >
              Public
            </button>
            <button
              className={!isPublic ? styles.active : ''}
              onClick={() => setIsPublic(false)}
            >
              Private
            </button>
          </div>
        </div>

        {mode === 'youtube' && (
          <div className={styles.field}>
            <label>YouTube URL</label>
            <input
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
            />
            {embedWarning && (
              <div className={styles.warning}>{embedWarning}</div>
            )}
            {videoId && !embedWarning && (
              <div className={styles.preview}>
                <span className={styles.success}>YouTube video detected</span>
              </div>
            )}
          </div>
        )}

        {mode === 'direct' && (
          <>
            <div className={styles.field}>
              <label>Page URL or direct .mp4 link</label>
              <input
                value={url}
                onChange={(e) => onUrlChange(e.target.value)}
                placeholder="https://site.com/movie or http://cdn.com/file.mp4"
              />
              <div className={styles.scrapeRow}>
                <button
                  onClick={handleScrape}
                  disabled={loading || !url.trim()}
                  className={styles.scrapeBtn}
                >
                  {loading ? 'Extracting...' : 'Extract links from page'}
                </button>
                {isDirectVideoUrl(url) && (
                  <span className={styles.directBadge}>Direct video detected</span>
                )}
              </div>
            </div>

            {error && (
              <div className={styles.error}>
                {error}
              </div>
            )}

            {results.length > 0 && (
              <div className={styles.results}>
                <h3>Found {results.length} result(s)</h3>
                <div className={styles.resultList}>
                  {results.map((r, idx) => (
                    <ScraperResultCard
                      key={idx}
                      result={r}
                      selected={selectedResult === r}
                      onClick={() => handleResultSelect(r)}
                    />
                  ))}
                </div>
              </div>
            )}

            {videoUrl && videoType === 'direct' && (
              <div className={styles.preview}>
                <span className={styles.success}>Ready to play: {videoUrl.slice(0, 60)}...</span>
              </div>
            )}
          </>
        )}

        <div className={styles.actions}>
          <button
            className={styles.primary}
            onClick={handleCreate}
            disabled={!canCreate || creating}
          >
            {creating ? 'Creating...' : 'Create Room'}
          </button>
        </div>
      </div>
    </div>
  )
        }
