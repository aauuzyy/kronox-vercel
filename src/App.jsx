import { useState, useEffect, useRef, useCallback } from 'react'

const DEFAULT_LANE_KEYS = ['a', 's', ';', "'"]
const LANE_NAMES        = ['LEFT', 'DOWN', 'UP', 'RIGHT']
const LANE_COLORS       = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff']
const DEFAULT_BEATS     = 32

function loadSettings() {
  try { return JSON.parse(localStorage.getItem('kronox-settings') || '{}') } catch { return {} }
}
function buildChart(beats) {
  return Array.from({ length: beats }, () => [0, 0, 0, 0])
}

// ─── TitleBar ────────────────────────────────────────────────────────────────
function TitleBar({ onOpenSettings }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      height: 36, padding: '0 16px', background: '#111111',
      borderBottom: '1px solid #1e1e1e', flexShrink: 0,
      userSelect: 'none',
    }}>
      <span style={{ fontFamily: 'Arial', fontSize: 8, color: '#ffffff', letterSpacing: 4 }}>KRONOX</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onOpenSettings}
          style={{ fontFamily: 'Arial', fontSize: 7, letterSpacing: 2, padding: '4px 10px', background: 'transparent', border: '1px solid #2a2a2a', color: '#555', borderRadius: 4 }}
          onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#444' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#555'; e.currentTarget.style.borderColor = '#2a2a2a' }}>
          SETTINGS
        </button>
      </div>
    </div>
  )
}

// ─── Settings Modal ───────────────────────────────────────────────────────────
function SettingsModal({ keybinds, onSave, onClose }) {
  const [keys, setKeys]           = useState([...keybinds])
  const [listening, setListening] = useState(null)
  const [conflict, setConflict]   = useState(null)

  useEffect(() => {
    if (listening === null) return
    const handler = e => {
      e.preventDefault()
      const ci = keys.findIndex((k, i) => k === e.key && i !== listening)
      if (ci !== -1) { setConflict(ci); setTimeout(() => setConflict(null), 1200); return }
      setKeys(prev => { const n = [...prev]; n[listening] = e.key; return n })
      setListening(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [listening, keys])

  const label = k => {
    if (k === ' ') return 'Space'
    if (k === 'ArrowLeft') return '←'
    if (k === 'ArrowRight') return '→'
    if (k === 'ArrowUp') return '↑'
    if (k === 'ArrowDown') return '↓'
    return k.toUpperCase()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#181818', border: '1px solid #2a2a2a', borderRadius: 8, padding: '28px 32px', minWidth: 340, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'Arial', fontSize: 11, color: '#fff', fontWeight: 'bold', letterSpacing: 3 }}>SETTINGS</span>
          <button onClick={onClose} style={{ fontFamily: 'Arial', fontSize: 10, color: '#555' }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ fontFamily: 'Arial', fontSize: 7, color: '#555', letterSpacing: 3 }}>KEY BINDINGS</span>
          {LANE_NAMES.map((name, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: conflict === i ? '#ff4444' : LANE_COLORS[i], flexShrink: 0, transition: 'background 0.2s' }} />
                <span style={{ fontFamily: 'Arial', fontSize: 11, color: conflict === i ? '#ff8888' : '#aaa' }}>{name}</span>
              </div>
              <button onClick={() => setListening(listening === i ? null : i)}
                style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 'bold', minWidth: 56, padding: '6px 12px', borderRadius: 5, background: listening === i ? 'rgba(255,255,255,0.12)' : '#111', border: `1.5px solid ${listening === i ? '#fff' : '#333'}`, color: listening === i ? '#fff' : '#ccc', animation: listening === i ? 'pulse 0.9s ease-in-out infinite' : 'none' }}>
                {listening === i ? '...' : label(keys[i])}
              </button>
            </div>
          ))}
          {conflict !== null && <div style={{ fontFamily: 'Arial', fontSize: 9, color: '#ff6666', letterSpacing: 1 }}>That key is already bound to {LANE_NAMES[conflict]}</div>}
          {listening !== null && <div style={{ fontFamily: 'Arial', fontSize: 9, color: '#888', letterSpacing: 1 }}>Press any key to bind to {LANE_NAMES[listening]}</div>}
        </div>
        <style>{`@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(255,255,255,0.3)}50%{box-shadow:0 0 0 5px rgba(255,255,255,0)}}`}</style>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={() => { setKeys([...DEFAULT_LANE_KEYS]); setListening(null) }}
            style={{ fontFamily: 'Arial', fontSize: 8, letterSpacing: 2, padding: '7px 14px', borderRadius: 5, background: 'transparent', border: '1px solid #333', color: '#555' }}>RESET</button>
          <button onClick={() => onSave(keys)}
            style={{ fontFamily: 'Arial', fontSize: 8, letterSpacing: 2, padding: '7px 14px', borderRadius: 5, background: '#fff', border: 'none', color: '#111', fontWeight: 'bold' }}>SAVE</button>
        </div>
      </div>
    </div>
  )
}

