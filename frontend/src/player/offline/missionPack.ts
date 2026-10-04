import type { PlayerGamePayload, PlayerStage, PublicConfig } from '../../types/player'
import {
  loadInventorySnapshot,
  markInventoryItemUsed,
  type InventoryItem,
  type InventorySnapshot,
} from './inventory'
import { esFalloDeRed, notarFalloDeRed, notarRedOk, sinCoberturaAhora } from './redEstado'
import { limpiarRevision, elegirConfigParaGuardar } from './revisiones'
import { countOwnedItems, readStageItemRequirement } from '../rewards/stageItemRequirement'
import { configDelNodo } from '../configDelNodo'

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
  /**
   * Revisión de la misión con la que se bajó este paquete (contrato 5).
   *
   * La pantalla de carga la compara con la que dice el servidor: si no coincide,
   * hay que volver a bajar los nodos. Sin ella (paquetes de antes) se baja una vez.
   */
  mission_revision?: string
  /** Hora del MÓVIL (ms) a la que llegó la configuración guardada. */
  config_recibida_en?: number
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
  /**
   * Número de orden de la cola: crece siempre, nunca depende del reloj.
   *
   * La cola se ordenaba por `created_at`, y el reloj del móvil SE CORRIGE al
   * volver la cobertura (la hora de red pisa la que se fue desviando). Con un
   * salto hacia atrás en mitad de un tramo, el nodo 3 podía quedar «antes»
   * que el 2, subir primero, y perderse. La hora original se sigue mandando
   * -es lo que se lee al revisar la partida-, pero el orden lo da esto.
   */
  seq?: number
  status: OfflineEventStatus
  retry_count: number
  payload: Record<string, unknown>
  source?: string
  team_id?: string
  node_id?: string | number
  backend_event_id?: string
  last_error?: string
  /**
   * El servidor lo rechazó DE FORMA DEFINITIVA y no es un eco: el organizador
   * cambió algo (código, objeto) y este nodo no se va a aceptar nunca. Sirve para
   * enseñar «N nodos no aceptados» en vez de dejar al jugador adelantado sin saberlo.
   */
  rechazado?: boolean
  /** Por qué, en castellano (contrato 6). */
  motivo?: string
  /** Nodo al que se refiere el rechazo (`stage_id`/`node_id` del servidor). */
  rechazo_nodo?: string
  /** El jugador ya lo vio y lo quitó de la lista. */
  descartado?: boolean
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

  // Ordenados por cuándo se crearon, siempre.
  //
  // El servidor aplica los avances en el orden en que le llegan, así que el
  // orden aquí ES el progreso del jugador. IndexedDB devuelve por clave, y la
  // clave empieza por usuario y TIPO antes que por la fecha: mientras la cola
  // sólo llevaba nodos completados daba igual, pero al meter en ella también
  // los escaneos y la mochila, un evento posterior de otro tipo puede colarse
  // delante. Ordenar por fecha lo deja como pasó de verdad.
  return events
    .filter((event) => event.user === user && event.status !== 'synced')
    .sort(
      (a, b) =>
        (a.seq ?? 0) - (b.seq ?? 0) || String(a.created_at).localeCompare(String(b.created_at))
    )
}

/**
 * Cuántos nodos hay completados en el móvil que el servidor todavía no sabe.
 *
 * Es la única razón legítima para que el móvil vaya por delante del servidor.
 * Mientras haya alguno, una respuesta con un nivel más bajo no significa que el
 * jugador tenga que repetir nada: significa que falta sincronizar. Cuando la
 * cola se vacía, el servidor vuelve a ser la única verdad —incluido un reseteo
 * hecho desde administración, que SÍ tiene que poder devolver al nodo 0—.
 */
export async function contarAvancesPendentes(user: string): Promise<number> {
  const events = await getQueuedOfflineEvents(user).catch(() => [])
  return events.filter((event) => event.type === 'node_completed').length
}

/** Todo lo que falta por subir, del tipo que sea. Es lo que se le enseña. */
export async function contarPendientes(user: string): Promise<number> {
  const events = await getQueuedOfflineEvents(user).catch(() => [])
  return events.length
}

