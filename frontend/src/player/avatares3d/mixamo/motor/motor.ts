/* eslint-disable */
// @ts-nocheck
// GENERADO por frontend/scripts/portar-motor-mixamo.mjs a partir de
// sim/playwright-bench/harness/mixamo4/motor.js. NO se edita a mano: se vuelve a generar.
// Motor de personajes: maquina de estados + capas por grupos de huesos (suelo/columna/cabeza/brazos),
// fase de locomocion sincronizada, mezcla con suavizado y objetos con clips de sujecion horneados en Blender.
import { THREE, V3, Q4, cloneModel, SU } from './stage'
import { GROUPS, GROUP_OF, prep, sub } from './clips'
import { fusionar } from './fusion'

export const smooth = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x) }
export const smoother = x => { x = Math.min(1, Math.max(0, x)); return x * x * x * (x * (6 * x - 15) + 10) }
const boneOf = t => t.name.split('.')[0]
const GROUP_NAMES = ['lower', 'spine', 'head', 'armL', 'armR']
export const HOLD_COVER = { bordon: ['armR'], paraguas: ['armR'], cesta: ['armL'], gaita: ['armL', 'armR', 'head'] }
const SIDE_OF = { bordon: 'R', paraguas: 'R', cesta: 'L', gaita: 'B' }

export function mirrorClip(c, name) {
  const swap = n => n.replace('Left', '\0').replace('Right', 'Left').replace('\0', 'Right')
  const tr = c.tracks.map(t => { const b = boneOf(t), prop = t.name.slice(b.length), nn = swap(b) + prop
    const v = Float32Array.from(t.values)
    if (/\.quaternion$/.test(t.name)) for (let i = 0; i < v.length; i += 4) { v[i + 1] = -v[i + 1]; v[i + 2] = -v[i + 2] }
    else if (/\.position$/.test(t.name)) for (let i = 0; i < v.length; i += 3) v[i] = -v[i]
    return new t.constructor(nn, t.times, v) })
  return new THREE.AnimationClip(name || c.name + '_m', c.duration, tr)
}

// energia del movimiento de un brazo en un clip (para saber que mano usa un gesto)
export function armActivity(c) {
  const r = { L: 0, R: 0 }
  for (const t of c.tracks) { if (!/\.quaternion$/.test(t.name)) continue; const b = boneOf(t); const m = /^mixamorig(Left|Right)(Arm|ForeArm|Hand)$/.exec(b); if (!m) continue
    const v = t.values, q0 = new Q4(v[0], v[1], v[2], v[3]), q = new Q4(); let s = 0
    for (let i = 4; i < v.length; i += 4) { q.set(v[i], v[i + 1], v[i + 2], v[i + 3]); s += q0.angleTo(q) }
    r[m[1][0]] += s / (v.length / 4) }
  return r
}

/** Los clips compartidos (anims.glb) por nombre. `phaseOff` lo rellena el primer motor que se crea. */
export function crearCompartido(clipsLeidos) {
  const clips = {}; clipsLeidos.forEach(c => clips[c.name] = c)
  return { clips, phaseOff: {} }
}

/** Los clips de agarre y los objetos de mano de UN personaje (hold_<Ch>.glb, autorados en Blender). */
export function leerAgarre(gl) {
  const clips = {}; gl.animations.forEach(c => clips[c.name] = c)
  const items = {}
  gl.scene.updateMatrixWorld(true)
  gl.scene.traverse(n => { if (/^it_/.test(n.name) && n.parent && /^mixamorig/.test(n.parent.name)) { const nm = n.name.replace(/^it_/, '').replace(/_(pipe|body)$/, ''); (items[nm] = items[nm] || []).push({ bone: n.parent.name, node: n, key: n.name }) } })
  for (const piezas of Object.values(items)) for (const p of piezas) fusionar(p.node)   // menos llamadas de dibujo por avatar
  return { clips, items }
}

