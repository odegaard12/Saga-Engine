import { TextureLoader } from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import type { MxId } from './catalogo'
import { crearCompartido, leerAgarre } from './motor/motor'
import { hayBase, registrarBase } from './motor/stage'
import { urlDeAgarre, urlDeAnimaciones, urlDePersonaje } from './rutas'

/**
 * Carga de los modelos de los avatares 3D (GLB con meshopt y texturas WebP).
 *
 * REGLA DEL DUEÑO: lo que hace falta sin cobertura se baja en la pantalla de
 * carga, visible, y nunca de fondo mientras se juega. Esto lo cumple así:
 *
 *  - Los GLB van en la lista de la parte «App» de la pantalla de carga
 *    (`player-precache.json`); aquí sólo se LEEN de la caché del móvil.
 *  - `hayEnElMovil` comprueba la caché ANTES de pedir nada. Si un modelo no
 *    está, el mapa se queda con el retrato redondo de siempre: ni un solo byte se
 *    pide en mitad de la partida. La tienda de ropa sí puede bajar lo que le
 *    falte (`permitirRed`): es una pantalla que el jugador abre a propósito,
 *    con su indicador de progreso a la vista.
 *  - Los agarres (`hold-<Ch>.glb`) son un extra: sin ellos el personaje se ve y
 *    se mueve igual, sólo que no puede llevar objetos en las manos.
 */

const loader = new GLTFLoader()
loader.setMeshoptDecoder(MeshoptDecoder)
/**
 * Las texturas WebP van dentro del GLB y three.js las abre, por defecto, con
 * `ImageBitmapLoader`, que hace un `fetch()` a una URL `blob:`. La política de
 * seguridad de la aplicación (`connect-src 'self' https: ws: wss:`) no deja
 * conectar con `blob:`, y las texturas no cargaban sin un solo aviso en pantalla
 * (el personaje salía sin color). `TextureLoader` pasa por una imagen normal, que
 * `img-src ... blob:` sí permite: no hace falta aflojar la política.
 */
loader.register((parser) => ({
  name: 'saga_texturas_sin_fetch',
  beforeRoot() {
    ;(parser as unknown as { textureLoader: unknown }).textureLoader = new TextureLoader(
      parser.options.manager
    )
    return null
  },
}))

type Compartido = { clips: Record<string, unknown>; phaseOff: Record<string, number> }
type Agarre = { clips: Record<string, unknown>; items: Record<string, unknown[]> }

let compartido: Compartido | null = null
const agarres = new Map<MxId, Agarre>()
const promesas = new Map<string, Promise<void>>()
const listos = new Set<string>()
const fallos = new Map<string, number>()
/** Personajes cuyos agarres ya se intentaron (bien o mal): hasta entonces no se crea ningún avatar suyo. */
const agarresResueltos = new Set<MxId>()

/** Lo que necesita un avatar para crearse (sólo válido tras `personajeCargado`). */
export function recursosDeAvatar(id: MxId): { compartido: Compartido; agarre: Agarre } {
  return {
    compartido: compartido as Compartido,
    agarre: agarres.get(id) ?? { clips: {}, items: {} },
  }
}

export type OpcionesDeCarga = {
  /** `false` (por defecto): sólo si ya está en la caché del móvil. */
  permitirRed?: boolean
  /** Bytes bajados / totales de ESTE fichero. */
  alAvanzar?: (cargado: number, total: number) => void
}

/** ¿El navegador tiene ya este fichero guardado (service worker / Cache API)? */
export async function hayEnElMovil(url: string): Promise<boolean> {
  try {
    if (typeof caches === 'undefined') return true
    const guardado = await caches.match(url, { ignoreSearch: true })
    if (guardado) return true
    // Sin service worker (desarrollo sin él, HTTP de red local) la caché del shell
    // no existe y no hay forma de saberlo: se deja pasar, el navegador decidirá.
    return !('serviceWorker' in navigator) || !navigator.serviceWorker.controller
  } catch {
    return true
  }
}

function leerGlb(url: string, alAvanzar?: OpcionesDeCarga['alAvanzar']) {
  return new Promise<GLTF>((ok, no) => {
    loader.load(
      url,
      ok,
      (ev) => alAvanzar?.(ev.loaded, ev.total || ev.loaded),
      (e) => no(e instanceof Error ? e : new Error(String(e)))
    )
  })
}

async function cargarFichero(
  clave: string,
  url: string,
  alTerminar: (gltf: GLTF) => void,
  op: OpcionesDeCarga
) {
  if (listos.has(clave)) return
  const enCurso = promesas.get(clave)
  if (enCurso) return enCurso
  if (!op.permitirRed && !(await hayEnElMovil(url))) {
    // Cuenta como intento fallido: si no, cada fotograma volvía a intentarlo (y a avisar) sin parar.
    fallos.set(clave, (fallos.get(clave) ?? 0) + 1)
    throw new Error(`avatares: ${url} no está en el móvil`)
  }
  const p = (async () => {
    try {
      const gltf = await leerGlb(url, op.alAvanzar)
      alTerminar(gltf)
      listos.add(clave)
    } catch (e) {
      fallos.set(clave, (fallos.get(clave) ?? 0) + 1)
      throw e
    } finally {
      promesas.delete(clave)
    }
  })()
  promesas.set(clave, p)
  return p
}

export async function cargarAnimaciones(op: OpcionesDeCarga = {}): Promise<void> {
  await cargarFichero(
    'anims',
    urlDeAnimaciones(),
    (gltf) => {
      compartido = crearCompartido(gltf.animations)
    },
    op
  )
}

export async function cargarPersonaje(id: MxId, op: OpcionesDeCarga = {}): Promise<void> {
  await cargarAnimaciones(op)
  await cargarFichero(id, urlDePersonaje(id), (gltf) => registrarBase(id, gltf.scene), op)
  // Los agarres son un extra: si faltan, el personaje se ve igual (sin objetos en las manos).
  try {
    await cargarFichero(
      `agarre:${id}`,
      urlDeAgarre(id),
      (gltf) => agarres.set(id, leerAgarre(gltf)),
      op
    )
  } catch {
    // Sin agarres: se sigue.
  } finally {
    agarresResueltos.add(id)
  }
}

export function personajeCargado(id: MxId): boolean {
  return listos.has(id) && listos.has('anims') && hayBase(id) && agarresResueltos.has(id)
}

export function seIntentoCargar(id: MxId): boolean {
  // Si faltan las animaciones compartidas tampoco hay personaje, sea cual sea.
  return (fallos.get(id) ?? 0) > 0 || (fallos.get('anims') ?? 0) > 0
}

/** Los intentos fallidos se olvidan (por ejemplo al terminar de bajar los ficheros en la pantalla de carga). */
export function olvidarFallos(): void {
  fallos.clear()
}

/** Prueba y diagnóstico: cuántos modelos hay en memoria. */
export function resumenDeCarga() {
  return { listos: [...listos], enCurso: [...promesas.keys()], fallos: Object.fromEntries(fallos) }
}
