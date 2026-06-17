import styles from './Panel.module.css'

export function Panel({ children, className = '', padding = true }) {
  return (
    <div className={`${styles.panel} ${padding ? styles.padding : ''} ${className}`}>
      {children}
    </div>
  )
}
