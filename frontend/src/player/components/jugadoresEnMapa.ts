import type { TeamProfileLiveStatus } from '../../types/player'
import { getPlayerColor } from '../../shared/playerIdentity'
import { elementoDeRetrato, urlDeFotoValida } from '../avatares/retratoDeMapa'
import { getPlayerAvatarUrl } from '../../shared/playerIdentity'
import { aspectoDe } from '../avatares3d/mixamo/catalogo'
import { alturaEnPantallaPx, ZOOM_MINIMO_AVATARES } from '../avatares3d/mixamo/lodAvatares'
import { getLocale } from '../../i18n'
import { textosDePantallasDe } from './textosDePantallas'

/** Los textos del popup, en el idioma de ESTE momento (se construye al tocar). */
function textosDelPopup() {
  return textosDePantallasDe(getLocale()).popup
}

/**
 * Los compañeros en el mapa 3D: agrupación por cercanía y plan de dibujo.
 *
 * Se pintan como SÍMBOLOS del mapa (capa WebGL, igual que los nodos), nunca
 * como marcadores del DOM: la posición de cada uno es SIEMPRE la real. Cuando
 * dos caen en el mismo sitio en pantalla se separan con un `icon-offset` (ver
 * `huecoDeSolape`), sin tocar sus coordenadas. Todo
 * el texto se construye con `textContent`, nunca con `innerHTML`: los nombres
 * los escribe el jugador.
 */

export type TipoDePresencia = 'live' | 'recent' | 'offline'

type Punto = { lat: number; lon: number }
type Jugador = TeamProfileLiveStatus

export type GrupoDeJugadores = { lat: number; lon: number; players: Jugador[] }

export function tipoDePresencia(jugador: Jugador): TipoDePresencia {
  const presencia = String(jugador.presence || 'offline').toLowerCase()
  return presencia === 'offline' ? 'offline' : presencia === 'stale' ? 'recent' : 'live'
}

/** A cuántos píxeles de pantalla dos compañeros se funden en un grupo (con zoom bajo). */
export const AGRUPAR_BAJO_PX = 30

/**
 * Radio (m) por debajo del cual dos jugadores se funden en un grupo, según el zoom.
 *
 * Con zoom de calle (>= 17) son metros fijos y cada uno va por su cuenta (el
 * solape se resuelve con huecos). Con zoom bajo el criterio es el de PANTALLA:
 * se agrupan los que quedarían a menos de `AGRUPAR_BAJO_PX` píxeles, que a zoom 11
 * son ~1 km y a zoom 13 unos 200 m. Antes eran 120 m fijos: a zoom 11-13 dos
 * compañeros a 600 m se pintaban uno encima de otro y el hueco los apartaba
 * 50 px (kilómetros) de su sitio real.
 */
export function radioDeAgrupacion(zoom: number, lat = 42.5): number {
  if (zoom >= 19) return 4
  if (zoom >= 18) return 8
  if (zoom >= 17) return 24
  return Math.max(24, AGRUPAR_BAJO_PX * metrosPorPixel(zoom, lat))
}

function metrosEntre(a: Punto, b: Punto): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function agruparJugadores(jugadores: Jugador[], radioMetros: number): GrupoDeJugadores[] {
  const grupos: GrupoDeJugadores[] = []
  for (const jugador of jugadores) {
    if (typeof jugador.lat !== 'number' || typeof jugador.lon !== 'number') continue
    const punto = { lat: jugador.lat, lon: jugador.lon }
    const grupo = grupos.find((candidato) => metrosEntre(punto, candidato) <= radioMetros)
    if (grupo) {
      grupo.players.push(jugador)
      const n = grupo.players.length
      grupo.lat = (grupo.lat * (n - 1) + jugador.lat) / n
      grupo.lon = (grupo.lon * (n - 1) + jugador.lon) / n
    } else {
      grupos.push({ lat: jugador.lat, lon: jugador.lon, players: [jugador] })
    }
  }
  return grupos
}