/** Tira la cola entera de este jugador. Se usa al resetearlo desde administración. */
export async function borrarColaOffline(user: string): Promise<void> {
  const events = await getAllRecords<OfflineEvent>(STORE_EVENT_QUEUE).catch(() => [])
  const mios = events.filter((event) => event.user === user)
  if (!mios.length) return

  const db = await openOfflineDb()
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_EVENT_QUEUE, 'readwrite')
    const store = tx.objectStore(STORE_EVENT_QUEUE)
    mios.forEach((event) => store.delete(event.id))
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      resolve()
    }
  })
}

/**
 * Motivos por los que el servidor no va a aceptar un evento por mucho que se
 * insista. Reintentarlos es dejar la cola atascada para siempre y el aviso de
 * "pendientes" encendido toda la travesía.
 */
const RECHAZOS_DEFINITIVOS = [
  'invalid_completion_code',
  'missing_required_item',
  'mission_already_complete',
  'already_advanced',
]

function esRechazoDefinitivo(motivo: string | undefined): boolean {
  const limpio = String(motivo || '')
    .trim()
    .toLowerCase()
  return RECHAZOS_DEFINITIVOS.some((rechazo) => limpio.includes(rechazo))
}

/** Lo que el servidor contesta por cada evento de una sincronización. */
export type RespuestaDeEvento = {
  id?: string
  type?: string
  status?: string
  client_event_id?: string
  error?: string
  duplicate?: boolean
  /** Nodo al que se refiere (contrato 6). */
  stage_id?: string | number
  node_id?: string | number
  /** Por qué, en castellano y para el jugador (contrato 6). */
  motivo?: string
}

/**
 * De los rechazos definitivos, los que hay que ENSEÑAR.
 *
 * `already_advanced` y `mission_already_complete` son ecos: el servidor ya tenía
 * ese nodo, no hay nada que el organizador tenga que arreglar. Lo que sí importa
 * es un código que ya no cuadra o un objeto que falta: ese nodo no se va a
 * aceptar nunca y el jugador tiene que saberlo.
 */
const RECHAZOS_SIN_AVISO = ['already_advanced', 'mission_already_complete']

const MOTIVO_HUMANO: Record<string, string> = {
  invalid_completion_code: 'El código de este nodo ya no coincide con el del servidor.',
  missing_required_item: 'El servidor no vio el objeto que pide este nodo.',
}

export function rechazoQueSeAvisa(
  evento: Pick<OfflineEvent, 'type' | 'node_id' | 'payload'>,
  respuesta: RespuestaDeEvento | undefined
): { motivo: string; nodo: string } | null {
  if (evento.type !== 'node_completed') return null

  const tecnico = String(respuesta?.error || '').toLowerCase()
  if (!esRechazoDefinitivo(tecnico)) return null
  if (RECHAZOS_SIN_AVISO.some((eco) => tecnico.includes(eco))) return null

  const claveConocida = Object.keys(MOTIVO_HUMANO).find((clave) => tecnico.includes(clave))
  const delServidor = String(respuesta?.motivo || '').trim()
  const nodo = String(respuesta?.stage_id ?? respuesta?.node_id ?? evento.node_id ?? '').trim()

  return {
    motivo: delServidor || (claveConocida ? MOTIVO_HUMANO[claveConocida] : 'El servidor no lo aceptó.'),
    nodo,
  }
}

export type RechazoDefinitivo = {
  /** Id del evento en la cola local. */
  id: string
  /** Nodo (id de `stage`) al que se refiere; vacío si no se supo. */
  nodo: string
  titulo: string
  motivo: string
  creado: string
}

/**
 * Los nodos que el servidor no aceptó de forma definitiva y que el jugador aún
 * no ha visto. Sirve para «N nodos no aceptados — avisa al organizador».
 */
export async function listarRechazosDefinitivos(user: string): Promise<RechazoDefinitivo[]> {
  const eventos = await getAllRecords<OfflineEvent>(STORE_EVENT_QUEUE).catch(() => [])
  return eventos
    .filter((e) => e.user === user && e.rechazado === true && !e.descartado)
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
    .map((e) => ({
      id: e.id,
      nodo: String(e.rechazo_nodo || e.node_id || ''),
      titulo: String(e.payload?.stage_title || ''),
      motivo: String(e.motivo || 'El servidor no lo aceptó.'),
      creado: e.created_at,
    }))
}

