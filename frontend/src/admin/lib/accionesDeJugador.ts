/**
 * Acciones del panel sobre un jugador, pensadas para trabajar con MUY poca cobertura (14/11).
 *
 * Qué resuelve:
 *  - Cada acción lleva un `op_id` que se genera UNA vez. Si la petición llega al servidor y se pierde la respuesta,
 *    el reintento lleva el mismo id y el servidor contesta lo que ya hizo en vez de repetirlo («+1 nodo» no sube
 *    dos nodos, «sumar tiempo» no suma dos veces).
 *  - Tiempo de espera largo (25 s) y reintentos con espera creciente sin que el organizador tenga que pulsar de nuevo.
 *  - Si no hay forma (sin red, red muerta, servidor reiniciando, sesión caducada), la acción NO se pierde: se queda en
 *    una cola guardada en el navegador (sobrevive a recargar) y se envía sola al volver la cobertura, en el mismo
 *    orden para el mismo jugador. Una sesión caducada la deja esperando hasta volver a entrar.
 *  - Un rechazo definitivo (el jugador ya no existe, datos inválidos) no se reintenta ni se queda en la cola.
 *
 * Es de lectura y escritura pura de datos: no toca React. `useOperacionesPendientes` es el único gancho.
 */
import { useSyncExternalStore } from 'react'
import { httpErrorFrom } from './adminApi'
import { describeAdminError, isAdminHttpError, isSessionExpired } from './adminErrors'

export type TipoOperacion = 'perfil' | 'tiempo' | 'conceder' | 'retirar' | 'estrellas'

export type Operacion = {
  opId: string
  tipo: TipoOperacion
  profileId: string
  /** `level_next`, `give_item:llave`, `ajuste_de_tiempo`... */
  accion: string
  /** El cuerpo SIN `op_id` (se añade al enviar). */
  cuerpo: Record<string, unknown>
  /** Cómo se llama para el organizador: «+1 nodo», «sumar 45 s». */
  etiqueta: string
  creadaMs: number
  intentos: number
  /** `true` cuando se quedó en la cola (y ya no hay una pantalla esperando la respuesta). */
  enCola?: boolean
  motivoDeEspera?: string
  /**
   * 15/11: «Deshacer» de los toques rápidos (+1 min). La acción entra en la cola AL MOMENTO (no se pierde si se cierra la
   * pestaña) pero no se envía hasta esta hora (ms): hasta entonces `descartarOperacion` la quita y no ha pasado nada.
   */
  retenerHastaMs?: number
}

export type ResultadoOperacion =
  | { estado: 'hecha'; data: Record<string, unknown>; repetida: boolean }
  | { estado: 'pendiente'; motivo: 'sin_red' | 'sesion' | 'servidor' | 'retenida' }
  | { estado: 'rechazada'; error: string; httpStatus?: number }

export type EventoDeOperacion =
  | { tipo: 'enviando'; op: Operacion }
  | { tipo: 'hecha'; op: Operacion; data: Record<string, unknown>; repetida: boolean }
  | { tipo: 'pendiente'; op: Operacion; motivo: 'sin_red' | 'sesion' | 'servidor' }
  | { tipo: 'rechazada'; op: Operacion; error: string; httpStatus?: number }

export const CLAVE_COLA = 'saga-admin-cola-v1'
export const TIEMPO_ESPERA_MS = 25_000
/** Esperas entre los intentos al pulsar (el primero es inmediato): 4 intentos en ~11 s de espera. */
export const ESPERAS_INMEDIATAS_MS = [1500, 3000, 6000]
export const ESPERA_COLA_MIN_MS = 10_000
export const ESPERA_COLA_MAX_MS = 60_000
export const MAXIMO_EN_COLA = 200

const URL_DE: Record<TipoOperacion, string> = {
  perfil: '/api/admin/profile-action',
  tiempo: '/api/admin/jugador/tiempo',
  conceder: '/api/admin/desbloqueos/conceder',
  retirar: '/api/admin/desbloqueos/retirar',
  estrellas: '/api/admin/estrellas',
}

