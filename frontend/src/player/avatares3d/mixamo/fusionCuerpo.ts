import * as THREE from 'three'

/**
 * 23/11 «personajes con menos dibujos».
 *
 * Un cuerpo del GLB llega como 5-8 mallas con piel (cuerpo, pantalón, camisa, zapatos, pelo, pestañas...), cada una con su
 * propio esqueleto (su textura de huesos, que se rehacía y se subía por malla y fotograma) y su llamada de dibujo; el pelo y
 * las pestañas, además, en dos pasadas (ver `dosPasadas` en avatar.ts). Con 15 jugadores eran ~100 llamadas sólo de cuerpos.
 *
 * Aquí, UNA vez por avatar del mapa:
 *  1. todas las mallas con el mismo esqueleto numérico comparten UNA instancia (se rehace y se sube una vez por cuerpo);
 *  2. las mallas opacas que usan la misma textura y los mismos parámetros se juntan en UNA malla: cada prenda sigue con SU
 *     tinte porque cada vértice dice a qué conjunto de uniformes del tinte pertenece (`aSlot`; 0 = sin tinte; un valor
 *     con parte decimal mezcla dos conjuntos, que es lo que ya hacía `aRopa` en la sudadera con pantalón corto de Ch02);
 *  3. el pelo, la barba, las cejas y las pestañas (un mismo material con alfa) se juntan en UNA malla de dos pasadas: el
 *     atributo `aHair` dice qué es cada vértice (0 pestaña: sin tinte ni recorte; 1 barba o cejas: tinte; 2 pelo de la
 *     cabeza: tinte y recorte bajo el tocado).
 *
 * Los uniformes del tinte NO se copian: el material fusionado usa los MISMOS objetos `{ value }` que los materiales de las
 * partes originales (que son los que escribe el motor al vestir y al recortar el pelo), así que no hay nada que sincronizar.
 * Mismos vértices, mismas texturas y la misma matemática del tinte: mismos píxeles.
 */

/** Un conjunto de uniformes del tinte (el `a` o el `b` de `userData.rc` del motor, ver motor/look.ts). */
export interface ConjuntoDeTinte {
  hue: { value: number }
  sat: { value: number }
  val: { value: number }
  tint: { value: THREE.Color }
  amt: { value: number }
  plA: { value: THREE.Color }
  plB: { value: THREE.Color }
  plC: { value: THREE.Color }
  plO: { value: number }
  plS: { value: number }
}
interface Rc {
  a: ConjuntoDeTinte
  b: ConjuntoDeTinte
  dos: { value: number }
}
const rcDe = (m: THREE.Material): Rc | undefined => (m.userData as { rc?: Rc }).rc

/** Máximo de conjuntos de tinte por material (uniformes de fragmento: 10 por conjunto). */
export const MAXIMO_DE_CONJUNTOS = 6
const CAMPOS_DE_TINTE = ['hue', 'sat', 'val', 'tint', 'amt', 'plA', 'plB', 'plC', 'plO', 'plS'] as const

// ---------------------------------------------------------------------------------------------------------------------
// Compatibilidad
// ---------------------------------------------------------------------------------------------------------------------

const CLAVES_DE_MATERIAL = [
  'roughness', 'metalness', 'envMapIntensity', 'envMapRotation', 'alphaTest', 'opacity', 'side', 'transparent', 'depthWrite',
  'depthTest', 'blending', 'blendSrc', 'blendDst', 'blendEquation', 'blendSrcAlpha', 'blendDstAlpha', 'alphaToCoverage',
  'colorWrite', 'premultipliedAlpha', 'dithering', 'polygonOffset', 'flatShading', 'vertexColors', 'forceSinglePass',
  'emissiveIntensity', 'aoMapIntensity', 'bumpScale', 'ior', 'specularIntensity', 'reflectivity', 'clearcoat', 'sheen',
  'transmission', 'visible',
]
const TEXTURAS_DE_MATERIAL = [
  'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'lightMap',
  'specularIntensityMap', 'specularColorMap', 'envMap',
]
const COLORES_DE_MATERIAL = ['color', 'emissive', 'specularColor', 'sheenColor', 'attenuationColor']

