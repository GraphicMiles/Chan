import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore'
import { Plus, Search, LogOut, Film, Hash, Zap, Play } from 'lucide-react'
import { db } from '../../../shared/lib/firebase.js'
import { useAuth } from '../../../shared/auth/hooks/useAuth.jsx'
import { parseJsonResponse } from '../../../shared/lib/api.js'
import { Button, Input, EmptyState, Skeleton, useToast } from '../../../shared/ui/index.js'
import { Header, Layout } from '../../../shared/layout/index.js'
import RoomCard from '../components/RoomCard.jsx'
import MostStreamedCard from '../components/MostStreamedCard.jsx'
import { ErrorBoundary } from '../../../shared/components/ErrorBoundary.jsx'
import { getLastRoom } from '../../room/hooks/useRoom.js'
import styles from './HomePage.module.css'

export default function HomePage() {
  const { user, loading, logout } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [rooms, setRooms] = useState([])
  const [inviteCode, setInviteCode] = useState('')
  const [roomsLoading, setRoomsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [joining, setJoining] = useState(false)
  const [lastRoom, setLastRoom] = useState(null)
  const [continueRoom, setContinueRoom] = useState(null)

  useEffect(() => { setLastRoom(getLastRoom()) }, [])

  useEffect(() => {
    if (!user) { setRoomsLoading(false); return undefined }
    const unsub = onSnapshot(
      query(collection(db, 'rooms'), where('status', '==', 'live'), where('isPrivate', '==', false)),
      (snap) => {
        setRooms(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setRoomsLoading(false)
      },
      (err) => {
        console.error(err)
        setRoomsLoading(false)
        toast('Could not load rooms.', { variant: 'error' })
      }
    )
    return unsub
  }, [user, toast])

  const filteredRooms = useMemo(() => {
    const term = search.trim().toLowerCase()
    let list = rooms
    if (term) {
      list = rooms.filter(
        (r) => r.title?.toLowerCase().includes(term) || r.hostName?.toLowerCase().includes(term)
      )
    }
    return [...list].sort((a, b) => {
      if (sortBy === 'popular') return (b.participantCount || 0) - (a.participantCount || 0)
      return (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
    })
  }, [rooms, search, sortBy])

  useEffect(() => {
    if (!lastRoom?.roomId || !user) { setContinueRoom(null); return }
    const found = rooms.find((r) => r.id === lastRoom.roomId)
    if (found) { setContinueRoom(found); return }
    getDoc(doc(db, 'rooms', lastRoom.roomId))
      .then((snap) => {
        if (snap.exists() && snap.data().status === 'live') {
          setContinueRoom({ id: snap.id, ...snap.data() })
        } else { setContinueRoom(null) }
      })
      .catch(() => setContinueRoom(null))
  }, [rooms, lastRoom, user])

  const joinByInvite = async (e) => {
    e.preventDefault()
    if (!inviteCode.trim()) return
    if (!user) { toast('Sign in first', { variant: 'warning' }); navigate('/auth'); return }
    const code = inviteCode.trim().toUpperCase()
    setJoining(true)
    try {
      const token = await user.getIdToken()
      const res = await fetch('/api/room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'join', inviteCode: code, uid: user.uid, displayName: user.displayName || 'Viewer' }),
      })
      const data = await parseJsonResponse(res)
      if (res.ok && data.roomId) { navigate(`/room/${data.roomId}?invite=${code}`) }
      else { toast(data.error || 'Invalid invite code', { variant: 'error' }) }
    } catch (err) { toast(err.message || 'Could not join', { variant: 'error' }) }
    finally { setJoining(false) }
  }

  const totalViewers = rooms.reduce((sum, r) => sum + (r.participantCount || 0), 0)

  const headerActions = user ? (
    <Button variant="ghost" size="md" onClick={logout} aria-label="Sign out" title="Sign out">
      <LogOut size={16} />
    </Button>
  ) : (
    <Button as={Link} to="/auth" variant="primary" size="md">Sign In</Button>
  )

  const mostWatchedRoom = useMemo(() => {
    if (!rooms || !rooms.length) return null
    return [...rooms].sort((a, b) => (b.participantCount || 0) - (a.participantCount || 0))[0]
  }, [rooms])

  return (
    <Layout header={<Header user={user} actions={headerActions} />}>
      <section className={styles.hero}>
        <div className={styles.badgeRow}>
          <span className={styles.badgePill}>
            <span className={styles.dotRed} />
            {rooms.length} room{rooms.length !== 1 ? 's' : ''} live right now
          </span>
        </div>
        <h1 className={styles.heroTitle}>
          <span className={styles.blackLine}>Watch Together.</span>
          <span className={styles.greenLine}>Feel Together.</span>
        </h1>
        <p className={styles.heroSub}>
          Join live watch parties, sync YouTube videos, or share your screen.
          No lag. Anyone can join.
        </p>
        <div className={styles.ctaStack}>
          {user ? (
            <Button as={Link} to="/create" variant="primary" size="md">
              <Plus size={16} /> Start a Room
            </Button>
          ) : (
            <Button as={Link} to="/auth" variant="primary" size="md">
              <Zap size={16} /> Get Started
            </Button>
          )}
          <Button as={Link} to="/media" variant="secondary" size="md">
            <Film size={16} /> Browse Media
          </Button>
        </div>
      </section>

      {continueRoom && (
        <ErrorBoundary>
          <div className={styles.continue}>
            <div className={styles.continueInfo}>
              <div className={styles.continueIconBox}>
                <Play size={18} style={{ marginLeft: '2px' }} />
              </div>
              <div className={styles.continueTextWrap}>
                <span className={styles.continueLabel}>Continue Watching</span>
                <h4 className={styles.continueTitle}>{continueRoom.title || 'Ongoing Room'}</h4>
              </div>
            </div>
            <Link to={`/room/${continueRoom.id}`} className={styles.rejoinBtn}>
              <span>Rejoin</span>
            </Link>
          </div>
        </ErrorBoundary>
      )}

      <div className={styles.tabsRow}>
        <button
          type="button"
          className={`${styles.tab} ${sortBy === 'newest' ? styles.tabActive : ''}`}
          onClick={() => setSortBy('newest')}
        >
          <span className={styles.dotRed} /> Live Now
        </button>
        <button
          type="button"
          className={`${styles.tab} ${sortBy === 'popular' ? styles.tabActive : ''}`}
          onClick={() => setSortBy('popular')}
        >
          Popular
        </button>
      </div>

      {mostWatchedRoom && (
        <div className={styles.mostStreamedSection}>
          <h3 className={styles.mostStreamedHeader}>Most Streamed Right Now</h3>
          <ErrorBoundary>
            <MostStreamedCard room={mostWatchedRoom} />
          </ErrorBoundary>
        </div>
      )}

      <div className={styles.controls}>
        <div className={styles.searchWrap}>
          <Search size={16} className={styles.searchIcon} />
          <Input
            placeholder="Search rooms or hosts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.search}
          />
        </div>
        <form onSubmit={joinByInvite} className={styles.inviteForm}>
          <div className={styles.inviteWrap}>
            <Hash size={14} className={styles.inviteIcon} />
            <Input
              placeholder="Invite code"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              className={styles.inviteInput}
            />
          </div>
          <Button variant="primary" type="submit" size="md" loading={joining}>Join</Button>
        </form>
      </div>

      {rooms.length > 0 && (
        <div className={styles.statPill}>
          <span className={styles.dotRed} />
          <strong>{rooms.length} live</strong>
          <span className={styles.statSep}>&middot;</span>
          <span>{totalViewers} watching</span>
        </div>
      )}

      {loading || roomsLoading ? (
        <div className={styles.skeletonGrid}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={styles.skeletonCard}>
              <Skeleton height="180px" rounded="lg" />
              <div style={{ padding: '1rem' }}>
                <Skeleton height="0.75rem" width="30%" style={{ marginBottom: '0.5rem' }} />
                <Skeleton height="1rem" width="80%" style={{ marginBottom: '0.4rem' }} />
                <Skeleton height="0.85rem" width="50%" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredRooms.length === 0 ? (
        <EmptyState
          title={search ? 'No rooms match your search' : 'No live rooms right now'}
          description={search ? 'Try a different term or start your own.' : 'Start one and invite people to watch together.'}
          action={null}
        />
      ) : (
        <div className={styles.grid}>
          {filteredRooms.map((room) => (
            <ErrorBoundary key={room.id}>
              <RoomCard room={room} />
            </ErrorBoundary>
          ))}
        </div>
      )}
    </Layout>
  )
}
