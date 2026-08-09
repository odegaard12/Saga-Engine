import { loadInventorySnapshot } from './inventory'

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
  attempts: number
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

export function queueOfflineEvent(
  user: string,
  event: Omit<Partial<SagaQueuedEvent>, 'user' | 'created_at' | 'attempts'> & {
    type: string
  }
): SagaOfflineSnapshot {
  const snapshot = loadOfflineSnapshot(user)

  const queuedEvent: SagaQueuedEvent = {
    client_event_id: event.client_event_id || createClientEventId('offline'),
    type: event.type,
    user,
    node_id: event.node_id,
    team_id: event.team_id,
    source: event.source || 'offline_queue',
    payload: event.payload || {},
    created_at: nowIso(),
    attempts: 0,
  }

  const existingIds = new Set(snapshot.queued_events.map((item) => item.client_event_id))
  const queued_events = existingIds.has(queuedEvent.client_event_id)
    ? snapshot.queued_events
    : [...snapshot.queued_events, queuedEvent].slice(-QUEUE_LIMIT)

  return saveOfflineSnapshot({
    ...snapshot,
    sync_status:
      typeof navigator !== 'undefined' && navigator.onLine === false
        ? 'offline'
        : snapshot.sync_status,
    queued_events,
  })
}

export function markEventAttempt(
  user: string,
  clientEventId: string,
  errorMessage?: string
): SagaOfflineSnapshot {
  const snapshot = loadOfflineSnapshot(user)

  return saveOfflineSnapshot({
    ...snapshot,
    queued_events: snapshot.queued_events.map((event) => {
      if (event.client_event_id !== clientEventId) return event

      return {
        ...event,
        attempts: event.attempts + 1,
        last_attempt_at: nowIso(),
        last_error: errorMessage,
      }
    }),
  })
}

export function removeQueuedEvents(user: string, clientEventIds: string[]): SagaOfflineSnapshot {
  const ids = new Set(clientEventIds)
  const snapshot = loadOfflineSnapshot(user)

  return saveOfflineSnapshot({
    ...snapshot,
    sync_status: 'online',
    last_successful_sync_at: nowIso(),
    queued_events: snapshot.queued_events.filter((event) => !ids.has(event.client_event_id)),
  })
}

export function buildEventSyncPayload(user: string): {
  user: string
  events: SagaQueuedEvent[]
  inventory_snapshot?: unknown
} {
  const snapshot = loadOfflineSnapshot(user)
  const inventorySnapshot = loadInventorySnapshot(user)

  return {
    user,
    events: snapshot.queued_events,
    inventory_snapshot: inventorySnapshot,
  }
}