export function distanciaEnMetros(a: Punto, b: Punto): number {
  return metrosEntre(a, b)
}

/** Clave estable de un jugador suelto (para reutilizar su marcador). */
export function claveDeJugador(jugador: Jugador): string {
  return String(jugador.user || jugador.display_name || `${jugador.lat}:${jugador.lon}`)
}

export function claveDeGrupo(jugadores: Jugador[]): string {
  return `grupo:${jugadores.map((j) => j.user || j.display_name).join('|')}`
}

function haceCuanto(ultimaVez?: number): string {
  const t = textosDelPopup()
  if (typeof ultimaVez !== 'number' || !Number.isFinite(ultimaVez)) return t.sinActualizar
  const segundos = Math.max(0, Math.round(Date.now() / 1000 - ultimaVez))
  if (segundos < 60) return t.haceSegundos(segundos)
  const minutos = Math.round(segundos / 60)
  if (minutos < 60) return t.haceMinutos(minutos)
  return t.haceHoras(Math.round(minutos / 60))
}

/** «45 m», «1,2 km»: la distancia en palabras cortas. */
export function distanciaLegible(metros: number): string {
  if (!Number.isFinite(metros)) return ''
  if (metros < 10) return `${Math.max(1, Math.round(metros))} m`
  if (metros < 1000) return `${Math.round(metros / 10) * 10} m`
  return `${(metros / 1000).toFixed(1).replace('.', ',')} km`
}

function elemento(clase: string, texto?: string): HTMLElement {
  const el = document.createElement('div')
  el.className = clase
  if (texto !== undefined) el.textContent = texto
  return el
}

function botonCerrar(alCerrar?: () => void): HTMLElement {
  const cerrar = document.createElement('button')
  cerrar.type = 'button'
  cerrar.className = 'saga-popup-cerrar'
  cerrar.setAttribute('aria-label', textosDelPopup().cerrar)
  cerrar.textContent = '×'
  cerrar.addEventListener('click', (ev) => {
    ev.stopPropagation()
    alCerrar?.()
  })
  return cerrar
}

/**
 * Lo que se ve al tocar a un compañero. Los colores salen de la clase
 * `.saga-popup-jugador` (map-surface.css), que usa las variables del tema como
 * el resto de tarjetas del jugador: nada de blanco sobre blanco.
 */
export function contenidoPopupJugador(
  jugador: Jugador,
  tipo: TipoDePresencia,
  totalNodos: number,
  miPosicion?: Punto | null,
  alCerrar?: () => void,
  conFoto = false
): HTMLElement {
  const t = textosDelPopup()
  const raiz = elemento('saga-popup-jugador')

  const cabecera = elemento('saga-popup-cabecera')
  // El retrato de su personaje; en la vista 2D, su foto de perfil (la misma que se ve en el pin del mapa).
  const cara = elemento('saga-popup-cara')
  const color = getPlayerColor(jugador)
  const foto = conFoto ? getPlayerAvatarUrl(jugador) : ''
  cara.appendChild(
    elementoDeRetrato(
      aspectoDe(jugador).mx,
      /^#[0-9a-f]{6}$/i.test(color) ? color : '#3b82f6',
      40,
      urlDeFotoValida(foto) ? foto : undefined
    )
  )
  cabecera.appendChild(cara)

  const quien = elemento('saga-popup-quien')
  quien.appendChild(elemento('saga-popup-nombre', jugador.display_name || jugador.user || t.jugador))
  quien.appendChild(
    elemento(
      `saga-popup-estado saga-popup-estado-${tipo}`,
      tipo === 'live' ? t.enLinea : tipo === 'recent' ? t.reciente : t.sinConexion
    )
  )
  cabecera.appendChild(quien)
  cabecera.appendChild(botonCerrar(alCerrar))
  raiz.appendChild(cabecera)

  const miembros = (jugador.members || []).filter(Boolean)
  if (miembros.length > 1) raiz.appendChild(elemento('saga-popup-linea', t.equipo(miembros.join(', '))))

  const ms = Number(jugador.total_time_ms || 0)
  const tiempo = `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`
  const nivel = Number(jugador.level || 0)
  const nodo = jugador.finished
    ? t.terminado
    : totalNodos > 0
      ? `${Math.min(nivel + 1, totalNodos)} / ${totalNodos}`
      : String(nivel + 1)
  raiz.appendChild(elemento('saga-popup-linea', t.nodoTiempo(nodo, tiempo)))

  const lejos =
    miPosicion && typeof jugador.lat === 'number' && typeof jugador.lon === 'number'
      ? distanciaEnMetros(miPosicion, { lat: jugador.lat, lon: jugador.lon })
      : null
  raiz.appendChild(
    elemento('saga-popup-linea', lejos === null ? t.distanciaDesconocida : t.distancia(distanciaLegible(lejos)))
  )
  raiz.appendChild(elemento('saga-popup-linea saga-popup-visto', t.visto(haceCuanto(jugador.last_seen))))
  return raiz
}

