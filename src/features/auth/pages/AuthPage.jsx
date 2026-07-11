import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { signInWithRedirect } from 'firebase/auth'
import { useAuth } from '../../../shared/auth/hooks/useAuth.jsx'
import { auth, googleProvider } from '../../../shared/lib/firebase.js'
import { Button, Input, Card } from '../../../shared/ui/index.js'
import styles from './AuthPage.module.css'

export default function AuthPage() {
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
    <div className={styles.page}>
      <Card className={styles.card}>
        <h1 className={styles.title}>Welcome to Chan</h1>
        <p className={styles.subtitle}>Watch together, chat, and share your screen.</p>

        <div className={styles.tabs}>
          <Button
            variant={mode === 'login' ? 'primary' : 'secondary'}
            onClick={() => setMode('login')}
            type="button"
            fullWidth
          >
            Sign in
          </Button>
          <Button
            variant={mode === 'register' ? 'primary' : 'secondary'}
            onClick={() => setMode('register')}
            type="button"
            fullWidth
          >
            Create account
          </Button>
        </div>

        <form onSubmit={submit} className={styles.form}>
          {mode === 'register' && (
            <Input
              placeholder="Display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          )}
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button type="submit" disabled={working} fullWidth>
            {working ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <div className={styles.divider}>or</div>

        <Button variant="secondary" onClick={handleGoogle} type="button" fullWidth disabled={working}>
          Continue with Google
        </Button>

        {error && <p className={styles.error}>{error}</p>}

        <p className={styles.footer}>
          <Link to="/">Back home</Link>
        </p>
      </Card>
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
