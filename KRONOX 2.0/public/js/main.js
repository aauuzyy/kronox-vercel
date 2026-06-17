/* ===== Particle System ===== */
const canvas = document.getElementById('particles');
const ctx = canvas.getContext('2d');
let particles = [];
let particlesEnabled = true;

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

class Particle {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * canvas.height;
    this.size = Math.random() * 1.5 + 0.5;
    this.speedX = (Math.random() - 0.5) * 0.3;
    this.speedY = (Math.random() - 0.5) * 0.3;
    this.opacity = Math.random() * 0.5 + 0.1;
    this.pulse = Math.random() * Math.PI * 2;
    this.pulseSpeed = Math.random() * 0.02 + 0.005;
  }

  update() {
    this.x += this.speedX;
    this.y += this.speedY;
    this.pulse += this.pulseSpeed;

    if (this.x < 0 || this.x > canvas.width) this.speedX *= -1;
    if (this.y < 0 || this.y > canvas.height) this.speedY *= -1;
  }

  draw() {
    const pulseOpacity = this.opacity * (0.7 + 0.3 * Math.sin(this.pulse));
    ctx.fillStyle = `rgba(255, 255, 255, ${pulseOpacity})`;
    ctx.fillRect(this.x, this.y, this.size, this.size);
  }
}

function initParticles() {
  particles = [];
  const count = Math.min(Math.floor((canvas.width * canvas.height) / 15000), 120);
  for (let i = 0; i < count; i++) {
    particles.push(new Particle());
  }
}
initParticles();

function animateParticles() {
  if (!particlesEnabled) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  particles.forEach(p => {
    p.update();
    p.draw();
  });

  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[i].x - particles[j].x;
      const dy = particles[i].y - particles[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < 100) {
        const opacity = (1 - dist / 100) * 0.08;
        ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(particles[i].x, particles[i].y);
        ctx.lineTo(particles[j].x, particles[j].y);
        ctx.stroke();
      }
    }
  }
  
  requestAnimationFrame(animateParticles);
}
animateParticles();

/* ===== Playlist Audio System ===== */
let audioPlayer = null;
let playlist = [];
let shuffledPlaylist = [];
let currentTrackIndex = 0;
let isPlaying = false;
let audioEnabled = true;
let audioCtx = null;
let mediaSource = null;
let analyser = null;
let bassDataArray = null;

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function setupAudioAnalyser() {
  if (!audioPlayer || !audioCtx) return;

  if (analyser) {
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.85;
    return;
  }

  try {
    mediaSource = audioCtx.createMediaElementSource(audioPlayer);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.85;

    mediaSource.connect(analyser);
    analyser.connect(audioCtx.destination);

    bassDataArray = new Uint8Array(analyser.frequencyBinCount);
  } catch (e) {
    // Already connected or other error
  }
}

function parseTrackName(filename) {
  if (filename.includes('Call-It-What-You-Like')) {
    return 'Call It What You Like — Robbie Doherty';
  }
  const match = filename.match(/_YouTube_(.+?)_Media_/);
  if (match) {
    return match[1].replace(/-/g, ' ');
  }
  return filename.replace(/\.mp3$/, '');
}

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function loadPlaylist() {
  try {
    const res = await fetch('/playlist');
    const files = await res.json();
    playlist = files;
    shuffledPlaylist = shuffleArray(files);
  } catch (e) {
    console.error('Failed to load playlist', e);
  }
}

function updateTrackDisplay() {
  const el = document.getElementById('track-name');
  if (!el) return;
  if (isPlaying && shuffledPlaylist[currentTrackIndex]) {
    el.textContent = parseTrackName(shuffledPlaylist[currentTrackIndex].filename);
    el.style.opacity = '0.4';
  } else {
    el.style.opacity = '0';
  }
}

let fadeRafId = null;

