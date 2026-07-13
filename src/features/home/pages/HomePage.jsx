import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore'
import { Search, Plus, LogOut, Film, ArrowRight, Hash } from 'lucide-react'
import { db } from '../../../shared/lib/firebase.js'
import { useAuth } from '../../../shared/auth/hooks/useAuth.jsx'
import { parseJsonResponse } from '../../../shared/lib/api.js'
import { Button, Input, EmptyState, Spinner, Skeleton, useToast } from '../../../shared/ui/index.js'
import { Header, Layout } from '../../../shared/layout/index.js'
import RoomCard from '../components/RoomCard.jsx'
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

  useEffect(() => {
    setLastRoom(getLastRoom())
  }, [])

  useEffect(() => {
    if (!user) {
      setRoomsLoading(false)
      return undefined
    }
    const unsub = onSnapshot(
      query(collection(db, 'rooms'), where('status', '==', 'live'), where('isPrivate', '==', false)),
      (snap) => {
        setRooms(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setRoomsLoading(false)
      },
      (err) => {
        console.error(err)
        setRoomsLoading(false)
        toast('Could not load rooms. Check Firestore rules/network.', { variant: 'error' })
      }
    )
    return unsub
  }, [user, toast])

  const filteredRooms = useMemo(() => {
    const term = search.trim().toLowerCase()
    let list = rooms
    if (term) {
      list = rooms.filter(
        (r) =>
          r.title?.toLowerCase().includes(term) ||
          r.hostName?.toLowerCase().includes(term)
      )
    }
    return [...list].sort((a, b) => {
      if (sortBy === 'popular') return (b.participantCount || 0) - (a.participantCount || 0)
      return (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
    })
  }, [rooms, search, sortBy])

  useEffect(() => {
    if (!lastRoom?.roomId || !user) {
      setContinueRoom(null)
      return
    }
    const found = rooms.find((r) => r.id === lastRoom.roomId)
    if (found) {
      setContinueRoom(found)
      return
    }
    getDoc(doc(db, 'rooms', lastRoom.roomId))
      .then((snap) => {
        if (snap.exists() && snap.data().status === 'live') {
          setContinueRoom({ id: snap.id, ...snap.data() })
        } else {
          setContinueRoom(null)
        }
      })
      .catch(() => setContinueRoom(null))
  }, [rooms, lastRoom, user])

  const joinByInvite = async (e) => {
    e.preventDefault()
    if (!inviteCode.trim()) return
    if (!user) {
      toast('Join anonymously first', { variant: 'warning' })
      navigate('/auth')
      return
    }
    const code = inviteCode.trim().toUpperCase()
    setJoining(true)
    try {
      const token = await user.getIdToken()
      const res = await fetch('/api/room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'join',
          inviteCode: code,
          uid: user.uid,
          displayName: user.displayName || 'Viewer',
        }),
      })
      const data = await parseJsonResponse(res)
      if (res.ok && data.roomId) {
        navigate(`/room/${data.roomId}?invite=${code}`)
      } else {
        toast(data.error || 'Invalid invite code', { variant: 'error' })
      }
    } catch (err) {
      toast(err.message || 'Could not join', { variant: 'error' })
    } finally {
      setJoining(false)
    }
  }

  const headerActions = user ? (
    <>
      <Button as={Link} to="/media" variant="secondary" size="sm">
        <Film size={16} />
        Media
      </Button>
      <Button as={Link} to="/create" variant="cta" size="sm">
        <Plus size={16} />
        Start a Room
      </Button>
      <Button variant="ghost" size="sm" onClick={logout} aria-label="New identity">
        <LogOut size={16} />
      </Button>
    </>
  ) : (
    <Button as={Link} to="/auth" variant="cta" size="sm">Join</Button>
  )

  return (
    <Layout header={<Header user={user} actions={headerActions} />}>
      <div className={styles.hero}>
        <h1 className={styles.heroTitle}>Watch Together</h1>
        <p className={styles.heroSub}>Synchronized watch rooms for people in different places, sharing one live moment.</p>
      </div>

      <div className={styles.toolbar}>
        <h2 className={styles.title}>Live Rooms</h2>
        <form onSubmit={joinByInvite} className={styles.inviteForm}>
          <div className={styles.inviteWrap}>
            <Hash size={16} className={styles.inviteIcon} />
            <Input
              placeholder="Invite code"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              className={styles.inviteInput}
            />
          </div>
          <Button variant="secondary" type="submit" loading={joining}>Join</Button>
        </form>
      </div>

      {continueRoom && (
        <div className={styles.continue}>
          <div className={styles.continueInfo}>
            <ArrowRight size={16} className={styles.continueIcon} />
            <div>
              <p className={styles.continueLabel}>Continue Watching</p>
              <p className={styles.continueTitle}>{continueRoom.title}</p>
            </div>
          </div>
          <Button as={Link} to={`/room/${continueRoom.id}`} size="sm">Rejoin</Button>
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
        <div className={styles.sort}>
          <button
            type="button"
            className={`${styles.sortButton} ${sortBy === 'newest' ? styles.sortButtonActive : ''}`}
            onClick={() => setSortBy('newest')}
          >
            Newest
          </button>
          <button
            type="button"
            className={`${styles.sortButton} ${sortBy === 'popular' ? styles.sortButtonActive : ''}`}
            onClick={() => setSortBy('popular')}
          >
            Popular
          </button>
        </div>
      </div>

      {loading || roomsLoading ? (
        <div className={styles.skeletonGrid}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={styles.skeletonCard}>
              <Skeleton height="160px" rounded="lg" />
              <Skeleton height="1rem" width="70%" style={{ marginTop: '0.75rem' }} />
              <Skeleton height="0.85rem" width="40%" style={{ marginTop: '0.5rem' }} />
            </div>
          ))}
        </div>
      ) : filteredRooms.length === 0 ? (
        <EmptyState
          title={search ? 'No rooms match your search' : 'No live rooms right now'}
          description={
            search
              ? 'Try a different term or start your own.'
              : 'Start one and invite people to watch together.'
          }
          action={
            user ? (
              <Button as={Link} to="/create" variant="cta">
                <Plus size={16} />
                Start a Room
              </Button>
            ) : (
              <Button as={Link} to="/auth" variant="cta">Join to Start</Button>
            )
          }
        />
      ) : (
        <div className={styles.grid}>
          {filteredRooms.map((room) => (
            <RoomCard key={room.id} room={room} />
          ))}
        </div>
      )}
    </Layout>
  )
}
