import { loadInventorySnapshot } from './inventory'
import { cuerpoDeSincronizacion, queueOfflineEvent, syncPendingOfflineEvents } from './missionPack'

export type SagaSyncStatus = 'online' | 'offline' | 'syncing' | 'error'

export type SagaQueuedEvent = {
  client_event_id: string
  type: string
  user: string
  node_id?: string
  team_id?: string
  source?: string
  payload?: Record<string, unknown>
  created_at: string
  /** Envíos hechos, incluidos los que se perdieron por no haber cobertura. */
  attempts: number
  /**
   * Veces que el SERVIDOR contestó rechazando este evento.
   *
   * Va aparte de `attempts` a propósito: quedarse sin red no es que el evento
   * esté mal, y tirar la cola por eso sería romper justo el modo sin conexión.
   */
  rejections?: number
  last_attempt_at?: string
  last_error?: string
}

export type SagaCachedGamePayload = {
  user: string
  cached_at: string
  payload: unknown
}

export type SagaOfflineSnapshot = {
  user: string
  sync_status: SagaSyncStatus
  updated_at: string
  last_successful_sync_at?: string
  cached_game?: SagaCachedGamePayload
  queued_events: SagaQueuedEvent[]
}

const STORAGE_PREFIX = 'saga:offline:'
const QUEUE_LIMIT = 200

function nowIso(): string {
  return new Date().toISOString()
}

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function hasLocalStorage(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage
  } catch {
    return false
  }
}

function storageKey(user: string): string {
  const normalized = String(user || 'anonymous').trim() || 'anonymous'
  return `${STORAGE_PREFIX}${normalized}`
}

