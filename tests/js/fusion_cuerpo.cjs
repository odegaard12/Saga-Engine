// 23/11 «personajes con menos dibujos»: la fusión de las mallas de un cuerpo (fusionCuerpo.ts) sobre un cuerpo de juguete con
// el mismo problema que los GLB reales (gltfpack mete la escala de la cuantización en las matrices inversas de los huesos).
// Usa el look.ts REAL del motor (tinte y pelo) para que esta prueba falle si el motor cambia lo que parchea la fusión.
// Vuelca un JSON a tests/test_fusion_cuerpo.py.
const path = require('path')
const RAIZ = path.resolve(__dirname, '..', '..')
const FRONT = path.join(RAIZ, 'frontend')
const THREE = require(path.join(FRONT, 'node_modules', 'three', 'build', 'three.cjs'))
const { crearCargador } = require('./cargarTs.cjs')
const externo = (n) => {
  if (n === 'three') return THREE
  if (n.startsWith('three/examples')) return {}
  throw new Error('import no permitido: ' + n)
}
const cargar = crearCargador({ Math, Number, String, Array, Set, Map, WeakMap, WeakSet, Boolean, Object, JSON, Infinity, Error, Float32Array, Uint8Array, Uint16Array, Uint32Array, Int16Array, isFinite: Number.isFinite }, { externo })
const MIX = path.join(FRONT, 'src', 'player', 'avatares3d', 'mixamo')
const F = cargar(path.join(MIX, 'fusionCuerpo.ts'))
const LOOK = cargar(path.join(MIX, 'motor', 'look.ts'))

const out = {}
const casi = (a, b, e = 1e-5) => Math.abs(a - b) <= e

// ---------- un cuerpo de juguete ----------
const huesos = [new THREE.Bone(), new THREE.Bone()]
huesos[0].name = 'hips'
huesos[1].name = 'head'
huesos[1].position.set(0, 1, 0)
huesos[0].add(huesos[1])
const armature = new THREE.Group()
armature.add(huesos[0])
const modelo = new THREE.Group()
modelo.add(armature)
modelo.updateMatrixWorld(true)
const textura = new THREE.Texture()
const otraTextura = new THREE.Texture()

/** Una malla cuyas posiciones "verdaderas" son `real` y que, como en el GLB, las trae cuantizadas con la escala `s` y el desplazamiento `t` (metidos en sus IBM). */
function malla(nombre, real, s, t, indices, material, { aRopa = null, huesoDe = 0, entrelazar = false } = {}) {
  const n = real.length / 3
  const pos = new Int16Array(n * 3)
  for (let i = 0; i < n * 3; i += 1) pos[i] = Math.round(((real[i] - t[i % 3]) / s) * 32767)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3, true))
  const nor = new Int16Array(n * 3)
  for (let i = 0; i < n; i += 1) nor[i * 3 + 2] = 32767
  if (entrelazar) {
    // como los GLB de gltfpack: el atributo es una ventana (paso 4, desplazamiento 1) de un búfer compartido
    const buf = new Int16Array(n * 4)
    for (let i = 0; i < n; i += 1) buf.set(nor.subarray(i * 3, i * 3 + 3), i * 4 + 1)
    g.setAttribute('normal', new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(buf, 4), 3, 1, true))
  } else g.setAttribute('normal', new THREE.BufferAttribute(nor, 3, true))
  g.setAttribute('uv', new THREE.BufferAttribute(new Uint16Array(n * 2).fill(1000), 2, true))
  const si = new Uint8Array(n * 4)
  const sw = new Uint8Array(n * 4)
  for (let i = 0; i < n; i += 1) {
    si[i * 4] = huesoDe
    sw[i * 4] = 255
  }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4))
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4, true))
  if (aRopa) g.setAttribute('aRopa', new THREE.BufferAttribute(Float32Array.from(aRopa), 1))
  g.setIndex(new THREE.BufferAttribute(Uint32Array.from(indices), 1))
  g.userData = { espejo: true }
  const m = new THREE.SkinnedMesh(g, material)
  m.name = nombre
  const Mq = new THREE.Matrix4().makeScale(s, s, s).setPosition(t[0], t[1], t[2])
  // IBM verdaderas (cada hueso: su inversa de reposo) por la cuantización de ESTA malla
  const ibm = huesos.map((h) => h.matrixWorld.clone().invert().multiply(Mq))
  m.bind(new THREE.Skeleton(huesos, ibm), new THREE.Matrix4())
  modelo.add(m)
  m.updateMatrixWorld(true)
  return m
}
const triangulo = [0, 1, 2]
const real = (dx) => [0 + dx, 0, 0, 0.5 + dx, 0, 0.2, 0, 0.7 + dx, 0.1]
const material = (extra = {}) => {
  const m = new THREE.MeshPhysicalMaterial({ map: textura, roughness: 1 })
  Object.assign(m, extra)
  return m
}

