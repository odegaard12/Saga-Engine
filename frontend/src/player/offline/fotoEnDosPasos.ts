/**
 * La foto de campo en dos pasos (26/10).
 *
 * Con mala cobertura una foto de 600-700 KB tardaba 100-260 s en subir, cortaba a los 45 s y volvía a empezar. Ahora:
 *
 *  1. SUBE LA LIGERA al momento: unos 150-250 KB (1280 px, JPEG 0,7), como imagen binaria (sin base64: un 33 % menos)
 *     y con los datos en la query. El servidor la marca «falta la original» y ya sale en el mapa y el álbum.
 *  2. LA ORIGINAL (2048 px, 0,85: la máxima calidad) espera en el móvil y sube SOLA después, sólo con buena red y sin
 *     avances pendientes. Sustituye a la ligera en el servidor (una sola foto en disco) y la descarga ya da ésa.
 *
 * Sin red nada se pierde: la foto original está en la cola de fotos hasta que la ligera sube, y desde ahí en el almacén
 * de originales hasta que sube la original (que sigue aunque se cierre la app y se reabra).
 * Cualquier cosa rara (sin canvas, foto ya pequeña, móvil muy viejo) cae a la subida de siempre, JSON con base64.
 */
import { CALIDAD_LIGERA, LADO_LIGERA_PX, dimensionesDeFoto } from '../utils/calidadDeFoto'
import { redBuenaParaOriginales, sinCoberturaAhora } from './redEstado'

export type FotoParaSubir = {
  user: string
  image_data_url: string
  lat?: number
  lon?: number
  note?: string
  stage_id?: string
  stage_title?: string
  client_proof_id?: string
}

export type SubidaBinaria = {
  url: string
  blob: Blob
  /** Se sube la ligera y falta la original (si no, lo que va ya es la mejor versión). */
  ligera: boolean
  /** Tiempo máximo razonable para esta subida (ms): proporcional al peso, con mínimo. */
  tiempoMs: number
}

/** 20 kbit/s son 2,5 KB/s: el peor 2G útil. Mínimo 45 s (lo de siempre), máximo 3 minutos. */
export function tiempoParaSubir(bytes: number): number {
  return Math.min(180_000, Math.max(45_000, Math.ceil(bytes / 2500) * 1000))
}

/** El data URL como imagen binaria, sin pasar por `fetch(data:)` (la CSP puede no dejarlo). */
export function blobDeDataUrl(dataUrl: string): Blob | null {
  const coma = dataUrl.indexOf(',')
  if (!dataUrl.startsWith('data:') || coma < 0) return null
  const cabecera = dataUrl.slice(5, coma)
  if (!/;base64/i.test(cabecera)) return null
  const tipo = cabecera.split(';')[0] || 'image/jpeg'
  try {
    const binario = atob(dataUrl.slice(coma + 1))
    const bytes = new Uint8Array(binario.length)
    for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i)
    return new Blob([bytes], { type: tipo })
  } catch {
    return null
  }
}

/** La versión ligera de una foto (JPEG, 1280 px, 0,7). `null` si no se puede o no gana nada. */
async function ligeraDe(dataUrl: string, bytesOriginal: number): Promise<Blob | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null
  try {
    const imagen = new Image()
    imagen.src = dataUrl
    await imagen.decode()
    const ancho = imagen.naturalWidth
    const alto = imagen.naturalHeight
    // Ya es pequeña: no hay dos versiones que hacer.
    if (!ancho || !alto || Math.max(ancho, alto) <= LADO_LIGERA_PX) return null
    const dim = dimensionesDeFoto(ancho, alto, LADO_LIGERA_PX)
    const lienzo = document.createElement('canvas')
    lienzo.width = dim.ancho
    lienzo.height = dim.alto
    const ctx = lienzo.getContext('2d')
    if (!ctx) return null
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(imagen, 0, 0, dim.ancho, dim.alto)
    const blob = await new Promise<Blob | null>((resolver) => lienzo.toBlob(resolver, 'image/jpeg', CALIDAD_LIGERA))
    return blob && blob.size > 0 && blob.size < bytesOriginal * 0.9 ? blob : null
  } catch {
    return null
  }
}

