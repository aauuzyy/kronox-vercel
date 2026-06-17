// KRONOX constants and defaults

export const DEFAULT_LANE_KEYS = ['a', 's', ';', "'"]
export const LANE_NAMES = ['LEFT', 'DOWN', 'UP', 'RIGHT']
export const LANE_COLORS = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff']
export const DEFAULT_BEATS = 32
export const DEFAULT_BPM = 120
export const DEFAULT_SPEED = 2.0
export const DEFAULT_SUBDIVISION = 1

// RoBeats-style no-gear asymmetric windows.
// offset = songTime - noteTime (negative = early, positive = late)
export const JUDGMENT_WINDOWS = {
  perfect: { early: 20, late: 40 },
  great:   { early: 95, late: 190 },
  okay:    { early: 140, late: 280 },
}

export const JUDGE_SCORES = {
  perfect: 200,
  great: 150,
  okay: 100,
  miss: 0,
}

export const JUDGE_COLORS = {
  perfect: '#ffffff',
  great: '#aaaaaa',
  okay: '#c4b542',
  miss: '#ff6666',
}

export const GRADE_COLORS = {
  'S+': '#ffd700',
  'S': '#c0c0c0',
  'A': '#66ff99',
  'B': '#4d96ff',
  'C': '#888888',
}

export const GRADE_RANK = { 'S+': 5, 'S': 4, 'A': 3, 'B': 2, 'C': 1 }

export const STORAGE_KEYS = {
  settings: 'kronox-settings',
  guestId: 'kronox-guest-id',
  displayName: 'kronox-display-name',
  stats: 'kronox-player-stats',
  history: 'kronox-history',
}

export const SETTINGS_DEFAULTS = {
  keybinds: [...DEFAULT_LANE_KEYS],
  pauseKey: ' ',
  laneColors: [...LANE_COLORS],
  sfxVolume: 0.7,
  musicVolume: 1.0,
  speed: DEFAULT_SPEED,
  showStars: true,
  starColor: '#ffffff',
  scrollDown: true,
  flashOpacity: 0.13,
  flashColor: '#ffffff',
  audioOffset: 0,
  slowModeEnabled: true,
  slowModeKey: 'q',
  slowModeSpeed: 0.5,
}

export function calcGrade(accuracy) {
  if (accuracy >= 95) return 'S+'
  if (accuracy >= 85) return 'S'
  if (accuracy >= 75) return 'A'
  if (accuracy >= 65) return 'B'
  return 'C'
}

export function calcDifficulty(chart, bpm, subdivision) {
  if (!chart?.length) return 0
  const noteCount = chart.flat().filter(v => v > 0).length
  if (!noteCount) return 0
  const sub = subdivision || 1
  const durationSec = (chart.length / (bpm * sub)) * 60
  const notesPerSec = noteCount / Math.max(durationSec, 1)
  const countScore = Math.min(noteCount / 3000, 1) * 15
  const densityScore = Math.min(notesPerSec / 12, 1) * 15
  return Math.max(0.5, Math.round((countScore + densityScore) * 10) / 10)
}

export function diffColor(d) {
  if (d < 5) return '#66ff99'
  if (d < 10) return '#ffd93d'
  if (d < 18) return '#ff9933'
  if (d < 24) return '#ff4466'
  return '#cc44ff'
}

export function buildChart(steps) {
  return Array.from({ length: steps }, () => [0, 0, 0, 0])
}
