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
  /**
   * Entregas únicas ya hechas en este móvil (`grant_id`): el premio de un
   * minijuego (`reward:<nodo>`), un coleccionable (`collect:<nodo>`), un objeto
   * dado desde el panel (`admin:…`). Se vacían con la mochila en un reinicio.
   */
  grants?: string[]
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
  /** Clave de entrega única: con ella el servidor la cuenta una sola vez. */
  grant_id?: string
}

/** Cuántas entregas únicas se recuerdan como mucho. */
const MAX_GRANTS = 400

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

  const known = new Set(snapshot.items.map((item) => item.item_id))
  const timestamp = nowIso()
  let added = 0
  // Los ids que entran AHORA desde el servidor ya traen todas sus entregas
  // contadas: a ésos no se les vuelve a sumar ninguna.
  const nuevosAhora = new Set<string>()

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
    nuevosAhora.add(itemId)
    added += 1
  }

  /**
   * Entregas del servidor que este móvil todavía no tiene.
   *
   * Sólo se incorporaban ids NUEVOS: una unidad de más de un objeto que el
   * jugador ya llevaba (el «Dar objeto» del panel con la llave que ya tenía)
   * no le llegaba nunca, y el nodo que pedía dos seguía cerrado. Cada entrega
   * viaja con su `grant_id`; se suma una vez y se apunta.
   */
  const remotas = Array.isArray(remoteRecord.grants) ? (remoteRecord.grants as unknown[]) : []
  const hechas = new Set(snapshot.grants || [])
  let entregasNuevas = 0
  for (const bruta of remotas) {
    const entrega = bruta && typeof bruta === 'object' ? (bruta as Record<string, unknown>) : {}
    const clave = cleanText(entrega.grant_id, '', 160)
    const itemId = cleanText(entrega.item_id, '', 120)
    if (!clave || !itemId || hechas.has(clave)) continue
    hechas.add(clave)
    entregasNuevas += 1
    if (nuevosAhora.has(itemId)) continue
    const cantidad = Math.max(1, Math.min(999, Math.round(Number(entrega.quantity) || 1)))
    const existente = snapshot.items.find((item) => item.item_id === itemId)
    // Sin el objeto en el móvil y sin que el servidor lo liste es que ya no
    // queda ninguna unidad (se gastó): se apunta la entrega y no se resucita.
    if (!existente) continue
    existente.quantity = (existente.state === 'used' ? 0 : existente.quantity) + cantidad
    existente.state = 'collected'
    existente.updated_at = timestamp
  }

  if (added === 0 && entregasNuevas === 0) return snapshot
  return saveInventorySnapshot({ ...snapshot, grants: [...hechas].slice(-MAX_GRANTS) })
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
    void Promise.resolve(
      queuePhysicalEvent({
        user,
        source: input.source === 'nfc' ? 'nfc' : input.source === 'manual' ? 'manual' : 'qr',
        node_id: input.node_id,
        physical_id: input.physical_id || itemId,
        payload: {
          inventory_item_id: itemId,
          inventory_label: nextItem.label,
          // Las unidades de ESTA recogida, no el total: el servidor suma los
          // eventos, y mandando el total dos recogidas de 1 contaban 1 + 2.
          inventory_quantity: quantity,
          inventory_total: nextItem.quantity,
          inventory_action: 'collected',
          ...(input.grant_id ? { grant_id: cleanText(input.grant_id, '', 160) } : {}),
        },
      })
    ).catch(() => undefined)
  }

  return next
}

/** ¿Esta entrega ya se hizo en este móvil? */
export function yaEntregado(user: string, grantId: string): boolean {
  const clave = cleanText(grantId, '', 160)
  if (!clave) return false
  return (loadInventorySnapshot(user).grants || []).includes(clave)
}

function anotarEntrega(user: string, grantId: string): void {
  const clave = cleanText(grantId, '', 160)
  if (!clave) return
  const snapshot = loadInventorySnapshot(user)
  const previas = snapshot.grants || []
  if (previas.includes(clave)) return
  saveInventorySnapshot({ ...snapshot, grants: [...previas, clave].slice(-MAX_GRANTS) })
}

/**
 * Entrega un objeto UNA vez por `grant_id` (premio de un minijuego, coleccionable).
 *
 * El nodo se puede reintentar —un avance que se queda colgado, el candado que
 * suelta, el jugador que vuelve a pulsar— y cada intento entregaba otra vez.
 * Aquí se mete en la mochila y en la cola una sola vez; el servidor, además,
 * cuenta cada `grant_id` una sola vez aunque le llegue repetido.
 */
export function entregarUnaVez(
  input: CollectInventoryItemInput & { grant_id: string }
): { entregado: boolean; snapshot: InventorySnapshot } {
  const user = cleanText(input.user, '', 120)
  if (yaEntregado(user, input.grant_id)) {
    return { entregado: false, snapshot: loadInventorySnapshot(user) }
  }
  collectInventoryItem({ ...input, queue_event: input.queue_event !== false })
  anotarEntrega(user, input.grant_id)
  return { entregado: true, snapshot: loadInventorySnapshot(user) }
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