/** Lo que se puede cambiar desde fuera (los tests lo sustituyen: reloj y esperas falsos). */
export const entorno = {
  tiempoEsperaMs: TIEMPO_ESPERA_MS,
  ahora: () => Date.now(),
  esperar: (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms)),
}

export function nuevoOpId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c && typeof c.randomUUID === 'function')
    return 'op-' + c.randomUUID().replace(/-/g, '').slice(0, 24)
  return 'op-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12)
}

// --- cola guardada ----------------------------------------------------------------------------------------------------

function leerCola(): Operacion[] {
  try {
    const crudo = globalThis.localStorage?.getItem(CLAVE_COLA)
    const lista = crudo ? JSON.parse(crudo) : []
    // Lo guardado al arrancar ya NO lo está enviando ninguna pantalla (si se recargó a mitad de los reintentos
    // inmediatos, la operación quedó sin `enCola` y la cola la ignoraba para siempre): toda se considera en cola.
    return Array.isArray(lista)
      ? lista
          .filter((o) => o && typeof o.opId === 'string' && URL_DE[o.tipo as TipoOperacion])
          .map((o) => (o.enCola ? o : { ...o, enCola: true, motivoDeEspera: o.motivoDeEspera || 'sin_red' }))
      : []
  } catch {
    return []
  }
}

let guardadoFallido = false

function escribirCola(lista: Operacion[]) {
  try {
    globalThis.localStorage?.setItem(CLAVE_COLA, JSON.stringify(lista.slice(-MAXIMO_EN_COLA)))
    guardadoFallido = false
  } catch {
    // Almacenamiento lleno o bloqueado: la cola sigue viva en memoria mientras no se cierre la pestaña.
    guardadoFallido = true
  }
}

let enMemoria: Operacion[] | null = null

function cola(): Operacion[] {
  if (enMemoria === null) enMemoria = leerCola()
  return enMemoria
}

function fijarCola(lista: Operacion[]) {
  enMemoria = lista
  escribirCola(lista)
  inicializada = true
  instantanea = lista.slice()
  oyentesDeCola.forEach((o) => o())
}

export function colaNoSePuedeGuardar(): boolean {
  return guardadoFallido
}

/** Olvida lo que haya en memoria y vuelve a leer (tras una recarga o en las pruebas). */
export function recargarColaGuardada() {
  enMemoria = null
  fijarCola(cola())
}

// --- el gancho de React ------------------------------------------------------------------------------------------------

let inicializada = false
let instantanea: Operacion[] = []
const oyentesDeCola = new Set<() => void>()

function suscribirCola(oyente: () => void) {
  oyentesDeCola.add(oyente)
  return () => {
    oyentesDeCola.delete(oyente)
  }
}

function instantaneaCola(): Operacion[] {
  // La MISMA lista mientras no cambie la cola: useSyncExternalStore exige una instantánea estable.
  if (!inicializada) {
    inicializada = true
    instantanea = cola().slice()
  }
  return instantanea
}

/** Las acciones que esperan cobertura (o sesión), en el orden en que se hicieron. */
export function useOperacionesPendientes(): Operacion[] {
  return useSyncExternalStore(suscribirCola, instantaneaCola, instantaneaCola)
}

export function operacionesPendientes(): Operacion[] {
  return cola().slice()
}

// --- eventos ----------------------------------------------------------------------------------------------------------

const oyentes = new Set<(evento: EventoDeOperacion) => void>()

export function suscribirOperaciones(oyente: (evento: EventoDeOperacion) => void): () => void {
  oyentes.add(oyente)
  return () => {
    oyentes.delete(oyente)
  }
}

function avisar(evento: EventoDeOperacion) {
  oyentes.forEach((o) => {
    try {
      o(evento)
    } catch {
      // Un oyente que falla no puede dejar la cola a medias.
    }
  })
}

// --- un intento --------------------------------------------------------------------------------------------------------

type Intento =
  | { tipo: 'ok'; data: Record<string, unknown> }
  | { tipo: 'reintentable'; motivo: 'sin_red' | 'servidor' }
  | { tipo: 'sesion' }
  | { tipo: 'definitivo'; error: string; httpStatus?: number }

function hayRed(): boolean {
  const nav = (globalThis as { navigator?: { onLine?: boolean } }).navigator
  return !nav || nav.onLine !== false
}

