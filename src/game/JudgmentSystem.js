import { JUDGMENT_WINDOWS, JUDGE_SCORES, JUDGE_COLORS } from '../constants.js'

export const JUDGE_NAMES = ['perfect', 'great', 'okay', 'miss']

function inWindow(offsetMs, window) {
  return offsetMs >= -window.early && offsetMs <= window.late
}

export class JudgmentSystem {
  constructor(windows = JUDGMENT_WINDOWS) {
    this.windows = { ...windows }
    this.inputBufferMs = 80
  }

  setWindows(windows) {
    this.windows = { ...this.windows, ...windows }
  }

  judgeOffset(offsetMs) {
    if (inWindow(offsetMs, this.windows.perfect)) return 'perfect'
    if (inWindow(offsetMs, this.windows.great)) return 'great'
    if (inWindow(offsetMs, this.windows.okay)) return 'okay'
    return null
  }

  getJudgeData(name) {
    return {
      name,
      score: JUDGE_SCORES[name] ?? 0,
      color: JUDGE_COLORS[name] ?? '#fff',
    }
  }

  /**
   * Find the best hittable note in a lane relative to songTimeMs.
   * Returns { note, offsetMs, judge } or null.
   */
  findTarget(notes, lane, songTimeMs) {
    let best = null
    let bestAbs = Infinity
    for (const note of notes) {
      if (note.lane !== lane || note.hit || note.missed || note.beingHeld) continue
      const offset = songTimeMs - note.hitTimeMs
      const abs = Math.abs(offset)
      if (inWindow(offset, this.windows.okay) && abs < bestAbs) {
        bestAbs = abs
        best = { note, offsetMs: offset, judge: this.judgeOffset(offset) }
      }
    }
    return best
  }

  /**
   * Check for notes that should be auto-missed (passed the okay window).
   */
  findMissed(notes, songTimeMs) {
    const missed = []
    for (const note of notes) {
      if (note.hit || note.missed || note.beingHeld) continue
      const late = songTimeMs - note.hitTimeMs
      if (late > this.windows.okay.late) {
        missed.push(note)
      }
    }
    return missed
  }

  /**
   * Score a hold release based on fraction held.
   */
  scoreHoldRelease(startMs, releaseMs, holdDurationMs) {
    if (holdDurationMs <= 0) return 'perfect'
    const held = Math.max(0, releaseMs - startMs)
    const frac = Math.min(1, held / holdDurationMs)
    if (frac >= 0.98) return 'perfect'
    if (frac >= 0.75) return 'great'
    if (frac >= 0.45) return 'okay'
    return 'miss'
  }
}
