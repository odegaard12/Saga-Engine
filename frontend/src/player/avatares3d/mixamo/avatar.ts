import * as THREE from 'three'
import { MeshoptSimplifier } from 'meshoptimizer/meshopt_simplifier.module.js'
import {
  COLORES_DE_PELO,
  COLORES_DE_ROPA,
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
  lm: { topB: number; headZ: number } & Record<string, unknown>
  /** Objetos de mano que lleva ahora (los horneados en Blender). */
  items: Record<string, { parts: { wrapper: THREE.Object3D }[] }>
  /** Materiales propios de este avatar (clonados del modelo base). */
  parts: { mat: THREE.Material }[]
  meshes: THREE.SkinnedMesh[]
  mixer: THREE.AnimationMixer
  /** `v` real (m/s); `vis` la que gobierna el paso (ver `velocidadDePaso`). */
  setSpeed(v: number, vis?: number): void
  /** Gestos en curso (parte alta del cuerpo). */
  gest: unknown[]
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
    shoes: null,
  })
  av.setItems(objetosDeAspecto(a, conManos), {})
}

function nuevo(a: Aspecto, fija: boolean): AvatarMotor {
  const { compartido, agarre } = recursosDeAvatar(a.mx)
  return new Avatar(a.mx, compartido, agarre, null, { fija }) as unknown as AvatarMotor
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

/** Un avatar para la tienda de ropa (three.js normal, sin espejo). */
export function crearAvatarTienda(a: Aspecto): AvatarMotor {
  const av = nuevo(a, false)
  aplicarAspecto(av, a, true)
  av.advance(0.2)
  return av
}

/** Cuántos triángulos conserva el cuerpo en el mapa (el modelo tiene ~55 000; el avatar mide 30-60 px de alto en el mapa: con una quinta parte sobra). */
export const FRACCION_DE_TRIANGULOS_EN_EL_MAPA = 0.2
const MINIMO_PARA_SIMPLIFICAR = 3000

/** Hay que esperar a esto antes de crear avatares para el mapa (el simplificador es WebAssembly). */
export const simplificadorListo: Promise<void> = MeshoptSimplifier.ready

/** El índice del cuerpo simplificado (misma lista de vértices: el esqueleto y las texturas no cambian). */
function simplificar(g: THREE.BufferGeometry): Uint32Array | null {
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
  const objetivo = Math.max(
    1500,
    Math.floor((g.index.count * FRACCION_DE_TRIANGULOS_EN_EL_MAPA) / 3) * 3
  )
  try {
    return MeshoptSimplifier.simplify(Uint32Array.from(g.index.array), v, 3, objetivo, 0.02, [
      'LockBorder',
    ])[0]
  } catch {
    return null
  }
}

const deMapa = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>()
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
  if (hechas < mallas.length) geometriaDeMapa(mallas[hechas].geometry, true)
  return Math.max(0, mallas.length - hechas - 1)
}

/** Prepara las mallas del avatar para el mapa (cuerpo, objetos y complementos); se repite al cambiar de objetos. */
export function espejar(av: AvatarMotor): void {
  av.root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || m === av.blob) return
    m.geometry = geometriaDeMapa(m.geometry, (m as THREE.SkinnedMesh).isSkinnedMesh === true)
    m.frustumCulled = false
  })
}

/**
 * Libera lo que crea cada avatar por su cuenta: los materiales clonados del cuerpo y los
 * huesos de piel. La geometría, las texturas, los objetos de mano y los complementos se
 * COMPARTEN entre avatares y NO se tocan.
 */
export function liberarAvatar(av: AvatarMotor): void {
  for (const p of av.parts) p.mat.dispose()
  for (const m of av.meshes) m.skeleton?.dispose()
  av.mixer.stopAllAction()
  av.mixer.uncacheRoot(av.model)
  av.root.removeFromParent()
}
