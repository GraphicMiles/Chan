import { useEffect, useState } from 'react'
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

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'rooms'), (snap) => {
      setRooms(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((r) => r.status === 'live' && !r.isPrivate)
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
      )
      setRoomsLoading(false)
    })
    return unsub
  }, [])

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
        displayName: user.displayName || user.email?.split('@')[0] || 'Viewer',
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
      <Button variant="secondary" onClick={logout}>Sign out</Button>
    </>
  ) : (
    <Button as={Link} to="/auth">Sign in</Button>
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

      {loading || roomsLoading ? (
        <div className={styles.loading}><Spinner /> Loading…</div>
      ) : rooms.length === 0 ? (
        <EmptyState
          title="No live rooms right now"
          description="Start one and invite people to watch together."
          action={
            user ? (
              <Button as={Link} to="/create">Start a Room</Button>
            ) : (
              <Button as={Link} to="/auth">Sign in to start</Button>
            )
          }
        />
      ) : (
        <div className={styles.grid}>
          {rooms.map((room) => <RoomCard key={room.id} room={room} />)}
        </div>
      )}
    </Layout>
  )
}