/** El jugador ya vio estos rechazos: dejan de contarse. */
export async function descartarRechazos(user: string, ids: string[]): Promise<void> {
  if (!ids.length) return
  const eventos = await getAllRecords<OfflineEvent>(STORE_EVENT_QUEUE).catch(() => [])
  const aDescartar = eventos.filter((e) => e.user === user && ids.includes(e.id))
  await Promise.all(aDescartar.map((e) => updateOfflineEvent({ ...e, descartado: true })))
}

/**
 * Una sincronización cada vez, y con espera creciente tras fallar.
 *
 * Esto lo llaman el ciclo de refresco, el reintento del avance y la vuelta de
 * la cobertura, y a veces los tres a la vez. Sin candado se mandaban colas
 * solapadas al mismo endpoint y el servidor aplicaba los avances en el orden en
 * que llegaran: el nivel resultante dependía de cuál contestase antes.
 *
 * Y con cobertura intermitente —la del monte— reintentar cada ciclo contra una
 * red que no va es gastar batería y llenar el registro. Tras un fallo se espera,
 * doblando hasta un minuto.
 */
let sincronizando = false
let esperaTrasFallo = 0
let siguienteIntento = 0

const ESPERA_MINIMA_MS = 3_000
const ESPERA_MAXIMA_MS = 60_000

export async function syncPendingOfflineEvents(user: string) {
  const nada = { status: 'ok' as const, attempted: 0, synced: 0, failed: 0 }

  if (sincronizando) return nada
  if (Date.now() < siguienteIntento) return nada

  const events = await getQueuedOfflineEvents(user)
  // 'syncing' también: aquí se tiene el candado, así que un evento que sigue
  // «subiendo» es de una sincronización que se cortó (app cerrada, móvil sin
  // batería). Antes se quedaba así para siempre y ese nodo no subía nunca.
  const syncable = events.filter(
    (event) => event.status === 'pending' || event.status === 'failed' || event.status === 'syncing'
  )

  if (syncable.length === 0) {
    // Sin nada que mandar no hay por qué seguir castigando la espera.
    esperaTrasFallo = 0
    return nada
  }

  sincronizando = true

  try {
    return await enviarCola(user, syncable)
  } finally {
    sincronizando = false
  }
}

/**
 * Cuántos eventos suben en cada llamada.
 *
 * Un tramo largo sin cobertura deja decenas de eventos en cola (nodos, QR,
 * mochila, posiciones). Mandarlos todos juntos chocaba con el tope del
 * servidor (400) y la cola se atascaba para siempre. En tandas, y en orden.
 */
const TANDA_DE_ENVIO = 50

type ResultadoDeEnvio = {
  status: 'ok' | 'error'
  attempted: number
  synced: number
  failed: number
  message?: string
  /** No llegó a la red: no tiene sentido probar la tanda siguiente. */
  sinRed?: boolean
}

/**
 * La mochila tal y como estaba ANTES de gastar nada en los nodos de la cola.
 *
 * Un nodo que exige un objeto y lo consume lo gasta en el móvil al superarse. La
 * mochila que sube con la cola es la de después: ya sin el objeto, así que el
 * servidor validaba el nodo contra una mochila sin él, decía «falta objeto» y
 * ese rechazo es definitivo. Con un objeto FORJADO sin cobertura era
 * determinista, y el rescate desde administración no lo arreglaba: el nodo
 * estaba perdido y el móvil, adelantado sin saberlo.
 *
 * Cada nodo anota qué gastó (`consumed_item`). Aquí se devuelve a la mochila lo
 * que gastaron los nodos que van a subir: el servidor los valida uno a uno y
 * gasta él lo que toque. Los que no exigen nada dejan la mochila como está.
 */