/** Todo lo que cambia cómo se pinta un material (menos el tinte): dos materiales con la misma firma se pueden juntar. */
export function firmaDeMaterial(m: THREE.Material): string {
  const o = m as unknown as Record<string, unknown>
  const t: string[] = [m.type]
  for (const k of CLAVES_DE_MATERIAL) if (o[k] !== undefined) t.push(k + '=' + String(o[k]))
  for (const k of TEXTURAS_DE_MATERIAL) {
    const x = o[k] as THREE.Texture | null | undefined
    if (x) t.push(k + '=' + x.uuid)
  }
  for (const k of COLORES_DE_MATERIAL) {
    const c = o[k] as THREE.Color | undefined
    if (c && c.isColor) t.push(k + '=' + c.getHexString())
  }
  const ns = o.normalScale as THREE.Vector2 | undefined
  if (ns) t.push('ns=' + ns.x + ',' + ns.y)
  // `RC_DOS` lo añade el motor a la prenda de dos partes (Ch02): para el material fusionado da igual (usa `aSlot`).
  const { RC_DOS: _dos, ...defines } = (m.defines ?? {}) as Record<string, unknown>
  void _dos
  t.push('d=' + JSON.stringify(defines))
  return t.join('|')
}

/** Los atributos de una geometría tal como llegan a la GPU; `null` si no se pueden concatenar (entrelazados, con morph). */
export function esquemaDeGeometria(g: THREE.BufferGeometry): string | null {
  if (!g.index || Object.keys(g.morphAttributes).length > 0) return null
  const t: string[] = []
  for (const k of Object.keys(g.attributes).sort()) {
    if (k === 'aRopa') continue
    // (los atributos de los GLB de gltfpack suelen venir ENTRELAZADOS en un solo búfer: se desentrelazan al fusionar)
    const a = g.attributes[k] as THREE.BufferAttribute
    t.push(`${k}:${a.itemSize}:${(a.array as { constructor: { name: string } }).constructor.name}:${a.normalized ? 1 : 0}`)
  }
  return t.join(',')
}

const casiIguales = (a: ArrayLike<number>, b: ArrayLike<number>, eps = 1e-6) => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) if (Math.abs(a[i] - b[i]) > eps) return false
  return true
}

const _inv = new THREE.Matrix4()
const _t = new THREE.Matrix4()
/**
 * Las mallas del GLB (gltfpack) llevan los vértices cuantizados a 16 bits y la escala y el desplazamiento de esa
 * cuantización METIDOS en las matrices inversas de sus huesos: cada malla tiene las suyas (mismos huesos, otras matrices).
 * Si `otro` es lo mismo que `ref` salvo por una escala uniforme y un desplazamiento iguales en TODOS los huesos, devuelve
 * esa transformación `T` (de las coordenadas de una malla de `otro` a las de una de `ref`: `p_ref = T · p_otro`); si no
 * (otros huesos, otro orden, un giro, escala distinta por eje...), `null`: esas mallas no se pueden juntar.
 */
export function transformacionAlEsqueleto(ref: THREE.Skeleton, otro: THREE.Skeleton, eps = 1e-4): THREE.Matrix4 | null {
  if (ref.bones.length !== otro.bones.length || ref.bones.length === 0) return null
  let T: THREE.Matrix4 | null = null
  for (let i = 0; i < ref.bones.length; i += 1) {
    if (ref.bones[i] !== otro.bones[i]) return null
    _t.copy(_inv.copy(ref.boneInverses[i]).invert()).multiply(otro.boneInverses[i])
    if (!T) {
      T = _t.clone()
      const e = T.elements
      const s = e[0]
      // sólo escala uniforme y desplazamiento (sin giros ni cizalla): las normales no cambian de dirección
      if (!(s > 0) || Math.abs(e[5] - s) > eps * s || Math.abs(e[10] - s) > eps * s) return null
      for (const k of [1, 2, 4, 6, 8, 9, 3, 7, 11]) if (Math.abs(e[k]) > eps) return null
      if (Math.abs(e[15] - 1) > eps) return null
    } else if (!casiIguales(T.elements, _t.elements, eps)) return null
  }
  return T
}

