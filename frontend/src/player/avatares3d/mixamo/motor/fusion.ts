/* eslint-disable */
// @ts-nocheck
// GENERADO por frontend/scripts/portar-motor-mixamo.mjs a partir de
// sim/playwright-bench/harness/mixamo4/fusion.js. NO se edita a mano: se vuelve a generar.
// Fusion de mallas estaticas: los objetos (casco, bordon, gaita...) estan hechos de decenas de piezas pequenas
// y cada una era una llamada de dibujo. Aqui las piezas que comparten material se juntan en UNA malla
// (con su posicion ya horneada respecto a la raiz del objeto): un avatar con casco y baston pasaba de ~45
// llamadas de dibujo a ~10. No toca mallas con piel (el cuerpo) ni con varios materiales.
import { THREE } from './stage'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** Copia de la geometria con posicion, normal y uv en Float32 (las cuantizadas del GLB no admiten transformarse en sitio). */
function enFloat(g) {
  const o = new THREE.BufferGeometry()
  for (const nombre of ['position', 'normal', 'uv']) {
    const a = g.attributes[nombre]; if (!a) continue
    const n = a.itemSize, v = new Float32Array(a.count * n)
    for (let i = 0; i < a.count; i++) { v[i * n] = a.getX(i); v[i * n + 1] = a.getY(i); if (n > 2) v[i * n + 2] = a.getZ(i) }
    o.setAttribute(nombre, new THREE.BufferAttribute(v, n))
  }
  if (g.index) o.setIndex(new THREE.BufferAttribute(Uint32Array.from(g.index.array), 1))
  else { const n = g.attributes.position.count, ix = new Uint32Array(n); for (let i = 0; i < n; i++) ix[i] = i; o.setIndex(new THREE.BufferAttribute(ix, 1)) }
  if (!o.attributes.normal) o.computeVertexNormals()
  return o
}

/**
 * Junta, bajo `raiz`, todas las mallas estaticas que comparten material. Las piezas se sustituyen por las
 * fusionadas, colocadas igual (su transformacion respecto a `raiz` queda horneada en los vertices).
 * Devuelve `raiz`. Si no hay nada que juntar, no cambia nada.
 */
export function fusionar(raiz) {
  raiz.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(raiz.matrixWorld).invert()
  const cubos = new Map(), viejas = []
  raiz.traverse(o => {
    if (o === raiz || !o.isMesh || o.isSkinnedMesh || Array.isArray(o.material) || !o.geometry.attributes.position) return
    const g = enFloat(o.geometry), M = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld); g.applyMatrix4(M)
    if (M.determinant() < 0) { const a = g.index.array; for (let i = 0; i + 2 < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t } }   // espejo: el sentido de las caras se invierte
    const clave = o.material.uuid + '|' + (g.attributes.uv ? 'uv' : 'sinuv') + '|' + (o.castShadow ? 1 : 0)
    let c = cubos.get(clave); if (!c) cubos.set(clave, c = { material: o.material, geos: [], sombra: o.castShadow })
    c.geos.push(g); viejas.push(o)
  })
  if (viejas.length < 2) return raiz
  for (const o of viejas) o.parent && o.parent.remove(o)
  for (const c of cubos.values()) {
    const g = c.geos.length === 1 ? c.geos[0] : mergeGeometries(c.geos, false)
    if (!g) continue
    const m = new THREE.Mesh(g, c.material); m.castShadow = c.sombra; raiz.add(m)
  }
  return raiz
}
