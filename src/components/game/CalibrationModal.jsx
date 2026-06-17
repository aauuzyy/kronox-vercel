import { useState, useEffect, useRef, useCallback } from 'react'
import { Modal } from '../ui/Modal.jsx'
import { Button } from '../ui/Button.jsx'
import styles from './CalibrationModal.module.css'

const BPM = 80
const BEAT_MS = 60000 / BPM

export function CalibrationModal({ offset = 0, onChange, onClose }) {
  const [phase, setPhase] = useState('intro')
  const [taps, setTaps] = useState([])
  const [suggested, setSuggested] = useState(null)
  const [manualOffset, setManualOffset] = useState(offset)
  const ctxRef = useRef(null)
  const startRef = useRef(null)
  const timerRef = useRef(null)
  const tapsRef = useRef([])
  const phaseRef = useRef('intro')

  const setPhaseSync = (p) => { phaseRef.current = p; setPhase(p) }

  useEffect(() => {
    setManualOffset(offset)
  }, [offset])

  const applyOffset = useCallback((val) => {
    setManualOffset(val)
    onChange?.({ audioOffset: val })
  }, [onChange])

  const playClick = useCallback((ctx, when, accent = false) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = accent ? 1200 : 800
    gain.gain.setValueAtTime(0.6, when)
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.05)
    osc.start(when)
    osc.stop(when + 0.06)
  }, [])

  const stopTapping = useCallback(() => {
    clearTimeout(timerRef.current)
    if (ctxRef.current && ctxRef.current.state !== 'closed') ctxRef.current.close()
    ctxRef.current = null
  }, [])

  const collectResult = useCallback((validTaps) => {
    stopTapping()
    if (validTaps.length >= 2) {
      const errs = validTaps.map(t => t.err).sort((a, b) => a - b)
      const mid = Math.floor(errs.length / 2)
      const median = errs.length % 2 === 0 ? Math.round((errs[mid - 1] + errs[mid]) / 2) : Math.round(errs[mid])
      setSuggested(median)
      applyOffset(median)
      setPhaseSync('result')
    } else {
      setPhaseSync('intro')
    }
  }, [stopTapping, applyOffset])

  const startTapping = useCallback(() => {
    const ctx = new AudioContext()
    ctxRef.current = ctx
    startRef.current = ctx.currentTime
    tapsRef.current = []
    setPhaseSync('tapping')
    setTaps([])

    for (let i = 0; i < 12; i++) {
      playClick(ctx, startRef.current + i * (BEAT_MS / 1000), i % 4 === 0)
    }

    timerRef.current = setTimeout(() => {
      const valid = tapsRef.current.filter(t => t.beatN >= 2)
      collectResult(valid)
    }, BEAT_MS * 14)
  }, [playClick, collectResult])

  useEffect(() => () => stopTapping(), [stopTapping])

  const handleTap = useCallback(() => {
    if (phaseRef.current !== 'tapping' || !ctxRef.current) return
    const ctx = ctxRef.current
    const latency = (ctx.outputLatency || ctx.baseLatency || 0) * 1000
    const tapMs = (ctx.currentTime - startRef.current) * 1000 - latency
    const beatN = Math.round(tapMs / BEAT_MS)
    const idealMs = beatN * BEAT_MS
    const err = tapMs - idealMs

    const next = [...tapsRef.current, { tapMs, err, beatN }]
    tapsRef.current = next
    const valid = next.filter(t => t.beatN >= 2)
    setTaps(valid)

    if (valid.length >= 6) collectResult(valid)
  }, [collectResult])

  useEffect(() => {
    if (phase !== 'tapping') return
    const handler = e => {
      if (e.code === 'Space') {
        e.preventDefault()
        handleTap()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [phase, handleTap])

  const adjustManual = (delta) => {
    applyOffset(manualOffset + delta)
  }

  return (
    <Modal title="Hit Timing Tool" onClose={onClose} size="md">
      <div className={styles.container}>
        <div className={styles.currentOffset}>
          <span className={styles.label}>Current Offset</span>
          <div className={styles.controls}>
            <button className={styles.adjustBtn} onClick={() => adjustManual(-5)}>−5</button>
            <button className={styles.adjustBtn} onClick={() => adjustManual(-1)}>−1</button>
            <div className={`${styles.value} ${manualOffset === 0 ? styles.valueZero : ''}`}>
              {manualOffset > 0 ? '+' : ''}{manualOffset}<span className={styles.unit}>ms</span>
            </div>
            <button className={styles.adjustBtn} onClick={() => adjustManual(1)}>+1</button>
            <button className={styles.adjustBtn} onClick={() => adjustManual(5)}>+5</button>
            <button className={styles.resetBtn} onClick={() => applyOffset(0)}>Reset</button>
          </div>
        </div>

        {phase === 'intro' && (
          <div className={styles.phase}>
            <p className={styles.description}>
              A metronome plays at 80 BPM. Tap on every beat for 8 beats (2 warmup beats first). KRONOX measures your offset using the median of your taps and applies it automatically.
            </p>
            <Button size="lg" variant="primary" onClick={startTapping}>
              Start Metronome
            </Button>
          </div>
        )}

        {phase === 'tapping' && (
          <div className={styles.phase}>
            <div className={styles.tapCount}>
              <div className={styles.count}>{taps.length}</div>
              <div className={styles.countLabel}>Taps Collected</div>
            </div>
            <div className={styles.dots}>
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className={`${styles.dot} ${i < taps.length ? styles.dotFilled : ''}`} />
              ))}
            </div>
            <div className={styles.hint}>2 warmup beats, then tap on every click until it stops</div>
            <button
              className={styles.tapButton}
              onPointerDown={e => { e.preventDefault(); handleTap() }}
            >
              TAP
            </button>
            <div className={styles.actions}>
              {taps.length >= 3 && (
                <Button size="md" variant="primary" onClick={() => collectResult(taps)}>
                  Collect ({taps.length} Taps)
                </Button>
              )}
              <Button size="md" variant="secondary" onClick={() => { stopTapping(); setPhaseSync('intro'); setTaps([]) }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {phase === 'result' && (
          <div className={styles.phase}>
            <div className={styles.result}>
              <div className={styles.resultLabel}>Measured Offset</div>
              <div className={`${styles.resultValue} ${suggested === 0 ? styles.resultValueZero : ''}`}>
                {suggested > 0 ? '+' : ''}{suggested}<span className={styles.unit}>ms</span>
              </div>
              <div className={styles.resultNote}>
                {Math.abs(suggested) < 10
                  ? 'Perfect — no adjustment needed!'
                  : suggested > 0
                    ? 'You tap early. Offset applied.'
                    : 'You tap late. Offset applied.'}
              </div>
            </div>
            <div className={styles.actions}>
              <Button size="md" variant="secondary" onClick={() => { setPhaseSync('intro'); setTaps([]) }}>
                Redo
              </Button>
              <Button size="md" variant="primary" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
