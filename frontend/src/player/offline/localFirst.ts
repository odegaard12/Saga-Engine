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
    window.localStorage.setItem(storageKey(cleanSnapshot.user), JSON.stringify(cleanSnapshot))
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
} {
  const snapshot = loadOfflineSnapshot(user)

  return {
    user,
    events: snapshot.queued_events,
  }
}

export async function flushOfflineEvents(
  user: string,
  syncEndpoint = '/api/events/sync',
  fetchImpl: typeof fetch = fetch
): Promise<SagaOfflineSnapshot> {
  const snapshot = loadOfflineSnapshot(user)

  if (!snapshot.queued_events.length) {
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

  try {
    const response = await fetchImpl(syncEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildEventSyncPayload(user)),
    })

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
