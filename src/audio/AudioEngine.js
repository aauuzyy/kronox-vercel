import { log } from '../lib/logger.js'

const HIT_SFX_URL = '/hit.mp3'

export class AudioEngine {
  constructor() {
    this.ctx = null
    this.music = null
    this.analyser = null
    this.sfxBuffer = null
    this.sfxVolume = 0.7
    this.musicVolume = 1.0
    this.audioOffset = 0
    this.startedAt = 0
    this.pausedAt = 0
    this.isPlaying = false
    this.isReady = false
    this.lastAudioMs = -1
    this.lastAudioAt = 0
    this.onEnded = null
    this._endedListener = null
    this._playingListener = null
    this._timeUpdateListener = null
    this.isPreview = false
    this.useSimpleAudio = false
    this.ownsMusic = true
    this.sfxElements = []
  }

  async _ensureContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)()
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume()
    }
    return this.ctx
  }

  async loadSfx() {
    if (this.useSimpleAudio) {
      if (this.sfxElements.length) return
      for (let i = 0; i < 4; i++) {
        const a = new Audio(HIT_SFX_URL)
        a.load()
        this.sfxElements.push(a)
      }
      return
    }
    await this._ensureContext()
    if (this.sfxBuffer) return
    try {
      const res = await fetch(HIT_SFX_URL)
      const buf = await res.arrayBuffer()
      this.sfxBuffer = await this.ctx.decodeAudioData(buf)
    } catch (err) {
      console.warn('Failed to load hit SFX', err)
    }
  }

  playHitSfx() {
    if (this.useSimpleAudio) {
      if (!this.sfxElements.length) return
      let el = this.sfxElements.find(a => a.paused)
      if (!el) {
        el = new Audio(HIT_SFX_URL)
        this.sfxElements.push(el)
      }
      el.volume = Math.min(1, this.sfxVolume * 4)
      el.currentTime = 0
      el.play().catch(() => {})
      return
    }
    if (!this.ctx || !this.sfxBuffer) return
    const src = this.ctx.createBufferSource()
    src.buffer = this.sfxBuffer
    const gain = this.ctx.createGain()
    gain.gain.value = this.sfxVolume * 4
    src.connect(gain)
    gain.connect(this.ctx.destination)
    src.start()
  }

  async loadMusic(source) {
    const isElement = source instanceof HTMLAudioElement
    log('AudioEngine.loadMusic', isElement ? 'element' : typeof source, isElement ? source.src.slice(0, 80) : String(source).slice(0, 80), 'simple', this.useSimpleAudio)
    if (!isElement && !this.useSimpleAudio) {
      await this._ensureContext()
    }
    if (this.music && this.ownsMusic) {
      this.music.pause()
      this.music.src = ''
      this.music = null
    }

    let audio
    if (isElement) {
      audio = source
      this.ownsMusic = false
    } else {
      audio = new Audio()
      this.ownsMusic = true
      if (typeof source === 'string') {
        audio.src = source
        if (!this.useSimpleAudio) {
          audio.crossOrigin = 'anonymous'
        }
      } else if (source instanceof Blob || source instanceof File) {
        audio.src = URL.createObjectURL(source)
      }
      audio.load()
    }
    if (this.ownsMusic) {
      audio.volume = this.musicVolume
      audio.muted = false
    }

    if (!this.useSimpleAudio && this.ownsMusic) {
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = 1024
      try {
        const srcNode = this.ctx.createMediaElementSource(audio)
        srcNode.connect(this.analyser)
        this.analyser.connect(this.ctx.destination)
      } catch (err) {
        console.warn('Could not connect analyser', err)
      }
    }

    this.music = audio
    this.isPlaying = false
    this.pausedAt = 0

    const reportProgress = () => {
      if (!this.onLoadProgress) return
      const duration = audio.duration || 0
      let buffered = 0
      if (audio.buffered.length > 0) {
        buffered = audio.buffered.end(audio.buffered.length - 1)
      }
      const pct = duration > 0 ? Math.min(100, (buffered / duration) * 100) : 0
      this.onLoadProgress(pct)
    }

    return new Promise((resolve, reject) => {
      if (audio.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
        if (this.onLoadProgress) this.onLoadProgress(100)
        log('AudioEngine.loadMusic ready (already)', 'duration', audio.duration, 'readyState', audio.readyState)
        resolve(audio)
        return
      }
      const onCanPlay = () => {
        clearTimeout(timeout)
        audio.removeEventListener('progress', reportProgress)
        if (this.onLoadProgress) this.onLoadProgress(100)
        log('AudioEngine.loadMusic ready', 'duration', audio.duration, 'readyState', audio.readyState)
        resolve(audio)
      }
      const onError = (e) => {
        clearTimeout(timeout)
        audio.removeEventListener('progress', reportProgress)
        log('AudioEngine.loadMusic error', e)
        reject(new Error('Failed to load audio'))
      }
      audio.addEventListener('progress', reportProgress)
      const timeout = setTimeout(() => {
        audio.removeEventListener('canplaythrough', onCanPlay)
        audio.removeEventListener('error', onError)
        audio.removeEventListener('progress', reportProgress)
        reject(new Error('Audio load timed out'))
      }, this.isPreview ? 60000 : 15000)
      audio.addEventListener('canplaythrough', onCanPlay, { once: true })
      audio.addEventListener('error', onError, { once: true })
    })
  }

  setVolumes({ musicVolume, sfxVolume }) {
    if (musicVolume !== undefined) {
      this.musicVolume = Math.max(0, Math.min(1, musicVolume))
      if (this.music) this.music.volume = this.musicVolume
    }
    if (sfxVolume !== undefined) this.sfxVolume = Math.max(0, Math.min(1, sfxVolume))
  }

  setOffset(ms) {
    this.audioOffset = ms
  }

  setPlaybackRate(rate) {
    if (this.music) this.music.playbackRate = rate
  }

  async play(startTimeMs = 0) {
    log('AudioEngine.play', 'startTimeMs', startTimeMs, 'simple', this.useSimpleAudio, 'ctxState', this.ctx?.state, 'musicPaused', this.music?.paused, 'musicMuted', this.music?.muted, 'musicVolume', this.music?.volume)
    if (!this.useSimpleAudio) {
      await this._ensureContext()
    }
    if (!this.music) return

    if (this._endedListener) this.music.removeEventListener('ended', this._endedListener)
    this._endedListener = () => {
      this.isPlaying = false
      this.isReady = false
      if (this.onEnded) this.onEnded()
    }
    this.music.addEventListener('ended', this._endedListener)

    // For preview, if the element is already playing from the user gesture,
    // seek to the start offset and wait for the seek to finish so the clock
    // doesn't start before the audio has actually moved.
    if (this.isPreview && this.music && !this.music.paused) {
      log('AudioEngine.play seek because already playing')
      try {
        let timeout
        await Promise.race([
          new Promise((resolve, reject) => {
            const onSeeked = () => {
              this.music.removeEventListener('error', onError)
              clearTimeout(timeout)
              log('AudioEngine.play seeked')
              resolve()
            }
            const onError = (e) => {
              this.music.removeEventListener('seeked', onSeeked)
              clearTimeout(timeout)
              log('AudioEngine.play seek error', e)
              reject(new Error('audio seek failed'))
            }
            this.music.addEventListener('seeked', onSeeked, { once: true })
            this.music.addEventListener('error', onError, { once: true })
            this.music.currentTime = startTimeMs / 1000
          }),
          new Promise((_, reject) => {
            timeout = setTimeout(() => {
              log('AudioEngine.play seek timeout')
              reject(new Error('audio seek timed out'))
            }, 3000)
          })
        ])
      } catch (err) {
        log('AudioEngine.play seek catch', err.name, err.message)
      }
      this.startedAt = performance.now() - startTimeMs
      this.pausedAt = 0
      this.lastAudioMs = -1
      this.isPlaying = true
      this.isReady = true
      return
    }

    this.music.currentTime = startTimeMs / 1000
    this.startedAt = performance.now() - startTimeMs
    this.pausedAt = 0
    this.lastAudioMs = -1
    this.isPlaying = true

    if (this._playingListener) this.music.removeEventListener('playing', this._playingListener)
    this.isReady = false
    this._playingListener = () => { this.isReady = true }
    this.music.addEventListener('playing', this._playingListener, { once: true })

    try {
      if (!this.useSimpleAudio && this.ctx?.state === 'suspended') {
        // Resume the audio context synchronously inside the user gesture;
        // awaiting it can cause some browsers to lose the gesture.
        this.ctx.resume().catch(() => {})
      }
      await this.music.play()
      log('AudioEngine.play success')
    } catch (err) {
      if (!(this.isPreview && err.name === 'AbortError')) {
        console.warn('Audio playback blocked or failed', err)
      }
      this.isPlaying = false
      this.isReady = false
      throw err
    }
  }

  pause() {
    if (!this.music || !this.isPlaying) return
    this.music.pause()
    this.pausedAt = this.getCurrentTimeMs()
    this.isPlaying = false
    this.isReady = false
  }

  async resume() {
    await this._ensureContext()
    if (!this.music) return
    this.startedAt = performance.now() - this.pausedAt
    this.lastAudioMs = -1
    this.isReady = false
    this.isPlaying = true
    if (this._playingListener) this.music.removeEventListener('playing', this._playingListener)
    this._playingListener = () => { this.isReady = true }
    this.music.addEventListener('playing', this._playingListener, { once: true })
    this.ctx.resume().catch(() => {})
    await this.music.play()
  }

  stop() {
    if (!this.music) return
    if (this.ownsMusic) {
      this.music.pause()
      this.music.currentTime = 0
    }
    this.isPlaying = false
    this.isReady = false
    this.pausedAt = 0
  }

  dispose() {
    log('AudioEngine.dispose', 'simple', this.useSimpleAudio, 'ownsMusic', this.ownsMusic)
    this.stop()
    if (this.music && this.ownsMusic) {
      this.music.src = ''
      this.music.remove()
      this.music = null
    }
    if (!this.useSimpleAudio && this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close()
      this.ctx = null
    }
  }

  /**
   * Returns the current song time in milliseconds, corrected by audioOffset.
   * Uses a high-resolution fallback when audio.currentTime is stale.
   */
  getCurrentTimeMs() {
    if (!this.music) return this.pausedAt
    if (!this.isPlaying) return this.pausedAt
    const perfMs = performance.now() - this.startedAt
    const audioMs = this.music.currentTime * 1000

    // Track whether the browser's reported audio time is still advancing.
    if (audioMs !== this.lastAudioMs) {
      this.lastAudioMs = audioMs
      this.lastAudioAt = performance.now()
    }
    const stalled = performance.now() - this.lastAudioAt > 150

    if (!stalled && Math.abs(audioMs - perfMs) > 50) {
      // Audio time jumped (seek/scrub/buffer) — snap to it
      this.startedAt = performance.now() - audioMs
      return audioMs - this.audioOffset
    }
    // Use high-resolution performance clock for smooth note motion.
    // If the media element is stalled, the perf clock keeps the playfield moving.
    return perfMs - this.audioOffset
  }

  getDurationMs() {
    return (this.music?.duration || 0) * 1000
  }

  getAnalyserData() {
    if (!this.analyser) return null
    const data = new Uint8Array(this.analyser.frequencyBinCount)
    this.analyser.getByteFrequencyData(data)
    return data
  }

  getTimeDomainData() {
    if (!this.analyser) return null
    const data = new Uint8Array(this.analyser.fftSize)
    this.analyser.getByteTimeDomainData(data)
    return data
  }
}
