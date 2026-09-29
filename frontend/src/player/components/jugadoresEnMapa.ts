import type { TeamProfileLiveStatus } from '../../types/player'
import {
  getPlayerAvatarInitials,
  getPlayerAvatarUrl,
  getPlayerColor,
} from '../../shared/playerIdentity'

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
  el.setAttribute('aria-label', jugador.display_name || jugador.user || 'Jugador')
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
  el.setAttribute('aria-label', `${cuantos} jugadores cerca`)
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
  if (typeof ultimaVez !== 'number' || !Number.isFinite(ultimaVez)) return 'sin actualizar'
  const segundos = Math.max(0, Math.round(Date.now() / 1000 - ultimaVez))
  if (segundos < 60) return `hace ${segundos}s`
  const minutos = Math.round(segundos / 60)
  if (minutos < 60) return `hace ${minutos}min`
  return `hace ${Math.round(minutos / 60)}h`
}

function linea(texto: string, estilo: Partial<CSSStyleDeclaration>): HTMLElement {
  const el = document.createElement('div')
  el.textContent = texto
  Object.assign(el.style, estilo)
  return el
}

/** Lo que se ve al tocar a un compañero: quién es, por qué nodo va y cuánto lleva. */
export function contenidoPopupJugador(
  jugador: Jugador,
  tipo: TipoDePresencia,
  totalNodos: number
): HTMLElement {
  const raiz = document.createElement('div')
  Object.assign(raiz.style, {
    minWidth: '190px',
    font: '600 13px system-ui, sans-serif',
    color: '#f8fafc',
  } as Partial<CSSStyleDeclaration>)
  const color = getPlayerColor(jugador)
  raiz.appendChild(
    linea(jugador.display_name || jugador.user || 'Jugador', {
      fontSize: '15px',
      fontWeight: '900',
    } as Partial<CSSStyleDeclaration>)
  )
  raiz.appendChild(
    linea(tipo === 'live' ? 'EN LÍNEA' : tipo === 'recent' ? 'RECIENTE' : 'SIN CONEXIÓN', {
      fontSize: '9px',
      fontWeight: '900',
      letterSpacing: '.1em',
      color,
      marginTop: '3px',
    } as Partial<CSSStyleDeclaration>)
  )
  const ms = Number(jugador.total_time_ms || 0)
  const tiempo = `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`
  const nivel = Number(jugador.level || 0)
  const nodo = jugador.finished
    ? 'Rematou'
    : totalNodos > 0
      ? `${Math.min(nivel + 1, totalNodos)} / ${totalNodos}`
      : String(nivel + 1)
  raiz.appendChild(
    linea(`Nodo ${nodo} · Tempo ${tiempo}`, { marginTop: '8px' } as Partial<CSSStyleDeclaration>)
  )
  raiz.appendChild(
    linea(`Visto ${haceCuanto(jugador.last_seen)}`, {
      marginTop: '6px',
      fontSize: '10px',
      opacity: '0.72',
    } as Partial<CSSStyleDeclaration>)
  )
  return raiz
}

export function contenidoPopupGrupo(jugadores: Jugador[]): HTMLElement {
  const raiz = document.createElement('div')
  Object.assign(raiz.style, {
    minWidth: '170px',
    font: '600 13px system-ui, sans-serif',
    color: '#f8fafc',
  } as Partial<CSSStyleDeclaration>)
  raiz.appendChild(
    linea('Jugadores cerca', { fontWeight: '900', marginBottom: '6px' } as Partial<CSSStyleDeclaration>)
  )
  for (const jugador of jugadores) {
    raiz.appendChild(
      linea(
        `${jugador.display_name || jugador.user || 'Jugador'} · ${String(jugador.presence || 'online').toUpperCase()}`,
        { padding: '2px 0' } as Partial<CSSStyleDeclaration>
      )
    )
  }
  return raiz
}