function consulta(foto: FotoParaSubir, ligera: boolean): string {
  const p = new URLSearchParams()
  p.set('user', foto.user)
  if (typeof foto.lat === 'number' && typeof foto.lon === 'number') {
    p.set('lat', String(foto.lat))
    p.set('lon', String(foto.lon))
  }
  if (foto.note) p.set('note', foto.note)
  if (foto.stage_id) p.set('stage_id', foto.stage_id)
  if (foto.stage_title) p.set('stage_title', foto.stage_title)
  if (foto.client_proof_id) p.set('client_proof_id', foto.client_proof_id)
  if (ligera) p.set('calidad', 'ligera')
  return p.toString()
}

/**
 * Prepara la subida binaria de una foto: la ligera (si hay original que mandar después) o la original tal cual.
 * `null` = no se puede (sin id de cliente, sin canvas, base64 raro): quien llama usa la subida de siempre.
 */
export async function prepararSubidaBinaria(foto: FotoParaSubir): Promise<SubidaBinaria | null> {
  if (!foto.client_proof_id) return null
  const original = blobDeDataUrl(foto.image_data_url)
  if (!original || original.size === 0) return null
  const ligera = await ligeraDe(foto.image_data_url, original.size)
  const blob = ligera ?? original
  return {
    url: `/api/field-proofs?${consulta(foto, Boolean(ligera))}`,
    blob,
    ligera: Boolean(ligera),
    tiempoMs: tiempoParaSubir(blob.size),
  }
}

// ---------------------------------------------------------------------------
// Las originales que esperan buena red
// ---------------------------------------------------------------------------

type OriginalPendiente = {
  /** El `client_proof_id`: con él encuentra el servidor la foto. */
  id: string
  user: string
  image_data_url: string
  creada_ms: number
  intentos?: number
  proximo_intento_ms?: number
}

const BASE = 'SagaOfflineOriginals'
const ALMACEN = 'originales'
/** Una original que lleva tanto sin poder subir es de una foto que ya no existe: se tira. */
const CADUCIDAD_MS = 7 * 24 * 60 * 60 * 1000

function abrirBase(): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    if (typeof indexedDB === 'undefined') return rechazar(new Error('IndexedDB no disponible'))
    const corte = setTimeout(() => rechazar(new Error('IndexedDB no contesta')), 8000)
    const peticion = indexedDB.open(BASE, 1)
    peticion.onupgradeneeded = () => {
      if (!peticion.result.objectStoreNames.contains(ALMACEN)) peticion.result.createObjectStore(ALMACEN, { keyPath: 'id' })
    }
    peticion.onsuccess = () => {
      clearTimeout(corte)
      resolver(peticion.result)
    }
    peticion.onerror = () => {
      clearTimeout(corte)
      rechazar(peticion.error)
    }
  })
}

