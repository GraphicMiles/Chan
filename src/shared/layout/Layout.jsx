import { cn } from '../utils/cn.js'
import { Header } from './Header.jsx'
import styles from './Layout.module.css'

export function Layout({ children, header, centered, wide, className }) {
  return (
    <div className={cn(styles.layout, className)}>
      {header}
      <main className={cn(styles.main, centered && styles.centered, wide && styles.wide)}>
        {children}
      </main>
    </div>
  )
}

Layout.Header = Header
