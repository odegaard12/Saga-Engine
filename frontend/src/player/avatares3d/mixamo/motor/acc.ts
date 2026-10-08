/* eslint-disable */
// @ts-nocheck
// GENERADO por frontend/scripts/portar-motor-mixamo.mjs a partir de
// sim/playwright-bench/harness/mixamo4/acc.js. NO se edita a mano: se vuelve a generar.
// Accesorios que NO se agarran con la mano (cabeza, espalda, pies), procedurales: geometria de three.js, cero descargas.
// Los objetos de mano (bordon, paraguas, cesta, gaita) ya no estan aqui: se autoran en Blender (blender/author.py) y viajan en hold_<Ch>.glb.
// Todo en coordenadas "lean" (metros, +Y arriba, +Z delante, +X = izquierda del personaje).
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
export const V3 = THREE.Vector3, Q4 = THREE.Quaternion, M4 = THREE.Matrix4, V2 = THREE.Vector2

// ---------------- texturas ----------------
function rng(s) { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
function tex(w, h, fn, rep = [1, 1], srgb = true) { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t }
export const T = {
  wood(base = '#7a5530', seed = 1, rep = [1, 3]) { return tex(256, 256, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); const R = rng(seed)
    for (let i = 0; i < 240; i++) { const x = R() * w; g.strokeStyle = R() < .5 ? `rgba(30,15,5,${.05 + R() * .13})` : `rgba(255,230,190,${.03 + R() * .07})`; g.lineWidth = .6 + R() * 2; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + R() * 10 - 5, h * .33, x + R() * 10 - 5, h * .66, x + R() * 8 - 4, h); g.stroke() }
    for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(40,20,8,.22)'; g.beginPath(); g.ellipse(R() * w, R() * h, 2 + R() * 3, 6 + R() * 9, 0, 0, 7); g.fill() } }, rep) },
  cloth(base, seed = 2, rep = [2, 2]) { return tex(256, 256, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); const R = rng(seed)
    for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(0,0,0,${.05 + R() * .05})`; g.fillRect(0, y, w, 1) }
    for (let x = 0; x < w; x += 2) { g.fillStyle = `rgba(255,255,255,${.03 + R() * .05})`; g.fillRect(x, 0, 1, h) }
    for (let i = 0; i < 3500; i++) { g.fillStyle = R() < .5 ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.07)'; g.fillRect(R() * w, R() * h, 1, 1) } }, rep) },
  leather(base, seed = 3, rep = [2, 2]) { return tex(256, 256, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); const R = rng(seed)
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${R() < .5 ? '0,0,0' : '255,235,200'},${.03 + R() * .06})`; g.beginPath(); g.ellipse(R() * w, R() * h, 3 + R() * 10, 2 + R() * 7, R() * 3, 0, 7); g.fill() }
    for (let i = 0; i < 5000; i++) { g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(R() * w, R() * h, 1, 1) } }, rep) },
  wool(base, seed = 4, rep = [3, 3]) { return tex(256, 256, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); const R = rng(seed)
    for (let i = 0; i < 9000; i++) { g.fillStyle = R() < .5 ? 'rgba(0,0,0,.10)' : 'rgba(255,255,255,.09)'; g.fillRect(R() * w, R() * h, 1 + R() * 2, 1) } }, rep) },
  shell() { return tex(256, 128, (g, w, h) => { const n = 9; for (let i = 0; i < n * 2; i++) { g.fillStyle = i % 2 ? '#d9c7a1' : '#f1e6cc'; g.fillRect(i * w / (n * 2), 0, w / (n * 2) + 1, h) }
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(120,80,40,.55)'); gr.addColorStop(.35, 'rgba(120,80,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h)
    g.globalAlpha = .2; for (let y = 8; y < h; y += 12) { g.fillStyle = '#6a4a28'; g.fillRect(0, y, w, 1.5) } g.globalAlpha = 1 }) },
}
export const mat = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: .75, metalness: 0 }, o))
export const tmat = (map, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ map, roughness: .85, metalness: 0 }, o))

// ---------------- geometria ----------------
const M = (geo, m, pos = [0, 0, 0], rot = [0, 0, 0]) => { const o = new THREE.Mesh(geo, m); o.position.set(...pos); o.rotation.set(...rot); o.castShadow = true; return o }
const smoothLathe = (pts, n = 48, seg = 40) => { const c = new THREE.SplineCurve(pts.map(p => new V2(p[0], p[1]))); const g = new THREE.LatheGeometry(c.getPoints(n), seg); g.computeVertexNormals(); return g }
const polyLathe = (pts, seg = 40) => { const g = new THREE.LatheGeometry(pts.map(p => new V2(p[0], p[1])), seg); g.computeVertexNormals(); return g }
function tubeTaper(pts, N, radial, rFn, closed = false) { const curve = new THREE.CatmullRomCurve3(pts.map(p => new V3(...p)), closed); const geo = new THREE.TubeGeometry(curve, N, 1, radial, closed); const pos = geo.attributes.position, R = radial + 1, c = new V3(), v = new V3()
  for (let i = 0; i < pos.count; i++) { const ring = Math.floor(i / R), t = ring / N; curve.getPointAt(t, c); v.fromBufferAttribute(pos, i); v.sub(c).multiplyScalar(rFn(t)).add(c); pos.setXYZ(i, v.x, v.y, v.z) }
  geo.computeVertexNormals(); return geo }
const tubeG = (pts, r, N = 32, radial = 8) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new V3(...p))), N, r, radial)
function ribbon(pts, nrm, w, th, ring = 8) { const n = pts.length, pos = [], idx = []
  for (let i = 0; i < n; i++) { const t = pts[Math.min(i + 1, n - 1)].clone().sub(pts[Math.max(i - 1, 0)]).normalize(); const nn = nrm[i].clone(); nn.addScaledVector(t, -nn.dot(t)).normalize(); const b = new V3().crossVectors(t, nn).normalize()
    for (let k = 0; k < ring; k++) { const a = k / ring * Math.PI * 2; pos.push(...pts[i].clone().addScaledVector(b, Math.cos(a) * w / 2).addScaledVector(nn, Math.sin(a) * th / 2).toArray()) } }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < ring; k++) { const a = i * ring + k, b = i * ring + (k + 1) % ring, c = (i + 1) * ring + k, d = (i + 1) * ring + (k + 1) % ring; idx.push(a, c, b, b, c, d) }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g }
const resample = (pts, nrm, n) => { const c = new THREE.CatmullRomCurve3(pts), out = c.getPoints(n), nn = []; for (let i = 0; i <= n; i++) { const f = i / n * (nrm.length - 1), a = Math.floor(f), b = Math.min(a + 1, nrm.length - 1); nn.push(nrm[a].clone().lerp(nrm[b], f - a).normalize()) } return [out, nn] }

