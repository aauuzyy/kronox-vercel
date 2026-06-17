import { useEffect, useState } from 'react'
import { GRADE_COLORS, calcGrade } from '../constants.js'
import { Button } from '../components/ui/Button.jsx'
import styles from './ResultsScreen.module.css'

export function ResultsScreen({ stats, onExit, onPlayAgain }) {
  const [fadeOut, setFadeOut] = useState(false)

  const grade = stats.grade || calcGrade(stats.accuracy)
  const gradeColor = GRADE_COLORS[grade]
  const total = Math.max(stats.totalHits, 1)
  const isNewBest = !stats.autoplay && stats.score > (parseInt(localStorage.getItem(`kronox-pb-${stats.songTitle}`) || '0', 10))

  useEffect(() => {
    if (isNewBest && !stats.autoplay) {
      localStorage.setItem(`kronox-pb-${stats.songTitle}`, String(stats.score))
    }
  }, [isNewBest, stats.autoplay, stats.score, stats.songTitle])

  const judgments = [
    { label: 'Perfect', value: stats.perfect, color: '#ffffff' },
    { label: 'Good', value: stats.good, color: '#aaaaaa' },
    { label: 'Bad', value: stats.bad, color: '#c4b542' },
    { label: 'Miss', value: stats.miss, color: '#ff6666' },
  ]

  const avgOffset = stats.hitOffsets?.length
    ? stats.hitOffsets.reduce((a, b) => a + b, 0) / stats.hitOffsets.length
    : 0

  const handleExit = () => {
    setFadeOut(true)
    setTimeout(onExit, 380)
  }

  const handlePlayAgain = () => {
    setFadeOut(true)
    setTimeout(onPlayAgain, 380)
  }

  return (
    <div className={`${styles.screen} ${fadeOut ? styles.fadeOut : ''}`}>
      <div className={styles.header}>
        <div className={styles.gradeBox} style={{ borderColor: `${gradeColor}33`, background: `${gradeColor}0d` }}>
          <span className={styles.grade} style={{ color: gradeColor }}>{grade}</span>
        </div>
        <div>
          <div className={styles.sectionLabel}>Song Complete</div>
          <h1 className={styles.title}>{stats.songTitle}</h1>
          <div className={styles.statsRow}>
            <ResultStat label="Score" value={stats.score.toLocaleString()} />
            <ResultStat label="Accuracy" value={`${stats.accuracy}%`} color={gradeColor} />
          </div>
          {isNewBest && <div className={styles.newBest}>NEW BEST</div>}
        </div>
      </div>

      <div className={styles.breakdown}>
        <div className={styles.sectionLabel}>Breakdown</div>
        {judgments.map(j => {
          const pct = ((j.value / total) * 100).toFixed(0)
          return (
            <div key={j.label} className={styles.row}>
              <span className={styles.rowLabel} style={{ color: j.color }}>{j.label}</span>
              <div className={styles.barTrack}>
                <div className={styles.barFill} style={{ width: `${pct}%`, background: j.color }} />
              </div>
              <span className={styles.rowValue} style={{ color: j.color }}>{j.value}</span>
              <span className={styles.rowPct}>{pct}%</span>
            </div>
          )
        })}
      </div>

      <div className={styles.secondaryStats}>
        <MiniStat label="Total Hits" value={stats.totalHits} />
        <MiniStat label="Duration" value={`${Math.floor(stats.duration)}s`} />
        <MiniStat label="Notes/Sec" value={(stats.totalHits / Math.max(stats.duration, 1)).toFixed(1)} />
        <MiniStat label="Hit Rate" value={`${((stats.totalHits / Math.max(stats.totalHits, 1)) * 100).toFixed(0)}%`} />
      </div>

      {stats.hitOffsets?.length > 0 && (
        <div className={styles.timing}>
          <div className={styles.sectionLabel}>Hit Timing</div>
          <div className={styles.timingGraph}>
            <svg viewBox="0 0 1000 72" preserveAspectRatio="none" className={styles.timingSvg}>
              <line x1="0" y1="36" x2="1000" y2="36" stroke="#222" strokeWidth="1" />
              {stats.hitOffsets.map((o, i) => {
                const x = stats.hitOffsets.length === 1 ? 500 : (i / (stats.hitOffsets.length - 1)) * 1000
                const y = 36 - Math.max(-150, Math.min(150, o)) * (32 / 150)
                const col = Math.abs(o) < 15 ? '#ffffff' : o > 0 ? '#ff6666' : '#6699ff'
                return <circle key={i} cx={x} cy={y} r="2.5" fill={col} fillOpacity="0.75" />
              })}
              <line
                x1="0" y1={36 - Math.max(-150, Math.min(150, avgOffset)) * (32 / 150)}
                x2="1000" y2={36 - Math.max(-150, Math.min(150, avgOffset)) * (32 / 150)}
                stroke={avgOffset > 0 ? '#ff4466' : '#4488ff'}
                strokeWidth="1"
                strokeDasharray="6 4"
                opacity="0.5"
              />
            </svg>
            <div className={styles.timingLabels}>
              <span>Early</span>
              <span>avg {avgOffset.toFixed(1)}ms</span>
              <span>Late</span>
            </div>
          </div>
        </div>
      )}

      <div className={styles.actions}>
        <Button variant="secondary" className={styles.actionBtn} onClick={handlePlayAgain}>
          Play Again
        </Button>
        <Button variant="primary" className={styles.actionBtn} onClick={handleExit}>
          Back to Menu
        </Button>
      </div>
    </div>
  )
}

function ResultStat({ label, value, color = 'var(--text)' }) {
  return (
    <div className={styles.resultStat}>
      <span className={styles.resultLabel}>{label}</span>
      <span className={styles.resultValue} style={{ color }}>{value}</span>
    </div>
  )
}

function MiniStat({ label, value }) {
  return (
    <div className={styles.miniStat}>
      <span className={styles.miniLabel}>{label}</span>
      <span className={styles.miniValue}>{value}</span>
    </div>
  )
}
