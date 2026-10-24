import { useEffect, useState } from 'react'
import { fetchAdminMissionStatus, type AdminPerfilEnVivo } from './adminApi'

/**
 * Dónde va cada jugador, para la lista de Jugadores y los puntos del mapa (revisión 24/10/2026).
 *
 * Antes el mapa pedía `/api/admin/react-overview` cada 15 s: la vista ENTERA (todos los nodos, la configuración y
 * las fichas con su foto en data URI) para leer sólo la posición. Seguía pidiéndola con la pestaña oculta y, sin
 * cobertura, otra vez a los 15 s. Y la lista de Jugadores no se movía hasta pulsar «Recargar».
 *
 * Ahora hay UN sondeo de `/api/admin/mission-status` (sólo el estado, sin fotos ni nodos) que comparten quienes lo
 * miran. Se para cuando no mira nadie y con la pestaña oculta, pide en cuanto se vuelve a ella y, si falla la red,
 * espera el doble cada vez (hasta 2 min) en vez de insistir.
 */
export const CADA_MS = 15_000
export const ESPERA_MAXIMA_MS = 120_000

export type EstadoEnVivo = {
  /** null hasta la primera respuesta buena. */
  perfiles: AdminPerfilEnVivo[] | null
  /** Hora del servidor (s) en esa respuesta: los minutos en un nodo se cuentan con ella, no con el reloj del móvil. */
  serverTs: number | null
  /** Fallos seguidos desde la última respuesta buena. */
  fallos: number
  /** Cuándo (ms, reloj de aquí) se PIDIÓ la respuesta buena: lo que pasó después no puede traerlo. */
  pedidoMs: number
}

export function esperaTrasFallos(fallos: number): number {
  return Math.min(ESPERA_MAXIMA_MS, CADA_MS * 2 ** Math.max(0, fallos))
}

type Oyente = (estado: EstadoEnVivo) => void

const oyentes = new Set<Oyente>()
let estado: EstadoEnVivo = { perfiles: null, serverTs: null, fallos: 0, pedidoMs: 0 }
let reloj: ReturnType<typeof setTimeout> | null = null
let pidiendo = false
let mirandoVisibilidad = false

function oculta() {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

function parar() {
  if (reloj !== null) clearTimeout(reloj)
  reloj = null
}

function programar(ms: number) {
  parar()
  if (oyentes.size && !oculta()) reloj = setTimeout(() => void pedir(), ms)
}

async function pedir() {
  // Una petición a la vez: con mala cobertura tarda más de 15 s y se apilaban.
  if (pidiendo || !oyentes.size || oculta()) return
  parar()
  pidiendo = true
  const pedidoMs = Date.now()
  try {
    const datos = await fetchAdminMissionStatus()
    estado = {
      perfiles: Array.isArray(datos.profiles) ? datos.profiles : [],
      serverTs: typeof datos.server_ts === 'number' ? datos.server_ts : null,
      fallos: 0,
      pedidoMs,
    }
  } catch {
    // Se queda lo último bueno: sin red, saber dónde iban hace un minuto vale más que una lista vacía.
    estado = { ...estado, fallos: estado.fallos + 1 }
  } finally {
    pidiendo = false
  }
  oyentes.forEach((oyente) => oyente(estado))
  programar(esperaTrasFallos(estado.fallos))
}

function alCambiarVisibilidad() {
  if (oculta()) parar()
  else void pedir()
}

export function suscribirEstadoEnVivo(oyente: Oyente): () => void {
  if (!mirandoVisibilidad && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    mirandoVisibilidad = true
  }
  oyentes.add(oyente)
  if (estado.perfiles) oyente(estado)
  // El primero en mirar arranca el sondeo; los demás se suben al que ya hay.
  if (oyentes.size === 1) void pedir()
  return () => {
    oyentes.delete(oyente)
    if (!oyentes.size) parar()
  }
}

/** Pide ya, sin esperar al siguiente turno: tras mover a un jugador desde el panel. */
export function refrescarEstadoEnVivo() {
  void pedir()
}

/** El estado en vivo mientras `activo` (el panel abierto, el mapa con los jugadores a la vista). */
export function useEstadoEnVivo(activo = true): EstadoEnVivo {
  const [actual, setActual] = useState<EstadoEnVivo>(estado)
  useEffect(() => (activo ? suscribirEstadoEnVivo(setActual) : undefined), [activo])
  return actual
}

/** Minutos que lleva en su nodo, con la hora del servidor; null si no se sabe. */
export function minutosEnElNodo(
  perfil: AdminPerfilEnVivo | undefined,
  serverTs: number | null
): number | null {
  const desde = Number(perfil?.en_nodo_desde)
  if (!perfil || perfil.finished || !serverTs || !Number.isFinite(desde) || desde <= 0) return null
  return Math.max(0, Math.floor((serverTs - desde) / 60))
}

/**
 * Minutos en el mismo nodo a partir de los que se le marca como atascado.
 * ponytail: umbral fijo para toda la ruta; si hay nodos largos de verdad (un paseo de 40 min), que salga del nodo.
 */
export const MINUTOS_ATASCADO = 20

/**
 * ¿Se ha atascado? Lleva más de MINUTOS_ATASCADO en el mismo nodo Y sigue dando señales: a quien está sin conexión
 * no se le puede llamar atascado, ya sale como «Sin conexión».
 */
export function estaAtascado(
  perfil: AdminPerfilEnVivo | undefined,
  serverTs: number | null
): boolean {
  const minutos = minutosEnElNodo(perfil, serverTs)
  return minutos !== null && minutos >= MINUTOS_ATASCADO && perfil?.presence !== 'offline'
}

/**
 * El nodo en que va alguien: el del sondeo o el que ya tiene el panel.
 *
 * Tras «+1 nodo» o «Reiniciar», el panel pone el nivel nuevo al momento; un sondeo PEDIDO antes de que acabara la
 * acción aún trae el viejo y lo devolvía atrás unos segundos. Así que el sondeo sólo manda si se pidió después de
 * la última acción sobre ese jugador (`accionHastaMs`, Infinity mientras está en curso).
 */
export function progresoMasFiable(
  vivo: AdminPerfilEnVivo | undefined,
  pedidoMs: number,
  accionHastaMs: number | undefined,
  delPanel: { level: number | null; finished: boolean } | undefined
): { level: number | null; finished: boolean } | undefined {
  if (!vivo || typeof vivo.level !== 'number' || pedidoMs <= (accionHastaMs ?? 0)) return delPanel
  return { level: vivo.level, finished: Boolean(vivo.finished) }
}