// ---------- vestirlo con el motor real ----------
const tinte = (m, p, abajo) => LOOK.look(m, p, abajo)
const mBody = material()
const mPants = material()
const mShirt = material()
const mShoes = material()
const mHoodie = material()
const mOtra = material({ map: otraTextura })
const mHair = material({ roughness: 0.8 })
const mBrow = material({ roughness: 0.8 })
const mLash = material({ roughness: 0.8 })
for (const m of [mHair, mBrow, mLash]) {
  m.side = THREE.DoubleSide
  LOOK.suavizar(m, true)
}
const colorTop = { hue: 10, tint: '#ff0000', amt: 1 }
const colorPants = { hue: 200, sat: 1.2 }
const colorShoes = { tint: '#00ff00', amt: 0.5 }
const colorHair = { tint: '#442200', amt: 1 }
tinte(mShirt, colorTop)
tinte(mPants, colorPants)
tinte(mShoes, colorShoes)
// la sudadera de dos partes (Ch02): arriba top, abajo pantalón, mezcla por vértice
LOOK.lookDoble(mHoodie)
tinte(mHoodie, colorTop, colorPants)
tinte(mHair, colorHair)
tinte(mBrow, colorHair)

const body = malla('ChT_Body', real(0), 1.0, [0, 0, 0], triangulo, mBody)
const pants = malla('ChT_Pants', real(1), 0.5, [0.1, -0.4, 0], triangulo, mPants, { entrelazar: true })
const shirt = malla('ChT_Shirt', real(2), 0.25, [0, 0.3, 0.05], triangulo, mShirt)
const shoes = malla('ChT_Shoes', real(3), 0.3, [0.02, -0.9, 0], triangulo, mShoes)
const hood = malla('ChT_Hoodie', real(4), 0.4, [0, 0.2, 0], triangulo, mHoodie, { aRopa: [0, 0.5, 1] })
const otra = malla('ChT_Otra', real(5), 0.4, [0, 0.2, 0], triangulo, mOtra)
const hair = malla('ChT_Hair', real(6), 0.2, [0, 0.8, 0], triangulo, mHair)
const brow = malla('ChT_Brow', real(7), 0.1, [0, 0.9, 0], triangulo, mBrow)
const lash = malla('ChT_Lash', real(8), 0.1, [0, 0.95, 0], triangulo, mLash)
const todas = [body, pants, shirt, shoes, hood, otra, hair, brow, lash]
const rol = { ChT_Body: 'skin', ChT_Pants: 'cloth', ChT_Shirt: 'cloth', ChT_Shoes: 'cloth', ChT_Hoodie: 'cloth', ChT_Otra: 'cloth', ChT_Hair: 'hair', ChT_Brow: 'hair', ChT_Lash: 'lash' }
const clave = { ChT_Body: 'Body', ChT_Pants: 'Pants', ChT_Shirt: 'Shirt', ChT_Shoes: 'Shoes', ChT_Hoodie: 'Hoodie', ChT_Otra: 'Otra', ChT_Hair: 'Hair', ChT_Brow: 'Brow', ChT_Lash: 'Eyelashes' }

// posición real de cada vértice tal como la dejaba el esqueleto PROPIO de su malla (referencia) y tras la fusión
const posicionSkin = (m, sk, i) => {
  const v = new THREE.Vector3().fromBufferAttribute(m.geometry.attributes.position, i)
  const a = sk.bones[0].matrixWorld.clone().multiply(sk.boneInverses[0])
  return v.applyMatrix4(a)
}
const antes = new Map(todas.map((m) => [m, [0, 1, 2].map((i) => posicionSkin(m, m.skeleton, i))]))
const esqueletosAntes = new Set(todas.map((m) => m.skeleton)).size