export function createClientEventId(prefix = 'evt'): string {
  const cryptoObj = typeof crypto !== 'undefined' ? crypto : undefined
  const random =
    cryptoObj && 'randomUUID' in cryptoObj
      ? cryptoObj.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`

  return `${prefix}_${random}`
}

export function emptyOfflineSnapshot(user: string): SagaOfflineSnapshot {
  return {
    user,
    sync_status:
      typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'online',
    updated_at: nowIso(),
    queued_events: [],
  }
}

export function loadOfflineSnapshot(user: string): SagaOfflineSnapshot {
  const fallback = emptyOfflineSnapshot(user)

  if (!hasLocalStorage()) {
    return fallback
  }

  const loaded = safeJsonParse<SagaOfflineSnapshot>(
    window.localStorage.getItem(storageKey(user)),
    fallback
  )

  return {
    ...fallback,
    ...loaded,
    user,
    queued_events: Array.isArray(loaded.queued_events) ? loaded.queued_events : [],
  }
}

export function saveOfflineSnapshot(snapshot: SagaOfflineSnapshot): SagaOfflineSnapshot {
  const cleanSnapshot: SagaOfflineSnapshot = {
    ...snapshot,
    updated_at: nowIso(),
    queued_events: snapshot.queued_events.slice(-QUEUE_LIMIT),
  }

  if (hasLocalStorage()) {
    try {
    window.localStorage.setItem(storageKey(cleanSnapshot.user), JSON.stringify(cleanSnapshot))
    } catch (e) { console.warn('Storage quota exceeded', e); }
  }

  return cleanSnapshot
}

export function clearOfflineSnapshot(user: string): void {
  if (hasLocalStorage()) {
    window.localStorage.removeItem(storageKey(user))
  }
}

export function setSyncStatus(user: string, syncStatus: SagaSyncStatus): SagaOfflineSnapshot {
  const snapshot = loadOfflineSnapshot(user)
  return saveOfflineSnapshot({
    ...snapshot,
    sync_status: syncStatus,
  })
}

export function cacheGamePayload(user: string, payload: unknown): SagaOfflineSnapshot {
  const snapshot = loadOfflineSnapshot(user)

  return saveOfflineSnapshot({
    ...snapshot,
    sync_status: 'online',
    cached_game: {
      user,
      cached_at: nowIso(),
      payload,
    },
  })
}

export function getCachedGamePayload(user: string): SagaCachedGamePayload | undefined {
  return loadOfflineSnapshot(user).cached_game
}

// Aqui vivian el encolado, los reintentos y el armado del envio de la
// SEGUNDA cola, la de localStorage. La cola es una y vive en missionPack.ts.
// Lo que queda de este fichero es el estado de sincronizacion que se pinta
// en pantalla, la partida guardada y las fotos pendientes.

let nextAllowedSyncTime = 0;

export async function flushOfflineEvents(
  user: string,
  _syncEndpoint = '/api/events/sync',
  fetchImpl: typeof fetch = fetch
): Promise<SagaOfflineSnapshot> {
  const snapshot = loadOfflineSnapshot(user)

  // Debouncing: si estamos en cooldown por fallo de red, no reintentar
  if (Date.now() < nextAllowedSyncTime) {
    return snapshot
  }

  await mudarColaVieja(user).catch(() => undefined)

  const resultado = await syncPendingOfflineEvents(user).catch(() => ({
    status: 'error' as const,
  }))

  if (resultado.status === 'error') {
    nextAllowedSyncTime = Date.now() + 15000 // Cooldown de 15 segundos
  } else {
    nextAllowedSyncTime = 0
  }

  // Las fotos y la mochila van por su cuenta y no bloquean: si fallan, se
  // reintentan en el siguiente ciclo.
  void flushOfflinePhotos(user, fetchImpl).catch(() => {})
  void syncInventoryToServer(user, fetchImpl).catch(() => {})

  const updatedSnapshot = loadOfflineSnapshot(user)

  return saveOfflineSnapshot({
    ...updatedSnapshot,
    sync_status: resultado.status === 'ok' ? 'online' : 'error',
    last_successful_sync_at:
      resultado.status === 'ok' ? nowIso() : updatedSnapshot.last_successful_sync_at,
  })
}

/**
 * Pasa a la cola buena lo que un jugador tuviera en la vieja.
 *
 * Sin esto, quien estuviera a mitad de ruta con escaneos sin subir los perdería
 * al actualizar la aplicación: se quedarían en `localStorage` sin que nadie los
 * volviera a mirar. Corre una vez y deja la cola vieja vacía.
 */
async function mudarColaVieja(user: string): Promise<void> {
  const snapshot = loadOfflineSnapshot(user)
  if (!snapshot.queued_events.length) return

  for (const evento of snapshot.queued_events) {
    await queueOfflineEvent({
      user,
      type: evento.type,
      source: evento.source,
      node_id: evento.node_id,
      payload: {
        ...(evento.payload || {}),
        client_event_id: evento.client_event_id,
        mudado_de_la_cola_vieja: true,
      },
    }).catch(() => undefined)
  }

  saveOfflineSnapshot({ ...snapshot, queued_events: [] })
}

export async function fetchGamePayloadLocalFirst<T = unknown>(
  user: string,
  endpoint = `/api/game/${encodeURIComponent(user)}`,
  fetchImpl: typeof fetch = fetch
): Promise<{
  payload: T | undefined
  source: 'network' | 'cache' | 'none'
  snapshot: SagaOfflineSnapshot
}> {
  try {
    const response = await fetchImpl(endpoint)

    if (!response.ok) {
      throw new Error(`game payload failed with HTTP ${response.status}`)
    }

    const payload = (await response.json()) as T
    const snapshot = cacheGamePayload(user, payload)

    return {
      payload,
      source: 'network',
      snapshot,
    }
  } catch {
    const cached = getCachedGamePayload(user)
    const snapshot = setSyncStatus(
      user,
      typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'error'
    )

    return {
      payload: cached?.payload as T | undefined,
      source: cached ? 'cache' : 'none',
      snapshot,
    }
  }
}

/**
 * Sync the player's inventory snapshot to the server independently of event queues.
 * This ensures the Admin panel can always see current inventory even when offline events are empty.
 */
/**
 * Huella de la mochila ya subida, para no volver a mandar lo mismo.
 *
 * Vive en memoria a propósito: tras recargar la aplicación se sube una vez y
 * ya, que es barato y evita depender de que el servidor y el móvil coincidan
 * en algo guardado.
 */
const mochilaYaSubida = new Map<string, string>()

function huellaDeLaMochila(snapshot: unknown): string {
  try {
    return JSON.stringify(snapshot)
  } catch {
    // Si no se puede serializar, se manda: más vale de sobra que de menos.
    return `sin-huella-${Date.now()}`
  }
}

/**
 * Sube la mochila, y sólo si ha cambiado.
 *
 * Esto salía en CADA vuelta del ciclo de sincronización —cada 30 segundos— con
 * la mochila entera dentro, cambiara o no. Una mochila no cambia sola: cambia
 * al recoger un objeto o al forjar, y eso pasa un puñado de veces en toda la
 * ruta. El resto eran 120 peticiones por hora y por móvil para decirle al
 * servidor exactamente lo que ya sabía.
 *
 * `forzar` lo usa el avance de un nodo que exige objeto: ahí sí hay que
 * asegurarse de que el servidor tiene la última, porque valida con ella.
 */
export async function syncInventoryToServer(
  user: string,
  fetchImpl: typeof fetch = fetch,
  { forzar = false }: { forzar?: boolean } = {}
): Promise<void> {
  const inventorySnapshot = loadInventorySnapshot(user)
  if (!inventorySnapshot || !inventorySnapshot.items?.length) return

  const huella = huellaDeLaMochila(inventorySnapshot)
  if (!forzar && mochilaYaSubida.get(user) === huella) return

  // Un nodo que exige objeto espera a que esto termine antes de validar, así
  // que si se cuelga se cuelga el avance. Se corta pronto: la mochila vuelve a
  // subir en la siguiente sincronización.
  const abortar = new AbortController()
  const corte = setTimeout(() => abortar.abort(), 6000)

  try {
    const respuesta = await fetchImpl('/api/events/sync', {
      method: 'POST',
      signal: abortar.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        cuerpoDeSincronizacion({ user, events: [], mochila: inventorySnapshot })
      ),
    })

    // Sólo se da por subida si el servidor dijo que sí. Con un fallo se
    // reintenta en la siguiente vuelta, que es justo lo que hace falta cuando
    // se forja algo sin cobertura.
    if (respuesta.ok) mochilaYaSubida.set(user, huella)
  } catch {
    // Silencio a propósito: es de fondo y se reintenta.
  } finally {
    clearTimeout(corte)
  }
}

// ==========================================
// OFFLINE PHOTOS (INDEXEDDB)
// ==========================================

export type OfflinePhoto = {
  id: string
  user: string
  image_data_url: string
  /** Sin GPS al hacerla: sin coordenadas, el servidor usa la última posición en vivo. */
  lat?: number
  lon?: number
  note?: string
  stage_id?: string
  stage_title?: string
  /** Intentos de subida fallidos (red, servidor caído, sin posición). */
  intentos?: number
  /** No se vuelve a intentar antes de esta hora (ms). */
  proximo_intento_ms?: number
  /** El servidor la rechazó y no la va a aceptar nunca: no se reintenta. */
  fallida?: boolean
  motivo_fallo?: MotivoDeFotoFallida
}

export type MotivoDeFotoFallida = 'rechazada' | 'demasiado_grande' | 'cupo_lleno'

/** Lo que se hace con una foto de la cola según lo que contestó el servidor. */
export type DecisionDeSubida =
  | { accion: 'borrar' }
  | { accion: 'fallida'; motivo: MotivoDeFotoFallida }
  | { accion: 'esperar_sesion'; esperaMs: number }
  | { accion: 'reintentar'; esperaMs: number }

/** Cuánto se espera tras el primer fallo; se dobla en cada intento. */
export const ESPERA_FOTO_INICIAL_MS = 15_000
/** Nunca más de esto entre dos intentos de la misma foto. */
export const ESPERA_FOTO_MAXIMA_MS = 30 * 60_000
/** Con la sesión caducada se espera a que la app la renueve (lo hace al cargar la partida). */
export const ESPERA_SESION_MS = 60_000
/** Una subida de foto por la cola no puede tener el candado más que esto. */
export const TIEMPO_SUBIDA_FOTO_MS = 45_000

/**
 * Qué hacer con una foto de la cola según el estado HTTP (`null` = no llegó:
 * sin red o se cortó por tiempo).
 *
 * Antes cualquier fallo se reintentaba en cada ciclo, para siempre: una foto
 * demasiado grande (413), rechazada (400) o con el cupo lleno (429) atascaba la
 * cola entera y gastaba datos y batería cada 30 s toda la ruta, sin que el
 * jugador supiera nada. Ahora:
 *
 * - 2xx: subida, se borra del móvil.
 * - 400/413/415/422/429: el servidor no la va a aceptar nunca. Fallida, se
 *   avisa y no se reintenta.
 * - 401/403: la sesión caducó. No cuenta como intento: se espera a que la app
 *   la renueve.
 * - El resto (sin red, 409 sin posición todavía, 5xx): se reintenta con espera
 *   creciente (15 s, 30 s, 1 min… hasta 30 min).
 */
export function decidirTrasSubida(estado: number | null, intentosPrevios: number): DecisionDeSubida {
  if (estado !== null && estado >= 200 && estado < 300) return { accion: 'borrar' }
  if (estado === 413) return { accion: 'fallida', motivo: 'demasiado_grande' }
  if (estado === 429) return { accion: 'fallida', motivo: 'cupo_lleno' }
  if (estado === 400 || estado === 415 || estado === 422) return { accion: 'fallida', motivo: 'rechazada' }
  if (estado === 401 || estado === 403) return { accion: 'esperar_sesion', esperaMs: ESPERA_SESION_MS }
  const intentos = Math.max(0, Math.round(intentosPrevios || 0))
  return {
    accion: 'reintentar',
    esperaMs: Math.min(ESPERA_FOTO_MAXIMA_MS, ESPERA_FOTO_INICIAL_MS * 2 ** Math.min(intentos, 12)),
  }
}

function getPhotoDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('SagaOfflinePhotos', 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('photos')) {
        db.createObjectStore('photos', { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Guarda una foto para subirla después.
 *
 * `id` es el `client_proof_id`: si la subida directa ya lo usó, la de la cola
 * manda el MISMO y el servidor reconoce la foto en vez de duplicarla (por si la
 * primera sí llegó y sólo se perdió la respuesta).
 */
export async function saveOfflinePhoto(
  photo: Omit<OfflinePhoto, 'id'> & { id?: string }
): Promise<string> {
  const id = photo.id && eFotoPendente(photo.id) ? photo.id : createClientEventId('photo')
  const db = await getPhotoDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readwrite')
    const store = tx.objectStore('photos')
    store.put({ ...photo, id })
    tx.oncomplete = () => resolve(id)
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * Las fotos que aun no han subido.
 *
 * Se pintan igual que las demas mientras esperan: sin esto el jugador hace la
 * foto en el monte, no aparece por ningun lado, y da por hecho que ha fallado.
 */
export async function listarFotosPendentes(user: string): Promise<OfflinePhoto[]> {
  return getOfflinePhotos(user).catch(() => [])
}

async function getOfflinePhotos(user: string): Promise<OfflinePhoto[]> {
  const db = await getPhotoDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readonly')
    const store = tx.objectStore('photos')
    const request = store.getAll()
    request.onsuccess = () => {
      const all = request.result as OfflinePhoto[]
      resolve(all.filter((p) => p.user === user))
    }
    request.onerror = () => reject(request.error)
  })
}

async function updateOfflinePhoto(photo: OfflinePhoto): Promise<void> {
  const db = await getPhotoDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readwrite')
    tx.objectStore('photos').put(photo)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function deleteOfflinePhoto(id: string): Promise<void> {
  const db = await getPhotoDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readwrite')
    const store = tx.objectStore('photos')
    store.delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Borra una foto que todavia no habia subido: no existe en el servidor. */
export async function borrarFotoPendente(id: string): Promise<void> {
  await deleteOfflinePhoto(id).catch(() => {})
}

/** Los ids de las fotos guardadas en el movil empiezan asi. */
export function eFotoPendente(id: string): boolean {
  return String(id || '').startsWith('photo_')
}

// ---- Borrados que no llegaron al servidor -----------------------------
//
// Borrar una foto sin cobertura daba "load failed" y no borraba nada, asi que
// el jugador lo intentaba una y otra vez. Se apuntan y se ejecutan cuando
// vuelva la red.
const CLAVE_BORRADOS = 'saga:fotos-por-borrar:'

function lerBorradosPendentes(user: string): string[] {
  if (!hasLocalStorage()) return []
  return safeJsonParse<string[]>(window.localStorage.getItem(CLAVE_BORRADOS + user), [])
}

function gardarBorradosPendentes(user: string, ids: string[]) {
  if (!hasLocalStorage()) return
  try {
    window.localStorage.setItem(CLAVE_BORRADOS + user, JSON.stringify(ids.slice(-100)))
  } catch {
    /* sin sitio: se pierde el apunte, no la partida */
  }
}

export function encolarBorradoDeFoto(user: string, proofId: string) {
  const ids = lerBorradosPendentes(user)
  if (ids.includes(proofId)) return
  gardarBorradosPendentes(user, [...ids, proofId])
}

async function flushBorradosDeFotos(user: string, fetchImpl: typeof fetch = fetch) {
  const ids = lerBorradosPendentes(user)
  if (!ids.length) return

  const quedan: string[] = []
  for (const id of ids) {
    try {
      const res = await fetchImpl(
        `/api/field-proofs/${encodeURIComponent(id)}?user=${encodeURIComponent(user)}`,
        { method: 'DELETE' }
      )
      // Un 404 tambien vale: si ya no esta, el borrado esta hecho.
      if (!res.ok && res.status !== 404) quedan.push(id)
    } catch {
      quedan.push(id)
    }
  }
  gardarBorradosPendentes(user, quedan)
}

/**
 * Una subida cada vez.
 *
 * Esto lo llaman varios sitios a la vez -el ciclo de sincronizacion, el final
 * de la cola de eventos, el refresco-. Sin candado, dos vueltas simultaneas
 * subian la MISMA foto antes de que la primera llegase a borrarla del movil, y
 * en el servidor aparecia repetida dos y tres veces. Y la copia de mas ya no se
 * podia quitar desde el movil.
 *
 * El candado caduca: cada subida tiene su tiempo máximo, pero si algo se queda
 * colgado por debajo (IndexedDB que no contesta) la cola no puede quedarse
 * cerrada para siempre.
 */
let subindoFotosDesde = 0
const CANDADO_DE_FOTOS_MAXIMO_MS = 3 * 60_000

/** Avisa a la pantalla de que hay fotos que no van a subir. */
function avisarFotoFallida(user: string, foto: OfflinePhoto) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent('saga:foto-fallida', {
      detail: { user, id: foto.id, motivo: foto.motivo_fallo },
    })
  )
}

/** Las fotos que el servidor rechazó para siempre, para enseñárselas al jugador. */
export async function listarFotosFallidas(user: string): Promise<OfflinePhoto[]> {
  const fotos = await getOfflinePhotos(user).catch(() => [])
  return fotos.filter((foto) => foto.fallida)
}

/** Subida de UNA foto de la cola, con su tiempo máximo. Devuelve el estado HTTP o null. */
async function subirFotoDeLaCola(photo: OfflinePhoto, fetchImpl: typeof fetch): Promise<number | null> {
  const abortar = typeof AbortController !== 'undefined' ? new AbortController() : null
  const corte = setTimeout(() => abortar?.abort(), TIEMPO_SUBIDA_FOTO_MS)
  try {
    const cuerpo: Record<string, unknown> = {
      user: photo.user,
      image_data_url: photo.image_data_url,
      note: photo.note,
      stage_id: photo.stage_id,
      stage_title: photo.stage_title,
      client_proof_id: photo.id,
    }
    if (typeof photo.lat === 'number' && typeof photo.lon === 'number') {
      cuerpo.lat = photo.lat
      cuerpo.lon = photo.lon
    }
    const response = await fetchImpl('/api/field-proofs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
      signal: abortar?.signal,
    })
    return response.status
  } catch {
    return null
  } finally {
    clearTimeout(corte)
  }
}

export async function flushOfflinePhotos(user: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  void flushBorradosDeFotos(user, fetchImpl).catch(() => {})

  const ahora = Date.now()
  if (subindoFotosDesde && ahora - subindoFotosDesde < CANDADO_DE_FOTOS_MAXIMO_MS) return
  subindoFotosDesde = ahora

  try {
    const photos = await getOfflinePhotos(user).catch(() => [])
    if (!photos.length) return

    for (const photo of photos) {
      if (photo.fallida) continue
      if (photo.proximo_intento_ms && Date.now() < photo.proximo_intento_ms) continue

      const estado = await subirFotoDeLaCola(photo, fetchImpl)
      const decision = decidirTrasSubida(estado, photo.intentos || 0)

      if (decision.accion === 'borrar') {
        await deleteOfflinePhoto(photo.id).catch(() => {})

        /**
         * Avisar en cuanto sube, o se ve dos veces.
         *
         * La copia local se pinta mientras espera, y la de verdad llega
         * cuando sube. Si nadie avisa, la pantalla se queda con las dos
         * -"fotos de campo 1/2", la misma foto repetida- hasta el siguiente
         * refresco, o para siempre si ya no viene ninguno.
         */
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('saga:foto-subida', { detail: { user } }))
        }
        continue
      }

      if (decision.accion === 'fallida') {
        const fallida = { ...photo, fallida: true, motivo_fallo: decision.motivo }
        await updateOfflinePhoto(fallida).catch(() => {})
        avisarFotoFallida(user, fallida)
        continue
      }

      if (decision.accion === 'esperar_sesion') {
        // Sin contar intento, y sin probar las demás: todas darían lo mismo.
        await updateOfflinePhoto({ ...photo, proximo_intento_ms: Date.now() + decision.esperaMs }).catch(
          () => {}
        )
        break
      }

      await updateOfflinePhoto({
        ...photo,
        intentos: (photo.intentos || 0) + 1,
        proximo_intento_ms: Date.now() + decision.esperaMs,
      }).catch(() => {})
      // Sin red no tiene sentido seguir con las demás en esta vuelta.
      if (estado === null) break
    }
  } finally {
    subindoFotosDesde = 0
  }
}
