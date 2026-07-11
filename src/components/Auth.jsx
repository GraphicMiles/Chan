import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'

export default function Auth() {
  const { login, register, loginWithGoogle, user } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState(null)

  if (user) {
    navigate('/')
    return null
  }

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        await register(email, password, displayName)
      }
      navigate('/')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="card" style={{ width: '100%', maxWidth: 400 }}>
        <h1 style={{ fontSize: '1.75rem', marginBottom: '1.25rem' }}>Chan</h1>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button className={`btn ${mode === 'login' ? '' : 'secondary'}`} onClick={() => setMode('login')} type="button">Sign in</button>
          <button className={`btn ${mode === 'register' ? '' : 'secondary'}`} onClick={() => setMode('register')} type="button">Create account</button>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {mode === 'register' && (
            <input className="input" placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          )}
          <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button className="btn" type="submit">{mode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>
        <div style={{ textAlign: 'center', margin: '1rem 0' }}>or</div>
        <button className="btn secondary" onClick={loginWithGoogle} type="button" style={{ width: '100%' }}>Continue with Google</button>
        {error && <p style={{ color: 'var(--ember)', marginTop: '1rem' }}>{error}</p>}
        <p style={{ marginTop: '1rem', textAlign: 'center', color: 'var(--fog)', fontSize: '0.85rem' }}>
          <Link to="/">Back home</Link>
        </p>
      </div>
    </div>
  )
}
