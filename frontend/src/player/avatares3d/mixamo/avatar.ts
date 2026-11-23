import * as THREE from 'three'
import { MeshoptSimplifier } from 'meshoptimizer/meshopt_simplifier.module.js'
import {
  COLORES_DE_CALZADO,
  COLORES_DE_PELO,
  COLORES_DE_ROPA,
  EN_REVISION,
  HUECOS,
  SE_AGARRAN,
  type Aspecto,
  type Complemento,
  type MxId,
} from './catalogo'
import { recursosDeAvatar } from './cargador'
import { Avatar } from './motor/avatar'
import { baseDe } from './motor/stage'

/**
 * Lo que la aplicación usa del avatar del motor (`motor/`, generado a partir del
 * banco y sin tipos): una interfaz mínima para no arrastrar `any` por todo el código.
 */
export interface AvatarMotor {
  id: MxId
  root: THREE.Group
  model: THREE.Object3D
  blob?: THREE.Mesh
  heading: number
  goal: number
  v: number
  time: number
  /** Segundos de cruce de color al cambiar de prenda (0 = al instante). Solo la tienda lo pone. */
  cruce?: number
  /** Los accesorios se colocan con sobreimpulso (easeOutBack). Solo la tienda lo pone. */
  rebote?: boolean
  lm: { topB: number; headZ: number } & Record<string, unknown>
  /** Objetos de mano que lleva ahora (los horneados en Blender). */
  items: Record<string, { parts: { wrapper: THREE.Object3D }[] }>
  /** Materiales propios de este avatar (clonados del modelo base). */
  parts: { mat: THREE.Material; mesh: THREE.SkinnedMesh; role: string }[]
  meshes: THREE.SkinnedMesh[]
  mixer: THREE.AnimationMixer
  /** `v` real (m/s); `vis` la que gobierna el paso (ver `velocidadDePaso`). */
  setSpeed(v: number, vis?: number): void
  /** Gestos en curso (parte alta del cuerpo). */
  gest: unknown[]
  /** El giro en el sitio en curso (o null). */
  turn: unknown
  setLook(look: { top: unknown; pants: unknown; hair: unknown; shoes?: unknown }): void
  setItems(lista: string[], opciones?: Record<string, unknown>): void
  clearItems(): void
  /** Los objetos de mano ya puestos del todo (sin la animación de sacarlos). */
  fijarObjetos(): void
  update(dt: number): void
  advance(segundos: number, dt?: number): void
  gesture(clip: string, opciones?: { fi?: number; fo?: number }): void
}

/** Los objetos que se llevan en las manos (con clips de agarre propios). */
export const OBJETOS_DE_MANO: ReadonlySet<Complemento> = new Set(SE_AGARRAN)

/** La lista de objetos de un aspecto, con los de mano si procede. */
export function objetosDeAspecto(a: Aspecto, conManos = true): Complemento[] {
  const salida: Complemento[] = []
  for (const h of HUECOS) {
    const c = a.items[h.clave]
    if (!c) continue
    if (!conManos && OBJETOS_DE_MANO.has(c)) continue
    if (EN_REVISION.has(c)) continue
    salida.push(c)
  }
  return salida
}

/** Colores y complementos de un aspecto sobre un avatar ya creado. */
export function aplicarAspecto(av: AvatarMotor, a: Aspecto, conManos = true): void {
  av.setLook({
    top: COLORES_DE_ROPA[a.top],
    pants: COLORES_DE_ROPA[a.pants],
    hair: COLORES_DE_PELO[a.hair],
    shoes: a.shoes ? COLORES_DE_CALZADO[a.shoes] : null,
  })
  av.setItems(objetosDeAspecto(a, conManos), {})
}

/**
 * `multimuestreo`: quien lo pinta tiene MSAA (el objetivo de la capa del mapa siempre; la tienda y la ficha si el
 * navegador dio antialias). Con él, el borde del pelo y la barba va por cobertura (suave); sin él, corte duro.
 */
function nuevo(a: Aspecto, fija: boolean, multimuestreo = true): AvatarMotor {
  const { compartido, agarre } = recursosDeAvatar(a.mx)
  return new Avatar(a.mx, compartido, agarre, null, { fija, a2c: multimuestreo }) as unknown as AvatarMotor
}

