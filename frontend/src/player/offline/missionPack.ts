import type { PlayerGamePayload, PlayerStage, PublicConfig } from '../../types/player'
import { loadInventorySnapshot, markInventoryItemUsed } from './inventory'

const DB_NAME = 'saga-engine-offline-v1'
const DB_VERSION = 1

const STORE_MISSION_PACKS = 'mission_packs'
const STORE_LOCAL_PROGRESS = 'local_progress'
const STORE_EVENT_QUEUE = 'event_queue'

export type MissionPack = {
  id: string
  schema_version: 'v1'
  user: string
  downloaded_at: string
  source_url: string
  config: PublicConfig
  payload: PlayerGamePayload
  stage_count: number
  current_level: number
  finished: boolean
}

export type LocalProgressSnapshot = {
  id: string
  user: string
  updated_at: string
  level: number
  finished: boolean
  current_stage_id?: number | string
  completed_stage_count: number
}

export type OfflineEventStatus = 'pending' | 'syncing' | 'synced' | 'failed'

export type OfflineEvent = {
  id: string
  user: string
  type: string
  created_at: string
  status: OfflineEventStatus
  retry_count: number
  payload: Record<string, unknown>
  source?: string
  team_id?: string
  node_id?: string | number
  backend_event_id?: string
  last_error?: string
}

export type OfflineMissionSummary = {
  hasPack: boolean
  downloadedAt?: string
  stageCount: number
  currentLevel: number
  finished: boolean
  pendingEvents: number
  lastProgressAt?: string
}

function missionPackId(user: string) {
  return `mission:${user || 'PLAYER 1'}`
}

function progressId(user: string) {
  return `progress:${user || 'PLAYER 1'}`
}

function nowIso() {
  return new Date().toISOString()
}

function openOfflineDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available on this device.'))
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error || new Error('Could not open offline DB.'))

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(STORE_MISSION_PACKS)) {
        db.createObjectStore(STORE_MISSION_PACKS, { keyPath: 'id' })
      }

      if (!db.objectStoreNames.contains(STORE_LOCAL_PROGRESS)) {
        db.createObjectStore(STORE_LOCAL_PROGRESS, { keyPath: 'id' })
      }

      if (!db.objectStoreNames.contains(STORE_EVENT_QUEUE)) {
        const queue = db.createObjectStore(STORE_EVENT_QUEUE, { keyPath: 'id' })
        queue.createIndex('status', 'status', { unique: false })
        queue.createIndex('user', 'user', { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
  })
}

function readRecord<T>(storeName: string, id: string): Promise<T | null> {
  return openOfflineDb().then(
    (db) =>
      new Promise<T | null>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly')
        const store = tx.objectStore(storeName)
        const request = store.get(id)

        request.onerror = () => reject(request.error || new Error(`Could not read ${storeName}.`))
        request.onsuccess = () => resolve((request.result as T | undefined) || null)

        tx.oncomplete = () => db.close()
        tx.onerror = () => {
          db.close()
          reject(tx.error || new Error(`Transaction failed for ${storeName}.`))
        }
      })
  )
}

function writeRecord<T>(storeName: string, record: T): Promise<T> {
  return openOfflineDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite')
        const store = tx.objectStore(storeName)
        const request = store.put(record)

        request.onerror = () => reject(request.error || new Error(`Could not write ${storeName}.`))
        request.onsuccess = () => resolve(record)

        tx.oncomplete = () => db.close()
        tx.onerror = () => {
          db.close()
          reject(tx.error || new Error(`Transaction failed for ${storeName}.`))
        }
      })
  )
}

function getAllRecords<T>(storeName: string): Promise<T[]> {
  return openOfflineDb().then(
    (db) =>
      new Promise<T[]>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly')
        const store = tx.objectStore(storeName)
        const request = store.getAll()

        request.onerror = () => reject(request.error || new Error(`Could not list ${storeName}.`))
        request.onsuccess = () => resolve((request.result as T[]) || [])

        tx.oncomplete = () => db.close()
        tx.onerror = () => {
          db.close()
          reject(tx.error || new Error(`Transaction failed for ${storeName}.`))
        }
      })
  )
}

