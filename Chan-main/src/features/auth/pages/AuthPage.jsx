import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../shared/auth/hooks/useAuth.jsx'
import { Button, Input, Card } from '../../../shared/ui/index.js'
import styles from './AuthPage.module.css'

export default function AuthPage() {
  const { user, signInAnonymously } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (user) {
    navigate('/')
    return null
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signInAnonymously(name.trim() || 'Viewer')
      navigate('/')
    } catch (err) {
      setError(err.message || 'Could not join anonymously')
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <Card className={styles.card}>
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
          <Button type="submit" loading={loading} fullWidth>
            Continue anonymously
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