export function reconstruirMochilaAntesDeConsumir(
  mochila: InventorySnapshot,
  eventos: Array<Pick<OfflineEvent, 'type' | 'payload'>>
): InventorySnapshot {
  const gastos = new Map<string, { cantidad: number; etiqueta: string }>()

  for (const evento of eventos) {
    if (evento.type !== 'node_completed') continue
    const gastado = asRecord(evento.payload?.consumed_item)
    const itemId = String(gastado.item_id || '').trim()
    const cantidad = Math.round(Number(gastado.quantity) || 0)
    if (!itemId || cantidad <= 0) continue
    const previo = gastos.get(itemId)
    gastos.set(itemId, {
      cantidad: (previo?.cantidad || 0) + cantidad,
      etiqueta: previo?.etiqueta || String(gastado.label || itemId),
    })
  }

  if (gastos.size === 0) return mochila

  const ahora = new Date().toISOString()
  const items: InventoryItem[] = mochila.items.map((item) => ({ ...item }))

  for (const [itemId, gasto] of gastos) {
    const existente = items.find((item) => item.item_id === itemId)
    if (existente) {
      existente.quantity = Math.max(0, existente.quantity) + gasto.cantidad
      existente.state = 'collected'
      existente.updated_at = ahora
    } else {
      items.push({
        item_id: itemId,
        label: gasto.etiqueta,
        state: 'collected',
        quantity: gasto.cantidad,
        source: 'system',
        updated_at: ahora,
      })
    }
  }

  return { ...mochila, items }
}

/**
 * El cuerpo de una llamada a `/api/events/sync`.
 *
 * `client_sent_at_ms` viaja a nivel de la llamada (contrato 7): la hora del móvil
 * en el momento de enviar. Con ella el servidor sabe cuánto va desviado el reloj
 * del teléfono y puede corregir las horas de los eventos de la cola, que se
 * crearon con ese reloj. La mochila sólo va si tiene algo.
 */
export function cuerpoDeSincronizacion(args: {
  user: string
  events: unknown[]
  mochila?: InventorySnapshot | null
  ahoraMs?: number
}) {
  return {
    user: args.user,
    events: args.events,
    ...(args.mochila && args.mochila.items?.length ? { inventory_snapshot: args.mochila } : {}),
    client_sent_at_ms: args.ahoraMs ?? Date.now(),
  }
}

async function enviarCola(user: string, syncable: OfflineEvent[]): Promise<ResultadoDeEnvio> {
  const total: ResultadoDeEnvio = { status: 'ok', attempted: 0, synced: 0, failed: 0 }

  // De TODA la cola, no sólo de la primera tanda: la mochila viaja una vez, con
  // la primera, y el servidor valida con ella los nodos de todas.
  const mochila = reconstruirMochilaAntesDeConsumir(loadInventorySnapshot(user), syncable)

  for (let desde = 0; desde < syncable.length; desde += TANDA_DE_ENVIO) {
    const tanda = syncable.slice(desde, desde + TANDA_DE_ENVIO)
    const resultado = await enviarTanda(user, tanda, desde === 0 ? mochila : null)

    total.attempted += resultado.attempted
    total.synced += resultado.synced
    total.failed += resultado.failed
    if (resultado.message) total.message = resultado.message
    if (resultado.status === 'error') total.status = 'error'

    // Sin red no se sigue: el resto se queda pendiente, intacto y en orden.
    if (resultado.sinRed) break
  }

  return total
}

