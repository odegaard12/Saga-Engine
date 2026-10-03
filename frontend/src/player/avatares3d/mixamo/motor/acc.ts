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
  const cv = tmat(T.cloth(o.col || '#7a6a3e', 61, [2, 2.5]), { roughness: .95 }), cd = tmat(T.leather(o.dark || '#4a3622', 62, [2, 2]), { roughness: .9 })
  g.add(M(new RoundedBoxGeometry(w, h, d, 5, .05), cv, [0, yC, zc]))
  const flap = M(new RoundedBoxGeometry(w * 1.03, h * .36, d * 1.12, 5, .05), cd, [0, yC + h / 2 - h * .15, zc - .003]); flap.rotation.x = .05; g.add(flap)
  g.add(M(new RoundedBoxGeometry(w * .72, h * .4, d * .42, 4, .03), cv, [0, yC - h * .13, zc - d / 2 - .03]))
  g.add(M(new RoundedBoxGeometry(w * .72, h * .12, d * .44, 3, .02), cd, [0, yC - h * .13 + h * .13, zc - d / 2 - .03]))
  for (const s of [-1, 1]) { g.add(M(new RoundedBoxGeometry(.025, .09, .012, 2, .004), cd, [s * w * .24, yC + h * .1, zc - d / 2 - .066])); g.add(M(new RoundedBoxGeometry(.02, .016, .014, 2, .003), brass(), [s * w * .24, yC + h * .02, zc - d / 2 - .07])) }
  const roll = o.roll || '#7d8a5a'; g.add(M(new THREE.CylinderGeometry(.062 * k, .062 * k, w * 1.1, 24), tmat(T.cloth(roll, 63, [3, 1]), { roughness: .95 }), [0, yC + h / 2 + .052 * k, zc], [0, 0, Math.PI / 2]))
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
    g.add(M(new RoundedBoxGeometry(.03, .022, .02, 2, .004), brass(), rp[10].clone().add(new V3(0, 0, -.004)))) }
  return { g } }
def('mochila', { label: 'Mochila', slot: 'espalda', occ: [], mount: 'bone', bone: 'Spine2', note: 'espalda', cam: Lm => ({ t: new V3(0, Lm.c.y - .02, -.2), d: 1.5, az: Math.PI - .5, el: .1, fov: 28 }), build: (Lm, o = {}) => mochilaBuild(Lm, Object.assign({ mat: false }, o)) })
def('mochilaP', { label: 'Mochila de peregrino', slot: 'espalda', occ: [], mount: 'bone', bone: 'Spine2', note: 'espalda', cam: Lm => ({ t: new V3(0, Lm.c.y - .02, -.2), d: 1.5, az: Math.PI + .5, el: .1, fov: 28 }),
  build: (Lm, o = {}) => mochilaBuild(Lm, Object.assign({ col: '#3d5a3a', dark: '#2e2a22', roll: '#c9702a', mat: true, vieira: true }, o)) })

