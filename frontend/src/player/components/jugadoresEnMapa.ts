import type { TeamProfileLiveStatus } from '../../types/player'
import { getPlayerColor } from '../../shared/playerIdentity'
import { elementoDeRetrato, urlDeFotoValida } from '../avatares/retratoDeMapa'
import { getPlayerAvatarUrl } from '../../shared/playerIdentity'
import { aspectoDe } from '../avatares3d/mixamo/catalogo'
import { ZOOM_MINIMO_AVATARES } from '../avatares3d/mixamo/lodAvatares'
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
 * dos compañeros están en el mismo sitio se abren un poco en el suelo (ver
 * `corroEnMetros`), nunca respecto a ti ni a la cámara. Todo
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

/**
 * Varios compañeros en el mismo sitio (zoom lejano): la lista. Con `alElegir`, cada nombre es un botón
 * que abre su ficha.
 */
export function contenidoPopupGrupo(
  jugadores: Jugador[],
  alCerrar?: () => void,
  alElegir?: (jugador: Jugador) => void
): HTMLElement {
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
    const texto = `${jugador.display_name || jugador.user || t.jugador} · ${estado}`
    if (!alElegir) {
      raiz.appendChild(elemento('saga-popup-linea', texto))
      continue
    }
    const boton = document.createElement('button')
    boton.type = 'button'
    boton.className = 'saga-popup-linea saga-popup-elegir'
    boton.textContent = `${texto} ›`
    // Como una línea más de la tarjeta, pero tocable (44 px de alto para el dedo).
    boton.style.cssText =
      'display:block;width:100%;min-height:44px;text-align:left;background:none;border-left:0;border-right:0;border-bottom:0;font:inherit;font-size:13px;cursor:pointer'
    boton.addEventListener('click', (ev) => {
      ev.stopPropagation()
      alElegir(jugador)
    })
    raiz.appendChild(boton)
  }
  return raiz
}


/** Metros por píxel de pantalla a un zoom de MapLibre (mundo de 512 px) y latitud. */
export function metrosPorPixel(zoom: number, lat: number): number {
  return (78271.517 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom
}

/**
 * Corro (5.52): sólo entre compañeros que están DE VERDAD en el mismo sitio, y en METROS del suelo.
 *
 * Hasta 5.51 se abría en PANTALLA (`icon-offset`) alrededor de TU icono y de los ya colocados, con un umbral del
 * tamaño del muñeco (20 m a z18): el compañero que caía cerca de ti se dibujaba a 80-90 px de su punto, y el cuerpo
 * 3D se recolocaba cada fotograma con `unproject` de ese punto de pantalla. Como la cámara te sigue, ese sitio
 * cambiaba al andar tú: «los demás van asociados a mí». Ahora tú no cuentas, el desplazamiento es fijo por jugador
 * (sale de su clave) y vive en el suelo, así que ni moverte, ni girar, ni el zoom lo mueven.
 */
/** Dos compañeros a menos de esto se abren en corro... */
export const CORRO_JUNTOS_M = 3
/** ...y siguen en él hasta separarse de esto (histéresis: el ruido del GPS no los hace saltar). */
export const CORRO_SEPARADOS_M = 4.5
/** Cuánto se aparta cada uno de su punto real, en metros. */
export const CORRO_RADIO_M = 2.2
/** Desde este zoom el corro se encoge (ya caben)... */
export const CORRO_ZOOM_ENCOGE = 18
/**
 * ...hasta quedarse en esta fracción a zoom 19,5. No baja más: el muñeco se dibuja ~5 veces su tamaño real (para que
 * se vea), y con un tercio (0,8 m) los dos cuerpos se atravesaban (medido en r12_foto_encima.jpg).
 */
export const CORRO_FRACCION_MINIMA = 0.7

export type ElementoDeMapa = {
  tipo: 'jugador' | 'grupo'
  clave: string
  /** Posición REAL (la del jugador, o el centro del grupo). Nunca se desplaza. */
  lat: number
  lon: number
  /** Corro en el suelo: metros hacia el este y hacia el norte desde su punto real (0, 0 = en su sitio). */
  corro: { este: number; norte: number }
  jugadores: Jugador[]
  presencia: TipoDePresencia
}

/** El corro en metros a este zoom (entero hasta z18; a z19,5 el 70 %). */
export function radioDeCorroM(zoom: number): number {
  const z = Number.isFinite(zoom) ? zoom : CORRO_ZOOM_ENCOGE
  const t = Math.min(1, Math.max(0, (z - CORRO_ZOOM_ENCOGE) / 1.5))
  return CORRO_RADIO_M * (1 - t * (1 - CORRO_FRACCION_MINIMA))
}

/** Un ángulo fijo para cada clave (FNV-1a): el mismo en todos los móviles y en cada dibujo. */
function anguloDeClave(clave: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < clave.length; i += 1) h = Math.imul(h ^ clave.charCodeAt(i), 0x01000193) >>> 0
  return ((h % 3600) / 3600) * 2 * Math.PI
}

