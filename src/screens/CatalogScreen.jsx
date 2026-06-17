import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Button } from '../components/ui/Button.jsx'
import { Panel } from '../components/ui/Panel.jsx'
import { FieldLabel } from '../components/ui/FieldLabel.jsx'
import { CatalogPreview } from '../components/game/CatalogPreview.jsx'
import { useCatalog } from '../hooks/useCatalog.js'
import { calcDifficulty, diffColor } from '../constants.js'
import { getLogs, log } from '../lib/logger.js'
import styles from './CatalogScreen.module.css'

const SORT_OPTIONS = [
  { value: 'difficulty', label: 'Difficulty' },
  { value: 'newest', label: 'Newest' },
  { value: 'plays', label: 'Plays' },
  { value: 'likes', label: 'Likes' },
]

const CARD_HEIGHT = 84


export function CatalogScreen({ audioRef, buildPreviewConfig, onPlay, onEdit, onBack }) {
  const { songs, loading, error, myLikes, toggleLike, sortBy, setSortBy } = useCatalog({ sortBy: 'newest' })
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [previewError, setPreviewError] = useState(null)
  const [gestureAudio, setGestureAudio] = useState(null)
  const [previewNonce, setPreviewNonce] = useState(0)
  const fallbackAudioRef = useRef(null)
  const sharedAudioRef = audioRef || fallbackAudioRef
  const audioLoadAbortRef = useRef(null)

  const handlePreviewError = useCallback(msg => setPreviewError(msg), [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return songs
    return songs.filter(
      s =>
        (s.title || '').toLowerCase().includes(q) ||
        (s.creator || '').toLowerCase().includes(q)
    )
  }, [songs, query])

  const selectedIndex = useMemo(
    () => filtered.findIndex(s => s.id === selectedId),
    [filtered, selectedId]
  )
  const selected = filtered[selectedIndex] || filtered[0] || null

  useEffect(() => {
    if (selectedId == null && filtered.length) {
      setSelectedId(filtered[0].id)
    }
  }, [filtered, selectedId])

  useEffect(() => {
    if (selected && !filtered.find(s => s.id === selectedId)) {
      setSelectedId(filtered[0]?.id || null)
    }
  }, [filtered, selected, selectedId])

  const selectSong = useCallback(song => {
    if (!song) return
    setSelectedId(song.id)
  }, [])

  const setIndex = useCallback(
    idx => {
      if (!filtered.length) return
      const wrapped = ((idx % filtered.length) + filtered.length) % filtered.length
      selectSong(filtered[wrapped])
    },
    [filtered, selectSong]
  )

  const resumePreviewAudio = useCallback(() => {
    const a = sharedAudioRef.current
    if (!a) return
    a.play().catch(err => {
      log('CatalogScreen resume play catch', err.name, err.message)
    })
  }, [])

  const handleKeyDown = useCallback(
    e => {
      if (!filtered.length) {
        if (e.key === 'Escape') {
          e.preventDefault()
          onBack()
        }
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setIndex(selectedIndex + 1)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setIndex(selectedIndex - 1)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (selected) {
          if (e.shiftKey) onPlay(selected, true)
          else onPlay(selected)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onBack()
      }
    },
    [filtered, selected, selectedIndex, onPlay, onBack, setIndex]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  useEffect(() => {
    if (!selected?.audioUrl) return
    let a = sharedAudioRef.current
    if (!a) {
      a = new Audio()
      a.style.display = 'none'
      a.preload = 'auto'
      a.muted = false
      document.body.appendChild(a)
      sharedAudioRef.current = a
      log('CatalogScreen created shared audio element')
    }

    if (audioLoadAbortRef.current) audioLoadAbortRef.current.abort()
    const ctrl = new AbortController()
    audioLoadAbortRef.current = ctrl
    let cancelled = false

    const loadBlob = async () => {
      try {
        log('CatalogScreen fetching blob', selected.audioUrl.slice(0, 80))
        const resp = await fetch(selected.audioUrl, { mode: 'cors', signal: ctrl.signal })
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const blob = await resp.blob()
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        const oldSrc = a.src
        a.pause()
        a.src = url
        a.load()
        a.volume = 0.01
        a.muted = false
        await a.play()
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }
        if (oldSrc && oldSrc.startsWith('blob:')) {
          URL.revokeObjectURL(oldSrc)
        }
        setGestureAudio(a)
        log('CatalogScreen blob audio playing', selected.audioUrl.slice(0, 80), blob.type, blob.size)
      } catch (err) {
        if (err.name !== 'AbortError') {
          log('CatalogScreen blob load failed', err.name, err.message)
        }
      }
    }

    loadBlob()
    return () => {
      cancelled = true
      ctrl.abort()
    }
  }, [selected?.audioUrl])

  useEffect(() => {
    return () => {
      if (audioLoadAbortRef.current) audioLoadAbortRef.current.abort()
      const a = sharedAudioRef.current
      if (a) {
        a.pause()
        if (a.src && a.src.startsWith('blob:')) {
          URL.revokeObjectURL(a.src)
        }
        a.src = ''
        a.remove()
        sharedAudioRef.current = null
      }
    }
  }, [])

  const handleWheel = e => {
    e.preventDefault()
    if (!filtered.length) return
    if (e.deltaY > 0) setIndex(selectedIndex + 1)
    else setIndex(selectedIndex - 1)
  }

  const previewConfig = useMemo(
    () => (selected && buildPreviewConfig ? buildPreviewConfig(selected, gestureAudio) : null),
    [selected, buildPreviewConfig, gestureAudio]
  )
  const previewVisible = Boolean(selected && previewConfig && (!audioRef?.current || gestureAudio))

  const formatDuration = seconds => {
    if (!seconds || !isFinite(seconds)) return '--:--'
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const formatDate = date => {
    if (!date) return ''
    return new Date(date).toLocaleDateString()
  }

  return (
    <div className={styles.catalog}>
      <div className={styles.previewPane}>
        {selected && previewConfig && (
          <CatalogPreview
            key={previewNonce}
            config={previewConfig}
            visible={previewVisible}
            onError={handlePreviewError}
          />
        )}
        {selected && !gestureAudio && (
          <div className={styles.previewLoading}>Loading preview audio…</div>
        )}
      </div>
      <div className={styles.previewShade} />

      <div className={styles.leftColumn}>
        <Panel className={styles.toolbar} padding>
          <div className={styles.search}>
            <FieldLabel>Search</FieldLabel>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search title or creator..."
              className={styles.input}
            />
          </div>
          <div className={styles.sort}>
            <FieldLabel>Sort</FieldLabel>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} className={styles.select}>
              {SORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </Panel>

        <div className={styles.wheelTrack} onWheel={handleWheel}>
          {loading && <div className={styles.status}>Loading catalog...</div>}
          {error && <div className={styles.statusError}>{error}</div>}
          {!loading && !error && filtered.length === 0 && (
            <div className={styles.status}>No songs found</div>
          )}
          {!loading &&
            !error &&
            filtered.map((song, i) => {
              const dist = i - selectedIndex
              const offset = dist * CARD_HEIGHT
              const abs = Math.abs(dist)
              const scale = Math.max(0.65, 1 - abs * 0.12)
              const opacity = Math.max(0.3, 1 - abs * 0.28)
              return (
                <button
                  key={song.id}
                  className={`${styles.wheelCard} ${abs === 0 ? styles.wheelCardActive : ''}`}
                  style={{
                    transform: `translateY(calc(-50% + ${offset}px)) scale(${scale})`,
                    opacity,
                    zIndex: 100 - abs,
                  }}
                  onClick={() => selectSong(song)}
                  onDoubleClick={() => onPlay(song)}
                >
                  <div className={styles.wheelCardLeft}>
                    <span className={styles.wheelCardTitle}>{song.title || 'Untitled'}</span>
                    <span className={styles.wheelCardCreator}>{song.creator || 'Unknown'}</span>
                  </div>
                  <DifficultyBadge song={song} small />
                </button>
              )
            })}
        </div>

        <Panel className={styles.details} padding>
          <Button variant="ghost" size="sm" className={styles.backButton} onClick={onBack}>
            Back
          </Button>

          {selected ? (
            <>
              <div className={styles.titleRow}>
                <h2 className={styles.songTitle}>{selected.title || 'Untitled'}</h2>
                <DifficultyBadge song={selected} />
              </div>

              <div className={styles.meta}>
                <Meta label="Creator" value={selected.creator || 'Unknown'} />
                <Meta label="BPM" value={selected.bpm} />
                <Meta label="Duration" value={formatDuration(selected.duration)} />
                <Meta label="Plays" value={selected.plays || 0} />
                <Meta label="Likes" value={selected.likes || 0} />
                <Meta label="Published" value={formatDate(selected.publishedAt)} />
              </div>

              {previewError && <div className={styles.previewError}>Preview unavailable</div>}

              <div className={styles.actions}>
                <Button size="sm" variant="ghost" onClick={() => navigator.clipboard?.writeText(getLogs().join('\n'))}>
                  Copy logs
                </Button>
                <Button variant="primary" size="md" onClick={() => onPlay(selected)}>
                  Play
                </Button>
                <Button variant="secondary" size="md" onClick={() => onPlay(selected, true)}>
                  Auto
                </Button>
                <Button variant="secondary" size="md" onClick={() => onEdit(selected)}>
                  Edit
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => {
                    resumePreviewAudio()
                    setPreviewNonce(n => n + 1)
                  }}
                >
                  Preview audio
                </Button>
                <Button
                  variant={myLikes.has(selected.id) ? 'danger' : 'secondary'}
                  size="md"
                  onClick={() => toggleLike(selected)}
                >
                  {myLikes.has(selected.id) ? 'Unlike' : 'Like'}
                </Button>
              </div>
            </>
          ) : (
            <div className={styles.empty}>Select a song from the wheel</div>
          )}
        </Panel>
      </div>
    </div>
  )
}

function DifficultyBadge({ song, small }) {
  const d = calcDifficulty(song.chart, song.bpm, song.subdivision)
  return (
    <span
      className={`${styles.diffBadge} ${small ? styles.diffBadgeSmall : ''}`}
      style={{ color: diffColor(d), borderColor: diffColor(d) }}
    >
      {d.toFixed(1)}
    </span>
  )
}

function Meta({ label, value }) {
  return (
    <div className={styles.metaItem}>
      <FieldLabel>{label}</FieldLabel>
      <span className={styles.metaValue}>{value}</span>
    </div>
  )
}
