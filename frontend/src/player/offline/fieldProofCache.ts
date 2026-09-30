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

  const cache = await caches.open(FIELD_PROOF_ASSET_CACHE)
  const cancelado = opciones.cancelado ?? (() => false)

  const pendientes: string[] = []
  for (const url of urls) {
    if (!(await cache.match(url))) pendientes.push(url)
  }

  const resultado: ResultadoDeFotos = { total: urls.size, nuevas: 0, fallos: 0, sinEspacio: false }

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