// concha de vieira: bisagra en y=0, abanico hacia +y, bombeada hacia +z
export function scallop(R = .06, span = 2.35, mats = null) { const Na = 56, Nr = 16, pos = [], uv = [], idx = [], ribs = 9
  for (let j = 0; j <= Nr; j++) for (let i = 0; i <= Na; i++) { const f = i / Na, a = (f - .5) * span, rr = R * j / Nr * (1 - .03 * (1 - Math.abs(Math.cos(a * ribs / span * Math.PI * .98)))), s = j / Nr
    pos.push(Math.sin(a) * rr, Math.cos(a) * rr, .014 * R / .06 * Math.pow(s, 1.5) + .0035 * R / .06 * Math.cos(f * ribs * Math.PI * 2) * s); uv.push(f, s) }
  for (let j = 0; j < Nr; j++) for (let i = 0; i < Na; i++) { const a = j * (Na + 1) + i, b = a + 1, c = a + Na + 1, d = c + 1; idx.push(a, b, c, b, d, c) }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals()
  const grp = new THREE.Group(); const m = M(g, tmat(T.shell(), { roughness: .45, side: THREE.DoubleSide, metalness: .05 })); grp.add(m)
  for (const s of [-1, 1]) { const ear = M(new THREE.CylinderGeometry(R * .22, R * .26, R * .035, 3), mat(0xe6d7b4, { roughness: .5 }), [s * R * .26, R * .045, .002], [Math.PI / 2, 0, s * .2]); ear.scale.set(1, 1, .5); grp.add(ear) }
  return grp }

// ---------------- descripcion de accesorios ----------------
// build(Lm, o) -> { g | parts:[{g,bone}], hide:[...] }
export const ITEMS = {}
const def = (n, d) => { ITEMS[n] = d }
const brass = () => mat(0xc29a3c, { metalness: .8, roughness: .32 })

// ---- mochila ----
function mochilaBuild(Lm, o = {}) { const g = new THREE.Group(), k = Lm.k, w = .30 * k, h = .42 * k, d = .17 * k, yC = Lm.c.y - .045
  const z0 = Lm.backZ(-w / 2, w / 2, yC - h / 2, yC + h / 2) - .014, zc = z0 - d / 2
  // o.cuero: cuerpo de cuero (zurrón); o.piel: solapa y rollo de piel de oveja; las hebillas, de hueso en vez de latón.
  const cv = o.cuero ? tmat(T.leather(o.col, 61, [2, 2.5]), { roughness: .8 }) : tmat(T.cloth(o.col || '#7a6a3e', 61, [2, 2.5]), { roughness: .95 }), cd = tmat(T.leather(o.dark || '#4a3622', 62, [2, 2]), { roughness: .9 })
  const pf = o.piel ? tmat(T.wool(o.piel, 64, [3, 3]), { roughness: 1 }) : cd, hebilla = () => o.cuero ? mat(0xd9ceb2, { roughness: .6 }) : brass()
  g.add(M(new RoundedBoxGeometry(w, h, d, 5, .05), cv, [0, yC, zc]))
  const flap = M(new RoundedBoxGeometry(w * 1.03, h * .36, d * 1.12, 5, .05), pf, [0, yC + h / 2 - h * .15, zc - .003]); flap.rotation.x = .05; g.add(flap)
  g.add(M(new RoundedBoxGeometry(w * .72, h * .4, d * .42, 4, .03), cv, [0, yC - h * .13, zc - d / 2 - .03]))
  g.add(M(new RoundedBoxGeometry(w * .72, h * .12, d * .44, 3, .02), cd, [0, yC - h * .13 + h * .13, zc - d / 2 - .03]))
  for (const s of [-1, 1]) { g.add(M(new RoundedBoxGeometry(.025, .09, .012, 2, .004), cd, [s * w * .24, yC + h * .1, zc - d / 2 - .066])); g.add(M(new RoundedBoxGeometry(.02, .016, .014, 2, .003), hebilla(), [s * w * .24, yC + h * .02, zc - d / 2 - .07])) }
  const roll = o.roll || '#7d8a5a'; g.add(M(new THREE.CylinderGeometry(.062 * k, .062 * k, w * 1.1, 24), o.piel ? pf : tmat(T.cloth(roll, 63, [3, 1]), { roughness: .95 }), [0, yC + h / 2 + .052 * k, zc], [0, 0, Math.PI / 2]))
  for (const s of [-1, 1]) { g.add(M(new THREE.CylinderGeometry(.0635 * k, .0635 * k, .03, 24), cd, [s * w * .38, yC + h / 2 + .052 * k, zc], [0, 0, Math.PI / 2])) }
  if (o.mat) g.add(M(new THREE.CylinderGeometry(.052 * k, .052 * k, w * .98, 20), mat(0xd9c694, { roughness: .8 }), [0, yC - h / 2 - .045 * k, zc], [0, 0, Math.PI / 2]))
  if (o.vieira) { const sc = scallop(.05); sc.position.set(0, yC - h * .26, zc - d / 2 - .085); sc.rotation.set(0, 0, 0); g.add(sc); g.add(M(tubeG([[0, yC - h * .26 + .002, zc - d / 2 - .078], [0, yC - h * .26 + .09, zc - d / 2 - .06], [0, yC - h * .13 + .06, zc - d / 2 - .04]], .0028, 10, 5), mat(0x8a2a22))) }
  if (!o.thumb) for (const s of [-1, 1]) { const sx = s * Math.min(.105, Lm.shW * .55), pts = [], nrm = []
    const yTop = yC + h / 2 - .04; const yS = Lm.topY(sx - .025, sx + .025, -.04, .04, Lm.c.y) + .014
    for (let y = yTop; y < yS; y += .03) { pts.push(new V3(sx, y, Lm.backZ(sx - .03, sx + .03, y - .02, y + .02) - .009)); nrm.push(new V3(0, 0, -1)) }
    const zb = pts[pts.length - 1].z, zf = Lm.frontZ(sx - .03, sx + .03, yS - .08, yS - .02)
    for (let z = zb + .02; z < zf; z += .025) { pts.push(new V3(sx, Lm.topY(sx - .025, sx + .025, z - .02, z + .02, Lm.c.y) + .011, z)); nrm.push(new V3(0, 1, 0)) }
    const yb = pts[pts.length - 1].y; for (let y = yb - .03; y > Lm.c.y - .13; y -= .03) { pts.push(new V3(sx, y, Lm.frontZ(sx - .03, sx + .03, y - .02, y + .02) + .009)); nrm.push(new V3(0, 0, 1)) }
    const ye = pts[pts.length - 1], xs = s * (Math.abs(sx) + .06)
    pts.push(new V3(xs, ye.y - .05, ye.z - .035)); nrm.push(new V3(s * .7, 0, .7)); pts.push(new V3(s * (Lm.shW * .78), ye.y - .08, (ye.z + zc) / 2 * .35)); nrm.push(new V3(s, 0, 0)); pts.push(new V3(s * w * .46, yC - h * .42, z0 + .004)); nrm.push(new V3(s, 0, -.3))
    const [rp, rn] = resample(pts, nrm, 70); g.add(M(ribbon(rp, rn, .042, .014, 8), cd))
    g.add(M(new RoundedBoxGeometry(.03, .022, .02, 2, .004), hebilla(), rp[10].clone().add(new V3(0, 0, -.004)))) }
  return { g } }
