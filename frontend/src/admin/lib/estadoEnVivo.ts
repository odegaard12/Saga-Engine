import { useEffect, useState } from 'react'
import {
  fetchAdminMissionStatusCompacto,
  type AdminArranqueVivo,
  type AdminPerfilEnVivo,
  type FichaCompacta,
  type RespuestaCompacta,
} from './adminApi'
import { calidadDeRed, type CalidadDeRed } from './calidadDeRed'
import { pocosDatosActivo } from './pocosDatos'

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
 *
 * 24/11 (modo pocos datos): el sondeo es COMPACTO (`v: 2`): dos huellas, la de las fichas y la de las posiciones a ~10 m,
 * así que con la gente andando sólo viajan las posiciones y con alguien pasando de nodo sólo su ficha. Y el ritmo se
 * adapta: 45 s si nada cambia en 3 sondeos seguidos (o con «Pocos datos»), 10 s durante el minuto que sigue a una acción.
 * Con un servidor viejo (contesta sin `v: 2`) se sigue entendiendo la respuesta de siempre.
 */
export const CADA_MS = 15_000
export const ESPERA_MAXIMA_MS = 120_000
export const CADA_MS_POR_RED: Record<CalidadDeRed, number> = { buena: CADA_MS, media: 25_000, mala: 45_000 }
/** Sin cambios en tantos sondeos seguidos, se pasa a QUIETO_MS. */
export const SONDEOS_PARA_QUIETO = 3
export const QUIETO_MS = 45_000
/** Tras una acción, durante RAPIDO_DURANTE_MS se sondea cada RAPIDO_MS (para ver el efecto enseguida). */
export const RAPIDO_MS = 10_000
export const RAPIDO_DURANTE_MS = 60_000

/** Cada cuánto sondear con esta red y esta latencia de la última respuesta. */
export function intervaloBase(ultimaDuracionMs = 0, calidad: CalidadDeRed = calidadDeRed()): number {
  return Math.min(ESPERA_MAXIMA_MS, Math.max(CADA_MS_POR_RED[calidad], Math.round(ultimaDuracionMs * 4)))
}

/**
 * El ritmo de verdad: el de la red, más calmado si nada cambia (o con «Pocos datos») y más rápido justo después de una
 * acción. Nunca más deprisa que 4 veces lo que tardó la última respuesta.
 */
export function intervaloAdaptativo(o: {
  ultimaDuracionMs?: number
  calidad?: CalidadDeRed
  pocos?: boolean
  sinCambiosSeguidos?: number
  rapidoHastaMs?: number
  ahoraMs?: number
}): number {
  const ahora = o.ahoraMs ?? Date.now()
  const suelo = Math.round((o.ultimaDuracionMs ?? 0) * 4)
  if ((o.rapidoHastaMs ?? 0) > ahora) return Math.min(ESPERA_MAXIMA_MS, Math.max(RAPIDO_MS, suelo))
  const base = intervaloBase(o.ultimaDuracionMs ?? 0, o.calidad ?? calidadDeRed())
  const quieto = o.pocos || (o.sinCambiosSeguidos ?? 0) >= SONDEOS_PARA_QUIETO
  return Math.min(ESPERA_MAXIMA_MS, quieto ? Math.max(QUIETO_MS, base) : base)
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
  /** Avisos del antitrampa sin revisar (null con un servidor que no lo dice). */
  avisos?: number | null
}

export function esperaTrasFallos(fallos: number, base = CADA_MS): number {
  return Math.min(ESPERA_MAXIMA_MS, base * 2 ** Math.max(0, fallos))
}

type Oyente = (estado: EstadoEnVivo) => void
type Posicion = { lat: number; lon: number; visto: number }

const oyentes = new Set<Oyente>()
let estado: EstadoEnVivo = { perfiles: null, serverTs: null, fallos: 0, pedidoMs: 0, avisos: null }
let reloj: ReturnType<typeof setTimeout> | null = null
let pidiendo = false
let mirandoVisibilidad = false
/** La huella de lo último recibido con el formato de siempre (servidor viejo o la entrada) y lo que tardó (ms). */
let huella: string | null = null
let ultimaDuracionMs = 0
/** Lo del sondeo compacto: fichas por jugador, su orden, posiciones y las dos huellas. */
let fichas = new Map<string, FichaCompacta>()
let orden: string[] = []
let posiciones = new Map<string, Posicion>()
let huellaFichas: string | null = null
let huellaPosiciones: string | null = null
let sinCambiosSeguidos = 0
let rapidoHastaMs = 0
/** El último turno (sin la espera de después de un fallo): «hace dos turnos» se mide con él. */
let ultimoIntervaloMs = CADA_MS

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

