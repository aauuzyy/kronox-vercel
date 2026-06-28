import { useEffect, useRef, useState, useCallback } from 'react'
import { GameEngine } from '../game/GameEngine.js'
import { calcGrade } from '../constants.js'
import styles from './GameScreen.module.css'

function comboStyle(combo) {
  const t = Math.min(combo / 100, 1)
  const hue = 120 - t * 180
  const color = `hsl(${hue}, 100%, 60%)`
  const glow = 3 + t * 10
  return { color, glow }
}

export function GameScreen({ config, onStop }) {
  const canvasRef = useRef(null)
  const engineRef = useRef(null)
  const pausesRef = useRef(3)
  const judgeTimeoutRef = useRef(null)

  const [countdown, setCountdown] = useState(3)
  const [judgment, setJudgment] = useState({ text: '', color: '#fff', ms: 0, key: 0 })
  const [hud, setHud] = useState({ score: 0, combo: 0, multiplier: 1, health: 80 })
  const [progress, setProgress] = useState({ current: 0, duration: 0 })
  const [paused, setPaused] = useState(false)
  const [resumeCountdown, setResumeCountdown] = useState(null)
  const [pausesLeft, setPausesLeft] = useState(pausesRef.current)
  const [loading, setLoading] = useState(true)
  const [loadProgress, setLoadProgress] = useState(0)
  const [loadError, setLoadError] = useState(false)

  const showJudge = useCallback((text, color, ms = 0) => {
    if (judgeTimeoutRef.current) clearTimeout(judgeTimeoutRef.current)
    const display = text ? text.charAt(0).toUpperCase() + text.slice(1) : ''
    setJudgment(j => ({ text: display, color, ms, visible: true, key: j.key + 1 }))
    judgeTimeoutRef.current = setTimeout(() => setJudgment(j => ({ ...j, visible: false })), 450)
  }, [])

  const handleEnd = useCallback((reason, stats) => {
    if (reason === 'preview' || config.previewDuration) {
      onStop('preview', null)
      return
    }
    if (reason === 'complete') {
      const grade = calcGrade(stats.accuracy)
      onStop('complete', { ...stats, grade })
    } else {
      onStop('death', null)
    }
  }, [config.previewDuration, onStop])

  useEffect(() => {
    if (!canvasRef.current) return
    const engine = new GameEngine(canvasRef.current, {
      onJudge: showJudge,
      onHud: setHud,
      onProgress: setProgress,
      onPause: () => setPaused(true),
      onResume: () => setPaused(false),
      onEnd: handleEnd,
      onLoadProgress: setLoadProgress,
    })
    engineRef.current = engine
    const minLoadTime = new Promise(resolve => setTimeout(resolve, 500))
    Promise.all([engine.start(config), minLoadTime])
      .then(() => setLoading(false))
      .catch(err => {
        console.error('Failed to start game engine', err)
        setLoading(false)
        setLoadError(true)
        setTimeout(() => onStop('quit', null), 1500)
      })

    const onResize = () => engine.resize()
    window.addEventListener('resize', onResize)
    const resizeObserver = new ResizeObserver(() => engine.resize())
    resizeObserver.observe(canvasRef.current)

    return () => {
      window.removeEventListener('resize', onResize)
      resizeObserver.disconnect()
      engine.stop()
      engineRef.current = null
      if (judgeTimeoutRef.current) clearTimeout(judgeTimeoutRef.current)
    }
  }, [config, showJudge, handleEnd])

  useEffect(() => {
    if (countdown === null) return
    if (countdown === 'GO') {
      const t = setTimeout(() => {
        setCountdown(null)
        engineRef.current?.beginPlay((config.audioStartOffset || 0) * 1000)
        if (config.previewDuration) {
          setTimeout(() => {
            const engine = engineRef.current
            if (engine) {
              engine.stop()
              onStop('preview', null)
            }
          }, config.previewDuration)
        }
      }, 800)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => {
      setCountdown(c => (c === 1 ? 'GO' : c - 1))
    }, 1000)
    return () => clearTimeout(t)
  }, [countdown, config.audioStartOffset, config.previewDuration])

  const togglePause = useCallback(() => {
    const engine = engineRef.current
    if (!engine) return
    if (!paused) {
      if (pausesRef.current <= 0) return
      pausesRef.current -= 1
      setPausesLeft(pausesRef.current)
      engine.pause()
      setPaused(true)
      setResumeCountdown(null)
    } else {
      setResumeCountdown(3)
    }
  }, [paused])

  useEffect(() => {
    if (resumeCountdown === null) return
    if (resumeCountdown > 1) {
      const t = setTimeout(() => setResumeCountdown(c => c - 1), 800)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => {
      setResumeCountdown(null)
      engineRef.current?.resume()
    }, 800)
    return () => clearTimeout(t)
  }, [resumeCountdown])

  const stopGame = () => {
    engineRef.current?.stop()
    onStop('quit', null)
  }

  const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  const progressPct = progress.duration ? Math.min(1, progress.current / progress.duration) : 0

  return (
    <div className={styles.screen}>
      <canvas ref={canvasRef} key={config.renderer} className={styles.canvas} />

      {/* HUD */}
      <div className={styles.hud}>
        <div className={styles.hudTop}>
          <div className={styles.pausePips}>
            <span className={styles.hudLabel}>Pause</span>
            <div className={styles.pips}>
              {[0, 1, 2].map(i => (
                <div key={i} className={`${styles.pip} ${i < pausesLeft ? styles.pipActive : ''}`} />
              ))}
            </div>
          </div>
          <span className={styles.songTitle}>{config.autoplay ? 'AUTOPLAY' : config.songTitle}</span>
          <div className={styles.scoreBox}>
            <span className={styles.hudLabel}>Score</span>
            <span className={styles.scoreValue}>{hud.score.toLocaleString()}</span>
          </div>
        </div>

        {/* Combo ring */}
        <div className={styles.comboRing}>
          <div key={hud.combo} className={styles.comboBounce}>
            <svg viewBox="0 0 100 100" className={styles.ringSvg}>
              <circle cx="50" cy="50" r="40" fill="none" stroke="var(--border)" strokeWidth="5" />
              <circle
                cx="50" cy="50" r="40" fill="none"
                stroke={comboStyle(hud.combo).color}
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 40}
                strokeDashoffset={2 * Math.PI * 40 * (1 - Math.min(hud.combo, 100) / 100)}
                transform="rotate(-90 50 50)"
                style={{ filter: `drop-shadow(0 0 ${comboStyle(hud.combo).glow}px ${comboStyle(hud.combo).color})` }}
              />
            </svg>
            <div className={styles.comboText}>
              <span className={styles.comboValue}>{hud.combo}</span>
              <span className={styles.comboLabel}>{hud.multiplier > 1 ? `${hud.multiplier}×` : 'COMBO'}</span>
            </div>
          </div>
        </div>

        {/* Judgment */}
        {judgment.visible && (
          <div key={judgment.key} className={styles.judgment} style={{ color: judgment.color }}>
            <span>{judgment.text}</span>
            {judgment.text !== 'Miss' && (
              <span className={styles.judgmentMs}>
                {judgment.ms > 0 ? '+' : ''}{Math.round(judgment.ms)}ms
              </span>
            )}
          </div>
        )}
      </div>

      {/* Progress */}
      <div className={styles.progressBar}>
        <div className={styles.progressFill} style={{ width: `${progressPct * 100}%` }} />
        <div className={styles.progressTime}>
          <span>{fmtTime(progress.current)}</span>
          <span className={styles.progressSep}>/ {fmtTime(progress.duration)}</span>
        </div>
      </div>

      {/* Health */}
      <div className={styles.healthBar}>
        <div className={styles.healthLabels}>
          <span className={styles.hudLabel}>Health</span>
          <span className={styles.healthValue}>{hud.health}%</span>
        </div>
        <div className={styles.healthTrack}>
          <div
            className={styles.healthFill}
            style={{
              width: `${hud.health}%`,
              background: hud.health > 50 ? 'var(--text)' : hud.health > 25 ? 'var(--warning)' : 'var(--danger)',
            }}
          />
        </div>
      </div>

      {/* Countdown / Pause overlays */}
      {countdown !== null && (
        <div className={styles.overlay}>
          <div key={countdown} className={styles.countdown}>{countdown}</div>
        </div>
      )}
      {paused && (
        <div className={styles.overlay}>
          {resumeCountdown === null ? <div className={styles.pausedText}>PAUSED</div> : (
            <div key={resumeCountdown} className={styles.countdown}>{resumeCountdown}</div>
          )}
        </div>
      )}
      {loading && (
        <div className={styles.overlay}>
          <div className={styles.loadingPanel}>
            <div className={styles.loadingSpinner} />
            <div className={styles.loadingTitle}>{config.songTitle}</div>
            <div className={styles.loadingLabel}>Loading audio & chart</div>
            <div className={styles.loadingBarTrack}>
              <div className={styles.loadingBarFill} style={{ width: `${loadProgress}%` }} />
            </div>
            <div className={styles.loadingPercent}>{Math.round(loadProgress)}%</div>
          </div>
        </div>
      )}
      {loadError && (
        <div className={styles.overlay}>
          <div className={styles.loadingPanel}>
            <div className={styles.loadingTitle}>{config.songTitle}</div>
            <div className={styles.loadingLabel}>Audio failed to load</div>
          </div>
        </div>
      )}

      {/* Control bar */}
      <div className={styles.controlBar}>
        <button className={styles.ctrlBtn} onClick={togglePause} disabled={!paused && pausesLeft <= 0}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button className={styles.ctrlBtn} onClick={stopGame}>Quit</button>
      </div>
    </div>
  )
}