/** ¿Es la transformación nula (misma cuantización)? */
export const esIdentidad = (T: THREE.Matrix4, eps = 1e-6) => casiIguales(T.elements, IDENTIDAD, eps)
const IDENTIDAD = new THREE.Matrix4().elements

/** ¿Dos mallas con piel se pintan igual salvo por su geometría (mismo padre, colocación, anclaje y atributos)? */
export function mallasCompatibles(a: THREE.SkinnedMesh, b: THREE.SkinnedMesh): boolean {
  if (a.parent !== b.parent || !a.matrix.equals(b.matrix) || !a.bindMatrix.equals(b.bindMatrix)) return false
  if (a.bindMode !== b.bindMode || a.renderOrder !== b.renderOrder || a.layers.mask !== b.layers.mask) return false
  const ea = esquemaDeGeometria(a.geometry)
  return ea !== null && ea === esquemaDeGeometria(b.geometry)
}

// ---------------------------------------------------------------------------------------------------------------------
// Geometría
// ---------------------------------------------------------------------------------------------------------------------

/** Los índices de varias mallas en uno, sumando a cada uno el desplazamiento de sus vértices. */
export function concatenarIndices(indices: ArrayLike<number>[], desplazamientos: number[]): Uint32Array {
  let n = 0
  for (const x of indices) n += x.length
  const salida = new Uint32Array(n)
  let o = 0
  indices.forEach((x, i) => {
    const d = desplazamientos[i]
    for (let k = 0; k < x.length; k += 1) salida[o + k] = x[k] + d
    o += x.length
  })
  return salida
}

/** El valor tal como está guardado (sin desnormalizar) del componente `c` del vértice `n`, en un atributo suelto o entrelazado. */
function crudo(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, n: number, c: number): number {
  const i = a as THREE.InterleavedBufferAttribute
  return i.isInterleavedBufferAttribute ? i.data.array[n * i.data.stride + i.offset + c] : (a as THREE.BufferAttribute).array[n * a.itemSize + c]
}

export interface GeometriaFusionada {
  geometria: THREE.BufferGeometry
  partes: THREE.BufferGeometry[]
  /** Dónde empieza cada parte en la lista de vértices. */
  desplazamientos: number[]
}

/**
 * Las geometrías en una sola (mismos búferes de vértices concatenados, mismo orden de triángulos). `extras`: atributos
 * por vértice nuevos (un `Float32Array` con todos los vértices de todas las partes).
 */
export function fusionarGeometrias(
  partes: THREE.BufferGeometry[],
  extras: Record<string, Float32Array> = {},
  transformaciones: THREE.Matrix4[] = []
): GeometriaFusionada {
  const desplazamientos: number[] = []
  let total = 0
  for (const g of partes) {
    desplazamientos.push(total)
    total += g.attributes.position.count
  }
  const geometria = new THREE.BufferGeometry()
  for (const k of Object.keys(partes[0].attributes)) {
    if (k === 'aRopa') continue
    if (k === 'position') {
      // Float32 en las coordenadas del primer esqueleto (ver `transformacionAlEsqueleto`): cada parte las traía cuantizadas a su manera.
      const pos = new Float32Array(total * 3)
      const v = new THREE.Vector3()
      let o = 0
      partes.forEach((g, i) => {
        const a = g.attributes.position
        for (let n = 0; n < a.count; n += 1, o += 3) {
          v.fromBufferAttribute(a, n)
          if (transformaciones[i]) v.applyMatrix4(transformaciones[i])
          pos[o] = v.x
          pos[o + 1] = v.y
          pos[o + 2] = v.z
        }
      })
      geometria.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      continue
    }
    const a0 = partes[0].attributes[k] as THREE.BufferAttribute
    const Tipo = a0.array.constructor as new (n: number) => THREE.BufferAttribute['array'] & { [i: number]: number }
    const arr = new Tipo(total * a0.itemSize)
    let o = 0
    for (const g of partes) {
      const a = g.attributes[k]
      for (let n = 0; n < a.count; n += 1) for (let c = 0; c < a0.itemSize; c += 1, o += 1) arr[o] = crudo(a, n, c)
    }
    geometria.setAttribute(k, new THREE.BufferAttribute(arr, a0.itemSize, a0.normalized))
  }
  for (const k of Object.keys(extras)) geometria.setAttribute(k, new THREE.BufferAttribute(extras[k], 1))
  geometria.setIndex(new THREE.BufferAttribute(concatenarIndices(partes.map((g) => g.index!.array), desplazamientos), 1))
  // Misma marca que las geometrías del mapa: `espejar` no vuelve a invertirla.
  geometria.userData = { espejo: true, fusion: true }
  return { geometria, partes, desplazamientos }
}