def('mochila', { label: 'Mochila', slot: 'espalda', occ: [], mount: 'bone', bone: 'Spine2', note: 'espalda', cam: Lm => ({ t: new V3(0, Lm.c.y - .02, -.2), d: 1.5, az: Math.PI - .5, el: .1, fov: 28 }), build: (Lm, o = {}) => mochilaBuild(Lm, Object.assign({ mat: false }, o)) })
def('mochilaP', { label: 'Mochila de peregrino', slot: 'espalda', occ: [], mount: 'bone', bone: 'Spine2', note: 'espalda', cam: Lm => ({ t: new V3(0, Lm.c.y - .02, -.2), d: 1.5, az: Math.PI + .5, el: .1, fov: 28 }),
  build: (Lm, o = {}) => mochilaBuild(Lm, Object.assign({ col: '#3d5a3a', dark: '#2e2a22', roll: '#c9702a', mat: true, vieira: true }, o)) })
// Zurrón vikingo: cuero curtido, solapa y rollo de piel de oveja, hebillas de hueso.
def('mochila_vikinga', { label: 'Zurrón vikingo', slot: 'espalda', occ: [], mount: 'bone', bone: 'Spine2', note: 'espalda', cam: Lm => ({ t: new V3(0, Lm.c.y - .02, -.2), d: 1.5, az: Math.PI - .5, el: .1, fov: 28 }),
  build: (Lm, o = {}) => mochilaBuild(Lm, Object.assign({ cuero: true, col: '#7a4f2a', dark: '#3b2716', piel: '#cbbfa8', mat: false }, o)) })

// ---------------- tocados: encajados en la cabeza de CADA personaje ----------------
// Un tocado se construye en su propio marco (origen en el centro de su borde, +Y arriba, +Z delante) y se coloca con
// `ajusteCabeza`: mide la piel de la cabeza de ese personaje y da el elipsoide mas pequeno que la envuelve por encima
// del borde. Asi la cabeza no atraviesa el tocado en ningun personaje, y el pelo que quedaria dentro se recorta por
// shader (`recorte`, ver look.js): ni el pelo ni la cabeza asoman a traves del casco, la boina o el sombrero.
const _e = new THREE.Euler(), _q = new Q4(), _p = new V3()
/**
 * Encaje de un tocado: borde a `caida` m por debajo de la coronilla (piel), inclinado `tx` (cabeceo) y `tz` (ladeo).
 * Devuelve el marco { pos, rot } y los semiejes { a (x), h (alto), c (z) } del elipsoide que envuelve la cabeza
 * por encima del borde, con `margen` de holgura.
 */
export function ajusteCabeza(Lm, caida = .085, margen = .012, tx = 0, tz = 0) {
  const P = Lm.headPts || new Float32Array(0), y0 = Lm.topB - caida
  _q.setFromEuler(_e.set(tx, 0, tz)).invert()
  let minx = 9, maxx = -9, minz = 9, maxz = -9
  for (let i = 0; i < P.length; i += 3) { const y = P[i + 1]; if (y < y0 || y > y0 + .05) continue; const x = P[i], z = P[i + 2]
    if (x < minx) minx = x; if (x > maxx) maxx = x; if (z < minz) minz = z; if (z > maxz) maxz = z }
  if (minx > maxx) { minx = -Lm.headRb; maxx = Lm.headRb; minz = Lm.headZ - Lm.headRb * 1.15; maxz = Lm.headZ + Lm.headRb * 1.15 }
  const pos = new V3((minx + maxx) / 2, y0, (minz + maxz) / 2)
  const a = (maxx - minx) / 2, c = (maxz - minz) / 2, h = Math.max(.04, Lm.topB - y0)
  let s = 1
  for (let i = 0; i < P.length; i += 3) { _p.set(P[i], P[i + 1], P[i + 2]).sub(pos).applyQuaternion(_q); if (_p.y < 0) continue
    s = Math.max(s, (_p.x / a) ** 2 + (_p.y / h) ** 2 + (_p.z / c) ** 2) }
  s = Math.sqrt(s)
  return { pos, rot: new THREE.Euler(tx, 0, tz), a: a * s + margen, h: h * s + margen, c: c * s + margen }
}
// coloca el grupo del tocado y deja dicho que pelo se recorta (todo lo que quede por encima del borde y dentro de `k` veces su contorno)
const tocado = (F, hg, k = 1.7, y = 0) => { hg.position.copy(F.pos); hg.rotation.copy(F.rot); const g = new THREE.Group(); g.add(hg); return { g, recorte: { pos: F.pos.clone(), rot: F.rot.clone(), r: new V3(F.a * k, y, F.c * k) } } }
// aro eliptico (cinta, borde) en el plano del tocado
const aroG = (a, c, y, r, radial = 8, N = 72) => { const pts = []; for (let i = 0; i < N; i++) { const t = i / N * Math.PI * 2; pts.push(new V3(Math.sin(t) * a, y, Math.cos(t) * c)) } return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), N * 2, r, radial, true) }
// cupula: perfil de revolucion de radio unidad escalado a (a, alto, c)
const cupula = (perfil, m, a, h, c, seg = 56) => { const o = M(smoothLathe(perfil, 48, seg), m); o.scale.set(a, h, c); o.material.side = THREE.DoubleSide; return o }
// superficie en rejilla f(u, v) -> V3 (alas, solapas, capas)
function rejilla(nu, nv, f) { const pos = [], uv = [], idx = []
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const p = f(i / nu, j / nv); pos.push(p.x, p.y, p.z); uv.push(i / nu, j / nv) }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, c, b, b, c, d) }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g }
const camCabeza = (dy = -.04, d = .95, el = .12) => Lm => ({ t: new V3(0, Lm.top + dy, Lm.headZ), d, az: .55, el, fov: 28 })

