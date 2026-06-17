import { buildChart } from '../constants.js'

const CHORD2 = [[0, 3], [1, 2], [0, 2], [1, 3], [0, 1], [2, 3]]
const CHORD3 = [[0, 1, 3], [0, 2, 3], [1, 2, 3], [0, 1, 2]]

const STREAMS = [
  [0, 1, 2, 3], [3, 2, 1, 0],
  [0, 1, 2, 1], [3, 2, 1, 2],
  [0, 1, 0, 1], [2, 3, 2, 3], [1, 2, 1, 2], [0, 3, 0, 3],
  [0, 2, 1, 3], [3, 1, 2, 0], [1, 3, 0, 2], [2, 0, 3, 1],
  [0, 1, 3, 2], [2, 3, 1, 0], [1, 0, 2, 3], [3, 2, 0, 1],
  [0, 3, 1, 3], [3, 0, 2, 0], [1, 0, 3, 0], [2, 3, 0, 3],
  [0, 2, 3, 1], [3, 1, 0, 2], [1, 3, 2, 0], [2, 0, 1, 3],
  [0, 1, 2, 0], [3, 2, 1, 3], [0, 2, 0, 3], [3, 1, 3, 0],
  [0, 3, 2, 1], [1, 2, 3, 0], [0, 3, 1, 2], [3, 0, 2, 1],
]