// ---------------------------------------------------------------------------------------------------------------------
// Sombreadores
// ---------------------------------------------------------------------------------------------------------------------

/** Idéntico al de motor/look.ts (tartán procedural de una prenda). */
const PLAID = `
        #ifdef USE_MAP
        if (uPlO > 0.5) { vec2 f = fract(vMapUv * uPlS);
          float A = clamp(smoothstep(0.17,0.13,abs(f.x-0.25)) + smoothstep(0.17,0.13,abs(f.y-0.25)),0.,1.) * 0.62;
          float B = clamp(smoothstep(0.07,0.045,abs(f.x-0.62)) + smoothstep(0.07,0.045,abs(f.y-0.62)),0.,1.) * 0.75;
          float C = clamp(smoothstep(0.02,0.012,abs(f.x-0.86)) + smoothstep(0.02,0.012,abs(f.y-0.86)),0.,1.) * 0.9;
          base = mix(base, uPlA, A); base = mix(base, uPlB, B); base = mix(base, uPlC, C); base *= 0.93 + 0.07 * sin((vMapUv.x + vMapUv.y) * uPlS * 40.0); }
        #endif`

/** El tinte del conjunto `k` como función: la misma matemática que `una()` de motor/look.ts. */
function funcionDeTinte(k: number): string {
  const sufijo = String(k)
  const plaid = ['uPlO', 'uPlS', 'uPlA', 'uPlB', 'uPlC'].reduce((t, n) => t.split(n).join(n + sufijo), PLAID)
  return `vec3 rcTinte${sufijo}(vec3 c) { vec3 k = vec3(0.57735); float cs = cos(uHue${sufijo}), sn = sin(uHue${sufijo});
        c = c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = mix(vec3(l), c, uSat${sufijo}) * uVal${sufijo};
        vec3 base = uTint${sufijo};${plaid}
        vec3 tg = base * (0.12 + 1.15 * sqrt(max(l, 0.0)));
        return mix(c, tg, uAmt${sufijo}); }`
}

/** Declaraciones, funciones y selección del tinte por vértice para `n` conjuntos (1..n; 0 = sin tinte). */
export function glslDeTintes(n: number, plano = false): { declaraciones: string; funciones: string; seleccion: string } {
  const decl: string[] = [(plano ? 'flat ' : '') + 'varying float vSlot;']
  const funciones: string[] = []
  const elige = (v: string) => {
    let t = ''
    for (let k = 1; k <= n; k += 1) t += `${k === 1 ? '' : 'else '}if (${v} < ${k}.5) r = rcTinte${k}(c0); `
    return t
  }
  for (let k = 1; k <= n; k += 1) {
    decl.push(`uniform float uHue${k}, uSat${k}, uVal${k}, uAmt${k}, uPlO${k}, uPlS${k};`)
    decl.push(`uniform vec3 uTint${k}, uPlA${k}, uPlB${k}, uPlC${k};`)
    funciones.push(funcionDeTinte(k))
  }
  const seleccion = `{ float s = vSlot;
        if (s > 0.001) { vec3 c0 = diffuseColor.rgb; float i0 = floor(s + 0.0001); float f = s - i0; vec3 r = c0;
          ${elige('i0')}
          if (f > 0.0005) { vec3 r1 = r; r = c0; float j0 = i0 + 1.0; ${elige('j0')} r = mix(r1, r, f); }
          diffuseColor.rgb = r; } }`
  return { declaraciones: decl.join('\n'), funciones: funciones.join('\n'), seleccion }
}