// ---- casco vikingo ----
def('casco', { label: 'Casco vikingo', slot: 'cabeza', occ: [], mount: 'bone', bone: 'Head', note: 'cabeza', cam: camCabeza(-.05),
  build(Lm, o = {}) { const F = ajusteCabeza(Lm, .085, .014), hg = new THREE.Group(), { a, h, c } = F
    const iron = tmat(T.leather('#8e9198', 71, [2, 2]), { metalness: .55, roughness: .42 }), bronze = mat(0xa8742c, { metalness: .65, roughness: .38 })
    hg.add(cupula([[0, 1.0], [.4, .96], [.75, .74], [.96, .38], [1, 0], [.99, -.07]], iron, a, h, c))
    hg.add(M(aroG(a + .004, c + .004, .002, .0105, 10), bronze))
    const cr = []; for (let i = 0; i <= 24; i++) { const t = i / 24 * Math.PI; cr.push(new V3(0, Math.sin(t) * (h + .004), Math.cos(t) * (c + .004))) } hg.add(M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cr), 48, .0085, 8), bronze))
    for (let i = 0; i < 18; i++) { const t = i / 18 * Math.PI * 2; hg.add(M(new THREE.SphereGeometry(.0055, 8, 6), bronze, [Math.sin(t) * (a + .012), .002, Math.cos(t) * (c + .012)])) }
    const nas = new THREE.Shape(); nas.moveTo(-.013, 0); nas.lineTo(.013, 0); nas.lineTo(.008, -.07); nas.quadraticCurveTo(0, -.082, -.008, -.07); nas.closePath()
    hg.add(M(new THREE.ExtrudeGeometry(nas, { depth: .005, bevelEnabled: true, bevelSize: .002, bevelThickness: .002, bevelSegments: 1 }), iron, [0, .008, c + .006], [-.1, 0, 0]))
    for (const s of [-1, 1]) { const x0 = s * a, cp = [[x0 * .98, .012, 0], [x0 + s * .04, .025, .006], [x0 + s * .08, .06, .015], [x0 + s * .1, .115, .03], [x0 + s * .085, .17, .05]]
      hg.add(M(tubeTaper(cp, 36, 12, t => .02 * (1 - .88 * Math.pow(t, 1.2))), tmat(T.wood('#e5d8b8', 73 + s, [1, 3]), { roughness: .5 })))
      hg.add(M(new THREE.CylinderGeometry(.027, .029, .026, 18), bronze, [x0 + s * .016, .014, 0], [0, 0, -s * Math.PI / 2 + s * .12]))
      for (const tt of [.3, .5]) { const p = new THREE.CatmullRomCurve3(cp.map(q => new V3(...q))).getPointAt(tt); hg.add(M(new THREE.TorusGeometry(.0225 * (1 - .88 * Math.pow(tt, 1.2)) * 1.05, .0028, 6, 16), mat(0x3a2a18), p.toArray(), [Math.PI / 2 * .9, 0, s * .2])) } }
    return tocado(F, hg) } })

// ---- boina ----
def('boina', { label: 'Boina', slot: 'cabeza', occ: [], mount: 'bone', bone: 'Head', note: 'cabeza', cam: camCabeza(-.04, .9),
  build(Lm, o = {}) { const F = ajusteCabeza(Lm, .07, .009, .05, -.1), hg = new THREE.Group(), { a, h, c } = F, sy = Math.max(1, (h + .012) / .08)
    const wool = tmat(T.wool(o.col || '#1d2331', 81, [4, 4]), { roughness: 1 })
    const b = M(smoothLathe([[1, 0], [1.08, .004], [1.22, .017], [1.31, .036], [1.25, .056], [.96, .073], [.55, .085], [.2, .089], [0, .09]], 70, 56), wool); b.scale.set(a, sy, c); b.material.side = THREE.DoubleSide; hg.add(b)
    hg.add(M(new THREE.CylinderGeometry(.0065, .008, .024, 10), wool, [0, .09 * sy + .008, 0]))
    hg.add(M(aroG(a * 1.01, c * 1.01, .002, .0045), tmat(T.leather('#2a1a10', 82, [4, 1]))))
    return tocado(F, hg) } })

// ---- sombrero de peregrino ----
def('sombrero', { label: 'Sombrero de peregrino', slot: 'cabeza', occ: [], mount: 'bone', bone: 'Head', note: 'cabeza', cam: camCabeza(-.02, 1.1, .2),
  build(Lm, o = {}) { const F = ajusteCabeza(Lm, .075, .012, .04), hg = new THREE.Group(), { a, h, c } = F, ch = Math.max(.12, h + .035)
    const felt = tmat(T.wool(o.col || '#5a4128', 91, [4, 4]), { roughness: 1 })
    hg.add(cupula([[0, 1], [.6, .98], [.93, .875], [1.02, .69], [1.03, .23], [1.0, 0]], felt, a, ch, c))
    const ala = M(rejilla(64, 6, (u, v) => { const t = u * Math.PI * 2, r = 1 + v * 1.25, y = -.012 * Math.sin(v * Math.PI) + .006 * v * v; return new V3(Math.sin(t) * a * r, y, Math.cos(t) * c * r) }), felt); ala.material.side = THREE.DoubleSide; hg.add(ala)
    hg.add(M(aroG(a * 1.035, c * 1.035, .03, .0085), tmat(T.leather('#2a1a10', 92, [6, 1]))))
    hg.add(M(new RoundedBoxGeometry(.03, .026, .008, 2, .003), brass(), [0, .03, c * 1.04]))
    const sc = scallop(.052); sc.position.set(0, .052, c * 1.04 + .004); sc.rotation.set(-.12, 0, 0); hg.add(sc)
    return tocado(F, hg, 1.9) } })

// ---- monteira (montera gallega: pano negro, solapas vueltas con vivo rojo y borla) ----
const altoSolapa = (u, alto) => alto * Math.pow(Math.max(0, 1 - Math.pow((u - .5) * 2, 2)), .7) + .012
def('monteira', { label: 'Monteira', slot: 'cabeza', occ: [], mount: 'bone', bone: 'Head', note: 'cabeza', cam: camCabeza(-.02, 1.0, .15),
  build(Lm, o = {}) { const F = ajusteCabeza(Lm, .08, .012, .03), hg = new THREE.Group(), { a, h, c } = F
    const pano = tmat(T.wool(o.col || '#16161c', 131, [5, 5]), { roughness: .95 }), rojo = tmat(T.cloth('#b3202a', 132, [6, 1]), { roughness: .8 })
    hg.add(cupula([[0, 1.32], [.3, 1.27], [.66, 1.06], [.92, .64], [1.0, .22], [1.0, 0]], pano, a, h, c))
    // solapas: delantera alta y trasera mas baja, vueltas hacia arriba y algo abiertas
    for (const [fi, alto, ancho] of [[0, .085, 1.05], [Math.PI, .06, 1.25]]) {
      const sol = rejilla(28, 5, (u, v) => { const t = fi + (u - .5) * ancho * 2, k = 1.02 + .18 * v; return new V3(Math.sin(t) * a * k, v * altoSolapa(u, alto), Math.cos(t) * c * k) })
      const m1 = M(sol, pano); m1.material.side = THREE.DoubleSide; hg.add(m1)
      const borde = []; for (let i = 0; i <= 28; i++) { const u = i / 28, t = fi + (u - .5) * ancho * 2; borde.push(new V3(Math.sin(t) * a * 1.2, altoSolapa(u, alto), Math.cos(t) * c * 1.2)) }
      hg.add(M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(borde), 48, .0055, 6), rojo)) }
    hg.add(M(aroG(a * 1.02, c * 1.02, .004, .006), rojo))
    // borla roja en lo alto
    hg.add(M(new THREE.CylinderGeometry(.003, .003, .02, 6), rojo, [0, h * 1.32 + .008, 0]))
    const borla = M(new THREE.SphereGeometry(.017, 14, 10), tmat(T.wool('#c4222c', 133, [2, 2]), { roughness: 1 }), [0, h * 1.32 + .024, 0]); borla.scale.set(1, .85, 1); hg.add(borla)
    return tocado(F, hg) } })

