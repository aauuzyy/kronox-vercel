import { useState, useEffect, useRef, useCallback } from 'react'

const DEFAULT_LANE_KEYS = ['a', 's', ';', "'"]
const LANE_NAMES        = ['LEFT', 'DOWN', 'UP', 'RIGHT']
const LANE_COLORS       = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff']
const DEFAULT_BEATS     = 32

// ── Guest identity ────────────────────────────────────────────────────────────
const GUEST_ID = (() => {
  let id = localStorage.getItem('kronox-guest-id')
  if (!id) {
    id = 'Guest#' + Math.floor(10000000 + Math.random() * 90000000)
    localStorage.setItem('kronox-guest-id', id)
  }
  return id
})()

function getDisplayName() {
  return localStorage.getItem('kronox-display-name') || GUEST_ID
}
function saveDisplayName(name) {
  const resolved = name.trim() || GUEST_ID
  localStorage.setItem('kronox-display-name', resolved)
  // Sync to global leaderboard immediately (best-effort)
  import('./supabase.js').then(({ updatePlayerDisplayName }) =>
    updatePlayerDisplayName(GUEST_ID, resolved)
  ).catch(() => {})
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadSettings() {
  try { return JSON.parse(localStorage.getItem('kronox-settings') || '{}') } catch { return {} }
}
function buildChart(beats) {
  return Array.from({ length: beats }, () => [0, 0, 0, 0])
}

// ── Leaderboard helpers ───────────────────────────────────────────────────────
function loadPlayerStats() {
  try { return JSON.parse(localStorage.getItem('kronox-player-stats') || '{}') } catch { return {} }
}
function addPlayerGameResult(guestId, { score, accuracy, grade, perfect, good, bad, miss }) {
  const all  = loadPlayerStats()
  const prev = all[guestId] || { totalScore: 0, gamesPlayed: 0, bestAccuracy: 0, bestGrade: 'C', totalPerfect: 0, totalGood: 0, totalBad: 0, totalMiss: 0 }
  const gradeRank = { 'S+': 5, 'S': 4, 'A': 3, 'B': 2, 'C': 1 }
  all[guestId] = {
    totalScore:   prev.totalScore   + (score   || 0),
    gamesPlayed:  prev.gamesPlayed  + 1,
    bestAccuracy: Math.max(prev.bestAccuracy, accuracy || 0),
    bestGrade:    (gradeRank[grade] || 0) > (gradeRank[prev.bestGrade] || 0) ? grade : prev.bestGrade,
    totalPerfect: prev.totalPerfect + (perfect || 0),
    totalGood:    prev.totalGood    + (good    || 0),
    totalBad:     prev.totalBad     + (bad     || 0),
    totalMiss:    prev.totalMiss    + (miss    || 0),
  }
  localStorage.setItem('kronox-player-stats', JSON.stringify(all))
  // Mirror to global Supabase leaderboard (best-effort)
  import('./supabase.js').then(({ upsertPlayerResult }) =>
    upsertPlayerResult(guestId, getDisplayName(), { score, accuracy, grade, perfect, good, bad, miss })
  ).catch(() => {})
}
function calcGrade(accuracy) {
  if (accuracy >= 95) return 'S+'
  if (accuracy >= 85) return 'S'
  if (accuracy >= 75) return 'A'
  if (accuracy >= 65) return 'B'
  return 'C'
}

// ── Difficulty rating (0.5 – 30) ──────────────────────────────────────────────
function calcDifficulty(chart, bpm, subdivision) {
  if (!chart?.length) return 0
  const noteCount = chart.flat().filter(v => v > 0).length
  if (!noteCount) return 0
  const sub         = subdivision || 1
  const durationSec = (chart.length / (bpm * sub)) * 60
  const notesPerSec = noteCount / Math.max(durationSec, 1)
  // countScore: 0–15, maxes at 3000 notes (very dense full chart)
  const countScore   = Math.min(noteCount / 3000, 1) * 15
  // densityScore: 0–15, maxes at 12 notes/sec (4 lanes every 3rd 16th note at 180 BPM)
  const densityScore = Math.min(notesPerSec / 12, 1) * 15
  return Math.max(0.5, Math.round((countScore + densityScore) * 10) / 10)
}

function diffColor(d) {
  if (d < 5)  return '#66ff99'
  if (d < 10) return '#ffd93d'
  if (d < 18) return '#ff9933'
  if (d < 24) return '#ff4466'
  return '#cc44ff'
}

// ── Results history ───────────────────────────────────────────────────────────
function loadHistory() {
  try { return JSON.parse(localStorage.getItem('kronox-history') || '[]') } catch { return [] }
}
function saveHistoryEntry(entry) {
  const h = loadHistory()
  h.unshift(entry)
  localStorage.setItem('kronox-history', JSON.stringify(h.slice(0, 20)))
}
let _sharedAnalyser = null
let _sharedAudioCtx = null
const connectSharedAnalyser = audioEl => {
  try {
    if (!_sharedAudioCtx || _sharedAudioCtx.state === 'closed') {
      _sharedAudioCtx = new AudioContext()
    }
    _sharedAudioCtx.resume()
    const analyser = _sharedAudioCtx.createAnalyser()
    analyser.fftSize = 1024
    const src = _sharedAudioCtx.createMediaElementSource(audioEl)
    src.connect(analyser)
    analyser.connect(_sharedAudioCtx.destination)
    _sharedAnalyser = analyser
  } catch { /* context limit or already connected */ }
}
const emitMusic = playing => {
  if (!playing) _sharedAnalyser = null
  window.dispatchEvent(new CustomEvent('kronox:music', { detail: !!playing }))
}
const GRADE_COLORS = { 'S+': '#ffd700', 'S': '#c0c0c0', 'A': '#66ff99', 'B': '#4d96ff', 'C': '#888' }

// ─── TitleBar ─────────────────────────────────────────────────────────────────
function TitleBar({ onToggleSettings, settingsOpen, onOpenCatalog, onOpenLeaderboard, onOpenHistory, onOpenCalibrate }) {
  const isMobile = window.innerWidth < 600
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      height: 44, padding: '0 16px', background: '#0a0a0a',
      borderBottom: '1px solid #111', flexShrink: 0, userSelect: 'none',
      position: 'relative', zIndex: 600,
    }}>
      <span style={{ fontFamily: 'Arial', fontSize: 8, color: '#ffffff', letterSpacing: 4 }}>KRONOX</span>
      {isMobile ? (
        <>
          <button onClick={() => setMenuOpen(o => !o)}
            style={{ fontFamily: 'Arial', fontSize: 16, background: 'transparent', border: '1px solid #2a2a2a', color: '#888', borderRadius: 6, padding: '4px 12px', cursor: 'pointer' }}>
            {menuOpen ? '✕' : '☰'}
          </button>
          {menuOpen && (
            <div style={{
              position: 'absolute', top: 44, right: 0, left: 0,
              background: '#0a0a0a', borderBottom: '1px solid #111',
              display: 'flex', flexDirection: 'column', zIndex: 601,
            }}>
              {[['HISTORY', onOpenHistory], ['SCORES', onOpenLeaderboard], ['CATALOG', onOpenCatalog],
                ['CALIBRATE', onOpenCalibrate], ['SETTINGS', onToggleSettings]].map(([label, fn]) => (
                <button key={label} onClick={() => { fn(); setMenuOpen(false) }}
                  style={{ fontFamily: 'Arial', fontSize: 9, letterSpacing: 2, padding: '14px 20px',
                    background: 'transparent', border: 'none', borderBottom: '1px solid #1a1a1a',
                    color: '#888', textAlign: 'left', cursor: 'pointer' }}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <TitleBarBtn onClick={onOpenHistory}>HISTORY</TitleBarBtn>
          <TitleBarBtn onClick={onOpenLeaderboard}>SCORES</TitleBarBtn>
          <TitleBarBtn onClick={onOpenCatalog}>CATALOG</TitleBarBtn>
          <TitleBarBtn onClick={onOpenCalibrate}>CALIBRATE</TitleBarBtn>
          <TitleBarBtn onClick={onToggleSettings} active={settingsOpen}>SETTINGS</TitleBarBtn>
        </div>
      )}
    </div>
  )
}
function TitleBarBtn({ onClick, children, active }) {
  return (
    <button onClick={onClick}
      style={{ fontFamily: 'Arial', fontSize: 7, letterSpacing: 2, padding: '4px 10px', background: active ? 'rgba(255,255,255,0.07)' : 'transparent', border: `1px solid ${active ? '#444' : '#2a2a2a'}`, color: active ? '#fff' : '#555', borderRadius: 4, transition: 'all 0.12s', cursor: 'pointer' }}
      onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#444' }}
      onMouseLeave={e => { e.currentTarget.style.color = active ? '#fff' : '#555'; e.currentTarget.style.borderColor = active ? '#444' : '#2a2a2a' }}>
      {children}
    </button>
  )
}

// ─── Settings Panel (slide-in drawer) ────────────────────────────────────────
function SettingsPanel({ open, keybinds, pauseKey, receptorHeight, laneColors, sfxVolume, musicVolume, showStars, scrollDown, starColor, flashOpacity, flashColor, onChange, onClose }) {
  const [keys,      setKeys]      = useState([...keybinds])
  const [pKey,      setPKey]      = useState(pauseKey)
  const [listening, setListening] = useState(null)  // null | 0-3 (lane) | 'pause'
  const [conflict,  setConflict]  = useState(null)
  const [localSpeed, setLocalSpeed] = useState(() => loadSettings().speed || 2.0)

  // Close listening state when panel closes
  useEffect(() => { if (!open) setListening(null) }, [open])
  // Sync keys if parent keybinds change
  useEffect(() => { setKeys([...keybinds]) }, [keybinds])
  useEffect(() => { setPKey(pauseKey) }, [pauseKey])

  useEffect(() => {
    if (!open || listening === null) return
    const handler = e => {
      e.preventDefault()
      if (listening === 'pause') {
        // Pause key can't overlap lane keys
        if (keys.includes(e.key)) { setConflict('lane'); setTimeout(() => setConflict(null), 1200); return }
        setPKey(e.key)
        onChange({ pauseKey: e.key })
        setListening(null)
        return
      }
      const ci = keys.findIndex((k, i) => k === e.key && i !== listening)
      if (ci !== -1) { setConflict(ci); setTimeout(() => setConflict(null), 1200); return }
      // Pause key can't be used as a lane key either
      if (e.key === pKey) { setConflict('pause'); setTimeout(() => setConflict(null), 1200); return }
      const newKeys = keys.map((k, i) => i === listening ? e.key : k)
      setKeys(newKeys)
      onChange({ keybinds: newKeys })
      setListening(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [listening, keys, pKey, open])

  const labelKey = k => {
    if (k === ' ') return 'Space'
    if (k === 'ArrowLeft') return '←'
    if (k === 'ArrowRight') return '→'
    if (k === 'ArrowUp') return '↑'
    if (k === 'ArrowDown') return '↓'
    return k.toUpperCase()
  }

  const Divider = () => <div style={{ height: 1, background: '#111', margin: '20px 0' }} />

  const SectionLabel = ({ children }) => (
    <div style={{ fontFamily: 'Arial', fontSize: 7, color: '#3a3a3a', letterSpacing: 3, marginBottom: 14 }}>{children}</div>
  )

  const SliderRow = ({ label, value, min, max, step, onChg, fmt }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'Arial', fontSize: 9, color: '#888' }}>{label}</span>
        <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#555' }}>{fmt ? fmt(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChg(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#ffffff', cursor: 'pointer' }} />
    </div>
  )

  return (
    <>
      {/* Backdrop — click to close */}
      {open && (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 499 }} />
      )}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 290,
        background: '#0a0a0a', borderLeft: '1px solid #111',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.22s cubic-bezier(0.4,0,0.2,1)',
        zIndex: 500, display: 'flex', flexDirection: 'column',
        boxShadow: open ? '-12px 0 40px rgba(0,0,0,0.6)' : 'none',
      }}>
      {/* Header */}
      <div style={{ padding: '0 20px', height: 36, borderBottom: '1px solid #1a1a1a', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontFamily: 'Arial', fontSize: 7, color: '#444', letterSpacing: 4 }}>SETTINGS</span>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 40px' }}>

        {/* NOTE COLORS */}
        <SectionLabel>NOTE COLORS</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 4 }}>
          {LANE_NAMES.map((name, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <div style={{ position: 'relative', width: 30, height: 30, borderRadius: 6, background: laneColors[i] + '22', border: `1.5px solid ${laneColors[i]}66`, overflow: 'hidden', flexShrink: 0 }}>
                <input type="color" value={laneColors[i]}
                  onChange={e => {
                    const next = [...laneColors]; next[i] = e.target.value
                    onChange({ laneColors: next })
                  }}
                  style={{ position: 'absolute', inset: '-4px', width: 'calc(100% + 8px)', height: 'calc(100% + 8px)', border: 'none', background: 'none', cursor: 'pointer', padding: 0, opacity: 0 }} />
                <div style={{ position: 'absolute', inset: 0, borderRadius: 5, background: laneColors[i] + '55', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: laneColors[i] }} />
                </div>
              </div>
              <span style={{ fontFamily: 'Arial', fontSize: 8, color: laneColors[i], letterSpacing: 1 }}>{name}</span>
            </label>
          ))}
        </div>
        <button onClick={() => onChange({ laneColors: [...LANE_COLORS] })}
          style={{ fontFamily: 'Arial', fontSize: 7, letterSpacing: 2, padding: '5px 10px', marginTop: 10, borderRadius: 4, background: 'transparent', border: '1px solid #222', color: '#333', cursor: 'pointer' }}>
          RESET COLORS
        </button>

        <Divider />

        {/* VOLUME */}
        <SectionLabel>VOLUME</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SliderRow label="SFX" value={sfxVolume} min={0} max={1} step={0.01}
            onChg={v => onChange({ sfxVolume: v })}
            fmt={v => Math.round(v * 100) + '%'} />
          <SliderRow label="MUSIC" value={musicVolume} min={0} max={1} step={0.01}
            onChg={v => onChange({ musicVolume: v })}
            fmt={v => Math.round(v * 100) + '%'} />
        </div>

        <Divider />

        {/* SCROLL SPEED */}
        <SectionLabel>SCROLL SPEED</SectionLabel>
        <SliderRow label="DEFAULT SPEED" value={localSpeed} min={0.5} max={10} step={0.5}
          onChg={v => {
            setLocalSpeed(v)
            const s = loadSettings()
            localStorage.setItem('kronox-settings', JSON.stringify({ ...s, speed: v }))
          }}
          fmt={v => v.toFixed(1) + '×'} />
        <div style={{ fontFamily: 'Arial', fontSize: 7, color: '#2a2a2a', marginTop: 8, letterSpacing: 1 }}>Applied on next session</div>

        <Divider />

        {/* RECEPTOR */}
        <SectionLabel>RECEPTOR</SectionLabel>
        <SliderRow label="RECEPTOR HEIGHT" value={receptorHeight} min={30} max={300} step={5}
          onChg={v => onChange({ receptorHeight: v })}
          fmt={v => v + 'px'} />
        <div style={{ fontFamily: 'Arial', fontSize: 7, color: '#2a2a2a', marginTop: 8, letterSpacing: 1 }}>Applied on next session</div>

        <Divider />
        <SectionLabel>VISUALS</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'Arial', fontSize: 9, color: '#888' }}>Star field</span>
            <button
              onClick={() => onChange({ showStars: !showStars })}
              style={{
                fontFamily: 'Arial', fontSize: 7, letterSpacing: 2,
                padding: '5px 14px', borderRadius: 4, cursor: 'pointer',
                background: showStars ? '#ffffff' : 'transparent',
                border: `1px solid ${showStars ? '#fff' : '#333'}`,
                color: showStars ? '#111' : '#444',
                fontWeight: showStars ? 'bold' : 'normal',
              }}
            >{showStars ? 'ON' : 'OFF'}</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'Arial', fontSize: 9, color: '#888' }}>Star color</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 22, height: 22, borderRadius: 4, background: starColor, border: '1px solid #333', flexShrink: 0 }} />
              <input type="color" value={starColor}
                onChange={e => onChange({ starColor: e.target.value })}
                style={{ width: 28, height: 22, padding: 0, border: 'none', borderRadius: 4, cursor: 'pointer', background: 'transparent' }} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'Arial', fontSize: 9, color: '#888' }}>Scroll direction</span>
            <button
              onClick={() => onChange({ scrollDown: !scrollDown })}
              style={{
                fontFamily: 'Arial', fontSize: 7, letterSpacing: 2,
                padding: '5px 14px', borderRadius: 4, cursor: 'pointer',
                background: 'transparent', border: '1px solid #333', color: '#666',
              }}
            >{scrollDown ? '▼ DOWN' : '▲ UP'}</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'Arial', fontSize: 9, color: '#888' }}>Column flash</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#555' }}>{Math.round(flashOpacity * 100)}%</span>
                <div style={{ width: 22, height: 22, borderRadius: 4, background: flashColor, border: '1px solid #333', flexShrink: 0 }} />
                <input type="color" value={flashColor}
                  onChange={e => onChange({ flashColor: e.target.value })}
                  style={{ width: 28, height: 22, padding: 0, border: 'none', borderRadius: 4, cursor: 'pointer', background: 'transparent' }} />
              </div>
            </div>
            <input type="range" min={0} max={1} step={0.01} value={flashOpacity}
              onChange={e => onChange({ flashOpacity: parseFloat(e.target.value) })}
              style={{ width: '100%', accentColor: '#fff' }} />
          </div>
        </div>

        <Divider />

        {/* KEYBINDINGS */}
        <SectionLabel>KEYBINDINGS</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {LANE_NAMES.map((name, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: conflict === i ? '#ff4444' : laneColors[i], flexShrink: 0, transition: 'background 0.2s' }} />
                <span style={{ fontFamily: 'Arial', fontSize: 10, color: conflict === i ? '#ff8888' : '#777' }}>{name}</span>
              </div>
              <button onClick={() => setListening(listening === i ? null : i)}
                style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 'bold', minWidth: 50, padding: '5px 10px', borderRadius: 4, background: listening === i ? 'rgba(255,255,255,0.1)' : '#111', border: `1.5px solid ${listening === i ? '#fff' : '#222'}`, color: listening === i ? '#fff' : '#bbb', animation: listening === i ? 'pulse 0.9s ease-in-out infinite' : 'none', cursor: 'pointer' }}>
                {listening === i ? '...' : labelKey(keys[i])}
              </button>
            </div>
          ))}
          {/* Pause key row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: conflict === 'pause' || conflict === 'lane' ? '#ff4444' : '#555', flexShrink: 0, transition: 'background 0.2s' }} />
              <span style={{ fontFamily: 'Arial', fontSize: 10, color: conflict === 'pause' || conflict === 'lane' ? '#ff8888' : '#555' }}>PAUSE</span>
            </div>
            <button onClick={() => setListening(listening === 'pause' ? null : 'pause')}
              style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 'bold', minWidth: 50, padding: '5px 10px', borderRadius: 4, background: listening === 'pause' ? 'rgba(255,255,255,0.1)' : '#111', border: `1.5px solid ${listening === 'pause' ? '#fff' : '#222'}`, color: listening === 'pause' ? '#fff' : '#bbb', animation: listening === 'pause' ? 'pulse 0.9s ease-in-out infinite' : 'none', cursor: 'pointer' }}>
              {listening === 'pause' ? '...' : labelKey(pKey)}
            </button>
          </div>
          {conflict === 'lane'  && <div style={{ fontFamily: 'Arial', fontSize: 8, color: '#ff6666', letterSpacing: 1 }}>Can't overlap a lane key</div>}
          {conflict === 'pause' && <div style={{ fontFamily: 'Arial', fontSize: 8, color: '#ff6666', letterSpacing: 1 }}>Key already bound to PAUSE</div>}
          {typeof conflict === 'number' && <div style={{ fontFamily: 'Arial', fontSize: 8, color: '#ff6666', letterSpacing: 1 }}>Key already bound to {LANE_NAMES[conflict]}</div>}
          {listening !== null && <div style={{ fontFamily: 'Arial', fontSize: 8, color: '#555', letterSpacing: 1 }}>Press a key to bind {listening === 'pause' ? 'PAUSE' : LANE_NAMES[listening]}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={() => { setKeys([...DEFAULT_LANE_KEYS]); setListening(null) }}
            style={{ fontFamily: 'Arial', fontSize: 7, letterSpacing: 2, padding: '7px 0', flex: 1, borderRadius: 4, background: 'transparent', border: '1px solid #222', color: '#333', cursor: 'pointer' }}>RESET</button>
          <button onClick={() => { onChange({ keybinds: keys, pauseKey: pKey }) }}
            style={{ fontFamily: 'Arial', fontSize: 7, letterSpacing: 2, padding: '7px 0', flex: 2, borderRadius: 4, background: '#fff', border: 'none', color: '#111', fontWeight: 'bold', cursor: 'pointer' }}>SAVE KEYBINDS</button>
        </div>
        <style>{`@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(255,255,255,0.3)}50%{box-shadow:0 0 0 5px rgba(255,255,255,0)}}`}</style>
      </div>
    </div>
    </>
  )
}

// ─── Leaderboard Modal ────────────────────────────────────────────────────────
// ─── History Modal ────────────────────────────────────────────────────────────
function HistoryModal({ onClose }) {
  const [history] = useState(loadHistory)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#0f0f0f', border: '1px solid #222', borderRadius: 12, width: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.7)' }}>
        <div style={{ padding: '22px 26px 16px', borderBottom: '1px solid #1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontFamily: 'Arial', fontSize: 7, color: '#333', letterSpacing: 4, marginBottom: 5 }}>LAST 20 RUNS</div>
            <div style={{ fontFamily: 'Arial', fontSize: 18, color: '#fff', fontWeight: 'bold', letterSpacing: 3 }}>RECENT HISTORY</div>
          </div>
          <button onClick={onClose} style={{ fontSize: 18, color: '#333', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: '10px 14px' }}>
          {history.length === 0 ? (
            <div style={{ fontFamily: 'Arial', fontSize: 12, color: '#2a2a2a', textAlign: 'center', padding: '48px 0' }}>No runs yet.</div>
          ) : history.map((h, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 48px 72px 110px', alignItems: 'center', gap: 10, padding: '11px 10px', borderRadius: 7, marginBottom: 4, background: '#111', border: '1px solid #191919' }}>
              <span style={{ fontFamily: 'Arial', fontSize: 9, color: '#2a2a2a', letterSpacing: 1 }}>#{i + 1}</span>
              <div>
                <div style={{ fontFamily: 'Arial', fontSize: 11, color: '#ccc', fontWeight: 'bold' }}>{h.songTitle}</div>
                <div style={{ fontFamily: 'Arial', fontSize: 8, color: '#2d2d2d', marginTop: 2 }}>{h.date}</div>
              </div>
              <span style={{ fontFamily: 'Arial', fontSize: 16, fontWeight: 'bold', color: GRADE_COLORS[h.grade] || '#888' }}>{h.grade}</span>
              <span style={{ fontFamily: 'Arial', fontSize: 9, color: '#444', textAlign: 'right' }}>{h.accuracy}%</span>
              <span style={{ fontFamily: 'Arial', fontSize: 13, fontWeight: 'bold', color: '#fff', textAlign: 'right' }}>{(h.score || 0).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Calibration Modal ────────────────────────────────────────────────────────
function CalibrationModal({ onClose }) {
  const BPM         = 80
  const BEAT_MS     = 60000 / BPM
  const [phase,     setPhase]     = useState('intro')
  const [taps,      setTaps]      = useState([])
  const [suggested, setSuggested] = useState(null)
  const [manualOffset, setManualOffset] = useState(() => {
    const s = JSON.parse(localStorage.getItem('kronox-settings') || '{}')
    return s.audioOffset || 0
  })
  const ctxRef    = useRef(null)
  const startRef  = useRef(null)
  const timerRef  = useRef(null)
  const tapsRef   = useRef([])
  const phaseRef  = useRef('intro')  // mirrors phase state — avoids stale closures in callbacks

  const setPhaseSync = (p) => { phaseRef.current = p; setPhase(p) }

  const saveOffset = (val) => {
    const s = JSON.parse(localStorage.getItem('kronox-settings') || '{}')
    localStorage.setItem('kronox-settings', JSON.stringify({ ...s, audioOffset: val }))
  }

  const playClick = useCallback((ctx, when, accent = false) => {
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.value = accent ? 1200 : 800
    gain.gain.setValueAtTime(0.6, when)
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.05)
    osc.start(when); osc.stop(when + 0.06)
  }, [])

  const stopTapping = useCallback(() => {
    clearTimeout(timerRef.current)
    if (ctxRef.current && ctxRef.current.state !== 'closed') ctxRef.current.close()
    ctxRef.current = null
  }, [])

  // collectResult: compute median from collected taps and go to result
  const collectResult = useCallback((validTaps) => {
    stopTapping()
    if (validTaps.length >= 2) {
      const errs   = validTaps.map(t => t.err).sort((a, b) => a - b)
      const mid    = Math.floor(errs.length / 2)
      const median = errs.length % 2 === 0 ? Math.round((errs[mid-1] + errs[mid]) / 2) : Math.round(errs[mid])
      setSuggested(median); setManualOffset(median); saveOffset(median); setPhaseSync('result')
    } else {
      setPhaseSync('intro')
    }
  }, [stopTapping])

  const startTapping = useCallback(() => {
    const ctx = new AudioContext()
    ctxRef.current   = ctx
    startRef.current = ctx.currentTime
    tapsRef.current  = []
    setPhaseSync('tapping'); setTaps([])
    // Pre-schedule 12 clicks (2 warmup + 10 to tap — extra beats give buffer)
    for (let i = 0; i < 12; i++) {
      playClick(ctx, startRef.current + i * (BEAT_MS / 1000), i % 4 === 0)
    }
    // Auto-collect after all beats + grace period
    timerRef.current = setTimeout(() => {
      const valid = tapsRef.current.filter(t => t.beatN >= 2)
      collectResult(valid)
    }, BEAT_MS * 14)
  }, [playClick, BEAT_MS, collectResult])

  useEffect(() => () => stopTapping(), [stopTapping])

  const handleTap = useCallback(() => {
    // Use phaseRef (not phase state) to avoid stale closure issues
    if (phaseRef.current !== 'tapping' || !ctxRef.current) return
    const ctx   = ctxRef.current
    const latency = (ctx.outputLatency || ctx.baseLatency || 0) * 1000
    const tapMs = (ctx.currentTime - startRef.current) * 1000 - latency

    const beatN   = Math.round(tapMs / BEAT_MS)
    const idealMs = beatN * BEAT_MS
    const err     = tapMs - idealMs

    const next = [...tapsRef.current, { tapMs, err, beatN }]
    tapsRef.current = next
    const valid = next.filter(t => t.beatN >= 2)
    setTaps(valid)

    // Auto-collect at 6 valid taps
    if (valid.length >= 6) collectResult(valid)
  }, [BEAT_MS, collectResult])

  useEffect(() => {
    if (phase !== 'tapping') return
    const handler = e => { if (e.code === 'Space') { e.preventDefault(); handleTap() } }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [phase, handleTap])

  const adjustManual = (delta) => {
    const next = manualOffset + delta
    setManualOffset(next)
    saveOffset(next)
  }

  const btnStyle = (col = '#333', bg = 'transparent') => ({
    fontFamily: 'Arial', fontSize: 9, letterSpacing: 2, padding: '11px 0',
    borderRadius: 6, background: bg, color: col, border: `1px solid ${col}44`, cursor: 'pointer',
  })

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#0f0f0f', border: '1px solid #222', borderRadius: 12, width: 480, maxWidth: '95vw', padding: '32px', display: 'flex', flexDirection: 'column', gap: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.7)' }}>
        <div>
          <div style={{ fontFamily: 'Arial', fontSize: 7, color: '#333', letterSpacing: 4, marginBottom: 6 }}>HIT TIMING TOOL</div>
          <div style={{ fontFamily: 'Arial', fontSize: 18, color: '#fff', fontWeight: 'bold', letterSpacing: 3 }}>CALIBRATE</div>
        </div>

        {/* Manual offset always visible */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#111', border: '1px solid #1e1e1e', borderRadius: 8, padding: '12px 16px' }}>
          <div style={{ fontFamily: 'Arial', fontSize: 9, color: '#444', letterSpacing: 3, flex: 1 }}>CURRENT OFFSET</div>
          <button onClick={() => adjustManual(-5)} style={{ fontFamily: 'monospace', fontSize: 14, width: 32, height: 32, borderRadius: 4, background: '#111', color: '#888', border: '1px solid #1e1e1e', cursor: 'pointer' }}>−5</button>
          <button onClick={() => adjustManual(-1)} style={{ fontFamily: 'monospace', fontSize: 14, width: 32, height: 32, borderRadius: 4, background: '#111', color: '#888', border: '1px solid #1e1e1e', cursor: 'pointer' }}>−1</button>
          <div style={{ fontFamily: 'Arial', fontSize: 20, fontWeight: 'bold', color: manualOffset === 0 ? '#66ff99' : '#fff', minWidth: 70, textAlign: 'center' }}>
            {manualOffset > 0 ? '+' : ''}{manualOffset}<span style={{ fontSize: 10, color: '#555', marginLeft: 3 }}>ms</span>
          </div>
          <button onClick={() => adjustManual(1)}  style={{ fontFamily: 'monospace', fontSize: 14, width: 32, height: 32, borderRadius: 4, background: '#111', color: '#888', border: '1px solid #1e1e1e', cursor: 'pointer' }}>+1</button>
          <button onClick={() => adjustManual(5)}  style={{ fontFamily: 'monospace', fontSize: 14, width: 32, height: 32, borderRadius: 4, background: '#111', color: '#888', border: '1px solid #1e1e1e', cursor: 'pointer' }}>+5</button>
          <button onClick={() => { setManualOffset(0); saveOffset(0) }} style={{ fontFamily: 'Arial', fontSize: 8, letterSpacing: 1, padding: '6px 10px', borderRadius: 4, background: 'transparent', color: '#ff6666', border: '1px solid #ff666633', cursor: 'pointer' }}>RESET</button>
        </div>

        {phase === 'intro' && (
          <>
            <div style={{ fontFamily: 'Arial', fontSize: 12, color: '#444', lineHeight: 1.8 }}>
              A metronome plays at 80 BPM. Tap on every beat for 8 beats (2 warmup beats first). KRONOX measures your offset using the median of your taps and applies it automatically.
            </div>
            <button onClick={startTapping}
              style={{ fontFamily: 'Arial', fontSize: 11, letterSpacing: 2, fontWeight: 'bold', padding: '14px 0', borderRadius: 6, background: '#fff', color: '#111', border: 'none', cursor: 'pointer' }}>
              START METRONOME
            </button>
          </>
        )}

        {phase === 'tapping' && (
          <>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'Arial', fontSize: 48, fontWeight: 'bold', color: '#fff', lineHeight: 1 }}>{taps.length}</div>
              <div style={{ fontFamily: 'Arial', fontSize: 9, color: '#333', letterSpacing: 3, marginTop: 6 }}>TAPS COLLECTED</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: i < taps.length ? '#fff' : '#1e1e1e', transition: 'background 0.1s' }} />
              ))}
            </div>
            <div style={{ fontFamily: 'Arial', fontSize: 11, color: '#555', textAlign: 'center' }}>2 warmup beats, then tap on every click until it stops</div>
            <button onPointerDown={e => { e.preventDefault(); handleTap() }}
              style={{ fontFamily: 'Arial', fontSize: 13, letterSpacing: 2, fontWeight: 'bold', padding: '28px 0', borderRadius: 8, background: '#fff', color: '#111', border: 'none', cursor: 'pointer', userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none' }}>
              TAP
            </button>
            <div style={{ display: 'flex', gap: 10 }}>
              {taps.length >= 3 && (
                <button onClick={() => collectResult(taps)}
                  style={{ flex: 2, fontFamily: 'Arial', fontSize: 9, letterSpacing: 2, padding: '11px 0', borderRadius: 6, background: '#fff', color: '#111', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>
                  COLLECT ({taps.length} TAPS)
                </button>
              )}
              <button onClick={() => { stopTapping(); setPhaseSync('intro'); setTaps([]) }} style={{ ...btnStyle('#444'), flex: 1 }}>
                CANCEL
              </button>
            </div>
          </>
        )}

        {phase === 'result' && (
          <>
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontFamily: 'Arial', fontSize: 10, color: '#555', letterSpacing: 3 }}>MEASURED OFFSET</div>
              <div style={{ fontFamily: 'Arial', fontSize: 52, fontWeight: 'bold', color: suggested === 0 ? '#66ff99' : '#fff', lineHeight: 1 }}>
                {suggested > 0 ? '+' : ''}{suggested}<span style={{ fontSize: 14, color: '#555', marginLeft: 4 }}>ms</span>
              </div>
              <div style={{ fontFamily: 'Arial', fontSize: 10, color: '#444' }}>
                {Math.abs(suggested) < 10 ? 'Perfect — no adjustment needed!' : suggested > 0 ? 'You tap early. Offset applied.' : 'You tap late. Offset applied.'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setPhaseSync('intro'); setTaps([]) }} style={{ ...btnStyle('#666'), flex: 1 }}>REDO</button>
              <button onClick={onClose} style={{ flex: 2, fontFamily: 'Arial', fontSize: 9, letterSpacing: 2, padding: '11px 0', borderRadius: 6, background: '#fff', color: '#111', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>DONE</button>
            </div>
          </>
        )}

        <button onClick={onClose} style={{ fontFamily: 'Arial', fontSize: 10, color: '#333', background: 'none', border: 'none', cursor: 'pointer', alignSelf: 'flex-end', marginTop: -8 }}>✕ CLOSE</button>
      </div>
    </div>
  )
}