function updateOfflineEvent(event: OfflineEvent) {
  return writeRecord(STORE_EVENT_QUEUE, event)
}

function eventToSyncPayload(event: OfflineEvent) {
  return {
    client_event_id: event.id,
    type: event.type,
    source: event.source || 'offline_queue',
    team_id: event.team_id,
    node_id: event.node_id,
    payload: {
      ...event.payload,
      local_event_id: event.id,
      local_created_at: event.created_at,
      retry_count: event.retry_count,
    },
  }
}

export async function getQueuedOfflineEvents(user: string) {
  const events = await getAllRecords<OfflineEvent>(STORE_EVENT_QUEUE)
  return events.filter((event) => event.user === user && event.status !== 'synced')
}

export async function syncPendingOfflineEvents(user: string) {
  const events = await getQueuedOfflineEvents(user)
  const syncable = events.filter((event) => event.status === 'pending' || event.status === 'failed')

  if (syncable.length === 0) {
    return {
      status: 'ok' as const,
      attempted: 0,
      synced: 0,
      failed: 0,
    }
  }

  const syncing = await Promise.all(
    syncable.map((event) =>
      updateOfflineEvent({
        ...event,
        status: 'syncing',
        last_error: undefined,
      })
    )
  )

  try {
    const response = await fetch('/api/events/sync', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user,
        events: syncing.map(eventToSyncPayload),
      }),
    })

    if (!response.ok) {
      throw new Error(`Sync failed: HTTP ${response.status}`)
    }

    const payload = (await response.json()) as {
      status?: string
      events?: Array<{
        id?: string
        type?: string
        status?: string
        client_event_id?: string
        error?: string
        duplicate?: boolean
      }>
    }

    if (payload.status !== 'ok') {
      throw new Error('Sync failed: backend rejected the event queue.')
    }

    let syncedCount = 0
    let failedCount = 0

    const backendByClientId = new Map(
      (payload.events || [])
        .filter((event) => Boolean(event?.client_event_id))
        .map((event) => [String(event.client_event_id), event] as const)
    )

    await Promise.all(
      syncing.map((event, index) => {
        const backendEvent = backendByClientId.get(event.id) || payload.events?.[index]

        const backendStatus = String(backendEvent?.status || '').toLowerCase()

        const isSynced =
          backendEvent?.duplicate === true ||
          ['pending', 'synced', 'ok', 'applied', 'ignored'].includes(backendStatus)

        if (isSynced) syncedCount += 1
        else failedCount += 1

        return updateOfflineEvent({
          ...event,
          status: isSynced ? 'synced' : 'failed',
          backend_event_id: backendEvent?.id,
          last_error: isSynced
            ? undefined
            : backendEvent?.error || backendStatus || 'Backend did not accept this event.',
        })
      })
    )

    return {
      status: failedCount ? ('error' as const) : ('ok' as const),
      attempted: syncing.length,
      synced: syncedCount,
      failed: failedCount,
      message: failedCount ? `${failedCount} offline event(s) need review.` : undefined,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown sync error'

    await Promise.all(
      syncing.map((event) =>
        updateOfflineEvent({
          ...event,
          status: 'failed',
          retry_count: event.retry_count + 1,
          last_error: message,
        })
      )
    )

    return {
      status: 'error' as const,
      attempted: syncing.length,
      synced: 0,
      failed: syncing.length,
      message,
    }
  }
}