// ---- pano (panuelo de cabeza anudado en la nuca) ----
function texPano(base, punto) { return tex(256, 256, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); const R = rng(141)
  for (let y = 0; y < h; y += 2) { g.fillStyle = 'rgba(0,0,0,' + (.03 + R() * .04) + ')'; g.fillRect(0, y, w, 1) }
  g.fillStyle = punto; for (let y = 8; y < h; y += 24) for (let x = (y / 24 % 2) * 12 + 6; x < w; x += 24) { g.beginPath(); g.arc(x, y, 3.2, 0, 7); g.fill() }
  }, [4, 3]) }
def('pano', { label: 'Pano', slot: 'cabeza', occ: [], mount: 'bone', bone: 'Head', note: 'cabeza', cam: Lm => ({ t: new V3(0, Lm.top - .06, Lm.headZ), d: 1.0, az: 2.4, el: .15, fov: 28 }),
  build(Lm, o = {}) { const F = ajusteCabeza(Lm, .1, .006, -.3), hg = new THREE.Group(), { a, h, c } = F
    const tela = tmat(texPano(o.col || '#a3172a', '#f3ead8'), { roughness: .85 })
    hg.add(cupula([[0, 1.0], [.5, .88], [.84, .56], [.99, .16], [1.01, 0], [.99, -.06]], tela, a, h, c))
    // nudo en la nuca y las dos puntas colgando
    const nudo = M(new THREE.SphereGeometry(.022, 14, 10), tela, [0, .004, -c - .008]); nudo.scale.set(1.3, .8, .8); hg.add(nudo)
    for (const s of [-1, 1]) { const sh = new THREE.Shape(); sh.moveTo(-.022, 0); sh.lineTo(.022, 0); sh.lineTo(s * .012, -.085); sh.closePath()
      const pt = M(new THREE.ExtrudeGeometry(sh, { depth: .003, bevelEnabled: false }), tela, [s * .012, -.004, -c - .014], [-.25, s * .2, s * .28]); pt.material.side = THREE.DoubleSide; hg.add(pt) }
    return tocado(F, hg, 1.5, -.004) } })

// ---- sueste (sombreiro de augas de marineiro: hule amarillo, ala larga detras) ----
const anchoAla = t => { const atras = (1 - Math.cos(t)) / 2; return [.055 + .07 * atras, .3 + .45 * atras] }
def('sueste', { label: 'Sueste', slot: 'cabeza', occ: [], mount: 'bone', bone: 'Head', note: 'cabeza', cam: Lm => ({ t: new V3(0, Lm.top - .04, Lm.headZ), d: 1.1, az: 1.0, el: .2, fov: 28 }),
  build(Lm, o = {}) { const F = ajusteCabeza(Lm, .08, .012, -.06), hg = new THREE.Group(), { a, h, c } = F
    const hule = mat(o.col || 0xf2c200, { roughness: .32, metalness: .02 }), cos = mat(0x8a6a00, { roughness: .5 })
    hg.add(cupula([[0, 1.0], [.5, .95], [.84, .74], [.99, .38], [1.02, 0]], hule, a, h, c))
    const ala = M(rejilla(72, 6, (u, v) => { const t = u * Math.PI * 2, [w, caida] = anchoAla(t), k = v * w; return new V3(Math.sin(t) * (a + k), -k * caida, Math.cos(t) * (c + k)) }), hule); ala.material.side = THREE.DoubleSide; hg.add(ala)
    for (const v of [.4, .8]) { const pts = []; for (let i = 0; i < 72; i++) { const t = i / 72 * Math.PI * 2, [w0, caida] = anchoAla(t), w = w0 * v; pts.push(new V3(Math.sin(t) * (a + w), -w * caida + .0015, Math.cos(t) * (c + w))) }
      hg.add(M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 144, .0018, 4, true), cos)) }
    hg.add(M(aroG(a * 1.01, c * 1.01, .006, .0045), cos))
    return tocado(F, hg, 2.2, -.05) } })

// ---- gorra de ruta (con visera) ----
def('gorra', { label: 'Gorra', slot: 'cabeza', occ: [], mount: 'bone', bone: 'Head', note: 'cabeza', cam: camCabeza(-.04, .95),
  build(Lm, o = {}) { const F = ajusteCabeza(Lm, .075, .008, -.04), hg = new THREE.Group(), { a, h, c } = F
    const tela = tmat(T.cloth(o.col || '#0d5fb3', 151, [4, 4]), { roughness: .9 }), claro = tmat(T.cloth(o.vivo || '#0a3f7a', 152, [3, 3]), { roughness: .9 })
    hg.add(cupula([[0, 1.04], [.55, .97], [.88, .68], [1.0, .3], [1.0, 0]], tela, a, h, c))
    for (let i = 0; i < 6; i++) { const t0 = i / 6 * Math.PI * 2 + Math.PI / 6, pts = []; for (let j = 0; j <= 16; j++) { const an = j / 16 * Math.PI / 2; pts.push(new V3(Math.sin(t0) * Math.cos(an) * (a + .002), Math.sin(an) * h * 1.04 + .001, Math.cos(t0) * Math.cos(an) * (c + .002))) }
      hg.add(M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, .0016, 4), claro)) }
    hg.add(M(new THREE.SphereGeometry(.009, 10, 8), tela, [0, h * 1.04, 0]))
    const visera = M(rejilla(24, 6, (u, v) => { const t = (u - .5) * 2.0, r = 1 + v * (.75 * Math.cos(t * .8)); return new V3(Math.sin(t) * a * r, -.004 - v * v * .02, Math.cos(t) * c * r) }), tela); visera.material.side = THREE.DoubleSide; hg.add(visera)
    hg.add(M(aroG(a * 1.005, c * 1.005, .003, .004), claro))
    return tocado(F, hg) } })

// ---- calzado (zocas y zapatillas de monte) ----
// Un zapato CERRADO alrededor del pie de cada personaje (Lm.foot): suela que asoma por el borde y un empeine que cubre el
// pie hasta el tobillo (media elipsoide, mas alta atras que delante). El zapato del modelo se esconde (hide: shoe).
function siluetaPie(hw, z0, len) { const z1 = z0 + len, sh = new THREE.Shape()
  sh.moveTo(0, -z0); sh.bezierCurveTo(hw * .95, -z0, hw * 1.05, -(z0 + len * .55), hw * .88, -(z0 + len * .86)); sh.bezierCurveTo(hw * .62, -(z1 + .004), -hw * .55, -(z1 + .004), -hw * .84, -(z0 + len * .86)); sh.bezierCurveTo(-hw * 1.05, -(z0 + len * .55), -hw * .95, -z0, 0, -z0)
  return sh }
function suela(f, m, y0, y1, k = 1.06) { const hw = f.w / 2 * k, len = f.len * 1.03, z0 = f.z0 - f.len * .015
  const eg = new THREE.ExtrudeGeometry(siluetaPie(hw, z0, len), { depth: y1 - y0, bevelEnabled: true, bevelSize: .003, bevelThickness: .002, bevelSegments: 2, curveSegments: 20 })
  eg.rotateX(-Math.PI / 2); eg.translate(f.cx, y0, 0); return M(eg, m) }