async function enviarTanda(
  user: string,
  syncable: OfflineEvent[],
  /** La mochila que sube con esta tanda (sólo la primera lleva). */
  mochila: InventorySnapshot | null
): Promise<ResultadoDeEnvio> {
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
    // La mochila viaja en la MISMA llamada, antes que los eventos: un nodo que
    // exige un objeto forjado sin cobertura se valida contra ella. Subirla
    // aparte y después hacía que el servidor rechazara el nodo por «falta
    // objeto» y ese rechazo se daba por definitivo.
    const response = await fetch('/api/events/sync', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        cuerpoDeSincronizacion({ user, events: syncing.map(eventToSyncPayload), mochila })
      ),
    })

    // Contestó: hay red, diga lo que diga.
    notarRedOk()

    if (!response.ok) {
      throw new Error(`Sync failed: HTTP ${response.status}`)
    }

    const payload = (await response.json()) as {
      status?: string
      events?: RespuestaDeEvento[]
    }

    if (payload.status !== 'ok') {
      throw new Error('Sync failed: backend rejected the event queue.')
    }

    let syncedCount = 0
    let failedCount = 0
    let hayRechazosNuevos = false

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

        const motivo =
          backendEvent?.error || backendStatus || 'Backend did not accept this event.'

        /**
         * Un rechazo definitivo se marca como cerrado, no como fallo.
         *
         * Con `failed` volvía a entrar en la siguiente sincronización, y otra
         * vez, y otra: la cola no bajaba nunca y el aviso de "pendientes" se
         * quedaba encendido toda la travesía aunque no hubiera nada que hacer.
         *
         * Pero cerrado NO es «olvidado»: un nodo que el servidor no acepta deja
         * al móvil adelantado, y al arrancar volvería atrás sin que el jugador
         * supiera por qué. Se anota para enseñar «N nodos no aceptados».
         */
        const definitivo = !isSynced && esRechazoDefinitivo(motivo)
        const aviso = definitivo ? rechazoQueSeAvisa(event, backendEvent) : null
        if (aviso) hayRechazosNuevos = true

        return updateOfflineEvent({
          ...event,
          status: isSynced || definitivo ? 'synced' : 'failed',
          backend_event_id: backendEvent?.id,
          last_error: isSynced ? undefined : motivo,
          ...(aviso ? { rechazado: true, motivo: aviso.motivo, rechazo_nodo: aviso.nodo } : null),
        })
      })
    )

    if (hayRechazosNuevos && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('saga:rechazos', { detail: { user } }))
    }

    // Llegó y contestó: se vuelve a intentar en cuanto haga falta.
    esperaTrasFallo = 0
    siguienteIntento = 0

    return {
      status: failedCount ? ('error' as const) : ('ok' as const),
      attempted: syncing.length,
      synced: syncedCount,
      failed: failedCount,
      message: failedCount ? `${failedCount} offline event(s) need review.` : undefined,
    }
  } catch (error) {
    // No llegó: se espera antes de volver a intentarlo, doblando hasta un
    // minuto. Con la cobertura del monte, insistir cada ciclo contra una red
    // que no va sólo gasta batería.
    esperaTrasFallo = esperaTrasFallo ? Math.min(esperaTrasFallo * 2, ESPERA_MAXIMA_MS) : ESPERA_MINIMA_MS
    siguienteIntento = Date.now() + esperaTrasFallo

    const sinRed = esFalloDeRed(error)
    if (sinRed) notarFalloDeRed()

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
      sinRed,
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

/**
 * Guarda el paquete de la misión de un jugador.
 *
 * - La configuración de respaldo NO pisa a la buena (J8): si `config` es la que
 *   se fabrica cuando `/api/config` no contesta, se conserva la que había.
 * - La revisión de la misión (`mission_revision`) se conserva si no llega una
 *   nueva: quien sólo actualiza el nivel no ha bajado nodos nuevos.
 * - Los errores NO se tragan aquí: un fallo de cuota tiene que llegar a quien
 *   pregunta, o la pantalla decía «listo» con el paquete sin guardar.
 */
export async function saveMissionPack(args: {
  user: string
  config: PublicConfig | null | undefined
  payload: PlayerGamePayload
  mission_revision?: string
  /** Hora del móvil (ms) a la que llegó `config`. Sin ella, la de ahora. */
  config_recibida_en?: number
}) {
  const existente = await getStoredMissionPack(args.user).catch(() => null)
  const config = elegirConfigParaGuardar(args.config, existente?.config)
  const laNuevaEsLaBuena = config === args.config

  // La hora a la que llegó la configuración va emparejada con ELLA: si no se sabe
  // (quien guarda sólo actualiza el nivel), se conserva la de la que ya estaba
  // siempre que la configuración no haya cambiado, y si no, se deja sin dato. Un
  // dato inventado (la hora de guardar) haría pasar por reciente una hora del
  // servidor de hace días.
  const mismaConfigQueAntes =
    laNuevaEsLaBuena &&
    typeof existente?.config?.server_time_ms === 'number' &&
    existente.config.server_time_ms === args.config?.server_time_ms

  const pack: MissionPack = {
    ...buildMissionPack({ user: args.user, config, payload: args.payload }),
    mission_revision: limpiarRevision(args.mission_revision) || existente?.mission_revision || undefined,
    config_recibida_en: !laNuevaEsLaBuena
      ? existente?.config_recibida_en
      : (args.config_recibida_en ?? (mismaConfigQueAntes ? existente?.config_recibida_en : undefined)),
  }

  await writeRecord(STORE_MISSION_PACKS, pack)
  await saveLocalProgressSnapshot(args.payload)
  return pack
}

export function getStoredMissionPack(user: string) {
  return readRecord<MissionPack>(STORE_MISSION_PACKS, missionPackId(user))
}

/** Los paquetes que hay en ESTE móvil: uno por jugador que lo haya usado. */
export function listarPacksGuardados(): Promise<MissionPack[]> {
  return getAllRecords<MissionPack>(STORE_MISSION_PACKS)
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

/**
 * La siguiente hora para un evento de la cola: nunca igual ni anterior a la de
 * la anterior. Dos eventos en el mismo milisegundo no deben poder cambiar de
 * orden, y un reloj que se corrige hacia atrás tampoco.
 */
let ultimaHoraMs = 0

function horaMonotona(): string {
  const ahora = Date.now()
  ultimaHoraMs = ahora > ultimaHoraMs ? ahora : ultimaHoraMs + 1
  return new Date(ultimaHoraMs).toISOString()
}

let ultimaSeq = 0
let colaDeSeq: Promise<unknown> = Promise.resolve()

/**
 * El número de orden del siguiente evento, EN EL ORDEN EN QUE SE PIDE.
 *
 * La primera vez hay que leer la cola de IndexedDB (asíncrono). Dos eventos
 * encolados seguidos —la recogida de un coleccionable y el avance del nodo que
 * la sigue— podían salir de esa espera en cualquier orden y el avance subir
 * ANTES que la recogida: el servidor validaba el nodo siguiente sin el objeto
 * y el rechazo («falta objeto») es definitivo. Ahora las peticiones se ponen
 * en fila: quien pide antes, recibe antes.
 */
function siguienteSeq(): Promise<number> {
  const turno = colaDeSeq.then(async () => {
    if (ultimaSeq === 0) {
      const existentes = await getAllRecords<OfflineEvent>(STORE_EVENT_QUEUE).catch(() => [])
      const mayor = existentes.reduce((max, evento) => Math.max(max, Number(evento.seq) || 0), 0)
      ultimaSeq = Math.max(ultimaSeq, mayor)
    }
    ultimaSeq += 1
    return ultimaSeq
  })
  colaDeSeq = turno.catch(() => undefined)
  return turno
}

export async function queueOfflineEvent(args: {
  user: string
  type: string
  payload: Record<string, unknown>
  source?: string
  team_id?: string
  node_id?: string | number
}) {
  const seq = await siguienteSeq()

  const event: OfflineEvent = {
    id: `${args.user}:${args.type}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
    user: args.user,
    type: args.type,
    created_at: horaMonotona(),
    seq,
    status: 'pending',
    retry_count: 0,
    payload: {
      ...args.payload,
      // Si al crearse no había cobertura. Para el Registro de partida: es lo
      // que marca los tramos sin cobertura al revisar la ruta en casa.
      offline_at_creation: sinCoberturaAhora(),
      seq,
    },
    source: args.source,
    team_id: args.team_id,
    node_id: args.node_id,
  }

  // Pedirle al navegador que lo suba aunque la aplicación se cierre.
  //
  // El ciclo de 30 s sólo corre con la página viva. Si Android la congela —la
  // aplicación en segundo plano un rato largo— no corre nada, y el jugador que
  // acaba la ruta y guarda el móvil puede dejar su último nodo sin subir.
  // Background Sync despierta al service worker cuando vuelve la red.
  //
  // Va después de escribir, no antes: si el registro falla, el evento ya está
  // guardado y lo recogerá el ciclo normal. Esto se SUMA, no sustituye.
  const escrito = await writeRecord(STORE_EVENT_QUEUE, event)
  void rexistrarSyncDeFondo()
  return escrito
}

/**
 * Background Sync es de Chromium (Chrome y Edge en Android); en iOS no existe.
 * Por eso todo va detrás de comprobaciones y nada de esto puede tirar nada: si
 * no está disponible, sencillamente no se registra y queda el ciclo de siempre.
 */
async function rexistrarSyncDeFondo() {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const registro = await navigator.serviceWorker.ready
    const sync = (registro as ServiceWorkerRegistration & { sync?: { register(t: string): Promise<void> } }).sync
    if (!sync) return
    await sync.register('saga-cola-offline')
  } catch {
    // Sin permiso, sin soporte o sin service worker: no pasa nada, el ciclo de
    // 30 s sigue estando.
  }
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

/** La configuración del nodo. Ver player/configDelNodo.ts para el porqué. */
function readStageConfig(stage: PlayerStage | null): Record<string, unknown> {
  return configDelNodo(stage)
}

/**
 * ¿Vale este código para superar el nodo, sin conexión?
 *
 * `aMano` marca que lo ha escrito el jugador en una casilla de respaldo. El
 * aviso interno con el que los minijuegos dicen "superado" lo acepta cualquier
 * nodo: escrito a mano saltaba el que fuera sin jugar. Mismo criterio que en el
 * servidor (ver stage_accepts_code en main.py), para que offline y online no
 * acepten cosas distintas.
 */
function stageAcceptsLocalCode(stage: PlayerStage | null, code: string, aMano = false) {
  const submitted = cleanCode(code)
  if (!stage || !submitted) return false

  const raw = asRecord(stage)
  const success = asRecord(raw.success)
  const conditions = Array.isArray(success.conditions) ? success.conditions : []

  for (const condition of conditions) {
    if (aMano && asRecord(condition).kind === 'minigame_ok') continue
    const expected = cleanCode(asRecord(condition).value)
    if (expected && expected === submitted) return true
  }

  const config = readStageConfig(stage)
  for (const key of ['answer', 'rune', 'code', 'success_code']) {
    const expected = cleanCode(config[key])
    if (expected && expected === submitted) return true
  }

  // El código impreso en la pegatina ES el código del nodo, igual que en el
  // servidor (ver stage_accepts_code en main.py). Sin esto el nodo no se
  // completaba al escanear ni al teclear el código de respaldo.
  const physicalQr = asRecord(raw.physical_qr)
  for (const value of [raw.qr_payload, config.qr_payload, physicalQr.payload]) {
    const expected = cleanCode(value)
    if (expected && expected === submitted) return true
  }

  return aMano ? false : submitted === 'OK'
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
  timeSpentMs?: number
  /** Penalización del reto o del respaldo: viaja aparte del tiempo del nodo. */
  penaltyMs?: number
  /** Cómo se ganó el nodo, para que el servidor lo revise al sincronizar. */
  evidence?: Record<string, unknown>
  /** Escrito a mano en una casilla de respaldo. */
  aMano?: boolean
}) {
  const payload = args.payload
  const stage = args.currentStage
  const code = cleanCode(args.code)

  if (!stage) return { ok: false as const, reason: 'missing_stage' }
  if (!stageAcceptsLocalCode(stage, code, args.aMano))
    return { ok: false as const, reason: 'invalid_code' }

  const requirement = readStageItemRequirement(stage)
  const owned = requirement ? countOwnedItems(payload.user, requirement.itemId) : 0

  if (requirement && owned < requirement.quantity) {
    return {
      ok: false as const,
      reason: 'missing_required_item',
      requirement: { ...requirement, owned, ok: false },
    }
  }

  // Qué se gasta, apuntado ANTES de gastarlo: viaja con el evento y deja que al
  // subir la cola se devuelva a la mochila que ve el servidor (ver
  // `reconstruirMochilaAntesDeConsumir`). Sin esto, un objeto forjado sin
  // cobertura y gastado aquí no existía para el servidor y el nodo se perdía.
  const consumido = requirement?.consume
    ? { item_id: requirement.itemId, quantity: requirement.quantity, label: requirement.label }
    : null

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
      manual: Boolean(args.aMano),
      local_progress: true,
      stage_title: stage.title,
      level_before: currentLevel,
      level_after: currentLevel + 1,
      ...(consumido ? { consumed_item: consumido } : null),
      time_spent_ms: args.timeSpentMs,
      // Sin esto una penalización ganada sin cobertura (código de respaldo,
      // fallos en el reto) se perdía: el servidor nunca la llegaba a saber.
      penalty_ms: Math.max(0, Math.round(args.penaltyMs || 0)),
      evidence: args.evidence,
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