function fadeAudioVolume(startVol, endVol, durationMs, onComplete) {
  if (fadeRafId) {
    cancelAnimationFrame(fadeRafId);
  }
  const startTime = performance.now();
  function step() {
    const elapsed = performance.now() - startTime;
    const t = Math.min(elapsed / durationMs, 1);
    // Ease in-out quad
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const vol = startVol + (endVol - startVol) * ease;
    if (audioPlayer) {
      audioPlayer.volume = Math.max(0, Math.min(1, vol));
    }
    if (t < 1) {
      fadeRafId = requestAnimationFrame(step);
    } else {
      fadeRafId = null;
      if (onComplete) onComplete();
    }
  }
  fadeRafId = requestAnimationFrame(step);
}

function playTrack(index) {
  if (!shuffledPlaylist.length) return;
  currentTrackIndex = ((index % shuffledPlaylist.length) + shuffledPlaylist.length) % shuffledPlaylist.length;
  const track = shuffledPlaylist[currentTrackIndex];

  if (!audioPlayer) {
    audioPlayer = new Audio();
    audioPlayer.crossOrigin = 'anonymous';
    audioPlayer.addEventListener('ended', () => {
      if (window.gameInProgress) return;
      playTrack(currentTrackIndex + 1);
    });
  }

  audioPlayer.src = track.url;
  const sliderVal = document.querySelector('.slider')?.value || 70;
  const targetVol = parseFloat(sliderVal) / 100;
  audioPlayer.volume = 0;

  const playPromise = audioPlayer.play();
  if (playPromise !== undefined) {
    playPromise.then(() => {
      isPlaying = true;
      updateMusicIcon();
      updateTrackDisplay();
      setupAudioAnalyser();
      fadeAudioVolume(0, targetVol, 600);
    }).catch(() => {
      isPlaying = false;
      updateMusicIcon();
    });
  } else {
    isPlaying = true;
    updateMusicIcon();
    updateTrackDisplay();
    setupAudioAnalyser();
    fadeAudioVolume(0, targetVol, 600);
  }
}

function stopMusic() {
  if (audioPlayer) {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
  }
  isPlaying = false;
  updateMusicIcon();
  updateTrackDisplay();
}

function toggleMusic() {
  audioEnabled = !audioEnabled;
  if (audioEnabled) {
    initAudio();
    if (audioCtx?.state === 'suspended') {
      audioCtx.resume();
    }
    if (!shuffledPlaylist.length) {
      loadPlaylist().then(() => {
        if (shuffledPlaylist.length) playTrack(currentTrackIndex);
      });
    } else {
      playTrack(currentTrackIndex);
    }
  } else {
    if (audioPlayer && isPlaying) {
      const currentVol = audioPlayer.volume;
      fadeAudioVolume(currentVol, 0, 350, () => {
        stopMusic();
      });
    } else {
      stopMusic();
    }
  }
  updateMusicIcon();
}

function updateMusicIcon() {
  const onIcon = document.getElementById('icon-music-on');
  const offIcon = document.getElementById('icon-music-off');
  if (audioEnabled) {
    onIcon.classList.remove('hidden');
    offIcon.classList.add('hidden');
  } else {
    onIcon.classList.add('hidden');
    offIcon.classList.remove('hidden');
  }
}

/* ===== Bass-Reactive Title ===== */
const kronoxTitle = document.getElementById('kronox-title');
let lastBassIntensity = 0;

function animateBassReactiveTitle() {
  requestAnimationFrame(animateBassReactiveTitle);

  if (!analyser || !bassDataArray || !isPlaying) {
    kronoxTitle.style.textShadow = '0 0 40px rgba(255,255,255,0.1)';
    lastBassIntensity = 0;
    return;
  }

  analyser.getByteFrequencyData(bassDataArray);

  // fftSize 256 → 128 bins. At 44.1kHz, each bin ≈ 172Hz.
  // True bass: bin 0 (0–172Hz) and bin 1 (172–344Hz) for sub-bass warmth.
  const bassBins = 2;
  let bassSum = 0;
  for (let i = 0; i < bassBins; i++) {
    bassSum += bassDataArray[i];
  }
  const bassAvg = bassSum / bassBins;

  // Floor to ignore noise/silence, ceiling to avoid maxing out
  const floor = 35;
  const ceiling = 210;
  let normalized = Math.max(0, bassAvg - floor) / (ceiling - floor);
  normalized = Math.min(normalized, 1);

  // Exponential decay / attack smoothing for less jitter
  const attack = 0.35;
  const decay = 0.12;
  if (normalized > lastBassIntensity) {
    lastBassIntensity += (normalized - lastBassIntensity) * attack;
  } else {
    lastBassIntensity += (normalized - lastBassIntensity) * decay;
  }

  const glowSize = 22 + lastBassIntensity * 50;
  const glowOpacity = 0.05 + lastBassIntensity * 0.18;

  kronoxTitle.style.textShadow = `0 0 ${glowSize}px rgba(255,255,255,${glowOpacity})`;
}
animateBassReactiveTitle();