async function unIntento(op: Operacion): Promise<Intento> {
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), entorno.tiempoEsperaMs)
  try {
    const res = await fetch(URL_DE[op.tipo], {
      method: 'POST',
      credentials: 'same-origin',
      signal: control.signal,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...op.cuerpo, op_id: op.opId }),
    })
    if (res.ok) {
      try {
        return { tipo: 'ok', data: (await res.json()) as Record<string, unknown> }
      } catch {
        // Cuerpo cortado a la mitad: el servidor SÍ lo aplicó; repetir con el mismo op_id devuelve lo hecho.
        return { tipo: 'reintentable', motivo: 'sin_red' }
      }
    }
    const err = await httpErrorFrom(res)
    if (isSessionExpired(err.status, err.detail)) return { tipo: 'sesion' }
    if (err.status === 429 || err.status === 408 || err.status === 425 || err.status >= 500) {
      return { tipo: 'reintentable', motivo: 'servidor' }
    }
    return { tipo: 'definitivo', error: describeAdminError(err), httpStatus: err.status }
  } catch (error) {
    if (isAdminHttpError(error))
      return { tipo: 'definitivo', error: describeAdminError(error), httpStatus: error.status }
    // Sin red, cortada, o más de 25 s sin respuesta: se puede repetir sin miedo (idempotente).
    return { tipo: 'reintentable', motivo: 'sin_red' }
  } finally {
    clearTimeout(reloj)
  }
}

function terminar(
  op: Operacion,
  intento: Exclude<Intento, { tipo: 'reintentable' } | { tipo: 'sesion' }>
): ResultadoOperacion {
  quitar(op.opId)
  if (intento.tipo === 'ok') {
    const repetida = Boolean((intento.data as { repetida?: unknown }).repetida)
    avisar({ tipo: 'hecha', op, data: intento.data, repetida })
    return { estado: 'hecha', data: intento.data, repetida }
  }
  avisar({ tipo: 'rechazada', op, error: intento.error, httpStatus: intento.httpStatus })
  return { estado: 'rechazada', error: intento.error, httpStatus: intento.httpStatus }
}

function quitar(opId: string) {
  fijarCola(cola().filter((o) => o.opId !== opId))
}

function marcarEnCola(op: Operacion, motivo: 'sin_red' | 'sesion' | 'servidor') {
  // Con la sesión caducada no se insiste cada pocos segundos: espera a `reanudarCola` (al volver a entrar).
  if (motivo === 'sesion') pausadaPorSesion = true
  const hecha: Operacion = { ...op, enCola: true, motivoDeEspera: motivo }
  fijarCola(cola().map((o) => (o.opId === op.opId ? hecha : o)))
  avisar({ tipo: 'pendiente', op: hecha, motivo })
  vigilarCola()
}

// --- lo que llama el panel -----------------------------------------------------------------------------------------------

/**
 * Lanza una acción: la guarda en la cola ANTES de enviarla (si la página muere a medias no se pierde, y el `op_id`
 * evita que el reenvío la repita), la intenta con reintentos y devuelve cómo ha acabado. `pendiente` = queda en la
 * cola y se enviará sola.
 */
