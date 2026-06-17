import styles from './SegmentedControl.module.css'

export function SegmentedControl({ options, value, onChange }) {
  return (
    <div className={styles.control}>
      {options.map(opt => (
        <button
          key={opt.value}
          className={`${styles.option} ${opt.value === value ? styles.active : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
