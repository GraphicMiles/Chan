import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { signInWithRedirect, getRedirectResult } from 'firebase/auth'
import { useAuth } from '../hooks/useAuth.jsx'
import { auth, googleProvider } from '../lib/firebase.js'

export default function Auth() {
  const { login, register, loginWithGoogle, user } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState(null)
  const [working, setWorking] = useState(false)

  if (user) {
    navigate('/')
    return null
  }

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    setWorking(true)
    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        await register(email, password, displayName)
      }
      navigate('/')
    } catch (err) {
      setError(getAuthErrorMessage(err))
    } finally {
      setWorking(false)
    }
  }

  const handleGoogle = async () => {
    setError(null)
    setWorking(true)
    try {
      await loginWithGoogle()
      navigate('/')
    } catch (err) {
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
        try {
          await signInWithRedirect(auth, googleProvider)
        } catch (redirectErr) {
          setError(getAuthErrorMessage(redirectErr))
          setWorking(false)
        }
      } else {
        setError(getAuthErrorMessage(err))
        setWorking(false)
      }
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
          <button className="btn" type="submit" disabled={working}>
            {working ? 'Please wait...' : (mode === 'login' ? 'Sign in' : 'Create account')}
          </button>
        </form>
        <div style={{ textAlign: 'center', margin: '1rem 0' }}>or</div>
        <button className="btn secondary" onClick={handleGoogle} type="button" style={{ width: '100%' }} disabled={working}>
          {working ? 'Please wait...' : 'Continue with Google'}
        </button>
        {error && <p style={{ color: 'var(--ember)', marginTop: '1rem' }}>{error}</p>}
        <p style={{ marginTop: '1rem', textAlign: 'center', color: 'var(--fog)', fontSize: '0.85rem' }}>
          <Link to="/">Back home</Link>
        </p>
      </div>
    </div>
  )
}

function getAuthErrorMessage(err) {
  if (!err || !err.code) return err?.message || 'Something went wrong. Please try again.'
  switch (err.code) {
    case 'auth/invalid-email': return 'Invalid email address.'
    case 'auth/user-disabled': return 'This account has been disabled.'
    case 'auth/user-not-found': return 'No account found with this email.'
    case 'auth/wrong-password': return 'Incorrect password.'
    case 'auth/email-already-in-use': return 'An account with this email already exists.'
    case 'auth/weak-password': return 'Password is too weak. Use at least 6 characters.'
    case 'auth/invalid-credential': return 'Invalid email or password.'
    case 'auth/popup-blocked': return 'Popup was blocked. Try again or allow popups.'
    case 'auth/popup-closed-by-user': return 'Sign-in popup was closed before finishing.'
    case 'auth/unauthorized-domain': return 'This domain is not authorized for Firebase Auth. Add it in Firebase Console → Auth → Settings → Authorized domains.'
    case 'auth/operation-not-supported-in-this-environment': return 'Google sign-in is not supported in this environment.'
    case 'auth/configuration-not-found': return 'Firebase Auth is not set up for this project. Enable Email/Password and Google providers in Firebase Console.'
    default: return err.message || 'Something went wrong. Please try again.'
  }
}
