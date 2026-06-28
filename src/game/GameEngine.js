import { AudioEngine } from '../audio/AudioEngine.js'
import { Highway3DRenderer } from './renderers/Highway3DRenderer.js'

const DEFAULT_LANE_COUNT = 4
const BASE_SCROLL_SPEED = 380 // pixels per second, matches KRONOX 2.0
const RECEPTOR_Y_RATIO = 0.82
const NOTE_RADIUS_RATIO = 0.40
const RECEPTOR_SIZE_RATIO = 0.82

// KRONOX 2.0 / StepMania-style symmetric timing windows (in milliseconds)
const TIMING_WINDOWS = {
  perfect: 45,
  good: 90,
  bad: 135,
  miss: 180,
}

// Hold releases are judged a little more leniently than presses.
const RELEASE_WINDOW_MULT = 1.25

const SCORE_VALUES = {
  perfect: 300,
  good: 100,
  bad: 50,
  miss: 0,
}

const JUDGE_COLORS = {
  perfect: '#ffffff',
  good: '#aaaaaa',
  bad: '#c4b542',
  miss: '#ff6666',
}

function inWindow(offsetMs, windowMs) {
  return Math.abs(offsetMs) <= windowMs
}

function judgeOffset(offsetMs) {
  if (inWindow(offsetMs, TIMING_WINDOWS.perfect)) return 'perfect'
  if (inWindow(offsetMs, TIMING_WINDOWS.good)) return 'good'
  if (inWindow(offsetMs, TIMING_WINDOWS.bad)) return 'bad'
  if (inWindow(offsetMs, TIMING_WINDOWS.miss)) return 'miss'
  return null
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace('#', '')
  const bigint = parseInt(clean, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return `rgba(${r},${g},${b},${alpha})`
}

export class GameEngine {
  constructor(canvas, callbacks) {
    this.canvas = canvas
    this.ctx = null
    this.renderer3d = null
    this.callbacks = callbacks || {}
    this.audio = new AudioEngine()

    this.config = null
    this.state = 'idle' // idle | countdown | playing | paused | ended

    this.notes = []
    this.noteIndex = 0

    this.score = 0
    this.combo = 0
    this.maxCombo = 0
    this.multiplier = 1
    this.health = 80
    this.judgments = { perfect: 0, good: 0, bad: 0, miss: 0 }
    this.offsets = []

    this.laneCount = DEFAULT_LANE_COUNT
    this.lanePressed = Array(DEFAULT_LANE_COUNT).fill(false)
    this.receptorPressed = Array(DEFAULT_LANE_COUNT).fill(false)
    this.hitEffects = []
    this.laneFlashes = []

    this.rafId = null
    this._loopFn = this.loop.bind(this)
    this.lastMissCheck = -1
    this.lastFrameTime = 0
    this.audioStartPerf = 0
    this.audioStartTime = 0
    this.lastHud = null

    this._downHandler = this.onKeyDown.bind(this)
    this._upHandler = this.onKeyUp.bind(this)
    this._touchStart = null
    this._touchEnd = null

    this.resize()
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect()
    this.dpr = window.devicePixelRatio || 1
    // If the canvas hasn't been laid out yet, fall back to the viewport so the
    // playfield is never drawn at 0x0.
    this.width = rect.width || window.innerWidth
    this.height = rect.height || Math.max(window.innerHeight - 56, 100)
    this.canvas.width = Math.floor(this.width * this.dpr)
    this.canvas.height = Math.floor(this.height * this.dpr)
    if (this.ctx) {
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    }
    if (this.renderer3d) {
      this.renderer3d.resize(this.width, this.height, this.dpr)
    }

    this.laneWidth = Math.min(this.width * (0.68 / this.laneCount), this.laneCount === 4 ? 125 : 105)
    this.receptorSize = this.laneWidth * RECEPTOR_SIZE_RATIO
    this.playfieldWidth = this.laneWidth * this.laneCount
    this.playfieldX = (this.width - this.playfieldWidth) / 2
    this.receptorY = this.height * RECEPTOR_Y_RATIO
    this.noteRadius = this.laneWidth * NOTE_RADIUS_RATIO
  }

  _convertChart(chart, bpm, subdivision) {
    if (typeof chart === 'string') {
      try {
        chart = JSON.parse(chart)
      } catch {
        return []
      }
    }
    if (!Array.isArray(chart) || !chart.length) return []
    const sub = Number(subdivision) || 1
    const stepMs = (60000 / Number(bpm || 120)) / sub
    const notes = []
    for (let b = 0; b < chart.length; b++) {
      const row = chart[b]
      if (!row) continue
      for (let l = 0; l < this.laneCount; l++) {
        const cell = row[l] ?? 0
        if (cell === 1) {
          notes.push({ time: (b * stepMs) / 1000, lane: l, type: 'tap', hit: false, missed: false })
        } else if (cell > 1) {
          const durationSec = (cell - 1) * stepMs / 1000
          notes.push({
            time: (b * stepMs) / 1000,
            lane: l,
            type: 'hold',
            durationSec,
            headHit: false,
            beingHeld: false,
            released: false,
            missed: false,
          })
        }
      }
    }
    return notes.sort((a, b) => a.time - b.time)
  }

  setMusicVolume(volume) {
    this.audio.setVolumes({ musicVolume: volume })
  }

  _initRenderer() {
    const want3D = this.config?.renderer === '3d' && this.laneCount === 4
    if (want3D) {
      if (this.ctx) {
        this.ctx = null
      }
      this.renderer3d = new Highway3DRenderer(this.canvas, this.config)
      this.renderer3d.resize(this.width, this.height, this.dpr)
    } else {
      if (this.renderer3d) {
        this.renderer3d.dispose()
        this.renderer3d = null
      }
      this.ctx = this.canvas.getContext('2d', { alpha: false })
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    }
  }

  async start(config) {
    this.config = config
    this.laneCount = config.laneCount || config.keybinds?.length || DEFAULT_LANE_COUNT
    this._initRenderer()
    this.state = 'idle'
    this.notes = this._convertChart(config.chart, config.bpm, config.subdivision)
    if (this.renderer3d) this.renderer3d.prepareNotes(this.notes)
    this.noteIndex = 0

    this.score = 0
    this.combo = 0
    this.maxCombo = 0
    this.multiplier = 1
    this.health = 80
    this.judgments = { perfect: 0, good: 0, bad: 0, miss: 0 }
    this.offsets = []
    this.hitEffects = []
    this.lastMissCheck = -1

    this.lanePressed = Array(this.laneCount).fill(false)
    this.receptorPressed = Array(this.laneCount).fill(false)
    this.laneFlashes = []

    this.audio.setOffset(config.audioOffset || 0)
    this.audio.setVolumes({ musicVolume: config.musicVolume, sfxVolume: config.sfxVolume })
    this.audio.isPreview = config.isPreview || false
    this.audio.useSimpleAudio = config.useSimpleAudio || false
    this.audio.onEnded = () => this.endGame('complete')
    this.audio.onLoadProgress = (pct) => {
      if (this.callbacks.onLoadProgress) this.callbacks.onLoadProgress(pct)
    }
    await this.audio.loadMusic(config.audioElement || config.audioUrl || config.songFile)
    this.audio.onLoadProgress = null
    await this.audio.loadSfx()

    if (!config.disableInput) {
      this._bindInput()
    }

    this.lastFrameTime = performance.now()
    this.rafId = requestAnimationFrame(this._loopFn)
  }

  beginPlay(startOffsetMs = 0) {
    this.state = 'playing'
    const promise = this.audio.play(startOffsetMs).catch(err => {
      if (!(this.config?.isPreview && err.name === 'AbortError')) {
        console.error('Could not start audio playback', err)
      }
      if (!this.config?.isPreview) {
        alert('Audio playback was blocked. Please click Play again.')
      }
      this.endGame('quit')
      throw err
    })
    this.audioStartPerf = performance.now()
    this.audioStartTime = startOffsetMs / 1000
    this._updateHud(true)
    return promise
  }

  pause() {
    if (this.state !== 'playing') return
    this.state = 'paused'
    this.audio.pause()
    if (this.callbacks.onPause) this.callbacks.onPause()
  }

  resume() {
    if (this.state !== 'paused') return
    this.state = 'playing'
    this.audio.resume()
    this.audioStartPerf = performance.now()
    this.audioStartTime = this.audio.getCurrentTimeMs() / 1000
    this.lastFrameTime = performance.now()
    if (this.callbacks.onResume) this.callbacks.onResume()
  }

  stop() {
    if (this.rafId) cancelAnimationFrame(this.rafId)
    this.rafId = null
    this._unbindInput()
    this.audio.stop()
    this.state = 'idle'
    if (this.renderer3d) {
      this.renderer3d.dispose()
      this.renderer3d = null
    }
  }

  endGame(reason) {
    if (this.state === 'ended') return
    this.state = 'ended'
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this._unbindInput()
    this.audio.stop()

    const total = this.judgments.perfect + this.judgments.good + this.judgments.bad + this.judgments.miss
    const accuracy = total > 0
      ? ((this.judgments.perfect * 1 + this.judgments.good * 0.66 + this.judgments.bad * 0.33) / total) * 100
      : 0

    const stats = {
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      multiplier: this.multiplier,
      health: this.health,
      perfect: this.judgments.perfect,
      good: this.judgments.good,
      bad: this.judgments.bad,
      miss: this.judgments.miss,
      totalHits: total,
      accuracy: Math.round(accuracy),
      duration: this.audio.music?.duration || 0,
      songTitle: this.config?.songTitle || '',
      hitOffsets: this.offsets,
      autoplay: this.config?.autoplay,
    }

    if (this.callbacks.onEnd) this.callbacks.onEnd(reason, stats)
  }

  _bindInput() {
    window.addEventListener('keydown', this._downHandler)
    window.addEventListener('keyup', this._upHandler)

    const onTouchStart = (e) => {
      if (this.state !== 'playing' && this.state !== 'countdown') return
      for (const touch of e.changedTouches) {
        const lane = this._laneFromTouch(touch.clientX, touch.clientY)
        if (lane >= 0 && !this.lanePressed[lane]) {
          e.preventDefault()
          this.lanePressed[lane] = true
          this.receptorPressed[lane] = true
          if (this.state === 'playing') this.handleInput(lane)
        }
      }
    }
    const onTouchEnd = (e) => {
      for (const touch of e.changedTouches) {
        const lane = this._laneFromTouch(touch.clientX, touch.clientY)
        if (lane >= 0) {
          this.lanePressed[lane] = false
          this.receptorPressed[lane] = false
          if (this.state === 'playing') this.handleRelease(lane)
        }
      }
    }
    this.canvas.addEventListener('touchstart', onTouchStart, { passive: false })
    this.canvas.addEventListener('touchend', onTouchEnd, { passive: false })
    this._touchStart = onTouchStart
    this._touchEnd = onTouchEnd
  }

  _unbindInput() {
    window.removeEventListener('keydown', this._downHandler)
    window.removeEventListener('keyup', this._upHandler)
    if (this._touchStart) this.canvas.removeEventListener('touchstart', this._touchStart)
    if (this._touchEnd) this.canvas.removeEventListener('touchend', this._touchEnd)
  }

  _laneFromTouch(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    if (y < rect.height * 0.15) return -1
    for (let l = 0; l < this.laneCount; l++) {
      const lx = this.playfieldX + l * this.laneWidth
      if (x >= lx && x <= lx + this.laneWidth) return l
    }
    return -1
  }

  onKeyDown(e) {
    const pauseKey = this.config?.pauseKey || ' '
    const isPause = pauseKey === ' ' ? e.code === 'Space' : e.key === pauseKey
    if (isPause) {
      if (this.state === 'playing' || this.state === 'paused') {
        e.preventDefault()
        if (this.state === 'playing') this.pause()
        else this.resume()
        return
      }
    }

    if (this.state !== 'playing' && this.state !== 'countdown') return

    const binds = this.config?.keybinds || ['a', 's', ';', "'"]
    const lane = binds.indexOf(e.key)
    if (lane === -1 || this.lanePressed[lane]) return

    e.preventDefault()
    this.lanePressed[lane] = true
    this.receptorPressed[lane] = true

    if (this.state === 'playing') {
      if (this.config?.autoplay) return
      this.handleInput(lane)
    }
  }

  onKeyUp(e) {
    const binds = this.config?.keybinds || ['a', 's', ';', "'"]
    const lane = binds.indexOf(e.key)
    if (lane !== -1) {
      this.lanePressed[lane] = false
      this.receptorPressed[lane] = false
      if (this.state === 'playing') this.handleRelease(lane)
    }
  }

  _getNowSec() {
    // AudioEngine already applies input offset correction.
    return this.audio.getCurrentTimeMs() / 1000
  }

  handleInput(lane) {
    if (!this.notes.length) return
    const now = this._getNowSec()

    let closest = null
    let closestDist = Infinity
    for (let i = this.noteIndex; i < this.notes.length; i++) {
      const note = this.notes[i]
      if (note.lane !== lane) continue
      if (note.type === 'tap' && (note.hit || note.missed)) continue
      if (note.type === 'hold' && (note.headHit || note.missed)) continue
      const dist = Math.abs(now - note.time)
      if (dist < closestDist && dist <= TIMING_WINDOWS.miss / 1000) {
        closestDist = dist
        closest = note
      }
    }

    if (!closest) return // empty taps / ghost taps are ignored

    const offMs = (now - closest.time) * 1000
    const judgment = judgeOffset(offMs) || 'miss'
    const speedMult = Number(this.config?.speed) || 1
    const scrollSpeed = BASE_SCROLL_SPEED * speedMult
    const x = this.playfieldX + closest.lane * this.laneWidth + this.laneWidth / 2
    const y = this.receptorY - (closest.time - now) * scrollSpeed

    if (closest.type === 'hold') {
      if (judgment === 'miss') {
        closest.missed = true
      } else {
        closest.headHit = true
        closest.beingHeld = true
      }
    } else {
      closest.hit = true
    }

    this._applyJudgment(closest, judgment, offMs, lane, x, y, false)
  }

  handleRelease(lane) {
    if (this.state !== 'playing') return
    const now = this._getNowSec()
    const speedMult = Number(this.config?.speed) || 1
    const scrollSpeed = BASE_SCROLL_SPEED * speedMult

    for (let i = this.noteIndex; i < this.notes.length; i++) {
      const note = this.notes[i]
      if (note.type !== 'hold' || note.lane !== lane) continue
      if (!note.beingHeld || note.released || note.missed) continue

      const endTime = note.time + note.durationSec
      const offMs = (now - endTime) * 1000
      const abs = Math.abs(offMs)
      let judgment = 'miss'
      if (abs <= TIMING_WINDOWS.perfect * RELEASE_WINDOW_MULT) judgment = 'perfect'
      else if (abs <= TIMING_WINDOWS.good * RELEASE_WINDOW_MULT) judgment = 'good'
      else if (abs <= TIMING_WINDOWS.bad * RELEASE_WINDOW_MULT) judgment = 'bad'
      else if (abs <= TIMING_WINDOWS.miss * RELEASE_WINDOW_MULT) judgment = 'miss'
      const x = this.playfieldX + note.lane * this.laneWidth + this.laneWidth / 2
      const y = this.receptorY - (endTime - now) * scrollSpeed

      note.released = true
      note.beingHeld = false
      if (judgment === 'miss') note.missed = true

      this._applyJudgment(note, judgment, offMs, lane, x, y, true)
      break
    }
  }

  _applyJudgment(note, judgment, offMs, lane, x, y, isRelease) {
    this.judgments[judgment]++

    if (judgment === 'miss') {
      this.combo = 0
      this.multiplier = 1
      this.health = Math.max(0, this.health - 10)
    } else {
      if (!isRelease) {
        this.combo++
        this.maxCombo = Math.max(this.maxCombo, this.combo)
        this.multiplier = 1 + Math.floor(this.combo / 50)
      }
      this.score += SCORE_VALUES[judgment] * this.multiplier
      this.offsets.push(Math.round(offMs))
      if (judgment === 'perfect') this.health = Math.min(100, this.health + 3)
      else if (judgment === 'good') this.health = Math.min(100, this.health + 3)
      else this.health = Math.min(100, this.health + 1)

      const laneColors = this.config?.laneColors || ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff']
      this.hitEffects.push({ x, y, birth: performance.now(), judgment, color: laneColors[note.lane] })
      if (judgment !== 'miss') {
        this.laneFlashes.push({ lane: note.lane, birth: performance.now() })
      }
      if (!isRelease) {
        this.audio.playHitSfx()
      }
    }

    this._showJudge(judgment, offMs, lane)
    this._updateHud(true)

    if (this.health <= 0) this.endGame('death')
  }

  _processAutoplay() {
    const now = this._getNowSec()
    const laneColors = this.config?.laneColors || ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff']
    const speedMult = Number(this.config?.speed) || 1
    const scrollSpeed = BASE_SCROLL_SPEED * speedMult

    for (let i = this.noteIndex; i < this.notes.length; i++) {
      const note = this.notes[i]
      if (note.type === 'tap' && (note.hit || note.missed)) continue
      if (note.type === 'hold' && (note.missed || note.released)) continue

      const x = this.playfieldX + note.lane * this.laneWidth + this.laneWidth / 2

      if (note.type === 'tap') {
        if (note.time > now + 0.008) continue
        const y = this.receptorY - (note.time - now) * scrollSpeed
        note.hit = true
        this.receptorPressed[note.lane] = true
        this._applyJudgment(note, 'perfect', 0, note.lane, x, y, false)
        setTimeout(() => { this.receptorPressed[note.lane] = false }, 120)
      } else if (note.type === 'hold') {
        if (!note.headHit && note.time <= now + 0.008) {
          const y = this.receptorY - (note.time - now) * scrollSpeed
          note.headHit = true
          note.beingHeld = true
          this.receptorPressed[note.lane] = true
          this._applyJudgment(note, 'perfect', 0, note.lane, x, y, false)
        }
        if (note.headHit && note.beingHeld && !note.released && note.time + note.durationSec <= now + 0.008) {
          const endTime = note.time + note.durationSec
          const y = this.receptorY - (endTime - now) * scrollSpeed
          note.released = true
          note.beingHeld = false
          this.receptorPressed[note.lane] = false
          this._applyJudgment(note, 'perfect', 0, note.lane, x, y, true)
        }
      }
    }
  }

  _missNote(note) {
    this.judgments.miss++
    this.combo = 0
    this.multiplier = 1
    this.health = Math.max(0, this.health - 10)
    this._showJudge('miss', 0, note.lane)
    this._updateHud(true)
  }

  _autoMiss() {
    if (this.state !== 'playing') return
    const now = this._getNowSec()
    if (now - this.lastMissCheck < 0.016) return
    this.lastMissCheck = now

    while (this.noteIndex < this.notes.length) {
      const note = this.notes[this.noteIndex]
      const isDone = (note.type === 'tap' && note.hit) || note.missed || (note.type === 'hold' && note.released)
      if (isDone) {
        this.noteIndex++
        continue
      }

      if (note.type === 'hold') {
        if (!note.headHit && now > note.time + TIMING_WINDOWS.miss / 1000) {
          note.missed = true
          this._missNote(note)
          this.noteIndex++
        } else if (note.headHit && !note.released && now > note.time + note.durationSec + (TIMING_WINDOWS.miss * RELEASE_WINDOW_MULT) / 1000) {
          note.missed = true
          note.beingHeld = false
          this._missNote(note)
          this.noteIndex++
        } else {
          break
        }
      } else {
        if (now > note.time + TIMING_WINDOWS.miss / 1000) {
          note.missed = true
          this._missNote(note)
          this.noteIndex++
        } else {
          break
        }
      }

      if (this.health <= 0) {
        this.endGame('death')
        return
      }
    }
  }

  _showJudge(judgment, offMs, lane) {
    if (this.callbacks.onJudge) {
      this.callbacks.onJudge(judgment, JUDGE_COLORS[judgment], offMs)
    }
  }

  _updateHud(force = false) {
    if (!this.callbacks.onHud) return
    const hud = {
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      multiplier: this.multiplier,
      health: this.health,
      perfect: this.judgments.perfect,
      good: this.judgments.good,
      bad: this.judgments.bad,
      miss: this.judgments.miss,
    }
    if (!force && this.lastHud && JSON.stringify(this.lastHud) === JSON.stringify(hud)) return
    this.lastHud = hud
    this.callbacks.onHud(hud)
  }

  loop() {
    this.rafId = requestAnimationFrame(this._loopFn)

    if (this.state === 'playing') {
      this._autoMiss()
      if (this.config?.autoplay) this._processAutoplay()
      this._updateProgress()
      this._updateHud()
    }

    this.render()
  }

  _updateProgress() {
    if (!this.callbacks.onProgress || !this.audio.music) return
    this.callbacks.onProgress({
      current: this.audio.music.currentTime || 0,
      duration: this.audio.music.duration || 0,
    })
  }

  _getRenderState() {
    return {
      now: this._getNowSec(),
      notes: this.notes,
      noteIndex: this.noteIndex,
      receptorPressed: this.receptorPressed,
      laneColors: this.config?.laneColors,
      speed: this.config?.speed,
      scrollDown: this.config?.scrollDown,
      flashOpacity: this.config?.flashOpacity,
      hitEffects: this.hitEffects,
      laneFlashes: this.laneFlashes,
      layout: {
        playfieldX: this.playfieldX,
        laneWidth: this.laneWidth,
        receptorY: this.receptorY,
        noteRadius: this.noteRadius,
        receptorSize: this.receptorSize,
        width: this.width,
        height: this.height,
      },
    }
  }

  render() {
    if (this.renderer3d) {
      this.renderer3d.render(this._getRenderState())
      return
    }

    const ctx = this.ctx
    const w = this.width
    const h = this.height

    if (!ctx) return

    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, w, h)

    // Draw the playfield even during countdown/idle so it is never invisible.
    if (!this.config) return

    // Lane lines
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.lineWidth = 1
    for (let i = 0; i <= this.laneCount; i++) {
      const x = this.playfieldX + i * this.laneWidth
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
    }

    // Receptors
    const laneColors = this.config?.laneColors || ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff']
    for (let i = 0; i < this.laneCount; i++) {
      const x = this.playfieldX + i * this.laneWidth + this.laneWidth / 2
      const pressed = this.receptorPressed[i]
      ctx.beginPath()
      ctx.arc(x, this.receptorY, this.receptorSize / 2, 0, Math.PI * 2)
      ctx.fillStyle = pressed ? laneColors[i] + '55' : laneColors[i] + '22'
      ctx.fill()
      ctx.strokeStyle = pressed ? laneColors[i] : laneColors[i]
      ctx.lineWidth = 2
      ctx.stroke()
    }

    // Notes & holds
    if (this.notes.length) {
      const now = this._getNowSec()
      const speedMult = Number(this.config?.speed) || 1
      const scrollSpeed = BASE_SCROLL_SPEED * speedMult

      for (let i = this.noteIndex; i < this.notes.length; i++) {
        const note = this.notes[i]
        if (note.type === 'tap' && (note.hit || note.missed)) continue
        if (note.type === 'hold' && note.missed) continue

        const x = this.playfieldX + note.lane * this.laneWidth + this.laneWidth / 2
        const color = laneColors[note.lane]

        if (note.type === 'hold') {
          const headTimeDiff = note.time - now
          const tailTimeDiff = (note.time + note.durationSec) - now
          const headY = this.receptorY - headTimeDiff * scrollSpeed
          const tailY = this.receptorY - tailTimeDiff * scrollSpeed

          // Culling
          if (headY < -this.noteRadius * 2 && tailY < -this.noteRadius * 2) {
            if (headTimeDiff > 0) break
            continue
          }
          if (headY > h + this.noteRadius * 2 && tailY > h + this.noteRadius * 2) continue

          // Clamp the head at the receptors while the hold is active so the
          // trail doesn't extend past them.
          const drawHeadY = Math.min(headY, this.receptorY)

          // Trail (rounded on both ends; head circle covers the bottom end)
          if (!note.released) {
            ctx.beginPath()
            ctx.moveTo(x, tailY)
            ctx.lineTo(x, drawHeadY)
            ctx.strokeStyle = color + 'aa'
            ctx.lineWidth = this.noteRadius * 2
            ctx.lineCap = 'round'
            ctx.lineJoin = 'round'
            ctx.stroke()
          }

          // Head
          if (!note.headHit || note.beingHeld) {
            ctx.beginPath()
            ctx.arc(x, drawHeadY, this.noteRadius, 0, Math.PI * 2)
            ctx.fillStyle = note.beingHeld ? color : color + 'dd'
            ctx.fill()
            ctx.beginPath()
            ctx.arc(x, drawHeadY, this.noteRadius, 0, Math.PI * 2)
            ctx.strokeStyle = 'rgba(255,255,255,0.4)'
            ctx.lineWidth = 1
            ctx.stroke()
          }
        } else {
          const timeDiff = note.time - now
          const y = this.receptorY - timeDiff * scrollSpeed

          // Culling
          if (y < -this.noteRadius * 2 || y > h + this.noteRadius * 2) {
            if (timeDiff > 0) break
            continue
          }

          ctx.beginPath()
          ctx.arc(x, y, this.noteRadius, 0, Math.PI * 2)
          ctx.fillStyle = color
          ctx.fill()

          ctx.beginPath()
          ctx.arc(x, y, this.noteRadius, 0, Math.PI * 2)
          ctx.strokeStyle = 'rgba(255,255,255,0.4)'
          ctx.lineWidth = 1
          ctx.stroke()
        }
      }
    }

    // Lane flashes
    this._renderLaneFlashes()

    // Hit effects
    this._renderHitEffects()
  }

  _renderLaneFlashes() {
    const ctx = this.ctx
    const h = this.height
    const flashOpacity = this.config?.flashOpacity ?? 0.13
    const laneColors = this.config?.laneColors || ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff']
    const flashDuration = 150
    const nowPerf = performance.now()
    if (!flashOpacity || !this.laneFlashes.length) return
    this.laneFlashes = this.laneFlashes.filter(f => nowPerf - f.birth < flashDuration)
    for (const f of this.laneFlashes) {
      const age = nowPerf - f.birth
      const alpha = flashOpacity * (1 - age / flashDuration)
      const x = this.playfieldX + f.lane * this.laneWidth
      ctx.fillStyle = hexToRgba(laneColors[f.lane], alpha)
      ctx.fillRect(x, 0, this.laneWidth, h)
    }
  }

  _renderHitEffects() {
    const ctx = this.ctx
    const nowPerf = performance.now()
    this.hitEffects = this.hitEffects.filter(fx => {
      const age = nowPerf - fx.birth
      const duration = 140
      const progress = age / duration
      if (progress >= 1) return false

      const eased = 1 - (1 - progress) * (1 - progress)
      const startRadius = this.noteRadius * 0.8
      const endRadius = this.noteRadius * 1.4
      const radius = startRadius + (endRadius - startRadius) * eased
      const opacity = 0.45 * (1 - progress)

      const color = fx.color || '255,255,255'
      const rgb = color.startsWith('#') ? color : '255,255,255'
      ctx.beginPath()
      ctx.arc(fx.x, fx.y, radius, 0, Math.PI * 2)
      ctx.fillStyle = rgb.startsWith('#')
        ? hexToRgba(rgb, opacity)
        : `rgba(255,255,255,${opacity})`
      ctx.fill()

      return true
    })
  }
}
