/* eslint-disable */
// @ts-nocheck
// GENERADO por frontend/scripts/portar-motor-mixamo.mjs a partir de
// sim/playwright-bench/harness/mixamo4/avatar.js. NO se edita a mano: se vuelve a generar.
// Avatar completo = Motor (animacion, gestos, objetos de mano horneados en Blender) + aspecto
// (tinte de ropa y pelo por shader) + complementos que NO se agarran (casco, boina, sombrero,
// mochilas, zocas), colocados con las medidas del cuerpo.
//
// Las medidas (cabeza, hombros, espalda, pies) se toman UNA vez por personaje, en reposo, y se
// reutilizan; lo que se construye de cada complemento (geometria y materiales) tambien se guarda
// y cada avatar recibe una copia que lo comparte. Lo compartido no se libera nunca.
import { THREE, V3 } from './stage'
import { Motor, HOLD_COVER } from './motor'
import { look } from './look'
import { ITEMS } from './acc'
import { fusionar } from './fusion'

export const OBJETOS_DE_MANO = new Set(Object.keys(HOLD_COVER))
const CUERPOS = {}            // id -> { snap, lm }
const COMPLEMENTOS = {}       // id|nombre|opciones -> resultado de ITEMS[nombre].build
let SOMBRA = null             // sombra de mancha compartida

function sombra() {
  if (SOMBRA || typeof document === 'undefined') return SOMBRA
  const cv = document.createElement('canvas'); cv.width = cv.height = 128
  const g = cv.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 62)
  gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128)
  const geo = new THREE.PlaneGeometry(1, 1)
  const mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false })
  return SOMBRA = { geo, mat }
}

export class Avatar extends Motor {
  constructor(id, shared, hold, scene, opts = {}) {
    super(id, shared, hold, scene, opts)
    this.clasificar()
    this.acc = []            // complementos fuera de la mano: { name, objs:[Group] }
    this.ocultas = []        // mallas que un complemento esconde (pelo bajo el casco, zapatos bajo las zocas)
    this.update(1 / 60)      // pose de reposo (idle) antes de medir
    this.medir()
    const s = sombra()
    if (s) { this.blob = new THREE.Mesh(s.geo, s.mat); this.blob.rotation.x = -Math.PI / 2; this.blob.position.y = 0.01; this.blob.scale.setScalar(1.1); this.blob.renderOrder = -1; this.root.add(this.blob) }
  }

  // ---------- partes del cuerpo por papel (piel, ropa, pelo, pestanas, zapatos) ----------
  clasificar() {
    const id = this.id; this.parts = []; this.piezas = []
    for (const n of this.meshes) {
      let kind = 'c'; const key = n.name.replace(id + '_', '')
      for (const m of [].concat(n.material)) {
        const nm = n.name + ' ' + m.name
        const role = /lash/i.test(nm) ? 'lash' : /hair|beard|brow/i.test(nm) ? 'hair' : (/^body/i.test(key) || (n.name === id && /body$/i.test(m.name))) ? 'skin' : 'cloth'
        if (role === 'hair') kind = 'h'; else if (role === 'skin') kind = 'k'; else if (role === 'lash') kind = 'x'; else if (/^(Sneakers|Shoes|Heels|Boots?)$/i.test(key)) kind = 's'
        this.parts.push({ mesh: n, mat: m, role, key, kind })
      }
      this.piezas.push({ mesh: n, kind, key })
    }
  }

