type JsonObject = Record<string, unknown>

const DB_NAME = 'saga-engine-offline-v1'
const DB_VERSION = 1
const STORE_MISSION_PACKS = 'mission_packs'
const STORE_LOCAL_PROGRESS = 'local_progress'
const STORE_EVENT_QUEUE = 'event_queue'

function nowIso() {
  return new Date().toISOString()
}

function missionKey(user: string) {
  return `mission:${user || 'PLAYER 1'}`
}

function progressKey(user: string) {
  return `progress:${user || 'PLAYER 1'}`
}

function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available.'))
      return
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onerror = () => reject(req.error || new Error('Could not open offline DB.'))

    req.onupgradeneeded = () => {
      const db = req.result

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

    req.onsuccess = () => resolve(req.result)
  })
}

function putOfflineRecord(storeName: string, value: JsonObject): Promise<void> {
  return openOfflineDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite')
        const store = tx.objectStore(storeName)
        const put = store.put(value)

        put.onerror = () => reject(put.error || new Error(`Could not write ${storeName}.`))

        tx.oncomplete = () => {
          db.close()
          resolve()
        }

        tx.onerror = () => {
          db.close()
          reject(tx.error || new Error(`Transaction failed for ${storeName}.`))
        }
      }),
  )
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })

  if (!res.ok) {
    throw new Error(`Offline preload failed: HTTP ${res.status} for ${url}`)
  }

  return res.json() as Promise<T>
}

export async function saveInitialOfflinePack(user: string) {
  const cleanUser = String(user || 'PLAYER 1').trim() || 'PLAYER 1'
  const stamp = Date.now()

  const [config, payload] = await Promise.all([
    fetchJson<JsonObject>(`/api/config?offline_preload=${stamp}`),
    fetchJson<JsonObject>(`/api/game/${encodeURIComponent(cleanUser)}?offline_preload=${stamp}`),
  ])

  const stages = Array.isArray(payload.stages) ? payload.stages : []
  const level = typeof payload.level === 'number' ? payload.level : 0
  const finished = Boolean(payload.finished)
  const currentStage = payload.current_stage as JsonObject | null | undefined
  const downloadedAt = nowIso()

  const pack = {
    id: missionKey(cleanUser),
    schema_version: 'v1',
    user: cleanUser,
    downloaded_at: downloadedAt,
    source_url:
      typeof window !== 'undefined'
        ? `${window.location.origin}${window.location.pathname}${window.location.search}`
        : '',
    config,
    payload,
    stage_count: stages.length,
    current_level: level,
    finished,
  }

  const progress = {
    id: progressKey(cleanUser),
    user: cleanUser,
    updated_at: downloadedAt,
    level,
    finished,
    current_stage_id:
      currentStage && typeof currentStage === 'object' && 'id' in currentStage
        ? currentStage.id
        : undefined,
    completed_stage_count: Math.max(0, level),
  }

  await putOfflineRecord(STORE_MISSION_PACKS, pack)
  await putOfflineRecord(STORE_LOCAL_PROGRESS, progress)

  return pack
}
