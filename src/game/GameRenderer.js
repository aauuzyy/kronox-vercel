export class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.dpr = window.devicePixelRatio || 1
    this.width = 0
    this.height = 0
    this.stars = []
    this.particles = []
    this.beatIntensity = 0
    this.beatBase = 0
    this.starColor = '#ffffff'
    this.starsEnabled = true
    this.scrollDown = true
    this._particlePool = []
    this._layoutCache = null
    this._layoutCacheKey = null
    this.resize()
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect()
    this.dpr = window.devicePixelRatio || 1
    this.width = rect.width
    this.height = rect.height
    this.canvas.width = Math.floor(rect.width * this.dpr)
    this.canvas.height = Math.floor(rect.height * this.dpr)
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this._layoutCache = null
    this._layoutCacheKey = null
    this._initStars()
  }

  _initStars() {
    const isMobile = this.width < 600
    const laneW = isMobile ? Math.floor((this.width - 16) / 4) : 90
    const laneGap = isMobile ? 4 : 8
    const totalW = laneW * 4 + laneGap * 3
    const cx = this.width / 2
    const leftEdge = cx - totalW / 2 - laneW
    const rightStart = cx + totalW / 2 + laneW

    const spawn = () => {
      const side = Math.random() < 0.5 ? 'left' : 'right'
      const x = side === 'left'
        ? Math.random() * Math.max(1, leftEdge - 10)
        : rightStart + 10 + Math.random() * Math.max(1, this.width - rightStart - 10)
      return {
        x, y: Math.random() * this.height,
        r: 0.4 + Math.random() * 1.0,
        dx: (Math.random() - 0.5) * 0.12,
        dy: (Math.random() - 0.5) * 0.08,
        base: 0.03 + Math.random() * 0.10,
        speed: 0.4 + Math.random() * 0.9,
        phase: Math.random() * Math.PI * 2,
      }
    }

    this.stars = Array.from({ length: 55 }, spawn)
    this.stars._leftEdge = leftEdge
    this.stars._rightStart = rightStart
    this.stars._spawn = spawn
  }

  _acquireParticle(initializer) {
    const p = this._particlePool.pop() || {}
    for (const key in p) delete p[key]
    Object.assign(p, initializer)
    return p
  }

  setOptions({ starColor, starsEnabled, scrollDown }) {
    if (starColor !== undefined) this.starColor = starColor
    if (starsEnabled !== undefined) this.starsEnabled = starsEnabled
    if (scrollDown !== undefined) this.scrollDown = scrollDown
  }

  _updateBeatIntensity(timeDomainData) {
    if (!timeDomainData) {
      this.beatIntensity *= 0.92
      return
    }
    let sum = 0
    for (let i = 0; i < timeDomainData.length; i++) {
      const v = (timeDomainData[i] - 128) / 128
      sum += v * v
    }
    const rms = Math.sqrt(sum / timeDomainData.length)
    if (this.beatBase === 0) this.beatBase = Math.max(rms, 0.001)
    this.beatBase = this.beatBase * 0.997 + rms * 0.003
    const onset = Math.max(0, (rms - this.beatBase * 0.5) / Math.max(this.beatBase * 1.5, 0.001))
    const target = Math.min(onset, 1)
    this.beatIntensity = target > this.beatIntensity
      ? this.beatIntensity * 0.4 + target * 0.6
      : this.beatIntensity * 0.82 + target * 0.18
  }

  _drawStars() {
    if (!this.starsEnabled) return
    const ctx = this.ctx
    const now = performance.now() / 1000
    const sc = this.starColor
    const beat = this.beatIntensity
    const hexAlpha = Math.round(beat * 0.9 * 255).toString(16).padStart(2, '0')

    ctx.fillStyle = sc
    ctx.shadowColor = sc + hexAlpha

    for (let i = 0; i < this.stars.length; i++) {
      const st = this.stars[i]
      st.x = (st.x + st.dx + this.width) % this.width
      st.y = (st.y + st.dy + this.height) % this.height
      if (st.x > this.stars._leftEdge && st.x < this.stars._rightStart) {
        const fresh = this.stars._spawn()
        Object.assign(st, fresh)
        continue
      }
      const twinkle = 0.5 + 0.5 * Math.sin(now * st.speed + st.phase)
      const alpha = Math.min(st.base * (0.5 + 0.5 * twinkle) + beat * 0.80, 0.95)
      const glowBlur = beat * 20 * twinkle
      const dotR = st.r + beat * 2.5 * twinkle

      ctx.globalAlpha = alpha
      ctx.shadowBlur = glowBlur
      ctx.beginPath()
      ctx.arc(st.x, st.y, dotR, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.globalAlpha = 1
    ctx.shadowBlur = 0
  }

  _layout(config) {
    const key = `${this.width}|${this.height}|${this.scrollDown ? 1 : 0}`
    if (this._layoutCache && this._layoutCacheKey === key) return this._layoutCache
    const isMobile = this.width < 600
    const laneW = isMobile ? Math.floor((this.width - 16) / 4) : 90
    const laneGap = isMobile ? 4 : 8
    const totalW = laneW * 4 + laneGap * 3
    // Receptors are locked to a fixed on-screen margin so they are always visible.
    const margin = isMobile ? 110 : 130
    const receptorBottom = margin
    const noteSize = isMobile ? Math.round(laneW * 0.82) : 74
    const centerX = this.width / 2
    const leftX = centerX - totalW / 2
    this._layoutCache = { laneW, laneGap, totalW, receptorBottom, noteSize, centerX, leftX, isMobile }
    this._layoutCacheKey = key
    return this._layoutCache
  }

  _laneX(layout, lane) {
    return layout.leftX + lane * (layout.laneW + layout.laneGap)
  }

  _noteY(layout, timeToHitMs, speed) {
    return layout.receptorBottom + timeToHitMs * speed * 0.35
  }

  _toScreenY(yFromBottom) {
    // Downscroll: receptor is at the bottom, so distance-from-bottom maps to (height - y)
    return this.scrollDown ? this.height - yFromBottom : yFromBottom
  }

  _drawHighway(ctx, layout, laneColors, receptorPressed) {
    for (let l = 0; l < 4; l++) {
      const x = this._laneX(layout, l)
      const color = laneColors[l]
      ctx.fillStyle = color + '14'
      ctx.fillRect(x, 0, layout.laneW, this.height)
      ctx.strokeStyle = color + '30'
      ctx.lineWidth = 1
      ctx.strokeRect(x, 0, layout.laneW, this.height)

      // Receptor
      const rx = x + layout.laneW / 2
      const ry = this._toScreenY(layout.receptorBottom)
      const pressed = receptorPressed[l]
      ctx.beginPath()
      ctx.arc(rx, ry, layout.noteSize / 2, 0, Math.PI * 2)
      ctx.fillStyle = pressed ? color + '45' : color + '12'
      ctx.fill()
      ctx.strokeStyle = pressed ? color : color + '80'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    // Judgment line: a single horizontal line aligned with the receptor centers.
    const receptorY = this._toScreenY(layout.receptorBottom)
    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.lineWidth = 2
    ctx.shadowColor = 'rgba(255,255,255,0.35)'
    ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.moveTo(layout.leftX - layout.laneGap, receptorY)
    ctx.lineTo(layout.leftX + layout.totalW + layout.laneGap, receptorY)
    ctx.stroke()
    ctx.restore()
  }

  _drawNote(ctx, note, layout, laneColors, songTimeMs, speed) {
    if (note.hit || note.missed || note.beingHeld) return
    const timeToHit = note.hitTimeMs - songTimeMs
    const yFromBottom = this._noteY(layout, timeToHit, speed)
    const laneColor = laneColors[note.lane]

    const x = this._laneX(layout, note.lane) + layout.laneW / 2
    const drawY = this._toScreenY(yFromBottom)
    ctx.beginPath()
    ctx.arc(x, drawY, layout.noteSize / 2, 0, Math.PI * 2)
    ctx.fillStyle = laneColor
    ctx.fill()

    // Fade out if late
    const late = songTimeMs - note.hitTimeMs
    if (late > 0) {
      ctx.save()
      ctx.globalAlpha = Math.max(0, 1 - late / 100)
      ctx.fillStyle = '#000'
      ctx.beginPath()
      ctx.arc(x, drawY, layout.noteSize / 2 + 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }

  _drawHold(ctx, note, layout, laneColors, songTimeMs, speed) {
    if (note.holdDurationMs <= 0 || note.hit || note.missed) return
    const timeToHit = note.hitTimeMs - songTimeMs
    const headY = this._noteY(layout, timeToHit, speed)
    const tailY = this._noteY(layout, timeToHit - note.holdDurationMs, speed)
    const color = laneColors[note.lane]

    const x = this._laneX(layout, note.lane) + layout.laneW / 2
    const headScreenY = this._toScreenY(headY)
    const tailScreenY = this._toScreenY(tailY)
    const topY = Math.min(headScreenY, tailScreenY)
    const h = Math.max(layout.noteSize, Math.abs(headScreenY - tailScreenY))
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(x - layout.noteSize * 0.35, topY, layout.noteSize * 0.7, h, layout.noteSize * 0.35)
    const gradient = ctx.createLinearGradient(x, topY, x, topY + h)
    gradient.addColorStop(0, color + 'aa')
    gradient.addColorStop(1, color + '33')
    ctx.fillStyle = gradient
    ctx.fill()
    ctx.restore()
  }

  spawnParticle(lane, laneColors) {
    const layout = this._layout({})
    const x = this._laneX(layout, lane) + layout.laneW / 2
    const y = this._toScreenY(layout.receptorBottom)
    const color = laneColors[lane]
    for (let i = 0; i < 8; i++) {
      this.particles.push(this._acquireParticle({
        x,
        y,
        vx: (Math.random() - 0.5) * 120,
        vy: (Math.random() - 1.0) * 120,
        life: 0.25 + Math.random() * 0.25,
        color,
        size: 2 + Math.random() * 3,
      }))
    }
  }

  spawnLaneFlash(lane, laneColors) {
    this.particles.push(this._acquireParticle({
      type: 'flash',
      lane,
      life: 0.3,
      maxLife: 0.3,
      color: laneColors[lane],
    }))
  }

  _drawParticles(ctx, layout, laneColors, dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.life -= dt
      if (p.life <= 0) {
        this.particles.splice(i, 1)
        this._particlePool.push(p)
        continue
      }
      if (p.type === 'flash') {
        const alpha = (p.life / p.maxLife) * 0.25
        ctx.fillStyle = p.color + Math.round(alpha * 255).toString(16).padStart(2, '0')
        const x = this._laneX(layout, p.lane)
        ctx.fillRect(x, 0, layout.laneW, this.height)
      } else {
        p.x += p.vx * dt
        p.y += p.vy * dt
        const alpha = p.life / 0.5
        ctx.globalAlpha = alpha
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }
    }
  }

  render({ config, state, songTimeMs, receptorPressed, timeDomainData }) {
    const ctx = this.ctx
    ctx.clearRect(0, 0, this.width, this.height)

    this._updateBeatIntensity(timeDomainData)
    this._drawStars()

    const layout = this._layout(config)
    const laneColors = config.laneColors
    const speed = config.speed || 2.0

    this._drawHighway(ctx, layout, laneColors, receptorPressed)

    // Draw holds first so notes appear on top
    for (const note of state.activeNotes) {
      this._drawHold(ctx, note, layout, laneColors, songTimeMs, speed)
    }

    for (const note of state.activeNotes) {
      this._drawNote(ctx, note, layout, laneColors, songTimeMs, speed)
    }

    this._drawParticles(ctx, layout, laneColors, 1 / 60)
  }

  getLaneFromTouch(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const layout = this._layout({})
    if (y < rect.height * 0.25) return -1
    for (let l = 0; l < 4; l++) {
      const lx = this._laneX(layout, l)
      if (x >= lx && x <= lx + layout.laneW) return l
    }
    return -1
  }
}