  // ---------- medidas del cuerpo (una vez por personaje) ----------
  medir() {
    const c = CUERPOS[this.id]
    if (c) { this.snap = c.snap; this.lm = c.lm; return }
    this.root.updateMatrixWorld(true)
    this.snap = { lean: this.lean.matrixWorld.clone(), bones: {} }
    for (const n in this.bones) this.snap.bones[n] = this.bones[n].matrixWorld.clone()
    const v = new V3(), usadas = this.piezas.filter(p => p.kind !== 'x')
    const total = usadas.reduce((a, p) => a + p.mesh.geometry.attributes.position.count, 0)
    const X = new Float32Array(total), Y = new Float32Array(total), Z = new Float32Array(total), K = new Array(total)
    let w = 0
    for (const p of usadas) { p.mesh.skeleton.update(); const n = p.mesh.geometry.attributes.position.count
      for (let i = 0; i < n; i++) { p.mesh.getVertexPosition(i, v); v.applyMatrix4(p.mesh.matrixWorld); this.lean.worldToLocal(v); X[w] = v.x; Y[w] = v.y; Z[w] = v.z; K[w] = p.kind; w++ } }
    const box = (x0, x1, y0, y1, z0, z1, ks = 'kc') => { const o = { minx: 9, maxx: -9, miny: 9, maxy: -9, minz: 9, maxz: -9, n: 0 }
      for (let i = 0; i < total; i++) { const x = X[i], y = Y[i], z = Z[i]; if (x < x0 || x > x1 || y < y0 || y > y1 || z < z0 || z > z1 || !ks.includes(K[i])) continue
        o.n++; if (x < o.minx) o.minx = x; if (x > o.maxx) o.maxx = x; if (y < o.miny) o.miny = y; if (y > o.maxy) o.maxy = y; if (z < o.minz) o.minz = z; if (z > o.maxz) o.maxz = z } return o }
    const lp = n => this.lean.worldToLocal(new V3().setFromMatrixPosition(this.snap.bones['mixamorig' + n]))
    const c0 = lp('Spine2'), shL = lp('LeftArm'), shR = lp('RightArm'), neck = lp('Neck')
    const Lm = { box, c: c0, shL, shR, neck, shW: (shL.x - shR.x) / 2, mouthY: 0 }
    Lm.k = Math.min(1.25, Math.max(.85, Lm.shW / .19))
    Lm.backZ = (x0, x1, y0, y1) => { const o = box(x0, x1, -9, 9, -9, 9, 'kc'); const q = box(x0, x1, y0, y1, -9, 9, 'kc'); return q.n ? q.minz : o.minz }
    Lm.frontZ = (x0, x1, y0, y1) => { const q = box(x0, x1, y0, y1, -9, 9, 'kc'); return q.n ? q.maxz : .1 }
    Lm.topY = (x0, x1, z0, z1, ymin = 0) => { const q = box(Math.min(x0, x1), Math.max(x0, x1), ymin, ymin + .2, z0, z1, 'kc'); return q.n ? q.maxy : c0.y + .12 }
    Lm.topShL = Lm.topY(.1, .2, -.05, .05, c0.y - .02); Lm.topShR = Lm.topY(-.2, -.1, -.05, .05, c0.y - .02)
    const hb = box(-.07, .07, neck.y + .05, 9, -.3, .3, 'k'), hh = box(-.07, .07, neck.y + .05, 9, -.3, .3, 'kch')
    Lm.topB = hb.maxy; Lm.topH = hh.maxy; Lm.top = Lm.topH
    const band = (top, ks) => box(-1, 1, top - .1, top - .08, -.4, .4, ks); const bB = band(Lm.topB, 'k'), bH = band(Lm.topH, 'kh')
    Lm.headRb = (bB.maxx - bB.minx) / 2; Lm.headRh = (bH.maxx - bH.minx) / 2; Lm.headZ = (bH.minz + bH.maxz) / 2
    Lm.mouthY = Lm.topB - .165; const mq = box(-.02, .02, Lm.mouthY - .01, Lm.mouthY + .01, -9, 9, 'k'); Lm.mouthZ = mq.n ? mq.maxz : Lm.headZ + .09
    Lm.hipW = box(-1, 1, .5, .62, -.3, .3, 'kc').maxx
    Lm.foot = {}; for (const [s, side] of [[1, 'L'], [-1, 'R']]) { const sb = box(s > 0 ? 0 : -1, s > 0 ? 1 : 0, -1, .3, -.5, .8, 's'), kb = box(s > 0 ? 0 : -1, s > 0 ? 1 : 0, -1, .13, sb.n ? sb.minz : -.1, sb.n ? sb.maxz : .2, 'k')
      const fb = sb.n ? sb : { minx: s * .06, maxx: s * .15, minz: -.04, maxz: .22, maxy: .08, n: 0 }
      Lm.foot[side] = { len: fb.maxz - fb.minz + .012, w: fb.maxx - fb.minx + .008, cx: (fb.minx + fb.maxx) / 2, z0: fb.minz - .014, top: kb.n ? Math.max(.02, kb.miny) : .04, hasShoe: sb.n > 0, hasFoot: kb.n > 0 } }
    this.lm = Lm
    CUERPOS[this.id] = { snap: this.snap, lm: Lm }
  }
  mountBone(obj, boneName) { const loc = this.snap.bones['mixamorig' + boneName].clone().invert().multiply(this.snap.lean); loc.decompose(obj.position, obj.quaternion, obj.scale); this.bones['mixamorig' + boneName].add(obj) }

