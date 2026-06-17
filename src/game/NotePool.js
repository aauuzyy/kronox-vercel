export class NotePool {
  constructor(size = 512) {
    this.size = size
    this.pool = []
    for (let i = 0; i < size; i++) {
      this.pool.push(this._createNote())
    }
    this.active = []
  }

  _createNote() {
    return {
      beat: 0,
      lane: 0,
      hitTimeMs: 0,
      holdDurationMs: 0,
      hit: false,
      missed: false,
      spawned: false,
      beingHeld: false,
      releaseTimeMs: 0,
      yFromBottom: 0,
    }
  }

  acquire(beat, lane, hitTimeMs, holdDurationMs = 0) {
    const note = this.pool.pop() || this._createNote()
    note.beat = beat
    note.lane = lane
    note.hitTimeMs = hitTimeMs
    note.holdDurationMs = holdDurationMs
    note.hit = false
    note.missed = false
    note.spawned = true
    note.beingHeld = false
    note.releaseTimeMs = 0
    note.yFromBottom = 0
    this.active.push(note)
    return note
  }

  release(note) {
    note.spawned = false
    note.hit = false
    note.missed = false
    note.beingHeld = false
    const idx = this.active.indexOf(note)
    if (idx !== -1) this.active.splice(idx, 1)
    this.pool.push(note)
  }

  reset() {
    for (const note of this.active) {
      this.pool.push(note)
    }
    this.active = []
  }

  getActive() {
    return this.active
  }
}
