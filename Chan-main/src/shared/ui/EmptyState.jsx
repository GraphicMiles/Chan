import styles from './EmptyState.module.css'

export function EmptyState({ title, description, action }) {
  return (
    <div className={styles.empty}>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>
      {action}
    </div>
  )
}