  // ---------- aspecto ----------
  setLook(l) {
    for (const p of this.parts) { if (p.role === 'skin' || p.role === 'lash') continue
      if (p.role === 'hair') { look(p.mat, l.hair); continue }
      const k = p.key
      if (/^(Shirt|Hoodie|Hoody|Cloth|Sweater|Suit)$/.test(k) || (k === this.id && /body1/i.test(p.mat.name))) look(p.mat, l.top)
      else if (/^_?Pants$/.test(k)) look(p.mat, l.pants)
      else if (/^(Sneakers|Shoes|Heels)$/.test(k)) look(p.mat, l.shoes) }
  }

  // ---------- complementos ----------
  addAcc(name, o = {}) {
    const D = ITEMS[name]; if (!D) return
    const clave = this.id + '|' + name + '|' + JSON.stringify(o)
    let res = COMPLEMENTOS[clave]
    if (!res) { res = COMPLEMENTOS[clave] = D.build(this.lm, o); for (const p of res.parts || [res]) fusionar(p.g) }   // una vez por personaje y opciones
    const parts = res.parts || [{ g: res.g, bone: D.mount === 'lean' ? null : D.bone }], rec = { name, objs: [] }
    for (const p of parts) { const hd = new THREE.Group(); hd.add(p.g.clone(true)); if (p.bone) this.mountBone(hd, p.bone); else this.lean.add(hd); rec.objs.push(hd); hd.traverse(m => { if (m.isMesh) m.castShadow = true }) }
    for (const h of res.hide || []) for (const m of this.piezas) if ((h === 'hair' && m.kind === 'h' && !/beard/i.test(m.key)) || (h === 'shoe' && m.kind === 's' && this.lm.foot.L.hasFoot)) { if (m.mesh.visible) { m.mesh.visible = false; this.ocultas.push(m.mesh) } }
    this.acc.push(rec)
  }
  quitarAcc() {
    for (const rec of this.acc) for (const g of rec.objs) g.parent && g.parent.remove(g)
    this.acc = []; for (const m of this.ocultas) m.visible = true; this.ocultas = []
  }
  /** Pone exactamente estos complementos (quita los que sobran, el resto no se toca). `opts[nombre]` = opciones de construccion. */
  setItems(list, opts = {}) {
    const mano = list.filter(n => OBJETOS_DE_MANO.has(n)), resto = list.filter(n => !OBJETOS_DE_MANO.has(n))
    // un objeto que se estaba guardando y se vuelve a pedir: se queda
    for (const n of mano) { const it = this.items[n]; if (it && it.target === 0) { it.target = 1; for (const g of HOLD_COVER[n]) this.hwT[g] = 1 } }
    this.equip(mano)
    const quiero = resto.map(n => n + JSON.stringify(opts[n] || {})).join(',')
    if (quiero !== this.quieroAcc) {
      this.quitarAcc(); this.quieroAcc = quiero
      for (const n of [...resto].sort((a, b) => (a === 'zocas' ? -1 : 0) - (b === 'zocas' ? -1 : 0))) this.addAcc(n, opts[n] || {})
    }
  }
  clearItems() { this.setItems([]) }
  advance(sec, dt = 1 / 30) { for (let t = 0; t < sec; t += dt) this.update(dt) }
}