const LB_RANK_COLORS = ['#ffd700', '#c0c0c0', '#cd7f32']
const LB_MEDALS      = ['🥇', '🥈', '🥉']

function LeaderboardModal({ onClose }) {
  const [players, setPlayers] = useState([])
  const [source,  setSource]  = useState('loading') // 'loading' | 'global' | 'local' | 'error'

  useEffect(() => {
    // Try global leaderboard first
    import('./supabase.js').then(({ fetchGlobalLeaderboard }) => fetchGlobalLeaderboard())
      .then(data => {
        setPlayers(data)
        setSource('global')
      })
      .catch(() => {
        // Fall back to localStorage
        const local = Object.entries(loadPlayerStats())
          .map(([id, d]) => ({ id, ...d }))
          .sort((a, b) => b.totalScore - a.totalScore)
        setPlayers(local)
        setSource('local')
      })
  }, [])

  const clearAll = () => {
    localStorage.removeItem('kronox-player-stats')
    setPlayers(p => p.filter(x => x.id !== GUEST_ID))
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <style>{`
        @keyframes lbIn { from { opacity:0; transform:scale(0.97) translateY(12px) } to { opacity:1; transform:scale(1) translateY(0) } }
        @keyframes lbRowIn { from { opacity:0; transform:translateX(-8px) } to { opacity:1; transform:translateX(0) } }
      `}</style>
      <div style={{
        background: '#0f0f0f', border: '1px solid #252525', borderRadius: 14,
        width: 640, maxHeight: '86vh', display: 'flex', flexDirection: 'column',
        overflow: 'hidden', animation: 'lbIn 0.22s cubic-bezier(0.22,1,0.36,1) forwards',
        boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
      }}>

        {/* Header */}
        <div style={{ padding: '26px 30px 18px', borderBottom: '1px solid #1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontFamily: 'Arial', fontSize: 7, color: '#333', letterSpacing: 4, marginBottom: 6 }}>
              {source === 'global' ? 'GLOBAL · ALL TIME' : source === 'local' ? 'LOCAL · GLOBAL OFFLINE' : 'LOADING...'}
            </div>
            <div style={{ fontFamily: 'Arial', fontSize: 20, color: '#fff', fontWeight: 'bold', letterSpacing: 4 }}>LEADERBOARD</div>
          </div>
          <button onClick={onClose} style={{ fontFamily: 'Arial', fontSize: 18, color: '#333', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, paddingBottom: 2 }}>✕</button>
        </div>

        {/* Column headers */}
        {players.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr 72px 60px 130px', gap: 8, padding: '10px 28px', borderBottom: '1px solid #141414' }}>
            {[['RANK', 'left'], ['PLAYER', 'left'], ['GAMES', 'right'], ['BEST', 'left'], ['TOTAL SCORE', 'right']].map(([h, align]) => (
              <span key={h} style={{ fontFamily: 'Arial', fontSize: 7, color: '#2a2a2a', letterSpacing: 2, textAlign: align }}>{h}</span>
            ))}
          </div>
        )}

        {/* Rows */}
        <div style={{ overflowY: 'auto', flex: 1, padding: players.length === 0 ? 0 : '10px 18px 10px' }}>
          {source === 'loading' ? (
            <div style={{ fontFamily: 'Arial', fontSize: 12, color: '#2a2a2a', textAlign: 'center', padding: '60px 0' }}>Loading...</div>
          ) : players.length === 0 ? (
            <div style={{ fontFamily: 'Arial', fontSize: 13, color: '#2a2a2a', textAlign: 'center', padding: '60px 0' }}>
              No scores yet — complete a song to appear here!
            </div>
          ) : players.map((p, i) => {
            const isYou     = p.id === GUEST_ID
            const isTop3    = i < 3
            const rc        = LB_RANK_COLORS[i]
            const rowBg     = isYou ? 'rgba(255,255,255,0.04)' : isTop3 ? `${rc}08` : 'transparent'
            const rowBorder = isYou ? 'rgba(255,255,255,0.12)' : isTop3 ? `${rc}22` : '#191919'
            return (
              <div key={p.id} style={{
                display: 'grid', gridTemplateColumns: '52px 1fr 72px 60px 130px',
                alignItems: 'center', gap: 8, padding: '14px 10px',
                background: rowBg, borderRadius: 9, marginBottom: 4,
                border: `1px solid ${rowBorder}`,
                animation: `lbRowIn 0.18s ease-out ${Math.min(i * 0.04, 0.3)}s both`,
              }}>
                {/* Rank */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isTop3
                    ? <span style={{ fontSize: 20, lineHeight: 1 }}>{LB_MEDALS[i]}</span>
                    : <span style={{ fontFamily: 'Arial', fontSize: 10, fontWeight: 'bold', color: '#252525' }}>#{i + 1}</span>
                  }
                </div>
                {/* Player */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'Arial', fontSize: 12, color: isYou ? '#fff' : isTop3 ? rc : '#bbb', fontWeight: isYou || isTop3 ? 'bold' : 'normal' }}>
                      {p.displayName || (isYou ? getDisplayName() : p.id)}
                    </span>
                    {isYou && (
                      <span style={{ fontFamily: 'Arial', fontSize: 7, letterSpacing: 2, color: '#666', background: 'rgba(255,255,255,0.07)', padding: '2px 6px', borderRadius: 3 }}>YOU</span>
                    )}
                  </div>
                  <div style={{ fontFamily: 'Arial', fontSize: 8, color: '#2d2d2d', marginTop: 3, letterSpacing: 1 }}>
                    {(p.totalPerfect || 0).toLocaleString()}P · {(p.totalGood || 0).toLocaleString()}G · {(p.totalMiss || 0).toLocaleString()}M
                  </div>
                </div>
                {/* Games played */}
                <div style={{ textAlign: 'right', fontFamily: 'Arial', fontSize: 14, fontWeight: 'bold', color: '#3a3a3a' }}>{p.gamesPlayed}</div>
                {/* Best grade */}
                <div style={{ fontFamily: 'Arial', fontSize: 18, fontWeight: 'bold', color: GRADE_COLORS[p.bestGrade] || '#888' }}>{p.bestGrade}</div>
                {/* Total score */}
                <div style={{ fontFamily: 'Arial', fontSize: 17, fontWeight: 'bold', color: isTop3 ? rc : isYou ? '#ccc' : '#fff', textAlign: 'right', letterSpacing: 1 }}>
                  {(p.totalScore || 0).toLocaleString()}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 28px', borderTop: '1px solid #141414', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'Arial', fontSize: 8, color: '#222', letterSpacing: 2 }}>
            {players.length} PLAYER{players.length !== 1 ? 'S' : ''} RANKED
          </span>
          <button onClick={clearAll}
            style={{ fontFamily: 'Arial', fontSize: 7, letterSpacing: 2, padding: '6px 14px', borderRadius: 4, background: 'transparent', border: '1px solid #1e1e1e', color: '#252525', cursor: 'pointer', transition: 'color 0.15s, border-color 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#ff6b6b'; e.currentTarget.style.borderColor = '#ff6b6b44' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#252525'; e.currentTarget.style.borderColor = '#1e1e1e' }}>
            RESET ALL STATS
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Countdown Overlay ────────────────────────────────────────────────────────
function CountdownOverlay({ count }) {
  if (count === null) return null
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', zIndex: 50, pointerEvents: 'none' }}>
      <style>{`
        @keyframes countPop {
          0%   { transform: scale(1.7); opacity: 0 }
          18%  { transform: scale(1.0); opacity: 1 }
          72%  { transform: scale(1.0); opacity: 1 }
          100% { transform: scale(0.85); opacity: 0 }
        }
      `}</style>
      <div key={count} style={{
        fontFamily: 'Arial',
        fontSize: count === 'GO' ? 44 : 92,
        fontWeight: 'bold',
        color: count === 'GO' ? '#66ff99' : '#ffffff',
        letterSpacing: count === 'GO' ? 16 : 0,
        animation: 'countPop 0.85s ease-out forwards',
        textShadow: count === 'GO' ? '0 0 48px #66ff9966' : '0 0 32px rgba(255,255,255,0.15)',
      }}>{count}</div>
    </div>
  )
}

// ─── Publish Modal ────────────────────────────────────────────────────────────
function PublishModal({ config, onClose }) {
  const [status,      setStatus]      = useState('idle') // idle | publishing | success | error
  const [errMsg,      setErrMsg]      = useState('')
  const [editTitle,   setEditTitle]   = useState(config.songTitle || '')
  const [displayName, setDisplayName] = useState(getDisplayName)
  const [editingName, setEditingName] = useState(false)
  const [confirmed,   setConfirmed]   = useState(false)
  const [previewing,  setPreviewing]  = useState(false)
  const previewAudioRef = useRef(null)
  const nameInputRef = useRef(null)

  useEffect(() => {
    if (editingName) nameInputRef.current?.select()
  }, [editingName])

  // Cleanup preview audio on unmount
  useEffect(() => {
    return () => {
      if (previewAudioRef.current) { previewAudioRef.current.pause(); previewAudioRef.current = null }
    }
  }, [])

  const handlePreview = () => {
    if (previewing) {
      previewAudioRef.current?.pause()
      previewAudioRef.current = null
      setPreviewing(false)
      emitMusic(false)
      return
    }
    if (!config.songFile) return
    const url = URL.createObjectURL(config.songFile)
    const audio = new Audio(url)
    audio.volume = 0.7
    audio.currentTime = 0
    audio.play()
    connectSharedAnalyser(audio)
    emitMusic(true)
    previewAudioRef.current = audio
    setPreviewing(true)
    audio.addEventListener('ended', () => { setPreviewing(false); previewAudioRef.current = null; emitMusic(false) })
    // auto-stop after 15s
    setTimeout(() => {
      if (previewAudioRef.current === audio) { audio.pause(); setPreviewing(false); previewAudioRef.current = null; emitMusic(false) }
    }, 15000)
  }

  const commitName = () => {
    const trimmed = displayName.trim() || GUEST_ID
    setDisplayName(trimmed)
    saveDisplayName(trimmed)
    setEditingName(false)
  }

  const handlePublish = async () => {
    if (!editTitle.trim() || !confirmed) return
    setStatus('publishing'); setErrMsg('')
    try {
      const { publishChart } = await import('./supabase.js')
      const dur = config.audioRef?.current?.duration || 0
      await publishChart({
        audioFile:   config.songFile,
        songTitle:   editTitle.trim(),
        bpm:         config.bpm,
        subdivision: config.subdivision,
        speed:       config.speed,
        chart:       config.chart,
        creator:     displayName,
        duration:    dur,
      })
      setStatus('success')
    } catch (err) {
      setErrMsg(err.message || 'Failed to publish.')
      setStatus('error')
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#0f0f0f', border: '1px solid #1a1a1a', borderRadius: 8, padding: '28px 32px', width: 400, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'Arial', fontSize: 11, color: '#fff', fontWeight: 'bold', letterSpacing: 3 }}>PUBLISH CHART</span>
          <button onClick={onClose} style={{ fontFamily: 'Arial', fontSize: 10, color: '#555', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>

        {status === 'success' ? (
          <div style={{ textAlign: 'center', padding: '20px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 36, color: '#66ff99' }}>✓</div>
            <div style={{ fontFamily: 'Arial', fontSize: 13, color: '#66ff99', fontWeight: 'bold', letterSpacing: 2 }}>PUBLISHED!</div>
            <div style={{ fontFamily: 'Arial', fontSize: 11, color: '#555' }}>Your chart is now live in the catalog.</div>
            <button onClick={onClose}
              style={{ fontFamily: 'Arial', fontSize: 9, letterSpacing: 2, padding: '10px 0', borderRadius: 5, background: '#66ff99', color: '#111', border: 'none', fontWeight: 'bold', cursor: 'pointer', marginTop: 8 }}>
              DONE
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <FieldLabel>SONG TITLE</FieldLabel>
              <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                disabled={status === 'publishing'}
                style={{ fontFamily: 'Arial', fontSize: 13, color: '#fff', padding: '10px 12px', borderRadius: 5, background: '#111', border: '1px solid #333', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                onFocus={e => e.target.style.borderColor = '#555'} onBlur={e => e.target.style.borderColor = '#333'} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
              {[['BPM', config.bpm], ['NOTES', (config.chart || []).flat().filter(v => v > 0).length]].map(([l, v]) => (
                <div key={l} style={{ background: '#111', borderRadius: 5, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontFamily: 'Arial', fontSize: 7, color: '#444', letterSpacing: 2 }}>{l}</span>
                  <span style={{ fontFamily: 'Arial', fontSize: 15, color: '#fff', fontWeight: 'bold' }}>{v}</span>
                </div>
              ))}
            </div>

            {/* Audio file confirmation */}
            <div style={{ background: '#111', borderRadius: 5, padding: '12px 14px', border: `1px solid ${confirmed ? '#1a3a1a' : '#2a1a1a'}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontFamily: 'Arial', fontSize: 7, color: '#444', letterSpacing: 2, marginBottom: 3 }}>AUDIO FILE</div>
                  <div style={{ fontFamily: 'Arial', fontSize: 10, color: '#888', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{config.songFile?.name || '—'}</div>
                </div>
                <button onClick={handlePreview}
                  style={{ fontFamily: 'Arial', fontSize: 9, letterSpacing: 1, padding: '7px 12px', borderRadius: 4, background: previewing ? '#1a2a3a' : 'transparent', color: previewing ? '#66aaff' : '#555', border: `1px solid ${previewing ? '#4488ff44' : '#333'}`, cursor: 'pointer', flexShrink: 0 }}>
                  {previewing ? '■ STOP' : '▷ PREVIEW'}
                </button>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
                  style={{ accentColor: '#66ff99', width: 14, height: 14, cursor: 'pointer' }} />
                <span style={{ fontFamily: 'Arial', fontSize: 9, color: confirmed ? '#66ff99' : '#555', letterSpacing: 1 }}>
                  I confirmed the audio matches the chart
                </span>
              </label>
            </div>

            <div style={{ padding: '10px 14px', background: '#111', borderRadius: 5, border: '1px solid #1e1e1e', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: 'Arial', fontSize: 8, color: '#444', letterSpacing: 1, flexShrink: 0 }}>PUBLISHING AS</span>
              {editingName
                ? <input ref={nameInputRef} value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    onBlur={commitName}
                    onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setDisplayName(getDisplayName()); setEditingName(false) } }}
                    style={{ fontFamily: 'Arial', fontSize: 11, fontWeight: 'bold', color: '#fff', background: 'transparent', border: 'none', borderBottom: '1px solid #555', outline: 'none', textAlign: 'right', flex: 1, minWidth: 0 }} />
                : <button onClick={() => setEditingName(true)}
                    style={{ fontFamily: 'Arial', fontSize: 11, fontWeight: 'bold', color: '#777', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'right', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title="Click to edit your display name">
                    {displayName} ✎
                  </button>}
            </div>

            {errMsg && <div style={{ fontFamily: 'Arial', fontSize: 9, color: '#ff6666', lineHeight: 1.6 }}>{errMsg}</div>}

            <button onClick={handlePublish}
              disabled={status === 'publishing' || !editTitle.trim() || !confirmed}
              style={{
                fontFamily: 'Arial', fontSize: 10, letterSpacing: 2, padding: '13px 0', borderRadius: 5,
                background: status === 'publishing' ? '#1e1e1e' : confirmed ? '#fff' : '#1a1a1a',
                color: status === 'publishing' ? '#444' : confirmed ? '#111' : '#333',
                border: 'none', fontWeight: 'bold',
                cursor: status === 'publishing' || !confirmed ? 'not-allowed' : 'pointer',
                transition: 'all 0.18s',
              }}>
              {status === 'publishing' ? 'UPLOADING...' : '↑  PUBLISH TO CATALOG'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Catalog name display (inline editable) ──────────────────────────────────
function CatalogNameDisplay() {
  const [name,    setName]    = useState(getDisplayName)
  const [editing, setEditing] = useState(false)
  const inputRef = useRef(null)
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])
  const commit = () => {
    const trimmed = name.trim() || GUEST_ID
    setName(trimmed); saveDisplayName(trimmed); setEditing(false)
  }
  return editing
    ? <input ref={inputRef} value={name}
        onChange={e => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setName(getDisplayName()); setEditing(false) } }}
        style={{ marginLeft: 'auto', fontFamily: 'Arial', fontSize: 8, color: '#fff', background: 'transparent', border: 'none', borderBottom: '1px solid #555', outline: 'none', width: 160, textAlign: 'right' }} />
    : <button onClick={() => setEditing(true)}
        style={{ marginLeft: 'auto', fontFamily: 'Arial', fontSize: 8, color: '#444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        title="Click to change your display name">
        {name} ✎
      </button>
}

// ─── Star Map ─────────────────────────────────────────────────────────────────
function StarMap({ starColor = '#ffffff', enabled = true }) {
  const canvasRef    = useRef(null)
  const enabledRef   = useRef(enabled)
  const starColorRef = useRef(starColor)
  useEffect(() => { enabledRef.current = enabled }, [enabled])
  useEffect(() => { starColorRef.current = starColor }, [starColor])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const spawnStar = (W, H) => ({
      x:     Math.random() * W,
      y:     Math.random() * H,
      r:     0.4 + Math.random() * 1.1,
      dx:    (Math.random() - 0.5) * 0.10,
      dy:    (Math.random() - 0.5) * 0.07,
      base:  0.04 + Math.random() * 0.10,
      speed: 0.4 + Math.random() * 0.9,
      phase: Math.random() * Math.PI * 2,
    })

    let stars = []
    let animId
    // Beat detection state (persists across frames in closure)
    let tBuf = null, beatBase = 0, beatInt = 0

    const resize = () => {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
      stars = Array.from({ length: 180 }, () => spawnStar(canvas.width, canvas.height))
    }
    window.addEventListener('resize', resize)
    resize()

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (!enabledRef.current) { animId = requestAnimationFrame(draw); return }

      // Real-time beat detection via shared AnalyserNode
      let beat = 0.08  // ambient floor when no music
      const analyser = _sharedAnalyser
      if (analyser) {
        if (!tBuf || tBuf.length !== analyser.fftSize) tBuf = new Uint8Array(analyser.fftSize)
        analyser.getByteTimeDomainData(tBuf)
        let sum = 0
        for (let i = 0; i < tBuf.length; i++) { const v = (tBuf[i] - 128) / 128; sum += v * v }
        const rms = Math.sqrt(sum / tBuf.length)
        if (beatBase === 0) beatBase = Math.max(rms, 0.001)
        beatBase = beatBase * 0.997 + rms * 0.003
        const onset  = Math.max(0, (rms - beatBase * 0.5) / Math.max(beatBase * 1.5, 0.001))
        const target = Math.min(onset, 1)
        beatInt = target > beatInt ? beatInt * 0.4 + target * 0.6 : beatInt * 0.82 + target * 0.18
        beat = beatInt
      } else {
        // No analyser: fade beat intensity back to ambient floor
        beatInt = beatInt * 0.92 + 0.08 * 0.08
        beat = beatInt
      }

      const nowT = performance.now() / 1000
      const sc   = starColorRef.current
      const W    = canvas.width
      const H    = canvas.height

      for (let i = 0; i < stars.length; i++) {
        const st = stars[i]
        st.x = (st.x + st.dx + W) % W
        st.y = (st.y + st.dy + H) % H

        const twinkle  = 0.5 + 0.5 * Math.sin(nowT * st.speed + st.phase)
        const alpha    = Math.min(st.base * (0.5 + 0.5 * twinkle) + beat * 0.80, 0.95)
        const glowBlur = beat * 20 * twinkle
        const dotR     = st.r + beat * 2.5 * twinkle

        ctx.save()
        ctx.shadowColor = sc + Math.round(beat * 0.9 * 255).toString(16).padStart(2, '0')
        ctx.shadowBlur  = glowBlur
        ctx.globalAlpha = alpha
        ctx.fillStyle   = sc
        ctx.beginPath()
        ctx.arc(st.x, st.y, dotR, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      animId = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize) }
  }, []) // eslint-disable-line

  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }} />
}

// ─── Catalog Panel ────────────────────────────────────────────────────────────
function CatalogPanel({ onBack, onPlay, onPreview, onEdit, musicVolume }) {
  const [songs,     setSongs]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [search,    setSearch]    = useState('')
  const [sortBy,    setSortBy]    = useState('difficulty')
  const [myLikes,   setMyLikes]   = useState(new Set())
  const [likingId,  setLikingId]  = useState(null)
  const [selIdx,    setSelIdx]    = useState(0)
  const [showSort,  setShowSort]  = useState(false)
  const listRef    = useRef(null)
  const searchRef  = useRef(null)
  const itemRefs   = useRef([])
  const ambientRef = useRef(null)

  // Cleanup ambient audio on unmount
  useEffect(() => {
    return () => { ambientRef.current?.pause(); ambientRef.current = null }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    Promise.all([
      import('./supabase.js').then(({ fetchCatalog }) => fetchCatalog({ sortBy })),
      import('./supabase.js').then(({ fetchMyLikes }) => fetchMyLikes(GUEST_ID)),
    ])
      .then(([data, liked]) => { if (!cancelled) { setSongs(data); setMyLikes(liked); setLoading(false); setSelIdx(0) } })
      .catch(err  => { if (!cancelled) { setError(err.message || 'Could not load catalog.'); setLoading(false) } })
    return () => { cancelled = true }
  }, [sortBy])

  const handleLike = async (e, song) => {
    e.stopPropagation()
    if (likingId) return
    setLikingId(song.id)
    try {
      const { toggleLike } = await import('./supabase.js')
      const nowLiked = await toggleLike(song.id, GUEST_ID)
      setMyLikes(prev => { const s = new Set(prev); nowLiked ? s.add(song.id) : s.delete(song.id); return s })
      setSongs(prev => prev.map(s => s.id === song.id ? { ...s, likes: Math.max(0, (s.likes || 0) + (nowLiked ? 1 : -1)) } : s))
    } catch { /* best-effort */ }
    setLikingId(null)
  }

  const filtered = songs.filter(s =>
    !search ||
    (s.title   || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.creator || '').toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => {
    if (sortBy === 'difficulty') {
      const da = a.chart ? calcDifficulty(a.chart, a.bpm, a.subdivision) : 0
      const db = b.chart ? calcDifficulty(b.chart, b.bpm, b.subdivision) : 0
      return db - da
    }
    return 0
  })

  const clampedIdx = Math.min(selIdx, Math.max(0, filtered.length - 1))
  const selected   = filtered[clampedIdx] || null

  // Cleanup ambient + signal music stopped on unmount
  useEffect(() => {
    return () => { ambientRef.current?.pause(); ambientRef.current = null; emitMusic(false) }
  }, [])

  // Ambient audio: play selected song, looping. Debounced 400ms.
  useEffect(() => {
    const prev = ambientRef.current
    if (prev) { prev.pause(); prev.src = ''; ambientRef.current = null }
    const url = selected?.audioUrl
    if (!url) { emitMusic(false); return }
    const t = setTimeout(() => {
      const audio = new Audio()
      audio.crossOrigin = 'anonymous'
      audio.src = url
      audio.volume = Math.min(1, musicVolume ?? 1)
      audio.loop = true
      audio.play().catch(() => {})
      connectSharedAnalyser(audio)
      ambientRef.current = audio
      emitMusic(true)
    }, 400)
    return () => { clearTimeout(t); ambientRef.current?.pause(); ambientRef.current = null }
  }, [selected?.id]) // eslint-disable-line

  // Scroll selected card into view
  useEffect(() => {
    const el = itemRefs.current[clampedIdx]
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [clampedIdx])

  // Keyboard navigation — register once, read live values from refs to avoid re-registration on every arrow press
  const filteredLenRef = useRef(0)
  const selectedRef    = useRef(null)
  const onPlayRef      = useRef(onPlay)
  const onBackRef      = useRef(onBack)
  filteredLenRef.current = filtered.length
  selectedRef.current    = selected
  onPlayRef.current      = onPlay
  onBackRef.current      = onBack

  useEffect(() => {
    const handler = e => {
      if (e.target === searchRef.current) return
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelIdx(i => Math.min(i + 1, filteredLenRef.current - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelIdx(i => Math.max(i - 1, 0)) }
      else if (e.key === 'Enter' && selectedRef.current) { e.preventDefault(); onPlayRef.current(selectedRef.current) }
      else if (e.key === 'Escape') onBackRef.current()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, []) // eslint-disable-line

  const fmtDur = sec => sec
    ? `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
    : '--:--'

  const selDiff = selected?.chart ? calcDifficulty(selected.chart, selected.bpm, selected.subdivision) : null
  const selColor = selDiff !== null ? diffColor(selDiff) : '#ffffff'

  const SORT_LABELS = [['difficulty','DIFFICULTY'],['newest','NEWEST'],['plays','POPULAR'],['likes','FEATURED']]

  return (
    <div style={{ display: 'flex', height: '100%', background: '#0a0a0a', overflow: 'hidden', fontFamily: 'Arial' }}>
      <style>{`
        @keyframes catalogSlideIn {
          from { opacity: 0; transform: translateY(10px) }
          to   { opacity: 1; transform: translateY(0) }
        }
        @keyframes catalogFadeIn {
          from { opacity: 0 }
          to   { opacity: 1 }
        }
        @keyframes accentPulse {
          0%,100% { opacity: 0.5 }
          50%      { opacity: 1 }
        }
        @keyframes rowSlideIn {
          from { opacity: 0; transform: translateX(18px) }
          to   { opacity: 1; transform: translateX(0) }
        }
        @keyframes heartPop {
          0%   { transform: scale(1) }
          40%  { transform: scale(1.5) }
          100% { transform: scale(1) }
        }
        .cat-row { transition: background 0.12s, margin-left 0.14s cubic-bezier(0.2,0,0,1), border-color 0.12s; }
        .cat-row:hover .cat-row-title { color: #bbb !important; }
        .cat-row-selected .cat-row-title { color: #fff !important; }
        .cat-btn { transition: background 0.1s, color 0.1s, border-color 0.1s, transform 0.08s, box-shadow 0.1s; }
        .cat-btn:hover { transform: translateY(-1px); }
        .cat-btn:active { transform: translateY(0) scale(0.97); }
        .cat-play-btn:hover { box-shadow: 0 4px 20px var(--play-glow, #66ff9966); filter: brightness(1.1); }
        .cat-search:focus { border-color: #333 !important; box-shadow: 0 0 0 2px #ffffff08; }
        div::-webkit-scrollbar { width: 4px }
        div::-webkit-scrollbar-track { background: transparent }
        div::-webkit-scrollbar-thumb { background: #1e1e1e; border-radius: 2px }
      `}</style>

      {/* ── LEFT PANEL ── */}
      <div style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', padding: '28px 28px 20px', borderRight: '1px solid #111', overflow: 'hidden', position: 'relative' }}>

        {/* Glow blob behind detail */}
        {selected && <div style={{ position: 'absolute', top: 60, left: -60, width: 300, height: 300, borderRadius: '50%', background: selColor + '08', filter: 'blur(60px)', pointerEvents: 'none', animation: 'accentPulse 3s ease-in-out infinite' }} />}

        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <button className="cat-btn" onClick={onBack}
            style={{ fontFamily: 'Arial', fontSize: 7, letterSpacing: 3, padding: '7px 12px', borderRadius: 4, background: 'transparent', border: '1px solid #222', color: '#444', cursor: 'pointer' }}>
            ← BACK
          </button>
          <span style={{ fontFamily: 'Arial', fontSize: 7, color: '#2a2a2a', letterSpacing: 4, marginLeft: 'auto' }}>KRONOX</span>
        </div>

        {selected ? (
          <div key={selected.id} style={{ display: 'flex', flexDirection: 'column', flex: 1, animation: 'catalogSlideIn 0.22s cubic-bezier(0.2,0,0,1)' }}>
            {/* Diff badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ fontFamily: 'Arial', fontSize: 9, letterSpacing: 2, color: selColor, padding: '3px 10px', borderRadius: 3, border: `1px solid ${selColor}44`, background: selColor + '18' }}>
                {selDiff !== null ? `★ ${selDiff}` : '—'}
              </div>
              {selected.stars && <div style={{ fontFamily: 'Arial', fontSize: 9, color: '#ffd93d', letterSpacing: 1 }}>{'★'.repeat(Math.round(Math.min(selected.stars, 10)))}</div>}
            </div>

            {/* Title */}
            <div style={{ fontFamily: 'Arial', fontSize: 22, color: '#fff', fontWeight: 'bold', lineHeight: 1.2, marginBottom: 6, wordBreak: 'break-word' }}>
              {selected.title}
            </div>

            {/* Creator */}
            <div style={{ fontFamily: 'Arial', fontSize: 10, color: '#555', marginBottom: 20, letterSpacing: 1 }}>
              {selected.creator}
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
              {[['BPM', selected.bpm], ['LENGTH', fmtDur(selected.duration)], ['PLAYS', (selected.plays || 0).toLocaleString()], ['LIKES', (selected.likes || 0).toLocaleString()]].map(([lbl, val]) => (
                <div key={lbl}>
                  <div style={{ fontSize: 6, color: '#333', letterSpacing: 2, marginBottom: 3 }}>{lbl}</div>
                  <div style={{ fontSize: 13, color: '#888', fontWeight: 'bold' }}>{val}</div>
                </div>
              ))}
            </div>

            {/* Accent line */}
            <div style={{ height: 1, background: `linear-gradient(to right, ${selColor}66, transparent)`, marginBottom: 24, animation: 'accentPulse 2.5s ease-in-out infinite' }} />

            {/* Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="cat-btn cat-play-btn" onClick={() => onPlay(selected)}
                style={{ '--play-glow': selColor + '66', fontFamily: 'Arial', fontSize: 9, letterSpacing: 3, padding: '14px 0', borderRadius: 5, background: selColor, color: '#000', border: 'none', fontWeight: 'bold', cursor: 'pointer', width: '100%' }}>
                ▶  PLAY
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                {selected.audioUrl && selected.chart && (
                  <button className="cat-btn" onClick={() => onPreview(selected)}
                    style={{ flex: 1, fontFamily: 'Arial', fontSize: 8, letterSpacing: 2, padding: '10px 0', borderRadius: 5, background: 'transparent', color: '#555', border: '1px solid #222', cursor: 'pointer' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#aaa'; e.currentTarget.style.borderColor = '#444' }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#555'; e.currentTarget.style.borderColor = '#222' }}>
                    ▷ PREVIEW
                  </button>
                )}
                <button className="cat-btn" onClick={() => onPlay(selected, true)}
                  style={{ flex: 1, fontFamily: 'Arial', fontSize: 8, letterSpacing: 2, padding: '10px 0', borderRadius: 5, background: 'transparent', color: '#ffd93d', border: '1px solid #ffd93d33', cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#ffd93d18'; e.currentTarget.style.borderColor = '#ffd93d66' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = '#ffd93d33' }}>
                  AUTO
                </button>
                {selected.chart && (
                  <button className="cat-btn" onClick={() => onEdit(selected)}
                    style={{ flex: 1, fontFamily: 'Arial', fontSize: 8, letterSpacing: 2, padding: '10px 0', borderRadius: 5, background: 'transparent', color: '#555', border: '1px solid #222', cursor: 'pointer' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#aaa'; e.currentTarget.style.borderColor = '#444' }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#555'; e.currentTarget.style.borderColor = '#222' }}>
                    EDIT
                  </button>
                )}
                <button className="cat-btn" onClick={e => handleLike(e, selected)} disabled={!!likingId}
                  style={{ flex: 1, fontFamily: 'Arial', fontSize: 11, padding: '10px 0', borderRadius: 5, background: myLikes.has(selected.id) ? '#2a0a12' : 'transparent', color: myLikes.has(selected.id) ? '#ff4466' : '#333', border: `1px solid ${myLikes.has(selected.id) ? '#ff446633' : '#222'}`, cursor: 'pointer', animation: myLikes.has(selected.id) ? 'heartPop 0.3s ease-out' : 'none' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#ff4466'; e.currentTarget.style.borderColor = '#ff446644' }}
                  onMouseLeave={e => { if (!myLikes.has(selected.id)) { e.currentTarget.style.color = '#333'; e.currentTarget.style.borderColor = '#222' } }}>
                  ♥
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#222', fontSize: 11, letterSpacing: 2 }}>
            {loading ? 'LOADING...' : 'NO SONGS'}
          </div>
        )}

        <div style={{ marginTop: 'auto', paddingTop: 20 }}>
          <div style={{ fontSize: 7, color: '#1e1e1e', letterSpacing: 1, marginBottom: 8 }}>↑ ↓ navigate · ENTER play · ESC back</div>
          <CatalogNameDisplay />
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Search + sort */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 14px 20px', borderBottom: '1px solid #111', flexShrink: 0 }}>
          <input ref={searchRef} className="cat-search"
            value={search} onChange={e => { setSearch(e.target.value); setSelIdx(0) }}
            placeholder="Search songs or creators..."
            style={{ flex: 1, fontFamily: 'Arial', fontSize: 12, color: '#fff', padding: '8px 12px', borderRadius: 5, background: '#111', border: '1px solid #1e1e1e', outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s' }} />
          <div style={{ position: 'relative' }}>
            <button className="cat-btn" onClick={() => setShowSort(s => !s)}
              style={{ fontFamily: 'Arial', fontSize: 7, letterSpacing: 2, padding: '8px 14px', borderRadius: 5, background: '#111', border: '1px solid #222', color: '#555', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {SORT_LABELS.find(([v]) => v === sortBy)?.[1] || 'SORT'} ▾
            </button>
            {showSort && (
              <div style={{ position: 'absolute', right: 0, top: '110%', background: '#0f0f0f', border: '1px solid #222', borderRadius: 5, overflow: 'hidden', zIndex: 100, minWidth: 130, animation: 'catalogFadeIn 0.12s ease-out' }}>
                {SORT_LABELS.map(([val, lbl]) => (
                  <button key={val} onClick={() => { setSortBy(val); setShowSort(false); setSelIdx(0) }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', fontFamily: 'Arial', fontSize: 7, letterSpacing: 2, padding: '10px 14px', background: sortBy === val ? '#1a1a1a' : 'transparent', color: sortBy === val ? '#fff' : '#444', border: 'none', cursor: 'pointer', transition: 'background 0.1s, color 0.1s' }}
                    onMouseEnter={e => { if (sortBy !== val) { e.currentTarget.style.background = '#141414'; e.currentTarget.style.color = '#888' } }}
                    onMouseLeave={e => { if (sortBy !== val) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#444' } }}>
                    {lbl}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Song list */}
        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 0 30px' }}>
          {loading && <div style={{ color: '#333', fontSize: 12, textAlign: 'center', padding: '60px 0' }}>Loading...</div>}
          {error && <div style={{ color: '#ff6666', fontSize: 11, textAlign: 'center', padding: '60px 24px', lineHeight: 1.8 }}>{error}</div>}
          {!loading && !error && filtered.length === 0 && (
            <div style={{ color: '#2a2a2a', fontSize: 12, textAlign: 'center', padding: '60px 0' }}>{search ? 'No results.' : 'No songs yet.'}</div>
          )}
          {filtered.map((song, i) => {
            const diff   = song.chart ? calcDifficulty(song.chart, song.bpm, song.subdivision) : null
            const dColor = diff !== null ? diffColor(diff) : '#444'
            const isSel  = i === clampedIdx
            return (
              <div key={song.id}
                ref={el => itemRefs.current[i] = el}
                className={`cat-row${isSel ? ' cat-row-selected' : ''}`}
                onClick={() => setSelIdx(i)}
                onDoubleClick={() => onPlay(song)}
                onMouseEnter={e => {
                  if (isSel) return
                  const el = e.currentTarget
                  el.style.marginLeft = '8px'
                  el.style.background = '#0e0e0e'
                  el.style.borderLeftColor = dColor + '55'
                }}
                onMouseLeave={e => {
                  if (isSel) return
                  const el = e.currentTarget
                  el.style.marginLeft = '20px'
                  el.style.background = 'transparent'
                  el.style.borderLeftColor = 'transparent'
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '11px 20px',
                  marginLeft: isSel ? 0 : 20,
                  background: isSel ? '#161616' : 'transparent',
                  borderLeft: isSel ? `3px solid ${dColor}` : '3px solid transparent',
                  borderBottom: '1px solid #0d0d0d',
                  cursor: 'pointer',
                  transition: 'margin-left 0.13s cubic-bezier(0.2,0,0,1), background 0.1s, border-color 0.1s',
                }}>
                {/* Index */}
                <div style={{ width: 24, textAlign: 'right', fontSize: 9, color: isSel ? '#555' : '#1e1e1e', flexShrink: 0 }}>{i + 1}</div>
                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="cat-row-title" style={{ fontSize: 13, color: isSel ? '#fff' : '#555', fontWeight: isSel ? 'bold' : 'normal', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>
                    {song.title}
                  </div>
                  <div style={{ fontSize: 8, color: isSel ? '#444' : '#2a2a2a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {song.creator}  ·  {song.bpm} BPM  ·  {fmtDur(song.duration)}
                  </div>
                </div>
                {/* Diff badge */}
                {diff !== null && (
                  <div style={{ fontSize: 8, color: dColor, background: isSel ? dColor + '22' : dColor + '0d', padding: '2px 8px', borderRadius: 3, flexShrink: 0, letterSpacing: 1 }}>
                    ★ {diff}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── SetupPanel ───────────────────────────────────────────────────────────────
function SetupPanel({ onStart, keybinds, laneColors: savedLaneColors, onOpenPublish, musicVolume, sfxVolume, initialChart }) {
  const activeLaneColors = (Array.isArray(savedLaneColors) && savedLaneColors.length === 4) ? savedLaneColors : LANE_COLORS
  const [songFile,    setSongFile]    = useState(null)
  const [previewPos,  setPreviewPos]  = useState(0)
  const [isPlaying,   setIsPlaying]   = useState(false)
  const audioRef = useRef(null)

  const saved = loadSettings()
  const [songTitle,   setSongTitle]   = useState(initialChart?.title       || saved.songTitle   || 'My Song')
  const [speed,       setSpeed]       = useState(saved.speed               || 2.0)
  const [speed3d,     setSpeed3d]     = useState(saved.speed3d             || 3.0)
  const [bpm,         setBpm]         = useState(initialChart?.bpm         || saved.bpm         || 120)
  const [beats,       setBeats]       = useState(initialChart?.beats       || saved.beats       || DEFAULT_BEATS)
  const [subdivision, setSubdivision] = useState(initialChart?.subdivision || saved.subdivision || 1)
  const [chart, setChart] = useState(
    initialChart?.chart ? initialChart.chart
      : saved.chart && Array.isArray(saved.chart) ? saved.chart
      : buildChart((saved.beats || DEFAULT_BEATS) * (saved.subdivision || 1))
  )
  const [activeTab, setActiveTab] = useState('chart')
  const [holdMode,  setHoldMode]  = useState(false)
  const [holdStart, setHoldStart] = useState(null)
  const [autoplay,  setAutoplay]  = useState(false)
  const [mode3d,    setMode3d]    = useState(saved.mode3d || false)

  // Slow mode
  const [slowModeKey,      setSlowModeKey]      = useState(saved.slowModeKey   || 'q')
  const [slowModeSpeed,    setSlowModeSpeed]    = useState(saved.slowModeSpeed || 0.5)
  const [slowModeEnabled,  setSlowModeEnabled]  = useState(saved.slowModeEnabled !== false)
  const [isSlowMode,       setIsSlowMode]       = useState(false)
  const [capturingSlowKey, setCapturingSlowKey] = useState(false)

  const undoRef = useRef([])
  const redoRef = useRef([])
  const doUndo = () => {
    if (!undoRef.current.length) return
    const prev = undoRef.current[undoRef.current.length - 1]
    undoRef.current = undoRef.current.slice(0, -1)
    setChart(curr => { redoRef.current = [...redoRef.current, curr]; return prev })
    localStorage.setItem('kronox-settings', JSON.stringify({ ...loadSettings(), chart: prev }))
  }
  const doRedo = () => {
    if (!redoRef.current.length) return
    const next = redoRef.current[redoRef.current.length - 1]
    redoRef.current = redoRef.current.slice(0, -1)
    setChart(curr => { undoRef.current = [...undoRef.current, curr]; return next })
    localStorage.setItem('kronox-settings', JSON.stringify({ ...loadSettings(), chart: next }))
  }

  const saveSettings = useCallback((overrides = {}) => {
    const existing = loadSettings()
    localStorage.setItem('kronox-settings', JSON.stringify({
      ...existing,
      songTitle, speed, bpm, beats, subdivision, chart,
      audioFileName: saved.audioFileName, ...overrides,
    }))
  }, [songTitle, speed, bpm, beats, subdivision, chart, saved.audioFileName])

  // Undo/redo keyboard shortcut
  useEffect(() => {
    const handler = e => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); doUndo() }
      else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); doRedo() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, []) // eslint-disable-line

  // Restore audio from IndexedDB
  useEffect(() => {
    if (!songFile && saved.audioFileName) {
      const req = indexedDB.open('kronox', 1)
      req.onupgradeneeded = e => { const db = e.target.result; if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio') }
      req.onsuccess = e => {
        const db = e.target.result, tx = db.transaction('audio', 'readonly'), r = tx.objectStore('audio').get('song')
        r.onsuccess = () => { if (r.result) { setSongFile(r.result); setupAudio(r.result) } }
      }
    }
  }, []) // eslint-disable-line

  const setupAudio = file => {
    if (audioRef.current) { audioRef.current.pause() }
    const url = URL.createObjectURL(file)
    const audio = new Audio(url)
    // Read from prop first, fall back to localStorage so the IndexedDB restore
    // path (stale closure on mount) still gets the correct saved volume.
    audio.volume = (musicVolume ?? loadSettings().musicVolume) ?? 1.0
    audio.addEventListener('timeupdate', () => setPreviewPos(audio.currentTime))
    connectSharedAnalyser(audio)
    audio.addEventListener('play',  () => { setIsPlaying(true);  emitMusic(true)  })
    audio.addEventListener('pause', () => { setIsPlaying(false); emitMusic(false) })
    audio.addEventListener('ended', () => { setIsPlaying(false); emitMusic(false) })
    audioRef.current = audio
  }

  // Keep audio volume in sync when the setting changes
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = musicVolume ?? 1.0
  }, [musicVolume])

  useEffect(() => {
    const newSize = beats * subdivision
    setChart(prev => prev.length < newSize
      ? [...prev, ...buildChart(newSize - prev.length)]
      : prev.slice(0, newSize))
  }, [beats, subdivision])

  const toggleCell = (b, l) => {
    if (!holdMode) {
      undoRef.current = [...undoRef.current.slice(-49), chart.map(r => [...r])]; redoRef.current = []
      setChart(prev => { const n = prev.map(r => [...r]); n[b][l] = n[b][l] ? 0 : 1; saveSettings({ chart: n }); return n })
    } else { setHoldStart({ b, l }) }
  }
  const endHold = bEnd => {
    if (!holdStart) return
    undoRef.current = [...undoRef.current.slice(-49), chart.map(r => [...r])]; redoRef.current = []
    const { b: bStart, l } = holdStart
    const start = Math.min(bStart, bEnd), end = Math.max(bStart, bEnd)
    setChart(prev => {
      const n = prev.map(r => [...r])
      n[start][l] = end - start + 1 || 1
      for (let i = start + 1; i <= end; i++) n[i][l] = -1
      saveSettings({ chart: n }); return n
    })
    setHoldStart(null)
  }

  const randomizeChart = () => {
    undoRef.current = [...undoRef.current.slice(-49), chart.map(r => [...r])]; redoRef.current = []
    const c = chart.map((row, idx) => idx < 10 ? [0, 0, 0, 0] : row.map(() => Math.random() > 0.78 ? 1 : 0))
    setChart(c); saveSettings({ chart: c })
  }
  const clearChart = () => {
    undoRef.current = [...undoRef.current.slice(-49), chart.map(r => [...r])]; redoRef.current = []
    const c = buildChart(beats * subdivision); setChart(c); saveSettings({ chart: c })
  }

  const [aiGenerating, setAiGenerating] = useState(false)
  const generateAiChart = async () => {
    if (!songFile || aiGenerating) return
    setAiGenerating(true)
    try {
      const arrayBuf = await songFile.arrayBuffer()
      const ctx = new OfflineAudioContext(1, 1, 44100)
      const decoded = await ctx.decodeAudioData(arrayBuf)
      const raw = decoded.getChannelData(0)
      const sr = decoded.sampleRate

      const secPerStep  = 60 / (bpm * subdivision)
      const totalSteps  = beats * subdivision
      const sampPerStep = Math.max(1, Math.floor(secPerStep * sr))

      // ── Per-step RMS energy ───────────────────────────────────────────────
      const stepRMS = new Float32Array(totalSteps)
      for (let i = 0; i < totalSteps; i++) {
        const s = i * sampPerStep, e = Math.min(s + sampPerStep, raw.length)
        if (s >= raw.length) break
        let sum = 0
        for (let j = s; j < e; j++) sum += raw[j] * raw[j]
        stepRMS[i] = Math.sqrt(sum / (e - s))
      }

      // ── Onset strength per step: same algorithm as the live star pulse ────
      // 1024-sample frames, RMS vs slow baseline, onset = (rms-base*0.5)/(base*1.5)
      const onsetStr = new Float32Array(totalSteps)
      let base = 0
      const nf = Math.floor(raw.length / 1024)
      for (let f = 0; f < nf; f++) {
        const s = f * 1024
        let sum = 0
        for (let i = s; i < s + 1024; i++) { const v = raw[i]; sum += v * v }
        const rms = Math.sqrt(sum / 1024)
        if (base === 0) base = Math.max(rms, 0.001)
        base = base * 0.997 + rms * 0.003
        const onset = Math.max(0, (rms - base * 0.5) / Math.max(base * 1.5, 0.001))
        const step = Math.round(f * 1024 / sr / secPerStep)
        if (step >= 1 && step < totalSteps && onset > onsetStr[step]) onsetStr[step] = onset
      }

      // ── Initial active steps: onset threshold ─────────────────────────────
      const active = new Uint8Array(totalSteps)
      for (let i = 1; i < totalSteps; i++) {
        if (onsetStr[i] >= 0.04) active[i] = 1
      }

      // ── Density fill: target 55%, cap 65% (local relative RMS so quiet sections compete) ──
      let cnt = 0; for (let i = 0; i < totalSteps; i++) cnt += active[i]
      const TARGET = Math.round(totalSteps * 0.55)
      const CAP    = Math.round(totalSteps * 0.65)
      if (cnt < TARGET) {
        const winSize = subdivision * 4
        const relRMS  = new Float32Array(totalSteps)
        for (let i = 0; i < totalSteps; i++) {
          const ws = Math.max(0, i - winSize / 2), we = Math.min(totalSteps, i + winSize / 2)
          let localMax = 0
          for (let j = ws; j < we; j++) if (stepRMS[j] > localMax) localMax = stepRMS[j]
          relRMS[i] = localMax > 0 ? stepRMS[i] / localMax : 0
        }
        const inactive = []
        for (let i = 1; i < totalSteps; i++) if (!active[i]) inactive.push(i)
        inactive.sort((a, b) => relRMS[b] - relRMS[a])
        const need = Math.min(TARGET - cnt, inactive.length)
        for (let n = 0; n < need; n++) { active[inactive[n]] = 1; cnt++ }
      }
      if (cnt > CAP) {
        const actArr = []
        for (let i = 1; i < totalSteps; i++) if (active[i]) actArr.push([i, onsetStr[i] + stepRMS[i]])
        actArr.sort((a, b) => a[1] - b[1])
        const remove = cnt - CAP
        for (let n = 0; n < remove; n++) active[actArr[n][0]] = 0
      }

      // ── Floor pass (runs AFTER trim): force at least 1 note per beat ─────
      // Quiet sections survive trimming because this runs last
      for (let beat = 0; beat < Math.ceil(totalSteps / subdivision); beat++) {
        const start = beat * subdivision
        const end   = Math.min(start + subdivision, totalSteps)
        let hasNote = false
        for (let i = start; i < end; i++) if (active[i]) { hasNote = true; break }
        if (!hasNote) {
          let best = start, bestRMS = -1
          for (let i = start; i < end; i++) {
            if (stepRMS[i] > bestRMS) { bestRMS = stepRMS[i]; best = i }
          }
          active[best] = 1
        }
      }

      // ── Energy percentiles for chord decisions ────────────────────────────
      const vals = []
      for (let i = 1; i < totalSteps; i++) if (active[i]) vals.push(stepRMS[i])
      vals.sort((a, b) => a - b)
      const p40 = vals[Math.floor(vals.length * 0.40)] ?? 0
      const p70 = vals[Math.floor(vals.length * 0.70)] ?? 0
      const p85 = vals[Math.floor(vals.length * 0.85)] ?? 0

      // ── Chord lane shapes ─────────────────────────────────────────────────
      // 2-note chords: mirrored pairs feel natural to play
      const CHORD2 = [[0, 3], [1, 2], [0, 2], [1, 3], [0, 1], [2, 3]]
      // 3-note chords: spread across the 4 lanes
      const CHORD3 = [[0, 1, 3], [0, 2, 3], [1, 2, 3], [0, 1, 2]]
      // Half-beat boundary for extra chord triggers
      const HALF = Math.max(1, Math.floor(subdivision / 2))

      // ── Build chart with patterns, chords and holds ───────────────────────
      undoRef.current = [...undoRef.current.slice(-49), chart.map(r => [...r])]; redoRef.current = []
      const newChart = buildChart(totalSteps)
      const consumed = new Set()

      // ── Stream patterns: every common rhythm game pattern ─────────────────
      const STREAMS = [
        // Straights
        [0,1,2,3],           // straight right
        [3,2,1,0],           // straight left
        // Rolls
        [0,1,2,1],           // roll center
        [3,2,1,2],           // roll center rev
        [0,1,0,1],           // trill left
        [2,3,2,3],           // trill right
        [1,2,1,2],           // trill mid
        [0,3,0,3],           // outer trill
        // Cross / jump streams
        [0,2,1,3],           // cross
        [3,1,2,0],           // cross rev
        [1,3,0,2],           // spread
        [2,0,3,1],           // spread rev
        // Staircases
        [0,1,3,2],           // staircase A
        [2,3,1,0],           // staircase B
        [1,0,2,3],           // staircase C
        [3,2,0,1],           // staircase D
        // Drops / anchors
        [0,3,1,3],           // anchor right
        [3,0,2,0],           // anchor left
        [1,0,3,0],           // anchor left mid
        [2,3,0,3],           // anchor right mid
        // Gallops & syncopated
        [0,2,3,1],           // gallop A
        [3,1,0,2],           // gallop B
        [1,3,2,0],           // gallop C
        [2,0,1,3],           // gallop D
        // 3-step mini patterns (repeat on 4th)
        [0,1,2,0],           // mini stair A
        [3,2,1,3],           // mini stair B
        [0,2,0,3],           // bounce A
        [3,1,3,0],           // bounce B
        // Splits
        [0,3,2,1],           // outer-in
        [1,2,3,0],           // inner-out
        [0,3,1,2],           // jump A
        [3,0,2,1],           // jump B
      ]
      let streamIdx    = 0   // which pattern we're using
      let streamPos    = 0   // position within that pattern
      let streamUses   = 0   // how many notes used from this pattern
      const patternLen = () => STREAMS[streamIdx].length

      const nextLane = () => {
        const lane = STREAMS[streamIdx][streamPos % patternLen()]
        streamPos++
        streamUses++
        // Switch pattern every 8–16 notes to keep things fresh
        const switchEvery = 8 + (streamIdx % 3) * 4
        if (streamUses >= switchEvery) {
          streamIdx  = (streamIdx + 1 + Math.floor(Math.random() * 3)) % STREAMS.length
          streamPos  = 0
          streamUses = 0
        }
        return lane
      }

      for (let i = 1; i < totalSteps; i++) {
        if (!active[i] || consumed.has(i)) continue

        const e = stepRMS[i], os = onsetStr[i]
        const onBeat     = (i % subdivision === 0)
        const onHalfBeat = (i % HALF === 0)

        // ── Lane selection: chord width based on energy + beat position ─────
        let lanes
        if (e >= p85 && os > 0.4) {
          // Strongest hits: 3-note chord — pick a shape that doesn't repeat last
          lanes = CHORD3[(streamIdx + streamPos) % CHORD3.length]
          streamPos++
        } else if (e >= p70 && os > 0.18) {
          // Strong hit: 2-note chord
          lanes = CHORD2[(streamIdx + streamPos) % CHORD2.length]
          streamPos++
        } else if (e >= p40 && (onBeat || onHalfBeat) && Math.random() < 0.52) {
          // Medium energy on beat: 2-note chord
          lanes = CHORD2[(streamIdx + streamPos) % CHORD2.length]
          streamPos++
        } else {
          // Single note from current stream pattern
          lanes = [nextLane()]
        }

        // ── Hold detection: real sustained note vs wall-of-loud ──────────────
        // Compare this onset against the local average — in speedcore everything
        // has high onset so nothing stands out; in a vocal hold one onset is a
        // clear outlier above a calm baseline. Also break if another onset
        // interrupts (= a new separate note, not a continuation).
        let holdLane = -1, holdSteps = 0
        const localWin = subdivision * 2
        let localSum = 0, localCnt = 0
        for (let k = Math.max(1, i - localWin); k < Math.min(totalSteps, i + localWin); k++) {
          if (k !== i) { localSum += onsetStr[k]; localCnt++ }
        }
        const localAvg = localCnt > 0 ? localSum / localCnt : 0
        // Only hold if this onset is a clear standout (3× local avg) and not in a chaotic section
        if (os > 0.3 && os > localAvg * 3 && e >= p70) {
          const peak = e
          let run = 0
          for (let k = i + 1; k < totalSteps && k < i + subdivision * 2; k++) {
            if (onsetStr[k] > 0.18) break // another onset = new note, not a hold
            if (stepRMS[k] >= peak * 0.60) run++
            else break
          }
          if (run >= subdivision) {
            holdLane  = lanes[0]
            holdSteps = Math.min(run + 1, subdivision * 2)
            for (let k = i + 1; k < i + holdSteps && k < totalSteps; k++) {
              active[k] = 0; consumed.add(k)
            }
          }
        }

        // ── Write note data to chart ──────────────────────────────────────
        for (const lane of lanes) {
          if (lane === holdLane && holdSteps >= subdivision) {
            newChart[i][lane] = holdSteps
            for (let k = i + 1; k < i + holdSteps && k < totalSteps; k++) newChart[k][lane] = -1
          } else {
            newChart[i][lane] = 1
          }
        }
      }

      setChart(newChart); saveSettings({ chart: newChart })
    } catch (err) {
      console.error('AI chart error:', err)
    }
    setAiGenerating(false)
  }

  const handleFile = e => {
    const f = e.target.files[0]; if (!f) return
    setSongFile(f); setupAudio(f)
    const newTitle = f.name.replace(/\.[^.]+$/, ''); setSongTitle(newTitle)
    const req = indexedDB.open('kronox', 1)
    req.onupgradeneeded = ev => { const db = ev.target.result; if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio') }
    req.onsuccess = ev => { ev.target.result.transaction('audio', 'readwrite').objectStore('audio').put(f, 'song') }
    const tmpUrl = URL.createObjectURL(f)
    const tmp = new Audio(tmpUrl)
    tmp.addEventListener('loadedmetadata', () => {
      URL.revokeObjectURL(tmpUrl)
      if (tmp.duration && isFinite(tmp.duration)) {
        const nb = Math.max(8, Math.ceil((tmp.duration * (bpm / 60)) / 8) * 8); setBeats(nb)
        const ns = nb * subdivision
        setChart(prev => {
          const u = prev.length < ns ? [...prev, ...buildChart(ns - prev.length)] : prev.slice(0, ns)
          saveSettings({ chart: u, beats: nb, songTitle: newTitle, audioFileName: f.name }); return u
        })
      }
    }, { once: true })
  }

  const playPreview = () => {
    if (!audioRef.current || !songFile) return
    if (audioRef.current.paused) audioRef.current.play().catch(() => {})
    else audioRef.current.pause()
  }

  // ── Export / Import ───────────────────────────────────────────────────────
  const exportChart = () => {
    const data = { title: songTitle, bpm, speed, subdivision, beats, chart }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${songTitle.replace(/[^a-z0-9]/gi, '_')}.kronox.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const importInputRef = useRef(null)
  const importChart = e => {
    const f = e.target.files[0]; if (!f) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result)
        if (!data.chart || !Array.isArray(data.chart)) throw new Error('bad')
        const sub = Number(data.subdivision) || 1
        // Derive beats from the actual chart length so the resize effect
        // never trims notes or changes difficulty after import
        const derivedBeats = Math.ceil(data.chart.length / sub)
        if (data.title)       setSongTitle(data.title)
        if (data.bpm)         setBpm(Number(data.bpm))
        if (data.speed)       setSpeed(Number(data.speed))
        setSubdivision(sub)
        setBeats(derivedBeats)
        setChart(data.chart)
        saveSettings({ chart: data.chart, songTitle: data.title, bpm: Number(data.bpm) || 120, speed: Number(data.speed) || 2.0, subdivision: sub, beats: derivedBeats })
      } catch { alert('Invalid .kronox.json file') }
    }
    reader.readAsText(f)
    e.target.value = ''
  }

  // Slow mode key capture
  useEffect(() => {
    if (!capturingSlowKey) return
    const handler = e => {
      e.preventDefault()
      if (e.key === 'Escape') { setCapturingSlowKey(false); return }
      if (keybinds.includes(e.key)) { setCapturingSlowKey(false); return } // can't overlap lane keys
      setSlowModeKey(e.key)
      saveSettings({ slowModeKey: e.key })
      setCapturingSlowKey(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [capturingSlowKey, keybinds, saveSettings])

  // ── Record mode ───────────────────────────────────────────────────────────
  const HOLD_THRESHOLD_MS = 200
  const [isRecording,       setIsRecording]       = useState(false)
  const [isRecPaused,       setIsRecPaused]       = useState(false)
  const [recResumeCountdown, setRecResumeCountdown] = useState(null)
  const isRecPausedRef = useRef(false)
  const [recordCountdown, setRecordCountdown] = useState(null)
  const recordChartRef   = useRef(null)
  const [recordChart, setRecordChart] = useState(null)
  const [recLanePressed, setRecLanePressed] = useState([false, false, false, false])
  const recordKeyDownRef = useRef({})

  // Sync isRecPaused into a ref so the keydown handler (closed over stale state) can read it
  useEffect(() => { isRecPausedRef.current = isRecPaused }, [isRecPaused])

  // Recording resume countdown: 3 → 2 → 1 → null → actually resume
  useEffect(() => {
    if (recResumeCountdown === null) return
    if (recResumeCountdown > 1) {
      const t = setTimeout(() => setRecResumeCountdown(c => c - 1), 800)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => {
      setRecResumeCountdown(null)
      isRecPausedRef.current = false
      setIsRecPaused(false)
      audioRef.current?.play().catch(() => {})
    }, 800)
    return () => clearTimeout(t)
  }, [recResumeCountdown])

  const startRecording = () => {
    if (!songFile || !audioRef.current) return
    audioRef.current.currentTime = 0
    // Start in slow mode by default so you can toggle it off mid-recording
    if (slowModeEnabled) {
      audioRef.current.playbackRate = slowModeSpeed
      setIsSlowMode(true)
    } else {
      audioRef.current.playbackRate = 1.0
      setIsSlowMode(false)
    }
    // Always size chart from actual audio duration so notes never get cut off.
    // Falls back to beats*subdivision if duration isn't available yet.
    const audioDur = audioRef.current.duration
    const chartSteps = isFinite(audioDur) && audioDur > 0
      ? Math.ceil(audioDur * bpm * subdivision / 60) + subdivision * 4  // +4 beat buffer
      : beats * subdivision
    recordChartRef.current = buildChart(chartSteps)
    recordKeyDownRef.current = {}
    setRecordChart(null)
    setRecordCountdown(3)
  }

  // Countdown: 3 → 2 → 1 → null → start recording
  useEffect(() => {
    if (recordCountdown === null) return
    if (recordCountdown > 1) {
      const t = setTimeout(() => setRecordCountdown(c => c - 1), 800)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => {
      setRecordCountdown(null)
      setIsRecording(true)
      audioRef.current?.play().catch(() => {})
    }, 800)
    return () => clearTimeout(t)
  }, [recordCountdown])
  const stopRecording = useCallback(() => {
    setIsRecording(false)
    setIsSlowMode(false)
    setIsRecPaused(false)
    isRecPausedRef.current = false
    setRecResumeCountdown(null)
    if (audioRef.current) { audioRef.current.playbackRate = 1.0; audioRef.current.pause() }
    if (recordChartRef.current) {
      const recorded = recordChartRef.current
      // Trim trailing empty rows so the chart doesn't have dead space at the end
      let lastNote = recorded.length - 1
      while (lastNote > 0 && recorded[lastNote].every(c => c === 0)) lastNote--
      const trimmed = recorded.slice(0, lastNote + 1)
      // Sync beats state to match recorded chart length so the editor is consistent
      const newBeats = Math.ceil(trimmed.length / subdivision)
      setBeats(newBeats)
      setRecordChart(trimmed)
    }
    recordKeyDownRef.current = {}
  }, [subdivision])

  // writeNote: single source-of-truth for committing a recorded note to the chart.
  // Using a ref-based write prevents any race where two paths (touch + keyboard)
  // both see a valid `info` and double-write the same cell.
  const writeNoteRef = useRef(null)  // not used for storage — just ensures one write path
  const commitNote = useCallback((lane, info, endMs) => {
    if (!recordChartRef.current) return
    const subdivMs  = (60000 / bpm) / subdivision
    const endCi     = Math.max(0, Math.min(Math.round(endMs / subdivMs), recordChartRef.current.length - 1))
    const newChart  = recordChartRef.current.map(r => [...r])
    // Re-check slot in case something else was written there since keydown
    let startCi = info.subdivIdx
    while (startCi < newChart.length - 1 && newChart[startCi][lane] !== 0) startCi++
    if (endMs - info.timeMs >= HOLD_THRESHOLD_MS && endCi > startCi) {
      newChart[startCi][lane] = endCi - startCi + 1
      for (let i = startCi + 1; i <= endCi; i++) newChart[i][lane] = -1
    } else { newChart[startCi][lane] = 1 }
    recordChartRef.current = newChart
  }, [bpm, subdivision, HOLD_THRESHOLD_MS])

  const recordTouchDown = useCallback((lane) => {
    if (!isRecording || !recordChartRef.current) return
    const subdivMs = (60000 / bpm) / subdivision
    const nowMs = audioRef.current?.currentTime * 1000 || 0
    let ci = Math.max(0, Math.min(Math.floor(nowMs / subdivMs), recordChartRef.current.length - 1))
    while (ci < recordChartRef.current.length - 1 && recordChartRef.current[ci][lane] !== 0) ci++
    recordKeyDownRef.current[lane] = { timeMs: nowMs, subdivIdx: ci }
  }, [isRecording, bpm, subdivision])

  const recordTouchUp = useCallback((lane) => {
    if (!isRecording || !recordChartRef.current) return
    const info = recordKeyDownRef.current[lane]; if (!info) return
    delete recordKeyDownRef.current[lane]
    const nowMs = audioRef.current?.currentTime * 1000 || 0
    commitNote(lane, info, nowMs)
  }, [isRecording, commitNote])

  useEffect(() => {
    if (!isRecording) return
    const handleSpacePause = e => {
      if (e.code !== 'Space' || e.repeat) return
      e.preventDefault()
      if (!isRecording) return
      if (!isRecPausedRef.current) {
        // Pause
        isRecPausedRef.current = true
        setIsRecPaused(true)
        if (audioRef.current) audioRef.current.pause()
      } else {
        // Already paused — start countdown to unpause
        setRecResumeCountdown(3)
      }
    }
    window.addEventListener('keydown', handleSpacePause)

    const handleDown = e => {
      if (isRecPausedRef.current) return
      if (e.repeat) return
      const lane = keybinds.indexOf(e.key); if (lane === -1) return
      e.preventDefault()
      const nowMs  = audioRef.current?.currentTime * 1000 || 0
      const subMs  = (60000 / bpm) / subdivision
      let ci = Math.max(0, Math.min(Math.floor(nowMs / subMs), recordChartRef.current.length - 1))
      // Bump forward if this slot is already occupied for this lane (prevents clumping)
      while (ci < recordChartRef.current.length - 1 && recordChartRef.current[ci][lane] !== 0) ci++
      recordKeyDownRef.current[lane] = { timeMs: nowMs, subdivIdx: ci }
    }
    const handleUp = e => {
      if (isRecPausedRef.current) return
      const lane = keybinds.indexOf(e.key); if (lane === -1) return
      e.preventDefault()
      const info = recordKeyDownRef.current[lane]; if (!info) return
      delete recordKeyDownRef.current[lane]
      const nowMs = audioRef.current?.currentTime * 1000 || 0
      commitNote(lane, info, nowMs)
    }
    const handleSlowKey = e => {
      if (!slowModeEnabled) return
      if (e.key !== slowModeKey) return
      e.preventDefault()
      setIsSlowMode(prev => {
        const next = !prev
        if (audioRef.current) audioRef.current.playbackRate = next ? slowModeSpeed : 1.0
        return next
      })
    }
    window.addEventListener('keydown', handleDown); window.addEventListener('keyup', handleUp)
    window.addEventListener('keydown', handleSlowKey)
    const audio = audioRef.current; audio?.addEventListener('ended', stopRecording)
    return () => {
      window.removeEventListener('keydown', handleSpacePause)
      window.removeEventListener('keydown', handleDown); window.removeEventListener('keyup', handleUp)
      window.removeEventListener('keydown', handleSlowKey)
      audio?.removeEventListener('ended', stopRecording)
    }
  }, [isRecording, bpm, subdivision, keybinds, stopRecording, slowModeKey, slowModeSpeed, slowModeEnabled, commitNote])

  const applyRecordedChart   = () => { if (!recordChart) return; undoRef.current = [...undoRef.current.slice(-49), chart.map(r => [...r])]; redoRef.current = []; setChart(recordChart); saveSettings({ chart: recordChart }); setRecordChart(null); setActiveTab('chart') }
  const discardRecordedChart = () => setRecordChart(null)

  const keyLabel = k => {
    if (k === ' ') return 'Spc'
    if (k === 'ArrowLeft') return '←'; if (k === 'ArrowRight') return '→'
    if (k === 'ArrowUp') return '↑'; if (k === 'ArrowDown') return '↓'
    return k.toUpperCase()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', overflowX: 'hidden', padding: '1.5rem', gap: '1.25rem', background: '#0a0a0a' }}>
      <div>
        <div style={{ fontFamily: 'Arial', fontSize: 14, color: '#fff', fontWeight: 'bold', marginBottom: 6 }}>KRONOX</div>
        <div style={{ fontFamily: 'Arial', fontSize: 13, color: '#888' }}>Build your chart, then play it back</div>
      </div>

      {/* File + Title */}
      <div style={{ display: 'grid', gridTemplateColumns: window.innerWidth < 600 ? '1fr' : '2fr 1fr', gap: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <FieldLabel>SONG FILE</FieldLabel>
          <label style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 6, cursor: 'pointer', background: '#111', border: `2px dashed ${songFile ? '#66ff99' : '#2a2a2a'}`, transition: 'all 0.2s', overflow: 'hidden', minWidth: 0 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: songFile ? '#66ff99' : '#333', flexShrink: 0 }} />
            <span style={{ fontFamily: 'Arial', fontSize: 14, color: songFile ? '#fff' : '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>
              {songFile ? songFile.name : 'Click to upload MP3/OGG/WAV'}
            </span>
            <input type="file" accept="audio/*" onChange={handleFile} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
          </label>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <FieldLabel>SONG TITLE</FieldLabel>
          <input value={songTitle} onChange={e => { setSongTitle(e.target.value); saveSettings({ songTitle: e.target.value }) }}
            style={{ fontFamily: 'Arial', fontSize: 14, color: '#fff', padding: '12px 14px', borderRadius: 6, background: '#111', border: '1px solid #222', outline: 'none', width: '100%', boxSizing: 'border-box' }}
            onFocus={e => e.target.style.borderColor = '#555'} onBlur={e => e.target.style.borderColor = '#222'} />
        </div>
      </div>

      {/* Preview player */}
      {songFile && (
        <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 6, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={playPreview} style={{ fontFamily: 'Arial', fontSize: 12, padding: '6px 14px', background: isPlaying ? '#444' : '#ff4d8f', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 'bold', cursor: 'pointer' }}>
              {isPlaying ? '⏸ PAUSE' : '▶ PLAY'}
            </button>
            <span style={{ fontFamily: 'Arial', fontSize: 12, color: '#888' }}>
              {Math.floor(previewPos || 0)}s / {audioRef.current ? Math.floor(audioRef.current.duration || 0) : 0}s
            </span>
          </div>
          <div style={{ height: 4, background: '#222', borderRadius: 2, overflow: 'hidden', cursor: 'pointer' }}
            onClick={e => { if (!audioRef.current) return; const r = e.currentTarget.getBoundingClientRect(); audioRef.current.currentTime = ((e.clientX - r.left) / r.width) * (audioRef.current.duration || 0) }}>
            <div style={{ height: '100%', width: `${audioRef.current ? (previewPos / (audioRef.current.duration || 1) * 100) : 0}%`, background: '#ff4d8f', transition: 'width 0.1s linear' }} />
          </div>
        </div>
      )}

      {/* Sliders */}
      <div style={{ display: 'grid', gridTemplateColumns: window.innerWidth < 600 ? '1fr' : '1fr 1fr 1fr', gap: '1rem' }}>
        <SliderField label={mode3d ? 'SCROLL SPEED (3D)' : 'SCROLL SPEED'} value={mode3d ? speed3d : speed} min={0.5} max={mode3d ? 10 : 5} step={0.1} display={(mode3d ? speed3d : speed).toFixed(1)} onChange={v => { if (mode3d) { setSpeed3d(v); saveSettings({ speed3d: v }) } else { setSpeed(v); saveSettings({ speed: v }) } }} />
        <SliderField label="BPM" value={bpm} min={60} max={240} step={1} display={bpm} onChange={v => { setBpm(v); saveSettings({ bpm: v }) }} />
        <SliderField label="NOTE DENSITY" value={subdivision} min={1} max={8} step={1}
          display={['1/4', '1/8', '1/16', '1/32', '1/64', '1/128', '1/256', '1/512'][subdivision - 1]}
          onChange={v => { setSubdivision(v); saveSettings({ subdivision: v }) }} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #222' }}>
        {['chart', 'record'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ fontFamily: 'Arial', fontSize: 8, letterSpacing: 2, padding: '8px 16px', background: 'transparent', border: 'none', color: activeTab === tab ? '#fff' : '#444', borderBottom: activeTab === tab ? '2px solid #fff' : '2px solid transparent', marginBottom: -1, transition: 'all 0.15s', cursor: 'pointer' }}>
            {tab === 'chart' ? 'CHART EDITOR' : '● RECORD MODE'}
          </button>
        ))}
      </div>

      {/* Chart editor */}
      {activeTab === 'chart' && (
        <>
          <div style={{ display: 'flex', flexDirection: window.innerWidth < 600 ? 'column' : 'row', alignItems: window.innerWidth < 600 ? 'flex-start' : 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontFamily: 'Arial', fontSize: 12, color: '#66ff99', fontWeight: 'bold' }}>{isFinite(beats) ? beats : DEFAULT_BEATS} beats · {(isFinite(beats) ? beats : DEFAULT_BEATS) * subdivision} steps</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <SmallBtn onClick={doUndo} color="#555">↩{window.innerWidth >= 600 ? ' UNDO' : ''}</SmallBtn>
              <SmallBtn onClick={doRedo} color="#555">↪{window.innerWidth >= 600 ? ' REDO' : ''}</SmallBtn>
              <SmallBtn onClick={() => setHoldMode(!holdMode)} color={holdMode ? '#ffd93d' : '#666'}>{holdMode ? (window.innerWidth < 600 ? 'HOLD ●' : 'HOLD MODE ●') : (window.innerWidth < 600 ? 'HOLD' : 'HOLD MODE')}</SmallBtn>
              <SmallBtn onClick={randomizeChart} color="#ff4d8f">{window.innerWidth < 600 ? 'RND' : 'RANDOM'}</SmallBtn>
              <SmallBtn onClick={clearChart} color="#666">{window.innerWidth < 600 ? 'CLR' : 'CLEAR'}</SmallBtn>
              {songFile && <SmallBtn onClick={generateAiChart} color={aiGenerating ? '#444' : '#aa66ff'}>{aiGenerating ? '...' : '\u2726 AI'}</SmallBtn>}
            </div>
          </div>
          {songFile && (
            <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 6, padding: '8px 12px', height: 40, display: 'flex', alignItems: 'center' }}>
              <div style={{ height: 24, width: '100%', position: 'relative', background: '#0a0a0a', borderRadius: 3 }}>
                {chart.map((row, b) => row.some(n => n > 0) ? <div key={b} style={{ position: 'absolute', left: (b / chart.length * 100) + '%', top: 0, bottom: 0, width: 2, background: '#ff4d8f', opacity: 0.6 }} /> : null)}
                {isFinite(audioRef.current?.duration) && audioRef.current.duration > 0 && <div style={{ position: 'absolute', left: (previewPos / audioRef.current.duration * 100) + '%', top: 0, bottom: 0, width: 2, background: '#66ff99' }} />}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: '#111', borderRadius: 6, border: '1px solid #1a1a1a', padding: '12px', minHeight: window.innerWidth < 600 ? 220 : 0, maxHeight: window.innerWidth < 600 ? 280 : 340, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '28px repeat(4, 1fr)', gap: 4 }}>
              <div />
              {['L', 'D', 'U', 'R'].map((n, i) => (<div key={i} style={{ display: 'flex', justifyContent: 'center' }}><span style={{ fontFamily: 'Arial', fontSize: 7, color: LANE_COLORS[i], letterSpacing: 1 }}>{n}</span></div>))}
            </div>
            <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>
              {Array.from({ length: beats }, (_, beatIdx) => (
                <div key={beatIdx} style={{ marginBottom: 3 }}>
                  {Array.from({ length: subdivision }, (_, subIdx) => {
                    const rowIdx = beatIdx * subdivision + subIdx
                    if (rowIdx >= chart.length) return null
                    const row = chart[rowIdx], isBeatStart = subIdx === 0, isMeasureStart = beatIdx % 4 === 0 && subIdx === 0
                    return (
                      <div key={subIdx} style={{ display: 'grid', gridTemplateColumns: '28px repeat(4, 1fr)', gap: 4, marginBottom: 2, borderTop: isMeasureStart ? '1px solid #3a3a3a' : isBeatStart ? '1px solid #262626' : 'none', paddingTop: (isBeatStart || isMeasureStart) ? 3 : 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 2 }}>
                          {isBeatStart
                            ? <span style={{ fontFamily: 'Arial', fontSize: 6, color: isMeasureStart ? '#66ff99' : '#444' }}>{isMeasureStart ? `M${Math.floor(beatIdx / 4) + 1}` : `${beatIdx + 1}`}</span>
                            : <span style={{ fontFamily: 'Arial', fontSize: 5, color: '#2a2a2a' }}>·</span>}
                        </div>
                        {row.map((on, l) => {
                          const isHoldHead = on > 1, isHoldTail = on === -1, isActive = on !== 0
                          return <button key={l}
                            onMouseDown={() => toggleCell(rowIdx, l)} onMouseUp={() => holdMode && endHold(rowIdx)}
                            style={{ height: isBeatStart ? 20 : 14, borderRadius: isHoldTail ? 2 : 3, background: isHoldHead ? LANE_COLORS[l] + '55' : isHoldTail ? LANE_COLORS[l] + '22' : isActive ? 'rgba(255,255,255,0.18)' : isMeasureStart ? '#161616' : '#111', border: `1px solid ${isHoldHead ? LANE_COLORS[l] + '99' : isHoldTail ? LANE_COLORS[l] + '44' : isActive ? 'rgba(255,255,255,0.2)' : isBeatStart ? '#2a2a2a' : '#1a1a1a'}`, transition: 'all 0.08s', cursor: 'pointer' }} />
                        })}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Record mode */}
      {activeTab === 'record' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 6, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontFamily: 'Arial', fontSize: 9, color: '#fff', letterSpacing: 2, fontWeight: 'bold' }}>HOW IT WORKS</div>
            <div style={{ fontFamily: 'Arial', fontSize: 12, color: '#888', lineHeight: 1.6 }}>Press and hold keys in time to the music. Taps = single notes. Hold 200ms+ = hold note.</div>
            <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
              {keybinds.map((k, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', border: `1.5px solid ${activeLaneColors[i]}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: activeLaneColors[i] + '11' }}>
                    <span style={{ fontFamily: 'Arial', fontSize: 9, color: activeLaneColors[i] }}>{keyLabel(k)}</span>
                  </div>
                  <span style={{ fontFamily: 'Arial', fontSize: 7, color: '#444', letterSpacing: 1 }}>{LANE_NAMES[i]}</span>
                </div>
              ))}
            </div>
          </div>
          {!isRecording && !recordChart && recordCountdown === null && (
            <>
              {/* Slow mode settings */}
              <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 6, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: slowModeEnabled ? '#ff4d8f' : '#555' }} />
                    <span style={{ fontFamily: 'Arial', fontSize: 8, color: slowModeEnabled ? '#ff4d8f' : '#555', letterSpacing: 3, fontWeight: 'bold' }}>SLOW MODE</span>
                  </div>
                  <button onClick={() => { const next = !slowModeEnabled; setSlowModeEnabled(next); saveSettings({ slowModeEnabled: next }) }}
                    style={{ fontFamily: 'Arial', fontSize: 7, letterSpacing: 2, padding: '4px 12px', borderRadius: 4, cursor: 'pointer', background: slowModeEnabled ? '#ff4d8f' : 'transparent', border: `1px solid ${slowModeEnabled ? '#ff4d8f' : '#333'}`, color: slowModeEnabled ? '#fff' : '#444', fontWeight: slowModeEnabled ? 'bold' : 'normal' }}>
                    {slowModeEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>
                <div style={{ fontFamily: 'Arial', fontSize: 11, color: '#333', lineHeight: 1.55 }}>
                  Toggle during recording to slow audio + notes together — timing stays accurate.
                </div>
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <FieldLabel>TOGGLE KEY</FieldLabel>
                    <button
                      onClick={() => setCapturingSlowKey(true)}
                      style={{ width: 52, height: 36, borderRadius: 5, background: capturingSlowKey ? '#222' : '#111', border: `1px solid ${capturingSlowKey ? '#ff4d8f' : '#2a2a2a'}`, color: capturingSlowKey ? '#ff4d8f' : '#888', fontFamily: 'Arial', fontSize: 13, fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.15s' }}>
                      {capturingSlowKey ? '·' : keyLabel(slowModeKey)}
                    </button>
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <FieldLabel>SLOW SPEED</FieldLabel>
                      <span style={{ fontFamily: 'Arial', fontSize: 19, color: '#888', fontWeight: 'bold' }}>{slowModeSpeed.toFixed(1)}×</span>
                    </div>
                    <style>{`
                      .slow-slider { -webkit-appearance: none; appearance: none; height: 3px; border-radius: 2px; outline: none; cursor: pointer; background: linear-gradient(to right, #444 0%, #444 ${((slowModeSpeed - 0.1) / 1.9) * 100}%, #222 ${((slowModeSpeed - 0.1) / 1.9) * 100}%, #222 100%); }
                      .slow-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 13px; height: 13px; border-radius: 50%; background: #888; border: none; cursor: pointer; transition: background 0.12s; }
                      .slow-slider::-webkit-slider-thumb:hover { background: #fff; }
                      .slow-slider::-moz-range-thumb { width: 13px; height: 13px; border-radius: 50%; background: #888; border: none; cursor: pointer; }
                    `}</style>
                    <input type="range" min={0.1} max={2.0} step={0.1} value={slowModeSpeed}
                      className="slow-slider"
                      onChange={e => { const v = parseFloat(e.target.value); setSlowModeSpeed(v); saveSettings({ slowModeSpeed: v }) }}
                      style={{ width: '100%', background: `linear-gradient(to right, #444 0%, #444 ${((slowModeSpeed - 0.1) / 1.9) * 100}%, #222 ${((slowModeSpeed - 0.1) / 1.9) * 100}%, #222 100%)` }} />
                  </div>
                </div>
              </div>
              <button onClick={startRecording} disabled={!songFile}
                style={{ fontFamily: 'Arial', fontSize: 11, letterSpacing: 2, fontWeight: 'bold', padding: '14px 0', borderRadius: 6, cursor: songFile ? 'pointer' : 'not-allowed', background: songFile ? '#ff4d8f' : '#1a1a1a', color: songFile ? '#fff' : '#333', border: 'none', transition: 'all 0.2s' }}>
                {songFile ? '● START RECORDING' : '⚠ UPLOAD A SONG FIRST'}
              </button>
            </>
          )}
          {recordCountdown !== null && (
            <div style={{ position: 'relative', border: '1px solid #1a1a1a', borderRadius: 6, overflow: 'hidden', height: 120, background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: 'Arial', fontSize: 8, color: '#444', letterSpacing: 3, position: 'absolute', top: 10, left: 0, right: 0, textAlign: 'center' }}>GET READY</span>
              <CountdownOverlay count={recordCountdown} />
            </div>
          )}
          {isRecording && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ position: 'relative', background: '#111', border: `1px solid ${isRecPaused ? '#ffd93d44' : '#ff4d8f44'}`, borderRadius: 6, padding: '16px', display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden' }}>
                {isRecPaused
                  ? <div style={{ width: 10, height: 10, borderRadius: 2, background: '#ffd93d', flexShrink: 0 }} />
                  : <><div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff4d8f', animation: 'recPulse 0.8s ease-in-out infinite', flexShrink: 0 }} />
                    <style>{`@keyframes recPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.4;transform:scale(0.7)}}`}</style></>}
                <div>
                  <div style={{ fontFamily: 'Arial', fontSize: 9, color: isRecPaused ? '#ffd93d' : '#ff4d8f', letterSpacing: 2, fontWeight: 'bold' }}>{isRecPaused ? 'PAUSED' : 'RECORDING'}</div>
                  <div style={{ fontFamily: 'Arial', fontSize: 11, color: '#888', marginTop: 2 }}>
                    {isRecPaused ? 'Press SPACE to resume' : `${Math.floor(previewPos)}s — tap or hold ${keybinds.map(k => keyLabel(k)).join(', ')}`}
                  </div>
                </div>
                {recResumeCountdown !== null && <CountdownOverlay count={recResumeCountdown} />}
              </div>
              {window.innerWidth >= 600 && <LiveKeyDisplay keys={keybinds} keyLabels={keybinds.map(k => keyLabel(k))} names={LANE_NAMES} colors={activeLaneColors} />}
              {window.innerWidth < 600 && (
                <div style={{ display: 'flex', gap: 8 }}>
                  {[0, 1, 2, 3].map(lane => (
                    <button key={lane}
                      onPointerDown={e => { e.preventDefault(); setRecLanePressed(p => { const n=[...p]; n[lane]=true; return n }); recordTouchDown(lane) }}
                      onPointerUp={e => { e.preventDefault(); setRecLanePressed(p => { const n=[...p]; n[lane]=false; return n }); recordTouchUp(lane) }}
                      onPointerLeave={() => setRecLanePressed(p => { const n=[...p]; n[lane]=false; return n })}
                      style={{ flex: 1, height: 80, borderRadius: 8, background: recLanePressed[lane] ? activeLaneColors[lane] + '55' : activeLaneColors[lane] + '18', border: `2px solid ${recLanePressed[lane] ? activeLaneColors[lane] : activeLaneColors[lane] + '66'}`, color: recLanePressed[lane] ? activeLaneColors[lane] : activeLaneColors[lane] + '99', fontFamily: 'Arial', fontSize: 8, letterSpacing: 2, cursor: 'pointer', userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none', transition: 'background 0.05s, border 0.05s' }}>
                      {LANE_NAMES[lane]}
                    </button>
                  ))}
                </div>
              )}
              {/* Slow mode toggle indicator */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ padding: '7px 18px', borderRadius: 20, background: isSlowMode ? '#1f1f1f' : '#111', border: `1px solid ${isSlowMode ? '#ff4d8f44' : '#1a1a1a'}`, display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.15s' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: isSlowMode ? '#ff4d8f' : '#2a2a2a', transition: 'background 0.15s', flexShrink: 0 }} />
                  <span style={{ fontFamily: 'Arial', fontSize: 9, letterSpacing: 2, color: isSlowMode ? '#ff4d8f' : '#333', fontWeight: 'bold' }}>
                    {isSlowMode ? `SLOW ${slowModeSpeed.toFixed(1)}×` : 'NORMAL SPEED'}
                  </span>
                  <span style={{ fontFamily: 'Arial', fontSize: 8, color: '#252525', letterSpacing: 1 }}>[{keyLabel(slowModeKey)}] TO TOGGLE</span>
                </div>
              </div>
              <button onClick={stopRecording} style={{ fontFamily: 'Arial', fontSize: 11, letterSpacing: 2, fontWeight: 'bold', padding: '12px 0', borderRadius: 6, background: '#2a2a2a', color: '#fff', border: '1px solid #3a3a3a', cursor: 'pointer' }}>■ STOP RECORDING</button>
            </div>
          )}
          {recordChart && !isRecording && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 6, padding: '12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontFamily: 'Arial', fontSize: 9, color: '#66ff99', letterSpacing: 2, fontWeight: 'bold' }}>DONE — {recordChart.flat().filter(v => v > 0).length} NOTES</div>
                <div style={{ height: 28, background: '#0a0a0a', borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
                  {recordChart.map((row, b) => row.some(n => n > 0) ? <div key={b} style={{ position: 'absolute', left: (b / recordChart.length * 100) + '%', top: 0, bottom: 0, width: 2, background: '#ff4d8f', opacity: 0.7 }} /> : null)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={applyRecordedChart}   style={{ flex: 1, fontFamily: 'Arial', fontSize: 10, letterSpacing: 1, padding: '12px 0', borderRadius: 6, background: '#66ff99', color: '#111', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>✓ APPLY</button>
                <button onClick={startRecording}        style={{ flex: 1, fontFamily: 'Arial', fontSize: 10, letterSpacing: 1, padding: '12px 0', borderRadius: 6, background: 'transparent', color: '#fff', border: '1px solid #333', cursor: 'pointer' }}>↺ REDO</button>
                <button onClick={discardRecordedChart}  style={{ fontFamily: 'Arial', fontSize: 10, padding: '12px 16px', borderRadius: 6, background: 'transparent', color: '#555', border: '1px solid #222', cursor: 'pointer' }}>✕</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom action bar */}
      <div style={{ display: 'flex', gap: 8, marginTop: window.innerWidth < 600 ? '0.5rem' : 'auto', flexWrap: 'wrap', alignItems: 'center' }}>
        <SmallBtn onClick={exportChart} color="#4d96ff">EXPORT CHART</SmallBtn>
        <label>
          <input ref={importInputRef} type="file" accept=".json" onChange={importChart} style={{ display: 'none' }} />
          <SmallBtn onClick={() => importInputRef.current?.click()} color="#4d96ff">IMPORT CHART</SmallBtn>
        </label>
        {songFile && (
          <SmallBtn onClick={() => onOpenPublish({ songFile, songTitle, bpm, speed, subdivision, beats, chart, audioRef })} color="#ffd93d">
            ↑ PUBLISH
          </SmallBtn>
        )}
        {songFile && (() => {
          const d = calcDifficulty(chart, bpm, subdivision)
          return <span style={{ fontFamily: 'Arial', fontSize: 9, color: diffColor(d), background: diffColor(d) + '18', padding: '6px 12px', borderRadius: 5, letterSpacing: 1 }}>★ {d}</span>
        })()}
        <button onClick={() => setAutoplay(a => !a)}
          style={{ fontFamily: 'Arial', fontSize: 7, letterSpacing: 2, padding: '8px 13px', borderRadius: 5, border: `1px solid ${autoplay ? '#ffd93d55' : '#222'}`, background: autoplay ? '#ffd93d11' : 'transparent', color: autoplay ? '#ffd93d' : '#555', cursor: 'pointer', transition: 'all 0.15s' }}>
          {autoplay ? '▶▶ AUTOPLAY ON' : 'AUTOPLAY'}
        </button>
        <button onClick={() => { const next = !mode3d; setMode3d(next); saveSettings({ mode3d: next }); if (next && !saved.speed3d) { setSpeed3d(3.0); saveSettings({ speed3d: 3.0 }) } }}
          style={{ fontFamily: 'Arial', fontSize: 7, letterSpacing: 2, padding: '8px 13px', borderRadius: 5, border: `1px solid ${mode3d ? '#cc44ff55' : '#222'}`, background: mode3d ? '#cc44ff11' : 'transparent', color: mode3d ? '#cc44ff' : '#555', cursor: 'pointer', transition: 'all 0.15s' }}>
          {mode3d ? '3D ON' : '3D MODE'}
        </button>
        <button
          onClick={() => songFile && onStart({ songFile, songTitle, speed: mode3d ? speed3d : speed, bpm, chart, subdivision, keybinds, autoplay, mode3d })}
          disabled={!songFile}
          style={{ marginLeft: 'auto', fontFamily: 'Arial', fontSize: 13, letterSpacing: 1, fontWeight: 'bold', padding: '12px 28px', borderRadius: 6, cursor: songFile ? 'pointer' : 'not-allowed', background: autoplay ? '#ffd93d' : songFile ? '#66ff99' : '#1a1a1a', color: songFile ? '#111' : '#333', border: songFile ? 'none' : '1px solid #2a2a2a', transition: 'all 0.2s' }}
          onMouseEnter={e => { if (songFile) { e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.transform = 'scale(1.02)' } }}
          onMouseLeave={e => { if (songFile) { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1)' } }}>
          {songFile ? (autoplay ? '▶▶ AUTOPLAY' : '▶ PLAY') : '⚠ UPLOAD A SONG FIRST'}
        </button>
      </div>
    </div>
  )
}

function LiveKeyDisplay({ keys, keyLabels, names, colors }) {
  const [pressed, setPressed] = useState([false, false, false, false])
  useEffect(() => {
    const dn = e => { const i = keys.indexOf(e.key); if (i !== -1) setPressed(p => { const n = [...p]; n[i] = true; return n }) }
    const up = e => { const i = keys.indexOf(e.key); if (i !== -1) setPressed(p => { const n = [...p]; n[i] = false; return n }) }
    window.addEventListener('keydown', dn); window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up) }
  }, [keys])
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
      {keyLabels.map((k, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', border: `1.5px solid ${pressed[i] ? colors[i] : colors[i] + '44'}`, background: pressed[i] ? colors[i] + '22' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.04s' }}>
            <span style={{ fontFamily: 'Arial', fontSize: 11, color: pressed[i] ? colors[i] : '#555' }}>{k}</span>
          </div>
          <span style={{ fontFamily: 'Arial', fontSize: 6, color: '#444', letterSpacing: 1 }}>{names[i]}</span>
        </div>
      ))}
    </div>
  )
}

// ── Linear perspective projection for 3D mode ───────────────────────────────
// Matches CSS: perspective:650px, perspectiveOrigin:50% 88%, rotateX(30deg) at bottom
function project3dNote(yFromBottom, lane, stageW, stageH, LANE_W, LANE_GAP, TOTAL_W) {
  const F        = 650                    // focal length == CSS perspective
  const camYt    = stageH * 0.88         // camera Y from top == perspectiveOrigin Y
  const rot      = 30 * Math.PI / 180    // fretboard tilt == rotateX angle
  // World position of note on the tilted plane (pivot = bottom of stage)
  const worldYt  = stageH - yFromBottom * Math.cos(rot)  // Y from top in world space
  const worldZ   = yFromBottom * Math.sin(rot)            // depth into screen (positive = away)
  // Perspective scale: further = smaller
  const scale    = F / (F + worldZ)
  // Project onto screen
  const screenY  = camYt + (worldYt - camYt) * scale
  const fretLeft = stageW / 2 - (TOTAL_W + LANE_GAP * 2) / 2
  const laneCX   = fretLeft + LANE_GAP + lane * (LANE_W + LANE_GAP) + LANE_W / 2
  const screenX  = stageW / 2 + (laneCX - stageW / 2) * scale
  return { screenX, screenY, scale }
}

// ─── GameView ─────────────────────────────────────────────────────────────────
function GameView({ config, onStop }) {
  const stageRef    = useRef(null)
  const audioRef    = useRef(null)
  const rafRef      = useRef(null)
  const sfxCtxRef   = useRef(null)
  const sfxBufRef   = useRef(null)
  const analyserRef      = useRef(null)
  const starCanvasRef    = useRef(null)
  const starsRef         = useRef(null)
  const beatIntensityRef = useRef(0)
  const beatBaseRef      = useRef(0)  // long-term RMS average for onset detection
  const audioOffsetRef   = useRef(loadSettings().audioOffset || 0)
  const laneElsRef      = useRef(null)
  const tDataRef        = useRef(null)
  const starSettingsRef = useRef({ color: '#ffffff', enabled: true })
  const stateRef = useRef({
    activeNotes: [], score: 0, combo: 0, multiplier: 1, health: 80,
    paused: false, completedBeats: new Set(),
    perfect: 0, good: 0, okay: 0, bad: 0, miss: 0, totalHits: 0,
    heldNotes: {},
    hitOffsets: [],
  })

  // Countdown: 3 → 2 → 1 → 'GO' → null (game starts)
  const [countdown,    setCountdown]    = useState(3)
  const gameStartedRef                  = useRef(false)

  const keybinds   = config.keybinds   || DEFAULT_LANE_KEYS
  const laneColors = config.laneColors || LANE_COLORS

  const isMobile = window.innerWidth < 600
  const LANE_W          = isMobile ? Math.floor((window.innerWidth - 16) / 4) : (config.mode3d ? 115 : 90)
  const LANE_GAP        = isMobile ? 4 : 8
  const NOTE_SIZE       = isMobile ? Math.round(LANE_W * 0.82) : (config.mode3d ? Math.round(LANE_W * 0.82) : 74)
  const TOTAL_W         = LANE_W * 4 + LANE_GAP * 3
  const RECEPTOR_BOTTOM = isMobile ? 50 : (config.receptorHeight ?? 70)

  const [hud,             setHud]             = useState({ score: 0, combo: 0, multiplier: 1, health: 80 })
  const [audioProgress,   setAudioProgress]   = useState({ current: 0, duration: 0 })
  const [judgment,        setJudgment]        = useState({ text: '', color: '#fff', visible: false, key: 0 })
  const [receptorPressed, setReceptorPressed] = useState([false, false, false, false])
  const [paused,          setPaused]          = useState(false)
  const [resumeCountdown, setResumeCountdown] = useState(null)
  const [comboFlash,      setComboFlash]      = useState(false)
  const [pausesLeft,      setPausesLeft]      = useState(3)

  // ── Hit SFX via Web Audio (allows gain > 1 to be louder than music) ───────
  useEffect(() => {
    const ctx = new AudioContext()
    sfxCtxRef.current = ctx
    fetch('/hit.mp3')
      .then(r => r.arrayBuffer())
      .then(buf => ctx.decodeAudioData(buf))
      .then(decoded => { sfxBufRef.current = decoded })
      .catch(() => {})
    return () => { if (ctx.state !== 'closed') ctx.close() }
  }, [])

  // ── Beat-reactive background via AnalyserNode ─────────────────────────────
  // Connected once audio starts; sampled every rAF frame
  const connectAnalyser = useCallback(audio => {
    try {
      const ctx      = new AudioContext()
      ctx.resume()  // browsers start AudioContext suspended — force it active
      const src      = ctx.createMediaElementSource(audio)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      src.connect(analyser)
      analyser.connect(ctx.destination)
      analyserRef.current = analyser
      _sharedAnalyser = analyser  // share with StarMap
    } catch { /* may fail if context limit hit */ }
  }, [])

  const playHitSfx = useCallback(() => {
    const ctx = sfxCtxRef.current
    const buf = sfxBufRef.current
    if (!ctx || !buf || ctx.state === 'closed') return
    const src  = ctx.createBufferSource()
    src.buffer = buf
    const gain = ctx.createGain()
    gain.gain.value = (config.sfxVolume ?? 0.7) * 5
    src.connect(gain)
    gain.connect(ctx.destination)
    src.start()
  }, [])

  // ── Countdown timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof countdown === 'number' && countdown > 1) {
      const t = setTimeout(() => setCountdown(c => c - 1), 800)
      return () => clearTimeout(t)
    } else if (countdown === 1) {
      const t = setTimeout(() => setCountdown('GO'), 800)
      return () => clearTimeout(t)
    } else if (countdown === 'GO') {
      const t = setTimeout(() => {
        setCountdown(null)
        gameStartedRef.current = true
        if (config.audioStartOffset && audioRef.current) {
          audioRef.current.currentTime = config.audioStartOffset
        }
        audioRef.current?.play().catch(() => {})
        // Belt-and-suspenders: if the unlock .then() raced and paused the audio,
        // re-start playback 250ms later once the promise chain has settled.
        setTimeout(() => {
          if (audioRef.current?.paused && gameStartedRef.current) audioRef.current.play().catch(() => {})
        }, 250)
        if (config.previewDuration) {
          setTimeout(() => {
            cancelAnimationFrame(rafRef.current)
            if (audioRef.current) { audioRef.current.onended = null; audioRef.current.pause() }
            stageRef.current?.querySelectorAll('.fnf-note,.fnf-hold-trail').forEach(n => n.remove())
            onStop('preview', null)
          }, config.previewDuration)
        }
      }, 600)
      return () => clearTimeout(t)
    }
  }, [countdown])

  const showJudge = useCallback((text, color) => {
    setJudgment(j => ({ text, color, visible: true, key: j.key + 1 }))
    setTimeout(() => setJudgment(j => ({ ...j, visible: false })), 500)
  }, [])

  const updateHud = useCallback(() => {
    const s = stateRef.current
    s.multiplier = 1 + Math.floor(s.combo / 50)
    setHud({ score: s.score, combo: s.combo, multiplier: s.multiplier, health: s.health })
    if (s.combo > 0) { setComboFlash(true); setTimeout(() => setComboFlash(false), 120) }
  }, [])

  const getLaneEl  = useCallback(lane => stageRef.current?.querySelectorAll('.fnf-lane')?.[lane], [])

  const flashLane = useCallback(laneEl => {
    if (!laneEl) return
    const s2 = loadSettings()
    const op = s2.flashOpacity ?? 0.13
    if (op === 0) return
    const fc = s2.flashColor || '#ffffff'
    const flash = document.createElement('div')
    flash.style.cssText = `position:absolute;inset:0;background:${fc};opacity:${op};pointer-events:none;z-index:5;transition:opacity 0.25s;`
    laneEl.appendChild(flash)
    requestAnimationFrame(() => requestAnimationFrame(() => { flash.style.opacity = '0' }))
    setTimeout(() => flash.remove(), 300)
  }, [])

  const stopGame = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    if (audioRef.current) { audioRef.current.onended = null; audioRef.current.pause() }
    stageRef.current?.querySelectorAll('.fnf-note,.fnf-hold-trail').forEach(n => n.remove())
    const s = stateRef.current
    const accuracy = s.totalHits > 0 ? Math.round(((s.perfect * 100 + s.good * 90 + s.okay * 80 + s.bad * 70) / (s.totalHits * 100)) * 100) : 0
    onStop('complete', {
      score: s.score, perfect: s.perfect, good: s.good, okay: s.okay, bad: s.bad,
      miss: s.miss, totalHits: s.totalHits, accuracy,
      duration: audioRef.current?.duration || 0, songTitle: config.songTitle,
      hitOffsets: [...s.hitOffsets],
    })
  }, [onStop, config.songTitle])

  const dieGame = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    if (audioRef.current) { audioRef.current.onended = null; audioRef.current.pause() }
    stageRef.current?.querySelectorAll('.fnf-note,.fnf-hold-trail').forEach(n => n.remove())
    onStop('death', null)
  }, [onStop])

  const doMiss = useCallback(note => {
    note.hit = true
    note.el?.remove(); note.el = null
    note.trailEl?.remove(); note.trailEl = null
    const s = stateRef.current
    s.completedBeats.add(`${note.beat}-${note.lane}`)
    s.miss++; s.totalHits++; s.combo = 0; s.multiplier = 1
    s.health = Math.max(0, s.health - 10)
    updateHud(); showJudge('MISS', '#ff6666')
    if (s.health <= 0) dieGame()
  }, [showJudge, updateHud, dieGame])

  const spawnPhantom = useCallback((note) => {
    const noteColor = laneColors[note.lane]
    // Use note's current visual position, but never below the receptor (clamp to avoid bottom-of-screen glitch)
    const y = note.yFromBottom > RECEPTOR_BOTTOM * 0.5 ? note.yFromBottom : RECEPTOR_BOTTOM
    const lEl = getLaneEl(note.lane)
    if (!lEl) return
    const ph = document.createElement('div')
    ph.style.cssText = `
      position:absolute;
      left:50%; bottom:${y}px;
      transform:translateX(-50%) scale(1); transform-origin:50% 50%;
      width:${NOTE_SIZE}px; height:${NOTE_SIZE}px;
      border-radius:50%; background:${noteColor};
      box-shadow:0 0 10px ${noteColor}55;
      opacity:0.88; pointer-events:none; z-index:20;
      transition:transform 100ms ease-out, opacity 100ms ease-out;
    `
    lEl.appendChild(ph)
    ph.getBoundingClientRect()
    ph.style.transform = 'translateX(-50%) scale(1.9)'
    ph.style.opacity   = '0'
    setTimeout(() => ph.remove(), 120)
  }, [getLaneEl, laneColors, NOTE_SIZE, RECEPTOR_BOTTOM])

  const releaseHold = useCallback(lane => {
    const s = stateRef.current
    if (s.paused) return
    const held = s.heldNotes[lane]; if (!held) return
    delete s.heldNotes[lane]  // clear immediately so double-calls are no-ops
    const { note, startMs, holdDurationMs } = held
    const nowMs = (audioRef.current ? audioRef.current.currentTime * 1000 : 0) - audioOffsetRef.current
    const frac = Math.min(1, (nowMs - startMs) / holdDurationMs)
    note.trailEl?.remove(); note.trailEl = null
    note.hit = true
    s.completedBeats.add(`${note.beat}-${note.lane}`)
    s.activeNotes = s.activeNotes.filter(n => !n.hit)
    s.combo++; s.totalHits++
    const laneEl = getLaneEl(lane)
    spawnPhantom(note)
    if (frac >= 0.99)     { s.score += 350 * 2 * s.multiplier; s.perfect++; s.health = Math.min(100, s.health + 5); showJudge('PERFECT', '#ffffff'); flashLane(laneEl) }
    else if (frac >= 0.67) { s.score += 200 * s.multiplier;    s.good++;    s.health = Math.min(100, s.health + 3); showJudge('GOOD', '#aaaaaa');    flashLane(laneEl) }
    else if (frac >= 0.33) { s.score += 150 * s.multiplier;    s.okay++;    s.health = Math.min(100, s.health + 1); showJudge('OKAY', '#aaaa44') }
    else                   { s.score += 100 * s.multiplier;    s.bad++;                                            showJudge('BAD', '#555555') }
    updateHud()
  }, [showJudge, updateHud, getLaneEl, flashLane, spawnPhantom])

  const hitNote = useCallback(lane => {
    const s = stateRef.current
    if (s.paused) return
    const audio = audioRef.current; if (!audio) return
    const nowMs = audio.currentTime * 1000 - audioOffsetRef.current
    const [wP, wG, wOk, wB] = config.mode3d ? [110, 140, 180, 231] : [45, 80, 115, 150]
    const BASE_RECEPTOR = 70
    const extraMs = Math.max(0, (RECEPTOR_BOTTOM - BASE_RECEPTOR) / (config.speed * 0.35))
    const wMiss = (config.mode3d ? 280 : 180) + extraMs

    let closest = null, minDist = Infinity
    for (const n of s.activeNotes) {
      if (n.lane !== lane || n.hit) continue
      const d = Math.abs(n.hitTimeMs - nowMs)
      if (d < minDist && d < wMiss) { minDist = d; closest = n }
    }
    if (!closest) return

    const laneEl = getLaneEl(lane)

    // Only miss on tap if the note has already passed (late tap outside BAD window)
    // Never miss for early taps — that causes false misses during jacks
    const signedOffsetCheck = nowMs - closest.hitTimeMs
    if (minDist >= wB) {
      if (signedOffsetCheck > 0) doMiss(closest)
      return
    }

    if (closest.holdDurationMs > 0) {
      s.heldNotes[lane] = { note: closest, startMs: nowMs, holdDurationMs: closest.holdDurationMs }
      spawnPhantom(closest)
      closest.el?.remove(); closest.el = null
      flashLane(laneEl)
      playHitSfx()
      return
    }

    const noteY = closest.yFromBottom ?? RECEPTOR_BOTTOM  // eslint-disable-line no-unused-vars
    closest.el?.remove(); closest.el = null
    closest.hit = true
    s.completedBeats.add(`${closest.beat}-${closest.lane}`)
    s.activeNotes = s.activeNotes.filter(n => !n.hit)
    s.combo++; s.totalHits++
    flashLane(laneEl)
    playHitSfx()

    let pts, text, color
    const signedOffset = nowMs - closest.hitTimeMs
    if (minDist < wP)        { pts = 350; text = 'PERFECT'; color = '#ffffff'; s.perfect++; s.hitOffsets.push(signedOffset) }
    else if (minDist < wG)  { pts = 200; text = 'GOOD';    color = '#aaaaaa'; s.good++;    s.hitOffsets.push(signedOffset) }
    else if (minDist < wOk) { pts = 150; text = 'OKAY';    color = '#aaaa44'; s.okay++;    s.hitOffsets.push(signedOffset) }
    else                    { pts = 100; text = 'BAD';     color = '#555555'; s.bad++;     s.hitOffsets.push(signedOffset) }

    // Explosion: note-clone expands and fades at the hit position
    spawnPhantom(closest)

    s.score += pts * s.multiplier
    s.health = Math.min(100, s.health + 3)
    updateHud(); showJudge(text, color)
  }, [showJudge, updateHud, getLaneEl, flashLane, playHitSfx, doMiss, spawnPhantom])

  // Resume countdown effect: 3 → 2 → 1 → null → actually resume
  useEffect(() => {
    if (resumeCountdown === null) return
    if (resumeCountdown > 1) {
      const t = setTimeout(() => setResumeCountdown(c => c - 1), 800)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => {
      setResumeCountdown(null)
      const s = stateRef.current
      s.paused = false
      setPaused(false)
      audioRef.current?.play().catch(() => {})
    }, 800)
    return () => clearTimeout(t)
  }, [resumeCountdown])

  const togglePause = useCallback(() => {
    const s = stateRef.current
    if (!s.paused) {
      // Check pause budget
      setPausesLeft(prev => {
        if (prev <= 0) return prev  // no pauses left — do nothing
        // Pause immediately
        s.paused = true; setPaused(true)
        audioRef.current?.pause()
        setResumeCountdown(null)
        return prev - 1
      })
    } else {
      // Unpause — kick off 3-2-1 countdown
      setResumeCountdown(3)
    }
  }, [])

  // Spacebar toggles pause during gameplay
  useEffect(() => {
    const pauseKey = config.pauseKey || ' '
    const handler = e => {
      const match = pauseKey === ' ' ? e.code === 'Space' : e.key === pauseKey
      if (!match || e.repeat) return
      if (!gameStartedRef.current) return
      e.preventDefault()
      togglePause()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [togglePause])

  useEffect(() => {
    // Set up audio — countdown effect will trigger play
    // crossOrigin must be set before src for CORS audio (catalog songs from Supabase)
    const url   = config.audioUrl || URL.createObjectURL(config.songFile)
    const audio = new Audio()
    if (config.audioUrl) audio.crossOrigin = 'anonymous'
    audio.src    = url
    audio.volume = config.musicVolume ?? 1.0
    audioRef.current = audio
    audio.onended = stopGame
    // Unlock audio playback on mobile: a silent play+pause during the
    // mount (which fires synchronously from the user-gesture that started
    // the game) keeps the gesture context alive so the delayed .play()
    // inside the countdown timer is allowed by the browser.
    // IMPORTANT: only reset currentTime=0 if the GO handler hasn't fired yet —
    // for streaming CORS audio the .then() can resolve *after* the GO handler
    // has already seeked to audioStartOffset and called play(), so we must not
    // overwrite that seek or pause the playback.
    audio.play().then(() => {
      audio.pause()
      if (!gameStartedRef.current) audio.currentTime = 0
    }).catch(() => {})
    connectAnalyser(audio)

    const subdivision = config.subdivision || 1
    const subdivMs    = (60000 / config.bpm) / subdivision
    const subdivSec   = subdivMs / 1000
    const s           = stateRef.current
    s.activeNotes = []; s.score = 0; s.combo = 0; s.health = 80
    s.completedBeats = new Set(); s.heldNotes = {}
    laneElsRef.current = stageRef.current?.querySelectorAll('.fnf-lane')
    const initSS = loadSettings()
    starSettingsRef.current = { color: initSS.starColor || '#ffffff', enabled: initSS.showStars !== false }

    const LOOKAHEAD_MS = 2200

    let progressThrottle = 0
    const loop = () => {
      if (!s.paused && gameStartedRef.current) {
        const nowSec    = audio.currentTime
        const nowMs     = nowSec * 1000 - audioOffsetRef.current
        const futureIdx = Math.floor((nowSec + LOOKAHEAD_MS / 1000) / subdivSec)
        const laneEls   = laneElsRef.current

        // ── Star field + beat-reactive glow ───────────────────────────────
        const canvas = starCanvasRef.current
        const starsEnabled = starSettingsRef.current.enabled
        if (canvas && starsEnabled) {
          const W = canvas.offsetWidth || canvas.width || 800
          const H = canvas.offsetHeight || canvas.height || 600
          // Reinit if size changed or not yet initialized
          if (!starsRef.current || starsRef.current._w !== W) {
            canvas.width  = W
            canvas.height = H
            const HIGHWAY_HALF = (90 * 4 + 8 * 3) / 2 + 90 // highway half + 90px margin
            const cx           = W / 2
            const leftEdge     = cx - HIGHWAY_HALF
            const rightStart   = cx + HIGHWAY_HALF
            const spawnStar = () => {
              const side = Math.random() < 0.5 ? 'left' : 'right'
              const x = side === 'left'
                ? Math.random() * Math.max(1, leftEdge - 10)
                : rightStart + 10 + Math.random() * Math.max(1, W - rightStart - 10)
              return {
                x, y: Math.random() * H,
                r:     0.4 + Math.random() * 1.0,
                dx:    (Math.random() - 0.5) * 0.12,
                dy:    (Math.random() - 0.5) * 0.08,
                base:  0.03 + Math.random() * 0.10,  // very dim at silence
                speed: 0.4 + Math.random() * 0.9,
                phase: Math.random() * Math.PI * 2,
              }
            }
            const stars = Array.from({ length: 55 }, spawnStar)
            stars._w          = W
            stars._leftEdge   = leftEdge
            stars._rightStart = rightStart
            stars._spawnStar  = spawnStar
            starsRef.current  = stars
          }

          const leftEdge   = starsRef.current._leftEdge
          const rightStart = starsRef.current._rightStart
          const spawn      = starsRef.current._spawnStar

          // Sample audio for beat intensity (onset detection — relative to running average)
          let beat = 0
          if (analyserRef.current) {
            if (!tDataRef.current || tDataRef.current.length !== analyserRef.current.fftSize)
              tDataRef.current = new Uint8Array(analyserRef.current.fftSize)
            const tData = tDataRef.current
            analyserRef.current.getByteTimeDomainData(tData)
            let sum = 0
            for (let i = 0; i < tData.length; i++) { const v = (tData[i]-128)/128; sum += v*v }
            const rms = Math.sqrt(sum / tData.length)
            // Build a slow-moving baseline (adapts over ~3s at 60fps)
            if (beatBaseRef.current === 0) beatBaseRef.current = Math.max(rms, 0.001)
            beatBaseRef.current = beatBaseRef.current * 0.997 + rms * 0.003
            const base = beatBaseRef.current
            // Onset = how much rms exceeds the long-term average
            // At constant volume: onset ≈ 0.33 (gentle glow)
            // On a loud transient: onset spikes to 1.0
            // In quiet sections: onset = 0 (stars go dark)
            const onset  = Math.max(0, (rms - base * 0.5) / Math.max(base * 1.5, 0.001))
            const target = Math.min(onset, 1)
            beatIntensityRef.current = target > beatIntensityRef.current
              ? beatIntensityRef.current * 0.4 + target * 0.6  // fast attack
              : beatIntensityRef.current * 0.82 + target * 0.18 // moderate decay
            beat = beatIntensityRef.current
          }

          const ctx2d = canvas.getContext('2d')
          ctx2d.clearRect(0, 0, canvas.width, canvas.height)
          const nowT = performance.now() / 1000
          const sc = starSettingsRef.current.color

          for (let i = 0; i < starsRef.current.length; i++) {
            const st = starsRef.current[i]
            st.x = (st.x + st.dx + canvas.width)  % canvas.width
            st.y = (st.y + st.dy + canvas.height) % canvas.height
            // Respawn any star that drifts into the highway zone
            if (st.x > leftEdge && st.x < rightStart) {
              starsRef.current[i] = spawn()
              continue
            }
            const twinkle  = 0.5 + 0.5 * Math.sin(nowT * st.speed + st.phase)
            const alpha    = Math.min(st.base * (0.5 + 0.5 * twinkle) + beat * 0.80, 0.95)
            const glowBlur = beat * 20 * twinkle  // NO glow without music
            const dotR     = st.r + beat * 2.5 * twinkle
            ctx2d.save()
            ctx2d.shadowColor = sc + Math.round(beat * 0.9 * 255).toString(16).padStart(2, '0')
            ctx2d.shadowBlur  = glowBlur
            ctx2d.globalAlpha = alpha
            ctx2d.fillStyle   = sc
            ctx2d.beginPath()
            ctx2d.arc(st.x, st.y, dotR, 0, Math.PI * 2)
            ctx2d.fill()
            ctx2d.restore()
          }
        } else if (canvas && !starsEnabled) {
          const ctx2d = canvas.getContext('2d')
          ctx2d.clearRect(0, 0, canvas.width, canvas.height)
          starsRef.current = null
        }

        // Spawn upcoming notes
        for (let b = 0; b <= Math.min(futureIdx, config.chart.length - 1); b++) {
          const row = config.chart[b]
          if (!row) continue  // guard against null/sparse rows from JSON round-trip
          for (let l = 0; l < 4; l++) {
            const key  = `${b}-${l}`
            const cell = row[l]
            // Skip notes that are before the preview start offset
            if (config.audioStartOffset && b * subdivMs < config.audioStartOffset * 1000) {
              if (!s.completedBeats.has(key)) s.completedBeats.add(key)
              continue
            }
            if (cell > 0 && !s.completedBeats.has(key) && !s.activeNotes.find(n => n.beat === b && n.lane === l)) {
              s.activeNotes.push({
                beat: b, lane: l,
                hitTimeMs:      b * subdivMs,
                holdDurationMs: cell > 1 ? (cell - 1) * subdivMs : 0,
                hit: false, el: null, trailEl: null, yFromBottom: 0,
              })
            }
          }
        }

        // Update notes
        for (const note of s.activeNotes) {
          if (note.hit) continue
          const timeToHitMs = note.hitTimeMs - nowMs
          const yFromBottom = RECEPTOR_BOTTOM + timeToHitMs * config.speed * 0.35
          note.yFromBottom  = yFromBottom
          const isBeingHeld = !!s.heldNotes[note.lane] && s.heldNotes[note.lane].note === note
          const noteColor   = laneColors[note.lane]

          // ── Note head ─────────────────────────────────────────────────────
          if (!isBeingHeld) {
            if (!note.el) {
              const el = document.createElement('div')
              el.className = 'fnf-note'
              el.style.cssText = `
                position:absolute;
                left:50%;
                transform:translateX(-50%);
                width:${NOTE_SIZE}px;
                height:${NOTE_SIZE}px;
                border-radius:50%;
                background:${noteColor};
                box-shadow:0 0 10px ${noteColor}55;
                pointer-events:none;
                z-index:3;
                opacity:0;
              `
              laneEls?.[note.lane]?.appendChild(el)
              requestAnimationFrame(() => {
                el.style.transition = 'opacity 0.15s ease-out'
                el.style.opacity = '1'
              })
              note.el = el
            }
            note.el.style.bottom = yFromBottom + 'px'
            const lateness = nowMs - note.hitTimeMs
            if (lateness > 0) {
              note.el.style.transition = 'none'
              note.el.style.opacity = Math.max(0, 1 - lateness / (config.mode3d ? 300 : 100)).toFixed(2)
            }
          } else {
            if (note.el) { note.el.remove(); note.el = null }
          }

          // ── Hold trail ────────────────────────────────────────────────────
          if (note.holdDurationMs > 0) {
            if (!note.trailEl) {
              const tr = document.createElement('div')
              tr.className = 'fnf-hold-trail'
              tr.style.cssText = `
                position:absolute;
                left:50%;
                transform:translateX(-50%);
                width:${NOTE_SIZE}px;
                border-radius:${NOTE_SIZE / 2}px;
                background:${noteColor}55;
                pointer-events:none;
                z-index:1;
              `
              laneEls?.[note.lane]?.appendChild(tr)
              note.trailEl = tr
            }
            if (isBeingHeld) {
              const held      = s.heldNotes[note.lane]
              const remaining = Math.max(0, held.holdDurationMs - (nowMs - held.startMs))
              const h         = Math.max(NOTE_SIZE, remaining * config.speed * 0.35)
              note.trailEl.style.bottom = RECEPTOR_BOTTOM + 'px'
              note.trailEl.style.height = h + 'px'
              if (remaining <= 0) {
                releaseHold(note.lane)
                if (config.autoplay) setReceptorPressed(p => { const n=[...p]; n[note.lane]=false; return n })
              }
            } else {
              const trailH = Math.max(NOTE_SIZE, note.holdDurationMs * config.speed * 0.35)
              note.trailEl.style.bottom = yFromBottom + 'px'
              note.trailEl.style.height = trailH + 'px'
            }
          }

          // ── Autoplay: auto-hit — check BEFORE miss so frame-rate gaps can't cause misses ──
          // Window: hit when note is due within 50ms (covers ~3 frames at 60fps) OR already past.
          if (config.autoplay && !note.hit && !isBeingHeld && note.hitTimeMs <= nowMs + 50) {
            const hitLane = note.lane
            flashLane(laneEls?.[hitLane])
            playHitSfx()
            if (note.holdDurationMs > 0) {
              s.heldNotes[hitLane] = { note, startMs: nowMs, holdDurationMs: note.holdDurationMs }
              if (note.el) { note.el.remove(); note.el = null }
              setReceptorPressed(p => { const n=[...p]; n[hitLane]=true; return n })
            } else {
              if (note.el) { note.el.remove(); note.el = null }
              note.hit = true
              s.completedBeats.add(`${note.beat}-${note.lane}`)
              s.activeNotes = s.activeNotes.filter(n => !n.hit)
              s.combo++; s.totalHits++; s.perfect++
              s.score += 350 * s.multiplier
              s.health = Math.min(100, s.health + 2)
              updateHud(); showJudge('PERFECT', '#ffffff')
              setReceptorPressed(p => { const n=[...p]; n[hitLane]=true; return n })
              setTimeout(() => setReceptorPressed(p => { const n=[...p]; n[hitLane]=false; return n }), 120)
            }
          }

          // Miss if scrolled below the fixed base floor OR past the extended BAD window (only for manual play)
          const BASE_RECEPTOR = 70
          const msLate = nowMs - note.hitTimeMs
          const extraMs = Math.max(0, (RECEPTOR_BOTTOM - BASE_RECEPTOR) / (config.speed * 0.35))
          const wBrAF = (config.mode3d ? 300 : 100) + extraMs
          if (!config.autoplay && !isBeingHeld && !note.hit && (yFromBottom < -(RECEPTOR_BOTTOM - BASE_RECEPTOR) - 30 || msLate > wBrAF)) doMiss(note)
        }

        s.activeNotes = s.activeNotes.filter(n => !n.hit)
      }
      if (++progressThrottle % 10 === 0)
        setAudioProgress({ current: audio.currentTime, duration: audio.duration || 0 })
      rafRef.current = requestAnimationFrame(loop)
    }
    setAudioProgress({ current: 0, duration: audio.duration || 0 })
    rafRef.current = requestAnimationFrame(loop)

    const onKey = e => {
      if (config.autoplay) return
      const lane = keybinds.indexOf(e.key); if (lane === -1) return
      e.preventDefault()
      if (e.type === 'keydown' && !e.repeat) {
        setReceptorPressed(p => { const n = [...p]; n[lane] = true; return n })
        hitNote(lane)
      }
      if (e.type === 'keyup') {
        setReceptorPressed(p => { const n = [...p]; n[lane] = false; return n })
        releaseHold(lane)
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)

    return () => {
      cancelAnimationFrame(rafRef.current)
      audio.onended = null; audio.pause()
      if (!config.audioUrl) URL.revokeObjectURL(url)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    }
  }, []) // eslint-disable-line

  const keyLabel = k => {
    if (k === ' ') return 'Spc'
    if (k === 'ArrowLeft') return '←'; if (k === 'ArrowRight') return '→'
    if (k === 'ArrowUp') return '↑'; if (k === 'ArrowDown') return '↓'
    return k.toUpperCase()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#141414' }}>
      <style>{`
        @keyframes judgeAnim {
          0%   { opacity:0; transform:translateX(-50%) scale(1.3) }
          15%  { opacity:1; transform:translateX(-50%) scale(1.0) }
          70%  { opacity:1; transform:translateX(-50%) scale(1.0) }
          100% { opacity:0; transform:translateX(-50%) scale(0.9) }
        }
        @keyframes comboPop {
          0%   { transform:scale(1) }
          50%  { transform:scale(1.3) }
          100% { transform:scale(1) }
        }
      `}</style>

      {/* Stage */}
      <div ref={stageRef} style={{ position: 'relative', flex: 1, overflow: 'hidden', background: '#080808' }}>

        {/* Top fade — softens notes entering the playfield instead of hard clipping */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 80, background: 'linear-gradient(to bottom, #080808 0%, transparent 100%)', pointerEvents: 'none', zIndex: 20 }} />

        {/* Star field background */}
        <canvas ref={starCanvasRef} style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          pointerEvents: 'none', zIndex: 0, opacity: 1,
        }} />

        {/* Highway */}
        {config.mode3d ? (
          // ── Guitar Hero 3D perspective highway ──────────────────────────
          <div style={{
            position: 'absolute', inset: 0,
            perspective: '700px',
            perspectiveOrigin: '50% 20%',
            overflow: 'hidden',
          }}>
            {/* Fretboard plane */}
            <div style={{
              position: 'absolute', bottom: 0, left: '50%',
              width: TOTAL_W,
              height: '280%',
              transform: 'translateX(-50%) rotateX(40deg)',
              transformOrigin: '50% 100%',
              transformStyle: 'preserve-3d',
              display: 'flex', gap: LANE_GAP,
              background: '#0a0a0a',
            }}>
              {/* Fret lines across all lanes */}
              {Array.from({ length: 24 }, (_, i) => (
                <div key={i} style={{
                  position: 'absolute', left: 0, right: 0,
                  bottom: `${(i + 1) * (100 / 24)}%`, height: 1,
                  background: '#ffffff0a', zIndex: 0, pointerEvents: 'none',
                }} />
              ))}
              {[0, 1, 2, 3].map(l => (
                <div key={l} className="fnf-lane" style={{
                  position: 'relative', width: LANE_W, flexShrink: 0, overflow: 'visible',
                  background: `${laneColors[l]}12`,
                  borderLeft:  `1px solid ${laneColors[l]}30`,
                  borderRight: `1px solid ${laneColors[l]}30`,
                }}
                  onTouchStart={e => { if (config.autoplay) return; e.preventDefault(); setReceptorPressed(p => { const n=[...p]; n[l]=true; return n }); hitNote(l) }}
                  onTouchEnd={e =>   { if (config.autoplay) return; e.preventDefault(); setReceptorPressed(p => { const n=[...p]; n[l]=false; return n }); releaseHold(l) }}
                >
                  {/* 3D Receptor: circle pad */}
                  <div style={{
                    position: 'absolute', bottom: RECEPTOR_BOTTOM, left: '50%',
                    transform: receptorPressed[l] ? 'translateX(-50%) scale(0.88)' : 'translateX(-50%) scale(1)',
                    width: NOTE_SIZE, height: NOTE_SIZE, borderRadius: '50%',
                    border: `2px solid ${receptorPressed[l] ? laneColors[l] : laneColors[l] + '55'}`,
                    background: receptorPressed[l] ? laneColors[l] + '40' : laneColors[l] + '10',
                    boxShadow: receptorPressed[l] ? `0 0 16px ${laneColors[l]}88` : 'none',
                    transition: 'all 0.04s', zIndex: 3, boxSizing: 'border-box',
                  }} />
                  {/* Lane glow strip at receptor */}
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0, height: RECEPTOR_BOTTOM + 20,
                    background: `linear-gradient(to top, ${laneColors[l]}18, transparent)`,
                    pointerEvents: 'none', zIndex: 0,
                  }} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          // ── Standard 2D highway ─────────────────────────────────────────
          <div style={{
            position: 'absolute', top: 0, bottom: 0,
            left: '50%',
            transform: config.scrollDown !== false ? 'translateX(-50%)' : 'translateX(-50%) scaleY(-1)',
            width: TOTAL_W, display: 'flex', gap: LANE_GAP,
          }}>
            {[0, 1, 2, 3].map(l => (
              <div key={l} className="fnf-lane" style={{
                position: 'relative', width: LANE_W, flexShrink: 0, overflow: 'visible',
                background: `${laneColors[l]}07`,
                borderLeft:  `1px solid ${laneColors[l]}1a`,
                borderRight: `1px solid ${laneColors[l]}1a`,
              }}
                onTouchStart={e => { if (config.autoplay) return; e.preventDefault(); setReceptorPressed(p => { const n=[...p]; n[l]=true; return n }); hitNote(l) }}
                onTouchEnd={e =>   { if (config.autoplay) return; e.preventDefault(); setReceptorPressed(p => { const n=[...p]; n[l]=false; return n }); releaseHold(l) }}
              >
                {/* Receptor */}
                <div style={{
                  position: 'absolute', bottom: RECEPTOR_BOTTOM, left: '50%',
                  transform: receptorPressed[l]
                    ? `translateX(-50%) scale(0.88)${config.scrollDown !== false ? '' : ' scaleY(-1)'}`
                    : `translateX(-50%) scale(1)${config.scrollDown !== false ? '' : ' scaleY(-1)'}`,
                  width: NOTE_SIZE, height: NOTE_SIZE, borderRadius: '50%',
                  border: `2px solid ${receptorPressed[l] ? laneColors[l] : laneColors[l] + '44'}`,
                  background: receptorPressed[l] ? laneColors[l] + '20' : 'transparent',
                  transition: 'all 0.04s', zIndex: 3, boxSizing: 'border-box',
                }} />
              </div>
            ))}
          </div>
        )}

        {/* HUD */}
        <div style={{ position: 'absolute', top: 12, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', padding: '0 20px', pointerEvents: 'none', zIndex: 10 }}>
          {/* Pause pips */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, justifyContent: 'center' }}>
            <div style={{ fontFamily: 'Arial', fontSize: 6, color: '#333', letterSpacing: 2 }}>PAUSE</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: i < pausesLeft ? '#ffffff55' : '#1a1a1a', border: '1px solid #2a2a2a', transition: 'background 0.2s' }} />
              ))}
            </div>
          </div>
          <div style={{ fontFamily: 'Arial', fontSize: 7, color: '#222', letterSpacing: 2, alignSelf: 'center' }}>{config.autoplay ? 'AUTOPLAY' : config.songTitle.toUpperCase()}</div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'Arial', fontSize: 6, color: '#3a3a3a', letterSpacing: 2, marginBottom: 2 }}>SCORE</div>
            <div style={{ fontFamily: 'Arial', fontSize: 14, color: '#fff', fontWeight: 'bold' }}>{hud.score.toLocaleString()}</div>
          </div>
        </div>

        {/* Combo ring — beside the highway, centered vertically in the play area */}
        {(() => {
          const ringSize  = 90
          const r         = 36
          const circ      = 2 * Math.PI * r
          const ringPct   = (hud.combo % 50) / 50
          const offset    = circ * (1 - ringPct)
          const mult      = hud.multiplier
          const ringColor = mult >= 5 ? '#cc44ff' : mult >= 4 ? '#ff4466' : mult >= 3 ? '#ff9933' : mult >= 2 ? '#ffd93d' : '#ffffff'
          return (
            <div style={{
              position: 'absolute',
              left: `calc(50% - ${TOTAL_W / 2 + ringSize + 18}px)`,
              top: '50%', transform: 'translateY(-50%)',
              pointerEvents: 'none', zIndex: 10,
            }}>
              <div style={{ position: 'relative', width: ringSize, height: ringSize, animation: comboFlash ? 'comboPop 0.12s ease-out' : 'none' }}>
                <svg width={ringSize} height={ringSize} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
                  <circle cx={ringSize/2} cy={ringSize/2} r={r} fill="none" stroke="#1a1a1a" strokeWidth="4" />
                  <circle cx={ringSize/2} cy={ringSize/2} r={r} fill="none" stroke={ringColor}
                    strokeWidth="4" strokeLinecap="round"
                    strokeDasharray={circ} strokeDashoffset={offset}
                    style={{ transition: 'stroke-dashoffset 0.08s linear, stroke 0.3s' }} />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                  <span style={{ fontFamily: 'Arial', fontSize: 22, color: ringColor, fontWeight: 'bold', lineHeight: 1 }}>{hud.combo}</span>
                  <span style={{ fontFamily: 'Arial', fontSize: 8, color: ringColor + 'aa', letterSpacing: 2, lineHeight: 1 }}>{mult > 1 ? `${mult}×` : 'COMBO'}</span>
                </div>
              </div>
            </div>
          )
        })()}

        {/* Song progress bar */}
        {audioProgress.duration > 0 && (() => {
          const pct = Math.min(1, audioProgress.current / audioProgress.duration)
          const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
          return (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 11 }}>
              <div style={{ height: 2, background: '#0d0d0d' }}>
                <div style={{ height: '100%', width: `${pct * 100}%`, background: pct >= 1 ? '#66ff99' : '#ffffff22', transition: 'width 0.25s linear, background 0.3s' }} />
              </div>
              <div style={{ position: 'absolute', top: 4, right: 10, display: 'flex', gap: 4, alignItems: 'baseline', pointerEvents: 'none' }}>
                <span style={{ fontFamily: 'Arial', fontSize: 9, color: '#fff', fontWeight: 'bold' }}>{fmt(audioProgress.current)}</span>
                <span style={{ fontFamily: 'Arial', fontSize: 7, color: '#333' }}>/ {fmt(audioProgress.duration)}</span>
              </div>
            </div>
          )
        })()}

        {/* Judgment text */}
        <div key={judgment.key} style={{
          position: 'absolute', left: '50%', top: '36%',
          fontFamily: 'Arial', fontSize: 11, letterSpacing: 4, fontWeight: 'bold',
          color: judgment.color, pointerEvents: 'none', zIndex: 10, whiteSpace: 'nowrap',
          animation: judgment.visible ? 'judgeAnim 0.5s ease-out forwards' : 'none', opacity: 0,
        }}>{judgment.text}</div>

        {/* Health bar */}
        <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', width: TOTAL_W, zIndex: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontFamily: 'Arial', fontSize: 6, color: '#2a2a2a', letterSpacing: 1 }}>HEALTH</span>
            <span style={{ fontFamily: 'Arial', fontSize: 6, color: hud.health > 50 ? '#66ff99' : hud.health > 25 ? '#ffd93d' : '#ff4466' }}>{hud.health}%</span>
          </div>
          <div style={{ height: 2, background: '#111', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${hud.health}%`, background: hud.health > 50 ? '#ffffff' : hud.health > 25 ? '#ffd93d' : '#ff4466', borderRadius: 999, transition: 'width 0.2s, background 0.4s' }} />
          </div>
        </div>

        {/* Countdown overlay */}
        <CountdownOverlay count={countdown} />

        {/* Pause overlay */}
        {paused && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.62)', zIndex: 40 }}>
            {resumeCountdown === null
              ? <div style={{ fontFamily: 'Arial', fontSize: 11, color: '#fff', letterSpacing: 6, fontWeight: 'bold' }}>PAUSED</div>
              : null}
          </div>
        )}
        {/* Resume countdown overlay (shown on top of pause overlay) */}
        {resumeCountdown !== null && <CountdownOverlay count={resumeCountdown} />}

        {/* Autoplay badge */}
        {config.autoplay && !paused && (
          <div style={{ position: 'absolute', top: 70, left: '50%', transform: 'translateX(-50%)', fontFamily: 'Arial', fontSize: 7, color: '#ffffff22', letterSpacing: 4, pointerEvents: 'none', zIndex: 10 }}>AUTOPLAY · NO SCORE</div>
        )}
      </div>

      {/* Control bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: isMobile ? '12px 16px' : '9px 16px', background: '#111', borderTop: '1px solid #1e1e1e', flexShrink: 0 }}>
        <CtrlBtn onClick={togglePause} disabled={!paused && pausesLeft <= 0} style={{ opacity: !paused && pausesLeft <= 0 ? 0.35 : 1 }}>{paused ? 'RESUME' : 'PAUSE'}</CtrlBtn>
        <CtrlBtn onClick={stopGame}>QUIT</CtrlBtn>
        {!isMobile && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
            {keybinds.map((k, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <span style={{ fontFamily: 'Arial', fontSize: 5, color: '#333', letterSpacing: 1 }}>{LANE_NAMES[i]}</span>
                <div style={{ width: 28, height: 28, borderRadius: '50%', border: `1.5px solid ${receptorPressed[i] ? laneColors[i] : '#333333'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: receptorPressed[i] ? laneColors[i] + '22' : 'transparent', transition: 'all 0.05s' }}>
                  <span style={{ fontFamily: 'Arial', fontSize: 7, color: receptorPressed[i] ? laneColors[i] : '#444' }}>{keyLabel(k)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CtrlBtn({ onClick, children }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ fontFamily: 'Arial', fontSize: 7, letterSpacing: 2, padding: '6px 13px', borderRadius: 5, border: '1px solid #333', background: hov ? '#222' : 'transparent', color: hov ? '#fff' : '#666', transition: 'all 0.12s', cursor: 'pointer' }}>
      {children}
    </button>
  )
}

// ─── Results ──────────────────────────────────────────────────────────────────
function Results({ stats, onExit, onPlayAgain }) {
  const [fadeOut, setFadeOut] = useState(false)
  const handleExit      = () => { setFadeOut(true); setTimeout(onExit, 380) }
  const handlePlayAgain = () => { setFadeOut(true); setTimeout(onPlayAgain, 380) }

  const grade      = stats.grade || calcGrade(stats.accuracy)
  const gradeColor = GRADE_COLORS[grade] || '#888'
  const total      = Math.max(stats.totalHits, 1)

  const pbKey     = `kronox-pb-${stats.songTitle}`
  const savedPb   = parseInt(localStorage.getItem(pbKey) || '0', 10)
  const isNewBest = !stats.autoplay && stats.score > savedPb
  useEffect(() => {
    if (isNewBest) localStorage.setItem(pbKey, String(stats.score))
  }, []) // eslint-disable-line

  const judgments = [
    { label: 'PERFECT', value: stats.perfect, pct: ((stats.perfect / total) * 100).toFixed(0), color: '#ffffff' },
    { label: 'GOOD',    value: stats.good,    pct: ((stats.good    / total) * 100).toFixed(0), color: '#aaaaaa' },
    { label: 'BAD',     value: stats.bad,     pct: ((stats.bad     / total) * 100).toFixed(0), color: '#555555' },
    { label: 'MISS',    value: stats.miss,    pct: ((stats.miss    / total) * 100).toFixed(0), color: '#ff6666' },
  ]

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#0a0a0a',
      display: 'flex', flexDirection: 'column',
      opacity: fadeOut ? 0 : 1, transition: 'opacity 0.38s',
      overflow: 'auto', fontFamily: 'Arial, sans-serif',
      zIndex: 700,
    }}>
      <style>{`
        @keyframes slideUp { from { transform:translateY(20px);opacity:0 } to { transform:translateY(0);opacity:1 } }
        @keyframes gradeIn { 0% { transform:scale(2.2);opacity:0 } 60% { transform:scale(0.92);opacity:1 } 100% { transform:scale(1);opacity:1 } }
      `}</style>

      {/* Top: grade + title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: window.innerWidth < 600 ? 16 : 36, padding: window.innerWidth < 600 ? '24px 20px 20px' : '40px 52px 28px', borderBottom: '1px solid #141414', flexWrap: 'wrap' }}>
        <div style={{
          width: 112, height: 112, borderRadius: 18, flexShrink: 0,
          border: `2px solid ${gradeColor}33`, background: `${gradeColor}0d`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'gradeIn 0.5s cubic-bezier(0.22,1,0.36,1) forwards',
        }}>
          <span style={{ fontFamily: 'Arial', fontSize: 62, fontWeight: 'bold', color: gradeColor, lineHeight: 1 }}>{grade}</span>
        </div>

        <div style={{ animation: 'slideUp 0.4s ease-out 0.08s both' }}>
          <div style={{ fontSize: 7, letterSpacing: 3, color: '#333', marginBottom: 8 }}>SONG COMPLETE</div>
          <div style={{ fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 10 }}>{stats.songTitle}</div>
          <div style={{ display: 'flex', gap: 28 }}>
            <ResultStat label="SCORE"    value={stats.score.toLocaleString()} color="#fff" />
            <ResultStat label="ACCURACY" value={`${stats.accuracy}%`}         color={gradeColor} />
          </div>
        </div>
      </div>

      {/* Judgment breakdown */}
      <div style={{ padding: window.innerWidth < 600 ? '20px 20px' : '24px 52px', display: 'flex', flexDirection: 'column', gap: 11, animation: 'slideUp 0.4s ease-out 0.16s both' }}>
        <div style={{ fontSize: 7, letterSpacing: 3, color: '#333', marginBottom: 2 }}>BREAKDOWN</div>
        {judgments.map(j => (
          <div key={j.label} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontFamily: 'Arial', fontSize: 8, letterSpacing: 2, color: j.color, width: 54 }}>{j.label}</span>
            <div style={{ flex: 1, height: 4, background: '#181818', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${j.pct}%`, background: j.color, borderRadius: 2, transition: 'width 0.7s ease-out' }} />
            </div>
            <span style={{ fontFamily: 'Arial', fontSize: 13, fontWeight: 'bold', color: j.color, width: 36, textAlign: 'right' }}>{j.value}</span>
            <span style={{ fontFamily: 'Arial', fontSize: 9, color: '#333', width: 34, textAlign: 'right' }}>{j.pct}%</span>
          </div>
        ))}
      </div>

      {/* Secondary stats */}
      <div style={{ padding: window.innerWidth < 600 ? '0 20px 20px' : '0 52px 28px', display: 'flex', gap: 10, flexWrap: 'wrap', animation: 'slideUp 0.4s ease-out 0.24s both' }}>
        {[
          { label: 'TOTAL HITS', value: stats.totalHits },
          { label: 'DURATION',   value: `${Math.floor(stats.duration)}s` },
          { label: 'NOTES/SEC',  value: (stats.totalHits / Math.max(stats.duration, 1)).toFixed(1) },
          { label: 'HIT RATE',   value: `${((stats.totalHits / Math.max(stats.totalHits + stats.miss, 1)) * 100).toFixed(0)}%` },
        ].map(s => (
          <div key={s.label} style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 6, padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontFamily: 'Arial', fontSize: 7, color: '#333', letterSpacing: 2 }}>{s.label}</span>
            <span style={{ fontFamily: 'Arial', fontSize: 18, fontWeight: 'bold', color: '#666' }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Buttons */}
      {/* Early/late timing graph */}
      {stats.hitOffsets && stats.hitOffsets.length > 0 && (
        <div style={{ padding: window.innerWidth < 600 ? '0 20px 20px' : '0 52px 24px', animation: 'slideUp 0.4s ease-out 0.28s both' }}>
          <div style={{ fontSize: 7, letterSpacing: 3, color: '#333', marginBottom: 10 }}>HIT TIMING</div>
          <div style={{ position: 'relative', height: 72, background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 6, overflow: 'hidden' }}>
            {(() => {
              const offsets = stats.hitOffsets
              const W = 1000, H = 72, MID = H / 2, SCALE = (H / 2 - 4) / 150
              const dots = offsets.map((o, i) => {
                const x = offsets.length === 1 ? W / 2 : (i / (offsets.length - 1)) * W
                const y = MID - Math.max(-150, Math.min(150, o)) * SCALE
                const col = Math.abs(o) < 15 ? '#ffffff' : o > 0 ? '#ff6666' : '#6699ff'
                return <circle key={i} cx={x} cy={y} r={2.5} fill={col} fillOpacity={0.75} />
              })
              const avg = offsets.reduce((a, b) => a + b, 0) / offsets.length
              const avgY = MID - Math.max(-150, Math.min(150, avg)) * SCALE
              return (
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
                  {/* zero line */}
                  <line x1={0} y1={MID} x2={W} y2={MID} stroke="#222" strokeWidth={1} />
                  {/* avg line */}
                  <line x1={0} y1={avgY} x2={W} y2={avgY} stroke={avg > 0 ? '#ff4466' : '#4488ff'} strokeWidth={1} strokeDasharray="6 4" opacity={0.5} />
                  {dots}
                </svg>
              )
            })()}
            <div style={{ position: 'absolute', top: 3, right: 8, fontFamily: 'Arial', fontSize: 8, color: '#333' }}>
              avg {(stats.hitOffsets.reduce((a, b) => a + b, 0) / stats.hitOffsets.length).toFixed(1)}ms
            </div>
            <div style={{ position: 'absolute', top: 3, left: 8, fontFamily: 'Arial', fontSize: 7, color: '#6699ff' }}>EARLY</div>
            <div style={{ position: 'absolute', bottom: 3, left: 8, fontFamily: 'Arial', fontSize: 7, color: '#ff6666' }}>LATE</div>
          </div>
        </div>
      )}

      {/* Early/late timing graph */}
      {stats.hitOffsets && stats.hitOffsets.length > 0 && (
        <div style={{ padding: window.innerWidth < 600 ? '0 20px 20px' : '0 52px 24px', animation: 'slideUp 0.4s ease-out 0.28s both' }}>
          <div style={{ fontSize: 7, letterSpacing: 3, color: '#333', marginBottom: 10 }}>HIT TIMING</div>
          <div style={{ position: 'relative', height: 72, background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 6, overflow: 'hidden' }}>
            {(() => {
              const offsets = stats.hitOffsets
              const W = 1000, H = 72, MID = H / 2, SCALE = (H / 2 - 4) / 150
              const avg = offsets.reduce((a, b) => a + b, 0) / offsets.length
              const avgY = MID - Math.max(-150, Math.min(150, avg)) * SCALE
              const dots = offsets.map((o, i) => {
                const x = offsets.length === 1 ? W / 2 : (i / (offsets.length - 1)) * W
                const y = MID - Math.max(-150, Math.min(150, o)) * SCALE
                const col = Math.abs(o) < 15 ? '#ffffff' : o < 0 ? '#6699ff' : '#ff6666'
                return <circle key={i} cx={x} cy={y} r={2.5} fill={col} fillOpacity={0.75} />
              })
              return (
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
                  <line x1={0} y1={MID} x2={W} y2={MID} stroke="#222" strokeWidth={1} />
                  <line x1={0} y1={avgY} x2={W} y2={avgY} stroke={avg > 0 ? '#ff4466' : '#4488ff'} strokeWidth={1} strokeDasharray="6 4" opacity={0.5} />
                  {dots}
                </svg>
              )
            })()}
            <div style={{ position: 'absolute', top: 3, right: 8, fontFamily: 'Arial', fontSize: 8, color: '#333' }}>
              avg {(stats.hitOffsets.reduce((a, b) => a + b, 0) / stats.hitOffsets.length).toFixed(1)}ms
            </div>
            <div style={{ position: 'absolute', top: 3, left: 8, fontFamily: 'Arial', fontSize: 7, color: '#6699ff' }}>EARLY</div>
            <div style={{ position: 'absolute', bottom: 3, left: 8, fontFamily: 'Arial', fontSize: 7, color: '#ff6666' }}>LATE</div>
          </div>
        </div>
      )}

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 10, padding: window.innerWidth < 600 ? '0 20px' : '0 52px', marginTop: 'auto', paddingBottom: 40, animation: 'slideUp 0.4s ease-out 0.3s both' }}>
        <button onClick={handlePlayAgain}
          style={{ flex: 1, padding: '13px 0', borderRadius: 6, border: `1px solid ${gradeColor}33`, background: `${gradeColor}0d`, fontSize: 11, letterSpacing: 2, fontWeight: 'bold', color: gradeColor, cursor: 'pointer', transition: 'all 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.background = gradeColor + '1a' }}
          onMouseLeave={e => { e.currentTarget.style.background = gradeColor + '0d' }}>
          ↺  PLAY AGAIN
        </button>
        <button onClick={handleExit}
          style={{ flex: 1, padding: '13px 0', borderRadius: 6, border: '1px solid #222', background: '#141414', fontSize: 11, letterSpacing: 2, fontWeight: 'bold', color: '#fff', cursor: 'pointer', transition: 'all 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#1e1e1e'; e.currentTarget.style.borderColor = '#333' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#141414'; e.currentTarget.style.borderColor = '#222' }}>
          BACK TO MENU
        </button>
      </div>
    </div>
  )
}

function ResultStat({ label, value, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontFamily: 'Arial', fontSize: 7, letterSpacing: 2, color: '#444' }}>{label}</span>
      <span style={{ fontFamily: 'Arial', fontSize: 26, fontWeight: 'bold', color: color || '#fff', lineHeight: 1 }}>{value}</span>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function FieldLabel({ children }) {
  return <span style={{ fontFamily: 'Arial', fontSize: 7, color: '#555', letterSpacing: 3 }}>{children}</span>
}
function SliderField({ label, value, min, max, step, display, onChange }) {
  const pct = ((value - min) / (max - min)) * 100
  const cls = 'sf-' + label.replace(/[^a-z0-9]/gi, '')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <style>{`
        .${cls} { -webkit-appearance:none; appearance:none; width:100%; height:3px; border-radius:2px; outline:none; cursor:pointer;
          background: linear-gradient(to right, #555 0%, #555 ${pct}%, #1e1e1e ${pct}%, #1e1e1e 100%); }
        .${cls}::-webkit-slider-thumb { -webkit-appearance:none; width:13px; height:13px; border-radius:50%; background:#888; border:none; cursor:pointer; transition:background 0.12s; }
        .${cls}::-webkit-slider-thumb:hover { background:#fff; }
        .${cls}::-moz-range-thumb { width:13px; height:13px; border-radius:50%; background:#888; border:none; cursor:pointer; }
        .${cls}::-moz-range-thumb:hover { background:#fff; }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: 'Arial', fontSize: 7, color: '#444', letterSpacing: 3 }}>{label}</span>
        <span style={{ fontFamily: 'Arial', fontSize: 19, color: '#888', fontWeight: 'bold' }}>{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        className={cls}
        onChange={e => onChange(Number(e.target.value))} />
    </div>
  )
}
function SmallBtn({ onClick, children, color = '#555' }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ fontFamily: 'Arial', fontSize: 7, padding: '5px 11px', borderRadius: 5, background: hov ? color + '22' : 'transparent', border: `1px solid ${hov ? color : color + '66'}`, color: hov ? color : color + '99', letterSpacing: 2, transition: 'all 0.12s', cursor: 'pointer' }}>
      {children}
    </button>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen,          setScreen]         = useState('setup')   // setup | game | results | catalog
  const [gameConfig,      setGameConfig]      = useState(null)
  const [gameStats,       setGameStats]       = useState(null)
  const [importedChart,   setImportedChart]   = useState(null)
  const [setupKey,        setSetupKey]        = useState(0)
  const [showSettings,    setShowSettings]    = useState(false)
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [showPublish,     setShowPublish]     = useState(false)
  const [publishConfig,   setPublishConfig]   = useState(null)
  const [showHistory,     setShowHistory]     = useState(false)
  const [showCalibrate,   setShowCalibrate]   = useState(false)

  const saved = loadSettings()
  const [keybinds,    setKeybinds]    = useState(saved.keybinds?.length === 4 ? saved.keybinds : [...DEFAULT_LANE_KEYS])
  const [laneColors,  setLaneColors]  = useState(Array.isArray(saved.laneColors) && saved.laneColors.length === 4 ? saved.laneColors : [...LANE_COLORS])
  const [sfxVolume,   setSfxVolume]   = useState(saved.sfxVolume   ?? 0.7)
  const [musicVolume, setMusicVolume] = useState(saved.musicVolume ?? 1.0)
  const [showStars,    setShowStars]    = useState(saved.showStars   !== false)
  const [scrollDown,   setScrollDown]   = useState(saved.scrollDown  !== false)
  const [starColor,    setStarColor]    = useState(saved.starColor    || '#ffffff')
  const [flashOpacity, setFlashOpacity] = useState(saved.flashOpacity ?? 0.13)
  const [flashColor,   setFlashColor]   = useState(saved.flashColor   || '#ffffff')
  const [pauseKey,     setPauseKey]     = useState(saved.pauseKey     || ' ')
  const [receptorHeight, setReceptorHeight] = useState(saved.receptorHeight ?? 70)

  const handleSettingsChange = patch => {
    const next = { ...loadSettings(), ...patch }
    if (patch.keybinds)       setKeybinds(patch.keybinds)
    if (patch.laneColors)     setLaneColors(patch.laneColors)
    if (patch.sfxVolume      !== undefined) setSfxVolume(patch.sfxVolume)
    if (patch.musicVolume    !== undefined) setMusicVolume(patch.musicVolume)
    if (patch.showStars      !== undefined) setShowStars(patch.showStars)
    if (patch.scrollDown     !== undefined) setScrollDown(patch.scrollDown)
    if (patch.starColor      !== undefined) setStarColor(patch.starColor)
    if (patch.flashOpacity   !== undefined) setFlashOpacity(patch.flashOpacity)
    if (patch.flashColor     !== undefined) setFlashColor(patch.flashColor)
    if (patch.pauseKey       !== undefined) setPauseKey(patch.pauseKey)
    if (patch.receptorHeight !== undefined) setReceptorHeight(patch.receptorHeight)
    localStorage.setItem('kronox-settings', JSON.stringify(next))
  }

  const handleGameStop = (status, stats) => {
    if (status === 'preview' || gameConfig?.previewDuration) { setScreen('catalog'); return }
    if (status === 'complete') {
      const grade = calcGrade(stats.accuracy)
      if (!gameConfig?.autoplay) {
        addPlayerGameResult(GUEST_ID, { ...stats, grade })
        saveHistoryEntry({ songTitle: stats.songTitle, grade, score: stats.score, accuracy: stats.accuracy, date: new Date().toLocaleDateString(), perfect: stats.perfect, good: stats.good, bad: stats.bad, miss: stats.miss })
      }
      setGameStats({ ...stats, grade, autoplay: gameConfig?.autoplay })
      setScreen('results')
    } else {
      setScreen('setup')
    }
  }

  const handlePreviewFromCatalog = (song) => {
    const offset = song.duration ? Math.max(0, song.duration / 2 - 7.5) : 10
    const us = loadSettings()
    setGameConfig({
      audioUrl:    song.audioUrl,
      songTitle:   song.title,
      bpm:         song.bpm,
      subdivision: song.subdivision,
      speed:       us.speed || 2.0,
      chart:       song.chart,
      keybinds, laneColors, sfxVolume, musicVolume, pauseKey, receptorHeight,
      autoplay:    true,
      scrollDown,
      mode3d:      us.mode3d || false,
      audioStartOffset: offset,
      previewDuration:  15000,
    })
    setScreen('game')
  }

  const handlePlayFromCatalog = (song, autoplay = false) => {
    // Increment play count (best-effort, non-blocking)
    import('./supabase.js').then(({ incrementPlays }) => incrementPlays(song.id)).catch(() => {})
    const us = loadSettings()
    setGameConfig({
      audioUrl:    song.audioUrl,
      songTitle:   song.title,
      bpm:         song.bpm,
      subdivision: song.subdivision,
      speed:       us.speed || 2.0,
      chart:       song.chart,
      keybinds, laneColors, sfxVolume, musicVolume, pauseKey, receptorHeight,
      autoplay,
      scrollDown,
      mode3d:      us.mode3d || false,
    })
    setScreen('game')
  }

  const handleEditFromCatalog = (song) => {
    const sub = song.subdivision || 1
    setImportedChart({
      title:       song.title,
      bpm:         song.bpm,
      subdivision: sub,
      beats:       Math.round((song.chart?.length || DEFAULT_BEATS) / sub),
      chart:       song.chart,
    })
    setSetupKey(k => k + 1)
    setScreen('setup')
  }

  // Emit music active/inactive when navigating to/from game or non-music screens
  useEffect(() => {
    if (screen === 'game') emitMusic(true)
    else if (screen === 'setup' || screen === 'results') emitMusic(false)
    // 'catalog' manages its own via ambient audio ref
  }, [screen])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#0a0a0a', overflow: 'hidden' }}>
      <StarMap starColor={starColor} enabled={showStars} />
      {screen !== 'catalog' && (
        <TitleBar
          onToggleSettings={() => setShowSettings(s => !s)}
          settingsOpen={showSettings}
          onOpenCatalog={() => setScreen('catalog')}
          onOpenLeaderboard={() => setShowLeaderboard(true)}
          onOpenHistory={() => setShowHistory(true)}
          onOpenCalibrate={() => setShowCalibrate(true)}
        />
      )}

      <style>{`@keyframes screenIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }`}</style>
      <div key={screen} style={{ flex: 1, overflow: 'hidden', animation: 'screenIn 0.18s ease-out' }}>
        {screen === 'setup' && (
          <SetupPanel
            key={setupKey}
            initialChart={importedChart}
            keybinds={keybinds}
            laneColors={laneColors}
            musicVolume={musicVolume}
            sfxVolume={sfxVolume}
            onStart={cfg => { setGameConfig({ ...cfg, keybinds, laneColors, sfxVolume, musicVolume, scrollDown, pauseKey, receptorHeight }); setScreen('game') }}
            onOpenPublish={cfg => { setPublishConfig(cfg); setShowPublish(true) }}
          />
        )}
        {screen === 'game' && gameConfig && (
          <GameView config={gameConfig} onStop={handleGameStop} />
        )}
        {screen === 'results' && gameStats && (
          <Results
            stats={gameStats}
            onExit={() => { setScreen('setup'); setGameStats(null) }}
            onPlayAgain={() => { setGameStats(null); setScreen('game') }}
          />
        )}
        {screen === 'catalog' && (
          <CatalogPanel
            onBack={() => setScreen('setup')}
            onPlay={handlePlayFromCatalog}
            onPreview={handlePreviewFromCatalog}
            onEdit={handleEditFromCatalog}
            musicVolume={musicVolume}
          />
        )}
      </div>

      <SettingsPanel
        open={showSettings}
        keybinds={keybinds}
        pauseKey={pauseKey}
        receptorHeight={receptorHeight}
        laneColors={laneColors}
        sfxVolume={sfxVolume}
        musicVolume={musicVolume}
        showStars={showStars}
        scrollDown={scrollDown}
        starColor={starColor}
        flashOpacity={flashOpacity}
        flashColor={flashColor}
        onChange={handleSettingsChange}
        onClose={() => setShowSettings(false)}
      />
      {showLeaderboard && <LeaderboardModal onClose={() => setShowLeaderboard(false)} />}
      {showHistory     && <HistoryModal    onClose={() => setShowHistory(false)} />}
      {showCalibrate   && <CalibrationModal onClose={() => setShowCalibrate(false)} sfxVolume={sfxVolume} />}
      {showPublish && publishConfig && (
        <PublishModal config={publishConfig} onClose={() => { setShowPublish(false); setPublishConfig(null) }} />
      )}
    </div>
  )
}