// empeine: casquete del ancho y el largo del pie, de paredes casi verticales y techo plano (un zapato, no una zapatilla de
// casa); `alto` en el talon, `bajo` en la puntera
const altoEmpeine = (f, z, alto, bajo) => { const delante = Math.min(1, Math.max(0, ((z - (f.z0 + f.len * .5)) / (f.len * .52) + 1) / 2)); return alto + (bajo - alto) * Math.pow(delante, 1.3) }
function empeine(f, m, y0, alto, bajo, k = 1.1) { const g = new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), pos = g.attributes.position, v = new V3()
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); const r = Math.hypot(v.x, v.z), r2 = r > 1e-6 ? Math.pow(r, .4) / r : 0, yy = Math.pow(Math.max(0, v.y), 1.5)
    const x = v.x * r2, z = v.z * r2, zz = f.z0 + f.len * .5 + z * f.len * .52
    pos.setXYZ(i, f.cx + x * f.w / 2 * k, y0 + yy * altoEmpeine(f, zz, alto, bajo), zz) }
  g.computeVertexNormals(); return M(g, m) }
function calzado(Lm, o, hacer) { const parts = []
  for (const s of [-1, 1]) { const g = new THREE.Group(); parts.push({ g, bone: s > 0 ? 'LeftFoot' : 'RightFoot' }); hacer(g, Lm.foot[s > 0 ? 'L' : 'R'], s) }
  return { parts, hide: ['shoe'] } }

// ---- zocas: suela de madera con su canto de clavos y empeine de cuero negro (el zueco gallego de cuero) ----
def('zocas', { label: 'Zocas', slot: 'pies', occ: [], mount: 'foot', note: 'pies', hide: ['shoe'], cam: Lm => ({ t: new V3(.08, .06, .08), d: 1.0, az: .7, el: .2, fov: 28 }),
  build(Lm, o = {}) { const madera = tmat(T.wood('#9a6a35', 121, [3, 1]), { roughness: .6 }), cuero = mat(o.col || 0x2b1d15, { roughness: .5, metalness: .04 }), clavo = mat(0xb08a3e, { metalness: .8, roughness: .35 })
    return calzado(Lm, o, (g, f) => {
      g.add(suela(f, madera, -.012, .026, 1.08))
      // franja oscura del canto (donde se clava el cuero)
      g.add(suela(f, mat(0x3a2414, { roughness: .8 }), .02, .027, 1.095))
      const e = empeine(f, cuero, .024, .1, .05, 1.04); g.add(e)
      // clavos de cobre por el borde del empeine
      for (let i = 0; i < 16; i++) { const t = i / 16 * Math.PI * 2, x = f.cx + Math.sin(t) * f.w / 2 * 1.06, z = f.z0 + f.len * .5 + Math.cos(t) * f.len * .53
        g.add(M(new THREE.SphereGeometry(.0042, 6, 4), clavo, [x, .029, z])) }
    }) } })

// ---- zapatillas de monte: suela de goma con taco, empeine de tela con puntera y talonera, cordones y collar ----
def('zapatillas', { label: 'Zapatillas de monte', slot: 'pies', occ: [], mount: 'foot', note: 'pies', hide: ['shoe'], cam: Lm => ({ t: new V3(.08, .06, .08), d: 1.0, az: .7, el: .2, fov: 28 }),
  build(Lm, o = {}) { const goma = mat(0x2b2b2e, { roughness: .95 }), media = mat(0xd9d4c7, { roughness: .9 }), tela = tmat(T.cloth(o.col || '#4f6b45', 191, [4, 3]), { roughness: .85 })
    const piel = tmat(T.leather(o.piel || '#6b4a2e', 192, [3, 2]), { roughness: .6 }), cordon = mat(o.cordon || 0xe8a23a, { roughness: .8 })
    return calzado(Lm, o, (g, f) => {
      g.add(suela(f, goma, -.01, .012, 1.08))
      g.add(suela(f, media, .012, .024, 1.06))
      g.add(empeine(f, tela, .022, .1, .052, 1.04))
      // puntera y talonera de piel (un poco por fuera del empeine)
      g.add(empeine({ ...f, z0: f.z0 + f.len * .6, len: f.len * .42 }, piel, .021, .04, .028, 1.08))
      g.add(empeine({ ...f, len: f.len * .4, z0: f.z0 - .004 }, piel, .021, .075, .06, 1.08))
      // cordones en zigzag por el empeine, sobre su techo
      for (let i = 0; i < 4; i++) { const z = f.z0 + f.len * (.46 + i * .08), y = .022 + altoEmpeine(f, z, .1, .052) + .002
        for (const sg of [-1, 1]) g.add(M(new THREE.CylinderGeometry(.0028, .0028, f.w * .42, 5), cordon, [f.cx, y, z], [0, sg * .45, Math.PI / 2])) }
      // collar acolchado alrededor del tobillo, en lo alto del talon
      const zc = f.z0 + f.len * .3, col = M(new THREE.TorusGeometry(f.w * .36, .011, 8, 22), tela, [f.cx, .022 + altoEmpeine(f, zc, .1, .052) - .006, zc], [Math.PI / 2, 0, 0]); col.scale.set(1, 1.3, 1); g.add(col)
    }) } })

// ---------------- espalda y cintura: encajados en el contorno de CADA cuerpo (Lm.anillo) ----------------
// anillos del cuerpo entre dos alturas (de arriba abajo), para que capas y fajas no atraviesen el torso
function perfilCuerpo(Lm, yA, yB, n, xMax) { const out = []; for (let i = 0; i <= n; i++) { const y = yA + (yB - yA) * i / n; out.push({ y, ...Lm.anillo(y - .025, y + .025, xMax) }) } return out }
function anilloEn(perfil, y) { const n = perfil.length - 1, f = Math.min(n, Math.max(0, (y - perfil[0].y) / (perfil[n].y - perfil[0].y) * n)), i = Math.min(n - 1, Math.floor(f)), t = f - i, A = perfil[i], B = perfil[i + 1]
  return { cx: A.cx + (B.cx - A.cx) * t, cz: A.cz + (B.cz - A.cz) * t, rx: A.rx + (B.rx - A.rx) * t, rz: A.rz + (B.rz - A.rz) * t } }
// paja: hebras verticales con el borde de abajo deshilachado (alfa)
function texPaja(seed = 161) { return tex(256, 256, (g, w, h) => { g.clearRect(0, 0, w, h); const R = rng(seed)
  for (let i = 0; i < 520; i++) { const x = R() * w, largo = h * (.84 + R() * .16), tono = R(); g.strokeStyle = tono < .33 ? '#b8954a' : tono < .66 ? '#d2b36a' : '#8f6f33'; g.lineWidth = 1.2 + R() * 2.2
    g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + R() * 6 - 3, largo * .5, x + R() * 8 - 4, largo); g.stroke() }
  g.fillStyle = 'rgba(60,40,10,.25)'; g.fillRect(0, 0, w, 6) }, [5, 1]) }

