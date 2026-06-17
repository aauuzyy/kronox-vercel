import { buildChart } from '../constants.js'

const HOLD_THRESHOLD_MS = 200
const DEFAULT_SUBDIVISION = 64

export class Recorder {
  constructor(audioEl, keybinds) {
    this.audio = audioEl
    this.keybinds = keybinds
    this.bpm = 120
    this.subdivision = DEFAULT_SUBDIVISION
    this.events = []
    this.isRecording = false
    this.isPaused = false
    this.keyDown = {}
    this.onStateChange = null
    this.onChart = null
    this._keydown = this._handleKeyDown.bind(this)
    this._keyup = this._handleKeyUp.bind(this)
    this._space = this._handleSpace.bind(this)
    this._ended = this.stop.bind(this)
    this.slowModeKey = 'q'
    this.slowModeSpeed = 0.5
    this.slowModeEnabled = true
    this.isSlowMode = false
  }

  start({ bpm, subdivision = DEFAULT_SUBDIVISION, durationSec }) {
    this.bpm = bpm
    this.subdivision = subdivision
    this.events = []
    this.keyDown = {}
    this.isRecording = true
    this.isPaused = false
    this.isSlowMode = false

    window.addEventListener('keydown', this._keydown)
    window.addEventListener('keyup', this._keyup)
    window.addEventListener('keydown', this._space)
    this.audio.addEventListener('ended', this._ended)

    this.audio.currentTime = 0
    if (this.slowModeEnabled) {
      this.audio.playbackRate = this.slowModeSpeed
      this.isSlowMode = true
    } else {
      this.audio.playbackRate = 1
      this.isSlowMode = false
    }
    this.audio.play().catch(() => {})
    this._notify()
  }

  stop() {
    if (!this.isRecording) return
    this.isRecording = false
    this.isPaused = false
    this.audio.playbackRate = 1
    this.audio.pause()
    window.removeEventListener('keydown', this._keydown)
    window.removeEventListener('keyup', this._keyup)
    window.removeEventListener('keydown', this._space)
    this.audio.removeEventListener('ended', this._ended)

    const chart = this._buildChart()
    if (this.onChart) this.onChart(chart)
    this._notify()
  }

  pause() {
    if (!this.isRecording || this.isPaused) return
    this.isPaused = true
    this.audio.pause()
    this._notify()
  }

  resume() {
    if (!this.isRecording || !this.isPaused) return
    this.isPaused = false
    this.audio.play().catch(() => {})
    this._notify()
  }

  toggleSlowMode() {
    this.isSlowMode = !this.isSlowMode
    this.audio.playbackRate = this.isSlowMode ? this.slowModeSpeed : 1
    this._notify()
  }

  _notify() {
    if (this.onStateChange) this.onStateChange({
      isRecording: this.isRecording,
      isPaused: this.isPaused,
      isSlowMode: this.isSlowMode,
      slowModeSpeed: this.slowModeSpeed,
    })
  }

  _nowMs() {
    return (this.audio?.currentTime || 0) * 1000
  }

  _buildChart() {
    const durationMs = Math.max(this._nowMs(), ...this.events.map(e => e.timeMs), 0)
    const stepMs = (60000 / this.bpm) / this.subdivision
    const steps = Math.max(64, Math.ceil(durationMs / stepMs) + this.subdivision * 4)
    const chart = buildChart(steps)

    // Pair press / release events per lane
    const lanes = [[], [], [], []]
    for (const ev of this.events) {
      if (ev.lane >= 0 && ev.lane < 4) lanes[ev.lane].push(ev)
    }

    for (let lane = 0; lane < 4; lane++) {
      const queue = lanes[lane]
      for (let i = 0; i < queue.length; i++) {
        const down = queue[i]
        if (down.type !== 'down' || down.consumed) continue
        const upIdx = queue.findIndex((e, idx) => idx > i && e.type === 'up' && !e.consumed)
        const up = upIdx !== -1 ? queue[upIdx] : null
        if (up) up.consumed = true
        down.consumed = true
        const startMs = down.timeMs
        const endMs = up ? up.timeMs : startMs
        let startStep = Math.max(0, Math.min(Math.round(startMs / stepMs), chart.length - 1))
        let endStep = Math.max(0, Math.min(Math.round(endMs / stepMs), chart.length - 1))
        if (endStep < startStep) endStep = startStep
        while (startStep < chart.length - 1 && chart[startStep][lane] !== 0) startStep++
        if (endMs - startMs >= HOLD_THRESHOLD_MS && endStep > startStep) {
          chart[startStep][lane] = endStep - startStep + 1
          for (let s = startStep + 1; s <= endStep; s++) chart[s][lane] = -1
        } else {
          chart[startStep][lane] = 1
        }
      }
    }

    // Trim trailing empty rows
    let last = chart.length - 1
    while (last > 0 && chart[last].every(c => c === 0)) last--
    return chart.slice(0, last + 1)
  }

  _recordEvent(lane, type, timeMs) {
    this.events.push({ lane, type, timeMs })
    if (type === 'down') this.keyDown[lane] = { timeMs }
    else delete this.keyDown[lane]
  }

  _handleKeyDown(e) {
    if (!this.isRecording || this.isPaused) return
    if (e.repeat) return
    if (e.key === this.slowModeKey) {
      e.preventDefault()
      this.toggleSlowMode()
      return
    }
    const lane = this.keybinds.indexOf(e.key)
    if (lane === -1) return
    e.preventDefault()
    this._recordEvent(lane, 'down', this._nowMs())
  }

  _handleKeyUp(e) {
    if (!this.isRecording || this.isPaused) return
    const lane = this.keybinds.indexOf(e.key)
    if (lane === -1) return
    e.preventDefault()
    this._recordEvent(lane, 'up', this._nowMs())
  }

  _handleSpace(e) {
    if (!this.isRecording || e.code !== 'Space' || e.repeat) return
    e.preventDefault()
    if (!this.isPaused) this.pause()
    else this.resume()
  }

  handleTouchStart(lane, timeMs) {
    if (!this.isRecording || this.isPaused) return
    this._recordEvent(lane, 'down', timeMs || this._nowMs())
  }

  handleTouchEnd(lane, timeMs) {
    if (!this.isRecording || this.isPaused) return
    this._recordEvent(lane, 'up', timeMs || this._nowMs())
  }
}
