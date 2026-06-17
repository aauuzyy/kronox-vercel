import { useState, useEffect } from 'react'
import styles from './TitleBar.module.css'

export function TitleBar({
  settingsOpen,
  onToggleSettings,
  onOpenCatalog,
  onOpenLeaderboard,
  onOpenHistory,
  onOpenCalibrate,
}) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 600)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 600)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const items = [
    { label: 'History', onClick: onOpenHistory },
    { label: 'Scores', onClick: onOpenLeaderboard },
    { label: 'Catalog', onClick: onOpenCatalog },
    { label: 'Calibrate', onClick: onOpenCalibrate },
    { label: 'Settings', onClick: onToggleSettings, active: settingsOpen },
  ]

  return (
    <header className={styles.bar}>
      <span className={styles.logo}>KRONOX</span>
      {isMobile ? (
        <div className={styles.mobileMenu}>
          <button className={styles.menuBtn} onClick={() => setMenuOpen(o => !o)}>
            {menuOpen ? '✕' : '☰'}
          </button>
          {menuOpen && (
            <nav className={styles.dropdown}>
              {items.map(item => (
                <button
                  key={item.label}
                  className={`${styles.dropdownItem} ${item.active ? styles.active : ''}`}
                  onClick={() => { item.onClick(); setMenuOpen(false) }}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          )}
        </div>
      ) : (
        <nav className={styles.nav}>
          {items.map(item => (
            <button
              key={item.label}
              className={`${styles.navBtn} ${item.active ? styles.active : ''}`}
              onClick={item.onClick}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}
    </header>
  )
}
