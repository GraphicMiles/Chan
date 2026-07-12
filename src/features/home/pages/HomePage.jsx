import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
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

  useEffect(() => {
    setLastRoom(getLastRoom())
  }, [])

  useEffect(() => {
    if (!user) {
      setRoomsLoading(false)
      return undefined
    }
    // Firestore evaluates security rules against a query's *potential* result
    // set, not just what it actually returns. Our rule only allows reading a
    // room when status == "live" (and isPrivate != true, unless host/participant).
    // A bare `collection(db, 'rooms')` listener could potentially match ended
    // or private rooms too, so Firestore rejects the whole listener with
    // permission-denied -- which is why public rooms never appeared here.
    // Adding matching `where()` clauses lets the rule prove every possible
    // result is readable.
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

  const continueRoom = useMemo(() => {
    if (!lastRoom?.roomId) return null
    return rooms.find((r) => r.id === lastRoom.roomId) || null
  }, [rooms, lastRoom])

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
      const res = await fetch('/api/room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      <Button as={Link} to="/media" variant="secondary">Media</Button>
      <Button as={Link} to="/create">Start a Room</Button>
      <Button variant="secondary" onClick={logout}>New identity</Button>
    </>
  ) : (
    <Button as={Link} to="/auth">Join</Button>
  )

  return (
    <Layout header={<Header user={user} actions={headerActions} />}>
      <div className={styles.toolbar}>
        <h2 className={styles.title}>Live rooms</h2>
        <form onSubmit={joinByInvite} className={styles.inviteForm}>
          <Input
            placeholder="Invite code"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            className={styles.inviteInput}
          />
          <Button variant="secondary" type="submit" loading={joining}>Join</Button>
        </form>
      </div>

      {continueRoom && (
        <div className={styles.continue}>
          <div>
            <p className={styles.continueLabel}>Continue watching</p>
            <p className={styles.continueTitle}>{continueRoom.title}</p>
          </div>
          <Button as={Link} to={`/room/${continueRoom.id}`} size="sm">Rejoin</Button>
        </div>
      )}

      <div className={styles.controls}>
        <Input
          placeholder="Search rooms or hosts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={styles.search}
        />
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
              <Skeleton height="140px" rounded="lg" />
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
              <Button as={Link} to="/create">Start a Room</Button>
            ) : (
              <Button as={Link} to="/auth">Join to start</Button>
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
