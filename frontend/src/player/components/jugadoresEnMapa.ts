import type { TeamProfileLiveStatus } from '../../types/player'
import {
  getPlayerAvatarInitials,
  getPlayerAvatarUrl,
  getPlayerColor,
} from '../../shared/playerIdentity'
import { getLocale } from '../../i18n'
import { textosDePantallasDe } from './textosDePantallas'

/** Los textos del popup, en el idioma de ESTE momento (se construye al tocar). */
function textosDelPopup() {
  return textosDePantallasDe(getLocale()).popup
}

/**
 * Los compañeros en el mapa 3D: agrupación por cercanía y marcadores del DOM.
 *
 * Es lo que hacía el mapa de Leaflet (ya retirado) con `otherPlayers`. Todo
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

/** Radio (m) por debajo del cual dos jugadores se funden en un grupo, según el zoom. */
export function radioDeAgrupacion(zoom: number): number {
  if (zoom >= 19) return 4
  if (zoom >= 18) return 8
  if (zoom >= 17) return 24
  if (zoom >= 16) return 60
  return 120
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

/** Desplaza un punto `metros` en el ángulo dado (grados, 0 = este). */
export function desplazar(punto: Punto, metros: number, anguloGrados: number): Punto {
  const angulo = (anguloGrados * Math.PI) / 180
  return {
    lat: punto.lat + (Math.sin(angulo) * metros) / 111_111,
    lon:
      punto.lon +
      (Math.cos(angulo) * metros) /
        (111_111 * Math.max(0.18, Math.cos((punto.lat * Math.PI) / 180))),
  }
}

/** Reparte `total` jugadores en corro alrededor de un centro. */
export function repartirEnCorro(
  centro: Punto,
  indice: number,
  total: number,
  radioMetros: number,
  anguloInicial = -45
): Punto {
  if (total <= 1) return centro
  return desplazar(centro, radioMetros, anguloInicial + (360 / total) * indice)
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

/** El círculo con foto (o iniciales) y el color del jugador. */
export function crearElementoJugador(jugador: Jugador, tipo: TipoDePresencia): HTMLElement {
  const color = getPlayerColor(jugador)
  const foto = getPlayerAvatarUrl(jugador)
  const iniciales = getPlayerAvatarInitials(jugador)
  const el = document.createElement('div')
  el.setAttribute('role', 'button')
  el.setAttribute('aria-label', jugador.display_name || jugador.user || textosDelPopup().jugador)
  Object.assign(el.style, {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    boxSizing: 'border-box',
    border: `3px solid ${color}`,
    background: color,
    color: '#fff',
    font: '900 14px system-ui, sans-serif',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(0,0,0,.45)',
    opacity: tipo === 'offline' ? '0.55' : tipo === 'recent' ? '0.8' : '1',
    filter: tipo === 'offline' ? 'grayscale(0.7)' : 'none',
  } as Partial<CSSStyleDeclaration>)
  if (foto) {
    const img = document.createElement('img')
    img.src = foto
    img.alt = ''
    Object.assign(img.style, { width: '100%', height: '100%', objectFit: 'cover', display: 'block' })
    el.appendChild(img)
  } else {
    el.textContent = iniciales
  }
  return el
}

export function crearElementoGrupo(cuantos: number): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute('role', 'button')
  el.setAttribute('aria-label', textosDelPopup().ariaGrupo(cuantos))
  Object.assign(el.style, {
    width: '46px',
    height: '46px',
    borderRadius: '50%',
    background: 'rgba(var(--theme-ink), .92)',
    border: '2px solid rgba(255,255,255,.7)',
    color: '#fff',
    font: '900 15px system-ui, sans-serif',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2px',
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(0,0,0,.45)',
  } as Partial<CSSStyleDeclaration>)
  el.textContent = `👥${cuantos}`
  return el
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
  alCerrar?: () => void
): HTMLElement {
  const t = textosDelPopup()
  const raiz = elemento('saga-popup-jugador')

  const cabecera = elemento('saga-popup-cabecera')
  const cara = elemento('saga-popup-cara')
  cara.style.background = getPlayerColor(jugador)
  const foto = getPlayerAvatarUrl(jugador)
  if (foto) {
    const img = document.createElement('img')
    img.src = foto
    img.alt = ''
    cara.appendChild(img)
  } else {
    cara.textContent = getPlayerAvatarInitials(jugador)
  }
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

/** Cerca de ti (px) un compañero tapa tu marcador; por debajo de esto se aparta. */
const SOLAPE_MINIMO_PX = 52
/** A cuántos píxeles de ti se coloca el compañero apartado. */
const SEPARACION_PX = 60

/** Lo que se eleva tu avatar sobre el suelo (ver ALTURA_SIMBOLOS_M en MapSurfaceGL). */
const ALTURA_DE_TU_AVATAR_M = 3

/**
 * Aparta en PANTALLA a los compañeros que caerían encima de tu marcador.
 * Se mide en píxeles y no en metros: a zoom 15 unos metros son un píxel y
 * a zoom 20 son cientos, y el tapón es el mismo. Se recalcula al mover y al
 * hacer zoom (el `offset` del marcador sigue al mapa).
 *
 * Tu avatar flota unos metros sobre el suelo; con el mapa inclinado eso lo
 * sube en pantalla (h·sen(inclinación)/metros-por-píxel), y es ahí, no en el
 * punto del suelo, donde no debe tapártelo nadie.
 */
export function apartarDeMi(
  mapa: {
    project: (lngLat: [number, number]) => { x: number; y: number }
    getZoom?: () => number
    getPitch?: () => number
  },
  marcadores: Map<string, { marcador: { setOffset: (offset: [number, number]) => unknown }; punto: Punto }>,
  yo: Punto | null
) {
  const suelo = yo ? mapa.project([yo.lon, yo.lat]) : null
  let subida = 0
  if (yo && mapa.getZoom && mapa.getPitch) {
    const metrosPorPixel = (78271.517 * Math.cos((yo.lat * Math.PI) / 180)) / 2 ** mapa.getZoom()
    subida = Math.min(48, (ALTURA_DE_TU_AVATAR_M * Math.sin((mapa.getPitch() * Math.PI) / 180)) / metrosPorPixel)
  }
  const conmigo = suelo ? { x: suelo.x, y: suelo.y - subida } : null
  let n = 0
  marcadores.forEach((entrada) => {
    let dx = 0
    let dy = 0
    if (conmigo) {
      const p = mapa.project([entrada.punto.lon, entrada.punto.lat])
      const vx = p.x - conmigo.x
      const vy = p.y - conmigo.y
      const d = Math.hypot(vx, vy)
      if (d < SOLAPE_MINIMO_PX) {
        // En el mismo sitio no hay dirección: se abren en abanico.
        const angulo = d > 1 ? Math.atan2(vy, vx) : -Math.PI / 4 + n * 1.1
        dx = Math.cos(angulo) * SEPARACION_PX - vx
        dy = Math.sin(angulo) * SEPARACION_PX - vy
        n += 1
      }
    }
    entrada.marcador.setOffset([dx, dy])
  })
}