/* ===== Game State ===== */
window.gameInProgress = false;

/* ===== Settings Load / Save ===== */
const SETTINGS_KEY = 'kronox-settings';
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return s;
  } catch { return {}; }
}
function saveSettings(obj) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(obj));
}
const saved = loadSettings();

let screenShakeEnabled = saved.screenShakeEnabled ?? false;
let inputOffset = saved.inputOffset ?? 0;
let noteSpeed = saved.noteSpeed ?? 1.0;
let currentKeybinds = saved.currentKeybinds ?? ['D', 'F', 'J', 'K'];
let masterVolume = saved.masterVolume ?? 70;
let render3D = saved.render3D ?? false;
let render3DMode = saved.render3DMode ?? 'cylinder';

// Apply loaded values to UI
if (saved.noteSpeed !== undefined) {
  const sv = document.getElementById('speed-value');
  if (sv) sv.textContent = noteSpeed.toFixed(1) + 'x';
}
if (saved.inputOffset !== undefined) {
  const ov = document.getElementById('offset-value');
  if (ov) ov.textContent = (inputOffset >= 0 ? '+' : '') + inputOffset + 'ms';
}
if (saved.currentKeybinds !== undefined) {
  const kv = document.getElementById('keybindings-value');
  if (kv) kv.textContent = currentKeybinds.join('');
}
if (saved.screenShakeEnabled) {
  const ts = document.getElementById('toggle-shake');
  if (ts) ts.classList.add('toggle-active');
}
if (saved.render3D) {
  const t3d = document.getElementById('toggle-3d');
  if (t3d) t3d.classList.add('toggle-active');
}
// 3D Mode dropdown visibility + custom dropdown wiring
const modeRow = document.getElementById('row-3d-mode');
const btn3DMode = document.getElementById('btn-3d-mode');
const menu3DMode = document.getElementById('menu-3d-mode');
const label3DMode = document.getElementById('label-3d-mode');

function update3DModeLabel() {
  if (!label3DMode) return;
  const labels = {
    flat: 'Flat (RoBeats)',
    cylinder: 'Cylinder',
    three: 'Three.js'
  };
  label3DMode.textContent = labels[render3DMode] || 'Cylinder';
}

if (modeRow) {
  modeRow.style.display = render3D ? '' : 'none';
}
update3DModeLabel();

if (btn3DMode && menu3DMode) {
  btn3DMode.addEventListener('click', (e) => {
    e.stopPropagation();
    menu3DMode.classList.toggle('hidden');
  });

  menu3DMode.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
      render3DMode = item.dataset.value;
      update3DModeLabel();
      menu3DMode.classList.add('hidden');
    });
  });

  document.addEventListener('click', () => {
    menu3DMode.classList.add('hidden');
  });
}
if (saved.masterVolume !== undefined) {
  const slider = document.querySelector('.slider');
  if (slider) slider.value = masterVolume;
  if (audioPlayer) audioPlayer.volume = masterVolume / 100;
}

/* ===== UI Interactions ===== */
const btnMusic = document.getElementById('btn-music');
const btnStart = document.getElementById('btn-start');
const btnSettings = document.getElementById('btn-settings');
const btnCredits = document.getElementById('btn-credits');
const btnCloseSettings = document.getElementById('btn-close-settings');
const btnCloseCredits = document.getElementById('btn-close-credits');
const modalSettings = document.getElementById('modal-settings');
const modalCredits = document.getElementById('modal-credits');
const startOverlay = document.getElementById('start-overlay');
const toggleParticles = document.getElementById('toggle-particles');
const toggleShake = document.getElementById('toggle-shake');

