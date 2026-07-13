import { useEffect, useState } from 'react'
import { UserCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../shared/auth/hooks/useAuth.jsx'
import { Button, Input, Card } from '../../../shared/ui/index.js'
import styles from './AuthPage.module.css'

export default function AuthPage() {
  const { user, loading: authLoading, signInAnonymously } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!authLoading && user) navigate('/', { replace: true })
  }, [user, authLoading, navigate])

  if (authLoading || user) {
    return (
      <div className={styles.page}>
        <Card className={styles.card}>
          <p className={styles.subtitle}>Loading...</p>
        </Card>
      </div>
    )
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signInAnonymously(name.trim() || 'Viewer')
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Could not join anonymously')
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <Card className={styles.card}>
        <div className={styles.iconWrap}>
          <UserCircle size={48} strokeWidth={1.5} />
        </div>
        <h1 className={styles.title}>Welcome to Chan</h1>
        <p className={styles.subtitle}>Watch together with an anonymous identity. No email, no tracking.</p>
        <form onSubmit={submit} className={styles.form}>
          <Input
            placeholder="Pick a display name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={30}
            autoComplete="nickname"
          />
          <Button type="submit" loading={loading} fullWidth variant="cta">
            Continue Anonymously
          </Button>
        </form>
        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}
      </Card>
    </div>
  )
}