function olvidarCompacto() {
  fichas = new Map()
  orden = []
  posiciones = new Map()
  huellaFichas = null
  huellaPosiciones = null
}

/**
 * Lo que trae un sondeo compacto, sobre lo que ya había, convertido en la lista de perfiles de siempre (la lista, la
 * ficha y el mapa no cambian). Puro: no toca el estado del módulo.
 */
export function aplicarCompacto(
  previo: { fichas: Map<string, FichaCompacta>; orden: string[]; posiciones: Map<string, Posicion> },
  r: RespuestaCompacta
): {
  fichas: Map<string, FichaCompacta>
  orden: string[]
  posiciones: Map<string, Posicion>
  perfiles: AdminPerfilEnVivo[]
  cambio: boolean
} {
  const ts = Number(r.server_ts) || 0
  let f = previo.fichas
  let o = previo.orden
  let p = previo.posiciones
  if (Array.isArray(r.f)) {
    f = new Map(r.f.map((x) => [String(x.user), x]))
    o = r.f.map((x) => String(x.user))
  } else if (Array.isArray(r.fd)) {
    f = new Map(f)
    for (const x of r.fd) f.set(String(x.user), x)
    if (Array.isArray(r.ids)) {
      o = r.ids.map(String)
      for (const id of [...f.keys()]) if (!o.includes(id)) f.delete(id)
    }
  }
  if (Array.isArray(r.p)) {
    const [baseLat, baseLon] = Array.isArray(r.o) ? r.o : [0, 0]
    p = new Map(
      r.p
        .filter(([i]) => o[i] !== undefined)
        .map(([i, dLat, dLon, edad]) => [
          o[i],
          { lat: (baseLat + dLat) / 1e5, lon: (baseLon + dLon) / 1e5, visto: ts - (Number(edad) || 0) },
        ])
    )
  }
  const perfiles = o
    .map((id) => f.get(id))
    .filter((x): x is FichaCompacta => Boolean(x))
    .map((ficha) => {
      const pos = p.get(String(ficha.user))
      // «En vivo» lo dice el servidor AHORA: su señal es de ahora aunque no se haya movido 10 m. Si no, la de su
      // posición (o la que trae su ficha, sin conexión).
      const visto =
        ficha.presence === 'live'
          ? Array.isArray(r.p) && pos
            ? pos.visto
            : ts
          : (ficha.last_seen ?? pos?.visto ?? null)
      return { ...ficha, lat: pos?.lat ?? null, lon: pos?.lon ?? null, last_seen: visto } as AdminPerfilEnVivo
    })
  return { fichas: f, orden: o, posiciones: p, perfiles, cambio: Array.isArray(r.f) || Boolean(r.fd?.length) || Array.isArray(r.p) }
}

async function pedir() {
  // Una petición a la vez: con mala cobertura tarda más de 15 s y se apilaban.
  if (pidiendo || !oyentes.size || oculta()) return
  parar()
  pidiendo = true
  const pedidoMs = Date.now()
  try {
    const tengo = Boolean(estado.perfiles)
    const datos = (await fetchAdminMissionStatusCompacto(
      tengo ? huellaFichas : null,
      tengo ? huellaPosiciones : null,
      tengo ? huella : null
    )) as RespuestaCompacta & { profiles?: AdminPerfilEnVivo[]; etag?: string }
    ultimaDuracionMs = Date.now() - pedidoMs
    const serverTs = typeof datos.server_ts === 'number' ? datos.server_ts : estado.serverTs
    if (datos.v === 2) {
      const r = aplicarCompacto({ fichas, orden, posiciones }, datos)
      fichas = r.fichas
      orden = r.orden
      posiciones = r.posiciones
      huellaFichas = typeof datos.e === 'string' ? datos.e : null
      huellaPosiciones = typeof datos.q === 'string' ? datos.q : null
      huella = null
      sinCambiosSeguidos = r.cambio ? 0 : sinCambiosSeguidos + 1
      estado = {
        perfiles: r.perfiles,
        serverTs,
        fallos: 0,
        pedidoMs,
        avisos: typeof datos.a === 'number' ? datos.a : null,
      }
    } else if (datos.status === 'sin_cambios' && estado.perfiles) {
      // Nada se ha movido: la lista es la de antes, sólo avanza la hora del servidor.
      sinCambiosSeguidos += 1
      estado = { ...estado, serverTs, fallos: 0, pedidoMs }
    } else {
      huella = typeof datos.etag === 'string' ? datos.etag : null
      olvidarCompacto()
      sinCambiosSeguidos = 0
      estado = {
        perfiles: Array.isArray(datos.profiles) ? datos.profiles : [],
        serverTs: typeof datos.server_ts === 'number' ? datos.server_ts : null,
        fallos: 0,
        pedidoMs,
        avisos: estado.avisos ?? null,
      }
    }
  } catch {
    // Se queda lo último bueno: sin red, saber dónde iban hace un minuto vale más que una lista vacía.
    estado = { ...estado, fallos: estado.fallos + 1 }
  } finally {
    pidiendo = false
  }
  oyentes.forEach((oyente) => oyente(estado))
  ultimoIntervaloMs = siguienteIntervalo()
  programar(esperaTrasFallos(estado.fallos, ultimoIntervaloMs))
}

