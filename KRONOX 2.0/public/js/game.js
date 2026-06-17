/* ===== KRONOX Game Engine ===== */

const GAME_LANES = 4;
const BASE_SCROLL_SPEED = 380;
const RECEPTOR_Y_RATIO = 0.86;
const NOTE_RADIUS_RATIO = 0.32;
const RECEPTOR_SIZE_RATIO = 0.72;

const TIMING_WINDOWS = {
  PERFECT: 0.045,
  GOOD:    0.090,
  BAD:     0.135,
  MISS:    0.180
};

const SCORE_VALUES = {
  PERFECT: 300,
  GOOD:    100,
  BAD:     50,
  MISS:    0
};

class GameEngine {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.screenEl = document.getElementById('game-screen');
    this.pregameEl = document.getElementById('game-pregame');
    this.resultsEl = document.getElementById('game-results');
    this.pauseEl = document.getElementById('game-pause');
    this.countdownText = document.querySelector('#game-countdown .countdown-text');

    this.state = 'idle';
    this.mode = 'play';
    this.chart = null;
    this.notes = [];
    this.noteIndex = 0;

    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.judgments = { PERFECT: 0, GOOD: 0, BAD: 0, MISS: 0 };

    this.lanePressed = [false, false, false, false];
    this.countdownStartTime = 0;
    this.recordedNotes = [];
    this.uploadedAudioUrl = null;
    this.audioFileName = '';

    this.resize();
    window.addEventListener('resize', () => this.resize());

    this._boundKeyDown = this.onKeyDown.bind(this);
    this._boundKeyUp = this.onKeyUp.bind(this);

    this.rafId = null;
    this.lastMissCheck = -1;
    this.hitEffects = [];
    this.three = null; // Three.js scene state
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    this.canvas.width = cssW * dpr;
    this.canvas.height = cssH * dpr;
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.laneWidth = Math.min(cssW * 0.12, 96);
    this.receptorSize = this.laneWidth * 0.78;
    this.playfieldWidth = this.laneWidth * GAME_LANES;
    this.playfieldX = (cssW - this.playfieldWidth) / 2;
    this.receptorY = cssH * RECEPTOR_Y_RATIO;
    this.noteRadius = this.laneWidth * NOTE_RADIUS_RATIO;

