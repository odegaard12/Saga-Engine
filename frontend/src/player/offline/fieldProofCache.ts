import type { FieldProof } from '../../types/player'
import { esErrorDeCuota } from './almacenamiento'
import { fetchConLimite } from './peticiones'

const FIELD_PROOF_STORAGE_PREFIX = 'saga:field-proofs:'
// Mismo nombre que en frontend/public/sw.js: el service worker borra al activarse
// cualquier 'saga-field-proof-assets-*' distinta de la suya, y con ella se irían
// las fotos de ruta descargadas (la del mosaico, por ejemplo).
const FIELD_PROOF_ASSET_CACHE = 'saga-field-proof-assets-v3.9.6'

export type CachedFieldProofsPayload = {
  user: string
  cached_at: string
  proofs: FieldProof[]
}

function storageKey(user: string): string {
  return `${FIELD_PROOF_STORAGE_PREFIX}${String(user || 'anonymous').trim() || 'anonymous'}`
}

function hasLocalStorage(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage
  } catch {
    return false
  }
}

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function sameOriginPath(value?: string): string | null {
  if (!value || typeof window === 'undefined') return null

  try {
    const url = new URL(value, window.location.origin)
    if (url.origin !== window.location.origin) return null
    return `${url.pathname}${url.search}`
  } catch {
    return null
  }
}

export function cacheFieldProofs(user: string, proofs: FieldProof[]): CachedFieldProofsPayload {
  const payload: CachedFieldProofsPayload = {
    user,
    cached_at: new Date().toISOString(),
    proofs: Array.isArray(proofs) ? proofs : [],
  }

  if (hasLocalStorage()) {
    try {
    window.localStorage.setItem(storageKey(user), JSON.stringify(payload))
    } catch (e) { console.warn('Storage quota exceeded', e); }
  }

  return payload
}

export function getCachedFieldProofs(user: string): CachedFieldProofsPayload {
  const fallback: CachedFieldProofsPayload = {
    user,
    cached_at: '',
    proofs: [],
  }

  if (!hasLocalStorage()) return fallback

  const loaded = safeJsonParse<CachedFieldProofsPayload>(
    window.localStorage.getItem(storageKey(user)),
    fallback
  )

  return {
    user,
    cached_at: loaded.cached_at || '',
    proofs: Array.isArray(loaded.proofs) ? loaded.proofs : [],
  }
}

export interface ResultadoDeFotos {
  /** Cuántas fotos debería haber. */
  total: number
  /** Cuántas se bajaron ahora (las que ya estaban no cuentan). */
  nuevas: number
  /** Las que no se pudieron bajar. */
  fallos: number
  /** El navegador dijo que no cabía más. */
  sinEspacio: boolean
}

/**
 * Guarda las fotos de campo para verlas sin cobertura.
 *
 * SÓLO se llama desde la pantalla de carga o «Prepararse». Antes salía en cada
 * vuelta del ciclo de 15 s (y en cada carga del login, para catorce jugadores):
 * volvía a bajar TODAS las fotos con `cache: 'reload'` sin mirar cuáles ya
 * estaban, en plena partida y sin que nadie lo viera.
 *
 * Ahora lo que ya está guardado se salta. Las fotos nuevas de un compañero que
 * aparecen mientras se juega se guardan solas al pintarse (el service worker las
 * cachea al servirlas), que es descarga por uso y no de fondo.
 */
export async function cacheFieldProofAssets(
  proofs: FieldProof[],
  opciones: { cancelado?: () => boolean } = {}
): Promise<ResultadoDeFotos> {
  const vacio: ResultadoDeFotos = { total: 0, nuevas: 0, fallos: 0, sinEspacio: false }
  if (typeof window === 'undefined') return vacio
  if (!('caches' in window)) return vacio

  const urls = new Set<string>()

  for (const proof of proofs || []) {
    const thumb = sameOriginPath(proof.thumbnail_url)
    const image = sameOriginPath(proof.image_url)

    if (thumb) urls.add(thumb)
    if (image) urls.add(image)
  }

  if (urls.size === 0) return vacio

  return bajarYGuardar([...urls], opciones.cancelado)
}

/**
 * Baja a la caché de fotos las direcciones que aún no estén, de 4 en 4, y cuenta lo que pasó.
 * La usan las fotos de campo y las caras del grupo: las dos son imágenes de mismo origen que el
 * service worker sirve luego sin red.
 */
