import { useState, useEffect, useRef, useCallback } from 'react'
import { Modal } from '../ui/Modal.jsx'
import { Button } from '../ui/Button.jsx'
import { FieldLabel } from '../ui/FieldLabel.jsx'
import { publishChart } from '../../supabase.js'
import { getDisplayName, saveDisplayName } from '../../lib/stats.js'
import styles from './PublishModal.module.css'

export function PublishModal({ config, onClose }) {
  const [status, setStatus] = useState('idle')
  const [errMsg, setErrMsg] = useState('')
  const [editTitle, setEditTitle] = useState(config?.songTitle || '')
  const [displayName, setDisplayName] = useState(getDisplayName)
  const [editingName, setEditingName] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const previewAudioRef = useRef(null)
  const nameInputRef = useRef(null)

  useEffect(() => {
    if (editingName) nameInputRef.current?.select()
  }, [editingName])

  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause()
        previewAudioRef.current = null
      }
    }
  }, [])

  const handlePreview = () => {
    if (previewing) {
      previewAudioRef.current?.pause()
      previewAudioRef.current = null
      setPreviewing(false)
      return
    }
    if (!config?.songFile) return
    const url = URL.createObjectURL(config.songFile)
    const audio = new Audio(url)
    audio.volume = 0.7
    audio.currentTime = 0
    audio.play()
    previewAudioRef.current = audio
    setPreviewing(true)
    audio.addEventListener('ended', () => {
      setPreviewing(false)
      previewAudioRef.current = null
    })
    setTimeout(() => {
      if (previewAudioRef.current === audio) {
        audio.pause()
        setPreviewing(false)
        previewAudioRef.current = null
      }
    }, 15000)
  }

  const commitName = () => {
    const trimmed = displayName.trim() || getDisplayName()
    setDisplayName(trimmed)
    saveDisplayName(trimmed)
    setEditingName(false)
  }

  const handlePublish = async () => {
    if (!editTitle.trim() || !confirmed) return
    setStatus('publishing')
    setErrMsg('')
    try {
      const dur = config?.audioRef?.current?.duration || 0
      await publishChart({
        audioFile: config.songFile,
        songTitle: editTitle.trim(),
        bpm: config.bpm,
        subdivision: config.subdivision,
        speed: config.speed,
        chart: config.chart,
        creator: displayName,
        duration: dur,
      })
      setStatus('success')
    } catch (err) {
      setErrMsg(err.message || 'Failed to publish.')
      setStatus('error')
    }
  }

  const noteCount = (config?.chart || []).flat().filter(v => v > 0).length

  return (
    <Modal title="Publish Chart" onClose={status === 'publishing' ? undefined : onClose} size="sm">
      <div className={styles.container}>
        {status === 'success' ? (
          <div className={styles.success}>
            <div className={styles.successIcon}>✓</div>
            <div className={styles.successTitle}>Published!</div>
            <div className={styles.successNote}>Your chart is now live in the catalog.</div>
            <Button size="md" variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : (
          <>
            <div className={styles.field}>
              <FieldLabel>Song Title</FieldLabel>
              <input
                className={styles.input}
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                disabled={status === 'publishing'}
              />
            </div>

            <div className={styles.stats}>
              <div className={styles.stat}>
                <span className={styles.statLabel}>BPM</span>
                <span className={styles.statValue}>{config?.bpm}</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Notes</span>
                <span className={styles.statValue}>{noteCount}</span>
              </div>
            </div>

            <div className={`${styles.audioBox} ${confirmed ? styles.audioBoxConfirmed : ''}`}>
              <div className={styles.audioRow}>
                <div>
                  <div className={styles.statLabel}>Audio File</div>
                  <div className={styles.audioName}>{config?.songFile?.name || '—'}</div>
                </div>
                <Button size="sm" variant={previewing ? 'primary' : 'secondary'} onClick={handlePreview}>
                  {previewing ? '■ Stop' : '▷ Preview'}
                </Button>
              </div>
              <label className={styles.confirm}>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={e => setConfirmed(e.target.checked)}
                  disabled={status === 'publishing'}
                />
                <span className={confirmed ? styles.confirmedText : ''}>I confirmed the audio matches the chart</span>
              </label>
            </div>

            <div className={styles.nameRow}>
              <span className={styles.nameLabel}>Publishing As</span>
              {editingName ? (
                <input
                  ref={nameInputRef}
                  className={styles.nameInput}
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  onBlur={commitName}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitName()
                    if (e.key === 'Escape') {
                      setDisplayName(getDisplayName())
                      setEditingName(false)
                    }
                  }}
                />
              ) : (
                <button className={styles.nameBtn} onClick={() => setEditingName(true)} title="Click to edit your display name">
                  {displayName} ✎
                </button>
              )}
            </div>

            {errMsg && <div className={styles.error}>{errMsg}</div>}

            <Button
              size="lg"
              variant="primary"
              onClick={handlePublish}
              disabled={status === 'publishing' || !editTitle.trim() || !confirmed}
            >
              {status === 'publishing' ? 'Uploading...' : '↑  Publish to Catalog'}
            </Button>
          </>
        )}
      </div>
    </Modal>
  )
}