async function conAlmacen<T>(modo: IDBTransactionMode, uso: (almacen: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrirBase()
  try {
    return await new Promise<T>((resolver, rechazar) => {
      const tx = db.transaction(ALMACEN, modo)
      const peticion = uso(tx.objectStore(ALMACEN))
      tx.oncomplete = () => resolver(peticion.result)
      tx.onerror = () => rechazar(tx.error)
      tx.onabort = () => rechazar(tx.error)
    })
  } finally {
    db.close()
  }
}

/** Apunta que la ligera de esta foto ya subió y falta la original. Idempotente. */
export async function guardarOriginalPendiente(user: string, id: string, imageDataUrl: string): Promise<void> {
  const fila: OriginalPendiente = { id, user, image_data_url: imageDataUrl, creada_ms: Date.now() }
  await conAlmacen('readwrite', (a) => a.put(fila))
}

/** El jugador borró la foto antes de que subiera su original. */
export async function olvidarOriginal(id: string): Promise<void> {
  await conAlmacen('readwrite', (a) => a.delete(id)).catch(() => {})
}

/** Cuántas originales esperan (para pruebas y para avisar). */
export async function contarOriginalesPendientes(user: string): Promise<number> {
  const todas = await conAlmacen('readonly', (a) => a.getAll() as IDBRequest<OriginalPendiente[]>).catch(() => [])
  return todas.filter((o) => o.user === user).length
}

/** Pasos de espera entre intentos: 1, 2, 4... minutos, hasta media hora. */
export function esperaTrasFallo(intentos: number): number {
  return Math.min(30 * 60_000, 60_000 * 2 ** Math.max(0, intentos))
}

let subiendoDesde = 0
const CANDADO_MAXIMO_MS = 10 * 60_000

/**
 * Sube las originales que esperan. Sólo con red buena (no 2G/3G ni «ahorro de datos»), con cobertura y sin avances
 * del jugador en la cola: lo que importa siempre va antes. Una a una; cada fallo espera más que el anterior.
 */
export async function subirOriginalesPendientes(user: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (!redBuenaParaOriginales() || sinCoberturaAhora()) return
  const ahora = Date.now()
  if (subiendoDesde && ahora - subiendoDesde < CANDADO_MAXIMO_MS) return
  subiendoDesde = ahora
  try {
    const todas = await conAlmacen('readonly', (a) => a.getAll() as IDBRequest<OriginalPendiente[]>).catch(() => [])
    const mias = todas.filter((o) => o.user === user)
    if (!mias.length) return
    const { contarPendientes } = await import('./missionPack')
    if ((await contarPendientes(user).catch(() => 0)) > 0) return

    for (const original of mias) {
      if (Date.now() - original.creada_ms > CADUCIDAD_MS) {
        await olvidarOriginal(original.id)
        continue
      }
      if (original.proximo_intento_ms && Date.now() < original.proximo_intento_ms) continue
      if (!redBuenaParaOriginales() || sinCoberturaAhora()) return

      const blob = blobDeDataUrl(original.image_data_url)
      if (!blob) {
        await olvidarOriginal(original.id)
        continue
      }
      const abortar = typeof AbortController !== 'undefined' ? new AbortController() : null
      const corte = setTimeout(() => abortar?.abort(), tiempoParaSubir(blob.size) * 2)
      let estado: number | null = null
      try {
        const respuesta = await fetchImpl(
          `/api/field-proofs/original?user=${encodeURIComponent(user)}&client_proof_id=${encodeURIComponent(original.id)}`,
          { method: 'POST', headers: { 'Content-Type': blob.type || 'image/jpeg', Accept: 'application/json' }, body: blob, signal: abortar?.signal }
        )
        estado = respuesta.status
      } catch {
        estado = null
      } finally {
        clearTimeout(corte)
      }

      if (estado !== null && estado >= 200 && estado < 300) {
        await olvidarOriginal(original.id)
        // La lista de fotos trae ya la URL nueva (con la original): que se vuelva a pintar.
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('saga:foto-subida', { detail: { user } }))
        continue
      }
      // Sin arreglo: la foto ya no está (410), el servidor no la quiere (400, 413, 415) o no es de este jugador.
      if (estado === 410 || estado === 400 || estado === 413 || estado === 415) {
        await olvidarOriginal(original.id)
        continue
      }
      // 404 (la ligera aún no ha subido), 401/403 (sesión), 429, 5xx o sin red: más tarde, y no se prueban más.
      const intentos = (original.intentos || 0) + 1
      await conAlmacen('readwrite', (a) =>
        a.put({ ...original, intentos, proximo_intento_ms: Date.now() + esperaTrasFallo(intentos - 1) })
      ).catch(() => {})
      if (estado === null || estado >= 500 || estado === 429) return
    }
  } finally {
    subiendoDesde = 0
  }
}