/**
 * El corro de los compañeros que coinciden: grupos por cercanía real (unión de pares a menos de
 * `CORRO_JUNTOS_M`, o de `CORRO_SEPARADOS_M` si ya estaban juntos), y en cada grupo un reparto en abanico
 * ordenado por clave, girado según la clave más baja del grupo. Nada depende de ti ni de la cámara.
 */
export function corroEnMetros(
  puntos: readonly { clave: string; lat: number; lon: number }[],
  zoom: number,
  enCorroAntes: ReadonlySet<string> = new Set()
): Map<string, { este: number; norte: number }> {
  const n = puntos.length
  const padre = puntos.map((_, i) => i)
  const raiz = (i: number): number => (padre[i] === i ? i : (padre[i] = raiz(padre[i])))
  for (let a = 0; a < n; a += 1) {
    for (let b = a + 1; b < n; b += 1) {
      const juntosAntes = enCorroAntes.has(puntos[a].clave) && enCorroAntes.has(puntos[b].clave)
      if (metrosEntre(puntos[a], puntos[b]) < (juntosAntes ? CORRO_SEPARADOS_M : CORRO_JUNTOS_M))
        padre[raiz(a)] = raiz(b)
    }
  }
  const grupos = new Map<number, number[]>()
  for (let i = 0; i < n; i += 1) grupos.set(raiz(i), [...(grupos.get(raiz(i)) ?? []), i])
  const salida = new Map<string, { este: number; norte: number }>()
  const radio = radioDeCorroM(zoom)
  for (const miembros of grupos.values()) {
    if (miembros.length < 2) continue
    const orden = [...miembros].sort((x, y) => (puntos[x].clave < puntos[y].clave ? -1 : 1))
    const giro = anguloDeClave(puntos[orden[0]].clave)
    orden.forEach((i, k) => {
      const a = giro + (k * 2 * Math.PI) / orden.length
      salida.set(puntos[i].clave, { este: Math.sin(a) * radio, norte: Math.cos(a) * radio })
    })
  }
  return salida
}

/** El punto desplazado `corro` metros (este, norte) desde (lat, lon). */
export function conCorro(p: Punto, corro: { este: number; norte: number }): Punto {
  if (!corro.este && !corro.norte) return { lat: p.lat, lon: p.lon }
  const m = 111320
  return {
    lat: p.lat + corro.norte / m,
    lon: p.lon + corro.este / (m * Math.cos((p.lat * Math.PI) / 180)),
  }
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
 * - Cerca unos de otros y con zoom bajo (< 16, el de los avatares 3D): un solo icono de grupo.
 * - Con zoom alto: cada jugador en su posición real.
 * - Los que coinciden en el mismo sitio (a pocos metros ENTRE ELLOS) reciben un `corro` fijo en metros
 *   (`corroEnMetros`). Tu posición no interviene: moverte nunca mueve a los demás.
 *
 * `enCorroAntes`: claves que ya estaban en corro en el plan anterior (histéresis).
 */
export function planDeJugadores(
  jugadores: Jugador[],
  zoom: number,
  enCorroAntes: ReadonlySet<string> = new Set()
): ElementoDeMapa[] {
  const visibles = jugadores.filter(
    (j) => !j.is_self && typeof j.lat === 'number' && typeof j.lon === 'number'
  )
  const latMedia = visibles.length ? visibles.reduce((suma, j) => suma + Number(j.lat), 0) / visibles.length : 42.5
  const grupos = agruparJugadores(visibles, radioDeAgrupacion(zoom, latMedia))
  const elementos: ElementoDeMapa[] = []
  for (const grupo of grupos) {
    // Desde el zoom de los avatares 3D nadie se funde en un grupo: cada uno con su cuerpo o su retrato, abiertos en
    // corro si caen juntos. Así el paso 3D <-> retrato es el mismo zoom para todos (antes, entre z16 y z17, los que
    // iban juntos seguían en mancha y los sueltos ya en 3D).
    if (grupo.players.length > 1 && zoom < ZOOM_MINIMO_AVATARES) {
      elementos.push({
        tipo: 'grupo',
        clave: claveDeGrupo(grupo.players),
        lat: grupo.lat,
        lon: grupo.lon,
        corro: { este: 0, norte: 0 },
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
        corro: { este: 0, norte: 0 },
        jugadores: [jugador],
        presencia: tipoDePresencia(jugador),
      })
    }
  }

  const sueltos = elementos.filter((el) => el.tipo === 'jugador')
  const corro = corroEnMetros(sueltos, zoom, enCorroAntes)
  for (const el of sueltos) el.corro = corro.get(el.clave) ?? el.corro
  return elementos
}
