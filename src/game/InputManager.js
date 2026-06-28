export class InputManager {
  constructor(keybinds) {
    this.keybinds = keybinds || ['a', 's', ';', "'"]
    this.pressed = Array(this.keybinds.length).fill(false)
    this.buffer = [] // recent presses for input buffering
    this.onPress = null
    this.onRelease = null
    this.enabled = false
    this._downHandler = this._handleDown.bind(this)
    this._upHandler = this._handleUp.bind(this)
    this._touchMap = new Map()
  }

  setKeybinds(keybinds) {
    this.keybinds = keybinds
  }

  enable() {
    if (this.enabled) return
    window.addEventListener('keydown', this._downHandler)
    window.addEventListener('keyup', this._upHandler)
    this.enabled = true
  }

  disable() {
    if (!this.enabled) return
    window.removeEventListener('keydown', this._downHandler)
    window.removeEventListener('keyup', this._upHandler)
    this.pressed = Array(this.keybinds.length).fill(false)
    this.buffer = []
    this.enabled = false
  }

  _handleDown(e) {
    if (e.repeat) return
    const lane = this.keybinds.indexOf(e.key)
    if (lane === -1) return
    e.preventDefault()
    this.pressed[lane] = true
    const evt = { lane, timeMs: performance.now(), type: 'down', songTimeMs: null }
    this.buffer.push(evt)
    // trim buffer to last 150ms
    const cutoff = performance.now() - 150
    this.buffer = this.buffer.filter(b => b.timeMs > cutoff)
    if (this.onPress) this.onPress(evt)
  }

  _handleUp(e) {
    const lane = this.keybinds.indexOf(e.key)
    if (lane === -1) return
    e.preventDefault()
    this.pressed[lane] = false
    const evt = { lane, timeMs: performance.now(), type: 'up' }
    if (this.onRelease) this.onRelease(evt)
  }

  /**
   * Register a touch region for a lane (used by GameScreen canvas overlay).
   * Returns functions to call on touch start/end.
   */
  createTouchLaneHandler(lane) {
    return {
      onTouchStart: (timeMs = performance.now(), songTimeMs = null) => {
        if (this.pressed[lane]) return
        this.pressed[lane] = true
        const evt = { lane, timeMs, type: 'down', songTimeMs }
        this.buffer.push(evt)
        if (this.onPress) this.onPress(evt)
      },
      onTouchEnd: (timeMs = performance.now()) => {
        if (!this.pressed[lane]) return
        this.pressed[lane] = false
        const evt = { lane, timeMs, type: 'up' }
        if (this.onRelease) this.onRelease(evt)
      },
    }
  }

  consumeBufferedPress(lane, beforeTimeMs) {
    const idx = this.buffer.findIndex(b => b.lane === lane && b.timeMs <= beforeTimeMs && b.type === 'down')
    if (idx !== -1) {
      const evt = this.buffer[idx]
      this.buffer.splice(idx, 1)
      return evt
    }
    return null
  }
}