const av = {
  id: 'ChT',
  root: modelo,
  meshes: [...todas],
  parts: todas.map((m) => ({ mesh: m, mat: m.material, role: rol[m.name], key: clave[m.name] })),
  piezas: todas.map((m) => ({ mesh: m, kind: 'c', key: clave[m.name] })),
}
const registros = []
const r = F.fusionarCuerpo(av, { registrar: (g, partes, desp) => registros.push({ vertices: g.attributes.position.count, partes: partes.length, desp }) })
out.esqueletosAntes = esqueletosAntes
out.nuevas = r.nuevas.map((m) => m.name)
out.meshesDespues = av.meshes.map((m) => m.name)
out.hijosDelModelo = modelo.children.filter((o) => o.isSkinnedMesh).map((o) => o.name)
out.registros = registros
out.esqueletosDespues = new Set(av.meshes.map((m) => m.skeleton)).size
out.mismoEsqueletoLasNuevas = r.nuevas.every((m) => m.skeleton === r.nuevas[0].skeleton)
const cuerpo = r.nuevas.find((m) => m.name === 'ChT_cuerpo')
const pelo = r.nuevas.find((m) => m.name === 'ChT_pelo')
out.partesApuntanALoNuevo = av.parts.filter((p) => p.mesh === cuerpo || p.mesh === pelo).map((p) => p.key)
out.piezasApuntanALoNuevo = av.piezas.filter((p) => p.mesh === cuerpo || p.mesh === pelo).length

// geometría: misma posición skineada (con el esqueleto común) que con el esqueleto propio de cada malla
let maxDif = 0
let vert = 0
for (const [grupo, miembros] of [[cuerpo, [body, pants, shirt, shoes, hood]], [pelo, [hair, brow, lash]]]) {
  let o = 0
  for (const m of miembros) {
    for (let i = 0; i < 3; i += 1) {
      const p = posicionSkin(grupo, grupo.skeleton, o + i)
      const q = antes.get(m)[i]
      maxDif = Math.max(maxDif, p.distanceTo(q))
    }
    o += m.geometry.attributes.position.count
    vert += 3
  }
}
out.maxDifPosicion = maxDif
out.verticesComprobados = vert
out.indiceCuerpo = Array.from(cuerpo.geometry.index.array)
out.verticesCuerpo = cuerpo.geometry.attributes.position.count
out.tipoPosicion = cuerpo.geometry.attributes.position.array.constructor.name
out.atributosCuerpo = Object.keys(cuerpo.geometry.attributes).sort()
out.atributosPelo = Object.keys(pelo.geometry.attributes).sort()
out.aSlot = Array.from(cuerpo.geometry.attributes.aSlot.array)
out.aHair = Array.from(pelo.geometry.attributes.aHair.array)
out.sinARopaEnLoFusionado = !cuerpo.geometry.attributes.aRopa && !pelo.geometry.attributes.aRopa
const otraNueva = r.nuevas.find((m) => m.name === 'ChT_Otra')
out.otraTextura = { conservaMaterial: otraNueva.material === mOtra, esqueletoComun: otraNueva.skeleton === cuerpo.skeleton, vertices: otraNueva.geometry.attributes.position.count, sinAtributosNuevos: !otraNueva.geometry.attributes.aSlot && !otraNueva.geometry.attributes.aHair }

