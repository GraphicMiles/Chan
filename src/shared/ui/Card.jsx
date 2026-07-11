import { cn } from '../utils/cn.js'
import styles from './Card.module.css'

export function Card({ children, className, interactive, clickable, compact, flush, as: Component = 'div', ...props }) {
  const classes = cn(
    styles.card,
    interactive && styles.interactive,
    clickable && styles.clickable,
    compact && styles.compact,
    flush && styles.flush,
    className
  )
  return (
    <Component className={classes} {...props}>
      {children}
    </Component>
  )
}
