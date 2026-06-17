import styles from './Modal.module.css'

export function Modal({ title, children, onClose, size = 'md' }) {
  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div className={`${styles.modal} ${styles[size]}`}>
        <div className={styles.header}>
          {title && <span className={styles.title}>{title}</span>}
          {onClose && (
            <button className={styles.close} onClick={onClose} aria-label="Close">
              ✕
            </button>
          )}
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  )
}