btnMusic.addEventListener('click', toggleMusic);

const loadingPercent = document.getElementById('loading-percent');
const loadingStatus = document.getElementById('loading-status');
const loadingBar = document.getElementById('loading-bar');
const loadingMeta = document.getElementById('loading-meta');
const statusMessages = [
  'Loading assets',
  'Initializing audio engine',
  'Building shaders',
  'Calibrating input latency',
  'Preparing stage geometry'
];
const metaMessages = [
  'MEM: 4096MB OK',
  'CPU: 3.2GHz ONLINE',
  'GPU: RENDER READY',
  'AUDIO: 44.1kHz SYNC',
  'INPUT: POLLING ACTIVE'
];

btnStart.addEventListener('click', () => {
  // Fade out music
  if (audioPlayer && isPlaying) {
    const currentVol = audioPlayer.volume;
    fadeAudioVolume(currentVol, 0, 1400);
  }

  startOverlay.classList.add('start-active');

  // Animate loading progress
  const duration = 3000;
  const startTime = performance.now();

  function updateLoading() {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const pct = Math.floor(eased * 100);

    loadingPercent.textContent = pct + '%';
    loadingBar.style.width = pct + '%';

    const msgIndex = Math.min(Math.floor(progress * statusMessages.length), statusMessages.length - 1);
    loadingStatus.textContent = statusMessages[msgIndex];

    const metaIndex = Math.min(Math.floor(progress * metaMessages.length), metaMessages.length - 1);
    loadingMeta.textContent = metaMessages[metaIndex];

    if (progress < 1) {
      requestAnimationFrame(updateLoading);
    } else {
      setTimeout(() => {
        startOverlay.classList.remove('start-active');
        // Hide menu, launch game
        const menu = document.getElementById('menu-content');
        if (menu) menu.style.display = 'none';
        if (typeof launchGame === 'function') launchGame();
        // Reset for next time
        setTimeout(() => {
          loadingPercent.textContent = '0%';
          loadingBar.style.width = '0%';
          loadingStatus.textContent = statusMessages[0];
        }, 700);
      }, 400);
    }
  }
  requestAnimationFrame(updateLoading);

  // Ensure music stops after fade completes
  setTimeout(() => {
    if (audioPlayer && isPlaying) {
      stopMusic();
    }
  }, 3200);
});

function openModal(modal) {
  modal.classList.add('modal-open');
}

function closeModal(modal) {
  modal.classList.remove('modal-open');
}

btnSettings.addEventListener('click', () => {
  openModal(modalSettings);
});

btnCloseSettings.addEventListener('click', () => {
  closeModal(modalSettings);
});

btnCredits.addEventListener('click', () => {
  openModal(modalCredits);
});

btnCloseCredits.addEventListener('click', () => {
  closeModal(modalCredits);
});

// Close modals on backdrop click
modalSettings.querySelector('.modal-backdrop').addEventListener('click', () => {
  closeModal(modalSettings);
});

modalCredits.querySelector('.modal-backdrop').addEventListener('click', () => {
  closeModal(modalCredits);
});

// Particle toggle
toggleParticles.addEventListener('click', () => {
  particlesEnabled = !particlesEnabled;
  toggleParticles.classList.toggle('toggle-active', particlesEnabled);
  if (particlesEnabled) {
    animateParticles();
  }
});

// Screen Shake toggle
toggleShake.addEventListener('click', () => {
  screenShakeEnabled = !screenShakeEnabled;
  toggleShake.classList.toggle('toggle-active', screenShakeEnabled);
});

// 3D Highway toggle
const toggle3D = document.getElementById('toggle-3d');
if (toggle3D) {
  toggle3D.addEventListener('click', () => {
    render3D = !render3D;
    toggle3D.classList.toggle('toggle-active', render3D);
    if (modeRow) modeRow.style.display = render3D ? '' : 'none';
  });
}


// Input Offset controls
const offsetValue = document.getElementById('offset-value');
document.getElementById('offset-minus').addEventListener('click', () => {
  inputOffset = Math.max(-50, inputOffset - 5);
  offsetValue.textContent = (inputOffset >= 0 ? '+' : '') + inputOffset + 'ms';
});
document.getElementById('offset-plus').addEventListener('click', () => {
  inputOffset = Math.min(50, inputOffset + 5);
  offsetValue.textContent = (inputOffset >= 0 ? '+' : '') + inputOffset + 'ms';
});