/**
 * Un avatar para el mapa: no se mueve solo (manda el GPS) y con las mallas espejadas.
 *
 * La proyección de MapLibre no es la de three.js: invierte el sentido de las caras. Los nodos
 * 3D lo resuelven invirtiendo el índice de cada geometría (`invertirCaras`, nodosTresD.ts);
 * aquí, como los modelos se comparten con la tienda (que SÍ pinta con three.js normal), se
 * crea otra geometría que comparte los búferes de vértices y sólo tiene su índice invertido.
 */
export function crearAvatarMapa(a: Aspecto, conManos = true): AvatarMotor {
  const av = nuevo(a, true)
  aplicarAspecto(av, a, conManos)
  // En el mapa aparece ya con sus objetos en la mano (no sacándolos delante de todos).
  av.fijarObjetos()
  av.advance(0.1)
  espejar(av)
  return av
}

/**
 * 7/11: un avatar quieto para hornear su imagen fija (`fotoDePersonaje.ts`): como el del mapa (sus objetos ya en la
 * mano) pero SIN espejar, porque se pinta con una cámara three.js normal y no con la proyección de MapLibre.
 */
export function crearAvatarParaFoto(a: Aspecto): AvatarMotor {
  const av = nuevo(a, true, false)
  aplicarAspecto(av, a, true)
  av.fijarObjetos()
  av.advance(0.1)
  return av
}

/** Un avatar para la tienda de ropa (three.js normal, sin espejo). */
export function crearAvatarTienda(a: Aspecto, multimuestreo = true): AvatarMotor {
  const av = nuevo(a, false, multimuestreo)
  aplicarAspecto(av, a, true)
  av.advance(0.2)
  return av
}

/** Cuántos triángulos conserva el cuerpo en el mapa (el modelo tiene ~55 000; el avatar mide 30-60 px de alto en el mapa: con una quinta parte sobra). */
export const FRACCION_DE_TRIANGULOS_EN_EL_MAPA = 0.2
const MINIMO_PARA_SIMPLIFICAR = 3000
/** 23/11: la malla BARATA de los cuerpos 3D que no entran en el tope de cuerpos completos (ver `tratoDelCuerpo`): 6 % y no menos de 700 triángulos por malla. */
export const FRACCION_DE_TRIANGULOS_BARATA = 0.06

/** Hay que esperar a esto antes de crear avatares para el mapa (el simplificador es WebAssembly). */
export const simplificadorListo: Promise<void> = MeshoptSimplifier.ready

/** El índice del cuerpo simplificado (misma lista de vértices: el esqueleto y las texturas no cambian). */
function simplificar(g: THREE.BufferGeometry, fraccion = FRACCION_DE_TRIANGULOS_EN_EL_MAPA, minimo = 1500): Uint32Array | null {
  const pos = g.attributes.position
  if (
    !g.index ||
    !pos ||
    !MeshoptSimplifier.supported ||
    g.index.count / 3 < MINIMO_PARA_SIMPLIFICAR
  )
    return null
  const v = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i += 1) {
    v[i * 3] = pos.getX(i)
    v[i * 3 + 1] = pos.getY(i)
    v[i * 3 + 2] = pos.getZ(i)
  }
  const objetivo = Math.max(minimo, Math.floor((g.index.count * fraccion) / 3) * 3)
  try {
    return MeshoptSimplifier.simplify(Uint32Array.from(g.index.array), v, 3, objetivo, 0.02, [
      'LockBorder',
    ])[0]
  } catch {
    return null
  }
}

const deMapa = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>()
/** De la geometría del mapa, la original de la que sale y su versión barata (sólo las mallas grandes la tienen). */
const origenDeMapa = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>()
const baratas = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry | null>()
function geometriaBarata(f: THREE.BufferGeometry): THREE.BufferGeometry {
  let b = baratas.get(f)
  if (b === undefined) {
    const g = origenDeMapa.get(f)
    const simple = g ? simplificar(g, FRACCION_DE_TRIANGULOS_BARATA, 700) : null
    if (g && simple) {
      b = new THREE.BufferGeometry()
      for (const k in f.attributes) b.setAttribute(k, f.attributes[k])
      for (const k in f.morphAttributes) b.morphAttributes[k] = f.morphAttributes[k]
      b.morphTargetsRelative = f.morphTargetsRelative
      for (let i = 0; i + 2 < simple.length; i += 3) {
        const t = simple[i + 1]
        simple[i + 1] = simple[i + 2]
        simple[i + 2] = t
      }
      b.setIndex(new THREE.BufferAttribute(simple, 1))
      b.userData = { ...f.userData }
    } else b = null
    baratas.set(f, b)
  }
  return b ?? f
}
const _mallaCompleta = new WeakMap<THREE.Mesh, THREE.BufferGeometry>()
/**
 * Malla completa o barata del cuerpo (mismos vértices, esqueleto, texturas y posición: sólo cambia el índice de triángulos,
 * así que ni se mueve ni cambia de luz). Las mallas pequeñas (ojos, pestañas) no tienen versión barata.
 */
