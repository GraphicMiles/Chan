import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../../../shared/lib/firebase.js'
import { useAuth } from '../../../shared/auth/hooks/useAuth.jsx'
import { parseJsonResponse } from '../../../shared/lib/api.js'
import { Button, Input, EmptyState, Spinner } from '../../../shared/ui/index.js'
import { Header, Layout } from '../../../shared/layout/index.js'
import RoomCard from '../components/RoomCard.jsx'
import styles from './HomePage.module.css'

export default function HomePage() {
  const { user, loading, logout } = useAuth()
  const [rooms, setRooms] = useState([])
  const [inviteCode, setInviteCode] = useState('')
  const [roomsLoading, setRoomsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('newest')

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'rooms'), (snap) => {
      setRooms(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((r) => r.status === 'live' && !r.isPrivate)
      )
      setRoomsLoading(false)
    })
    return unsub
  }, [])

  const filteredRooms = useMemo(() => {
    const term = search.trim().toLowerCase()
    let list = rooms
    if (term) {
      list = rooms.filter((r) =>
        r.title?.toLowerCase().includes(term) ||
        r.hostName?.toLowerCase().includes(term)
      )
    }
    return [...list].sort((a, b) => {
      if (sortBy === 'popular') return (b.participantCount || 0) - (a.participantCount || 0)
      return (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
    })
  }, [rooms, search, sortBy])

  const joinByInvite = async (e) => {
    e.preventDefault()
    if (!inviteCode.trim()) return
    if (!user) {
      alert('Sign in to join a room')
      return
    }
    const code = inviteCode.trim().toUpperCase()
    const res = await fetch('/api/joinRoom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inviteCode: code,
        uid: user.uid,
        displayName: user.displayName || 'Viewer',
      }),
    })
    const data = await parseJsonResponse(res)
    if (res.ok && data.roomId) {
      window.location.href = `/room/${data.roomId}`
    } else {
      alert(data.error || 'Invalid invite code')
    }
  }

  const headerActions = user ? (
    <>
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
          <Button variant="secondary" type="submit">Join</Button>
        </form>
      </div>

      <div className={styles.controls}>
        <Input
          placeholder="Search rooms or hosts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={styles.search}
        />
        <div className={styles.sort}>
          <button
            className={`${styles.sortButton} ${sortBy === 'newest' ? styles.sortButtonActive : ''}`}
            onClick={() => setSortBy('newest')}
          >
            Newest
          </button>
          <button
            className={`${styles.sortButton} ${sortBy === 'popular' ? styles.sortButtonActive : ''}`}
            onClick={() => setSortBy('popular')}
          >
            Popular
          </button>
        </div>
      </div>

      {loading || roomsLoading ? (
        <div className={styles.loading}><Spinner /> Loading…</div>
      ) : filteredRooms.length === 0 ? (
        <EmptyState
          title={search ? 'No rooms match your search' : 'No live rooms right now'}
          description={search ? 'Try a different term or start your own.' : 'Start one and invite people to watch together.'}
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
          {filteredRooms.map((room) => <RoomCard key={room.id} room={room} />)}
        </div>
      )}
    </Layout>
  )
}