// Note Speed controls
const speedValue = document.getElementById('speed-value');
document.getElementById('speed-minus').addEventListener('click', () => {
  noteSpeed = Math.max(0.5, Math.round((noteSpeed - 0.1) * 10) / 10);
  speedValue.textContent = noteSpeed.toFixed(1) + 'x';
});
document.getElementById('speed-plus').addEventListener('click', () => {
  noteSpeed = Math.min(5.0, Math.round((noteSpeed + 0.1) * 10) / 10);
  speedValue.textContent = noteSpeed.toFixed(1) + 'x';
});

/* ===== Keybind Capture System ===== */
const keybindCapture = document.getElementById('keybind-capture');
const keybindSlots = document.querySelectorAll('.keybind-slot');
const keybindCancel = document.getElementById('keybind-cancel');
const keybindRow = document.getElementById('keybindings-row');
const keybindValue = document.getElementById('keybindings-value');

let capturingKeys = false;
let capturedKeys = [];

function openKeybindCapture() {
  capturingKeys = true;
  capturedKeys = [];
  keybindCapture.classList.add('capture-open');

  keybindSlots.forEach((slot, i) => {
    slot.classList.remove('filled', 'pulse');
    slot.innerHTML = '<span class="keybind-placeholder">—</span>';
  });

  // Remove confirm button if exists
  const existingConfirm = document.getElementById('keybind-confirm');
  if (existingConfirm) existingConfirm.remove();
}

function closeKeybindCapture(saved) {
  capturingKeys = false;
  capturedKeys = [];
  keybindCapture.classList.remove('capture-open');

  if (saved) {
    showNotification('Keybindings Updated');
  }
}

function addConfirmButton() {
  if (document.getElementById('keybind-confirm')) return;
  
  const confirmBtn = document.createElement('button');
  confirmBtn.id = 'keybind-confirm';
  confirmBtn.className = 'text-xs tracking-[0.2em] uppercase opacity-80 hover:opacity-100 transition-opacity px-4 py-2 border border-white';
  confirmBtn.textContent = 'Confirm';
  confirmBtn.addEventListener('click', () => {
    currentKeybinds = [...capturedKeys];
    keybindValue.textContent = currentKeybinds.join('');
    closeKeybindCapture(true);
  });
  
  document.getElementById('keybind-actions').insertBefore(confirmBtn, keybindCancel);
}

keybindRow.addEventListener('click', openKeybindCapture);
keybindValue.addEventListener('click', (e) => {
  e.stopPropagation();
  openKeybindCapture();
});

keybindCancel.addEventListener('click', () => closeKeybindCapture(false));

document.addEventListener('keydown', (e) => {
  if (!capturingKeys) return;
  e.preventDefault();

  // Accept any single printable character or named key
  let key = e.key;
  // Block modifier-only keys
  const blocked = ['Control', 'Alt', 'Shift', 'Meta', 'CapsLock', 'Tab', 'Enter', 'Backspace', 'Delete', 'Escape'];
  if (blocked.includes(key)) return;
  if (capturedKeys.includes(key)) return;

  capturedKeys.push(key);
  const slot = keybindSlots[capturedKeys.length - 1];
  // Display friendly name
  let display = key;
  if (key === ' ') display = 'Space';
  else if (key.length > 1) display = key;
  slot.innerHTML = `<span>${display}</span>`;
  slot.classList.add('filled', 'pulse');
  setTimeout(() => slot.classList.remove('pulse'), 400);

  if (capturedKeys.length === 4) {
    addConfirmButton();
  }
});

/* ===== Credit Tabs with Transitions ===== */
const creditTabs = document.querySelectorAll('.credit-tab');
const tabPanels = document.querySelectorAll('.tab-panel');

creditTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const targetId = 'tab-' + tab.dataset.tab;
    
    // Update tab buttons
    creditTabs.forEach(t => t.classList.remove('tab-active'));
    tab.classList.add('tab-active');
    
    // Find current and target panels
    const currentPanel = document.querySelector('.tab-panel.active');
    const targetPanel = document.getElementById(targetId);
    
    if (currentPanel && currentPanel !== targetPanel) {
      currentPanel.classList.remove('active');
      targetPanel.classList.add('active');
    }
  });
});

// Keyboard support
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (capturingKeys) {
      closeKeybindCapture(false);
      return;
    }
    closeModal(modalSettings);
    closeModal(modalCredits);
  }
});

// Volume slider interaction
const slider = document.querySelector('.slider');
slider.addEventListener('input', (e) => {
  masterVolume = parseFloat(e.target.value);
  if (audioPlayer) {
    audioPlayer.volume = masterVolume / 100;
  }
});

/* ===== Save Options ===== */
document.getElementById('btn-save-settings').addEventListener('click', () => {
  saveSettings({
    screenShakeEnabled,
    inputOffset,
    noteSpeed,
    currentKeybinds,
    masterVolume,
    render3D,
    render3DMode
  });
  showNotification('Options Saved');
  closeModal(modalSettings);
});

function showNotification(text) {
  const notif = document.getElementById('notification');
  const notifText = document.getElementById('notification-text');
  notifText.textContent = text;
  notif.classList.add('show');
  
  setTimeout(() => {
    notif.classList.remove('show');
  }, 2200);
}

// Click sound effect (very subtle)
function playClick() {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.type = 'sine';
  osc.frequency.value = 800;
  
  gain.gain.setValueAtTime(0.03, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  osc.start();
  osc.stop(audioCtx.currentTime + 0.1);
}

// Add subtle click to all buttons
document.querySelectorAll('button').forEach(btn => {
  btn.addEventListener('click', () => {
    if (audioCtx && isPlaying) playClick();
  });
});

// Hover sound effect (very subtle)
let lastHoverTime = 0;
function playHover() {
  if (!audioCtx || !isPlaying) return;
  const now = Date.now();
  if (now - lastHoverTime < 60) return;
  lastHoverTime = now;
  
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  
  osc.type = 'sine';
  osc.frequency.value = 1200;
  
  filter.type = 'lowpass';
  filter.frequency.value = 3000;
  
  gain.gain.setValueAtTime(0, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0.008, audioCtx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.04);
  
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  
  osc.start();
  osc.stop(audioCtx.currentTime + 0.05);
}

// Attach hover sound to all interactive elements
const hoverTargets = document.querySelectorAll('.menu-btn, .setting-row, .credit-row, #btn-close-settings, #btn-close-credits, #btn-music');
hoverTargets.forEach(el => {
  el.addEventListener('mouseenter', playHover);
});

/* ===== Player Stats ===== */
const STATS_KEY = 'kronox-player-stats';
const HISTORY_KEY = 'kronox-history';
const LEADERBOARD_KEY = 'kronox-leaderboard';

function loadPlayerStats() {
  try { return JSON.parse(localStorage.getItem(STATS_KEY) || '{}'); } catch { return {}; }
}
function savePlayerStats(stats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
function saveHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-20)));
}
function loadLeaderboard() {
  try { return JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || '[]'); } catch { return []; }
}
function saveLeaderboard(scores) {
  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(scores.slice(0, 50)));
}

function renderPlayerStats() {
  const stats = loadPlayerStats();
  const tp = document.getElementById('stat-total-plays');
  const ba = document.getElementById('stat-best-acc');
  const ts = document.getElementById('stat-total-score');
  if (tp) tp.textContent = stats.totalPlays || 0;
  if (ba) ba.textContent = (stats.bestAccuracy || 0).toFixed(1) + '%';
  if (ts) ts.textContent = (stats.totalScore || 0).toLocaleString();

  const recentEl = document.getElementById('recent-plays');
  const history = loadHistory();
  if (recentEl) {
    if (history.length === 0) {
      recentEl.innerHTML = '<p class="text-[10px] tracking-[0.1em] opacity-20">No plays yet</p>';
    } else {
      recentEl.innerHTML = history.slice(-3).reverse().map(h => `
        <div class="flex items-center justify-end gap-3 opacity-40 hover:opacity-80 transition-opacity">
          <span class="text-[10px] tracking-[0.1em] truncate max-w-[120px]">${h.chartName || 'Demo'}</span>
          <span class="text-[10px] tracking-wider font-medium">${h.score?.toLocaleString() || 0}</span>
          <span class="text-[9px] tracking-[0.05em] opacity-50">${h.accuracy || 0}%</span>
        </div>
      `).join('');
    }
  }
}