export function ponerMalla(av: AvatarMotor, malla: 'completa' | 'baja'): void {
  av.root.traverse((o) => {
    const m = o as THREE.SkinnedMesh
    if (!m.isSkinnedMesh) return
    if (!_mallaCompleta.has(m)) _mallaCompleta.set(m, m.geometry)
    const completa = _mallaCompleta.get(m) as THREE.BufferGeometry
    const g = malla === 'baja' ? geometriaBarata(completa) : completa
    if (g !== completa) {
      // Lo que `espejar`/`dosPasadas` y el segundo tinte añaden DESPUÉS a la completa (grupos de las dos pasadas, `aRopa`).
      g.groups = completa.groups.map((x) => ({ ...x }))
      if (completa.attributes.aRopa && !g.attributes.aRopa) g.setAttribute('aRopa', completa.attributes.aRopa)
    }
    if (m.geometry !== g) m.geometry = g
  })
}
/**
 * La geometría tal como se pinta en el mapa: comparte los búferes de vértices con la original (que sigue
 * usando la tienda) y sólo tiene su propio índice, con las caras invertidas (la proyección de MapLibre no
 * es la de three.js) y, en el cuerpo con piel, simplificado: menos triángulos = menos coste por avatar.
 */
function geometriaDeMapa(g: THREE.BufferGeometry, conPiel: boolean): THREE.BufferGeometry {
  if (!g.index || g.userData?.espejo) return g
  let f = deMapa.get(g)
  // El segundo tinte (`aRopa`, la prenda con dos partes) se crea al medir el primer avatar: si el índice del mapa
  // se preparó antes, se le añade ahora (comparten el búfer).
  if (f && g.attributes.aRopa && !f.attributes.aRopa) f.setAttribute('aRopa', g.attributes.aRopa)
  if (!f) {
    f = new THREE.BufferGeometry()
    for (const k in g.attributes) f.setAttribute(k, g.attributes[k])
    for (const k in g.morphAttributes) f.morphAttributes[k] = g.morphAttributes[k]
    f.morphTargetsRelative = g.morphTargetsRelative
    const simple = conPiel ? simplificar(g) : null
    const a = simple ?? g.index.array.slice()
    for (let i = 0; i + 2 < a.length; i += 3) {
      const t = a[i + 1]
      a[i + 1] = a[i + 2]
      a[i + 2] = t
    }
    f.setIndex(new THREE.BufferAttribute(a, 1))
    f.groups = simple ? [] : g.groups.map((x) => ({ ...x }))
    f.userData = { ...g.userData, espejo: true }
    deMapa.set(g, f)
    origenDeMapa.set(f, g)
  }
  return f
}

/**
 * Deja listo lo caro de un personaje (el índice simplificado de cada malla con piel) para que el primer
 * avatar que se cree no se encuentre con el tirón. Una malla por llamada: que las repita quien llama, con pausas.
 * Devuelve cuántas quedan.
 */
export function prepararCuerpoParaElMapa(id: MxId, hechas: number): number {
  const base = baseDe(id) as THREE.Object3D | undefined
  if (!base) return 0
  const mallas: THREE.SkinnedMesh[] = []
  base.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) mallas.push(o as THREE.SkinnedMesh)
  })
  if (hechas < mallas.length) geometriaBarata(geometriaDeMapa(mallas[hechas].geometry, true))
  return Math.max(0, mallas.length - hechas - 1)
}

/** Los materiales de `dosPasadas` (son de cada avatar: se sueltan con él). */
const dePasada = new WeakSet<THREE.Material>()

/**
 * 22/11 (r2): three.js pinta un material transparente de doble cara (el pelo y las pestañas, ver `suavizar`) en dos
 * pasadas, primero las caras de atrás y luego las de delante, cambiando su `side` y marcándolo como cambiado: dos
 * búsquedas de programa (`getProgram`) por malla y fotograma (~5 % del hilo principal con 15 jugadores, CPU ×4). Aquí,
 * las mismas dos pasadas con dos materiales fijos (atrás y delante) sobre dos grupos que cubren toda la geometría:
 * mismo orden (dos grupos de una malla van seguidos y en su orden), mismos programas y mismos píxeles. Sólo en las
 * mallas con piel (los objetos y complementos comparten material entre avatares).
 */