export async function lanzarOperacion(
  datos: Pick<Operacion, 'tipo' | 'profileId' | 'accion' | 'cuerpo' | 'etiqueta'> & {
    opId?: string
    /** Espera esto (ms) antes de enviarla, con «Deshacer» mientras tanto (ver `retenerHastaMs`). */
    retenerMs?: number
  }
): Promise<ResultadoOperacion> {
  const op: Operacion = {
    opId: datos.opId || nuevoOpId(),
    tipo: datos.tipo,
    profileId: datos.profileId,
    accion: datos.accion,
    cuerpo: datos.cuerpo,
    etiqueta: datos.etiqueta,
    creadaMs: entorno.ahora(),
    intentos: 0,
  }
  // Retenida: entra en la cola ya (sobrevive a recargar) y se envía sola pasado el plazo, si nadie la deshace.
  if (datos.retenerMs && datos.retenerMs > 0) {
    const retenida: Operacion = {
      ...op,
      enCola: true,
      motivoDeEspera: 'retenida',
      retenerHastaMs: op.creadaMs + datos.retenerMs,
    }
    fijarCola([...cola().filter((o) => o.opId !== op.opId), retenida])
    programarRetenida()
    return { estado: 'pendiente', motivo: 'retenida' }
  }
  fijarCola([...cola().filter((o) => o.opId !== op.opId), op])
  avisar({ tipo: 'enviando', op })

  // Si ya hay algo ANTERIOR del mismo jugador esperando, esta va detrás (el orden importa: «+1 nodo» y «−1 nodo»).
  const hayAnterior = cola().some(
    (o) => o.profileId === op.profileId && o.opId !== op.opId && o.enCola
  )
  if (hayAnterior) {
    // Detrás de una retenida no es «sin cobertura»: solo espera su turno.
    if (cola().some((o) => o.profileId === op.profileId && o.opId !== op.opId && estaRetenida(o))) {
      const detras: Operacion = { ...op, enCola: true, motivoDeEspera: 'retenida' }
      fijarCola(cola().map((o) => (o.opId === op.opId ? detras : o)))
      programarRetenida()
      return { estado: 'pendiente', motivo: 'retenida' }
    }
    marcarEnCola(op, 'sin_red')
    return { estado: 'pendiente', motivo: 'sin_red' }
  }
  if (!hayRed()) {
    marcarEnCola(op, 'sin_red')
    return { estado: 'pendiente', motivo: 'sin_red' }
  }

  let ultimo: 'sin_red' | 'servidor' = 'sin_red'
  for (let i = 0; i <= ESPERAS_INMEDIATAS_MS.length; i += 1) {
    const intento = await unIntento(op)
    if (intento.tipo === 'ok' || intento.tipo === 'definitivo') return terminar(op, intento)
    if (intento.tipo === 'sesion') {
      marcarEnCola(op, 'sesion')
      return { estado: 'pendiente', motivo: 'sesion' }
    }
    ultimo = intento.motivo
    if (i < ESPERAS_INMEDIATAS_MS.length) await entorno.esperar(ESPERAS_INMEDIATAS_MS[i])
  }
  marcarEnCola(op, ultimo)
  return { estado: 'pendiente', motivo: ultimo }
}

// --- la cola envía sola -----------------------------------------------------------------------------------------------

let procesando = false
let relojDeCola: ReturnType<typeof setTimeout> | null = null
let esperaDeCola = ESPERA_COLA_MIN_MS
let pausadaPorSesion = false
let escuchando = false

/**
 * Envía lo que hay en la cola, EN ORDEN y de uno en uno (así dos cambios del mismo jugador no se cruzan). Se para en
 * el primero que no puede ir (sin red, servidor caído, sesión caducada) y lo reintenta más tarde con espera creciente.
 */
export async function procesarCola(): Promise<void> {
  if (procesando) return
  procesando = true
  try {
    const detrasDeUnaRetenida = new Set<string>()
    for (const op of cola()
      .filter((o) => o.enCola)
      .slice()) {
      if (!hayRed()) break
      // Una retenida aún no se envía, y lo que el mismo jugador hizo después espera a que se envíe (el orden importa).
      if (detrasDeUnaRetenida.has(op.profileId)) continue
      if (estaRetenida(op)) {
        detrasDeUnaRetenida.add(op.profileId)
        continue
      }
      const actual = cola().find((o) => o.opId === op.opId)
      if (!actual) continue
      const intento = await unIntento({ ...actual, intentos: actual.intentos + 1 })
      if (intento.tipo === 'ok' || intento.tipo === 'definitivo') {
        terminar(actual, intento)
        esperaDeCola = ESPERA_COLA_MIN_MS
        continue
      }
      if (actual.motivoDeEspera === 'retenida' && intento.tipo === 'reintentable') {
        avisar({ tipo: 'pendiente', op: { ...actual, motivoDeEspera: intento.motivo }, motivo: intento.motivo })
      }
      fijarCola(
        cola().map((o) =>
          o.opId === actual.opId
            ? { ...o, intentos: o.intentos + 1, motivoDeEspera: intento.tipo === 'sesion' ? 'sesion' : intento.motivo }
            : o
        )
      )
      if (intento.tipo === 'sesion') {
        pausadaPorSesion = true
        avisar({ tipo: 'pendiente', op: { ...actual, motivoDeEspera: 'sesion' }, motivo: 'sesion' })
      }
      break
    }
  } finally {
    procesando = false
  }
  if (cola().some((o) => o.enCola && !estaRetenida(o))) {
    if (!pausadaPorSesion) esperaDeCola = Math.min(ESPERA_COLA_MAX_MS, esperaDeCola * 2)
    vigilarCola()
  }
  programarRetenida()
}

