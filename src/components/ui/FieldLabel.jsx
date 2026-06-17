import styles from './FieldLabel.module.css'

export function FieldLabel({ children, className = '' }) {
  return <span className={`${styles.label} ${className}`}>{children}</span>
}
