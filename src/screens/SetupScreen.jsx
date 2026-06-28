import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '../components/ui/Button.jsx'
import { Slider } from '../components/ui/Slider.jsx'
import { FieldLabel } from '../components/ui/FieldLabel.jsx'
import { Panel } from '../components/ui/Panel.jsx'
import { DEFAULT_BPM, DEFAULT_SPEED, LANE_COLORS, buildChart, calcDifficulty, diffColor, getLaneNames } from '../constants.js'
import { useAudioFile } from '../hooks/useAudioFile.js'
import { Recorder } from '../game/Recorder.js'
import styles from './SetupScreen.module.css'

const RECORD_SUBDIVISION = 64

export function SetupScreen({ settings, onStart, onOpenPublish }) {
  const laneCount = settings.laneCount || 4
  const laneNames = getLaneNames(laneCount)
  const initialSubdivision = settings.subdivision || RECORD_SUBDIVISION

  const keyLabel = k => {
    if (k === ' ') return 'Spc'
    if (k === 'ArrowLeft') return '←'
    if (k === 'ArrowRight') return '→'
    if (k === 'ArrowUp') return '↑'
    if (k === 'ArrowDown') return '↓'
    return k.toUpperCase()
  }

  const [songFile, setSongFile] = useState(null)
  const [audioUrl, setAudioUrl] = useState(settings.audioUrl || null)
  const [audioName, setAudioName] = useState(settings.audioFileName || '')
  const [songTitle, setSongTitle] = useState(settings.songTitle || 'My Song')
  const [bpm, setBpm] = useState(settings.bpm || DEFAULT_BPM)
  const [speed, setSpeed] = useState(settings.speed || DEFAULT_SPEED)
  const [subdivision, setSubdivision] = useState(initialSubdivision)
  const [chart, setChart] = useState(() =>
    settings.chart?.length && settings.chart[0]?.length === laneCount
      ? settings.chart
      : buildChart(initialSubdivision * 4, laneCount)
  )

  useEffect(() => {
    setChart(prev => {
      if (prev?.length && prev[0]?.length === laneCount) return prev
      const empty = buildChart(RECORD_SUBDIVISION * 4, laneCount)
      saveSettings({ chart: empty })
      return empty
    })
  }, [laneCount])

  const [audioPos, setAudioPos] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [autoplay, setAutoplay] = useState(false)
  const [recorderState, setRecorderState] = useState({ isRecording: false, isPaused: false, isSlowMode: false })
  const [recordCountdown, setRecordCountdown] = useState(null)
  const [recordedChart, setRecordedChart] = useState(null)
  const recorderRef = useRef(null)

  const audioRef = useRef(null)
  const fileInputRef = useRef(null)
  const [recLanePressed, setRecLanePressed] = useState(() => Array(laneCount).fill(false))

  useEffect(() => {
    setRecLanePressed(Array(laneCount).fill(false))
  }, [laneCount])

  const { savedFile, saveAudioFile } = useAudioFile()

  useEffect(() => {
    if (savedFile && !songFile && !audioUrl) {
      setSongFile(savedFile)
      setAudioName(savedFile.name)
      const title = savedFile.name.replace(/\.[^.]+$/, '')
      setSongTitle(title)
    }
  }, [savedFile, songFile, audioUrl])

  const saveSettings = useCallback((patch = {}) => {
    const next = {
      ...settings,
      songTitle, bpm, speed, chart,
      subdivision,
      audioFileName: audioName,
      audioUrl,
      ...patch,
    }
    localStorage.setItem('kronox-settings', JSON.stringify(next))
  }, [settings, songTitle, bpm, speed, chart, subdivision, audioName, audioUrl])

  const setupAudio = useCallback(() => {
    if (!songFile && !audioUrl) return
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    const audio = new Audio()
    if (audioUrl) {
      audio.crossOrigin = 'anonymous'
      audio.src = audioUrl
    } else {
      audio.src = URL.createObjectURL(songFile)
    }
    audio.volume = settings.musicVolume ?? 1
    audio.preload = 'metadata'
    audio.addEventListener('timeupdate', () => setAudioPos(audio.currentTime))
    audio.addEventListener('play', () => setIsPlaying(true))
    audio.addEventListener('pause', () => setIsPlaying(false))
    audio.addEventListener('ended', () => setIsPlaying(false))
    audioRef.current = audio
  }, [songFile, audioUrl, settings.musicVolume])

  useEffect(() => {
    if (songFile || audioUrl) setupAudio()
  }, [songFile, audioUrl, setupAudio])

  useEffect(() => {
    return () => {
      recorderRef.current?.stop()
      // Make sure any chart changes survive navigation even if Apply wasn't pressed.
      saveSettings({ chart, songTitle, bpm, speed, subdivision, audioFileName: audioName, audioUrl })
    }
  }, [chart, songTitle, bpm, speed, subdivision, audioName, audioUrl, saveSettings])

  useEffect(() => {
    saveSettings({ chart })
  }, [chart, saveSettings])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = settings.musicVolume ?? 1
  }, [settings.musicVolume])

  const togglePreview = () => {
    if (!audioRef.current) return
    if (audioRef.current.paused) audioRef.current.play().catch(() => {})
    else audioRef.current.pause()
  }

  const startRecording = () => {
    if ((!songFile && !audioUrl) || !audioRef.current) return
    recorderRef.current = new Recorder(audioRef.current, settings.keybinds)
    recorderRef.current.slowModeEnabled = settings.slowModeEnabled
    recorderRef.current.slowModeKey = settings.slowModeKey
    recorderRef.current.slowModeSpeed = settings.slowModeSpeed
    recorderRef.current.onStateChange = setRecorderState
    recorderRef.current.onChart = chart => {
      setRecordedChart(chart)
      setChart(chart)
      saveSettings({ chart })
    }
    setRecordedChart(null)
    setRecordCountdown(3)
  }

  useEffect(() => {
    if (recordCountdown === null) return
    if (recordCountdown === 1) {
      const t = setTimeout(() => {
        setRecordCountdown(null)
        recorderRef.current?.start({ bpm, subdivision, durationSec: audioRef.current?.duration || 0 })
      }, 800)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setRecordCountdown(c => c - 1), 800)
    return () => clearTimeout(t)
  }, [recordCountdown, bpm, subdivision])

  const applyRecordedChart = () => {
    if (!recordedChart) return
    setChart(recordedChart)
    saveSettings({ chart: recordedChart, subdivision })
    setRecordedChart(null)
  }

  const discardRecordedChart = () => {
    setRecordedChart(null)
  }

  const handleFile = async (e) => {
    const f = e.target.files[0]
    if (!f) return
    setSongFile(f)
    setAudioUrl(null)
    setAudioName(f.name)
    await saveAudioFile(f)
    const title = f.name.replace(/\.[^.]+$/, '')
    setSongTitle(title)
    setSubdivision(RECORD_SUBDIVISION)
    const emptyChart = buildChart(RECORD_SUBDIVISION * 4, laneCount)
    setChart(emptyChart)
    saveSettings({ audioUrl: null, audioFileName: f.name, songTitle: title, subdivision: RECORD_SUBDIVISION, chart: emptyChart })
  }

  const handleStart = () => {
    if (!songFile && !audioUrl) return
    // Prime audio playback inside the user gesture so the game can start audio later
    if (audioRef.current) {
      audioRef.current.play().then(() => audioRef.current.pause()).catch(() => {})
    }
    onStart({
      ...(audioUrl ? { audioUrl } : { songFile }),
      songTitle,
      bpm,
      speed,
      chart,
      subdivision,
      autoplay,
    })
  }

  const difficulty = calcDifficulty(chart, bpm, subdivision)

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>KRONOX</h1>
          <p className={styles.subtitle}>Upload a track, record your chart, play it back</p>
        </div>
      </div>

      <div className={styles.topGrid}>
        <label className={styles.fileDrop}>
          <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFile} className={styles.hiddenInput} />
          <span className={`${styles.fileDot} ${songFile ? styles.fileDotActive : ''}`} />
          <span className={styles.fileName}>{songFile ? audioName : 'Click to upload MP3/OGG/WAV'}</span>
        </label>

        <div>
          <FieldLabel>Song Title</FieldLabel>
          <input
            className={styles.textInput}
            value={songTitle}
            onChange={e => { setSongTitle(e.target.value); saveSettings({ songTitle: e.target.value }) }}
          />
        </div>
      </div>

      {(songFile || audioUrl) && (
        <Panel className={styles.playerPanel}>
          <div className={styles.playerRow}>
            <Button size="sm" onClick={togglePreview}>{isPlaying ? 'Pause' : 'Play'}</Button>
            <span className={styles.playerTime}>{Math.floor(audioPos)}s / {Math.floor(audioRef.current?.duration || 0)}s</span>
          </div>
          <div
            className={styles.playerTrack}
            onClick={e => {
              if (!audioRef.current) return
              const r = e.currentTarget.getBoundingClientRect()
              audioRef.current.currentTime = ((e.clientX - r.left) / r.width) * (audioRef.current.duration || 0)
            }}
          >
            <div className={styles.playerFill} style={{ width: `${audioRef.current ? (audioPos / (audioRef.current.duration || 1) * 100) : 0}%` }} />
          </div>
        </Panel>
      )}

      <div className={styles.sliders}>
        <Slider
          label="Scroll Speed"
          value={speed}
          min={0.5} max={5} step={0.1}
          format={v => v.toFixed(1) + '×'}
          onChange={v => { setSpeed(v); saveSettings({ speed: v }) }}
        />
        <Slider
          label="BPM"
          value={bpm}
          min={60} max={240} step={1}
          onChange={v => { setBpm(v); saveSettings({ bpm: v }) }}
        />
      </div>

      <div className={styles.recordStage}>
        {!songFile && !audioUrl && (
          <Panel className={styles.recordPlaceholder}>
            <div className={styles.recordPlaceholderIcon}>●</div>
            <h3 className={styles.sectionTitle}>Ready to record</h3>
            <p>Upload a song above, then hit the big record button to lay down notes exactly where you tap.</p>
          </Panel>
        )}

        {(songFile || audioUrl) && !recorderState.isRecording && !recordedChart && recordCountdown === null && (
          <div className={styles.recordIdle}>
            <div className={styles.recordKeys}>
              {settings.keybinds.map((k, i) => (
                <div key={i} className={styles.recordKey}>
                  <div className={styles.recordKeyCircle} style={{ borderColor: settings.laneColors[i] + '55', background: settings.laneColors[i] + '11' }}>
                    <span style={{ color: settings.laneColors[i] }}>{keyLabel(k)}</span>
                  </div>
                  <span>{laneNames[i]}</span>
                </div>
              ))}
            </div>
            <div className={styles.recordActions}>
              <Button variant="secondary" size="sm" onClick={startRecording} className={styles.recordBtn}>
                <span className={styles.recordDot} />
                Start Recording
              </Button>
              <span className={styles.recordStat}>
                {chart.flat().filter(v => v > 0).length} notes · {Math.ceil(chart.length / subdivision)} beats
              </span>
            </div>
            <p className={styles.recordHint}>Tap or hold {settings.keybinds.map(keyLabel).join(', ')} in time with the music · {keyLabel(settings.slowModeKey)} = slow mode</p>
          </div>
        )}

        {recordCountdown !== null && (
          <div className={styles.recordCountdown}>
            <span>Get Ready</span>
            <div key={recordCountdown} className={styles.countdownBig}>{recordCountdown}</div>
          </div>
        )}

        {recorderState.isRecording && (
          <div className={styles.recordActive}>
            <Panel className={styles.recordingPanel}>
              <div className={styles.recordingDot} />
              <div>
                <div className={styles.recordingTitle}>{recorderState.isPaused ? 'Paused' : 'Recording'}</div>
                <div className={styles.recordingSub}>{recorderState.isPaused ? 'Press SPACE to resume' : `${Math.floor(audioPos)}s — tap or hold ${settings.keybinds.map(keyLabel).join(', ')} · ${keyLabel(settings.slowModeKey)} = slow`}</div>
              </div>
            </Panel>
            <div className={styles.recordTouchGrid} style={{ gridTemplateColumns: `repeat(${laneCount}, 1fr)` }}>
              {Array.from({ length: laneCount }, (_, lane) => (
                <button
                  key={lane}
                  className={`${styles.recordTouchBtn} ${recLanePressed[lane] ? styles.recordTouchBtnActive : ''}`}
                  style={{
                    '--lane-color': settings.laneColors[lane] || LANE_COLORS[lane],
                  }}
                  onPointerDown={e => { e.preventDefault(); setRecLanePressed(p => { const n = [...p]; n[lane] = true; return n }); recorderRef.current?.handleTouchStart(lane) }}
                  onPointerUp={e => { e.preventDefault(); setRecLanePressed(p => { const n = [...p]; n[lane] = false; return n }); recorderRef.current?.handleTouchEnd(lane) }}
                  onPointerLeave={() => setRecLanePressed(p => { const n = [...p]; n[lane] = false; return n })}
                >
                  <span className={styles.recordTouchLabel}>{laneNames[lane]}</span>
                  <span className={styles.recordTouchKey}>{keyLabel(settings.keybinds[lane])}</span>
                </button>
              ))}
            </div>
            <div className={styles.recordControls}>
              <Button variant={recorderState.isSlowMode ? 'primary' : 'secondary'} onClick={() => recorderRef.current?.toggleSlowMode()}>
                {recorderState.isSlowMode ? `⏱ Slow ×${recorderState.slowModeSpeed}` : '⏱ Slow Off'}
              </Button>
              <Button variant="secondary" onClick={() => recorderRef.current?.stop()}>■ Stop Recording</Button>
            </div>
          </div>
        )}

        {recordedChart && !recorderState.isRecording && (
          <div className={styles.recordedActions}>
            <Panel className={styles.recordedInfoPanel}>
              <div className={styles.recordedInfo}>Done — {recordedChart.flat().filter(v => v > 0).length} notes recorded</div>
            </Panel>
            <div className={styles.recordedButtons}>
              <Button onClick={applyRecordedChart}>✓ Apply Recording</Button>
              <Button variant="secondary" onClick={startRecording}>↺ Redo</Button>
              <Button variant="ghost" onClick={discardRecordedChart}>✕ Discard</Button>
            </div>
          </div>
        )}
      </div>

      <div className={styles.bottomBar}>
        <div className={styles.bottomLeft}>
          {songFile && (
            <Button size="sm" variant="secondary" onClick={() => onOpenPublish({ songFile, songTitle, bpm, speed, subdivision, beats: Math.ceil(chart.length / subdivision), chart, audioRef })}>
              Publish
            </Button>
          )}
          <span className={styles.diffBadge} style={{ color: diffColor(difficulty), background: diffColor(difficulty) + '18' }}>
            ★ {difficulty}
          </span>
        </div>
        <div className={styles.bottomRight}>
          <Button size="sm" variant={autoplay ? 'primary' : 'ghost'} onClick={() => setAutoplay(!autoplay)}>Autoplay</Button>
          <Button variant="primary" onClick={handleStart} disabled={!songFile && !audioUrl}>
            {(songFile || audioUrl) ? (autoplay ? '▶▶ Autoplay' : '▶ Play') : 'Upload a song'}
          </Button>
        </div>
      </div>
    </div>
  )
}