export function buildMissionPack(args: {
  user: string
  config: PublicConfig
  payload: PlayerGamePayload
}): MissionPack {
  const sourceUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}${window.location.search}`
      : ''

  return {
    id: missionPackId(args.user),
    schema_version: 'v1',
    user: args.user,
    downloaded_at: nowIso(),
    source_url: sourceUrl,
    config: args.config,
    payload: args.payload,
    stage_count: Array.isArray(args.payload.stages) ? args.payload.stages.length : 0,
    current_level: args.payload.level || 0,
    finished: Boolean(args.payload.finished),
  }
}

export async function saveMissionPack(args: {
  user: string
  config: PublicConfig
  payload: PlayerGamePayload
}) {
  const pack = buildMissionPack(args)
  await writeRecord(STORE_MISSION_PACKS, pack)
  await saveLocalProgressSnapshot(args.payload)
  return pack
}

export function getStoredMissionPack(user: string) {
  return readRecord<MissionPack>(STORE_MISSION_PACKS, missionPackId(user))
}

export function saveLocalProgressSnapshot(payload: PlayerGamePayload) {
  const snapshot: LocalProgressSnapshot = {
    id: progressId(payload.user),
    user: payload.user,
    updated_at: nowIso(),
    level: payload.level || 0,
    finished: Boolean(payload.finished),
    current_stage_id: payload.current_stage?.id,
    completed_stage_count: Math.max(0, payload.level || 0),
  }

  return writeRecord(STORE_LOCAL_PROGRESS, snapshot)
}

export function getLocalProgressSnapshot(user: string) {
  return readRecord<LocalProgressSnapshot>(STORE_LOCAL_PROGRESS, progressId(user))
}

export function queueOfflineEvent(args: {
  user: string
  type: string
  payload: Record<string, unknown>
  source?: string
  team_id?: string
  node_id?: string | number
}) {
  const event: OfflineEvent = {
    id: `${args.user}:${args.type}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
    user: args.user,
    type: args.type,
    created_at: nowIso(),
    status: 'pending',
    retry_count: 0,
    payload: args.payload,
    source: args.source,
    team_id: args.team_id,
    node_id: args.node_id,
  }

  return writeRecord(STORE_EVENT_QUEUE, event)
}

export async function getOfflineMissionSummary(user: string): Promise<OfflineMissionSummary> {
  const [pack, progress, events] = await Promise.all([
    getStoredMissionPack(user),
    getLocalProgressSnapshot(user),
    getAllRecords<OfflineEvent>(STORE_EVENT_QUEUE),
  ])

  const pendingEvents = events.filter(
    (event) => event.user === user && event.status !== 'synced'
  ).length

  return {
    hasPack: Boolean(pack),
    downloadedAt: pack?.downloaded_at,
    stageCount: pack?.stage_count || 0,
    currentLevel: progress?.level ?? pack?.current_level ?? 0,
    finished: progress?.finished ?? pack?.finished ?? false,
    pendingEvents,
    lastProgressAt: progress?.updated_at,
  }
}

