import { useEffect, useRef, useState, useCallback } from 'react'
import { GameEngine } from '../../game/GameEngine.js'
import gameStyles from '../../screens/GameScreen.module.css'

const FADE_IN_MS = 300
const FADE_OUT_MS = 250

function comboStyle(combo) {
  const t = Math.min(combo / 100, 1)
  const hue = 120 - t * 180
  const color = `hsl(${hue}, 100%, 60%)`
  const glow = 3 + t * 10
  return { color, glow }
}

function fadeVolume(engine, from, to, duration, onDone, rafRef) {
  const audio = engine.audio
  if (rafRef?.current) cancelAnimationFrame(rafRef.current)
  const start = performance.now()
  const step = (now) => {
    if (!audio.music) return
    const t = Math.min(1, (now - start) / duration)
    const vol = Math.max(0, Math.min(1, from + (to - from) * t))
    engine.setMusicVolume(vol)
    if (t < 1) {
      rafRef.current = requestAnimationFrame(step)
    } else {
      rafRef.current = null
      if (onDone) onDone()
    }
  }
  rafRef.current = requestAnimationFrame(step)
}

function disposeEngine(engine) {
  engine.stop()
  engine.audio.dispose()
}

export function CatalogPreview({ config, visible, onError }) {
  const canvasRef = useRef(null)
  const engineRef = useRef(null)
  const timerRef = useRef(null)
  const fadeRafRef = useRef(null)
  const judgeTimeoutRef = useRef(null)
  const [opacity, setOpacity] = useState(0)
  const [judgment, setJudgment] = useState({ text: '', color: '#fff', ms: 0, key: 0, visible: false })
  const [hud, setHud] = useState({ combo: 0, multiplier: 1 })

  const showJudge = useCallback((text, color, ms = 0) => {
    if (judgeTimeoutRef.current) clearTimeout(judgeTimeoutRef.current)
    const display = text ? text.charAt(0).toUpperCase() + text.slice(1) : ''
    setJudgment(j => ({ text: display, color, ms, visible: true, key: j.key + 1 }))
    judgeTimeoutRef.current = setTimeout(() => setJudgment(j => ({ ...j, visible: false })), 450)
  }, [])

  useEffect(() => {
    let cancelled = false

    const stopPreview = (pauseAudio = false) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      const engine = engineRef.current
      if (!engine) return Promise.resolve()
      const sharedAudio = engine.audio.music
      setOpacity(0)
      const currentVol = engine.audio.musicVolume ?? 1
      return new Promise((resolve) => {
        fadeVolume(engine, currentVol, 0, FADE_OUT_MS, () => {
          disposeEngine(engine)
          if (engineRef.current === engine) engineRef.current = null
          if (pauseAudio && sharedAudio && !sharedAudio.paused) {
            sharedAudio.pause()
          }
          resolve()
        }, fadeRafRef)
      })
    }

    const startPreview = async () => {
      if (!canvasRef.current || !config?.audioUrl) return
      await stopPreview()
      if (cancelled) return
      const engine = new GameEngine(canvasRef.current, {
        onJudge: showJudge,
        onHud: setHud,
        onEnd: (reason) => {
          if (reason === 'quit') {
            onError?.('Preview audio was blocked')
          }
        },
      })
      engineRef.current = engine
      try {
        await engine.start(config)
        if (cancelled || engineRef.current !== engine) {
          disposeEngine(engine)
          if (engineRef.current === engine) engineRef.current = null
          return
        }
        const offsetMs = (config.audioStartOffset || 0) * 1000
        try {
          await engine.beginPlay(offsetMs)
          if (cancelled || engineRef.current !== engine) return
          fadeVolume(engine, 0, config.musicVolume ?? 1, FADE_IN_MS, null, fadeRafRef)
          setOpacity(1)
          const durationMs = engine.audio.getDurationMs()
          const remainingMs = Math.max(0, durationMs - offsetMs)
          timerRef.current = setTimeout(() => {
            stopPreview(true)
          }, Math.max(0, remainingMs - FADE_OUT_MS))
        } catch (playErr) {
          // beginPlay already ended the engine; onEnd will surface the error.
        }
      } catch (err) {
        if (cancelled) {
          disposeEngine(engine)
          if (engineRef.current === engine) engineRef.current = null
          return
        }
        console.error('Catalog preview failed', err)
        onError?.(err.message || 'Preview failed')
        disposeEngine(engine)
        if (engineRef.current === engine) engineRef.current = null
      }
    }

    if (visible) {
      startPreview()
    } else {
      stopPreview()
    }

    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
      if (fadeRafRef.current) cancelAnimationFrame(fadeRafRef.current)
      if (judgeTimeoutRef.current) clearTimeout(judgeTimeoutRef.current)
      const engine = engineRef.current
      if (engine) {
        disposeEngine(engine)
        engineRef.current = null
      }
    }
  }, [visible, config, showJudge])

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <canvas
        ref={canvasRef}
        key={config?.renderer || '2d'}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          opacity,
          transition: `opacity ${visible ? FADE_IN_MS : FADE_OUT_MS}ms ease`,
        }}
      />
      {judgment.visible && (
        <div key={judgment.key} className={gameStyles.judgment} style={{ color: judgment.color }}>
          <span>{judgment.text}</span>
          {judgment.text !== 'Miss' && (
            <span className={gameStyles.judgmentMs}>
              {judgment.ms > 0 ? '+' : ''}{Math.round(judgment.ms)}ms
            </span>
          )}
        </div>
      )}
      <div className={gameStyles.comboRing} style={{ left: 'auto', right: '8%' }}>
        <div key={hud.combo} className={gameStyles.comboBounce}>
          <svg viewBox="0 0 100 100" className={gameStyles.ringSvg}>
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
          <div className={gameStyles.comboText}>
            <span className={gameStyles.comboValue}>{hud.combo}</span>
            <span className={gameStyles.comboLabel}>{hud.multiplier > 1 ? `${hud.multiplier}×` : 'COMBO'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