    for (let i = 0; i < GAME_LANES; i++) {
      const r = document.getElementById(`receptor-${i}`);
      if (r) {
        r.style.width = this.receptorSize + 'px';
        r.style.height = this.receptorSize + 'px';
        r.style.left = (this.playfieldX + i * this.laneWidth + (this.laneWidth - this.receptorSize) / 2) + 'px';
        r.style.top = (this.receptorY - this.receptorSize / 2) + 'px';
      }
    }
  }

  updateReceptorLabels() {
    const binds = typeof currentKeybinds !== 'undefined' ? currentKeybinds : ['D','F','J','K'];
    for (let i = 0; i < GAME_LANES; i++) {
      const label = document.querySelector(`#receptor-${i} .receptor-key`);
      if (label) label.textContent = binds[i] || '?';
    }
  }

  show() {
    this.updateReceptorLabels();
    this.screenEl.classList.add('game-active');
    this.showPregame();
  }

  hide() {
    this.stop();
    this.screenEl.classList.remove('game-active');
    this.pauseEl.classList.remove('pause-active');
  }

  showPregame() {
    this.pregameEl.classList.add('pregame-active');
    this.resultsEl.classList.remove('results-active');
    this.pauseEl.classList.remove('pause-active');
    populateChartList();
    this.updatePregameInfo();
  }

  updatePregameInfo() {
    // Settings snapshot
    const speedEl = document.getElementById('pregame-setting-speed');
    const offsetEl = document.getElementById('pregame-setting-offset');
    const keysEl = document.getElementById('pregame-setting-keys');
    const shakeEl = document.getElementById('pregame-setting-shake');
    const mode3dEl = document.getElementById('pregame-setting-3d');
    if (speedEl) speedEl.textContent = (typeof noteSpeed !== 'undefined' ? noteSpeed : 1.0).toFixed(1) + 'x';
    if (offsetEl) offsetEl.textContent = (typeof inputOffset !== 'undefined' ? inputOffset : 0) + 'ms';
    if (keysEl) keysEl.textContent = (typeof currentKeybinds !== 'undefined' ? currentKeybinds : ['D','F','J','K']).join(' ');
    if (shakeEl) shakeEl.textContent = (typeof screenShakeEnabled !== 'undefined' && screenShakeEnabled) ? 'ON' : 'OFF';
    if (mode3dEl) mode3dEl.textContent = (typeof render3D !== 'undefined' && render3D) ? '3D' : '2D';

    // Song info
    const songNameEl = document.getElementById('pregame-song-name');
    const songArtistEl = document.getElementById('pregame-song-artist');
    const songDurationEl = document.getElementById('pregame-song-duration');

    let trackName = 'Call It What You Like';
    let artistName = 'Robbie Doherty';
    if (audioPlayer && audioPlayer.src) {
      const filename = decodeURIComponent(audioPlayer.src.split('/').pop());
      trackName = typeof parseTrackName === 'function' ? parseTrackName(filename) : filename;
      // Try to extract artist from filename if it contains " - "
      if (filename.includes(' - ')) {
        const parts = filename.split(' - ');
        if (parts.length >= 2) {
          artistName = parts[0].trim();
          trackName = parts[1].replace(/\.[^.]+$/, '').trim();
        }
      }
    }
    if (songNameEl) songNameEl.textContent = trackName;
    if (songArtistEl) songArtistEl.textContent = artistName;
    if (songDurationEl && audioPlayer && audioPlayer.duration && !isNaN(audioPlayer.duration)) {
      const min = Math.floor(audioPlayer.duration / 60);
      const sec = Math.floor(audioPlayer.duration % 60);
      songDurationEl.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
    } else if (songDurationEl) {
      songDurationEl.textContent = '--:--';
    }
  }

  hidePregame() {
    this.pregameEl.classList.remove('pregame-active');
  }

  ensureAudio() {
    if (!audioPlayer) {
      audioPlayer = new Audio();
      audioPlayer.crossOrigin = 'anonymous';
    }
    const src = this.uploadedAudioUrl || (typeof shuffledPlaylist !== 'undefined' && shuffledPlaylist.length
      ? shuffledPlaylist[typeof currentTrackIndex !== 'undefined' ? currentTrackIndex : 0]?.url : '');
    if (src && audioPlayer.src !== src) {
      audioPlayer.src = src;
    }
    const sliderVal = document.querySelector('.slider')?.value || 70;
    if (audioPlayer) audioPlayer.volume = parseFloat(sliderVal) / 100;
  }

  start(chart, mode) {
    this.stop();
    window.gameInProgress = true;
    this.ensureAudio();
    this.mode = mode || 'play';
    this.chart = chart;

    if (chart && chart.notes) {
      this.notes = chart.notes.map(n => ({
        time: n.t / 1000,
        lane: n.l,
        hit: false,
        missed: false
      }));
    } else {
      this.notes = [];
    }
    this.noteIndex = 0;

    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.judgments = { PERFECT: 0, GOOD: 0, BAD: 0, MISS: 0 };
    this.lanePressed = [false, false, false, false];
    this.recordedNotes = [];
    this.offsets = [];
    this.lastMissCheck = -1;
    this.hitEffects = [];

    // Toggle DOM receptors based on 3D mode
    const is3D = typeof render3D !== 'undefined' && render3D;
    const receptorsEl = document.getElementById('game-receptors');
    if (receptorsEl) receptorsEl.style.display = is3D ? 'none' : '';

    if (is3D && typeof render3DMode !== 'undefined' && render3DMode === 'three') {
      this.initThree();
    } else {
      this.destroyThree();
    }

    // Reset tap counters
    for (let i = 0; i < GAME_LANES; i++) {
      const el = document.getElementById(`tap-${i}`);
      if (el) {
        const countEl = el.querySelector('.tap-count');
        if (countEl) countEl.textContent = '0';
        const keyEl = el.querySelector('.tap-key');
        if (keyEl) {
          const binds = typeof currentKeybinds !== 'undefined' ? currentKeybinds : ['D','F','J','K'];
          keyEl.textContent = binds[i] || '?';
        }
      }
    }

    if (audioPlayer) {
      audioPlayer.pause();
      audioPlayer.currentTime = 0;
    }

    this.hidePregame();
    this.resultsEl.classList.remove('results-active');
    this.pauseEl.classList.remove('pause-active');

    this.updateHUD();
    const j = document.getElementById('game-judgment');
    const o = document.getElementById('game-offset');
    if (j) j.textContent = '';
    if (o) o.textContent = '';
    const p = document.getElementById('game-progress');
    if (p) p.style.width = '0%';
    const m = document.getElementById('game-mode');
    if (m) m.textContent = this.mode === 'record' ? 'Recording' : '';

    const songEl = document.getElementById('game-song');
    if (songEl) {
      if (this.audioFileName) {
        songEl.textContent = this.audioFileName;
      } else if (audioPlayer && audioPlayer.src) {
        const filename = decodeURIComponent(audioPlayer.src.split('/').pop());
        songEl.textContent = typeof parseTrackName === 'function' ? parseTrackName(filename) : filename;
      }
    }

    this.state = 'countdown';
    this.countdownStartTime = performance.now();
    this.audioStartPerf = 0;
    this.audioStartTime = 0;

    document.addEventListener('keydown', this._boundKeyDown);
    document.addEventListener('keyup', this._boundKeyUp);

    this.loop();
  }

  togglePause() {
    if (this.state !== 'playing' && this.state !== 'paused') return;
    if (this.state === 'paused') {
      this.state = 'playing';
      this.pauseEl.classList.remove('pause-active');
      if (audioPlayer) {
        audioPlayer.play().catch(() => {});
        // Re-sync predictive clock on resume
        this.audioStartPerf = performance.now();
        this.audioStartTime = audioPlayer.currentTime;
      }
    } else {
      this.state = 'paused';
      this.pauseEl.classList.add('pause-active');
      if (audioPlayer) audioPlayer.pause();
    }
  }

  quitToPregame() {
    this.stop();
    this.showPregame();
  }

  onKeyDown(e) {
    if (e.code === 'Space') {
      if (this.state === 'playing' || this.state === 'paused') {
        e.preventDefault();
        this.togglePause();
        return;
      }
    }

    if (e.code === 'Escape') {
      if (this.state === 'playing' || this.state === 'paused') {
        e.preventDefault();
        this.togglePause();
        return;
      }
      if (this.state === 'countdown') {
        e.preventDefault();
        this.stop();
        this.showPregame();
        return;
      }
    }

    if (e.code === 'ControlRight') {
      if (this.state === 'playing' && this.mode === 'record') {
        e.preventDefault();
        this.endGame();
        return;
      }
    }

    if (this.state !== 'playing' && this.state !== 'countdown') return;

    const key = e.key;
    const binds = typeof currentKeybinds !== 'undefined' ? currentKeybinds : ['D','F','J','K'];
    const lane = binds.indexOf(key);
    if (lane === -1 || this.lanePressed[lane]) return;

    e.preventDefault();
    this.lanePressed[lane] = true;

    // Tap counter — counts every keypress even without a note
    this.incrementTapCounter(lane);

    if (this.state === 'playing') {
      if (this.mode === 'record') {
        this.recordHit(lane);
      } else {
        this.handleInput(lane);
      }
      this.triggerReceptorPress(lane);
    }
  }

  onKeyUp(e) {
    const key = e.key;
    const binds = typeof currentKeybinds !== 'undefined' ? currentKeybinds : ['D','F','J','K'];
    const lane = binds.indexOf(key);
    if (lane !== -1) {
      this.lanePressed[lane] = false;
      this.triggerReceptorRelease(lane);
    }
  }

  recordHit(lane) {
    if (!audioPlayer) return;
    const timeMs = Math.round(audioPlayer.currentTime * 1000);
    this.recordedNotes.push({ t: timeMs, l: lane });
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.updateHUD();
  }

  handleInput(lane) {
    if (!audioPlayer) return;
    const offsetSec = (typeof inputOffset !== 'undefined' ? inputOffset : 0) / 1000;
    // Predictive audio clock for silky-smooth rendering on high refresh rates.
    // audioPlayer.currentTime only updates at ~60Hz, causing jitter on 240Hz monitors.
    // We extrapolate from performance.now() and re-sync if drift exceeds 50ms.
    let predictiveTime = this.audioStartTime + (performance.now() - this.audioStartPerf) / 1000;
    const drift = Math.abs(predictiveTime - audioPlayer.currentTime);
    if (drift > 0.05 || audioPlayer.paused) {
      predictiveTime = audioPlayer.currentTime;
      this.audioStartPerf = performance.now();
      this.audioStartTime = audioPlayer.currentTime;
    }
    const now = predictiveTime - offsetSec;

    let closest = null;
    let closestDist = Infinity;

    for (let i = this.noteIndex; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note.lane !== lane || note.hit || note.missed) continue;
      const dist = Math.abs(now - note.time);
      if (dist < closestDist && dist <= TIMING_WINDOWS.MISS) {
        closestDist = dist;
        closest = note;
      }
    }

    if (!closest) return;

    const off = now - closest.time;
    let judgment = 'MISS';
    if (Math.abs(off) <= TIMING_WINDOWS.PERFECT) judgment = 'PERFECT';
    else if (Math.abs(off) <= TIMING_WINDOWS.GOOD) judgment = 'GOOD';
    else if (Math.abs(off) <= TIMING_WINDOWS.BAD) judgment = 'BAD';

    closest.hit = true;
    this.judgments[judgment]++;

    if (judgment === 'MISS') {
      this.combo = 0;
    } else {
      this.combo++;
      this.score += SCORE_VALUES[judgment];
      this.offsets.push(Math.round(off * 1000));

      // Spawn hit effect at the note's CURRENT visual position (not the receptor)
      const speedMult = typeof noteSpeed !== 'undefined' ? noteSpeed : 1.0;
      const scrollSpeed = BASE_SCROLL_SPEED * speedMult;
      const timeDiff = closest.time - now;
      let fxX, fxY;
      if (typeof render3D !== 'undefined' && render3D) {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const vanishingX = w / 2;
        const vanishingY = h * 0.20;
        const receptorY3D = this.receptorY;
        const focalLength = 600;
        const worldLaneWidth = 150;
        const z = timeDiff * scrollSpeed;
        const scale = focalLength / (focalLength + z);
        const worldX = (closest.lane - 1.5) * worldLaneWidth;
        fxX = vanishingX + worldX * scale;
        fxY = vanishingY + (receptorY3D - vanishingY) * scale;
      } else {
        fxY = this.receptorY - timeDiff * scrollSpeed;
        fxX = this.playfieldX + closest.lane * this.laneWidth + this.laneWidth / 2;
      }
      this.hitEffects.push({
        x: fxX,
        y: fxY,
        birth: performance.now(),
        judgment
      });
    }
    this.maxCombo = Math.max(this.maxCombo, this.combo);

    this.showJudgment(judgment, off, lane);
    this.updateHUD();

    const shake = typeof screenShakeEnabled !== 'undefined' ? screenShakeEnabled : false;
    if (shake && (judgment === 'PERFECT' || judgment === 'GOOD')) {
      this.triggerDirectionalShake(lane);
    }
  }

  getGrade(acc) {
    if (acc >= 100) return 'SSS';
    if (acc >= 98) return 'SS';
    if (acc >= 95) return 'S';
    if (acc >= 90) return 'A';
    if (acc >= 80) return 'B';
    if (acc >= 70) return 'C';
    if (acc >= 60) return 'D';
    return 'F';
  }

  getAccuracy() {
    const total = this.judgments.PERFECT + this.judgments.GOOD + this.judgments.BAD + this.judgments.MISS;
    if (total === 0) return 0;
    return ((this.judgments.PERFECT * 1 + this.judgments.GOOD * 0.66 + this.judgments.BAD * 0.33) / total * 100);
  }

  triggerReceptorPress(lane) {
    const r = document.getElementById(`receptor-${lane}`);
    if (r) r.classList.add('receptor-pressed');
  }

  triggerReceptorRelease(lane) {
    const r = document.getElementById(`receptor-${lane}`);
    if (r) r.classList.remove('receptor-pressed');
  }

  getReceptorScreenPos(lane) {
    if (this.three) {
      const t = this.three;
      const pos = new THREE.Vector3((lane - 1.5) * t.laneWidth, 0, t.receptorZ);
      pos.project(t.camera);
      return {
        x: (pos.x * 0.5 + 0.5) * window.innerWidth,
        y: (-pos.y * 0.5 + 0.5) * window.innerHeight
      };
    }
    return {
      x: this.playfieldX + lane * this.laneWidth + this.laneWidth / 2,
      y: this.receptorY
    };
  }

  showJudgment(text, offset, lane) {
    const displayMap = {
      PERFECT: 'Perfect',
      GOOD: 'Good',
      BAD: 'Okay',
      MISS: 'Miss'
    };
    const colorMap = {
      PERFECT: 'judge-perfect',
      GOOD: 'judge-good',
      BAD: 'judge-okay',
      MISS: 'judge-miss'
    };
    const displayText = displayMap[text] || text;

    // RoBeats-style per-lane judgment at the receptor
    if (lane != null) {
      const laneEl = document.getElementById(`lane-judgment-${lane}`);
      if (laneEl) {
        const pos = this.getReceptorScreenPos(lane);
        laneEl.style.left = pos.x + 'px';
        laneEl.style.top = pos.y + 'px';
        laneEl.textContent = displayText;
        laneEl.className = 'lane-judgment ' + (colorMap[text] || '');
        void laneEl.offsetWidth;
        laneEl.classList.add('lane-judgment-active');

        if (!this._laneJudgmentTimers) this._laneJudgmentTimers = [];
        if (this._laneJudgmentTimers[lane]) clearTimeout(this._laneJudgmentTimers[lane]);
        this._laneJudgmentTimers[lane] = setTimeout(() => {
          laneEl.classList.remove('lane-judgment-active');
          laneEl.textContent = '';
        }, 420);
      }
    }

    // Keep the small center offset readout for feedback
    const offsetEl = document.getElementById('game-offset');
    if (offsetEl) {
      const ms = Math.round(offset * 1000);
      offsetEl.textContent = (ms > 0 ? '+' : '') + ms + 'ms';
      offsetEl.className = 'offset-text';
      void offsetEl.offsetWidth;
      offsetEl.classList.add('offset-active');
    }
  }

  triggerDirectionalShake(lane) {
    if (!this.screenEl) return;
    // Cancel any pending recovery
    if (this._shakeTimeout) {
      clearTimeout(this._shakeTimeout);
      this._shakeTimeout = null;
    }
    const intensity = 5; // pixels
    const offsets = [
      `translateX(-${intensity}px)`,  // lane 0: left
      `translateY(-${intensity}px)`,  // lane 1: up
      `translateY(${intensity}px)`,   // lane 2: down
      `translateX(${intensity}px)`    // lane 3: right
    ];
    const offset = offsets[lane] || 'none';

    // Snap to direction instantly
    this.screenEl.style.transition = 'none';
    this.screenEl.style.transform = offset;

    // Force reflow so the transition applies to the next change
    void this.screenEl.offsetWidth;

    // Tween back to normal with a slight spring
    this.screenEl.style.transition = 'transform 140ms cubic-bezier(0.34, 1.56, 0.64, 1)';
    this.screenEl.style.transform = 'translate(0, 0)';

    // Clean up inline styles after animation completes
    this._shakeTimeout = setTimeout(() => {
      this.screenEl.style.transition = '';
      this.screenEl.style.transform = '';
      this._shakeTimeout = null;
    }, 160);
  }

  incrementTapCounter(lane) {
    const el = document.getElementById(`tap-${lane}`);
    if (!el) return;
    const countEl = el.querySelector('.tap-count');
    if (countEl) {
      const val = parseInt(countEl.textContent || '0') + 1;
      countEl.textContent = val;
    }
  }

  updateRankBar(acc) {
    const fill = document.getElementById('rank-arc-fill');
    const label = document.getElementById('rank-label');
    const labels = document.querySelectorAll('.rank-label-text');
    const glow = document.getElementById('rank-arc-glow');

    const thresholds = [0, 60, 65, 70, 75, 80, 85, 90, 95, 97, 98.5, 99.5, 100];
    const ranks = ['F','F+','D','D+','C','C+','B','B+','A','A+','S','SS','SSS'];

    // Arc fill: use exact path length from getTotalLength
    if (fill) {
      // Cache path length on first call
      if (!this._arcLength) {
        this._arcLength = fill.getTotalLength();
        // Fallback: if SVG is hidden, getTotalLength returns 0. Use estimate.
        if (!this._arcLength) this._arcLength = 250;
        fill.style.strokeDasharray = this._arcLength;
      }
      const offset = this._arcLength * (1 - Math.min(100, acc) / 100);
      fill.style.strokeDashoffset = offset;
    }

    // Current rank label
    let rankIdx = 0;
    for (let i = 0; i < thresholds.length; i++) {
      if (acc >= thresholds[i]) rankIdx = i;
    }
    const rank = ranks[rankIdx] || 'F';
    if (label) {
      label.textContent = rank;
      label.className = 'absolute pointer-events-none grade-text grade-' + rank.toLowerCase().replace('+', 'plus');
    }

    // Activate grade labels
    labels.forEach((el, i) => {
      el.classList.toggle('active', acc >= thresholds[i]);
    });

    // Glow dot and rank label follow exact position on quadratic bezier curve
    // P0=(18,270), P1=(85,160), P2=(18,50)
    const t = Math.min(100, acc) / 100;
    const p0x = 18, p0y = 270;
    const p1x = 85, p1y = 160;
    const p2x = 18, p2y = 50;
    const cx = (1 - t) * (1 - t) * p0x + 2 * (1 - t) * t * p1x + t * t * p2x;
    const cy = (1 - t) * (1 - t) * p0y + 2 * (1 - t) * t * p1y + t * t * p2y;

    if (glow) {
      glow.setAttribute('cx', cx);
      glow.setAttribute('cy', cy);
      glow.setAttribute('opacity', acc > 0 ? '0.8' : '0');
    }

    // Position current rank label right next to the glow dot
    const rankLabel = document.getElementById('rank-label');
    if (rankLabel) {
      rankLabel.style.left = (cx + 10) + 'px';
      rankLabel.style.top = cy + 'px';
      rankLabel.style.opacity = acc > 0 ? '1' : '0.3';
    }
  }

  updateHUD() {
    const comboEl = document.getElementById('game-combo');
    const scoreEl = document.getElementById('game-score');
    const accEl = document.getElementById('game-accuracy');
    const gradeEl = document.getElementById('game-grade');
    const timeEl = document.getElementById('game-time');

    if (comboEl) {
      if (this.combo > 0) {
        comboEl.innerHTML = `<span class="combo-label">Combo</span><span class="combo-number">${this.combo}</span>`;
        comboEl.classList.add('active');
      } else {
        comboEl.innerHTML = '';
        comboEl.classList.remove('active');
      }
    }
    if (scoreEl) scoreEl.textContent = this.score.toString().padStart(7, '0');

    const acc = this.getAccuracy();
    if (accEl) accEl.textContent = acc.toFixed(1) + '%';

    const grade = this.getGrade(acc);
    if (gradeEl) {
      gradeEl.textContent = grade;
      gradeEl.style.opacity = acc > 0 ? '0.5' : '0';
      gradeEl.className = 'text-2xl tracking-[0.2em] font-bold mb-1 grade-text grade-' + grade.toLowerCase();
    }

    this.updateRankBar(acc);

    const setCnt = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    setCnt('cnt-perfect', this.judgments.PERFECT);
    setCnt('cnt-good', this.judgments.GOOD);
    setCnt('cnt-bad', this.judgments.BAD);
    setCnt('cnt-miss', this.judgments.MISS);

    if (timeEl && audioPlayer && audioPlayer.duration && !isNaN(audioPlayer.duration)) {
      const remaining = Math.max(0, audioPlayer.duration - audioPlayer.currentTime);
      const min = Math.floor(remaining / 60);
      const sec = Math.floor(remaining % 60);
      timeEl.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
    }
  }

  autoMiss() {
    if (!audioPlayer || this.state !== 'playing') return;
    const offsetSec = (typeof inputOffset !== 'undefined' ? inputOffset : 0) / 1000;
    const now = audioPlayer.currentTime - offsetSec;

    if (now - this.lastMissCheck < 0.016) return;
    this.lastMissCheck = now;

    while (this.noteIndex < this.notes.length) {
      const note = this.notes[this.noteIndex];
      if (note.hit || note.missed) {
        this.noteIndex++;
        continue;
      }
      if (now > note.time + TIMING_WINDOWS.MISS) {
        note.missed = true;
        this.judgments.MISS++;
        this.combo = 0;
        this.showJudgment('MISS', 0, note.lane);
        this.updateHUD();
        this.noteIndex++;
      } else {
        break;
      }
    }
  }

  checkSongEnd() {
    if (!audioPlayer) return;
    if (audioPlayer.ended || (audioPlayer.duration && !isNaN(audioPlayer.duration) && audioPlayer.currentTime >= audioPlayer.duration - 0.15)) {
      this.endGame();
    }
  }

  updateProgress() {
    if (!audioPlayer) return;
    const el = document.getElementById('game-progress');
    if (el && audioPlayer.duration && !isNaN(audioPlayer.duration)) {
      el.style.width = (audioPlayer.currentTime / audioPlayer.duration * 100) + '%';
    }
  }

  endGame() {
    if (this.state === 'ended') return;
    this.state = 'ended';
    if (audioPlayer) audioPlayer.pause();
    if (this.mode === 'record') {
      this.saveRecordedChart();
    }
    this.saveRunToStats();
    this.showResults();
  }

  saveRunToStats() {
    const total = this.judgments.PERFECT + this.judgments.GOOD + this.judgments.BAD + this.judgments.MISS;
    if (total === 0) return;
    const acc = this.getAccuracy();
    const grade = this.getGrade(acc);

    // Update player stats
    const stats = loadPlayerStats ? loadPlayerStats() : {};
    stats.totalPlays = (stats.totalPlays || 0) + 1;
    stats.totalScore = (stats.totalScore || 0) + this.score;
    stats.bestAccuracy = Math.max(stats.bestAccuracy || 0, acc);
    if (savePlayerStats) savePlayerStats(stats);
    if (renderPlayerStats) renderPlayerStats();

    // Save to history
    const history = loadHistory ? loadHistory() : [];
    history.push({
      chartName: this.chart?.name || (this.mode === 'record' ? 'Recording' : 'Demo'),
      score: this.score,
      accuracy: parseFloat(acc.toFixed(1)),
      grade,
      date: new Date().toISOString()
    });
    if (saveHistory) saveHistory(history);

    // Save to leaderboard
    const lb = loadLeaderboard ? loadLeaderboard() : [];
    lb.push({
      chartName: this.chart?.name || (this.mode === 'record' ? 'Recording' : 'Demo'),
      score: this.score,
      accuracy: parseFloat(acc.toFixed(1)),
      grade,
      date: new Date().toISOString()
    });
    lb.sort((a, b) => b.score - a.score);
    if (saveLeaderboard) saveLeaderboard(lb);
  }

  saveRecordedChart() {
    if (!this.recordedNotes.length) return;
    const chart = {
      id: 'chart_' + Date.now(),
      name: this.audioFileName ? this.audioFileName.replace(/\.[^.]+$/, '') + ' — Recorded' : 'Custom Chart',
      songUrl: this.uploadedAudioUrl || audioPlayer?.src || '',
      createdAt: new Date().toISOString(),
      notes: this.recordedNotes
    };
    ChartManager.saveChart(chart);
  }

  showResults() {
    this.resultsEl.classList.add('results-active');
    const total = this.judgments.PERFECT + this.judgments.GOOD + this.judgments.BAD + this.judgments.MISS;
    const accuracy = total > 0
      ? ((this.judgments.PERFECT * 1 + this.judgments.GOOD * 0.66 + this.judgments.BAD * 0.33) / total * 100)
      : 0;
    const grade = this.getGrade(accuracy);

    // Previous best comparison
    const lb = loadLeaderboard ? loadLeaderboard() : [];
    const chartName = this.chart?.name || (this.mode === 'record' ? 'Recording' : 'Demo');
    const previousBest = lb.filter(s => s.chartName === chartName && s.score !== this.score).sort((a, b) => b.score - a.score)[0];

    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('result-score', this.score.toString().padStart(7, '0'));
    set('result-accuracy', accuracy.toFixed(1) + '%');
    set('result-maxcombo', this.maxCombo);
    set('result-perfect', this.judgments.PERFECT);
    set('result-good', this.judgments.GOOD);
    set('result-bad', this.judgments.BAD);
    set('result-miss', this.judgments.MISS);

    // Grade
    const gradeEl = document.getElementById('result-grade');
    const gradeLabel = document.getElementById('result-grade-label');
    if (gradeEl) {
      gradeEl.textContent = grade;
      gradeEl.className = 'text-6xl md:text-7xl tracking-[0.2em] font-bold grade-reveal grade-' + grade.toLowerCase();
    }
    if (gradeLabel) {
      const labels = { SSS: 'Absolute Perfection', SS: 'Masterful', S: 'Superb', A: 'Excellent', B: 'Great', C: 'Good', D: 'Pass', F: 'Failed' };
      gradeLabel.textContent = labels[grade] || '';
    }

    // Comparison
    const compEl = document.getElementById('result-best-comparison');
    if (compEl) {
      if (previousBest) {
        const diff = this.score - previousBest.score;
        if (diff > 0) compEl.textContent = `+${diff.toLocaleString()} vs best`;
        else if (diff < 0) compEl.textContent = `${diff.toLocaleString()} vs best`;
        else compEl.textContent = 'Tied with best';
        compEl.style.opacity = '0.4';
      } else {
        compEl.textContent = 'First play';
        compEl.style.opacity = '0.2';
      }
    }

    // Avg offset
    const offEl = document.getElementById('result-earlylate');
    if (offEl) {
      if (this.offsets.length > 0) {
        const avg = this.offsets.reduce((a, b) => a + b, 0) / this.offsets.length;
        offEl.textContent = (avg > 0 ? '+' : '') + Math.round(avg) + 'ms';
      } else {
        offEl.textContent = '—';
      }
    }
  }

  stop() {
    window.gameInProgress = false;
    this.state = 'idle';
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    document.removeEventListener('keydown', this._boundKeyDown);
    document.removeEventListener('keyup', this._boundKeyUp);
    if (audioPlayer) {
      audioPlayer.pause();
      audioPlayer.currentTime = 0;
    }
    for (let i = 0; i < GAME_LANES; i++) {
      this.lanePressed[i] = false;
      this.triggerReceptorRelease(i);
    }
    this.pauseEl.classList.remove('pause-active');
    this.hitEffects = [];
    this.destroyThree();
  }

  loop() {
    this.rafId = requestAnimationFrame(() => this.loop());

    if (this.state === 'countdown') {
      const elapsed = (performance.now() - this.countdownStartTime) / 1000;
      const remaining = 3 - elapsed;

      if (this.countdownText) {
        if (remaining > 0) {
          const val = Math.ceil(remaining);
          if (this.countdownText.textContent !== val.toString()) {
            this.countdownText.textContent = val;
            this.countdownText.classList.remove('countdown-active');
            void this.countdownText.offsetWidth;
            this.countdownText.classList.add('countdown-active');
          }
        } else if (remaining > -0.5) {
          if (this.countdownText.textContent !== 'GO') {
            this.countdownText.textContent = 'GO';
            this.countdownText.classList.remove('countdown-active');
            void this.countdownText.offsetWidth;
            this.countdownText.classList.add('countdown-active');
          }
        } else {
          this.countdownText.textContent = '';
          this.state = 'playing';
          if (audioPlayer) {
            audioPlayer.currentTime = 0;
            audioPlayer.play().catch(() => {});
            this.audioStartPerf = performance.now();
            this.audioStartTime = 0;
          }
        }
      }
    }

    if (this.state === 'playing') {
      this.autoMiss();
      this.checkSongEnd();
      this.updateProgress();
      this.updateHUD();
    }

    this.render();
  }

  render() {
    const is3D = typeof render3D !== 'undefined' && render3D;
    if (!is3D) {
      this.render2D();
    } else if (typeof render3DMode !== 'undefined' && render3DMode === 'three') {
      this.renderThree();
    } else if (typeof render3DMode !== 'undefined' && render3DMode === 'flat') {
      this.render3DFlat();
    } else {
      this.render3D();
    }
  }

  render2D() {
    const ctx = this.ctx;
    const w = window.innerWidth;
    const h = window.innerHeight;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    if (this.state !== 'playing' && this.state !== 'countdown') return;

    // Lane lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= GAME_LANES; i++) {
      const x = this.playfieldX + i * this.laneWidth;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    if (!audioPlayer) return;
    const offsetSec = (typeof inputOffset !== 'undefined' ? inputOffset : 0) / 1000;
    const now = audioPlayer.currentTime - offsetSec;
    const speedMult = typeof noteSpeed !== 'undefined' ? noteSpeed : 1.0;
    const scrollSpeed = BASE_SCROLL_SPEED * speedMult;

    // Draw notes — start from noteIndex to skip past-judged notes
    for (let i = this.noteIndex; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note.hit || note.missed) continue;

      const timeDiff = note.time - now;
      const y = this.receptorY - timeDiff * scrollSpeed;

      // Culling: only draw visible notes
      if (y < -this.noteRadius * 2 || y > h + this.noteRadius * 2) {
        if (timeDiff > 0) break; // future notes are even further above
        continue;
      }

      const x = this.playfieldX + note.lane * this.laneWidth + this.laneWidth / 2;

      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(x, y, this.noteRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw hit effects
    this.renderHitEffects(ctx);
  }

  render3D() {
    const ctx = this.ctx;
    const w = window.innerWidth;
    const h = window.innerHeight;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    if (this.state !== 'playing' && this.state !== 'countdown') return;
    if (!audioPlayer) return;

    const offsetSec = (typeof inputOffset !== 'undefined' ? inputOffset : 0) / 1000;
    const now = audioPlayer.currentTime - offsetSec;
    const speedMult = typeof noteSpeed !== 'undefined' ? noteSpeed : 1.0;
    const scrollSpeed = BASE_SCROLL_SPEED * speedMult;

    // 3D Perspective parameters
    const vanishingX = w / 2;
    const vanishingY = h * 0.26;
    const receptorY3D = this.receptorY;
    const focalLength = 750;
    const worldLaneWidth = 115;
    const worldNoteRadius = 32;
    const cylinderHeight = 10;

    const project = (worldX, z) => {
      const scale = focalLength / (focalLength + z);
      return {
        x: vanishingX + worldX * scale,
        y: vanishingY + (receptorY3D - vanishingY) * scale,
        scale
      };
    };

    // Lane lines — from receptors up to dispenser
    const spawnZ = 2000;
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < GAME_LANES; i++) {
      const worldX = (i - 1.5) * worldLaneWidth;
      const bottom = project(worldX, 0);
      const top = project(worldX, spawnZ);
      ctx.beginPath();
      ctx.moveTo(bottom.x, bottom.y);
      ctx.lineTo(top.x, top.y);
      ctx.stroke();
    }

    // Dispenser — clean simple cylinder with a central note slot
    const spawnP = project(0, spawnZ);
    const dispR = 100 * spawnP.scale;
    const dispH = 18 * spawnP.scale;
    if (dispR > 3) {
      // Thick base cylinder
      this.drawCylinderFast(ctx, spawnP.x, spawnP.y + dispH, dispR, dispH,
        'rgba(25, 25, 25, 0.95)',
        'rgba(170, 170, 170, 0.95)'
      );

      // Dark center slot where notes come out
      ctx.fillStyle = 'rgba(15, 15, 15, 0.95)';
      ctx.beginPath();
      ctx.arc(spawnP.x, spawnP.y, dispR * 0.32, 0, Math.PI * 2);
      ctx.fill();

      // Small bright rim around the slot
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(spawnP.x, spawnP.y, dispR * 0.32, 0, Math.PI * 2);
      ctx.stroke();

      // 4 small indicator lights (cardinal directions)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      const lightDist = dispR * 0.72;
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2 - Math.PI / 2;
        const px = spawnP.x + Math.cos(angle) * lightDist;
        const py = spawnP.y + Math.sin(angle) * lightDist * 0.35;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(2, dispR * 0.06), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Receptors — slightly transparent, no labels, same size as notes
    for (let i = 0; i < GAME_LANES; i++) {
      const worldX = (i - 1.5) * worldLaneWidth;
      const p = project(worldX, 0);
      const r = worldNoteRadius * p.scale;
      const sh = cylinderHeight * p.scale;
      this.drawCylinderFast(ctx, p.x, p.y, r, sh,
        this.lanePressed[i] ? 'rgba(200,160,30,0.95)' : 'rgba(140,105,15,0.9)',
        this.lanePressed[i] ? 'rgba(255,235,70,1)' : 'rgba(240,200,50,0.95)'
      );
    }

    // Notes as cylinders
    for (let i = this.noteIndex; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note.hit || note.missed) continue;
      const timeDiff = note.time - now;
      const z = timeDiff * scrollSpeed;
      if (z < -100 || z > 2000) { if (z > 0) break; continue; }
      const worldX = (note.lane - 1.5) * worldLaneWidth;
      const p = project(worldX, z);
      const sr = worldNoteRadius * p.scale;
      const sh = cylinderHeight * p.scale;
      if (sr < 0.5) continue;
      this.drawCylinderFast(ctx, p.x, p.y, sr, sh, 'rgba(180,140,20,1)', 'rgba(255,220,50,1)');
    }

    this.renderHitEffects(ctx);
  }

  render3DFlat() {
    const ctx = this.ctx;
    const w = window.innerWidth;
    const h = window.innerHeight;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    if (this.state !== 'playing' && this.state !== 'countdown') return;
    if (!audioPlayer) return;

    const offsetSec = (typeof inputOffset !== 'undefined' ? inputOffset : 0) / 1000;
    const now = audioPlayer.currentTime - offsetSec;
    const speedMult = typeof noteSpeed !== 'undefined' ? noteSpeed : 1.0;
    const scrollSpeed = BASE_SCROLL_SPEED * speedMult;

    // Flat perspective — longer highway, moderate convergence
    const vanishingX = w / 2;
    const vanishingY = h * 0.30;
    const receptorY3D = this.receptorY;
    const focalLength = 900;
    const worldLaneWidth = 80;
    const worldNoteRadius = 32;
    const noteThickness = 8;
    const squash = 0.82;

    const project = (worldX, z) => {
      const scale = focalLength / (focalLength + z);
      return {
        x: vanishingX + worldX * scale,
        y: vanishingY + (receptorY3D - vanishingY) * scale,
        scale
      };
    };

    // Lane lines — from receptors up to dispenser
    const spawnZ = 2000;
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < GAME_LANES; i++) {
      const worldX = (i - 1.5) * worldLaneWidth;
      const bottom = project(worldX, 0);
      const top = project(worldX, spawnZ);
      ctx.beginPath();
      ctx.moveTo(bottom.x, bottom.y);
      ctx.lineTo(top.x, top.y);
      ctx.stroke();
    }

    // Dispenser — clean simple cylinder with a central note slot
    const spawnP = project(0, spawnZ);
    const dispR = 100 * spawnP.scale;
    const dispH = 18 * spawnP.scale;
    if (dispR > 3) {
      // Thick base cylinder
      this.drawCylinderFast(ctx, spawnP.x, spawnP.y + dispH, dispR, dispH,
        'rgba(25, 25, 25, 0.95)',
        'rgba(170, 170, 170, 0.95)'
      );

      // Dark center slot where notes come out
      ctx.fillStyle = 'rgba(15, 15, 15, 0.95)';
      ctx.beginPath();
      ctx.arc(spawnP.x, spawnP.y, dispR * 0.32, 0, Math.PI * 2);
      ctx.fill();

      // Small bright rim around the slot
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(spawnP.x, spawnP.y, dispR * 0.32, 0, Math.PI * 2);
      ctx.stroke();

      // 4 small indicator lights
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      const lightDist = dispR * 0.72;
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2 - Math.PI / 2;
        const px = spawnP.x + Math.cos(angle) * lightDist;
        const py = spawnP.y + Math.sin(angle) * lightDist * 0.35;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(2, dispR * 0.06), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Receptors — flat ellipses
    for (let i = 0; i < GAME_LANES; i++) {
      const worldX = (i - 1.5) * worldLaneWidth;
      const p = project(worldX, 0);
      const r = worldNoteRadius * p.scale;
      const sh = noteThickness * p.scale;
      this.drawNoteFlat(ctx, p.x, p.y, r, sh, squash,
        this.lanePressed[i] ? 'rgba(200,160,30,0.95)' : 'rgba(140,105,15,0.9)',
        this.lanePressed[i] ? 'rgba(255,235,70,1)' : 'rgba(240,200,50,0.95)'
      );
    }

    // Notes — flat ellipses
    for (let i = this.noteIndex; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note.hit || note.missed) continue;
      const timeDiff = note.time - now;
      const z = timeDiff * scrollSpeed;
      if (z < -100 || z > 2000) { if (z > 0) break; continue; }
      const worldX = (note.lane - 1.5) * worldLaneWidth;
      const p = project(worldX, z);
      const sr = worldNoteRadius * p.scale;
      const sh = noteThickness * p.scale;
      if (sr < 0.5) continue;
      this.drawNoteFlat(ctx, p.x, p.y, sr, sh, squash, 'rgba(180,140,20,1)', 'rgba(255,220,50,1)');
    }

    this.renderHitEffects(ctx);
  }

  drawNoteFlat(ctx, x, y, r, h, squash, sideColor, topColor) {
    // Flat note: draw a full cylinder in a vertically-squashed coordinate space.
    // Rim is drawn separately as a partial arc to avoid the horizontal bottom line.
    const rimColor = 'rgba(0,0,0,0.7)';
    const hScaled = h / squash;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, squash);

    // Body + top face (no rim)
    this.drawCylinderFast(ctx, 0, 0, r, hScaled, sideColor, topColor, null);

    // Partial rim — upper ~75% arc only, avoiding the bottom edge
    ctx.beginPath();
    ctx.arc(0, -hScaled, r, Math.PI * 1.15, -Math.PI * 0.15, true);
    ctx.strokeStyle = rimColor;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.restore();
  }

  drawCylinderFast(ctx, x, y, r, h, sideColor, topColor, rimColor = 'rgba(0,0,0,0.85)') {
    // RoBeats coin style: dark body circle below, bright top face above.
    // Overlap creates a curved crescent side wall — zero straight lines.

    // Dark body (bottom circle)
    ctx.fillStyle = sideColor;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Bright top face (offset upward by h, covers most of dark body)
    ctx.fillStyle = topColor;
    ctx.beginPath();
    ctx.arc(x, y - h, r, 0, Math.PI * 2);
    ctx.fill();

    // Rim stroke (full circle for cylinder mode; flat mode passes null and draws its own partial rim)
    if (rimColor) {
      ctx.beginPath();
      ctx.arc(x, y - h, r, 0, Math.PI * 2);
      ctx.strokeStyle = rimColor;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  renderHitEffects(ctx) {
    const nowPerf = performance.now();
    this.hitEffects = this.hitEffects.filter(fx => {
      const age = nowPerf - fx.birth;
      const duration = 120;
      const progress = age / duration;
      if (progress >= 1) return false;

      const eased = 1 - (1 - progress) * (1 - progress);
      const is3D = typeof render3D !== 'undefined' && render3D;
      const baseRadius = is3D ? 32 : this.noteRadius;
      const startRadius = baseRadius * 0.9;
      const endRadius = baseRadius * 1.5;
      const radius = startRadius + (endRadius - startRadius) * eased;
      const opacity = 0.45 * (1 - progress);

      ctx.beginPath();
      ctx.arc(fx.x, fx.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${opacity})`;
      ctx.fill();

      return true;
    });
  }

  /* ===== Three.js highway renderer ===== */
  initThree() {
    if (this.three) return;
    if (typeof THREE === 'undefined') {
      console.warn('Three.js not loaded; falling back to canvas 3D');
      return;
    }

    const screen = document.getElementById('game-screen');
    const canvas = document.createElement('canvas');
    canvas.id = 'three-canvas';
    canvas.className = 'absolute inset-0 w-full h-full';
    canvas.style.zIndex = '1';
    screen.insertBefore(canvas, screen.firstChild);
    if (this.canvas) this.canvas.style.display = 'none';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    // Highway layout: receptors near the camera (bottom of screen),
    // notes spawn far away (top of screen) and travel down.
    const receptorZ = 8.0;
    const spawnZ = -45;
    const laneWidth = 1.5;

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 120);
    camera.position.set(0, 3.8, 15);
    camera.lookAt(0, -0.25, -6);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const ambient = new THREE.AmbientLight(0xffffff, 0.25);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(0, 12, 14);
    scene.add(dir);
    const rim = new THREE.PointLight(0xffffff, 0.7, 40);
    rim.position.set(0, 6, 10);
    scene.add(rim);

    // Lane lines run from spawn (top) to receptors (bottom)
    const laneMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.14 });
    const laneGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, receptorZ),
      new THREE.Vector3(0, 0, spawnZ)
    ]);
    for (let i = 0; i <= GAME_LANES; i++) {
      const x = (i - GAME_LANES / 2) * laneWidth;
      const line = new THREE.Line(laneGeo, laneMat);
      line.position.x = x;
      scene.add(line);
    }

    // Receptor pads (coin-style cylinders, flat on the highway)
    const padGeo = new THREE.CylinderGeometry(0.72, 0.72, 0.12, 48);
    const padSideMat = new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.35, metalness: 0.85 });
    const padFaceMat = new THREE.MeshStandardMaterial({ color: 0x888888, emissive: 0x111111, roughness: 0.35, metalness: 0.7 });
    const padMats = [padSideMat, padFaceMat, padFaceMat];
    const receptors = [];
    for (let i = 0; i < GAME_LANES; i++) {
      const pad = new THREE.Mesh(padGeo, padMats);
      pad.position.set((i - 1.5) * laneWidth, 0.06, receptorZ);
      scene.add(pad);
      receptors.push(pad);
    }

    // A bright judgment line across the receptors
    const lineGeo = new THREE.BoxGeometry(laneWidth * GAME_LANES + 0.2, 0.04, 0.08);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
    const judgeLine = new THREE.Mesh(lineGeo, lineMat);
    judgeLine.position.set(0, 0.06, receptorZ);
    scene.add(judgeLine);

    // Note geometry / materials (thick coin-style cylinders lying flat on the highway)
    const noteGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.5, 48);
    const laneColors = [0xff5e00, 0xffb300, 0xff2a6d, 0x9d4edd];
    const noteSideMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.25, metalness: 0.9 });
    const noteMats = laneColors.map(c => [
      noteSideMat,
      new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.55, roughness: 0.2, metalness: 0.5 }),
      new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.55, roughness: 0.2, metalness: 0.5 })
    ]);

    this.three = { scene, camera, renderer, receptors, judgeLine, receptorZ, spawnZ, noteGeo, noteMats, notes: [], laneWidth };

    this.threeResize = () => {
      if (!this.three) return;
      this.three.camera.aspect = window.innerWidth / window.innerHeight;
      this.three.camera.updateProjectionMatrix();
      this.three.renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', this.threeResize);

    this.rebuildThreeNotes();
  }

  rebuildThreeNotes() {
    if (!this.three) return;
    this.three.notes.forEach(n => this.three.scene.remove(n.mesh));
    this.three.notes = [];

    for (const note of this.notes) {
      const mesh = new THREE.Mesh(this.three.noteGeo, this.three.noteMats[note.lane]);
      mesh.visible = false;
      this.three.scene.add(mesh);
      this.three.notes.push({ note, mesh });
    }
  }

  destroyThree() {
    if (!this.three) return;
    if (this.threeResize) window.removeEventListener('resize', this.threeResize);
    this.three.notes.forEach(n => this.three.scene.remove(n.mesh));
    this.three.renderer.dispose();
    const c = document.getElementById('three-canvas');
    if (c) c.remove();
    if (this.canvas) this.canvas.style.display = '';
    this.three = null;
  }

  renderThree() {
    if (!this.three) return;
    const t = this.three;

    if (t.notes.length !== this.notes.length) this.rebuildThreeNotes();

    const offsetSec = (typeof inputOffset !== 'undefined' ? inputOffset : 0) / 1000;
    const now = (audioPlayer ? audioPlayer.currentTime : 0) - offsetSec;
    const speedMult = typeof noteSpeed !== 'undefined' ? noteSpeed : 1.0;
    const worldSpeed = 10.5 * speedMult; // units per second

    // Receptor press glow
    for (let i = 0; i < GAME_LANES; i++) {
      const base = this.lanePressed[i] ? 0.9 : 0.08;
      t.receptors[i].material.emissiveIntensity = THREE.MathUtils.lerp(t.receptors[i].material.emissiveIntensity, base, 0.25);
    }

    for (let i = 0; i < t.notes.length; i++) {
      const { note, mesh } = t.notes[i];
      if (note.hit || note.missed) {
        mesh.visible = false;
        continue;
      }
      const timeDiff = note.time - now;
      // Future notes have positive timeDiff; place them at spawnZ (top),
      // then move toward receptorZ (bottom) as the song progresses.
      const z = t.receptorZ - timeDiff * worldSpeed;
      if (z < t.spawnZ - 5 || z > t.receptorZ + 2) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      mesh.position.set((note.lane - 1.5) * t.laneWidth, 0.25, z);
      // Notes grow slightly as they approach the receptors
      const approach = THREE.MathUtils.clamp(1 - (t.receptorZ - z) / (t.receptorZ - t.spawnZ), 0, 1);
      const scale = 0.85 + approach * 0.35;
      mesh.scale.setScalar(scale);
    }

    t.renderer.render(t.scene, t.camera);
  }
}

/* ===== Chart Manager ===== */
const ChartManager = {
  STORAGE_KEY: 'kronox_charts',

  loadCharts() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  },

  saveChart(chart) {
    const charts = this.loadCharts();
    charts.push(chart);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(charts));
  },

  deleteChart(id) {
    let charts = this.loadCharts();
    charts = charts.filter(c => c.id !== id);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(charts));
  },

  generateDemoChart() {
    const bpm = 128;
    const beatInterval = 60 / bpm;
    const duration = 45;
    const notes = [];
    const patterns = [
      [0], [1], [2], [3],
      [0, 2], [1, 3],
      [0, 1], [2, 3],
      [0], [2], [1], [3],
      [0, 3], [1, 2]
    ];

    let patIdx = 0;
    for (let t = 2.0; t < duration; t += beatInterval) {
      if (Math.random() > 0.15) {
        const pattern = patterns[patIdx % patterns.length];
        patIdx++;
        for (const lane of pattern) {
          notes.push({ t: Math.round(t * 1000), l: lane });
        }
      }
      if (Math.random() > 0.92) {
        notes.push({ t: Math.round((t + beatInterval * 0.5) * 1000), l: Math.floor(Math.random() * 4) });
      }
    }

    return {
      id: 'chart_demo_' + Date.now(),
      name: 'Call It What You Like — Demo',
      songUrl: '',
      createdAt: new Date().toISOString(),
      notes
    };
  },

  getPlayableCharts() {
    const charts = this.loadCharts();
    const demo = this.generateDemoChart();
    // If user uploaded audio, filter charts that match or just show all + demo
    return [demo, ...charts];
  }
};

/* ===== Global Game Instance ===== */
let gameEngine = null;

function initGame() {
  if (!gameEngine) gameEngine = new GameEngine();
  return gameEngine;
}

function launchGame() {
  initGame().show();
}

/* ===== DOM Ready Wiring ===== */
const btnPlay = document.getElementById('btn-mode-play');
const btnRecord = document.getElementById('btn-mode-record');
const btnBack = document.getElementById('btn-game-back');
const btnResultBack = document.getElementById('btn-result-back');
const btnPause = document.getElementById('btn-pause');
const btnResume = document.getElementById('btn-resume');
const btnQuit = document.getElementById('btn-quit');
const btnUpload = document.getElementById('btn-upload');
const fileInput = document.getElementById('audio-upload');
const uploadFilename = document.getElementById('upload-filename');

function populateChartList() {
  const listEl = document.getElementById('chart-list');
  const countEl = document.getElementById('chart-count');
  if (!listEl) return;
  const charts = ChartManager.getPlayableCharts();
  listEl.innerHTML = '';

  // Separate by origin: user recordings vs built-in demo
  const userCharts = charts.filter(c => c.id && !c.id.startsWith('chart_demo'));
  const builtinCharts = charts.filter(c => c.id && c.id.startsWith('chart_demo'));

  const totalCount = charts.length;
  if (countEl) countEl.textContent = totalCount + ' chart' + (totalCount !== 1 ? 's' : '');

  const renderChart = (chart, isUser) => {
    const row = document.createElement('div');
    row.className = 'chart-item group w-full relative';
    row.style.cssText = 'margin-bottom: 6px;';
    row.innerHTML = `
      <div class="absolute inset-0 border border-white opacity-10 group-hover:opacity-40 transition-opacity duration-300"></div>
      <div class="absolute inset-0 bg-white origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300 ease-out"></div>
      <div class="relative flex items-center justify-between py-3 px-4">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-1 h-1 bg-white opacity-20 group-hover:opacity-60 transition-opacity flex-shrink-0"></div>
          <span class="text-xs tracking-[0.12em] uppercase font-medium group-hover:invert transition-all duration-300 truncate">${chart.name}</span>
        </div>
        <div class="flex items-center gap-3 flex-shrink-0 ml-3">
          <span class="text-[10px] tracking-[0.1em] uppercase opacity-25 group-hover:opacity-80 transition-opacity font-mono">${chart.notes.length}N</span>
          ${isUser ? `<button class="chart-delete text-[10px] tracking-[0.05em] uppercase opacity-20 hover:opacity-100 hover:text-red-400 transition-all px-1" data-id="${chart.id}" title="Delete chart">×</button>` : ''}
        </div>
      </div>
    `;
    // Play on clicking the row (but not the delete button)
    row.addEventListener('click', (e) => {
      if (e.target.closest('.chart-delete')) return;
      if (gameEngine.uploadedAudioUrl) chart.songUrl = gameEngine.uploadedAudioUrl;
      gameEngine.start(chart, 'play');
    });
    // Delete handler
    const delBtn = row.querySelector('.chart-delete');
    if (delBtn) {
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        ChartManager.deleteChart(chart.id);
        populateChartList();
      });
    }
    listEl.appendChild(row);
  };

  if (userCharts.length) {
    const label = document.createElement('p');
    label.className = 'text-[9px] tracking-[0.2em] uppercase opacity-25 mb-2 mt-1';
    label.textContent = 'Your Charts';
    listEl.appendChild(label);
    userCharts.forEach(c => renderChart(c, true));
  }

  if (builtinCharts.length) {
    const label = document.createElement('p');
    label.className = 'text-[9px] tracking-[0.2em] uppercase opacity-25 mb-2 mt-1';
    label.textContent = 'Built-in';
    listEl.appendChild(label);
    builtinCharts.forEach(c => renderChart(c, false));
  }

  if (totalCount === 0) {
    const empty = document.createElement('p');
    empty.className = 'text-xs tracking-wider opacity-20 py-6 text-center';
    empty.textContent = 'No charts available. Play Demo or Record your own.';
    listEl.appendChild(empty);
  }
}

if (btnPlay) {
  btnPlay.addEventListener('click', () => {
    const chart = ChartManager.generateDemoChart();
    if (gameEngine.uploadedAudioUrl) chart.songUrl = gameEngine.uploadedAudioUrl;
    gameEngine.start(chart, 'play');
  });
}

if (btnRecord) {
  btnRecord.addEventListener('click', () => {
    // Stop menu music before recording
    if (typeof stopMusic === 'function') stopMusic();
    gameEngine.start(null, 'record');
  });
}

if (btnBack) {
  btnBack.addEventListener('click', () => {
    gameEngine.hide();
    const menu = document.getElementById('menu-content');
    if (menu) menu.style.display = '';
  });
}

if (btnResultBack) {
  btnResultBack.addEventListener('click', () => {
    gameEngine.showPregame();
  });
}

if (btnPause) {
  btnPause.addEventListener('click', () => {
    gameEngine.togglePause();
  });
}

if (btnResume) {
  btnResume.addEventListener('click', () => {
    gameEngine.togglePause();
  });
}

if (btnQuit) {
  btnQuit.addEventListener('click', () => {
    gameEngine.quitToPregame();
  });
}

if (btnUpload && fileInput) {
  btnUpload.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    gameEngine.uploadedAudioUrl = url;
    gameEngine.audioFileName = file.name;
    if (uploadFilename) uploadFilename.textContent = file.name;
  });
}
