import { Link } from 'react-router-dom'
import { Radio } from 'lucide-react'
import { cn } from '../utils/cn.js'
import { Avatar } from '../ui/index.js'
import styles from './Header.module.css'

export function Header({ user, actions, className }) {
  return (
    <header className={cn(styles.header, className)}>
      <Link to="/" className={styles.logo}>
        <span className={styles.logoIcon}>
          <Radio size={20} strokeWidth={2.5} />
        </span>
        Chan
      </Link>
      <div className={styles.actions}>
        {user && (
          <div className={styles.user}>
            <Avatar name={user.displayName || user.email} size={28} />
            <span className={styles.userName}>{user.displayName || 'Anonymous'}</span>
          </div>
        )}
        {actions}
      </div>
    </header>
  )
}
