import { Radio } from 'lucide-react'
import styles from './EmptyState.module.css'

export function EmptyState({ title, description, action, icon: Icon = Radio }) {
  return (
    <div className={styles.empty}>
      <div className={styles.iconWrap}>
        <Icon size={48} strokeWidth={1.5} />
      </div>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>
      {action && <div className={styles.actionWrap}>{action}</div>}
    </div>
  )
}
