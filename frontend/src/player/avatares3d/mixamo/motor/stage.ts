/* eslint-disable */
// @ts-nocheck
// GENERADO por frontend/scripts/portar-motor-mixamo.mjs a partir de
// sim/playwright-bench/harness/mixamo4/stage.js. NO se edita a mano: se vuelve a generar.
import * as THREE from 'three'
import * as SU from 'three/examples/jsm/utils/SkeletonUtils.js'
export { THREE, SU }
export const V3 = THREE.Vector3, Q4 = THREE.Quaternion, M4 = THREE.Matrix4

/** Los modelos base de cada personaje (los registra el cargador al leer su GLB). */
const bases = {}
export function registrarBase(id, m) {
  bases[id] = m
  m.updateMatrixWorld(true); let h; m.traverse(n => { if (n.name === 'mixamorigHips') h = n })
  const inv = h.parent.matrixWorld.clone().invert(), d = new V3(0, 1, 0).applyMatrix4(inv).sub(new V3(0, 0, 0).applyMatrix4(inv))
  m.userData.hips = { rest: h.position.clone(), d }
}
export const hayBase = (id) => !!bases[id]
export const baseDe = (id) => bases[id]

/** La altura del modelo (1,75 m) se mide una vez por personaje: medirla cuesta tanto como pintarlo. */
const escalas = {}
function escalaDe(id, model) {
  if (escalas[id] === undefined) {
    const b = new THREE.Box3().setFromObject(model, true)
    escalas[id] = 1.75 / Math.max(b.max.y - b.min.y, 1e-4)
  }
  return escalas[id]
}

export function cloneModel(id) {
  const _rug = cloneModel._rug || (cloneModel._rug = new WeakMap())
  const rugosidadDeBrillo = t => {
  if (_rug.has(t)) return _rug.get(t)
  const img = t.image; let out = t
  if (img && img.width && typeof document !== 'undefined') {
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const g = cv.getContext('2d')
    g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, cv.width, cv.height), p = d.data
    for (let i = 0; i < p.length; i += 4) { const b = p[i + 1] / 255, v = 255 * (1 - 0.85 * b * b * b); p[i] = p[i + 1] = p[i + 2] = v }
    g.putImageData(d, 0, 0); out = new THREE.CanvasTexture(cv); out.flipY = t.flipY; out.wrapS = t.wrapS; out.wrapT = t.wrapT; out.channel = t.channel; out.colorSpace = THREE.NoColorSpace
  }
  _rug.set(t, out); return out
  }
  const model = SU.clone(bases[id]); model.userData.hips = bases[id].userData.hips
  const bones = {}, meshes = []
  model.traverse(n => { if (n.isBone) bones[n.name] = n
    if (n.isSkinnedMesh) { n.frustumCulled = false; n.castShadow = true; n.receiveShadow = true
      const mats = [].concat(n.material).map(m => m.clone()); n.material = Array.isArray(n.material) ? mats : mats[0]
      for (const m of mats) { const nm = n.name + ' ' + m.name; const hair = /lash|hair|beard|brow/i.test(nm)
        if (hair) { m.transparent = false; m.alphaTest = 0.5; m.depthWrite = true; m.side = THREE.DoubleSide } else { m.transparent = false; m.alphaTest = 0; m.depthWrite = true; m.side = THREE.FrontSide }
        // 20/11 realismo: el mapa de brillo de Mixamo (canal de rugosidad) se conserva en el cuerpo: ojos, labios y piel
        // con su brillo propio (todo a 0,8 mate dejaba los ojos apagados y la piel de cera). Sin metal: la textura no lo lleva.
        m.metalness = 0; m.metalnessMap = null
        if (hair || !m.roughnessMap) { m.envMapIntensity = 0.5; m.roughness = Math.max(m.roughness, 0.8); m.roughnessMap = null } else { m.envMapIntensity = 0.42; m.roughness = 1; m.roughnessMap = rugosidadDeBrillo(m.roughnessMap) }
        for (const t of [m.map, m.normalMap, m.roughnessMap]) if (t) t.anisotropy = 4 }
      meshes.push(n) } })
  model.updateMatrixWorld(true)
  model.scale.multiplyScalar(escalaDe(id, model))
  model.updateMatrixWorld(true)
  return { model, bones, meshes }
}
