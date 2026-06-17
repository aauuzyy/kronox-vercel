import { STORAGE_KEYS, GRADE_RANK } from '../constants.js'
import { updatePlayerDisplayName, upsertPlayerResult } from '../supabase.js'

export function getGuestId() {
  let id = localStorage.getItem(STORAGE_KEYS.guestId)
  if (!id) {
    id = 'Guest#' + Math.floor(10000000 + Math.random() * 90000000)
    localStorage.setItem(STORAGE_KEYS.guestId, id)
  }
  return id
}

export function getDisplayName() {
  return localStorage.getItem(STORAGE_KEYS.displayName) || getGuestId()
}

export function saveDisplayName(name) {
  const resolved = name.trim() || getGuestId()
  localStorage.setItem(STORAGE_KEYS.displayName, resolved)
  updatePlayerDisplayName(getGuestId(), resolved).catch(() => {})
}

export function loadPlayerStats() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.stats) || '{}')
    // Migrate legacy great/okay keys to good/bad.
    for (const [id, data] of Object.entries(parsed)) {
      if (data && typeof data === 'object') {
        if (!('totalGood' in data) && 'totalGreat' in data) data.totalGood = data.totalGreat
        if (!('totalBad' in data) && 'totalOkay' in data) data.totalBad = data.totalOkay
      }
    }
    return parsed
  } catch {
    return {}
  }
}

export function addPlayerGameResult({ score, accuracy, grade, perfect, good, bad, miss }) {
  const guestId = getGuestId()
  const all = loadPlayerStats()
  const prev = all[guestId] || {
    totalScore: 0, gamesPlayed: 0, bestAccuracy: 0, bestGrade: 'C',
    totalPerfect: 0, totalGood: 0, totalBad: 0, totalMiss: 0,
  }
  all[guestId] = {
    totalScore: prev.totalScore + (score || 0),
    gamesPlayed: prev.gamesPlayed + 1,
    bestAccuracy: Math.max(prev.bestAccuracy, accuracy || 0),
    bestGrade: (GRADE_RANK[grade] || 0) > (GRADE_RANK[prev.bestGrade] || 0) ? grade : prev.bestGrade,
    totalPerfect: prev.totalPerfect + (perfect || 0),
    totalGood: prev.totalGood + (good || 0),
    totalBad: prev.totalBad + (bad || 0),
    totalMiss: prev.totalMiss + (miss || 0),
  }
  localStorage.setItem(STORAGE_KEYS.stats, JSON.stringify(all))

  upsertPlayerResult(guestId, getDisplayName(), {
    score, accuracy, grade, perfect, good, bad, miss,
  }).catch(() => {})
}

export function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.history) || '[]')
  } catch {
    return []
  }
}

export function saveHistoryEntry(entry) {
  const h = loadHistory()
  h.unshift(entry)
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(h.slice(0, 20)))
}
