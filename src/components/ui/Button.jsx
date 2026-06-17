import styles from './Button.module.css'

export function Button({ children, variant = 'primary', size = 'md', className = '', disabled = false, ...props }) {
  return (
    <button
      className={`${styles.button} ${styles[variant]} ${styles[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}