/** Material de las prendas y la piel juntas: el del cuerpo, con el tinte elegido por vértice entre `conjuntos`. */
/**
 * `plano`: ninguna prenda mezcla dos conjuntos (la sudadera de Ch02 sí): el slot va como `flat` (WebGL2, GLSL 300 es: sin
 * interpolar, exacto en cualquier GPU).
 */
export function materialDeCuerpo(base: THREE.Material, conjuntos: ConjuntoDeTinte[], plano = false): THREE.Material {
  const m = base.clone()
  m.userData = {}
  const { RC_DOS: _dos, ...defines } = (base.defines ?? {}) as Record<string, unknown>
  void _dos
  m.defines = defines
  if (conjuntos.length === 0) return m
  const { declaraciones, funciones, seleccion } = glslDeTintes(conjuntos.length, plano)
  m.onBeforeCompile = (s) => {
    conjuntos.forEach((c, i) => {
      for (const campo of CAMPOS_DE_TINTE) {
        const nombre = 'u' + campo[0].toUpperCase() + campo.slice(1) + (i + 1)
        s.uniforms[nombre] = c[campo]
      }
    })
    s.vertexShader =
      'attribute float aSlot; ' + (plano ? 'flat ' : '') + 'varying float vSlot;\n' +
      s.vertexShader.replace('#include <skinning_vertex>', '#include <skinning_vertex>\n      vSlot = aSlot;')
    s.fragmentShader =
      declaraciones +
      '\n' +
      s.fragmentShader
        .replace('void main() {', funciones + '\nvoid main() {')
        .replace('#include <map_fragment>', '#include <map_fragment>\n      ' + seleccion)
  }
  m.customProgramCacheKey = () => 'fcuerpo' + conjuntos.length + (plano ? 'f' : '')
  m.needsUpdate = true
  return m
}

const PELO_RECORTE_VIEJO = 'rcVer = 1.0 - k1 * k2;'
const PELO_RECORTE_NUEVO = 'rcVer = 1.0 - k1 * k2 * step(1.5, vHair);'
const PELO_TINTE_VIEJO = 'diffuseColor.rgb = mix(rc1, rc2, clamp(vRopa, 0.0, 1.0));'
const PELO_TINTE_NUEVO = 'diffuseColor.rgb = vHair > 0.5 ? mix(rc1, rc2, clamp(vRopa, 0.0, 1.0)) : diffuseColor.rgb;'

/** Al sombreador del pelo del motor (look.ts) le añade el `aHair` por vértice (ver arriba). */
function parchearPelo(s: { vertexShader: string; fragmentShader: string }): void {
  s.vertexShader =
    'attribute float aHair; flat varying float vHair;\n' +
    s.vertexShader.replace('#include <skinning_vertex>', '#include <skinning_vertex>\n      vHair = aHair;')
  s.fragmentShader =
    'flat varying float vHair;\n' + s.fragmentShader.replace(PELO_RECORTE_VIEJO, PELO_RECORTE_NUEVO).replace(PELO_TINTE_VIEJO, PELO_TINTE_NUEVO)
}

/**
 * ¿Sigue valiendo el sombreador del motor para parchearlo? Se prueba con un sombreador mínimo que contiene lo que el motor
 * sustituye: si algún día cambia look.ts y el texto ya no está, el pelo se queda sin fusionar (como antes), no roto.
 */
