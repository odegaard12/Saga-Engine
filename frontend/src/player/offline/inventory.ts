import { queuePhysicalEvent, type PhysicalEventSource } from './physicalEvents'

export type InventoryItemState = 'collected' | 'used' | 'dropped'

export type InventoryItem = {
  item_id: string
  label: string
  state: InventoryItemState
  quantity: number
  source?: PhysicalEventSource | 'system'
  node_id?: string
  physical_id?: string
  collected_at?: string
  updated_at: string
  metadata?: Record<string, unknown>
}

export type InventorySnapshot = {
  user: string
  updated_at: string
  items: InventoryItem[]
}

export type CollectInventoryItemInput = {
  user: string
  item_id: string
  label?: string
  quantity?: number
  source?: PhysicalEventSource | 'system'
  node_id?: string
  physical_id?: string
  metadata?: Record<string, unknown>
  queue_event?: boolean
}

const INVENTORY_STORAGE_PREFIX = 'saga:inventory:'
const MAX_ITEMS = 200
const MAX_TEXT_LENGTH = 160

function nowIso(): string {
  return new Date().toISOString()
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
  return `${INVENTORY_STORAGE_PREFIX}${normalized}`
}

function cleanText(value: unknown, fallback = '', maxLength = MAX_TEXT_LENGTH): string {
  if (typeof value !== 'string') return fallback
  const clean = value.trim()
  return clean ? clean.slice(0, maxLength) : fallback
}

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function cleanMetadata(metadata: Record<string, unknown> = {}): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(metadata)) {
    const cleanKey = cleanText(key, '', 64)
    if (!cleanKey) continue

    if (typeof value === 'string') {
      const cleanValue = cleanText(value)
      if (cleanValue) cleaned[cleanKey] = cleanValue
      continue
    }

    if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      cleaned[cleanKey] = value
    }
  }

  return cleaned
}

export function emptyInventorySnapshot(user: string): InventorySnapshot {
  return {
    user,
    updated_at: nowIso(),
    items: [],
  }
}

export function loadInventorySnapshot(user: string): InventorySnapshot {
  const fallback = emptyInventorySnapshot(user)

  if (!hasLocalStorage()) {
    return fallback
  }

  const loaded = safeJsonParse<InventorySnapshot>(
    window.localStorage.getItem(storageKey(user)),
    fallback
  )

  return {
    ...fallback,
    ...loaded,
    user,
    items: Array.isArray(loaded.items) ? loaded.items.slice(0, MAX_ITEMS) : [],
  }
}

export function saveInventorySnapshot(snapshot: InventorySnapshot): InventorySnapshot {
  const cleanSnapshot: InventorySnapshot = {
    ...snapshot,
    updated_at: nowIso(),
    items: snapshot.items.slice(0, MAX_ITEMS),
  }

  if (hasLocalStorage()) {
    try {
    window.localStorage.setItem(storageKey(cleanSnapshot.user), JSON.stringify(cleanSnapshot))
    } catch (e) { console.warn('Storage quota exceeded', e); }
  }

  return cleanSnapshot
}

/**
 * Incorpora a la mochila local los objetos que el servidor conoce y aquí no
 * existen todavía.
 *
 * La mochila del jugador es local: se sincroniza HACIA el servidor, pero nunca
 * de vuelta. El payload traía `inventory_snapshot` y nadie lo leía, así que un
 * objeto entregado desde el panel de administración —el rescate obvio si algo
 * falla en el monte— no llegaba nunca al jugador. Con el nodo final exigiendo
 * un objeto fabricado para abrirse, eso dejaba la partida bloqueada sin salida.
 *
 * Sólo se añaden ids que no estén ya en local, en cualquier estado. Si el
 * jugador gastó una pieza al forjar, el servidor puede seguir listándola y
 * fusionar cantidades la resucitaría: lo local manda sobre lo que ya conoce.
 */