// ---- coroza (capa de xunco: la capa de paja de los labregos para la lluvia) ----
// Capas de junco que caen del cuello en escalera y se abren hacia abajo, como un tejado: una esclavina por fuera de
// los hombros y tres faldones por detras (entre los brazos), cada uno algo mas ancho y separado del cuerpo que el de
// encima. Las hebras se ondulan (no es una placa lisa) y el canto de abajo va deshilachado. Holgura de sobra en la
// cintura: la faja y la calabaza quedan DEBAJO, sin asomar a traves.
function texJunco(seed = 161) { return tex(256, 256, (g, w, h) => { g.clearRect(0, 0, w, h); const R = rng(seed)
  for (let i = 0; i < 700; i++) { const x = R() * w, largo = h * (.78 + R() * .22), tono = R(); g.strokeStyle = tono < .3 ? '#7d6430' : tono < .6 ? '#9b7e3e' : tono < .85 ? '#b39350' : '#5e4a24'; g.lineWidth = 1 + R() * 2
    g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + R() * 6 - 3, largo * .5, x + R() * 10 - 5, largo); g.stroke() }
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(40,28,8,.35)'); gr.addColorStop(.25, 'rgba(40,28,8,0)'); g.fillStyle = gr; g.globalCompositeOperation = 'source-atop'; g.fillRect(0, 0, w, h) }, [6, 1]) }
def('coroza', { label: 'Coroza', slot: 'espalda', occ: [], mount: 'bone', bone: 'Spine2', note: 'espalda', cam: Lm => ({ t: new V3(0, Lm.c.y - .05, -.1), d: 1.7, az: Math.PI - .6, el: .15, fov: 28 }),
  build(Lm, o = {}) { const g = new THREE.Group(), yS = Math.max(Lm.topShL, Lm.topShR) + .015, yW = Lm.hips.y - .04, L = yS - yW
    const junco = tmat(texJunco(), { roughness: 1, alphaTest: .45, side: THREE.DoubleSide, transparent: false })
    const conBrazos = []; for (let i = 0; i <= 6; i++) { const y = yS + .01 - i * .035; conBrazos.push({ y, ...Lm.anillo(y - .02, y + .02, .4, 'kc', true) }) }
    const espalda = perfilCuerpo(Lm, yS - .05, yW - .08, 10, .4)
    const onda = (u, v, s) => 1 + .022 * Math.sin(u * 61 + s) * (.4 + v) + .012 * Math.sin(u * 23 + v * 5 + s)
    // faldones (de abajo arriba: el de encima tapa el arranque del de debajo)
    for (let i = 2; i >= 0; i--) { const yT = yS - .05 - i * L * .27, yB = yT - L * .42 - (i === 2 ? .04 : 0)
      g.add(M(rejilla(40, 7, (u, v) => { const y = yT - (yT - yB) * v, E = anilloEn(espalda, Math.max(y, yW - .08)), th = Math.PI + (u - .5) * 2 * (1.12 + .3 * v), k = (1.1 + .045 * i + .2 * v * v) * onda(u, v, i)
        return new V3(E.cx + Math.sin(th) * E.rx * k, y, E.cz + Math.cos(th) * E.rz * k) }), junco)) }
    // esclavina: alrededor del cuello y por fuera de los hombros, abierta delante
    g.add(M(rejilla(56, 7, (u, v) => { const y = yS + .012 - v * .19, E = anilloEn(conBrazos, Math.max(y, conBrazos[6].y)), th = Math.PI + (u - .5) * 2 * 2.05, k = (1.05 + .1 * v) * onda(u, v, 7)
      return new V3(E.cx + Math.sin(th) * E.rx * k, y, E.cz + Math.cos(th) * E.rz * k) }), junco))
    // cordon de junco trenzado al cuello
    const E0 = anilloEn(conBrazos, yS + .012), cu = []; for (let i = 0; i <= 30; i++) { const th = Math.PI + (i / 30 - .5) * 2 * 2.3; cu.push(new V3(E0.cx + Math.sin(th) * E0.rx * 1.08, yS + .014, E0.cz + Math.cos(th) * E0.rz * 1.08)) }
    g.add(M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cu), 60, .01, 7), tmat(T.wood('#6e5426', 162, [8, 1]), { roughness: 1 })))
    return { g } } })

// ---- faixa (faja de la cintura, roja, anudada al costado) ----
def('faixa', { label: 'Faixa', slot: 'cintura', occ: [], mount: 'bone', bone: 'Hips', note: 'cintura', cam: Lm => ({ t: new V3(0, Lm.hips.y + .02, 0), d: 1.4, az: .5, el: .12, fov: 28 }),
  build(Lm, o = {}) { const g = new THREE.Group(), yF = Lm.hips.y + .06
    // Pegada al cuerpo: contorno arriba y abajo de la banda (sigue la forma de la cintura) con 5 mm de holgura y casi sin
    // bombeo. Antes iba a 1 cm, con un 4 % de bombeo y 7 cm de alto: de lado parecia un flotador.
    const Ca = Lm.contorno(yF + .005, yF + .045), Cb = Lm.contorno(yF - .045, yF - .005)
    const R = (t, v) => Ca.r(t) * (1 - v) + Cb.r(t) * v + .005, cx = (Ca.cx + Cb.cx) / 2, cz = (Ca.cz + Cb.cz) / 2
    const tela = tmat(T.cloth(o.col || '#a51d24', 171, [12, 1]), { roughness: .9 })
    const punto = (t, y, k = 1, v = .5) => new V3(cx + Math.sin(t) * R(t, v) * k, y, cz + Math.cos(t) * R(t, v) * k)
    const banda = M(rejilla(72, 4, (u, v) => punto(u * Math.PI * 2, yF + .03 - v * .06, 1 + .012 * Math.sin(v * Math.PI), v)), tela); banda.material.side = THREE.DoubleSide; g.add(banda)
    const vivo = mat(0x6e1015, { roughness: .9 })
    for (const [yy, v] of [[yF + .024, .1], [yF - .024, .9]]) { const pts = []; for (let i = 0; i < 72; i++) pts.push(punto(i / 72 * Math.PI * 2, yy, 1.012, v)); g.add(M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 144, .0026, 5, true), vivo)) }
    // nudo delante, a la izquierda, y las dos puntas con flecos
    const th = .75, pn = punto(th, yF, 1.04), px = pn.x, pz = pn.z
    const nudo = M(new THREE.SphereGeometry(.02, 14, 10), tela, [px, yF, pz]); nudo.scale.set(1.1, .9, .55); g.add(nudo)
    for (const [dx, largo, gi] of [[-.012, .12, .12], [.014, .1, -.1]]) { const p = M(new RoundedBoxGeometry(.036, largo, .008, 2, .003), tela, [px + dx, yF - largo / 2 - .01, pz + .008], [0, th, gi]); g.add(p)
      for (let k = 0; k < 6; k++) g.add(M(new THREE.CylinderGeometry(.0016, .0016, .022, 4), mat(0xd9a03a, { roughness: .8 }), [px + dx - .015 + k * .006 + Math.sin(gi) * largo * .5, yF - largo - .02, pz + .008], [0, 0, gi])) }
    return { g } } })