function dosPasadas(m: THREE.SkinnedMesh): void {
  const mat = m.material
  if (Array.isArray(mat) || !mat.transparent || mat.side !== THREE.DoubleSide || mat.forceSinglePass) return
  const g = m.geometry
  if (g.groups.length > 0 && !g.userData.dosPasadas) return
  if (!g.userData.dosPasadas) {
    g.groups = [
      { start: 0, count: Infinity, materialIndex: 0 },
      { start: 0, count: Infinity, materialIndex: 1 },
    ]
    g.userData.dosPasadas = true
  }
  const lado = (side: THREE.Side) => {
    const c = mat.clone()
    c.side = side
    // `copy` no copia lo que añade el motor (look.ts): sus `defines`, su parche del sombreador y sus uniformes (en userData).
    c.defines = mat.defines ? { ...mat.defines } : mat.defines
    c.userData = mat.userData
    c.onBeforeCompile = mat.onBeforeCompile
    c.customProgramCacheKey = mat.customProgramCacheKey
    dePasada.add(c)
    return c
  }
  m.material = [lado(THREE.BackSide), lado(THREE.FrontSide)]
}

const _hueso = new THREE.Matrix4()
const _identidad = new THREE.Matrix4()
const huesosVigilados = new WeakSet<THREE.Skeleton>()
/** 23/11: esqueletos de cuerpos con la pose CONGELADA (y su colocación sin cambios): `update` no hace nada hasta que se descongelen. */
const huesosCongelados = new WeakSet<THREE.Skeleton>()
export function congelarPose(av: AvatarMotor, congelada: boolean): void {
  for (const m of av.meshes) {
    if (!m.skeleton) continue
    if (congelada) huesosCongelados.add(m.skeleton)
    else huesosCongelados.delete(m.skeleton)
  }
}
/**
 * 22/11 (r2): `Skeleton.update` de three.js (r160) rehace las matrices de los huesos y vuelve a subir su textura en CADA
 * fotograma aunque nada se haya movido (el cuerpo de quien está parado se anima uno de cada 3). Igual que el original,
 * pero la textura sólo se sube si cambió algún valor (comparado ya en float32, como va en la textura: mismos píxeles).
 */
function actualizarHuesos(this: THREE.Skeleton): void {
  if (huesosCongelados.has(this)) return
  const { bones, boneInverses, boneMatrices, boneTexture } = this
  let cambio = false
  for (let i = 0; i < bones.length; i += 1) {
    _hueso.multiplyMatrices(bones[i] ? bones[i].matrixWorld : _identidad, boneInverses[i])
    const e = _hueso.elements
    for (let k = 0, o = i * 16; k < 16; k += 1, o += 1) {
      const v = Math.fround(e[k])
      if (boneMatrices[o] !== v) {
        boneMatrices[o] = v
        cambio = true
      }
    }
  }
  if (cambio && boneTexture) boneTexture.needsUpdate = true
}

/** Prepara las mallas del avatar para el mapa (cuerpo, objetos y complementos); se repite al cambiar de objetos. */
export function espejar(av: AvatarMotor): void {
  av.root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || m === av.blob) return
    const conPiel = (m as THREE.SkinnedMesh).isSkinnedMesh === true
    m.geometry = geometriaDeMapa(m.geometry, conPiel)
    m.frustumCulled = false
    if (!conPiel) return
    const piel = m as THREE.SkinnedMesh
    dosPasadas(piel)
    if (piel.skeleton && !huesosVigilados.has(piel.skeleton)) {
      huesosVigilados.add(piel.skeleton)
      piel.skeleton.update = actualizarHuesos
    }
  })
}

/**
 * Libera lo que crea cada avatar por su cuenta: los materiales clonados del cuerpo y los
 * huesos de piel. La geometría, las texturas, los objetos de mano y los complementos se
 * COMPARTEN entre avatares y NO se tocan.
 */
export function liberarAvatar(av: AvatarMotor): void {
  for (const p of av.parts) p.mat.dispose()
  av.root.traverse((o) => {
    const mm = (o as THREE.Mesh).material
    if (Array.isArray(mm)) for (const x of mm) if (dePasada.has(x)) x.dispose()
  })
  for (const m of av.meshes) m.skeleton?.dispose()
  av.mixer.stopAllAction()
  av.mixer.uncacheRoot(av.model)
  av.root.removeFromParent()
}