// ─── SetupPanel ───────────────────────────────────────────────────────────────
function SetupPanel({ onStart, keybinds }) {
  const [songFile, setSongFile]     = useState(null)
  const [previewPos, setPreviewPos] = useState(0)
  const [isPlaying, setIsPlaying]   = useState(false)
  const audioRef = useRef(null)

  const saved = loadSettings()
  const [songTitle,   setSongTitle]   = useState(saved.songTitle   || 'My Song')
  const [speed,       setSpeed]       = useState(saved.speed       || 2.0)
  const [bpm,         setBpm]         = useState(saved.bpm         || 120)
  const [beats,       setBeats]       = useState(saved.beats       || DEFAULT_BEATS)
  const [subdivision, setSubdivision] = useState(saved.subdivision || 1)
  const [chart, setChart] = useState(
    saved.chart && Array.isArray(saved.chart)
      ? saved.chart
      : buildChart((saved.beats || DEFAULT_BEATS) * (saved.subdivision || 1))
  )
  const [activeTab, setActiveTab] = useState('chart')
  const [holdMode,  setHoldMode]  = useState(false)
  const [holdStart, setHoldStart] = useState(null)

  const saveSettings = useCallback((overrides = {}) => {
    localStorage.setItem('kronox-settings', JSON.stringify({
      songTitle, speed, bpm, beats, subdivision, chart,
      audioFileName: saved.audioFileName, ...overrides
    }))
  }, [songTitle, speed, bpm, beats, subdivision, chart, saved.audioFileName])

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
  }, [])

  const setupAudio = file => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = '' }
    const url = URL.createObjectURL(file)
    const audio = new Audio(url)
    audio.addEventListener('timeupdate', () => setPreviewPos(audio.currentTime))
    audio.addEventListener('play',  () => setIsPlaying(true))
    audio.addEventListener('pause', () => setIsPlaying(false))
    audio.addEventListener('ended', () => setIsPlaying(false))
    audioRef.current = audio
  }

  useEffect(() => {
    const newSize = beats * subdivision
    setChart(prev => prev.length < newSize
      ? [...prev, ...buildChart(newSize - prev.length)]
      : prev.slice(0, newSize))
  }, [beats, subdivision])

  const toggleCell = (b, l) => {
    if (!holdMode) {
      setChart(prev => { const n = prev.map(r => [...r]); n[b][l] = n[b][l] ? 0 : 1; saveSettings({ chart: n }); return n })
    } else { setHoldStart({ b, l }) }
  }

  const endHold = bEnd => {
    if (!holdStart) return
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
    const c = chart.map((row, idx) => idx < 10 ? [0, 0, 0, 0] : row.map(() => Math.random() > 0.78 ? 1 : 0))
    setChart(c); saveSettings({ chart: c })
  }
  const clearChart = () => { const c = buildChart(beats * subdivision); setChart(c); saveSettings({ chart: c }) }

  const handleFile = e => {
    const f = e.target.files[0]; if (!f) return
    setSongFile(f); setupAudio(f)
    const newTitle = f.name.replace(/\.[^.]+$/, ''); setSongTitle(newTitle)
    const req = indexedDB.open('kronox', 1)
    req.onupgradeneeded = ev => { const db = ev.target.result; if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio') }
    req.onsuccess = ev => { ev.target.result.transaction('audio', 'readwrite').objectStore('audio').put(f, 'song') }
    const tmp = new Audio(URL.createObjectURL(f))
    tmp.addEventListener('loadedmetadata', () => {
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

  // ── Record mode ──────────────────────────────────────────────────────────
  const HOLD_THRESHOLD_MS = 200
  const [isRecording, setIsRecording] = useState(false)
  const recordChartRef   = useRef(null)
  const [recordChart, setRecordChart] = useState(null)
  const recordKeyDownRef = useRef({})

  const startRecording = () => {
    if (!songFile || !audioRef.current) return
    audioRef.current.currentTime = 0
    recordChartRef.current = buildChart(beats * subdivision)
    recordKeyDownRef.current = {}
    setRecordChart(null); setIsRecording(true)
    audioRef.current.play().catch(() => {})
  }
  const stopRecording = useCallback(() => {
    setIsRecording(false); audioRef.current?.pause()
    if (recordChartRef.current) setRecordChart(recordChartRef.current)
    recordKeyDownRef.current = {}
  }, [])

  useEffect(() => {
    if (!isRecording) return
    const subdivMs = (60000 / bpm) / subdivision
    const handleDown = e => {
      if (e.repeat) return
      const lane = keybinds.indexOf(e.key); if (lane === -1) return
      e.preventDefault()
      const nowMs = audioRef.current?.currentTime * 1000 || 0
      const ci = Math.max(0, Math.min(Math.round(nowMs / subdivMs), recordChartRef.current.length - 1))
      recordKeyDownRef.current[lane] = { timeMs: nowMs, subdivIdx: ci }
    }
    const handleUp = e => {
      const lane = keybinds.indexOf(e.key); if (lane === -1) return
      e.preventDefault()
      const info = recordKeyDownRef.current[lane]; if (!info) return
      delete recordKeyDownRef.current[lane]
      const nowMs = audioRef.current?.currentTime * 1000 || 0
      const endCi = Math.max(0, Math.min(Math.round(nowMs / subdivMs), recordChartRef.current.length - 1))
      const newChart = recordChartRef.current.map(r => [...r])
      if (nowMs - info.timeMs >= HOLD_THRESHOLD_MS && endCi > info.subdivIdx) {
        newChart[info.subdivIdx][lane] = endCi - info.subdivIdx + 1
        for (let i = info.subdivIdx + 1; i <= endCi; i++) newChart[i][lane] = -1
      } else { newChart[info.subdivIdx][lane] = 1 }
      recordChartRef.current = newChart
    }
    window.addEventListener('keydown', handleDown); window.addEventListener('keyup', handleUp)
    const audio = audioRef.current; audio?.addEventListener('ended', stopRecording)
    return () => {
      window.removeEventListener('keydown', handleDown); window.removeEventListener('keyup', handleUp)
      audio?.removeEventListener('ended', stopRecording)
    }
  }, [isRecording, bpm, subdivision, keybinds, stopRecording])

  const applyRecordedChart = () => { if (!recordChart) return; setChart(recordChart); saveSettings({ chart: recordChart }); setRecordChart(null); setActiveTab('chart') }
  const discardRecordedChart = () => setRecordChart(null)

  const keyLabel = k => {
    if (k === ' ') return 'Spc'
    if (k === 'ArrowLeft') return '←'; if (k === 'ArrowRight') return '→'
    if (k === 'ArrowUp') return '↑'; if (k === 'ArrowDown') return '↓'
    return k.toUpperCase()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', padding: '1.5rem', gap: '1.25rem', background: '#141414' }}>
      <div>
        <div style={{ fontFamily: 'Arial', fontSize: 14, color: '#fff', fontWeight: 'bold', marginBottom: 6 }}>KRONOX</div>
        <div style={{ fontFamily: 'Arial', fontSize: 13, color: '#888' }}>Build your chart, then play it back</div>
      </div>

      {/* File + Title */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <FieldLabel>SONG FILE</FieldLabel>
          <label style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 6, cursor: 'pointer', background: '#1a1a1a', border: `2px dashed ${songFile ? '#66ff99' : '#333'}`, transition: 'all 0.2s' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: songFile ? '#66ff99' : '#333', flexShrink: 0 }} />
            <span style={{ fontFamily: 'Arial', fontSize: 14, color: songFile ? '#fff' : '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{songFile ? songFile.name : 'Click to upload MP3/OGG/WAV'}</span>
            <input type="file" accept="audio/*" onChange={handleFile} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
          </label>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <FieldLabel>SONG TITLE</FieldLabel>
          <input value={songTitle} onChange={e => { setSongTitle(e.target.value); saveSettings({ songTitle: e.target.value }) }}
            style={{ fontFamily: 'Arial', fontSize: 14, color: '#fff', padding: '12px 14px', borderRadius: 6, background: '#1a1a1a', border: '1px solid #333', outline: 'none', width: '100%', boxSizing: 'border-box' }}
            onFocus={e => e.target.style.borderColor = '#666'} onBlur={e => e.target.style.borderColor = '#333'} />
        </div>
      </div>

      {/* Preview player */}
      {songFile && (
        <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={playPreview} style={{ fontFamily: 'Arial', fontSize: 12, padding: '6px 14px', background: isPlaying ? '#444' : '#ff4d8f', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 'bold' }}>
              {isPlaying ? '⏸ PAUSE' : '▶ PLAY'}
            </button>
            <span style={{ fontFamily: 'Arial', fontSize: 12, color: '#888' }}>{Math.floor(previewPos)}s / {audioRef.current ? Math.floor(audioRef.current.duration || 0) : 0}s</span>
          </div>
          <div style={{ height: 4, background: '#222', borderRadius: 2, overflow: 'hidden', cursor: 'pointer' }}
            onClick={e => { if (!audioRef.current) return; const r = e.currentTarget.getBoundingClientRect(); audioRef.current.currentTime = ((e.clientX - r.left) / r.width) * (audioRef.current.duration || 0) }}>
            <div style={{ height: '100%', width: `${audioRef.current ? (previewPos / (audioRef.current.duration || 1) * 100) : 0}%`, background: '#ff4d8f', transition: 'width 0.1s linear' }} />
          </div>
        </div>
      )}

      {/* Sliders */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
        <SliderField label="SCROLL SPEED" value={speed} min={0.5} max={5} step={0.1} display={speed.toFixed(1)} onChange={v => { setSpeed(v); saveSettings({ speed: v }) }} />
        <SliderField label="BPM" value={bpm} min={60} max={240} step={1} display={bpm} onChange={v => { setBpm(v); saveSettings({ bpm: v }) }} />
        <SliderField label="NOTE DENSITY" value={subdivision} min={1} max={8} step={1}
          display={['1/4', '1/8', '1/16', '1/32', '1/64', '1/128', '1/256', '1/512'][subdivision - 1]}
          onChange={v => { setSubdivision(v); saveSettings({ subdivision: v }) }} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #222' }}>
        {['chart', 'record'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ fontFamily: 'Arial', fontSize: 8, letterSpacing: 2, padding: '8px 16px', background: 'transparent', border: 'none', color: activeTab === tab ? '#fff' : '#444', borderBottom: activeTab === tab ? '2px solid #fff' : '2px solid transparent', marginBottom: -1, transition: 'all 0.15s' }}>
            {tab === 'chart' ? 'CHART EDITOR' : '● RECORD MODE'}
          </button>
        ))}
      </div>

      {/* Chart editor */}
      {activeTab === 'chart' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: 'Arial', fontSize: 12, color: '#66ff99', fontWeight: 'bold' }}>{beats} beats · {beats * subdivision} steps</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <SmallBtn onClick={() => setHoldMode(!holdMode)} color={holdMode ? '#ffd93d' : '#666'}>{holdMode ? 'HOLD MODE ●' : 'HOLD MODE'}</SmallBtn>
              <SmallBtn onClick={randomizeChart} color="#ff4d8f">RANDOM</SmallBtn>
              <SmallBtn onClick={clearChart} color="#666">CLEAR</SmallBtn>
            </div>
          </div>
          {songFile && (
            <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, padding: '8px 12px', height: 40, display: 'flex', alignItems: 'center' }}>
              <div style={{ height: 24, width: '100%', position: 'relative', background: '#111', borderRadius: 3 }}>
                {chart.map((row, b) => row.some(n => n > 0) ? <div key={b} style={{ position: 'absolute', left: (b / chart.length * 100) + '%', top: 0, bottom: 0, width: 2, background: '#ff4d8f', opacity: 0.6 }} /> : null)}
                {audioRef.current?.duration && <div style={{ position: 'absolute', left: (previewPos / audioRef.current.duration * 100) + '%', top: 0, bottom: 0, width: 2, background: '#66ff99' }} />}
              </div>
            </div>
          )}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8, background: '#1a1a1a', borderRadius: 6, border: '1px solid #2a2a2a', padding: '12px', maxHeight: 340, overflow: 'hidden' }}>
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
                            style={{ height: isBeatStart ? 20 : 14, borderRadius: isHoldTail ? 2 : 3, background: isHoldHead ? LANE_COLORS[l] + '55' : isHoldTail ? LANE_COLORS[l] + '22' : isActive ? 'rgba(255,255,255,0.18)' : isMeasureStart ? '#161616' : '#111', border: `1px solid ${isHoldHead ? LANE_COLORS[l] + '99' : isHoldTail ? LANE_COLORS[l] + '44' : isActive ? 'rgba(255,255,255,0.2)' : isBeatStart ? '#2a2a2a' : '#1a1a1a'}`, transition: 'all 0.08s' }} />
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
          <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontFamily: 'Arial', fontSize: 9, color: '#fff', letterSpacing: 2, fontWeight: 'bold' }}>HOW IT WORKS</div>
            <div style={{ fontFamily: 'Arial', fontSize: 12, color: '#888', lineHeight: 1.6 }}>Press and hold keys in time to the music. Taps = single notes. Hold 200ms+ = hold note.</div>
            <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
              {keybinds.map((k, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', border: `1.5px solid ${LANE_COLORS[i]}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: LANE_COLORS[i] + '11' }}>
                    <span style={{ fontFamily: 'Arial', fontSize: 9, color: LANE_COLORS[i] }}>{keyLabel(k)}</span>
                  </div>
                  <span style={{ fontFamily: 'Arial', fontSize: 7, color: '#444', letterSpacing: 1 }}>{LANE_NAMES[i]}</span>
                </div>
              ))}
            </div>
          </div>
          {!isRecording && !recordChart && (
            <button onClick={startRecording} disabled={!songFile}
              style={{ fontFamily: 'Arial', fontSize: 11, letterSpacing: 2, fontWeight: 'bold', padding: '14px 0', borderRadius: 6, cursor: songFile ? 'pointer' : 'not-allowed', background: songFile ? '#ff4d8f' : '#1a1a1a', color: songFile ? '#fff' : '#333', border: 'none', transition: 'all 0.2s' }}>
              {songFile ? '● START RECORDING' : '⚠ UPLOAD A SONG FIRST'}
            </button>
          )}
          {isRecording && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ background: '#1a1a1a', border: '1px solid #ff4d8f44', borderRadius: 6, padding: '16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff4d8f', animation: 'recPulse 0.8s ease-in-out infinite' }} />
                <style>{`@keyframes recPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.4;transform:scale(0.7)}}`}</style>
                <div>
                  <div style={{ fontFamily: 'Arial', fontSize: 9, color: '#ff4d8f', letterSpacing: 2, fontWeight: 'bold' }}>RECORDING</div>
                  <div style={{ fontFamily: 'Arial', fontSize: 11, color: '#888', marginTop: 2 }}>{Math.floor(previewPos)}s — tap or hold {keybinds.map(k => keyLabel(k)).join(', ')}</div>
                </div>
              </div>
              <LiveKeyDisplay keys={keybinds} keyLabels={keybinds.map(k => keyLabel(k))} names={LANE_NAMES} colors={LANE_COLORS} />
              <button onClick={stopRecording} style={{ fontFamily: 'Arial', fontSize: 11, letterSpacing: 2, fontWeight: 'bold', padding: '12px 0', borderRadius: 6, background: '#2a2a2a', color: '#fff', border: '1px solid #3a3a3a' }}>■ STOP RECORDING</button>
            </div>
          )}
          {recordChart && !isRecording && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, padding: '12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontFamily: 'Arial', fontSize: 9, color: '#66ff99', letterSpacing: 2, fontWeight: 'bold' }}>DONE — {recordChart.flat().filter(v => v > 0).length} NOTES</div>
                <div style={{ height: 28, background: '#111', borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
                  {recordChart.map((row, b) => row.some(n => n > 0) ? <div key={b} style={{ position: 'absolute', left: (b / recordChart.length * 100) + '%', top: 0, bottom: 0, width: 2, background: '#ff4d8f', opacity: 0.7 }} /> : null)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={applyRecordedChart} style={{ flex: 1, fontFamily: 'Arial', fontSize: 10, letterSpacing: 1, padding: '12px 0', borderRadius: 6, background: '#66ff99', color: '#111', border: 'none', fontWeight: 'bold' }}>✓ APPLY</button>
                <button onClick={startRecording} style={{ flex: 1, fontFamily: 'Arial', fontSize: 10, letterSpacing: 1, padding: '12px 0', borderRadius: 6, background: 'transparent', color: '#fff', border: '1px solid #333' }}>↺ REDO</button>
                <button onClick={discardRecordedChart} style={{ fontFamily: 'Arial', fontSize: 10, padding: '12px 16px', borderRadius: 6, background: 'transparent', color: '#555', border: '1px solid #222' }}>✕</button>
              </div>
            </div>
          )}
        </div>
      )}

      <button onClick={() => songFile && onStart({ songFile, songTitle, speed, bpm, chart, subdivision, keybinds })} disabled={!songFile}
        style={{ fontFamily: 'Arial', fontSize: 13, letterSpacing: 1, fontWeight: 'bold', padding: '14px 0', borderRadius: 6, cursor: songFile ? 'pointer' : 'not-allowed', background: songFile ? '#66ff99' : '#1a1a1a', color: songFile ? '#111' : '#333', border: songFile ? 'none' : '1px solid #2a2a2a', transition: 'all 0.2s', marginTop: 'auto' }}
        onMouseEnter={e => { if (songFile) { e.currentTarget.style.background = '#99ffbb'; e.currentTarget.style.transform = 'scale(1.02)' } }}
        onMouseLeave={e => { if (songFile) { e.currentTarget.style.background = '#66ff99'; e.currentTarget.style.transform = 'scale(1)' } }}>
        {songFile ? '▶ PLAY' : '⚠ UPLOAD A SONG FIRST'}
      </button>
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