// materiales: los uniformes del tinte SON los de las partes originales (mismo objeto)
const sombreador = (m) => {
  const s = { uniforms: {}, vertexShader: 'void x(){\n#include <skinning_vertex>\n}', fragmentShader: '#include <clipping_planes_fragment>\n#include <alphatest_fragment>\nvoid main() {\n#include <map_fragment>\n}' }
  m.onBeforeCompile(s, null)
  return s
}
const sc = sombreador(cuerpo.material)
out.cuerpoComparteUniformes = {
  pants: sc.uniforms.uHue1 === mPants.userData.rc.a.hue && sc.uniforms.uSat1 === mPants.userData.rc.a.sat,
  top: sc.uniforms.uHue2 === mShirt.userData.rc.a.hue && sc.uniforms.uTint2 === mShirt.userData.rc.a.tint,
  shoes: sc.uniforms.uTint3 === mShoes.userData.rc.a.tint,
  sudaderaArriba: sc.uniforms.uHue4 === mHoodie.userData.rc.a.hue,
  sudaderaAbajo: sc.uniforms.uHue5 === mHoodie.userData.rc.b.hue,
}
out.cuerpoGlsl = {
  funciones: (sc.fragmentShader.match(/vec3 rcTinte\d\(/g) || []).length,
  seleccion: sc.fragmentShader.includes('float i0 = floor(s + 0.0001)'),
  atributo: sc.vertexShader.includes('attribute float aSlot') && sc.vertexShader.includes('vSlot = aSlot;'),
  antesDeMain: sc.fragmentShader.indexOf('vec3 rcTinte1(') < sc.fragmentShader.indexOf('void main()'),
  tintesAntesDelMapa: sc.fragmentShader.indexOf('#include <map_fragment>') < sc.fragmentShader.indexOf('float i0 = floor('),
  llavesIguales: (sc.fragmentShader.match(/\{/g) || []).length === (sc.fragmentShader.match(/\}/g) || []).length,
  parentesisIguales: (sc.fragmentShader.match(/\(/g) || []).length === (sc.fragmentShader.match(/\)/g) || []).length,
}
out.claveDeProgramaCuerpo = cuerpo.material.customProgramCacheKey()
// el pelo: el del motor, parcheado
const arrayPelo = pelo.material
const sp = sombreador(arrayPelo)
out.peloGlsl = {
  recorteSoloCabeza: sp.fragmentShader.includes('rcVer = 1.0 - k1 * k2 * step(1.5, vHair);') && !sp.fragmentShader.includes('rcVer = 1.0 - k1 * k2;'),
  tinteSoloPelo: sp.fragmentShader.includes('diffuseColor.rgb = vHair > 0.5 ?'),
  atributo: sp.vertexShader.includes('attribute float aHair') && sp.vertexShader.includes('vHair = aHair;'),
  conserva: sp.fragmentShader.includes('RC_PELO') && sp.fragmentShader.includes('uClipOn'),
}
out.peloUniformesDelMotor = sp.uniforms.uClipM === mHair.userData.rc.clipM && sp.uniforms.uHue === mHair.userData.rc.a.hue
out.peloDefines = pelo.material.defines
out.peloClave = pelo.material.customProgramCacheKey()
// los uniformes se mueven una vez y lo ven los dos (el motor escribe en el original)
mShirt.userData.rc.a.hue.value = 1.25
out.uniformeVivo = sc.uniforms.uHue2.value
LOOK.recortar(mHair, new THREE.Matrix4(), new THREE.Vector3(1, 2, 3))
out.recorteVivo = sp.uniforms.uClipOn.value

// ---------- el resto de casos ----------
out.sePuedeParchear = { motor: F.sePuedeParchearElPelo(mHair), sinMotor: F.sePuedeParchearElPelo(new THREE.MeshStandardMaterial()) }
out.segundaLlamada = F.fusionarCuerpo(av, { registrar() {} }).nuevas.length
out.concatenar = Array.from(F.concatenarIndices([[0, 1, 2], [0, 2, 1]], [0, 10]))
out.firmas = {
  igual: F.firmaDeMaterial(mPants) === F.firmaDeMaterial(mShoes),
  otraTextura: F.firmaDeMaterial(mPants) !== F.firmaDeMaterial(mOtra),
  conDefineDeDosPartes: F.firmaDeMaterial(mHoodie) === F.firmaDeMaterial(mPants),
  pelo: F.firmaDeMaterial(mHair) !== F.firmaDeMaterial(mPants),
}
out.glslN = {
  uno: F.glslDeTintes(1).funciones.split('vec3 rcTinte').length - 1,
  seis: F.glslDeTintes(6).funciones.split('vec3 rcTinte').length - 1,
  uniformes: F.glslDeTintes(2).declaraciones.includes('uniform float uHue2'),
  plano: F.glslDeTintes(2, true).declaraciones.includes('flat varying float vSlot;') && !F.glslDeTintes(2).declaraciones.includes('flat'),
  claveLisa: F.materialDeCuerpo(mPants, [mPants.userData.rc.a], true).customProgramCacheKey(),
}
// una malla con los mismos huesos pero girados o con otra escala por eje no se puede juntar
const skRef = body.skeleton
const giro = new THREE.Skeleton(huesos, skRef.boneInverses.map((x) => x.clone().multiply(new THREE.Matrix4().makeRotationY(0.3))))
const noUniforme = new THREE.Skeleton(huesos, skRef.boneInverses.map((x) => x.clone().multiply(new THREE.Matrix4().makeScale(1, 2, 1))))
const otrosHuesos = new THREE.Skeleton([huesos[0]], [skRef.boneInverses[0]])
const desigual = new THREE.Skeleton(huesos, skRef.boneInverses.map((x, i) => x.clone().multiply(new THREE.Matrix4().makeScale(0.5 + i * 0.1, 0.5 + i * 0.1, 0.5 + i * 0.1))))
out.transformacion = {
  propio: F.esIdentidad(F.transformacionAlEsqueleto(skRef, skRef)),
  escala: F.transformacionAlEsqueleto(skRef, pants.skeleton) !== null,
  giro: F.transformacionAlEsqueleto(skRef, giro),
  noUniforme: F.transformacionAlEsqueleto(skRef, noUniforme),
  otrosHuesos: F.transformacionAlEsqueleto(skRef, otrosHuesos),
  distintaPorHueso: F.transformacionAlEsqueleto(skRef, desigual),
}
console.log(JSON.stringify(out))
