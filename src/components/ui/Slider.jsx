import styles from './Slider.module.css'

export function Slider({ label, value, min, max, step = 1, format = v => v, className = '', onChange, ...props }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <label className={`${styles.wrapper} ${className}`}>
      <div className={styles.header}>
        <span className={styles.label}>{label}</span>
        <span className={styles.value}>{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        className={styles.input}
        style={{ '--pct': `${pct}%` }}
        onChange={e => onChange && onChange(parseFloat(e.target.value))}
        {...props}
      />
    </label>
  )
}