export async function generateChart(songFile, bpm, subdivision, beats) {
  const arrayBuf = await songFile.arrayBuffer()
  const ctx = new OfflineAudioContext(1, 1, 44100)
  const decoded = await ctx.decodeAudioData(arrayBuf)
  const raw = decoded.getChannelData(0)
  const sr = decoded.sampleRate

  const totalSteps = beats * subdivision
  const secPerStep = 60 / (bpm * subdivision)
  const sampPerStep = Math.max(1, Math.floor(secPerStep * sr))

  const stepRMS = new Float32Array(totalSteps)
  for (let i = 0; i < totalSteps; i++) {
    const s = i * sampPerStep
    const e = Math.min(s + sampPerStep, raw.length)
    if (s >= raw.length) break
    let sum = 0
    for (let j = s; j < e; j++) sum += raw[j] * raw[j]
    stepRMS[i] = Math.sqrt(sum / (e - s))
  }

  const onsetStr = new Float32Array(totalSteps)
  let base = 0
  const nf = Math.floor(raw.length / 1024)
  for (let f = 0; f < nf; f++) {
    const s = f * 1024
    let sum = 0
    for (let i = s; i < s + 1024; i++) sum += raw[i] * raw[i]
    const rms = Math.sqrt(sum / 1024)
    if (base === 0) base = Math.max(rms, 0.001)
    base = base * 0.997 + rms * 0.003
    const onset = Math.max(0, (rms - base * 0.5) / Math.max(base * 1.5, 0.001))
    const step = Math.round(f * 1024 / sr / secPerStep)
    if (step >= 1 && step < totalSteps && onset > onsetStr[step]) onsetStr[step] = onset
  }

  const active = new Uint8Array(totalSteps)
  for (let i = 1; i < totalSteps; i++) {
    if (onsetStr[i] >= 0.04) active[i] = 1
  }

  let cnt = 0
  for (let i = 0; i < totalSteps; i++) cnt += active[i]
  const TARGET = Math.round(totalSteps * 0.55)
  const CAP = Math.round(totalSteps * 0.65)

  if (cnt < TARGET) {
    const winSize = subdivision * 4
    const relRMS = new Float32Array(totalSteps)
    for (let i = 0; i < totalSteps; i++) {
      const ws = Math.max(0, i - winSize / 2)
      const we = Math.min(totalSteps, i + winSize / 2)
      let localMax = 0
      for (let j = ws; j < we; j++) if (stepRMS[j] > localMax) localMax = stepRMS[j]
      relRMS[i] = localMax > 0 ? stepRMS[i] / localMax : 0
    }
    const inactive = []
    for (let i = 1; i < totalSteps; i++) if (!active[i]) inactive.push(i)
    inactive.sort((a, b) => relRMS[b] - relRMS[a])
    const need = Math.min(TARGET - cnt, inactive.length)
    for (let n = 0; n < need; n++) { active[inactive[n]] = 1; cnt++ }
  }

  if (cnt > CAP) {
    const actArr = []
    for (let i = 1; i < totalSteps; i++) if (active[i]) actArr.push([i, onsetStr[i] + stepRMS[i]])
    actArr.sort((a, b) => a[1] - b[1])
    const remove = cnt - CAP
    for (let n = 0; n < remove; n++) active[actArr[n][0]] = 0
  }

  for (let beat = 0; beat < Math.ceil(totalSteps / subdivision); beat++) {
    const start = beat * subdivision
    const end = Math.min(start + subdivision, totalSteps)
    let hasNote = false
    for (let i = start; i < end; i++) if (active[i]) { hasNote = true; break }
    if (!hasNote) {
      let best = start, bestRMS = -1
      for (let i = start; i < end; i++) {
        if (stepRMS[i] > bestRMS) { bestRMS = stepRMS[i]; best = i }
      }
      active[best] = 1
    }
  }

  const vals = []
  for (let i = 1; i < totalSteps; i++) if (active[i]) vals.push(stepRMS[i])
  vals.sort((a, b) => a - b)
  const p40 = vals[Math.floor(vals.length * 0.40)] ?? 0
  const p70 = vals[Math.floor(vals.length * 0.70)] ?? 0
  const p85 = vals[Math.floor(vals.length * 0.85)] ?? 0

  const HALF = Math.max(1, Math.floor(subdivision / 2))

  let streamIdx = 0
  let streamPos = 0
  let streamUses = 0
  const patternLen = () => STREAMS[streamIdx].length
  const nextLane = () => {
    const lane = STREAMS[streamIdx][streamPos % patternLen()]
    streamPos++
    streamUses++
    const switchEvery = 8 + (streamIdx % 3) * 4
    if (streamUses >= switchEvery) {
      streamIdx = (streamIdx + 1 + Math.floor(Math.random() * 3)) % STREAMS.length
      streamPos = 0
      streamUses = 0
    }
    return lane
  }

  const newChart = buildChart(totalSteps)
  const consumed = new Set()

  for (let i = 1; i < totalSteps; i++) {
    if (!active[i] || consumed.has(i)) continue

    const e = stepRMS[i], os = onsetStr[i]
    const onBeat = (i % subdivision === 0)
    const onHalfBeat = (i % HALF === 0)

    let lanes
    if (e >= p85 && os > 0.4) {
      lanes = CHORD3[(streamIdx + streamPos) % CHORD3.length]
      streamPos++
    } else if (e >= p70 && os > 0.18) {
      lanes = CHORD2[(streamIdx + streamPos) % CHORD2.length]
      streamPos++
    } else if (e >= p40 && (onBeat || onHalfBeat) && Math.random() < 0.52) {
      lanes = CHORD2[(streamIdx + streamPos) % CHORD2.length]
      streamPos++
    } else {
      lanes = [nextLane()]
    }

    let holdLane = -1, holdSteps = 0
    const localWin = subdivision * 2
    let localSum = 0, localCnt = 0
    for (let k = Math.max(1, i - localWin); k < Math.min(totalSteps, i + localWin); k++) {
      if (k !== i) { localSum += onsetStr[k]; localCnt++ }
    }
    const localAvg = localCnt > 0 ? localSum / localCnt : 0
    if (os > 0.3 && os > localAvg * 3 && e >= p70) {
      const peak = e
      let run = 0
      for (let k = i + 1; k < totalSteps && k < i + subdivision * 2; k++) {
        if (onsetStr[k] > 0.18) break
        if (stepRMS[k] >= peak * 0.60) run++
        else break
      }
      if (run >= subdivision) {
        holdLane = lanes[0]
        holdSteps = Math.min(run + 1, subdivision * 2)
        for (let k = i + 1; k < i + holdSteps && k < totalSteps; k++) {
          active[k] = 0
          consumed.add(k)
        }
      }
    }

    for (const lane of lanes) {
      if (lane === holdLane && holdSteps >= subdivision) {
        newChart[i][lane] = holdSteps
        for (let k = i + 1; k < i + holdSteps && k < totalSteps; k++) newChart[k][lane] = -1
      } else {
        newChart[i][lane] = 1
      }
    }
  }

  return newChart
}