export class Motor {
  constructor(id, shared, hold, scene, opts = {}) {
    this.id = id; this.shared = shared; this.hold = hold; this.scene = scene; this.opts = opts   // fija: el GPS manda la posicion (el motor no avanza la raiz)
    const m = cloneModel(id); this.model = m.model; this.bones = m.bones; this.meshes = m.meshes
    this.root = new THREE.Group(); this.lean = new THREE.Group(); this.root.add(this.lean); this.lean.add(this.model); if (scene) scene.add(this.root)
    this.mixer = new THREE.AnimationMixer(this.model)
    this.hips = this.model.userData.hips
    this.heading = 0; this.goal = 0; this.v = 0; this.vt = 0; this.phase = 0; this.yawRate = 0; this.time = 0
    this.rates = { equip: 0.5 }
    this.src = {}            // nombre -> {acts:{group:action}, dur, sync}
    this.hw = {}; this.hwT = {}; for (const g of GROUP_NAMES) { this.hw[g] = 0; this.hwT[g] = 0 }
    this.items = {}          // nombre -> {parts:[{wrapper,node}], t:0..1, target}
    this.gest = []           // gestos activos
    this.turn = null
    const L = shared.clips
    for (const [k, nm] of [['idle', 'lo__idle'], ['walk', 'lo__walking'], ['run', 'lo__running']]) this.addSrc('loco.' + k, prep(L[nm], this.hips), GROUP_NAMES, { sync: k === 'idle' ? null : k })
    this.measurePhase()
    this.snap()
  }
  // ---------- fuentes de animacion ----------
  addSrc(key, clip, groups, o = {}) {
    if (this.src[key]) return this.src[key]
    const acts = {}, present = new Set(clip.tracks.map(t => GROUP_OF[boneOf(t)]))
    for (const g of groups) { if (!present.has(g)) continue; const c = sub(clip, [g], key + ':' + g); const a = this.mixer.clipAction(c); a.setEffectiveWeight(0); a.play(); if (o.sync) a.timeScale = 0; acts[g] = a }
    return this.src[key] = { acts, dur: clip.duration, sync: o.sync || null, once: !!o.once, clip }
  }
  measurePhase() {
    const sh = this.shared
    if (sh.phaseOff.walk !== undefined) return
    const m = SU.clone(this.model), holder = new THREE.Group(); holder.add(m); m.updateMatrixWorld(true)
    let foot, hips; m.traverse(n => { if (n.name === 'mixamorigLeftFoot') foot = n; if (n.name === 'mixamorigHips') hips = n })
    const mx = new THREE.AnimationMixer(m)
    for (const [k, nm] of [['walk', 'lo__walking'], ['run', 'lo__running']]) { const c = prep(sh.clips[nm], this.hips); const a = mx.clipAction(c); a.play(); let best = -1e9, bt = 0
      for (let i = 0; i < 200; i++) { const t = c.duration * i / 200; mx.setTime(t); m.updateMatrixWorld(true); const hp = new V3().setFromMatrixPosition(hips.matrixWorld), fp = new V3().setFromMatrixPosition(foot.matrixWorld); const z = fp.z - hp.z; if (z > best) { best = z; bt = t } }
      sh.phaseOff[k] = bt / c.duration; a.stop() }
  }
  snap() { this.mixer.update(0.0001) }

