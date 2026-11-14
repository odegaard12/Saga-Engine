import { useEffect, useState } from 'react'
import { fetchAdminMissionStatus, type AdminArranqueVivo, type AdminPerfilEnVivo } from './adminApi'
import { calidadDeRed, type CalidadDeRed } from './calidadDeRed'

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
 *
 * 15/11 (poca cobertura): el intervalo depende de la red (15 s con buena, 25 s con 3G, 45 s con 2G o ahorro de datos) y
 * nunca baja de 4 veces lo que tardó la última respuesta; y con la huella de lo último recibido el servidor contesta
 * «sin cambios» (unas decenas de bytes) cuando nada se ha movido.
 */
export const CADA_MS = 15_000
export const ESPERA_MAXIMA_MS = 120_000
export const CADA_MS_POR_RED: Record<CalidadDeRed, number> = { buena: CADA_MS, media: 25_000, mala: 45_000 }

/** Cada cuánto sondear con esta red y esta latencia de la última respuesta. */
export function intervaloBase(ultimaDuracionMs = 0, calidad: CalidadDeRed = calidadDeRed()): number {
  return Math.min(ESPERA_MAXIMA_MS, Math.max(CADA_MS_POR_RED[calidad], Math.round(ultimaDuracionMs * 4)))
}

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

export function esperaTrasFallos(fallos: number, base = CADA_MS): number {
  return Math.min(ESPERA_MAXIMA_MS, base * 2 ** Math.max(0, fallos))
}

type Oyente = (estado: EstadoEnVivo) => void

const oyentes = new Set<Oyente>()
let estado: EstadoEnVivo = { perfiles: null, serverTs: null, fallos: 0, pedidoMs: 0 }
let reloj: ReturnType<typeof setTimeout> | null = null
let pidiendo = false
let mirandoVisibilidad = false
/** La huella de lo último recibido y lo que tardó (ms) esa respuesta. */
let huella: string | null = null
let ultimaDuracionMs = 0

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
    const datos = await fetchAdminMissionStatus(estado.perfiles && huella ? huella : undefined)
    ultimaDuracionMs = Date.now() - pedidoMs
    if (datos.status === 'sin_cambios' && estado.perfiles) {
      // Nada se ha movido: la lista es la de antes, sólo avanza la hora del servidor.
      estado = {
        ...estado,
        serverTs: typeof datos.server_ts === 'number' ? datos.server_ts : estado.serverTs,
        fallos: 0,
        pedidoMs,
      }
    } else {
      huella = typeof datos.etag === 'string' ? datos.etag : null
      estado = {
        perfiles: Array.isArray(datos.profiles) ? datos.profiles : [],
        serverTs: typeof datos.server_ts === 'number' ? datos.server_ts : null,
        fallos: 0,
        pedidoMs,
      }
    }
  } catch {
    // Se queda lo último bueno: sin red, saber dónde iban hace un minuto vale más que una lista vacía.
    estado = { ...estado, fallos: estado.fallos + 1 }
  } finally {
    pidiendo = false
  }
  oyentes.forEach((oyente) => oyente(estado))
  programar(esperaTrasFallos(estado.fallos, intervaloBase(ultimaDuracionMs)))
}

/**
 * El estado que ya trajo la entrada al panel (`/api/admin/arranque`): se toma como la primera respuesta del sondeo, así
 * que al abrir la lista de jugadores no hace falta otra petición enseguida. `pedidoMs` = cuándo se pidió.
 */
export function sembrarEstadoEnVivo(vivo: AdminArranqueVivo | null | undefined, pedidoMs: number) {
  if (!vivo || vivo.status !== 'ok' || !Array.isArray(vivo.profiles)) return
  huella = typeof vivo.etag === 'string' ? vivo.etag : null
  estado = {
    perfiles: vivo.profiles,
    serverTs: typeof vivo.server_ts === 'number' ? vivo.server_ts : null,
    fallos: 0,
    pedidoMs,
  }
  oyentes.forEach((oyente) => oyente(estado))
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
  // El primero en mirar arranca el sondeo; los demás se suben al que ya hay. Si la entrada acaba de traer el estado,
  // se espera al turno siguiente en vez de pedirlo otra vez al momento.
  if (oyentes.size === 1) {
    const edad = Date.now() - estado.pedidoMs
    const turno = intervaloBase(ultimaDuracionMs)
    if (estado.perfiles && estado.pedidoMs > 0 && edad < turno / 2) programar(turno - edad)
    else void pedir()
  }
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

/**
 * Segundos desde la última señal de un jugador (`last_seen`, en segundos o en ms) con la hora del servidor; null si no
 * se sabe. Con poca cobertura una posición puede tener minutos: el mapa tiene que decirlo.
 */
export function antiguedadDeLaSenalS(lastSeen: number | null | undefined, serverTs: number | null): number | null {
  const visto = Number(lastSeen)
  if (!Number.isFinite(visto) || visto <= 0 || !serverTs) return null
  const vistoS = visto > 1e12 ? visto / 1000 : visto
  return Math.max(0, Math.round(serverTs - vistoS))
}

/** «hace 40 s», «hace 3 min»: lo que enseña el mapa junto a cada jugador. */
export function textoDeAntiguedad(segundos: number | null): string {
  if (segundos === null) return ''
  if (segundos < 20) return 'ahora'
  if (segundos < 90) return `hace ${segundos} s`
  if (segundos < 3600) return `hace ${Math.round(segundos / 60)} min`
  return `hace ${Math.round(segundos / 3600)} h`
}

/** Pasado esto sin señal, la posición del mapa se dibuja apagada (ya no es «dónde está» sino «dónde estuvo»). */
export const SEGUNDOS_POSICION_VIEJA = 90

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