async function bajarYGuardar(urls: string[], cancelado: () => boolean = () => false): Promise<ResultadoDeFotos> {
  const cache = await caches.open(FIELD_PROOF_ASSET_CACHE)

  const pendientes: string[] = []
  for (const url of urls) {
    if (!(await cache.match(url))) pendientes.push(url)
  }

  const resultado: ResultadoDeFotos = { total: urls.length, nuevas: 0, fallos: 0, sinEspacio: false }

  const cola = [...pendientes]
  const trabajador = async () => {
    for (let url = cola.shift(); url !== undefined; url = cola.shift()) {
      if (resultado.sinEspacio || cancelado()) return
      try {
        const response = await fetchConLimite(url, { method: 'GET', credentials: 'same-origin' }, 20000)
        if (response.ok) {
          await cache.put(url, response.clone())
          resultado.nuevas += 1
        } else {
          resultado.fallos += 1
        }
      } catch (error) {
        if (esErrorDeCuota(error)) resultado.sinEspacio = true
        resultado.fallos += 1
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, cola.length) }, trabajador))

  return resultado
}

/** Lo que hace falta de cada ficha para saber dónde está su foto. */
type FichaConFoto = { avatar_ref?: string; avatar_url?: string }

/**
 * Las direcciones de las FOTOS DE PERFIL del grupo (`/api/player-avatar/…?v=huella`), sin repetir. El
 * mapa 2D pinta a cada jugador con su foto (ver `retratoDeMapa.ts`); sólo se aceptan las del endpoint
 * de retratos del servidor (el que tiene puerta de acceso), nunca una dirección externa.
 */
export function urlsDeCarasDelGrupo(perfiles: readonly FichaConFoto[] | null | undefined): string[] {
  const salida = new Set<string>()
  for (const p of perfiles || []) {
    const ruta = sameOriginPath(String(p?.avatar_ref || p?.avatar_url || '').trim())
    if (ruta && ruta.startsWith('/api/player-avatar/')) salida.add(ruta)
  }
  return [...salida]
}

const CLAVE_CARAS_INTENTADAS = 'saga:caras-intentadas'
/** Una foto que se intentó bajar no se vuelve a exigir en la pantalla de carga hasta pasado este tiempo. */
export const REINTENTO_DE_CARAS_MS = 6 * 3600 * 1000

function leerIntentos(): Record<string, number> {
  if (!hasLocalStorage()) return {}
  const crudo = safeJsonParse<unknown>(window.localStorage.getItem(CLAVE_CARAS_INTENTADAS), {})
  return crudo && typeof crudo === 'object' && !Array.isArray(crudo) ? (crudo as Record<string, number>) : {}
}

function anotarIntentos(urls: readonly string[]): void {
  if (!hasLocalStorage()) return
  try {
    const ahora = Date.now()
    const previos = leerIntentos()
    const vigentes: Record<string, number> = {}
    for (const [u, t] of Object.entries(previos)) if (ahora - Number(t) < REINTENTO_DE_CARAS_MS) vigentes[u] = Number(t)
    for (const u of urls) vigentes[u] = ahora
    window.localStorage.setItem(CLAVE_CARAS_INTENTADAS, JSON.stringify(vigentes))
  } catch {
    // Sin almacenamiento: se reintenta en la siguiente carga y ya está.
  }
}

/**
 * Cuáles de esas fotos no están guardadas en el móvil todavía. Una que acaba de fallar (sin permiso,
 * o que el servidor ya no tiene) no se exige otra vez en cada carga: no puede dejar la pantalla de
 * carga pendiente para siempre.
 */
export async function carasDelGrupoQueFaltan(urls: readonly string[]): Promise<string[]> {
  if (typeof window === 'undefined' || !('caches' in window) || urls.length === 0) return []
  try {
    const cache = await caches.open(FIELD_PROOF_ASSET_CACHE)
    const intentos = leerIntentos()
    const ahora = Date.now()
    const faltan: string[] = []
    for (const url of urls) {
      if (await cache.match(url)) continue
      if (ahora - Number(intentos[url] || 0) < REINTENTO_DE_CARAS_MS) continue
      faltan.push(url)
    }
    return faltan
  } catch {
    return []
  }
}

/**
 * Guarda las fotos de perfil del grupo para el mapa 2D, también sin cobertura. SÓLO desde la pantalla de
 * carga o «Prepararse»: nada se baja de fondo mientras se juega.
 */
export async function cacheCarasDelGrupo(
  urls: readonly string[],
  opciones: { cancelado?: () => boolean } = {}
): Promise<ResultadoDeFotos> {
  const vacio: ResultadoDeFotos = { total: 0, nuevas: 0, fallos: 0, sinEspacio: false }
  if (typeof window === 'undefined' || !('caches' in window) || urls.length === 0) return vacio
  const r = await bajarYGuardar([...urls], opciones.cancelado)
  anotarIntentos(urls)
  return r
}
