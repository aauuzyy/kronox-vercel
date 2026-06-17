import styles from './ScreenWrapper.module.css'

export function ScreenWrapper({ children, className = '' }) {
  return (
    <main className={`${styles.wrapper} ${className}`}>
      {children}
    </main>
  )
}