export function sePuedeParchearElPelo(base: THREE.Material): boolean {
  if (typeof base.onBeforeCompile !== 'function') return false
  const s = {
    uniforms: {} as Record<string, unknown>,
    vertexShader: '#include <skinning_vertex>',
    fragmentShader: '#include <clipping_planes_fragment>\n#include <alphatest_fragment>\n#include <map_fragment>',
  }
  try {
    ;(base.onBeforeCompile as (s: unknown, r: unknown) => void).call(base, s, null)
  } catch {
    return false
  }
  return s.fragmentShader.includes(PELO_RECORTE_VIEJO) && s.fragmentShader.includes(PELO_TINTE_VIEJO)
}

/** Material del pelo, las cejas, la barba y las pestañas juntos: el del pelo de la cabeza (sus uniformes) con el `aHair`. */
export function materialDePelo(base: THREE.Material): THREE.Material {
  const m = base.clone()
  // `clone` no copia lo que añade el motor (look.ts): sus `defines`, su parche del sombreador y sus uniformes (en userData).
  m.defines = base.defines ? { ...base.defines } : base.defines
  m.userData = base.userData
  const delMotor = base.onBeforeCompile as (s: unknown, r: unknown) => void
  m.onBeforeCompile = function (this: THREE.Material, s, r) {
    delMotor.call(base, s, r)
    parchearPelo(s)
  }
  const claveDelMotor = base.customProgramCacheKey
  m.customProgramCacheKey = () => 'fpelo' + (claveDelMotor ? claveDelMotor.call(base) : '')
  m.needsUpdate = true
  return m
}

// ---------------------------------------------------------------------------------------------------------------------
// El avatar
// ---------------------------------------------------------------------------------------------------------------------

export interface AvatarFusionable {
  id: string
  root: THREE.Object3D
  meshes: THREE.SkinnedMesh[]
  parts: { mesh: THREE.SkinnedMesh; mat: THREE.Material; role: string; key: string }[]
  piezas: { mesh: THREE.SkinnedMesh; kind: string; key: string }[]
}

export interface GanchosDeFusion {
  /** Dónde guardar de qué partes sale cada geometría fusionada (para su versión barata, ver `ponerMalla`). */
  registrar(fusionada: THREE.BufferGeometry, partes: THREE.BufferGeometry[], desplazamientos: number[]): void
}

export interface ResultadoDeFusion {
  /** Mallas fusionadas nuevas. */
  nuevas: THREE.SkinnedMesh[]
  /** Los materiales nuevos que NO son lista (los de dos pasadas los suelta `dosPasadas`): los libera `liberarAvatar`. */
  materiales: THREE.Material[]
}

const yaFusionados = new WeakSet<object>()
const idsDeGeometria = new WeakMap<THREE.BufferGeometry, number>()
let siguienteId = 1
const idDe = (g: THREE.BufferGeometry) => {
  let n = idsDeGeometria.get(g)
  if (n === undefined) idsDeGeometria.set(g, (n = siguienteId++))
  return n
}
/** Lo fusionado se comparte entre los avatares del mismo personaje (como las demás geometrías del mapa). */
const fusionadas = new Map<string, GeometriaFusionada>()

interface Miembro {
  malla: THREE.SkinnedMesh
  parte: AvatarFusionable['parts'][number]
}

/**
 * Junta las mallas del avatar (ver arriba). Se llama una vez por avatar, con las geometrías del mapa ya puestas y SIN las
 * dos pasadas del pelo. Lo que no se puede juntar (otra textura, otro material, otro esqueleto...) se queda como estaba.
 */
