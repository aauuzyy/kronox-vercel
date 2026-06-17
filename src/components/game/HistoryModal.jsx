import { useState } from 'react'
import { Modal } from '../ui/Modal.jsx'
import { loadHistory } from '../../lib/stats.js'
import { GRADE_COLORS } from '../../constants.js'
import styles from './HistoryModal.module.css'

export function HistoryModal({ onClose }) {
  const [history] = useState(loadHistory)

  return (
    <Modal title="Last 20 Runs" onClose={onClose} size="md">
      <div className={styles.container}>
        {history.length === 0 ? (
          <div className={styles.empty}>No runs yet.</div>
        ) : (
          history.map((h, i) => (
            <div key={i} className={styles.row}>
              <span className={styles.index}>#{i + 1}</span>
              <div className={styles.song}>
                <div className={styles.title}>{h.songTitle}</div>
                <div className={styles.date}>{h.date}</div>
              </div>
              <span className={styles.grade} style={{ color: GRADE_COLORS[h.grade] || '#888' }}>{h.grade}</span>
              <span className={styles.accuracy}>{h.accuracy}%</span>
              <span className={styles.score}>{(h.score || 0).toLocaleString()}</span>
            </div>
          ))
        )}
      </div>
    </Modal>
  )
}