// ---- casco vikingo ----
def('casco', { label: 'Casco vikingo', slot: 'cabeza', occ: [], mount: 'bone', bone: 'Head', hide: ['hair'], note: 'cabeza', cam: Lm => ({ t: new V3(0, Lm.top - .05, Lm.headZ), d: .95, az: .55, el: .1, fov: 28 }),
  build(Lm, o = {}) { const g = new THREE.Group(), R = Lm.headRb + .016, cy = Lm.topB + .013 - R, cz = Lm.headZ
    const iron = tmat(T.leather('#8e9198', 71, [2, 2]), { metalness: .55, roughness: .42 }), bronze = mat(0xa8742c, { metalness: .65, roughness: .38 })
    const dome = M(smoothLathe([[0, R * 1.04], [R * .4, R * 1.0], [R * .75, R * .76], [R * .96, R * .38], [R, 0], [R * .985, -R * .02]], 48, 56), iron, [0, cy, cz]); dome.scale.set(1, 1, 1.1); dome.material.side = THREE.DoubleSide; g.add(dome)
    const band = M(new THREE.TorusGeometry(R * 1.0, .0105, 10, 56), bronze, [0, cy + .002, cz], [Math.PI / 2, 0, 0]); band.scale.set(1, 1.1, 1); g.add(band)
    const crest = M(new THREE.TorusGeometry(R * .99, .0085, 8, 40, Math.PI), bronze, [0, cy, cz], [0, Math.PI / 2, 0]); crest.scale.set(1, 1, 1.08); g.add(crest)
    for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; g.add(M(new THREE.SphereGeometry(.0055, 8, 6), bronze, [Math.sin(a) * R * 1.0, cy + .002, cz + Math.cos(a) * R * 1.1])) }
    const nas = new THREE.Shape(); nas.moveTo(-.013, 0); nas.lineTo(.013, 0); nas.lineTo(.008, -.075); nas.quadraticCurveTo(0, -.088, -.008, -.075); nas.closePath()
    const ng = new THREE.ExtrudeGeometry(nas, { depth: .005, bevelEnabled: true, bevelSize: .002, bevelThickness: .002, bevelSegments: 1 }); g.add(M(ng, iron, [0, cy + .006, cz + R * 1.1 + .004], [-.12, 0, 0]))
    for (const s of [-1, 1]) { const cp = [[s * (R * .98), cy + .012, cz + .0], [s * (R + .04), cy + .025, cz + .006], [s * (R + .08), cy + .06, cz + .015], [s * (R + .1), cy + .115, cz + .03], [s * (R + .085), cy + .17, cz + .05]]
      g.add(M(tubeTaper(cp, 36, 12, t => .02 * (1 - .88 * Math.pow(t, 1.2))), tmat(T.wood('#e5d8b8', 73 + s, [1, 3]), { roughness: .5 })))
      g.add(M(new THREE.CylinderGeometry(.027, .029, .026, 18), bronze, [s * (R * .98 + .018), cy + .014, cz], [0, 0, -s * Math.PI / 2 + s * .12])); for (const tt of [.3, .5]) { const p = new THREE.CatmullRomCurve3(cp.map(q => new V3(...q))).getPointAt(tt); g.add(M(new THREE.TorusGeometry(.0225 * (1 - .88 * Math.pow(tt, 1.2)) * 1.05, .0028, 6, 16), mat(0x3a2a18), p.toArray(), [Math.PI / 2 * .9, 0, s * (.2)])) } }
    return { g, hide: ['hair'] } } })

// ---- boina ----
def('boina', { label: 'Boina', slot: 'cabeza', occ: [], mount: 'bone', bone: 'Head', note: 'cabeza', cam: Lm => ({ t: new V3(0, Lm.top - .04, Lm.headZ), d: .9, az: .6, el: .12, fov: 28 }),
  build(Lm, o = {}) { const g = new THREE.Group(), r0 = Lm.headRh + .012, rb = r0 * 1.27, yR = Lm.topH - .085
    const wool = tmat(T.wool(o.col || '#1d2331', 81, [4, 4]), { roughness: 1, bumpMap: null })
    const b = M(smoothLathe([[r0, 0], [r0 * 1.1, .004], [rb * .93, .017], [rb, .036], [rb * .95, .056], [rb * .72, .073], [rb * .4, .084], [rb * .16, .088], [0, .089]], 70, 56), wool); b.material.side = THREE.DoubleSide
    const bw = new THREE.Group(); bw.add(b); bw.add(M(new THREE.CylinderGeometry(.0065, .008, .024, 10), wool, [0, .097, 0]))
    bw.add(M(new THREE.TorusGeometry(r0 * 1.02, .0045, 8, 40), tmat(T.leather('#2a1a10', 82, [4, 1])), [0, .002, 0], [Math.PI / 2, 0, 0]))
    bw.position.set(-.012, yR, Lm.headZ + .0); bw.rotation.set(.07, 0, -.2); g.add(bw)
    return { g } } })