export function contenidoPopupGrupo(jugadores: Jugador[], alCerrar?: () => void): HTMLElement {
  const t = textosDelPopup()
  const raiz = elemento('saga-popup-jugador')
  const cabecera = elemento('saga-popup-cabecera')
  const quien = elemento('saga-popup-quien')
  quien.appendChild(elemento('saga-popup-nombre', t.jugadoresCerca))
  cabecera.appendChild(quien)
  cabecera.appendChild(botonCerrar(alCerrar))
  raiz.appendChild(cabecera)
  for (const jugador of jugadores) {
    const tipo = tipoDePresencia(jugador)
    const estado = tipo === 'live' ? t.enLinea : tipo === 'recent' ? t.reciente : t.sinConexion
    raiz.appendChild(elemento('saga-popup-linea', `${jugador.display_name || jugador.user || t.jugador} · ${estado}`))
  }
  return raiz
}


/** Metros por píxel de pantalla a un zoom de MapLibre (mundo de 512 px) y latitud. */
export function metrosPorPixel(zoom: number, lat: number): number {
  return (78271.517 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom
}

/** A cuántos píxeles de otro icono deja de estar tapado (retrato de ~38-60 px). */
export const SOLAPE_MINIMO_PX = 40
/** Cuántos huecos tiene cada corona alrededor de un icono para abrir a los que caen encima. */
export const HUECOS_EN_CORRO = 8
/** Dos coronas: con quince jugadores en el mismo sitio caben todos sin pisarse. */
export const HUECOS_TOTALES = 2 * HUECOS_EN_CORRO
export type ElementoDeMapa = {
  tipo: 'jugador' | 'grupo'
  clave: string
  /** Posición REAL (la del jugador, o el centro del grupo). Nunca se desplaza. */
  lat: number
  lon: number
  /** 0 = sin desplazar; 1..16 = hueco en pantalla alrededor del icono que tapaba (1..8 la primera corona, 9..16 la segunda). */
  hueco: number
  jugadores: Jugador[]
  presencia: TipoDePresencia
}

const ORDEN_PRESENCIA: Record<TipoDePresencia, number> = { offline: 0, recent: 1, live: 2 }
export function ordenDePresencia(presencia: TipoDePresencia): number {
  return ORDEN_PRESENCIA[presencia]
}

/** La presencia más «viva» de un grupo de jugadores. */
function mejorPresencia(jugadores: Jugador[]): TipoDePresencia {
  let mejor: TipoDePresencia = 'offline'
  for (const j of jugadores) {
    const p = tipoDePresencia(j)
    if (ORDEN_PRESENCIA[p] > ORDEN_PRESENCIA[mejor]) mejor = p
  }
  return mejor
}

/**
 * Qué se dibuja y dónde. Función pura: sin mapa ni DOM.
 *
 * - Cerca unos de otros y con zoom bajo (< 17): un solo icono de grupo.
 * - Con zoom alto: cada jugador en su posición real.
 * - Los que quedan a menos de `SOLAPE_MINIMO_PX` de TI o de otro icono ya
 *   colocado reciben un `hueco` (1..8): un desplazamiento en pantalla que
 *   aplica la capa con `icon-offset`. Se mide en píxeles a este zoom, no en
 *   metros, así que es el mismo criterio a zoom 15 que a zoom 20.
 */
export function planDeJugadores(
  jugadores: Jugador[],
  zoom: number,
  yo: Punto | null
): ElementoDeMapa[] {
  const visibles = jugadores.filter(
    (j) => !j.is_self && typeof j.lat === 'number' && typeof j.lon === 'number'
  )
  const latMedia = visibles.length ? visibles.reduce((suma, j) => suma + Number(j.lat), 0) / visibles.length : 42.5
  const grupos = agruparJugadores(visibles, radioDeAgrupacion(zoom, latMedia))
  const elementos: ElementoDeMapa[] = []
  for (const grupo of grupos) {
    if (grupo.players.length > 1 && zoom < 17) {
      elementos.push({
        tipo: 'grupo',
        clave: claveDeGrupo(grupo.players),
        lat: grupo.lat,
        lon: grupo.lon,
        hueco: 0,
        jugadores: grupo.players,
        presencia: mejorPresencia(grupo.players),
      })
      continue
    }
    for (const jugador of grupo.players) {
      elementos.push({
        tipo: 'jugador',
        clave: claveDeJugador(jugador),
        lat: Number(jugador.lat),
        lon: Number(jugador.lon),
        hueco: 0,
        jugadores: [jugador],
        presencia: tipoDePresencia(jugador),
      })
    }
  }

  // Anclas ya ocupadas: tú primero (tu icono va encima y no debe taparse).
  const anclas: { lat: number; lon: number; usados: number }[] = []
  if (yo) anclas.push({ lat: yo.lat, lon: yo.lon, usados: 0 })
  for (const el of elementos) {
    // Con avatares 3D (zoom >= 16) el cuerpo ocupa más que un retrato: se aparta quien cae en su espacio.
    const umbralPx =
      zoom >= ZOOM_MINIMO_AVATARES
        ? Math.max(SOLAPE_MINIMO_PX, 0.9 * alturaEnPantallaPx(zoom, el.lat))
        : SOLAPE_MINIMO_PX
    const umbral = umbralPx * metrosPorPixel(zoom, el.lat)
    const ancla = anclas.find((a) => metrosEntre(a, el) < umbral)
    if (ancla) {
      el.hueco = 1 + (ancla.usados % HUECOS_TOTALES)
      ancla.usados += 1
    } else {
      anclas.push({ lat: el.lat, lon: el.lon, usados: 0 })
    }
  }
  return elementos
}

/**
 * Desplazamiento en píxeles (a tamaño 1 del icono) de cada hueco: en corro,
 * empezando arriba a la derecha. `icon-offset` lo multiplica por el tamaño del
 * icono, así que se abren igual a cualquier zoom. La segunda corona (huecos 9..16)
 * va más afuera y girada medio paso, para que cada retrato caiga entre dos de la primera.
 */
export function desplazamientoDeHueco(hueco: number, radioPx = 50): [number, number] {
  if (hueco <= 0) return [0, 0]
  const corona = hueco > HUECOS_EN_CORRO ? 1 : 0
  const i = (hueco - 1) % HUECOS_EN_CORRO
  const angulo = -Math.PI / 4 + ((i + corona * 0.5) * 2 * Math.PI) / HUECOS_EN_CORRO
  const radio = radioPx * (corona ? 1.85 : 1)
  return [Math.round(Math.cos(angulo) * radio), Math.round(Math.sin(angulo) * radio)]
}
