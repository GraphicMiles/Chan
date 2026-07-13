import { Link } from 'react-router-dom'
import { cn } from '../utils/cn.js'
import { Avatar } from '../ui/index.js'
import styles from './Header.module.css'

export function Header({ user, actions, className }) {
  return (
    <header className={cn(styles.header, className)}>
      <nav className={styles.nav}>
        <Link to="/" className={styles.logo}>
          <span className={styles.logoDots} />
          Chan
        </Link>
        <div className={styles.right}>
          {user && (
            <div className={styles.user}>
              <Avatar name={user.displayName || user.email} size={28} />
              <span className={styles.userName}>{user.displayName || 'Anonymous'}</span>
            </div>
          )}
          {actions}
        </div>
      </nav>
    </header>
  )
}
