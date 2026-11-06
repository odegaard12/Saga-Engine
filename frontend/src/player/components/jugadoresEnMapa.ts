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
  enCorroAntes: ReadonlySet<string> = new Set(),
  opciones: { retratos?: boolean; inclinacion?: number; rumbo?: number; evitar?: readonly Punto[] } = {}
): ElementoDeMapa[] {
  const visibles = jugadores.filter(
    (j) => !j.is_self && typeof j.lat === 'number' && typeof j.lon === 'number'
  )
  const latMedia = visibles.length ? visibles.reduce((suma, j) => suma + Number(j.lat), 0) / visibles.length : 42.5
  if (opciones.retratos)
    return planDeRetratos(visibles, zoom, latMedia, opciones.inclinacion ?? 0, opciones.rumbo ?? 0, opciones.evitar ?? [])
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

/**
 * 7/11: con RETRATOS (vista 2D, o 3D por debajo del zoom de los cuerpos) el corro de 2,2 m no separa nada: un
 * retrato mide 50-110 px y a z17 eso son 45-100 m. Se solapaban y apenas se veían las fotos («quedan fatal»,
 * Óscar). Aquí se mide en PANTALLA: los que se taparían forman una corona alrededor de su centro, con hueco para
 * todos, y una línea fina lleva a cada uno a su sitio real (la pinta el mapa con `lineasDeCorona`). Con más de
 * `MAXIMO_EN_CORONA` juntos, un solo icono con el número, que se abre al tocar (como siempre).
 */
export const MAXIMO_EN_CORONA = 6

/** Ancho de un retrato en pantalla a este zoom (la curva de TAMANO_JUGADOR de MapSurfaceGL, retrato de ~58 px). */
export function anchoDeRetratoPx(zoom: number): number {
  const t = Math.min(1, Math.max(0, (zoom - 12) / 8))
  const base = 1.25 ** (t * 8)
  const tope = 1.25 ** 8
  const tamano = 0.8 + ((base - 1) / (tope - 1)) * (1.9 - 0.8)
  return 58 * tamano
}

function planDeRetratos(
  visibles: Jugador[],
  zoom: number,
  lat: number,
  inclinacion: number,
  rumbo: number,
  evitar: readonly Punto[]
): ElementoDeMapa[] {
  const mpp = metrosPorPixel(zoom, lat)
  const ancho = anchoDeRetratoPx(zoom)
  // Con el mapa inclinado, lo de arriba y abajo de la pantalla se aplasta (coseno de la inclinación): se mira con
  // margen (1,5 retratos) para que la corona no caiga encima de un vecino, y su eje vertical se estira en el suelo.
  const tapanM = ancho * 1.5 * mpp
  const aplastado = Math.max(0.35, Math.cos((Math.min(80, Math.max(0, inclinacion)) * Math.PI) / 180))
  const b = (rumbo * Math.PI) / 180
  const n = visibles.length
  const padre = visibles.map((_, i) => i)
  const raiz = (i: number): number => (padre[i] === i ? i : (padre[i] = raiz(padre[i])))
  for (let a = 0; a < n; a += 1) {
    for (let c = a + 1; c < n; c += 1) {
      if (metrosEntre(visibles[a] as Punto, visibles[c] as Punto) < tapanM) padre[raiz(a)] = raiz(c)
    }
  }
  // Dónde cae en PANTALLA (px, relativo al primero) un punto del suelo: para mirar si dos retratos se tapan.
  const lat0 = n ? Number(visibles[0].lat) : lat
  const lon0 = n ? Number(visibles[0].lon) : 0
  const enPantalla = (p: Punto) => {
    const e = (p.lon - lon0) * 111320 * Math.cos((lat0 * Math.PI) / 180)
    const nn = (p.lat - lat0) * 111320
    return { x: (e * Math.cos(b) - nn * Math.sin(b)) / mpp, y: ((e * Math.sin(b) + nn * Math.cos(b)) / mpp) * aplastado }
  }
  /**
   * 7/11 (prueba de estrés): dos corros cercanos pero separados abrían cada uno su corona y una caía encima de la
   * otra (10 % de los casos con dos grupos a 15-120 m). Se colocan, se mira en pantalla si algún retrato de un grupo
   * tapa a uno de OTRO, y si es así se juntan y se vuelve a colocar (con más de MAXIMO_EN_CORONA, el número).
   */
  /**
   * 7/11 (prueba de estrés): los jugadores se juntan junto al nodo y sus retratos tapaban la chincheta (72 de 100
   * casos en el mapa real). Si algún retrato del grupo cae a menos de `ancho` del punto de un nodo, el grupo entero
   * se aparta de él en pantalla, por la línea nodo → centro del grupo (la línea fina sigue llevando a cada uno a su
   * sitio real). Medido en el mapa real: de 72 a 3 de 100.
   */
  const nodosCerca = evitar.map(enPantalla).filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y))
  const deltaEnSuelo = (dx: number, dy: number) => {
    const sx = dx * mpp
    const sy = (dy * mpp) / aplastado
    return { este: sx * Math.cos(b) + sy * Math.sin(b), norte: -sx * Math.sin(b) + sy * Math.cos(b) }
  }
  function apartarDeLosNodos(grupo: ElementoDeMapa[]) {
    for (let intento = 0; intento < 10; intento += 1) {
      const pts = grupo.map((el) => enPantalla(conCorro(el, el.corro)))
      let peor: { d: number; nodo: { x: number; y: number } } | null = null
      for (const q of pts) {
        for (const nodo of nodosCerca) {
          const d = Math.hypot(q.x - nodo.x, q.y - nodo.y)
          if (d < ancho && (!peor || d < peor.d)) peor = { d, nodo }
        }
      }
      if (!peor) return
      const cx = pts.reduce((s, q) => s + q.x, 0) / pts.length - peor.nodo.x
      const cy = pts.reduce((s, q) => s + q.y, 0) / pts.length - peor.nodo.y
      const largo = Math.hypot(cx, cy)
      const ux = largo > 0.5 ? cx / largo : 1
      const uy = largo > 0.5 ? cy / largo : 0
      const paso = ancho - peor.d + 2
      const delta = deltaEnSuelo(ux * paso, uy * paso)
      for (const el of grupo) el.corro = { este: el.corro.este + delta.este, norte: el.corro.norte + delta.norte }
    }
  }
  let elementos: ElementoDeMapa[] = []
  for (let vuelta = 0; vuelta < 8; vuelta += 1) {
    const grupos = new Map<number, number[]>()
    for (let i = 0; i < n; i += 1) grupos.set(raiz(i), [...(grupos.get(raiz(i)) ?? []), i])
    elementos = []
    const grupoDe: number[] = []
    for (const [r, indices] of grupos) {
      const miembros = indices.map((i) => visibles[i])
      const colocados = colocarGrupo(miembros, ancho, mpp, aplastado, b)
      apartarDeLosNodos(colocados)
      for (const el of colocados) {
        elementos.push(el)
        grupoDe.push(r)
      }
    }
    const pts = elementos.map((el) => enPantalla(conCorro(el, el.corro)))
    let junto = false
    for (let a = 0; a < pts.length; a += 1) {
      for (let c = a + 1; c < pts.length; c += 1) {
        if (grupoDe[a] === grupoDe[c]) continue
        if (Math.hypot(pts[a].x - pts[c].x, pts[a].y - pts[c].y) < ancho * 0.95) {
          padre[raiz(grupoDe[a])] = raiz(grupoDe[c])
          junto = true
        }
      }
    }
    if (!junto) break
  }
  return elementos
}

