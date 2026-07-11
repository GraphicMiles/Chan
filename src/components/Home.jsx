import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { parseJsonResponse } from '../lib/api.js'
import RoomCard from './RoomCard.jsx'

export default function Home() {
  const { user, loading, logout } = useAuth()
  const [rooms, setRooms] = useState([])
  const [inviteCode, setInviteCode] = useState('')

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'rooms'), (snap) => {
      setRooms(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((r) => r.status === 'live' && !r.isPrivate)
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
      )
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

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <Link to="/" style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--paper)' }}>Chan</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {user ? (
            <>
              <span className="mono">{user.displayName || user.email}</span>
              <Link className="btn" to="/create">Start a Room</Link>
              <button className="btn secondary" onClick={logout}>Sign out</button>
            </>
          ) : (
            <Link className="btn" to="/auth">Sign in</Link>
          )}
        </div>
      </header>

      <main style={{ flex: 1, padding: '1.25rem', maxWidth: 1200, width: '100%', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.4rem' }}>Live rooms</h2>
          <form onSubmit={joinByInvite} style={{ display: 'flex', gap: '0.5rem' }}>
            <input className="input" placeholder="Invite code" value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} style={{ width: 140, textTransform: 'uppercase' }} />
            <button className="btn secondary" type="submit">Join</button>
          </form>
        </div>

        {loading ? (
          <p style={{ color: 'var(--fog)' }}>Loading...</p>
        ) : rooms.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
            <h3 style={{ marginBottom: '0.75rem' }}>No live rooms right now</h3>
            <p style={{ color: 'var(--fog)', marginBottom: '1.25rem' }}>Start one and invite people to watch together.</p>
            {user ? <Link className="btn" to="/create">Start a Room</Link> : <Link className="btn" to="/auth">Sign in to start</Link>}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
            {rooms.map((room) => <RoomCard key={room.id} room={room} />)}
          </div>
        )}
      </main>
    </div>
  )
}