export async function flushOfflineEvents(
  user: string,
  syncEndpoint = '/api/events/sync',
  fetchImpl: typeof fetch = fetch
): Promise<SagaOfflineSnapshot> {
  const snapshot = loadOfflineSnapshot(user)

  if (!snapshot.queued_events.length) {
    // No events to flush - but check if there are offline photos
    void flushOfflinePhotos(user, fetchImpl).catch(() => {})
    // still sync inventory silently so Admin can see it
    void syncInventoryToServer(user, fetchImpl).catch(() => {})
    return saveOfflineSnapshot({
      ...snapshot,
      sync_status: 'online',
      last_successful_sync_at: snapshot.last_successful_sync_at || nowIso(),
    })
  }

  saveOfflineSnapshot({
    ...snapshot,
    sync_status: 'syncing',
  })

  // Con cobertura mala esta petición se queda colgada, y como el refresco de la
  // misión la espera antes de seguir, el juego dejaba de actualizarse hasta
  // recargar. Mejor abandonar y reintentar en el siguiente ciclo.
  const abortar = new AbortController()
  const corte = setTimeout(() => abortar.abort(), 12000)

  try {
    const mandar = () =>
      fetchImpl(syncEndpoint, {
        method: 'POST',
        signal: abortar.signal,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildEventSyncPayload(user)),
      })

    let response = await mandar()

    // Igual que el avance: si el pase de jugador ha caducado el servidor
    // rechaza con 403 y la cola se quedaba atascada para siempre, reintentando
    // cada ciclo contra una puerta cerrada. Pedir la partida vuelve a
    // entregar el pase.
    if (response.status === 401 || response.status === 403) {
      await fetchImpl(`/api/game/${encodeURIComponent(user)}`, {
        signal: abortar.signal,
      }).catch(() => undefined)
      response = await mandar()
    }

    if (!response.ok) {
      throw new Error(`sync failed with HTTP ${response.status}`)
    }

    const payload = await response.json().catch(() => ({}))
    const responseEvents: unknown[] = Array.isArray(payload.events) ? payload.events : []

    if (responseEvents.length === 0) {
      throw new Error('sync response did not include event results')
    }

    const acceptedIds = new Set<string>()
    const failedById = new Map<string, string>()

    for (const rawEvent of responseEvents) {
      if (!rawEvent || typeof rawEvent !== 'object') continue

      const event = rawEvent as Record<string, unknown>

      const clientEventId = typeof event.client_event_id === 'string' ? event.client_event_id : ''

      if (!clientEventId) continue

      const status = String(event.status || '')
        .trim()
        .toLowerCase()

      const duplicate = event.duplicate === true

      if (duplicate || ['pending', 'synced', 'ok', 'applied', 'ignored'].includes(status)) {
        acceptedIds.add(clientEventId)
        continue
      }

      failedById.set(clientEventId, String(event.error || status || 'backend rejected event'))
    }

    // After successful event sync, try flushing photos
    void flushOfflinePhotos(user, fetchImpl).catch(() => {})

    if (acceptedIds.size === 0 && failedById.size === 0) {
      throw new Error('sync response could not be matched to queued events')
    }

    const attemptTime = nowIso()

    const queuedEvents = snapshot.queued_events
      .filter((event) => !acceptedIds.has(event.client_event_id))
      .map((event) => {
        const errorMessage = failedById.get(event.client_event_id)

        if (!errorMessage) return event

        return {
          ...event,
          attempts: event.attempts + 1,
          last_attempt_at: attemptTime,
          last_error: errorMessage,
        }
      })

    return saveOfflineSnapshot({
      ...snapshot,
      sync_status: failedById.size > 0 ? 'error' : 'online',
      last_successful_sync_at: acceptedIds.size > 0 ? nowIso() : snapshot.last_successful_sync_at,
      queued_events: queuedEvents,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'sync failed'

    const attemptTime = nowIso()

    return saveOfflineSnapshot({
      ...snapshot,
      sync_status: 'error',
      queued_events: snapshot.queued_events.map((event) => ({
        ...event,
        attempts: event.attempts + 1,
        last_attempt_at: attemptTime,
        last_error: message,
      })),
    })
  } finally {
    clearTimeout(corte)
  }
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
export async function syncInventoryToServer(
  user: string,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const inventorySnapshot = loadInventorySnapshot(user)
  if (!inventorySnapshot || !inventorySnapshot.items?.length) return

  // Un nodo que exige objeto espera a que esto termine antes de validar, así
  // que si se cuelga se cuelga el avance. Se corta pronto: la mochila vuelve a
  // subir en la siguiente sincronización.
  const abortar = new AbortController()
  const corte = setTimeout(() => abortar.abort(), 6000)

  try {
    await fetchImpl('/api/events/sync', {
      method: 'POST',
      signal: abortar.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, events: [], inventory_snapshot: inventorySnapshot }),
    })
  } catch {
    // Silent - this is a best-effort background sync
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
  lat: number
  lon: number
  note?: string
  stage_id?: string
  stage_title?: string
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

export async function saveOfflinePhoto(photo: Omit<OfflinePhoto, 'id'>): Promise<string> {
  const id = createClientEventId('photo')
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
 */
let subindoFotos = false

async function flushOfflinePhotos(user: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  void flushBorradosDeFotos(user, fetchImpl).catch(() => {})

  if (subindoFotos) return
  subindoFotos = true

  try {
    const photos = await getOfflinePhotos(user).catch(() => [])
    if (!photos.length) return

    for (const photo of photos) {
      try {
        const response = await fetchImpl('/api/field-proofs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(photo),
        })
        if (response.ok) {
          await deleteOfflinePhoto(photo.id)

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
        }
      } catch {
        // Se reintenta en el siguiente ciclo.
      }
    }
  } finally {
    subindoFotos = false
  }
}

