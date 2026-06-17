import { useState, useEffect } from 'react'
import { Modal } from '../ui/Modal.jsx'
import { Button } from '../ui/Button.jsx'
import { fetchGlobalLeaderboard } from '../../supabase.js'
import { loadPlayerStats, getGuestId, getDisplayName } from '../../lib/stats.js'
import { GRADE_COLORS } from '../../constants.js'
import styles from './LeaderboardModal.module.css'

const LB_RANK_COLORS = ['#ffd700', '#c0c0c0', '#cd7f32']
const LB_MEDALS = ['🥇', '🥈', '🥉']

export function LeaderboardModal({ onClose }) {
  const [players, setPlayers] = useState([])
  const [source, setSource] = useState('loading')

  useEffect(() => {
    fetchGlobalLeaderboard()
      .then(data => {
        setPlayers(data)
        setSource('global')
      })
      .catch(() => {
        const local = Object.entries(loadPlayerStats())
          .map(([id, d]) => ({ id, ...d }))
          .sort((a, b) => b.totalScore - a.totalScore)
        setPlayers(local)
        setSource('local')
      })
  }, [])

  const clearAll = () => {
    localStorage.removeItem('kronox-player-stats')
    setPlayers(p => p.filter(x => x.id !== getGuestId()))
  }

  const guestId = getGuestId()

  return (
    <Modal
      title={source === 'global' ? 'Global · All Time' : source === 'local' ? 'Local · Global Offline' : 'Loading...'}
      onClose={onClose}
      size="lg"
    >
      <div className={styles.container}>
        {players.length > 0 && (
          <div className={styles.columns}>
            <span>Rank</span>
            <span>Player</span>
            <span>Games</span>
            <span>Best</span>
            <span>Total Score</span>
          </div>
        )}

        <div className={styles.rows}>
          {source === 'loading' ? (
            <div className={styles.empty}>Loading...</div>
          ) : players.length === 0 ? (
            <div className={styles.empty}>No scores yet — complete a song to appear here!</div>
          ) : (
            players.map((p, i) => {
              const isYou = p.id === guestId
              const isTop3 = i < 3
              const rc = LB_RANK_COLORS[i]
              return (
                <div
                  key={p.id}
                  className={`${styles.row} ${isYou ? styles.rowYou : ''} ${isTop3 ? styles.rowTop3 : ''}`}
                  style={{
                    '--row-accent': rc,
                    animationDelay: `${Math.min(i * 0.04, 0.3)}s`,
                  }}
                >
                  <div className={styles.rank}>
                    {isTop3 ? <span className={styles.medal}>{LB_MEDALS[i]}</span> : <span>#{i + 1}</span>}
                  </div>
                  <div className={styles.player}>
                    <div className={styles.nameLine}>
                      <span className={styles.name} style={{ color: isYou ? 'var(--text)' : isTop3 ? rc : 'var(--text-secondary)' }}>
                        {p.displayName || (isYou ? getDisplayName() : p.id)}
                      </span>
                      {isYou && <span className={styles.youBadge}>YOU</span>}
                    </div>
                    <div className={styles.breakdown}>
                      {(p.totalPerfect || 0).toLocaleString()}P · {(p.totalGreat || p.totalGood || 0).toLocaleString()}G · {(p.totalOkay || p.totalBad || 0).toLocaleString()}O · {(p.totalMiss || 0).toLocaleString()}M
                    </div>
                  </div>
                  <div className={styles.games}>{p.gamesPlayed}</div>
                  <div className={styles.grade} style={{ color: GRADE_COLORS[p.bestGrade] || '#888' }}>{p.bestGrade}</div>
                  <div className={styles.score} style={{ color: isTop3 ? rc : isYou ? 'var(--text-secondary)' : 'var(--text)' }}>
                    {(p.totalScore || 0).toLocaleString()}
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className={styles.footer}>
          <span className={styles.count}>
            {players.length} PLAYER{players.length !== 1 ? 'S' : ''} RANKED
          </span>
          <Button size="sm" variant="danger" onClick={clearAll}>
            Reset All Stats
          </Button>
        </div>
      </div>
    </Modal>
  )
}