// ---- sombrero de peregrino ----
def('sombrero', { label: 'Sombrero de peregrino', slot: 'cabeza', occ: [], mount: 'bone', bone: 'Head', note: 'cabeza', cam: Lm => ({ t: new V3(0, Lm.top - .02, Lm.headZ), d: 1.1, az: .55, el: .2, fov: 28 }),
  build(Lm, o = {}) { const g = new THREE.Group(), r0 = Lm.headRh + .016, yR = Lm.topH - .1
    const felt = tmat(T.wool(o.col || '#5a4128', 91, [4, 4]), { roughness: 1 }), hg = new THREE.Group()
    hg.add(M(smoothLathe([[0, .128], [r0 * .6, .125], [r0 * .93, .112], [r0 * 1.02, .088], [r0 * 1.03, .03], [r0 * 1.0, 0]], 40, 56), felt))
    const brim = M(polyLathe([[r0 * .98, .004], [.17, .0], [.215, -.012], [.255, -.004], [.258, .004], [.255, .008], [.215, .0], [.17, .009], [r0 * .98, .012]], 64), felt); brim.material.side = THREE.DoubleSide; hg.add(brim)
    hg.add(M(new THREE.TorusGeometry(r0 * 1.03, .0085, 8, 56), tmat(T.leather('#2a1a10', 92, [6, 1])), [0, .03, 0], [Math.PI / 2, 0, 0]))
    hg.add(M(new RoundedBoxGeometry(.03, .026, .008, 2, .003), brass(), [0, .03, r0 * 1.04]))
    const sc = scallop(.052); sc.position.set(0, .052, r0 * 1.04 + .004); sc.rotation.set(-.12, 0, 0); hg.add(sc)
    hg.position.set(0, yR, Lm.headZ - .005); hg.rotation.set(.04, 0, 0); g.add(hg)
    return { g } } })

// ---- zocas ----
def('zocas', { label: 'Zocas', slot: 'pies', occ: [], mount: 'foot', note: 'pies', hide: ['shoe'], cam: Lm => ({ t: new V3(.08, .06, .08), d: 1.0, az: .7, el: .2, fov: 28 }),
  build(Lm, o = {}) { const parts = []; const wood = tmat(T.wood('#b88848', 121, [2, 2]), { roughness: .55 }), leather = tmat(T.leather('#4a2e1b', 122, [2, 2]), { roughness: .6 })
    for (const s of [-1, 1]) { const g = new THREE.Group(); parts.push({ g, bone: s > 0 ? 'LeftFoot' : 'RightFoot' }); const f = Lm.foot[s > 0 ? 'L' : 'R'], len = f.len, w = f.w, cx = f.cx, z0 = f.z0, hT = f.top + .006
      const sh = new THREE.Shape(), z1 = z0 + len, hw = w / 2
      sh.moveTo(0, -z0 + .0); sh.bezierCurveTo(hw * .95, -z0, hw * 1.05, -(z0 + len * .55), hw * .85, -(z0 + len * .85)); sh.bezierCurveTo(hw * .6, -(z1 + .012), -hw * .5, -(z1 + .012), -hw * .8, -(z0 + len * .85)); sh.bezierCurveTo(-hw * 1.05, -(z0 + len * .55), -hw * .95, -z0, 0, -z0)
      const eg = new THREE.ExtrudeGeometry(sh, { depth: hT, bevelEnabled: true, bevelSize: .006, bevelThickness: .004, bevelSegments: 3, curveSegments: 18 }); eg.rotateX(-Math.PI / 2); eg.translate(cx, 0, 0)
      const sole = M(eg, wood); g.add(sole)
      // taco rebajado (hueco bajo el arco)
      const cap = M(new THREE.SphereGeometry(1, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), leather, [cx, hT, z0 + len * .74]); cap.scale.set(hw * .9, .042, len * .26); g.add(cap)
      const strap = M(new THREE.TorusGeometry(hw * .96, .008, 8, 24, Math.PI), leather, [cx, hT + .0, z0 + len * .42], [0, Math.PI / 2, 0]); strap.scale.set(.0 + 1, 1, 1); strap.rotation.set(0, Math.PI / 2, 0); strap.scale.set(1, .55, 1); g.add(strap)
      const heel = M(new THREE.TorusGeometry(hw * .7, .006, 6, 20, Math.PI), leather, [cx, hT, z0 + hw * .72], [Math.PI / 2, 0, Math.PI]); g.add(heel) }
    return { parts, hide: ['shoe'] } } })