renderPlayerStats();

/* ===== Leaderboard Modal ===== */
const btnLeaderboardMenu = document.getElementById('btn-leaderboard-menu');
const btnCloseLeaderboard = document.getElementById('btn-close-leaderboard');
const modalLeaderboard = document.getElementById('modal-leaderboard');

function openLeaderboard() {
  const list = document.getElementById('leaderboard-list');
  const scores = loadLeaderboard();
  if (list) {
    if (scores.length === 0) {
      list.innerHTML = '<p class="text-xs tracking-wider opacity-30 py-4 text-center">No scores yet</p>';
    } else {
      list.innerHTML = scores.slice(0, 20).map((s, i) => `
        <div class="leaderboard-row">
          <span class="leaderboard-rank">#${i + 1}</span>
          <span class="leaderboard-name truncate">${s.chartName || 'Unknown'}</span>
          <span class="leaderboard-score">${s.score?.toLocaleString() || 0}</span>
          <span class="leaderboard-acc">${s.accuracy || 0}%</span>
        </div>
      `).join('');
    }
  }
  modalLeaderboard.classList.add('modal-open');
}

function closeLeaderboard() {
  modalLeaderboard.classList.remove('modal-open');
}

if (btnLeaderboardMenu) btnLeaderboardMenu.addEventListener('click', openLeaderboard);
if (btnCloseLeaderboard) btnCloseLeaderboard.addEventListener('click', closeLeaderboard);
if (modalLeaderboard) {
  modalLeaderboard.querySelector('.modal-backdrop')?.addEventListener('click', closeLeaderboard);
}

/* ===== Autoplay on load ===== */
async function startFromRandom() {
  if (!shuffledPlaylist.length) return;
  currentTrackIndex = Math.floor(Math.random() * shuffledPlaylist.length);
  initAudio();
  if (audioCtx?.state === 'suspended') {
    await audioCtx.resume();
  }
  playTrack(currentTrackIndex);
}

// Try autoplay immediately (may be blocked by browser)
loadPlaylist().then(() => {
  startFromRandom();
});

// Set initial icon state
updateMusicIcon();

/* ===== Film Grain Overlay ===== */
const grainCanvas = document.getElementById('grain');
const grainCtx = grainCanvas.getContext('2d');
let grainFrame = 0;

function resizeGrain() {
  grainCanvas.width = Math.ceil(window.innerWidth / 3);
  grainCanvas.height = Math.ceil(window.innerHeight / 3);
}
resizeGrain();
window.addEventListener('resize', resizeGrain);

function drawGrain() {
  const w = grainCanvas.width;
  const h = grainCanvas.height;
  const idata = grainCtx.getImageData(0, 0, w, h);
  const data = idata.data;

  for (let i = 0; i < data.length; i += 4) {
    const val = Math.random() * 255;
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
    data[i + 3] = Math.random() * 20;
  }

  grainCtx.putImageData(idata, 0, 0);
  grainFrame = requestAnimationFrame(drawGrain);
}
drawGrain();

// Fallback: start on any interaction until audio actually plays
function handleFirstInteraction() {
  if (audioEnabled && !isPlaying && shuffledPlaylist.length) {
    initAudio();
    if (audioCtx?.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    startFromRandom();
  }
  // Only remove listeners once audio is actually playing
  if (isPlaying) {
    document.removeEventListener('click', handleFirstInteraction);
    document.removeEventListener('keydown', handleFirstInteraction);
    document.removeEventListener('touchstart', handleFirstInteraction);
  }
}
document.addEventListener('click', handleFirstInteraction);
document.addEventListener('keydown', handleFirstInteraction);
document.addEventListener('touchstart', handleFirstInteraction, { passive: true });