/** ¿Aún dentro del plazo de «Deshacer»? */
export function estaRetenida(op: Operacion): boolean {
  return Boolean(op.retenerHastaMs && op.retenerHastaMs > entorno.ahora())
}

let relojDeRetenida: ReturnType<typeof setTimeout> | null = null

/** Despierta la cola justo cuando acaba el plazo de la retenida más próxima. */
function programarRetenida() {
  if (relojDeRetenida !== null) clearTimeout(relojDeRetenida)
  relojDeRetenida = null
  const ahora = entorno.ahora()
  const horas = cola()
    .map((o) => o.retenerHastaMs || 0)
    .filter((h) => h > ahora)
  if (horas.length === 0) return
  relojDeRetenida = setTimeout(() => {
    relojDeRetenida = null
    // Pasado el plazo deja de ser «retenida»: si no hay red, queda como cualquier otra pendiente (y se avisa una vez).
    const vencidas = cola().filter((o) => o.motivoDeEspera === 'retenida' && o.retenerHastaMs && !estaRetenida(o))
    if (vencidas.length > 0 && !hayRed()) {
      const ids = new Set(vencidas.map((o) => o.opId))
      fijarCola(cola().map((o) => (ids.has(o.opId) ? { ...o, motivoDeEspera: 'sin_red' } : o)))
      vencidas.forEach((o) => avisar({ tipo: 'pendiente', op: { ...o, motivoDeEspera: 'sin_red' }, motivo: 'sin_red' }))
      vigilarCola()
      return
    }
    fijarCola(cola().slice())
    void procesarCola()
  }, Math.min(...horas) - ahora + 20)
}

function vigilarCola() {
  escucharEventos()
  if (relojDeCola !== null) clearTimeout(relojDeCola)
  relojDeCola = null
  if (!cola().some((o) => o.enCola && !estaRetenida(o))) return
  // Con la sesión caducada no se insiste: espera a `reanudarCola` (tras volver a entrar).
  if (pausadaPorSesion) return
  relojDeCola = setTimeout(() => {
    relojDeCola = null
    void procesarCola()
  }, esperaDeCola)
}

/** Vuelve a intentar la cola ya: al volver la red, la pestaña o la sesión. */
export function reanudarCola() {
  pausadaPorSesion = false
  esperaDeCola = ESPERA_COLA_MIN_MS
  void procesarCola()
}

function escucharEventos() {
  if (escuchando || typeof window === 'undefined' || typeof window.addEventListener !== 'function')
    return
  escuchando = true
  window.addEventListener('online', () => {
    if (cola().some((o) => o.enCola)) reanudarCola()
  })
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (
        document.visibilityState === 'visible' &&
        cola().some((o) => o.enCola) &&
        !pausadaPorSesion
      )
        reanudarCola()
    })
  }
}

/** ¿La cola espera a que se vuelva a entrar (sesión caducada)? */
export function colaEnPausaPorSesion(): boolean {
  return pausadaPorSesion
}

/** El organizador descarta una acción que no quiere que se envíe. */
export function descartarOperacion(opId: string) {
  quitar(opId)
}

/** Para las pruebas: deja el módulo como recién cargado. */
export function reiniciarParaPruebas() {
  enMemoria = null
  inicializada = false
  instantanea = []
  procesando = false
  pausadaPorSesion = false
  esperaDeCola = ESPERA_COLA_MIN_MS
  if (relojDeCola !== null) clearTimeout(relojDeCola)
  relojDeCola = null
  if (relojDeRetenida !== null) clearTimeout(relojDeRetenida)
  relojDeRetenida = null
  oyentes.clear()
  guardadoFallido = false
}