/** Un grupo de retratos: uno en su sitio, de 2 a MAXIMO_EN_CORONA en corona, y más, un icono con el número. */
function colocarGrupo(miembros: Jugador[], ancho: number, mpp: number, aplastado: number, b: number): ElementoDeMapa[] {
  const centro = {
    lat: miembros.reduce((s, j) => s + Number(j.lat), 0) / miembros.length,
    lon: miembros.reduce((s, j) => s + Number(j.lon), 0) / miembros.length,
  }
  if (miembros.length > MAXIMO_EN_CORONA) {
    return [
      {
        tipo: 'grupo',
        clave: claveDeGrupo(miembros),
        lat: centro.lat,
        lon: centro.lon,
        corro: { este: 0, norte: 0 },
        jugadores: miembros,
        presencia: mejorPresencia(miembros),
      },
    ]
  }
  const orden = [...miembros].sort((x, y) => (claveDeJugador(x) < claveDeJugador(y) ? -1 : 1))
  const radioPx = orden.length < 2 ? 0 : Math.max(ancho * 0.8, (ancho * 1.15 * orden.length) / (2 * Math.PI))
  const giro = orden.length < 2 ? 0 : anguloDeClave(claveDeJugador(orden[0]))
  return orden.map((j, k) => {
    const a = giro + (k * 2 * Math.PI) / orden.length
    // El sitio en la corona, como desplazamiento desde su punto REAL (lat/lon del elemento no cambian).
    // En PANTALLA (derecha, arriba) y llevado al suelo: arriba es la dirección del rumbo, estirada por la inclinación.
    const sx = Math.sin(a) * radioPx * mpp
    const sy = (Math.cos(a) * radioPx * mpp) / aplastado
    const objetivo = { este: sx * Math.cos(b) + sy * Math.sin(b), norte: -sx * Math.sin(b) + sy * Math.cos(b) }
    const dEste = (centro.lon - Number(j.lon)) * 111320 * Math.cos((Number(j.lat) * Math.PI) / 180)
    const dNorte = (centro.lat - Number(j.lat)) * 111320
    return {
      tipo: 'jugador' as const,
      clave: claveDeJugador(j),
      lat: Number(j.lat),
      lon: Number(j.lon),
      corro: orden.length < 2 ? { este: 0, norte: 0 } : { este: dEste + objetivo.este, norte: dNorte + objetivo.norte },
      jugadores: [j],
      presencia: tipoDePresencia(j),
    }
  })
}

/** Las líneas finas de la corona: de cada retrato apartado a su sitio real (GeoJSON para una capa de líneas). */
export function lineasDeCorona(elementos: readonly ElementoDeMapa[]) {
  return {
    type: 'FeatureCollection' as const,
    features: elementos
      .filter((el) => el.tipo === 'jugador' && (el.corro.este || el.corro.norte))
      .map((el) => {
        const sitio = conCorro(el, el.corro)
        return {
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'LineString' as const, coordinates: [[el.lon, el.lat], [sitio.lon, sitio.lat]] },
        }
      }),
  }
}