export function hydrateInventoryFromServer(user: string, remote: unknown): InventorySnapshot {
  // Si desde administración se hizo "Reset", el servidor deja una marca de
  // tiempo. Todo lo que la mochila local guardara antes de esa marca es de la
  // partida anterior y sobra: sin esto el jugador volvía al nodo 1 llevando
  // encima las piezas —o el Sello ya forjado— de la vez pasada.
  const remoteRecord = remote && typeof remote === 'object' ? (remote as Record<string, unknown>) : {}
  const resetAt = Number(remoteRecord.reset_at) || 0

  if (resetAt > 0) {
    const local = loadInventorySnapshot(user)
    const localAt = Date.parse(local.updated_at || '') || 0
    if (localAt < resetAt && local.items.length > 0) {
      clearInventorySnapshot(user)
    }
  }

  const snapshot = loadInventorySnapshot(user)

  const remoteItems =
    remote && typeof remote === 'object' && Array.isArray((remote as { items?: unknown }).items)
      ? ((remote as { items: unknown[] }).items as Record<string, unknown>[])
      : []

  if (remoteItems.length === 0) return snapshot

  const known = new Set(snapshot.items.map((item) => item.item_id))
  const timestamp = nowIso()
  let added = 0

  for (const raw of remoteItems) {
    const itemId = cleanText(raw?.item_id, '', 120)
    if (!itemId || known.has(itemId)) continue

    const state = String(raw?.state || 'collected')
    if (state === 'used' || state === 'dropped') continue

    const quantity = Math.max(1, Math.min(999, Math.round(Number(raw?.quantity) || 1)))

    snapshot.items.unshift({
      item_id: itemId,
      label: cleanText(raw?.label, itemId),
      state: 'collected',
      quantity,
      source: 'system',
      collected_at: timestamp,
      updated_at: timestamp,
    })

    known.add(itemId)
    added += 1
  }

  if (added === 0) return snapshot
  return saveInventorySnapshot(snapshot)
}

export function clearInventorySnapshot(user: string): void {
  if (hasLocalStorage()) {
    window.localStorage.removeItem(storageKey(user))
  }
}

export function collectInventoryItem(input: CollectInventoryItemInput): InventorySnapshot {
  const user = cleanText(input.user, '', 120)
  const itemId = cleanText(input.item_id, '', 120)

  if (!user) throw new Error('user is required to collect an inventory item')
  if (!itemId) throw new Error('item_id is required to collect an inventory item')

  const snapshot = loadInventorySnapshot(user)
  const existing = snapshot.items.find((item) => item.item_id === itemId)
  const quantity = Math.max(1, Math.min(999, Math.round(input.quantity || 1)))
  const timestamp = nowIso()

  const nextItem: InventoryItem = {
    item_id: itemId,
    label: cleanText(input.label, itemId),
    state: 'collected',
    quantity: existing ? existing.quantity + quantity : quantity,
    source: input.source || existing?.source || 'system',
    node_id: cleanText(input.node_id, existing?.node_id || '', 120) || undefined,
    physical_id: cleanText(input.physical_id, existing?.physical_id || '', 120) || undefined,
    collected_at: existing?.collected_at || timestamp,
    updated_at: timestamp,
    metadata: cleanMetadata({
      ...(existing?.metadata || {}),
      ...(input.metadata || {}),
    }),
  }

  const items = [nextItem, ...snapshot.items.filter((item) => item.item_id !== itemId)].slice(
    0,
    MAX_ITEMS
  )

  const next = saveInventorySnapshot({
    ...snapshot,
    items,
  })

  if (input.queue_event) {
    queuePhysicalEvent({
      user,
      source: input.source === 'nfc' ? 'nfc' : input.source === 'manual' ? 'manual' : 'qr',
      node_id: input.node_id,
      physical_id: input.physical_id || itemId,
      payload: {
        inventory_item_id: itemId,
        inventory_label: nextItem.label,
        inventory_quantity: nextItem.quantity,
        inventory_action: 'collected',
      },
    })
  }

  return next
}

export function markInventoryItemUsed(
  user: string,
  itemId: string,
  quantity = 1
): InventorySnapshot {
  const snapshot = loadInventorySnapshot(user)
  const cleanItemId = cleanText(itemId, '', 120)

  const items = snapshot.items.map((item) => {
    if (item.item_id !== cleanItemId) return item

    const remaining = Math.max(0, item.quantity - Math.max(1, Math.round(quantity)))
    return {
      ...item,
      quantity: remaining,
      state: remaining > 0 ? item.state : 'used',
      updated_at: nowIso(),
    }
  })

  return saveInventorySnapshot({
    ...snapshot,
    items,
  })
}

export function getInventoryItem(user: string, itemId: string): InventoryItem | undefined {
  const cleanItemId = cleanText(itemId, '', 120)
  return loadInventorySnapshot(user).items.find((item) => item.item_id === cleanItemId)
}

export function countInventoryItems(user: string): number {
  return loadInventorySnapshot(user).items.reduce((total, item) => total + item.quantity, 0)
}