  // ---------- objetos ----------
  equip(list) {
    list = [].concat(list); const cur = new Set(Object.keys(this.items))
    for (const n of cur) if (!list.includes(n)) this.unequipOne(n)
    for (const n of list) if (!cur.has(n)) this.equipOne(n)
  }
  equipOne(n) {
    const H = this.hold; if (!H.items[n]) return
    for (const state of ['idle', 'walk', 'run']) { const c = H.clips[`hold_${n}_${state}`]; if (c) this.addSrc(`hold.${n}.${state}`, prep(c, this.hips), HOLD_COVER[n], { sync: state === 'idle' ? null : 'hold' }) }
    const parts = H.items[n].map(p => { const wrapper = new THREE.Group(); const clone = p.node.clone(true); clone.matrixAutoUpdate = true; wrapper.add(clone); const b = this.bones[p.bone]; b.add(wrapper); clone.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false } }); return { wrapper, clone, bone: b } })
    this.items[n] = { parts, t: 0, target: 1, born: this.time }
    for (const g of HOLD_COVER[n]) this.hwT[g] = 1
    this.itemFx(n)
  }
  unequipOne(n) { const it = this.items[n]; if (!it) return; it.target = 0; for (const g of HOLD_COVER[n]) this.hwT[g] = 0 }
  itemFx(n) {}
  hasHold(g) { return this.hwT[g] > 0 }
  freeSides() { const f = []; if (this.hwT.armL < 0.5) f.push('L'); if (this.hwT.armR < 0.5) f.push('R'); return f }

  // ---------- gestos ----------
  gesture(name, o = {}) {
    const raw = this.shared.clips[name]; if (!raw) return
    const free = this.freeSides(); let c = prep(raw, this.hips), key = 'ges.' + name
    const act = armActivity(c); const main = act.L > act.R ? 'L' : 'R'
    const groups = ['spine']; if (this.hwT.head < 0.5) groups.push('head')
    let useClip = c
    if (free.length === 2) { groups.push('armL', 'armR') }
    else if (free.length === 1) { const want = free[0]; if (main !== want) { useClip = mirrorClip(c); key += ':m' }; groups.push(want === 'L' ? 'armL' : 'armR') }
    // el mismo clip en otro estado de uso se recompila bajo otra clave
    key += ':' + groups.join('')
    const hadSrc = !!this.src[key]
    const s = this.addSrc(key, useClip, groups, { once: true })
    for (const a of Object.values(s.acts)) { a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.enabled = true; a.play(); a.setEffectiveWeight(0) }
    this.gest.push({ s, t0: this.time, dur: s.dur, fi: o.fi ?? 0.4, fo: o.fo ?? 0.55, w: 0 })
    return { groups, mirrored: key.includes(':m'), main }
  }
  walkTo(h) { this.goal = h }
  setSpeed(v) { this.vt = v }
  face(h) { this.goal = h }

  // ---------- giro en el sitio ----------
  startTurn(d) {
    const nm = Math.abs(d) > 2.3 ? (d > 0 ? 'lo__left_turn' : 'lo__right_turn') : (d > 0 ? 'lo__left_turn_90' : 'lo__right_turn_90')
    const raw = prep(this.shared.clips[nm], this.hips); const tr = raw.tracks.find(t => /Hips\.quaternion$/.test(t.name)); const n = tr.values.length / 4
    const q = new Q4(), qy = new Q4(), out = new Float32Array(tr.values.length); let prev = 0, acc = 0
    const yaw = qq => { const u = new V3(0, 1, 0).applyQuaternion(qq); return Math.atan2(u.x, u.z) }
    for (let i = 0; i < n; i++) { q.fromArray(tr.values, i * 4); const y = yaw(q); if (i === 0) prev = y; let dd = y - prev; while (dd > Math.PI) dd -= 2 * Math.PI; while (dd < -Math.PI) dd += 2 * Math.PI; acc += dd; prev = y; qy.setFromAxisAngle(new V3(0, 1, 0), -acc); q.premultiply(qy).toArray(out, i * 4) }
    raw.tracks[raw.tracks.indexOf(tr)] = new THREE.QuaternionKeyframeTrack(tr.name, tr.times, out)
    const key = 'turn.' + nm, s = this.addSrc(key, raw, ['lower', 'spine'], { once: true })
    for (const a of Object.values(s.acts)) { a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.enabled = true; a.play(); a.setEffectiveWeight(0) }
    this.turn = { s, t0: this.time, dur: s.dur, from: this.heading, d, w: 0 }
  }

  // ---------- paso de simulacion ----------
  update(dt) {
    this.time += dt
    const acc = 2.2; this.v += Math.max(-acc * dt, Math.min(acc * dt, this.vt - this.v)); const v = this.v
    let d = this.goal - this.heading; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI
    if (this.turn) { const T = this.turn, t = (this.time - T.t0) / T.dur; this.heading = T.from + T.d * smooth((t - 0.12) / 0.76); this.yawRate = 0
      T.w = smoother(Math.min(t / 0.18, 1)) * (1 - smoother((t - 0.8) / 0.2)); if (t >= 1) { this.heading = T.from + T.d; for (const a of Object.values(T.s.acts)) a.stop(); this.turn = null } }
    else if (Math.abs(d) > 0.5 && v < 0.3) this.startTurn(d)
    else { const rate = Math.min(4.5, 1.8 + Math.abs(d) * 2.6), st = Math.sign(d) * Math.min(Math.abs(d), rate * dt); this.heading += st; this.yawRate += (st / dt - this.yawRate) * Math.min(1, dt * 8) }
    // estados de locomocion
    const wi = 1 - smooth((v - 0.12) / 0.9), wr = smooth((v - 2.0) / 1.4), ww = Math.max(0, 1 - wi - wr)
    const WS = { idle: wi, walk: ww, run: wr }
    const L = this.shared.clips, W = this.src['loco.walk'].dur, R = this.src['loco.run'].dur
    const fW = 1 / W, fR = 1 / R, f = v < 1.4 ? fW * Math.max(0.35, v / 1.4) : fW + (fR - fW) * Math.min(1, (v - 1.4) / 2.2)
    if (v < 0.05) this.phase = 0; else this.phase = (this.phase + f * dt) % 1
    // gestos: envolventes
    const gw = { spine: 0, head: 0, armL: 0, armR: 0, lower: 0 }
    for (let i = this.gest.length - 1; i >= 0; i--) { const G = this.gest[i], t = this.time - G.t0
      if (t >= G.dur) { for (const a of Object.values(G.s.acts)) { a.stop(); a.enabled = false } this.gest.splice(i, 1); continue }
      G.w = smoother(t / G.fi) * (1 - smoother((t - (G.dur - G.fo)) / G.fo))
      for (const g of Object.keys(G.s.acts)) gw[g] = Math.min(1, gw[g] + G.w) }
    if (this.turn) { for (const g of ['lower', 'spine']) gw[g] = Math.min(1, gw[g] + this.turn.w) }
    // pesos de sujecion con suavizado
    for (const g of GROUP_NAMES) { const tgt = this.hwT[g], cur = this.hw[g]; this.hw[g] += Math.max(-dt / this.rates.equip, Math.min(dt / this.rates.equip, tgt - cur)) }
    const hwe = {}; for (const g of GROUP_NAMES) hwe[g] = smoother(this.hw[g])
    // pesos finales
    const setW = (key, g, w) => { const s = this.src[key]; if (!s || !s.acts[g]) return; s.acts[g].setEffectiveWeight(w) }
    for (const g of GROUP_NAMES) {
      const e = gw[g] || 0, H = hwe[g], base = (1 - e)
      for (const st of ['idle', 'walk', 'run']) setW('loco.' + st, g, base * (1 - H) * WS[st])
      for (const n of Object.keys(this.items)) if (HOLD_COVER[n].includes(g)) for (const st of ['idle', 'walk', 'run']) setW(`hold.${n}.${st}`, g, base * H * WS[st])
    }
    // gestos y giros: reparten el peso restante
    for (const G of this.gest) { const tot = {}; for (const g of Object.keys(G.s.acts)) { const sum = this.gest.reduce((a, x) => a + (x.s.acts[g] ? x.w : 0), 0); G.s.acts[g].setEffectiveWeight(sum > 1 ? G.w / sum * Math.min(1, gw[g]) : G.w) } }
    if (this.turn) for (const g of Object.keys(this.turn.s.acts)) this.turn.s.acts[g].setEffectiveWeight(this.turn.w)
    // tiempos sincronizados con la fase
    for (const [key, s] of Object.entries(this.src)) {
      if (!s.sync) continue
      let tm
      if (s.sync === 'walk' || s.sync === 'run') tm = (((this.phase + this.shared.phaseOff[s.sync]) % 1) * s.dur)
      else tm = ((this.phase % 1) * s.dur)           // hold: fase 0 = pie izquierdo adelante
      for (const a of Object.values(s.acts)) a.time = tm
    }
    this.mixer.update(dt)
    // alta/baja de objetos
    for (const [n, it] of Object.entries(this.items)) {
      const cover = HOLD_COVER[n], hmax = Math.max(...cover.map(g => this.hw[g]))
      if (it.target === 1) it.t = smooth((hmax - 0.35) / 0.4)
      else it.t = smooth((hmax - 0.15) / 0.4)
      for (const p of it.parts) { p.wrapper.scale.setScalar(Math.max(0.001, it.t)); p.wrapper.visible = it.t > 0.01 }
      if (it.target === 0 && hmax <= 0.001) { for (const p of it.parts) p.bone.remove(p.wrapper); delete this.items[n] }
    }
    if (this.turn == null && v > 0.05 && !this.opts.fija) this.root.position.addScaledVector(new V3(Math.sin(this.heading), 0, Math.cos(this.heading)), v * dt)
    this.root.rotation.y = this.heading
    const lean = Math.max(-0.2, Math.min(0.2, -this.yawRate * 0.04 * Math.min(1, v / 2))); this.lean.rotation.z += (lean - this.lean.rotation.z) * Math.min(1, dt * 6)
    this.root.updateMatrixWorld(true)
    if (this.post) this.post(dt)
  }
}