function cleanCode(value: unknown) {
  return String(value || '')
    .trim()
    .toUpperCase()
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function readStageConfig(stage: PlayerStage | null): Record<string, unknown> {
  const raw = asRecord(stage)
  return {
    ...asRecord(raw.config),
    ...asRecord(asRecord(raw.minigame).config),
  }
}

function stageAcceptsLocalCode(stage: PlayerStage | null, code: string) {
  const submitted = cleanCode(code)
  if (!stage || !submitted) return false

  const raw = asRecord(stage)
  const success = asRecord(raw.success)
  const conditions = Array.isArray(success.conditions) ? success.conditions : []

  for (const condition of conditions) {
    const expected = cleanCode(asRecord(condition).value)
    if (expected && expected === submitted) return true
  }

  const config = readStageConfig(stage)
  for (const key of ['answer', 'rune', 'code', 'success_code']) {
    const expected = cleanCode(config[key])
    if (expected && expected === submitted) return true
  }

  return submitted === 'OK'
}

function readLocalRequirement(stage: PlayerStage | null) {
  if (!stage) return null

  const raw = asRecord(stage)
  const requirements = asRecord(raw.requirements)
  const items = Array.isArray(requirements.items) ? requirements.items : []
  const first = asRecord(items[0])
  const config = readStageConfig(stage)

  const itemId = String(
    first.item_id || first.required_item_id || config.required_item_id || ''
  ).trim()
  const label = String(
    first.label || first.required_item_label || config.required_item_label || itemId
  ).trim()
  const quantityRaw =
    first.quantity || first.required_item_quantity || config.required_item_quantity || 1
  const quantity = Number.isFinite(Number(quantityRaw))
    ? Math.max(1, Math.floor(Number(quantityRaw)))
    : 1
  const consumeRaw = first.consume ?? first.required_item_consume ?? config.required_item_consume
  const consume = consumeRaw === true || String(consumeRaw || '').toLowerCase() === 'true'

  if (!itemId) return null
  return { itemId, label, quantity, consume }
}

function countOwnedLocalItems(user: string, itemId: string) {
  return loadInventorySnapshot(user)
    .items.filter((item) => item.item_id === itemId && item.state !== 'used')
    .reduce((total, item) => total + Math.max(0, item.quantity || 0), 0)
}

function buildPayloadWithLocalLevel(
  payload: PlayerGamePayload,
  nextLevel: number
): PlayerGamePayload {
  const stages = Array.isArray(payload.stages) ? payload.stages : []
  const finished = nextLevel >= stages.length

  return {
    ...payload,
    level: nextLevel,
    finished,
    current_stage: finished ? null : stages[nextLevel] || null,
  }
}

async function saveMissionPackPayloadProgress(payload: PlayerGamePayload) {
  const existing = await getStoredMissionPack(payload.user)
  const pack: MissionPack = existing
    ? {
        ...existing,
        payload,
        current_level: payload.level || 0,
        finished: Boolean(payload.finished),
        stage_count: Array.isArray(payload.stages) ? payload.stages.length : existing.stage_count,
      }
    : buildMissionPack({
        user: payload.user,
        config: {} as PublicConfig,
        payload,
      })

  await writeRecord(STORE_MISSION_PACKS, pack)
  await saveLocalProgressSnapshot(payload)
  return pack
}

export async function advanceLocalProgress(args: {
  payload: PlayerGamePayload
  currentStage: PlayerStage | null
  code: string
}) {
  const payload = args.payload
  const stage = args.currentStage
  const code = cleanCode(args.code)

  if (!stage) return { ok: false as const, reason: 'missing_stage' }
  if (!stageAcceptsLocalCode(stage, code)) return { ok: false as const, reason: 'invalid_code' }

  const requirement = readLocalRequirement(stage)
  const owned = requirement ? countOwnedLocalItems(payload.user, requirement.itemId) : 0

  if (requirement && owned < requirement.quantity) {
    return {
      ok: false as const,
      reason: 'missing_required_item',
      requirement: { ...requirement, owned, ok: false },
    }
  }

  if (requirement?.consume) {
    markInventoryItemUsed(payload.user, requirement.itemId, requirement.quantity)
  }

  const currentLevel = Math.max(0, Number(payload.level || 0))
  const nextPayload = buildPayloadWithLocalLevel(payload, currentLevel + 1)

  await queueOfflineEvent({
    user: payload.user,
    type: 'node_completed',
    source: 'offline_queue',
    node_id: stage.id,
    payload: {
      code,
      local_progress: true,
      stage_title: stage.title,
      level_before: currentLevel,
      level_after: currentLevel + 1,
      requirement: requirement
        ? { ...requirement, owned, ok: true }
        : { required: false, ok: true },
    },
  })

  await saveMissionPackPayloadProgress(nextPayload)

  return {
    ok: true as const,
    payload: nextPayload,
    requirement: requirement ? { ...requirement, owned, ok: true } : null,
  }
}