// ─── GameView ─────────────────────────────────────────────────────────────────
function GameView({ config, onStop }) {
  const stageRef = useRef(null)
  const audioRef = useRef(null)
  const rafRef   = useRef(null)
  const stateRef = useRef({
    activeNotes: [], score: 0, combo: 0, health: 80,
    paused: false, completedBeats: new Set(),
    perfect: 0, good: 0, bad: 0, miss: 0, totalHits: 0,
    heldNotes: {},
  })

  const keybinds = config.keybinds || DEFAULT_LANE_KEYS

  // Lane width constants — four lanes, each 90px wide, 8px gap between
  const LANE_W    = 90
  const LANE_GAP  = 8
  const NOTE_SIZE = 74  // flat white circle diameter
  const TOTAL_W   = LANE_W * 4 + LANE_GAP * 3  // 360 + 24 = 384
  const RECEPTOR_BOTTOM = 70

  const [hud,             setHud]             = useState({ score: 0, combo: 0, health: 80 })
  const [judgment,        setJudgment]        = useState({ text: '', color: '#fff', visible: false, key: 0 })
  const [receptorPressed, setReceptorPressed] = useState([false, false, false, false])
  const [paused,          setPaused]          = useState(false)
  const [comboFlash,      setComboFlash]      = useState(false)

  const showJudge = useCallback((text, color) => {
    setJudgment(j => ({ text, color, visible: true, key: j.key + 1 }))
    setTimeout(() => setJudgment(j => ({ ...j, visible: false })), 500)
  }, [])

  const updateHud = useCallback(() => {
    const s = stateRef.current
    setHud({ score: s.score, combo: s.combo, health: s.health })
    if (s.combo > 0) { setComboFlash(true); setTimeout(() => setComboFlash(false), 120) }
  }, [])

  // Lane element helper — uses explicit pixel offsets to avoid any measurement
  const getLaneEl = useCallback(lane => stageRef.current?.querySelectorAll('.fnf-lane')?.[lane], [])

  // Flash lane white on hit
  const flashLane = useCallback(laneEl => {
    if (!laneEl) return
    const flash = document.createElement('div')
    flash.style.cssText = `position:absolute;inset:0;background:#ffffff;opacity:0.18;pointer-events:none;z-index:5;transition:opacity 0.25s;`
    laneEl.appendChild(flash)
    requestAnimationFrame(() => requestAnimationFrame(() => { flash.style.opacity = '0' }))
    setTimeout(() => flash.remove(), 300)
  }, [])

  const stopGame = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    if (audioRef.current) { audioRef.current.onended = null; audioRef.current.pause() }
    stageRef.current?.querySelectorAll('.fnf-note,.fnf-hold-trail').forEach(n => n.remove())
    const s = stateRef.current
    const accuracy = s.totalHits > 0 ? Math.round(((s.perfect * 100 + s.good * 90 + s.bad * 70) / (s.totalHits * 100)) * 100) : 0
    onStop('complete', { score: s.score, perfect: s.perfect, good: s.good, bad: s.bad, miss: s.miss, totalHits: s.totalHits, accuracy, duration: audioRef.current?.duration || 0, songTitle: config.songTitle })
  }, [onStop, config.songTitle])

  const dieGame = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    if (audioRef.current) { audioRef.current.onended = null; audioRef.current.pause() }
    stageRef.current?.querySelectorAll('.fnf-note,.fnf-hold-trail').forEach(n => n.remove())
    onStop('death', null)
  }, [onStop])

  const doMiss = useCallback(note => {
    note.hit = true
    note.el?.remove(); note.trailEl?.remove()
    note.el = null; note.trailEl = null
    const s = stateRef.current
    s.completedBeats.add(`${note.beat}-${note.lane}`)
    s.miss++; s.totalHits++; s.combo = 0
    s.health = Math.max(0, s.health - 10)
    updateHud(); showJudge('MISS', '#ff6666')
    if (s.health <= 0) dieGame()
  }, [showJudge, updateHud, dieGame])

  const releaseHold = useCallback(lane => {
    const s = stateRef.current
    const held = s.heldNotes[lane]; if (!held) return
    const { note, startMs, holdDurationMs } = held
    const nowMs = audioRef.current ? audioRef.current.currentTime * 1000 : 0
    const frac = Math.min(1, (nowMs - startMs) / holdDurationMs)
    delete s.heldNotes[lane]
    note.trailEl?.remove(); note.trailEl = null
    note.hit = true
    s.completedBeats.add(`${note.beat}-${note.lane}`)
    s.activeNotes = s.activeNotes.filter(n => !n.hit)
    s.combo++; s.totalHits++
    const laneEl = getLaneEl(lane)
    if (frac >= 0.99)     { s.score += 350 * 2 * Math.max(1, Math.floor(s.combo / 10)); s.perfect++; s.health = Math.min(100, s.health + 5); showJudge('PERFECT', '#ffffff'); flashLane(laneEl) }
    else if (frac >= 0.5) { s.score += 200 * Math.max(1, Math.floor(s.combo / 10));     s.good++;    s.health = Math.min(100, s.health + 3); showJudge('GOOD', '#aaaaaa');    flashLane(laneEl) }
    else                  { s.score += 100 * Math.max(1, Math.floor(s.combo / 10));     s.bad++;     s.health = Math.min(100, s.health + 1); showJudge('BAD', '#555555') }
    updateHud()
  }, [showJudge, updateHud, getLaneEl, flashLane])

  const hitNote = useCallback(lane => {
    const s = stateRef.current
    const audio = audioRef.current; if (!audio) return
    const nowMs = audio.currentTime * 1000
    let closest = null, minDist = Infinity
    for (const n of s.activeNotes) {
      if (n.lane !== lane || n.hit) continue
      const d = Math.abs(n.hitTimeMs - nowMs)
      if (d < minDist && d < 150) { minDist = d; closest = n }
    }
    if (!closest) return
    const laneEl = getLaneEl(lane)

    if (closest.holdDurationMs > 0) {
      s.heldNotes[lane] = { note: closest, startMs: nowMs, holdDurationMs: closest.holdDurationMs }
      closest.el?.remove(); closest.el = null
      flashLane(laneEl)
      return
    }

    closest.el?.remove(); closest.el = null
    closest.hit = true
    s.completedBeats.add(`${closest.beat}-${closest.lane}`)
    s.activeNotes = s.activeNotes.filter(n => !n.hit)
    s.combo++; s.totalHits++
    flashLane(laneEl)

    let pts, text, color
    if (minDist < 15)       { pts = 350; text = 'PERFECT'; color = '#ffffff'; s.perfect++ }
    else if (minDist < 45)  { pts = 200; text = 'GOOD';    color = '#aaaaaa'; s.good++ }
    else if (minDist < 100) { pts = 100; text = 'BAD';     color = '#555555'; s.bad++ }
    else                    { pts = 50;  text = 'MISS';    color = '#ff4466'; s.miss++ }

    s.score += pts * Math.max(1, Math.floor(s.combo / 10))
    s.health = Math.min(100, s.health + 3)
    updateHud(); showJudge(text, color)
  }, [showJudge, updateHud, getLaneEl, flashLane])

  const togglePause = useCallback(() => {
    const s = stateRef.current; s.paused = !s.paused; setPaused(s.paused)
    if (s.paused) audioRef.current?.pause()
    else audioRef.current?.play().catch(() => {})
  }, [])

  useEffect(() => {
    const url = URL.createObjectURL(config.songFile)
    const audio = new Audio(url)
    audioRef.current = audio
    audio.onended = stopGame
    audio.play().catch(() => {})

    const subdivision = config.subdivision || 1
    const subdivMs = (60000 / config.bpm) / subdivision
    const subdivSec = subdivMs / 1000
    const s = stateRef.current
    s.activeNotes = []; s.score = 0; s.combo = 0; s.health = 80
    s.completedBeats = new Set(); s.heldNotes = {}

    const LOOKAHEAD_MS = 2200
    const laneXOffsets = [0, 1, 2, 3].map(i => i * (LANE_W + LANE_GAP))

    const loop = () => {
      if (!s.paused) {
        const nowSec = audio.currentTime
        const nowMs  = nowSec * 1000
        const futureIdx = Math.floor((nowSec + LOOKAHEAD_MS / 1000) / subdivSec)
        const laneEls   = stageRef.current?.querySelectorAll('.fnf-lane')

        // Spawn upcoming notes
        for (let b = 0; b <= Math.min(futureIdx, config.chart.length - 1); b++) {
          for (let l = 0; l < 4; l++) {
            const key  = `${b}-${l}`
            const cell = config.chart[b][l]
            if (cell > 0 && !s.completedBeats.has(key) && !s.activeNotes.find(n => n.beat === b && n.lane === l)) {
              s.activeNotes.push({
                beat: b, lane: l,
                hitTimeMs:       b * subdivMs,
                holdDurationMs:  cell > 1 ? (cell - 1) * subdivMs : 0,
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

          // ── Note head: flat white circle, no glow, no gradient ──
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
                background:#ffffff;
                pointer-events:none;
                z-index:2;
              `
              laneEls?.[note.lane]?.appendChild(el)
              note.el = el
            }
            note.el.style.bottom = yFromBottom + 'px'
          } else {
            if (note.el) { note.el.remove(); note.el = null }
          }

          // ── Hold trail: white semi-transparent bar ──
          if (note.holdDurationMs > 0) {
            if (!note.trailEl) {
              const tr = document.createElement('div')
              tr.className = 'fnf-hold-trail'
              tr.style.cssText = `
                position:absolute;
                left:50%;
                transform:translateX(-50%);
                width:${Math.round(NOTE_SIZE * 0.4)}px;
                border-radius:${Math.round(NOTE_SIZE * 0.2)}px ${Math.round(NOTE_SIZE * 0.2)}px 0 0;
                background:rgba(255,255,255,0.35);
                pointer-events:none;
                z-index:1;
              `
              laneEls?.[note.lane]?.appendChild(tr)
              note.trailEl = tr
            }

            if (isBeingHeld) {
              const held      = s.heldNotes[note.lane]
              const remaining = Math.max(0, held.holdDurationMs - (nowMs - held.startMs))
              const h         = remaining * config.speed * 0.35
              note.trailEl.style.bottom = RECEPTOR_BOTTOM + 'px'
              note.trailEl.style.height = h + 'px'
              if (remaining <= 0) releaseHold(note.lane)
            } else {
              const trailH = note.holdDurationMs * config.speed * 0.35
              note.trailEl.style.bottom = (yFromBottom + NOTE_SIZE / 2) + 'px'
              note.trailEl.style.height = trailH + 'px'
            }
          }

          // Miss if scrolls past
          if (!isBeingHeld && yFromBottom < -100 && !note.hit) doMiss(note)
        }

        s.activeNotes = s.activeNotes.filter(n => !n.hit)
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    const onKey = e => {
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
      URL.revokeObjectURL(url)
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
      <div ref={stageRef} style={{ position: 'relative', flex: 1, overflow: 'hidden', background: '#0a0a0a' }}>

        {/* Highway — 4 lanes with gaps */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: '50%', transform: 'translateX(-50%)',
          width: TOTAL_W,
          display: 'flex', gap: LANE_GAP,
        }}>
          {[0, 1, 2, 3].map(l => (
            <div key={l} className="fnf-lane" style={{
              position: 'relative',
              width: LANE_W, flexShrink: 0,
              overflow: 'visible',
              // Subtle lane background — very faint
              background: 'rgba(255,255,255,0.012)',
            }}>
              {/* Receptor: white ring, filled white when pressed */}
              <div style={{
                position: 'absolute',
                bottom: RECEPTOR_BOTTOM,
                left: '50%',
                transform: receptorPressed[l] ? 'translateX(-50%) scale(0.88)' : 'translateX(-50%) scale(1)',
                width: NOTE_SIZE, height: NOTE_SIZE,
                borderRadius: '50%',
                border: `2px solid ${receptorPressed[l] ? '#ffffff' : 'rgba(255,255,255,0.25)'}`,
                background: receptorPressed[l] ? 'rgba(255,255,255,0.15)' : 'transparent',
                transition: 'all 0.04s',
                zIndex: 3,
                boxSizing: 'border-box',
              }} />
            </div>
          ))}
        </div>

        {/* HUD */}
        <div style={{ position: 'absolute', top: 12, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', padding: '0 20px', pointerEvents: 'none', zIndex: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontFamily: 'Arial', fontSize: 7, color: '#3a3a3a', letterSpacing: 2 }}>COMBO</span>
            <span style={{ fontFamily: 'Arial', fontSize: 16, color: '#fff', fontWeight: 'bold', animation: comboFlash ? 'comboPop 0.12s ease-out' : 'none' }}>{hud.combo}×</span>
          </div>
          <div style={{ fontFamily: 'Arial', fontSize: 7, color: '#222', letterSpacing: 2, alignSelf: 'center' }}>{config.songTitle.toUpperCase()}</div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'Arial', fontSize: 6, color: '#3a3a3a', letterSpacing: 2, marginBottom: 2 }}>SCORE</div>
            <div style={{ fontFamily: 'Arial', fontSize: 14, color: '#fff', fontWeight: 'bold' }}>{hud.score.toLocaleString()}</div>
          </div>
        </div>

        {/* Judgment text */}
        <div key={judgment.key} style={{
          position: 'absolute', left: '50%', top: '36%',
          fontFamily: 'Arial', fontSize: 11, letterSpacing: 4, fontWeight: 'bold',
          color: judgment.color,
          pointerEvents: 'none', zIndex: 10, whiteSpace: 'nowrap',
          animation: judgment.visible ? 'judgeAnim 0.5s ease-out forwards' : 'none',
          opacity: 0,
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
      </div>

      {/* Control bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', background: '#111', borderTop: '1px solid #1e1e1e', flexShrink: 0 }}>
        <CtrlBtn onClick={togglePause}>{paused ? 'RESUME' : 'PAUSE'}</CtrlBtn>
        <CtrlBtn onClick={stopGame}>QUIT</CtrlBtn>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
          {keybinds.map((k, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <span style={{ fontFamily: 'Arial', fontSize: 5, color: '#333', letterSpacing: 1 }}>{LANE_NAMES[i]}</span>
              <div style={{ width: 28, height: 28, borderRadius: '50%', border: `1.5px solid ${receptorPressed[i] ? '#ffffff' : '#333333'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: receptorPressed[i] ? 'rgba(255,255,255,0.15)' : 'transparent', transition: 'all 0.05s' }}>
                <span style={{ fontFamily: 'Arial', fontSize: 7, color: receptorPressed[i] ? '#ffffff' : '#444' }}>{keyLabel(k)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function CtrlBtn({ onClick, children }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ fontFamily: 'Arial', fontSize: 7, letterSpacing: 2, padding: '6px 13px', borderRadius: 5, border: '1px solid #333', background: hov ? '#222' : 'transparent', color: hov ? '#fff' : '#666', transition: 'all 0.12s' }}>
      {children}
    </button>
  )
}

// ─── Results ──────────────────────────────────────────────────────────────────
function Results({ stats, onExit }) {
  const [fadeOut, setFadeOut] = useState(false)
  const handleExit = () => { setFadeOut(true); setTimeout(onExit, 400) }
  const total = stats.totalHits || 1

  const topCards = [
    { label: 'PERFECT',  value: stats.perfect,                        sub: `${((stats.perfect / total) * 100).toFixed(0)}%`, color: '#ffffff' },
    { label: 'GOOD',     value: stats.good,                           sub: `${((stats.good    / total) * 100).toFixed(0)}%`, color: '#aaaaaa' },
    { label: 'BAD',      value: stats.bad,                            sub: `${((stats.bad     / total) * 100).toFixed(0)}%`, color: '#666666' },
    { label: 'MISS',     value: stats.miss,                           sub: `${((stats.miss    / total) * 100).toFixed(0)}%`, color: '#ff6666' },
    { label: 'SCORE',    value: `${(stats.score / 1000).toFixed(1)}k`, sub: 'points',                                        color: '#ffffff' },
    { label: 'ACCURACY', value: `${stats.accuracy}%`,                  sub: 'overall',                                       color: '#ffd93d' },
  ]
  const botCards = [
    { label: 'TOTAL HITS', value: stats.totalHits },
    { label: 'DURATION',   value: `${Math.floor(stats.duration)}s` },
    { label: 'NOTES/SEC',  value: (stats.totalHits / Math.max(stats.duration, 1)).toFixed(1) },
    { label: 'HIT RATE',   value: `${((stats.totalHits / Math.max(stats.totalHits + stats.miss, 1)) * 100).toFixed(0)}%` },
    { label: 'AVG TIMING', value: `${(((stats.perfect / total) * 100 + (stats.good / total) * 100) / 2).toFixed(0)}%` },
    { label: 'RATING',     value: stats.accuracy >= 95 ? 'S+' : stats.accuracy >= 85 ? 'S' : stats.accuracy >= 75 ? 'A' : stats.accuracy >= 65 ? 'B' : 'C' },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0c0c0c', display: 'flex', flexDirection: 'column', opacity: fadeOut ? 0 : 1, transition: 'opacity 0.4s', overflow: 'auto', padding: '24px 28px', gap: 18, color: '#fff', fontFamily: 'Arial, sans-serif' }}>
      <style>{`
        @keyframes slideUp { from { transform: translateY(18px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        .rc { background:#141414; border:1px solid #222; border-radius:6px; padding:14px 16px; display:flex; flex-direction:column; gap:5px; }
      `}</style>

      <div style={{ animation: 'slideUp 0.35s ease-out' }}>
        <div style={{ fontFamily: 'Arial', fontSize: 8, color: '#333', letterSpacing: 3, marginBottom: 8 }}>RESULTS</div>
        <h1 style={{ fontSize: 20, fontWeight: 'bold', margin: 0, letterSpacing: 1 }}>SONG COMPLETE</h1>
        <p style={{ fontSize: 11, color: '#555', margin: '5px 0 0' }}>{stats.songTitle}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10 }}>
        {topCards.map((c, i) => (
          <div key={c.label} className="rc" style={{ animation: `slideUp 0.4s ease-out ${0.04 * i}s both` }}>
            <div style={{ fontSize: 7, letterSpacing: 2, color: c.color, fontWeight: 'bold' }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 'bold', color: '#fff', lineHeight: 1.1 }}>{c.value}</div>
            <div style={{ fontSize: 9, color: '#444' }}>{c.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10 }}>
        {botCards.map((c, i) => (
          <div key={c.label} className="rc" style={{ animation: `slideUp 0.4s ease-out ${0.25 + 0.04 * i}s both` }}>
            <div style={{ fontSize: 7, letterSpacing: 2, color: '#444', fontWeight: 'bold' }}>{c.label}</div>
            <div style={{ fontSize: 18, fontWeight: 'bold', color: '#999' }}>{c.value}</div>
          </div>
        ))}
      </div>

      <button onClick={handleExit}
        style={{ padding: '12px 0', borderRadius: 6, border: '1px solid #222', fontSize: 11, letterSpacing: 2, fontWeight: 'bold', background: '#141414', color: '#fff', transition: 'all 0.2s', animation: 'slideUp 0.4s ease-out 0.55s both' }}
        onMouseEnter={e => { e.currentTarget.style.background = '#1e1e1e'; e.currentTarget.style.borderColor = '#333' }}
        onMouseLeave={e => { e.currentTarget.style.background = '#141414'; e.currentTarget.style.borderColor = '#222' }}>
        BACK TO MAIN
      </button>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function FieldLabel({ children }) {
  return <span style={{ fontFamily: 'Arial', fontSize: 7, color: '#555', letterSpacing: 3 }}>{children}</span>
}
function SliderField({ label, value, min, max, step, display, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <FieldLabel>{label}</FieldLabel>
        <span style={{ fontFamily: 'Arial', fontSize: 22, color: '#fff', fontWeight: 'bold' }}>{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} style={{ accentColor: '#fff', width: '100%' }} />
    </div>
  )
}
function SmallBtn({ onClick, children, color = '#555' }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ fontFamily: 'Arial', fontSize: 7, padding: '5px 11px', borderRadius: 5, background: hov ? color + '22' : 'transparent', border: `1px solid ${hov ? color : color + '66'}`, color: hov ? color : color + '99', letterSpacing: 2, transition: 'all 0.12s' }}>
      {children}
    </button>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen,       setScreen]       = useState('setup')
  const [gameConfig,   setGameConfig]   = useState(null)
  const [gameStats,    setGameStats]    = useState(null)
  const [showSettings, setShowSettings] = useState(false)

  const saved = loadSettings()
  const [keybinds, setKeybinds] = useState(saved.keybinds?.length === 4 ? saved.keybinds : [...DEFAULT_LANE_KEYS])

  const saveKeybinds = keys => {
    setKeybinds(keys)
    localStorage.setItem('kronox-settings', JSON.stringify({ ...loadSettings(), keybinds: keys }))
    setShowSettings(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#111', overflow: 'hidden' }}>
      <TitleBar onOpenSettings={() => setShowSettings(true)} />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {screen === 'setup'
          ? <SetupPanel keybinds={keybinds} onStart={cfg => { setGameConfig({ ...cfg, keybinds }); setScreen('game') }} />
          : screen === 'game'
          ? <GameView config={gameConfig} onStop={(status, stats) => { if (status === 'complete') { setGameStats(stats); setScreen('results') } else setScreen('setup') }} />
          : <Results stats={gameStats} onExit={() => { setScreen('setup'); setGameStats(null) }} />
        }
      </div>
      {showSettings && <SettingsModal keybinds={keybinds} onSave={saveKeybinds} onClose={() => setShowSettings(false)} />}
    </div>
  )
}
