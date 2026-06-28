import * as THREE from 'three'

const GAME_LANES = 4
const BASE_SCROLL_SPEED = 380
const RECEPTOR_Y_RATIO = 0.82
const NOTE_RADIUS_RATIO = 0.36
const RECEPTOR_SIZE_RATIO = 0.78
const HIGHWAY_MARGIN_RATIO = 0.08
const FOV_DEG = 35
const CAMERA_D = 1000
const SCROLL_WORLD_MULT = 800
const HIT_SQUISH = 0.65
const HIGHWAY_COLOR = 0x151515

function createCircleTexture(outer = 1.0, inner = 0.0) {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const cx = size / 2
  const cy = size / 2
  const r = (size / 2) * outer

  ctx.clearRect(0, 0, size, size)
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  if (inner > 0) {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.arc(cx, cy, r * inner, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function createFlashTexture() {
  const w = 64
  const h = 256
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, 'rgba(255,255,255,0)')
  grad.addColorStop(0.3, 'rgba(255,255,255,0.45)')
  grad.addColorStop(0.7, 'rgba(255,255,255,0.45)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function hexToColor(hex) {
  return new THREE.Color(hex)
}

function makeLaneMaterials(texture, laneColors, opacity = 1) {
  return laneColors.map(color => {
    return new THREE.SpriteMaterial({
      map: texture,
      color: hexToColor(color),
      transparent: true,
      opacity,
      alphaTest: 0.05,
      depthTest: false,
      depthWrite: false,
    })
  })
}

function makeHoldMaterials(laneColors) {
  return laneColors.map(color => {
    return new THREE.MeshBasicMaterial({
      color: hexToColor(color),
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    })
  })
}

export class Highway3DRenderer {
  constructor(canvas, config) {
    this.canvas = canvas
    this.config = config || {}

    const gl =
      canvas.getContext('webgl2', { alpha: false, antialias: true }) ||
      canvas.getContext('webgl', { alpha: false, antialias: true })

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      context: gl,
      alpha: false,
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setClearColor(0x000000, 1)
    this.renderer.setPixelRatio(1)
    this.renderer.sortObjects = true

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(FOV_DEG, 1, 1, 50000)
    this.camera.position.set(0, 2000, -1000)
    this.camera.lookAt(0, 0, 0)

    this.laneColors = this.config.laneColors || ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff']

    this.circleTexture = createCircleTexture(0.95)
    this.ringTexture = createCircleTexture(0.95, 0.65)
    this.flashTexture = createFlashTexture()
    this.holdGeo = new THREE.PlaneGeometry(1, 1)

    this.noteMaterials = makeLaneMaterials(this.circleTexture, this.laneColors, 1)
    this.receptorMaterials = makeLaneMaterials(this.ringTexture, this.laneColors, 1)
    this.holdMaterials = makeHoldMaterials(this.laneColors)
    this.flashMaterials = makeLaneMaterials(this.flashTexture, this.laneColors, 0)

    this.layout = null

    this.noteSprites = new Map()
    this.holdMeshes = new Map()
    this.effectSprites = []

    this.highwayMesh = null
    this.receptors = []
    this.flashes = []

    this._initReceptors()
    this._initFlashes()
  }

  _computeLayout(width, height) {
    const laneWidth = Math.min(width * 0.14, 110)
    const playfieldWidth = laneWidth * GAME_LANES
    const playfieldX = (width - playfieldWidth) / 2
    const receptorY = height * RECEPTOR_Y_RATIO
    const noteRadius = laneWidth * NOTE_RADIUS_RATIO
    const receptorSize = laneWidth * RECEPTOR_SIZE_RATIO

    const fovRad = THREE.MathUtils.degToRad(FOV_DEG)
    const tanHalf = Math.tan(fovRad / 2)
    const cotHalf = 1 / tanHalf
    const d = CAMERA_D
    const fracFromBottom = 1 - RECEPTOR_Y_RATIO
    const targetNdcMag = 1 - 2 * fracFromBottom // 0.64

    // Solve L/(L+2d)*cot = targetNdcMag
    const L = (targetNdcMag * 2 * d) / (cotHalf - targetNdcMag)
    const h = L + d
    const distViewAtReceptor = (L + 2 * d) / Math.sqrt(2)
    const scale = (height / 2) / (distViewAtReceptor * tanHalf) // px per world unit at receptor
    const farZ = (L * (cotHalf + 1) + 2 * d) / (cotHalf - 1)
    const worldLaneWidth = laneWidth / scale
    const worldNoteRadius = noteRadius / scale
    const worldReceptorRadius = (receptorSize / 2) / scale

    const laneCenterX = []
    const centerOffset = (GAME_LANES - 1) / 2
    for (let i = 0; i < GAME_LANES; i++) {
      laneCenterX.push((i - centerOffset) * worldLaneWidth)
    }

    return {
      width,
      height,
      laneWidth,
      playfieldWidth,
      playfieldX,
      receptorY,
      noteRadius,
      receptorSize,
      fovRad,
      tanHalf,
      cotHalf,
      L,
      h,
      d,
      scale,
      farZ,
      worldLaneWidth,
      worldNoteRadius,
      worldReceptorRadius,
      laneCenterX,
    }
  }

  _ndcYFromZ(z) {
    const { L, d, cotHalf } = this.layout
    return ((z - L) / (L + 2 * d + z)) * cotHalf
  }

  _initReceptors() {
    for (let i = 0; i < GAME_LANES; i++) {
      const sprite = new THREE.Sprite(this.receptorMaterials[i])
      sprite.renderOrder = 150
      this.scene.add(sprite)
      this.receptors.push(sprite)
    }
  }

  _initFlashes() {
    for (let i = 0; i < GAME_LANES; i++) {
      const sprite = new THREE.Sprite(this.flashMaterials[i])
      sprite.visible = false
      sprite.renderOrder = 300
      this.scene.add(sprite)
      this.flashes.push(sprite)
    }
  }

  _buildHighway(layout) {
    if (this.highwayMesh) {
      this.scene.remove(this.highwayMesh)
      this.highwayMesh.geometry.dispose()
      this.highwayMesh.material.dispose()
      this.highwayMesh = null
    }

    const margin = layout.worldLaneWidth * HIGHWAY_MARGIN_RATIO
    const hw = layout.worldLaneWidth * GAME_LANES + margin * 2
    const geo = new THREE.PlaneGeometry(hw, layout.farZ)
    const mat = new THREE.MeshBasicMaterial({
      color: HIGHWAY_COLOR,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    })
    this.highwayMesh = new THREE.Mesh(geo, mat)
    this.highwayMesh.rotation.x = -Math.PI / 2
    this.highwayMesh.position.set(0, 0, layout.farZ / 2)
    this.highwayMesh.renderOrder = 10
    this.scene.add(this.highwayMesh)
  }

  resize(width, height, dpr) {
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(width, height, false)

    this.layout = this._computeLayout(width, height)
    const { h, d, L, farZ } = this.layout

    this.camera.fov = FOV_DEG
    this.camera.aspect = width / height
    this.camera.near = 1
    this.camera.far = h + d + farZ + 10000
    this.camera.position.set(0, h, -d)
    this.camera.lookAt(0, 0, L)
    this.camera.updateProjectionMatrix()

    this._buildHighway(this.layout)

    for (let i = 0; i < GAME_LANES; i++) {
      const x = this.layout.laneCenterX[i]
      this.receptors[i].position.set(x, 0, 0)
      this.receptors[i].scale.set(
        this.layout.receptorSize,
        this.layout.receptorSize,
        1
      )

      this.flashes[i].position.set(x, 0, 0)
      this.flashes[i].scale.set(
        this.layout.laneWidth,
        this.layout.laneWidth * 3.5,
        1
      )
    }
  }

  prepareNotes(notes) {
    for (const note of notes) {
      if (note.type === 'tap') {
        if (this.noteSprites.has(note)) continue
        const sprite = new THREE.Sprite(this.noteMaterials[note.lane])
        sprite.renderOrder = 100
        sprite.visible = false
        this.scene.add(sprite)
        this.noteSprites.set(note, { sprite })
      } else if (note.type === 'hold') {
        if (this.holdMeshes.has(note)) continue
        const mesh = new THREE.Mesh(this.holdGeo, this.holdMaterials[note.lane])
        mesh.rotation.x = -Math.PI / 2
        mesh.renderOrder = 80
        mesh.visible = false
        this.scene.add(mesh)
        this.holdMeshes.set(note, { mesh })
      }
    }
  }

  _clearEffects() {
    for (const eff of this.effectSprites) {
      this.scene.remove(eff.sprite)
      eff.sprite.material.dispose()
    }
    this.effectSprites = []
  }

  _rebuildEffects(hitEffects, layout) {
    this._clearEffects()
    const nowPerf = performance.now()
    for (const fx of hitEffects) {
      const age = nowPerf - fx.birth
      const duration = 140
      const progress = age / duration
      if (progress >= 1) continue

      const eased = 1 - (1 - progress) * (1 - progress)
      const startRadius = layout.noteRadius * 0.8
      const endRadius = layout.noteRadius * 1.5
      const radius = startRadius + (endRadius - startRadius) * eased
      const opacity = 0.5 * (1 - progress)

      const mat = new THREE.SpriteMaterial({
        map: this.circleTexture,
        color: hexToColor(fx.color || '#ffffff'),
        transparent: true,
        opacity,
        alphaTest: 0.05,
        depthTest: false,
        depthWrite: false,
      })
      const sprite = new THREE.Sprite(mat)
      // Map screen pixel radius to world radius at the receptor distance.
      sprite.position.set(fx.x / layout.scale, 0, 0)
      sprite.scale.set(radius * 2, radius * 2 * HIT_SQUISH, 1)
      sprite.renderOrder = 250
      this.scene.add(sprite)
      this.effectSprites.push({ sprite })
    }
  }

  render(state) {
    if (!this.layout) return
    const colors = this.config.laneColors || ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff']
    if (JSON.stringify(colors) !== JSON.stringify(this.laneColors)) {
      this.laneColors = colors
      this.noteMaterials.forEach((m, i) => m.color.set(hexToColor(colors[i])))
      this.receptorMaterials.forEach((m, i) => m.color.set(hexToColor(colors[i])))
      this.holdMaterials.forEach((m, i) => m.color.set(hexToColor(colors[i])))
      this.flashMaterials.forEach((m, i) => m.color.set(hexToColor(colors[i])))
    }

    const layout = this.layout
    const now = state.now
    const notes = state.notes
    const noteIndex = state.noteIndex || 0
    const speedMult = Number(state.speed) || 1
    const scrollSpeed = SCROLL_WORLD_MULT * speedMult

    const receptorPressed = state.receptorPressed || [false, false, false, false]

    for (let i = 0; i < GAME_LANES; i++) {
      const pressed = receptorPressed[i]
      const receptor = this.receptors[i]
      receptor.position.set(layout.laneCenterX[i], 0, 0)
      const base = layout.receptorSize
      const s = pressed ? base * 1.12 : base
      receptor.scale.set(s, s, 1)
      receptor.material.opacity = pressed ? 1 : 0.9
      receptor.material.color.set(hexToColor(this.laneColors[i]))
    }

    if (notes) {
      for (let i = noteIndex; i < notes.length; i++) {
        const note = notes[i]
        const x = layout.laneCenterX[note.lane]
        const color = this.laneColors[note.lane]

        if (note.type === 'tap') {
          if (note.hit || note.missed) {
            const obj = this.noteSprites.get(note)
            if (obj) obj.sprite.visible = false
            continue
          }
          const z = (note.time - now) * scrollSpeed
          const ndcY = this._ndcYFromZ(z)
          if (ndcY > 1.2 || ndcY < -1.2) {
            if (z > 0 && ndcY > 1.2) break
            const obj = this.noteSprites.get(note)
            if (obj) obj.sprite.visible = false
            continue
          }
          let obj = this.noteSprites.get(note)
          if (!obj) {
            obj = { sprite: new THREE.Sprite(this.noteMaterials[note.lane]) }
            obj.sprite.renderOrder = 100
            this.scene.add(obj.sprite)
            this.noteSprites.set(note, obj)
          }
          const sprite = obj.sprite
          sprite.position.set(x, 0, z)
          sprite.scale.set(layout.noteRadius * 2, layout.noteRadius * 2, 1)
          sprite.material.color.set(hexToColor(color))
          sprite.renderOrder = 50 + (1 - z / layout.farZ) * 50
          sprite.visible = true
        } else if (note.type === 'hold') {
          if (note.missed || note.released) {
            const obj = this.holdMeshes.get(note)
            if (obj) obj.mesh.visible = false
            continue
          }
          const headZ = note.beingHeld ? 0 : (note.time - now) * scrollSpeed
          const tailZ = (note.time + note.durationSec - now) * scrollSpeed
          const headNdcY = this._ndcYFromZ(headZ)
          const tailNdcY = this._ndcYFromZ(tailZ)
          if (
            (headNdcY > 1.2 && tailNdcY > 1.2) ||
            (headNdcY < -1.2 && tailNdcY < -1.2)
          ) {
            if (tailZ > 0 && tailNdcY > 1.2) break
            const obj = this.holdMeshes.get(note)
            if (obj) obj.mesh.visible = false
            continue
          }
          let obj = this.holdMeshes.get(note)
          if (!obj) {
            obj = { mesh: new THREE.Mesh(this.holdGeo, this.holdMaterials[note.lane]) }
            obj.mesh.rotation.x = -Math.PI / 2
            obj.mesh.renderOrder = 80
            obj.mesh.visible = false
            this.scene.add(obj.mesh)
            this.holdMeshes.set(note, obj)
          }
          const mesh = obj.mesh
          const zMid = (headZ + tailZ) / 2
          const len = Math.max(0.001, Math.abs(headZ - tailZ))
          mesh.position.set(x, 0, zMid)
          mesh.scale.set(layout.worldNoteRadius * 1.8, len, 1)
          mesh.material.color.set(hexToColor(color))
          mesh.renderOrder = 55 + (1 - tailZ / layout.farZ) * 50
          mesh.visible = true
        }
      }
    }

    const flashDuration = 150
    const nowPerf = performance.now()
    const activeFlashes = (state.laneFlashes || []).filter(f => nowPerf - f.birth < flashDuration)
    const flashOpacity = state.flashOpacity ?? 0.13
    for (let i = 0; i < GAME_LANES; i++) {
      const flash = this.flashes[i]
      const f = activeFlashes.find(x => x.lane === i)
      if (f && flashOpacity > 0) {
        const age = nowPerf - f.birth
        const alpha = flashOpacity * (1 - age / flashDuration)
        flash.position.set(layout.laneCenterX[i], 0, 0)
        flash.scale.set(layout.laneWidth, layout.laneWidth * 3.5, 1)
        flash.material.opacity = alpha
        flash.material.color.set(hexToColor(this.laneColors[i]))
        flash.visible = true
      } else {
        flash.visible = false
      }
    }

    this._rebuildEffects(state.hitEffects || [], layout)

    state.hitEffects = (state.hitEffects || []).filter(fx => nowPerf - fx.birth < 140)
    state.laneFlashes = (state.laneFlashes || []).filter(f => nowPerf - f.birth < flashDuration)

    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this._clearEffects()

    for (const { sprite } of this.noteSprites.values()) {
      this.scene.remove(sprite)
    }
    this.noteSprites.clear()

    for (const { mesh } of this.holdMeshes.values()) {
      this.scene.remove(mesh)
    }
    this.holdMeshes.clear()

    for (const sprite of this.receptors) {
      this.scene.remove(sprite)
    }
    this.receptors = []

    for (const sprite of this.flashes) {
      this.scene.remove(sprite)
    }
    this.flashes = []

    if (this.highwayMesh) {
      this.scene.remove(this.highwayMesh)
      this.highwayMesh.geometry.dispose()
      this.highwayMesh.material.dispose()
      this.highwayMesh = null
    }

    this.holdGeo.dispose()

    for (const m of this.noteMaterials) m.dispose()
    for (const m of this.receptorMaterials) m.dispose()
    for (const m of this.holdMaterials) m.dispose()
    for (const m of this.flashMaterials) m.dispose()

    this.circleTexture.dispose()
    this.ringTexture.dispose()
    this.flashTexture.dispose()

    this.renderer.dispose()
  }
}