function siguienteIntervalo(): number {
  return intervaloAdaptativo({ ultimaDuracionMs, pocos: pocosDatosActivo(), sinCambiosSeguidos, rapidoHastaMs })
}

/**
 * El estado que ya trajo la entrada al panel (`/api/admin/arranque`): se toma como la primera respuesta del sondeo, así
 * que al abrir la lista de jugadores no hace falta otra petición enseguida. `pedidoMs` = cuándo se pidió.
 */
export function sembrarEstadoEnVivo(vivo: AdminArranqueVivo | null | undefined, pedidoMs: number) {
  if (!vivo || vivo.status !== 'ok' || !Array.isArray(vivo.profiles)) return
  huella = typeof vivo.etag === 'string' ? vivo.etag : null
  olvidarCompacto()
  estado = {
    perfiles: vivo.profiles,
    serverTs: typeof vivo.server_ts === 'number' ? vivo.server_ts : null,
    fallos: 0,
    pedidoMs,
    avisos: typeof vivo.a === 'number' ? vivo.a : (estado.avisos ?? null),
  }
  oyentes.forEach((oyente) => oyente(estado))
}

function alCambiarVisibilidad() {
  if (oculta()) parar()
  else void pedir()
}

/** Vuelve la red: se pide ya, sin esperar a que acabe la espera larga de después de varios fallos (hasta 2 min). */
function alVolverLaRed() {
  void pedir()
}

export function suscribirEstadoEnVivo(oyente: Oyente): () => void {
  if (!mirandoVisibilidad && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('online', alVolverLaRed)
    mirandoVisibilidad = true
  }
  oyentes.add(oyente)
  if (estado.perfiles) oyente(estado)
  // El primero en mirar arranca el sondeo; los demás se suben al que ya hay. Si la entrada acaba de traer el estado,
  // se espera al turno siguiente en vez de pedirlo otra vez al momento.
  if (oyentes.size === 1) {
    const edad = Date.now() - estado.pedidoMs
    const turno = siguienteIntervalo()
    if (estado.perfiles && estado.pedidoMs > 0 && edad < turno / 2) programar(turno - edad)
    else void pedir()
  }
  return () => {
    oyentes.delete(oyente)
    if (!oyentes.size) parar()
  }
}

/** Pide ya, sin esperar al siguiente turno: tras mover a un jugador desde el panel. El minuto siguiente va más rápido. */
export function refrescarEstadoEnVivo() {
  rapidoHastaMs = Date.now() + RAPIDO_DURANTE_MS
  sinCambiosSeguidos = 0
  void pedir()
}

/** El estado en vivo mientras `activo` (el panel abierto, el mapa con los jugadores a la vista). */
export function useEstadoEnVivo(activo = true): EstadoEnVivo {
  const [actual, setActual] = useState<EstadoEnVivo>(estado)
  useEffect(() => (activo ? suscribirEstadoEnVivo(setActual) : undefined), [activo])
  return actual
}

/**
 * ¿Lo que se enseña es viejo? Más de dos turnos (y más de un minuto) sin una respuesta buena: sin red la lista sigue
 * ahí, pero ya no es «en vivo» (24/11). Devuelve los segundos de antigüedad, o null si es reciente.
 */
export function datosViejosS(
  e: Pick<EstadoEnVivo, 'pedidoMs' | 'perfiles'>,
  ahoraMs = Date.now(),
  turnoMs = ultimoIntervaloMs
): number | null {
  if (!e.perfiles || !e.pedidoMs) return null
  const edad = ahoraMs - e.pedidoMs
  return edad > Math.max(60_000, 2 * turnoMs) ? Math.round(edad / 1000) : null
}

/** «datos de hace 3 min». */
export function textoDatosDeHace(segundos: number): string {
  if (segundos < 90) return `datos de hace ${segundos} s`
  if (segundos < 3600) return `datos de hace ${Math.round(segundos / 60)} min`
  return `datos de hace ${Math.round(segundos / 3600)} h`
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
