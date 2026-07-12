import { cn } from '../utils/cn.js'
import styles from './Skeleton.module.css'

export function Skeleton({ className, style, width, height, rounded = 'md' }) {
  return (
    <div
      className={cn(styles.skeleton, styles[`r_${rounded}`], className)}
      style={{ width, height, ...style }}
      aria-hidden="true"
    />
  )
}
