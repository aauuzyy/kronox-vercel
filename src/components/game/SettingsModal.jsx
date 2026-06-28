import { useState, useEffect } from 'react'
import { Modal } from '../ui/Modal.jsx'
import { Slider } from '../ui/Slider.jsx'
import { FieldLabel } from '../ui/FieldLabel.jsx'
import { Button } from '../ui/Button.jsx'
import {
  LANE_COUNTS,
  getLaneNames,
  getDefaultKeybinds,
  getDefaultLaneColors,
} from '../../constants.js'
import styles from './SettingsModal.module.css'

export function SettingsModal({ settings, onChange, onClose }) {
  const [keys, setKeys] = useState([...settings.keybinds])
  const [pauseKey, setPauseKey] = useState(settings.pauseKey)
  const [listening, setListening] = useState(null)
  const [conflict, setConflict] = useState(null)
  const laneCount = settings.laneCount || 4
  const laneNames = getLaneNames(laneCount)

  useEffect(() => {
    const next = [...(settings.keybinds || [])]
    while (next.length < laneCount) next.push('')
    setKeys(next)
    setPauseKey(settings.pauseKey)
  }, [settings, laneCount])

  useEffect(() => {
    if (listening === null) return
    const handler = e => {
      e.preventDefault()
      if (listening === 'pause') {
        if (keys.includes(e.key)) { setConflict('lane'); setTimeout(() => setConflict(null), 1200); return }
        setPauseKey(e.key)
        onChange({ pauseKey: e.key })
        setListening(null)
        return
      }
      const ci = keys.findIndex((k, i) => k === e.key && i !== listening)
      if (ci !== -1) { setConflict(ci); setTimeout(() => setConflict(null), 1200); return }
      if (e.key === pauseKey) { setConflict('pause'); setTimeout(() => setConflict(null), 1200); return }
      const next = keys.map((k, i) => i === listening ? e.key : k)
      setKeys(next)
      onChange({ keybinds: next })
      setListening(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [listening, keys, pauseKey, onChange])

  useEffect(() => {
    if (!conflict) return
    const t = setTimeout(() => setConflict(null), 1200)
    return () => clearTimeout(t)
  }, [conflict])

  const labelKey = k => {
    if (!k && k !== ' ') return '—'
    if (k === ' ') return 'Space'
    if (k === 'ArrowLeft') return '←'
    if (k === 'ArrowRight') return '→'
    if (k === 'ArrowUp') return '↑'
    if (k === 'ArrowDown') return '↓'
    return k.toUpperCase()
  }

  const setLaneCount = (nextCount) => {
    if (nextCount === laneCount) return
    const patch = {
      laneCount: nextCount,
      keybinds: getDefaultKeybinds(nextCount),
      laneColors: getDefaultLaneColors(nextCount),
    }
    if (nextCount === 6 && settings.renderer === '3d') {
      patch.renderer = '2d'
    }
    onChange(patch)
  }

  return (
    <Modal title="Settings" onClose={onClose} size="md">
      <div className={styles.body}>
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Key Mode</h3>
          <div className={styles.toggleRow}>
            <span>Lanes</span>
            <div className={styles.modeButtons}>
              {LANE_COUNTS.map(n => (
                <Button
                  key={n}
                  size="sm"
                  variant={laneCount === n ? 'primary' : 'secondary'}
                  onClick={() => setLaneCount(n)}
                >
                  {n}K
                </Button>
              ))}
            </div>
          </div>
          <div className={styles.hint}>Changing modes resets keys & colors to defaults</div>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Note Colors</h3>
          <div className={styles.colorGrid}>
            {laneNames.map((name, i) => (
              <label key={i} className={styles.colorRow}>
                <div className={styles.colorPreview} style={{ background: settings.laneColors[i] }} />
                <input
                  type="color"
                  value={settings.laneColors[i]}
                  onChange={e => {
                    const next = [...settings.laneColors]
                    next[i] = e.target.value
                    onChange({ laneColors: next })
                  }}
                  className={styles.colorInput}
                />
                <span className={styles.colorName} style={{ color: settings.laneColors[i] }}>{name}</span>
              </label>
            ))}
          </div>
          <Button size="sm" variant="ghost" onClick={() => onChange({ laneColors: getDefaultLaneColors(laneCount) })}>
            Reset Colors
          </Button>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Volume</h3>
          <Slider
            label="SFX"
            value={settings.sfxVolume}
            min={0} max={1} step={0.01}
            format={v => Math.round(v * 100) + '%'}
            onChange={v => onChange({ sfxVolume: v })}
          />
          <Slider
            label="Music"
            value={settings.musicVolume}
            min={0} max={1} step={0.01}
            format={v => Math.round(v * 100) + '%'}
            onChange={v => onChange({ musicVolume: v })}
          />
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Gameplay</h3>
          <Slider
            label="Scroll Speed"
            value={settings.speed}
            min={0.5} max={5} step={0.1}
            format={v => v.toFixed(1) + '×'}
            onChange={v => onChange({ speed: v })}
          />
          <Slider
            label="Audio Offset"
            value={settings.audioOffset}
            min={-200} max={200} step={1}
            format={v => `${v > 0 ? '+' : ''}${v}ms`}
            onChange={v => onChange({ audioOffset: v })}
          />
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Visuals</h3>
          <div className={styles.toggleRow}>
            <span>Show Stars</span>
            <Button size="sm" variant={settings.showStars ? 'primary' : 'secondary'} onClick={() => onChange({ showStars: !settings.showStars })}>
              {settings.showStars ? 'On' : 'Off'}
            </Button>
          </div>
          <div className={styles.toggleRow}>
            <span>Renderer</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onChange({ renderer: settings.renderer === '3d' ? '2d' : '3d' })}
              disabled={laneCount === 6}
            >
              {settings.renderer === '3d' ? '3D Highway' : '2D'}
            </Button>
          </div>
          {laneCount === 6 && <div className={styles.hint}>3D Highway is only available in 4-key mode</div>}
          <div className={styles.toggleRow}>
            <span>Scroll Direction</span>
            <Button size="sm" variant="secondary" onClick={() => onChange({ scrollDown: !settings.scrollDown })}>
              {settings.scrollDown ? '▼ Down' : '▲ Up'}
            </Button>
          </div>
          <Slider
            label="Column Flash"
            value={settings.flashOpacity}
            min={0} max={1} step={0.01}
            format={v => Math.round(v * 100) + '%'}
            onChange={v => onChange({ flashOpacity: v })}
          />
          <div className={styles.hint}>Uses each lane's note color</div>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Keybindings</h3>
          <div className={styles.keyList}>
            {laneNames.map((name, i) => (
              <div key={i} className={styles.keyRow}>
                <div className={styles.keyLabel}>
                  <div className={styles.keyDot} style={{ background: conflict === i ? 'var(--danger)' : settings.laneColors[i] }} />
                  <span style={{ color: conflict === i ? 'var(--danger)' : 'inherit' }}>{name}</span>
                </div>
                <button
                  className={`${styles.keyBtn} ${listening === i ? styles.keyBtnListening : ''}`}
                  onClick={() => setListening(listening === i ? null : i)}
                >
                  {listening === i ? '...' : labelKey(keys[i])}
                </button>
              </div>
            ))}
            <div className={styles.keyRow}>
              <div className={styles.keyLabel}>
                <div className={styles.keyDot} style={{ background: conflict === 'pause' ? 'var(--danger)' : '#555' }} />
                <span style={{ color: conflict === 'pause' ? 'var(--danger)' : 'inherit' }}>Pause</span>
              </div>
              <button
                className={`${styles.keyBtn} ${listening === 'pause' ? styles.keyBtnListening : ''}`}
                onClick={() => setListening(listening === 'pause' ? null : 'pause')}
              >
                {listening === 'pause' ? '...' : labelKey(pauseKey)}
              </button>
            </div>
          </div>
          {conflict === 'lane' && <div className={styles.conflict}>Can't overlap a lane key</div>}
          {conflict === 'pause' && <div className={styles.conflict}>Key already bound to pause</div>}
          {typeof conflict === 'number' && <div className={styles.conflict}>Key already bound to {laneNames[conflict]}</div>}
          <div className={styles.keyActions}>
            <Button size="sm" variant="ghost" onClick={() => { setKeys([...getDefaultKeybinds(laneCount)]); onChange({ keybinds: [...getDefaultKeybinds(laneCount)] }) }}>
              Reset
            </Button>
          </div>
        </section>
      </div>
    </Modal>
  )
}