// ---- cabaza (calabaza de peregrino colgada del cinto) ----
function cabazaG(R = 1) { const g = new THREE.Group()
  g.add(M(smoothLathe([[0, 0], [.03, .006], [.043, .03], [.041, .052], [.026, .072], [.018, .082], [.025, .097], [.027, .11], [.019, .125], [.009, .133], [0, .134]].map(([r, y]) => [r * R, y * R]), 40, 28), tmat(T.wood('#c27a35', 181, [2, 1]), { roughness: .45 })))
  g.add(M(new THREE.CylinderGeometry(.008 * R, .01 * R, .02 * R, 10), tmat(T.wood('#7a5530', 182, [1, 1])), [0, .14 * R, 0]))
  g.add(M(new THREE.TorusGeometry(.019 * R, .0035 * R, 6, 18), mat(0x8a2a22, { roughness: .8 }), [0, .081 * R, 0], [Math.PI / 2, 0, 0]))
  return g }
def('cabaza', { label: 'Cabaza', slot: 'cintura', occ: [], mount: 'bone', bone: 'Hips', note: 'cintura', cam: Lm => ({ t: new V3(-.08, Lm.hips.y - .05, -.1), d: 1.2, az: Math.PI + .9, el: .12, fov: 28 }),
  build(Lm, o = {}) { if (o.thumb) return { g: cabazaG(1) }
    const g = new THREE.Group(), yF = Lm.hips.y + .055, C = Lm.contorno(yF - .04, yF + .04), R = t => C.r(t) + .007
    const cordel = mat(0x6b4a2b, { roughness: .9 }), E = { cx: C.cx, cz: C.cz }
    const pts = []; for (let i = 0; i < 72; i++) { const t = i / 72 * Math.PI * 2; pts.push(new V3(C.cx + Math.sin(t) * R(t), yF, C.cz + Math.cos(t) * R(t))) }
    g.add(M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 144, .004, 5, true), cordel))
    const th = Math.PI + .65, rx = R(th), rz = R(th), px = E.cx + Math.sin(th) * (rx + .028), pz = E.cz + Math.cos(th) * (rz + .028), yG = yF - .2
    const cz = cabazaG(1); cz.position.set(px, yG, pz); cz.rotation.set(.05, 0, -.08); g.add(cz)
    g.add(M(tubeG([[E.cx + Math.sin(th) * rx, yF, E.cz + Math.cos(th) * rz], [px, yF - .03, pz], [px, yG + .15, pz]], .0025, 12, 5), mat(0x8a2a22, { roughness: .8 })))
    return { g } } })

// ---------------- objetos de mano hechos por codigo (sin modelo de Blender propio) ----------------
// No tienen clip de agarre suyo: usan el horneado mas parecido (`agarre`) y se cuelgan del MISMO hueso y en el MISMO
// marco que su objeto de Blender (el nodo it_<agarre> de hold_<Ch>.glb). En ese marco el puno esta en el origen,
// el mango va por -Z hacia arriba (en Blender +Y arriba, exportado con +Y -> -Z) y +X sale del dorso de la mano.
// Aqui se construyen con +Y arriba (mas comodo) y `enMarcoDeAgarre` los gira. El radio del mango en el puno es el
// del objeto horneado (bordon 17,5 mm): la mano cierra sobre el sin atravesarlo ni quedar hueca.
const madera = (base, seed) => tmat(T.wood(base, seed, [1, 4]), { roughness: .8 })
const hierro = () => mat(0x56595e, { metalness: .75, roughness: .38 })
function enMarcoDeAgarre(g, giro = 0) { const h = new THREE.Group(); g.rotation.y = giro; h.add(g); h.rotation.x = -Math.PI / 2; return h }
function mango(y0, y1, r0, r1, m) { return M(polyLathe([[0, y0], [r0, y0 + .004], [r0, y0 + .01], [r1, y1 - .01], [r1 * .9, y1], [0, y1 + .002]], 14), m) }
function hoja(contorno, grosor, m) { const s = new THREE.Shape(); contorno.forEach(([u, v], i) => i ? s.lineTo(u, v) : s.moveTo(u, v)); s.closePath()
  const geo = new THREE.ExtrudeGeometry(s, { depth: grosor, bevelEnabled: true, bevelThickness: grosor * .3, bevelSize: .003, bevelSegments: 1, curveSegments: 4 }); geo.translate(0, 0, -grosor / 2); geo.computeVertexNormals(); return M(geo, m) }

// Sacho (azada gallega): mango de ~1,15 m y hoja de hierro ancha casi perpendicular, arriba.
function sacho() { const g = new THREE.Group(), w = madera('#8a6236', 191)
  g.add(mango(-.78, .36, .0172, .0172, w))
  g.add(M(new THREE.CylinderGeometry(.024, .024, .065, 14), hierro(), [0, .33, 0]))
  const p = hoja([[-.035, .02], [-.04, -.03], [-.095, -.19], [.095, -.19], [.04, -.03], [.035, .02]], .007, hierro())
  p.rotation.set(Math.PI / 2 - .35, 0, 0); p.position.set(0, .33, .02); g.add(p)
  return enMarcoDeAgarre(g, Math.PI / 2) }
// Hacha vikinga (barbuda, de mango largo): hoja de un solo filo con barba y una tira de cuero en el puno.
function hacha() { const g = new THREE.Group(), w = madera('#6b4423', 192)
  g.add(mango(-.46, .6, .0172, .018, w))
  g.add(M(new THREE.CylinderGeometry(.021, .023, .075, 12), hierro(), [0, .53, 0]))
  g.add(hoja([[.015, .565], [.09, .575], [.165, .61], [.175, .53], [.16, .45], [.12, .41], [.07, .44], [.015, .5]], .01, hierro()))
  return enMarcoDeAgarre(g, Math.PI / 2) }
// Maza: porra de madera que engorda hacia la cabeza, con nudos. Con el agarre del bordon (brazo bajo, junto al
// cuerpo): con el del paraguas la cabeza de la porra quedaba delante de la cara.
function maza() { const g = new THREE.Group(), w = madera('#7a5530', 193)
  g.add(M(smoothLathe([[0, -.13], [.0145, -.125], [.0158, -.06], [.016, .05], [.024, .2], [.042, .34], [.052, .42], [.048, .47], [.03, .5], [0, .505]], 40, 16), w))
  for (const [a, y] of [[.3, .28], [2.1, .36], [4.0, .44], [5.2, .33]]) { const r = .03 + (y - .2) * .1; g.add(M(new THREE.SphereGeometry(.011, 8, 6), madera('#5e3f22', 194), [Math.cos(a) * r, y, Math.sin(a) * r])) }
  return enMarcoDeAgarre(g) }

/** Objetos de mano hechos por codigo: el agarre horneado que toman prestado y su construccion (una vez, compartida). */
export const MANO_PROCEDURAL = { sacho: { agarre: 'bordon', crear: sacho }, hacha: { agarre: 'bordon', crear: hacha }, maza: { agarre: 'bordon', crear: maza } }
const _hechos = {}
/** El objeto listo para colgar (comparte geometria y materiales entre avatares: no se libera). */
export function objetoDeMano(n) { return (_hechos[n] = _hechos[n] || MANO_PROCEDURAL[n].crear()).clone(true) }