export function fusionarCuerpo(av: AvatarFusionable, ganchos: GanchosDeFusion): ResultadoDeFusion {
  const vacio: ResultadoDeFusion = { nuevas: [], materiales: [] }
  if (yaFusionados.has(av)) return vacio
  yaFusionados.add(av)
  const vivas = av.meshes.filter(
    (m) => m.isSkinnedMesh && m.visible && m.parent && !Array.isArray(m.material) && m.geometry.index && m.skeleton
  )
  if (vivas.length === 0) return vacio

  // 1. Un solo esqueleto por cuerpo: el de la primera malla; las demás se le suman con su transformación (ver arriba).
  const esqueleto = vivas[0].skeleton
  const transformacion = new Map<THREE.SkinnedMesh, THREE.Matrix4>()
  for (const m of vivas) {
    if (!m.bindMatrix.equals(vivas[0].bindMatrix)) continue
    const T = m.skeleton === esqueleto ? new THREE.Matrix4() : transformacionAlEsqueleto(esqueleto, m.skeleton)
    if (!T) continue
    transformacion.set(m, T)
    // Las que ya coinciden con él (sin transformación) lo comparten aunque no se fusionen.
    if (esIdentidad(T)) m.skeleton = esqueleto
  }

  // 2. Grupos de mallas que se pueden pintar de una vez.
  const grupos: Record<'cuerpo' | 'pelo', Miembro[][]> = { cuerpo: [], pelo: [] }
  for (const malla of vivas) {
    if (!transformacion.has(malla)) continue
    const parte = av.parts.find((p) => p.mesh === malla)
    if (!parte) continue
    const tipo = parte.role === 'hair' || parte.role === 'lash' ? 'pelo' : 'cuerpo'
    const firma = firmaDeMaterial(malla.material as THREE.Material)
    const grupo = grupos[tipo].find(
      (g) => firmaDeMaterial(g[0].malla.material as THREE.Material) === firma && mallasCompatibles(g[0].malla, malla)
    )
    if (grupo) grupo.push({ malla, parte })
    else grupos[tipo].push([{ malla, parte }])
  }

  const resultado: ResultadoDeFusion = { nuevas: [], materiales: [] }
  const absorbida = new Map<THREE.SkinnedMesh, THREE.SkinnedMesh>()
  const poner = (miembros: Miembro[], geo: GeometriaFusionada, material: THREE.Material, nombre: string) => {
    const primero = miembros[0].malla
    const malla = new THREE.SkinnedMesh(geo.geometria, material)
    malla.name = `${av.id}_${nombre}`
    malla.position.copy(primero.position)
    malla.quaternion.copy(primero.quaternion)
    malla.scale.copy(primero.scale)
    malla.renderOrder = primero.renderOrder
    malla.layers.mask = primero.layers.mask
    malla.frustumCulled = false
    malla.castShadow = primero.castShadow
    malla.receiveShadow = primero.receiveShadow
    malla.bind(esqueleto, primero.bindMatrix)
    const padre = primero.parent as THREE.Object3D
    padre.add(malla)
    malla.updateWorldMatrix(true, false)
    for (const x of miembros) {
      x.malla.removeFromParent()
      absorbida.set(x.malla, malla)
    }
    resultado.nuevas.push(malla)
  }
  const geometriaDe = (clave: string, miembros: Miembro[], extras: () => Record<string, Float32Array>) => {
    let g = fusionadas.get(clave)
    if (!g) {
      const partes = miembros.map((x) => x.malla.geometry)
      g = fusionarGeometrias(
        partes,
        extras(),
        miembros.map((x) => transformacion.get(x.malla) as THREE.Matrix4)
      )
      fusionadas.set(clave, g)
      ganchos.registrar(g.geometria, g.partes, g.desplazamientos)
    }
    return g
  }
  const vertices = (m: THREE.SkinnedMesh) => m.geometry.attributes.position.count

  // Una malla que está sola en su grupo (otra textura, o el único pelo/pestañas) conserva su material, pero entra en el esqueleto
  // común: así el cuerpo no arrastra un segundo esqueleto por ella (si coincide con el común sin transformación ya lo comparte).
  const solitaria = (m: Miembro) => {
    const T = transformacion.get(m.malla) as THREE.Matrix4
    if (esIdentidad(T)) return
    const g = geometriaDe(`${av.id}|solo|${idDe(m.malla.geometry)}`, [m], () => ({}))
    poner([m], g, m.malla.material as THREE.Material, m.parte.key)
  }

  // 2a. Piel, ropa y zapatos: un conjunto de uniformes del tinte por prenda (o dos, la de dos partes).
  for (const miembros of grupos.cuerpo) {
    if (miembros.length < 2) {
      solitaria(miembros[0])
      continue
    }
    const conjuntos: ConjuntoDeTinte[] = []
    const reparto: string[] = []
    const inicio: number[] = []
    const dosPartes: boolean[] = []
    for (const { malla, parte } of miembros) {
      const rc = rcDe(parte.mat)
      if (!rc) {
        inicio.push(0)
        dosPartes.push(false)
        reparto.push('n')
        continue
      }
      const dos = rc.dos.value === 1 && Boolean(malla.geometry.attributes.aRopa)
      inicio.push(conjuntos.length + 1)
      dosPartes.push(dos)
      conjuntos.push(rc.a)
      if (dos) conjuntos.push(rc.b)
      reparto.push(dos ? 'ab' : 'a')
    }
    if (conjuntos.length > MAXIMO_DE_CONJUNTOS) continue
    const partes = miembros.map((x) => x.malla.geometry)
    const clave = `${av.id}|cuerpo|${partes.map(idDe).join(',')}|${reparto.join(',')}`
    const total = miembros.reduce((n, x) => n + vertices(x.malla), 0)
    const g = geometriaDe(clave, miembros, () => (conjuntos.length === 0 ? {} : { aSlot: construirSlots(miembros, inicio, dosPartes, total) }) as Record<string, Float32Array>)
    const material = materialDeCuerpo(miembros[0].parte.mat, conjuntos, !dosPartes.some(Boolean))
    poner(miembros, g, material, 'cuerpo')
    resultado.materiales.push(material)
  }

  // 2b. Pelo, barba, cejas y pestañas.
  for (const miembros of grupos.pelo) {
    const base = miembros.find((x) => x.parte.role === 'hair' && /^hair$/i.test(x.parte.key)) ?? miembros.find((x) => x.parte.role === 'hair')
    if (miembros.length < 2 || !base || !sePuedeParchearElPelo(base.parte.mat)) {
      for (const m of miembros) solitaria(m)
      continue
    }
    const tipos = miembros.map((x) => (x.parte.role !== 'hair' ? 0 : /^hair$/i.test(x.parte.key) ? 2 : 1))
    const partes = miembros.map((x) => x.malla.geometry)
    const clave = `${av.id}|pelo|${partes.map(idDe).join(',')}|${tipos.join('')}`
    const g = geometriaDe(clave, miembros, () => ({ aHair: construirPelo(miembros.map((x) => vertices(x.malla)), tipos) }))
    poner(miembros, g, materialDePelo(base.parte.mat), 'pelo')
  }

  // 3. Lo que quedó en el avatar apunta a lo nuevo.
  if (resultado.nuevas.length > 0) {
    av.meshes = [...av.meshes.filter((m) => !absorbida.has(m)), ...resultado.nuevas]
    for (const p of av.parts) {
      const nueva = absorbida.get(p.mesh)
      if (nueva) p.mesh = nueva
    }
    for (const p of av.piezas) {
      const nueva = absorbida.get(p.mesh)
      if (nueva) p.mesh = nueva
    }
  }
  return resultado
}

function construirSlots(miembros: Miembro[], inicio: number[], dosPartes: boolean[], total: number): Float32Array {
  const salida = new Float32Array(total)
  let o = 0
  miembros.forEach(({ malla }, i) => {
    const n = malla.geometry.attributes.position.count
    if (inicio[i] > 0) {
      const ropa = malla.geometry.attributes.aRopa
      for (let v = 0; v < n; v += 1) salida[o + v] = inicio[i] + (dosPartes[i] && ropa ? ropa.getX(v) : 0)
    }
    o += n
  })
  return salida
}

function construirPelo(cuantos: number[], tipos: number[]): Float32Array {
  const salida = new Float32Array(cuantos.reduce((a, b) => a + b, 0))
  let o = 0
  cuantos.forEach((n, i) => {
    salida.fill(tipos[i], o, o + n)
    o += n
  })
  return salida
}
