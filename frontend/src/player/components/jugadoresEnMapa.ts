import type { TeamProfileLiveStatus } from '../../types/player'
import { getPlayerAvatarUrl, getPlayerColor } from '../../shared/playerIdentity'
import { elementoDeRetrato, urlDeFotoValida } from '../avatares/retratoDeMapa'
import { aspectoDe } from '../avatares3d/mixamo/catalogo'
import { alturaEnPantallaPx } from '../avatares3d/mixamo/lodAvatares'
import { getLocale } from '../../i18n'
import { textosDePantallasDe } from './textosDePantallas'
import type { ProyeccionDelMapa } from './repartoDeNodos'

/** Los textos del popup, en el idioma de ESTE momento (se construye al tocar). */
function textosDelPopup() {
  return textosDePantallasDe(getLocale()).popup
}

/**
 * Los compañeros (y tú) en el mapa: el plan de dibujo y las fichas.
 *
 * Los retratos se pintan como SÍMBOLOS del mapa (capa WebGL, igual que los nodos) y los cuerpos 3D en la capa de
 * avatares; el abanico de quien no cabe y el aro que late en tu retrato son marcadores del DOM. La coordenada de cada
 * elemento es SIEMPRE la real: lo que se aparta para no taparse va en `corro` (metros en el suelo), que se calcula
 * midiendo en PANTALLA (`planDeJugadores`): racimo con retratos, reparto de cuerpos en 3D de cerca. Todo el texto se
 * construye con `textContent`, nunca con `innerHTML`: los nombres los escribe el jugador.
 */

export type TipoDePresencia = 'live' | 'recent' | 'offline'

type Punto = { lat: number; lon: number }
type Jugador = TeamProfileLiveStatus

export function tipoDePresencia(jugador: Jugador): TipoDePresencia {
  const presencia = String(jugador.presence || 'offline').toLowerCase()
  return presencia === 'offline' ? 'offline' : presencia === 'stale' ? 'recent' : 'live'
}

function metrosEntre(a: Punto, b: Punto): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)))
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
  // 15/11: sólo cuando ya NO está en línea, y con la hora exacta de su última posición (`pos_at`; si no llega, la del
  // último latido). En línea «visto hace 2 min» era un cubo de la huella del equipo y mentía.
  if (tipo !== 'live') {
    raiz.appendChild(elemento('saga-popup-linea saga-popup-visto', t.visto(haceCuanto(jugador.pos_at ?? jugador.last_seen))))
  }
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

/** El elemento de `planDeJugadores` que es TU retrato (sólo con `propio`); el mapa lo separa de los demás. */
export const CLAVE_PROPIO_EN_PLAN = '__propio__'

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
  /**
   * 7/11 (Óscar: «si no caben o se solapan, una foto de ellos en abanico»): sólo en el reparto de cuerpos (3D, z16+).
   * Quien no tiene sitio cerca del suyo sin tapar un nodo u otro jugador no se pinta en el mapa: va al abanico `id`,
   * que se pone en el suelo en (lat, lon), en un hueco libre. Los del mismo grupo comparten abanico.
   */
  abanico?: { id: string; lat: number; lon: number }
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
 * Qué se dibuja y dónde. Función pura: sin mapa ni DOM. Todo se mide en PANTALLA (ver `planDeRetratos`):
 *
 * - Con retratos (2D, o 3D por debajo del zoom de los cuerpos): los que se taparían se colocan en racimo alrededor
 *   de su centro (contigo dentro si estás con ellos), sin tapar nodos; con más de `MAXIMO_EN_CORONA`, un icono con
 *   el número.
 * - Con `cuerpos` (3D desde z16): reparto de cuerpos y retratos sin grupos (`repartoSinGrupos`); quien no cabe, al
 *   abanico.
 *
 * Cada elemento lleva su posición real y un `corro` (metros en el suelo) hasta donde se dibuja. 11/11: desapareció la
 * rama antigua sin retratos (corro fijo de 2,2 m y grupos por metros): el mapa no la usaba desde el 7/11.
 */
export function planDeJugadores(
  jugadores: Jugador[],
  zoom: number,
  opciones: { inclinacion?: number; rumbo?: number; evitar?: readonly Punto[]; vista?: VistaDelMapa; nodosPlanos?: boolean; proyeccion?: ProyeccionDelMapa; propio?: Punto | null; cuerpos?: ReadonlySet<string> | null } = {}
): ElementoDeMapa[] {
  const visibles = jugadores.filter(
    (j) => !j.is_self && typeof j.lat === 'number' && typeof j.lon === 'number'
  )
  // Sin compañeros, la latitud es la tuya (11/11: con 42,5 fija, lejos de ahí tu retrato medía un 3 % de más o de menos).
  const latMedia = visibles.length ? visibles.reduce((suma, j) => suma + Number(j.lat), 0) / visibles.length : (opciones.propio?.lat ?? 42.5)
  return planDeRetratos(visibles, zoom, latMedia, opciones.inclinacion ?? 0, opciones.rumbo ?? 0, opciones.evitar ?? [], opciones.vista ?? null, opciones.nodosPlanos ?? false, opciones.proyeccion, opciones.propio ?? null, opciones.cuerpos ?? null)
}

/**
 * Con RETRATOS (vista 2D, o 3D por debajo del zoom de los cuerpos) se mide en PANTALLA: los que se taparían se
 * colocan en un racimo (triángulo, rombo, panal) alrededor de su centro, con hueco para todos. Muy de cerca (z19+)
 * una línea fina lleva a cada uno a su sitio real (la pinta el mapa con `lineasDeCorona`). Con más de
 * `MAXIMO_EN_CORONA` juntos, un solo icono con el número, que se abre al tocar.
 *
 * 11/11: eran 6; Óscar pidió ver «5-10 sin agrupar» en 2D. Con el racimo, 10 (11 contigo) caben en un panal de ~3,5
 * retratos de ancho.
 */
export const MAXIMO_EN_CORONA = 10
/**
 * 7/11: en el reparto de cuerpos, la nota a partir de la cual alguien no tiene sitio (tapa a otro: +20, o un nodo: +12;
 * la distancia, como mucho 5, y salirse de la vista, 3, nunca llegan): va al abanico.
 */
export const SIN_SITIO = 12

/**
 * La chincheta de un nodo en pantalla (px CSS) a este zoom: la curva de TAMANO_NODOS de MapSurfaceGL (0,6 a z12,
 * 3,6 a z19,5, exponencial 1,15) por la imagen del nodo. Medido en el mapa a z17 (tamaño 2,24): la moneda acaba
 * ~175 px sobre el suelo y mide ~80 px de ancho. Si cambia el dibujo del nodo, se cambia aquí.
 */
export function tamanoDeNodoPx(zoom: number): { alto: number; ancho: number } {
  const z = Math.min(19.5, Math.max(12, zoom))
  const f = (1.15 ** (z - 12) - 1) / (1.15 ** 7.5 - 1)
  const tamano = 0.6 + f * 3
  return { alto: 78 * tamano, ancho: 36 * tamano }
}

/**
 * Lo que ve el jugador del mapa, en px CSS: el centro del mapa, el tamaño del lienzo y cuánto tapan arriba (cabecera
 * y chip del tiempo) y abajo (fila de botones y tarjeta del HUD). Para que la corona no deje retratos cortados.
 */
export type VistaDelMapa = { centro: Punto; ancho: number; alto: number; arriba: number; abajo: number }

/**
 * 11/11 (Óscar: «juntos en fila no; en rombo o junto pero sin solaparse»): los huecos de un racimo compacto de
 * `cuantos`, centrado en (0, 0): 2 lado a lado, 3 en triángulo, 4 en rombo, 5-7 en panal… Son los puntos de una red
 * hexagonal más cercanos a un centro (el que dé el racimo más prieto YA ESTIRADO: con cuerpos, más altos que anchos,
 * salen dos filas antes que una columna), con `sx` entre vecinos de una fila y `sy` de estirón vertical (filas a
 * 0,866 · sy). Nunca salen 3 o más en línea recta si caben en menos.
 */
// 12/11 (rendimiento): la forma sólo depende de cuántos y de la proporción sy/sx; se calcula una vez (ordenaba 143
// huecos seis veces en cada plan, para cada grupo y cada forma).
const formasDeRacimo = new Map<string, { x: number; y: number }[]>()
export function racimo(cuantos: number, sx: number, sy: number): { x: number; y: number }[] {
  if (cuantos < 2) return [{ x: 0, y: 0 }]
  const clave = `${cuantos}|${Math.round((sy / sx) * 1000)}`
  let unidad = formasDeRacimo.get(clave)
  if (!unidad) {
    unidad = racimoUnidad(cuantos, 1, sy / sx)
    if (formasDeRacimo.size > 256) formasDeRacimo.clear()
    formasDeRacimo.set(clave, unidad)
  }
  return unidad.map((q) => ({ x: q.x * sx, y: q.y * sx }))
}
/**
 * 12/11 (rendimiento): los sitios de búsqueda (una rejilla de paso `paso` entre `desde` y `hasta` px, del más cercano al
 * más lejano) sólo dependen del zoom: se construían y ordenaban (~2000) en cada reparto, es decir, en cada fix del GPS.
 */
const rejillas = new Map<string, readonly { x: number; y: number; d: number }[]>()
function rejillaDeSitios(paso: number, desde: number, hasta: number): readonly { x: number; y: number; d: number }[] {
  const clave = `${paso.toFixed(2)}|${desde.toFixed(2)}|${hasta.toFixed(2)}`
  const sabida = rejillas.get(clave)
  if (sabida) return sabida
  const sitios: { x: number; y: number; d: number }[] = []
  for (let dx = -hasta; dx <= hasta + 0.01; dx += paso)
    for (let dy = -hasta; dy <= hasta + 0.01; dy += paso) {
      const d = Math.hypot(dx, dy)
      if ((desde === 0 || d > desde) && d <= hasta + 0.01) sitios.push({ x: dx, y: dy, d })
    }
  sitios.sort((a, b) => a.d - b.d)
  if (rejillas.size > 32) rejillas.clear()
  rejillas.set(clave, sitios)
  return sitios
}
function racimoUnidad(cuantos: number, sx: number, sy: number): { x: number; y: number }[] {
  // ponytail: red de 11 × 13 huecos (143); quien llama no pide racimos de más de ~60.
  const red: { x: number; y: number }[] = []
  for (let j = -5; j <= 5; j += 1) for (let i = -6; i <= 6; i += 1) red.push({ x: i + j / 2, y: j * 0.8660254 })
  let mejor: { pts: { x: number; y: number }[]; coste: number } | null = null
  for (const c of [{ x: 0.5, y: 0 }, { x: 0.5, y: 0.2886751 }, { x: 0, y: 0 }, { x: 0.25, y: 0.4330127 }, { x: 0.75, y: 0.4330127 }, { x: 0.5, y: 0.4330127 }]) {
    const d2 = (q: { x: number; y: number }) => Math.round(((q.x - c.x) ** 2 + (q.y - c.y) ** 2) * 1e6)
    const pts = [...red].sort((a, b) => d2(a) - d2(b) || b.y - a.y || a.x - b.x).slice(0, cuantos)
    const mx = pts.reduce((t, q) => t + q.x, 0) / pts.length
    const my = pts.reduce((t, q) => t + q.y, 0) / pts.length
    const coste = pts.reduce((t, q) => t + ((q.x - mx) * sx) ** 2 + ((q.y - my) * sy) ** 2, 0) / (sx * sx)
    if (!mejor || coste < mejor.coste - 1e-4) mejor = { pts: pts.map((q) => ({ x: q.x - mx, y: q.y - my })), coste }
  }
  return (mejor as { pts: { x: number; y: number }[] }).pts.map((q) => ({ x: q.x * sx, y: q.y * sy }))
}

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
  evitar: readonly Punto[],
  vista: VistaDelMapa | null,
  nodosPlanos = false,
  proyeccion?: ProyeccionDelMapa,
  propio: Punto | null = null,
  cuerpos: ReadonlySet<string> | null = null
): ElementoDeMapa[] {
  const mpp = metrosPorPixel(zoom, lat)
  const ancho = anchoDeRetratoPx(zoom)
  // 11/11: el retrato es sólo el círculo (sin punta) y su punto es el CENTRO: alto = ancho, mitad arriba y mitad abajo.
  const altoRetrato = ancho
  const aplastado = Math.max(0.35, Math.cos((Math.min(80, Math.max(0, inclinacion)) * Math.PI) / 180))
  const b = (rumbo * Math.PI) / 180
  const n = visibles.length
  // Se juntan los que se TAPARÍAN (a menos de un retrato en pantalla); el resto, cada uno en su sitio.
  const tapanM = ancho * 1.0 * mpp
  const padre = visibles.map((_, i) => i)
  const raiz = (i: number): number => (padre[i] === i ? i : (padre[i] = raiz(padre[i])))
  for (let a = 0; a < n; a += 1) {
    for (let c = a + 1; c < n; c += 1) {
      if (metrosEntre(visibles[a] as Punto, visibles[c] as Punto) < tapanM) padre[raiz(a)] = raiz(c)
    }
  }
  // Pantalla (px, x a la derecha, y hacia ARRIBA) relativa al primero; y del revés, para llevar px al suelo.
  const lat0 = n ? Number(visibles[0].lat) : propio ? propio.lat : lat
  const lon0 = n ? Number(visibles[0].lon) : propio ? propio.lon : 0
  // 7/11 (nodos A): con la proyección real del mapa (inclinado, la perspectiva decide qué tapa a qué), x a la
  // derecha e y hacia arriba igual que el modelo plano.
  const enPantalla = (p: Punto) => {
    if (proyeccion) {
      const q = proyeccion.aPantalla(p)
      return { x: q.x, y: -q.y }
    }
    const e = (p.lon - lon0) * 111320 * Math.cos((lat0 * Math.PI) / 180)
    const nn = (p.lat - lat0) * 111320
    return { x: (e * Math.cos(b) - nn * Math.sin(b)) / mpp, y: ((e * Math.sin(b) + nn * Math.cos(b)) / mpp) * aplastado }
  }
  const alSuelo = (dx: number, dy: number) => {
    const sx = dx * mpp
    const sy = (dy * mpp) / aplastado
    return { este: sx * Math.cos(b) + sy * Math.sin(b), norte: -sx * Math.sin(b) + sy * Math.cos(b) }
  }
  // El desplazamiento en el suelo (este/norte, m) que lleva el retrato de `desde` al punto de pantalla `q`.
  const corroHasta = (q: { x: number; y: number }, desde: Punto) => {
    if (proyeccion) {
      const g = proyeccion.alSuelo(q.x, -q.y)
      return { este: (g.lon - desde.lon) * 111320 * Math.cos((desde.lat * Math.PI) / 180), norte: (g.lat - desde.lat) * 111320 }
    }
    const o = enPantalla(desde)
    return alSuelo(q.x - o.x, q.y - o.y)
  }
  // La perspectiva (`k`) en un punto de pantalla: inclinado, el retrato que se aparta ~2 retratos cambia de tamaño.
  // 11/11: por celdas de 24 px. Cada consulta son dos o tres proyecciones del mapa (con relieve, caras), y la búsqueda
  // de sitio pedía decenas de miles por reparto (medido: 85 000 con 10 juntos entre nodos); la perspectiva apenas
  // cambia en 24 px.
  const kPorCelda = new Map<number, number>()
  const kEn = (q: { x: number; y: number }) => {
    if (!proyeccion?.escala) return 1
    const celda = Math.round(q.x / 24) * 100003 + Math.round(q.y / 24)
    const sabido = kPorCelda.get(celda)
    if (sabido !== undefined) return sabido
    const g = proyeccion.alSuelo(Math.round(q.x / 24) * 24, -Math.round(q.y / 24) * 24)
    const k = Number.isFinite(g.lat) && Number.isFinite(g.lon) ? proyeccion.escala(g) : 1
    kPorCelda.set(celda, k)
    return k
  }
  // Cada nodo con su perspectiva (`k`): de cerca, poste y moneda más grandes.
  const nodos = evitar
    .map((p) => ({ ...enPantalla(p), k: proyeccion?.escala ? proyeccion.escala(p) : 1 }))
    .filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y))
  const { alto: altoNodo, ancho: anchoNodo } = tamanoDeNodoPx(zoom)
  // 7/11 (nodos A): en 2D el nodo es una moneda centrada en su punto (sin poste); en 3D, el poste sobre su punto.
  // El rectángulo del nodo ENTERO: la moneda en 2D (la del nodo en juego es un 17 % mayor, y el halo es sólo luz);
  // con postes, la peana del suelo, el poste, la moneda de arriba y el cubo de al lado (~1,6 monedas de ancho).
  // 7/11: obstáculo DURO. `kp` = la perspectiva del retrato (de cerca, más grande).
  const anchoDelNodo = anchoNodo * (nodosPlanos ? 1.17 : 1.6)
  const bajoNodo = nodosPlanos ? -anchoDelNodo / 2 : -anchoNodo * 0.3
  // Medido en el mapa inclinado (z16-z17,5): la moneda del poste acaba a ~1,17 del alto de `tamanoDeNodoPx`.
  const altoNodoEntero = altoNodo * 1.2
  const altoDelNodo = nodosPlanos ? anchoDelNodo / 2 : altoNodoEntero
  const tapaNodo = (q: { x: number; y: number }, nodo: { x: number; y: number; k: number }, kp = 1) =>
    Math.abs(q.x - nodo.x) < (ancho * kp + anchoDelNodo * nodo.k) / 2 &&
    Math.min(q.y + (altoRetrato * kp) / 2, nodo.y + altoDelNodo * nodo.k) > Math.max(q.y - (altoRetrato * kp) / 2, nodo.y + bajoNodo * nodo.k)
  const centroVista = vista ? enPantalla(vista.centro) : null
  const aVista = (q: { x: number; y: number }) =>
    vista && centroVista ? { x: vista.ancho / 2 + (q.x - centroVista.x), y: vista.alto / 2 - (q.y - centroVista.y) } : null
  // `sube` / `baja`: lo que ocupa hacia arriba y hacia abajo de su punto (el retrato, medio círculo a cada lado).
  const cortado = (q: { x: number; y: number }, sube = altoRetrato / 2, baja = altoRetrato / 2) => {
    const v = aVista(q)
    if (!v || !vista) return false
    return v.x - ancho / 2 < 2 || v.x + ancho / 2 > vista.ancho - 2 || v.y - sube < vista.arriba || v.y + baja > vista.alto - vista.abajo
  }
  const enLienzo = (q: { x: number; y: number }) => {
    const v = aVista(q)
    return Boolean(v && vista && v.x >= 0 && v.x <= vista.ancho && v.y >= 0 && v.y <= vista.alto)
  }

  if (cuerpos) return repartoSinGrupos()

  /**
   * 7/11 (Óscar: «que no se monten, que no tapen nodos y que se vean todos»): 3D desde el zoom de los cuerpos. Nadie
   * se agrupa: cuerpos 3D y retratos (de quien no lleva cuerpo) en el MISMO reparto, cada uno con SU caja en pantalla
   * (el cuerpo, ~0,42 de ancho por su alto; el retrato, la suya) y su perspectiva. Uno a uno (tú primero, luego por
   * clave), cada uno en el sitio libre más cercano al suyo: sin tapar a los ya puestos ni ningún nodo (poste, moneda y
   * cubo), como mucho a 5 cuerpos. Así salen pegados, en corro o en dos filas, sin icono de grupo.
   * `cuerpos` = claves con cuerpo 3D (`CLAVE_PROPIO_EN_PLAN` para ti).
   */
  function repartoSinGrupos(): ElementoDeMapa[] {
    const conCuerpo = cuerpos as ReadonlySet<string>
    // Inclinado, el cuerpo se ve ~0,88 de su alto (lodAvatares); su perspectiva es la real (sin el 0,5 de los iconos).
    // De ancho, la mitad del alto: con los brazos, a 0,42 dos cuerpos «separados» todavía se tocaban.
    const altoCuerpo = alturaEnPantallaPx(zoom, lat) * 0.88
    const anchoCuerpo = altoCuerpo * 0.5
    type Caja = { x: number; y: number; w: number; h: number }
    const cajaEn = (q: { x: number; y: number }, cuerpo: boolean): Caja => {
      const k = kEn(q)
      if (cuerpo) {
        const kc = proyeccion?.escala ? Math.max(0.2, 2 * k - 1) : 1
        return { x: q.x, y: q.y, w: anchoCuerpo * kc, h: altoCuerpo * kc }
      }
      // El retrato va centrado en su punto; la caja se mide desde abajo, como la del cuerpo (pies en su punto).
      return { x: q.x, y: q.y - (altoRetrato * k) / 2, w: ancho * k, h: altoRetrato * k }
    }
    const seCorta = (pt: { x: number; y: number }, caja: Caja, cuerpo: boolean) =>
      cortado(pt, cuerpo ? caja.h : caja.h / 2, cuerpo ? 0 : caja.h / 2)
    const tapan = (a: Caja, b: Caja) =>
      Math.abs(a.x - b.x) < (a.w + b.w) * 0.48 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.08 * Math.min(a.h, b.h)
    const sobreNodo = (a: Caja, lista: typeof nodos = nodos) =>
      lista.some(
        (nodo) =>
          Math.abs(a.x - nodo.x) < (a.w + anchoDelNodo * nodo.k) / 2 &&
          Math.min(a.y + a.h, nodo.y + altoNodoEntero * nodo.k) > Math.max(a.y, nodo.y + bajoNodo * nodo.k)
      )
    // 11/11 (coste): sólo los nodos y los ya puestos que pueden tocar una caja a `r` px de (x, y). Con 10-15 juntos
    // entre nodos la búsqueda pasaba por todos en cada uno de los ~1200 sitios (medido: ~250 ms en el PC).
    const margen = altoCuerpo * 3 + altoNodo * 1.2 + anchoDelNodo
    const nodosCerca = (x: number, y: number, r: number) =>
      nodos.filter((nodo) => Math.abs(nodo.x - x) < r + margen * nodo.k && Math.abs(nodo.y - y) < r + margen * nodo.k)
    const puestosCerca = (x: number, y: number, r: number) =>
      puestos.filter((o) => Math.abs(o.x - x) < r + margen && Math.abs(o.y - y) < r + margen)
    // ponytail: rejilla fija de ~1/4 de cuerpo hasta 5 cuerpos (~1200 sitios); de sobra para un grupo de 10-15.
    const paso = Math.max(4, anchoCuerpo * 0.25)
    const radioMax = anchoCuerpo * 5
    const desplazamientos = rejillaDeSitios(paso, 0, radioMax)
    // 8/11 (Óscar: «si caben otros, ¿por qué ellos no?»): sin sitio limpio a 5 cuerpos, se busca algo más lejos
    // (rejilla más gruesa) antes de mandar a nadie al abanico. 11/11: hasta 8 cuerpos, no 14 (a 14 quedaba a media
    // pantalla de su sitio); con el racimo hace falta poco.
    const pasoLejos = Math.max(6, anchoCuerpo * 0.5)
    const radioLejos = anchoCuerpo * 8
    const lejanos = rejillaDeSitios(pasoLejos, radioMax, radioLejos)
    const puestos: Caja[] = []
    const fuera: { i: number; c: { x: number; y: number } }[] = []
    const lista: { clave: string; p: Punto; jugador: Jugador | null }[] = [
      ...(propio ? [{ clave: CLAVE_PROPIO_EN_PLAN, p: propio, jugador: null }] : []),
      // Los cuerpos antes que los retratos: son más estrechos y se quedan los sitios más cerca del suyo.
      ...[...visibles]
        .sort((x, y) => Number(conCuerpo.has(claveDeJugador(y))) - Number(conCuerpo.has(claveDeJugador(x))) || (claveDeJugador(x) < claveDeJugador(y) ? -1 : 1))
        .map((j) => ({ clave: claveDeJugador(j), p: { lat: Number(j.lat), lon: Number(j.lon) }, jugador: j })),
    ]
    /**
     * 11/11 (Óscar: «juntos en fila no; en rombo»): los que se taparían entre sí (tú incluido) se colocan JUNTOS en un
     * racimo (`racimo`: triángulo, rombo, panal) alrededor de su centro, cada uno en el hueco más cercano a su sitio.
     * El racimo entero se mueve al sitio libre más cercano (sin tapar a los ya puestos ni ningún nodo). Si no hay
     * forma, o son más de 12, cada uno busca su sitio por separado, como antes.
     */
    const fijados = new Map<string, { x: number; y: number }>()
    {
      const pts0 = lista.map((it) => enPantalla(it.p))
      const cajas0 = lista.map((it, i) => cajaEn(pts0[i], conCuerpo.has(it.clave)))
      const pad = lista.map((_, i) => i)
      const rz = (i: number): number => (pad[i] === i ? i : (pad[i] = rz(pad[i])))
      for (let a = 0; a < lista.length; a += 1)
        for (let o = a + 1; o < lista.length; o += 1) if (tapan(cajas0[a], cajas0[o])) pad[rz(a)] = rz(o)
      const racimos = new Map<number, number[]>()
      lista.forEach((_, i) => racimos.set(rz(i), [...(racimos.get(rz(i)) ?? []), i]))
      // El tuyo primero (vas el primero de la lista), luego los grandes.
      const orden = [...racimos.values()]
        .filter((g) => g.length >= 2 && g.length <= 12)
        .sort((x, y) => Number(lista[y[0]].jugador === null) - Number(lista[x[0]].jugador === null) || y.length - x.length || (lista[x[0]].clave < lista[y[0]].clave ? -1 : 1))
      for (const g of orden) {
        const cx = g.reduce((t, i) => t + pts0[i].x, 0) / g.length
        const cy = g.reduce((t, i) => t + pts0[i].y, 0) / g.length
        const visible = vista ? enLienzo({ x: cx, y: cy }) : false
        const W = Math.max(...g.map((i) => cajas0[i].w))
        const H = Math.max(...g.map((i) => cajas0[i].h))
        // Vecinos de fila a un ancho; filas a 0,95 de alto (0,866 · 1,1): no se montan ni con la perspectiva.
        const forma = racimo(g.length, W * 1.03, H * 1.1)
        // Cada uno, al hueco libre más cercano a su sitio (el hueco es el centro de la caja; el cuerpo apoya los pies).
        const libres = forma.map((_, k) => k)
        const huecos = g.map((i) => {
          const sube = conCuerpo.has(lista[i].clave) ? cajas0[i].h / 2 : 0
          let elegido = 0
          let cerca = Infinity
          libres.forEach((k, idx) => {
            const dd = Math.hypot(cx + forma[k].x - pts0[i].x, cy + forma[k].y - (pts0[i].y + sube))
            if (dd < cerca - 1e-6) {
              cerca = dd
              elegido = idx
            }
          })
          const k = libres.splice(elegido, 1)[0]
          return { x: forma[k].x, y: forma[k].y - (conCuerpo.has(lista[i].clave) ? H / 2 : 0) }
        })
        let mejor: { cajas: Caja[]; pts: { x: number; y: number }[]; nota: number } | null = null
        // 12/11 (coste): lo que separa a cada uno de su sitio sin mover el racimo. Un sitio que deja a alguien a más de
        // `radioMax` del suyo se descarta luego igual: se salta aquí sin medir cajas (eran ~1000 sitios × 11 cajas).
        const desvio = g.map((i, k) => ({ x: cx + huecos[k].x - pts0[i].x, y: cy + huecos[k].y - pts0[i].y }))
        const alcance = radioMax + Math.max(...huecos.map((h) => Math.hypot(h.x, h.y)))
        const nodosG = nodosCerca(cx, cy, alcance)
        const puestosG = puestosCerca(cx, cy, alcance)
        for (const d of desplazamientos) {
          const base = d.d / anchoCuerpo
          if (mejor && base >= mejor.nota) break
          if (desvio.some((o) => (o.x + d.x) ** 2 + (o.y + d.y) ** 2 > radioMax * radioMax)) continue
          const pts = huecos.map((h) => ({ x: cx + h.x + d.x, y: cy + h.y + d.y }))
          const cajas = g.map((i, k) => cajaEn(pts[k], conCuerpo.has(lista[i].clave)))
          let nota = base
          // 11/11 (coste): en cuanto la nota pasa de la mejor, este sitio ya no gana; no se sigue midiendo.
          for (let k = 0; k < cajas.length && (!mejor || nota < mejor.nota); k += 1) {
            const caja = cajas[k]
            if (sobreNodo(caja, nodosG)) nota += 12
            if (puestosG.some((o) => tapan(o, caja)) || cajas.some((o, k2) => k2 < k && tapan(o, caja))) nota += 20
            if (visible && seCorta(pts[k], caja, conCuerpo.has(lista[g[k]].clave))) nota += 3
          }
          if (!mejor || nota < mejor.nota) mejor = { cajas, pts, nota }
        }
        if (!mejor || mejor.nota >= SIN_SITIO) continue
        const hecho = mejor
        // Nadie más lejos de su sitio que en el reparto uno a uno (5 cuerpos): si no, cada uno por su cuenta.
        if (g.some((i, k) => Math.hypot(hecho.pts[k].x - pts0[i].x, hecho.pts[k].y - pts0[i].y) > radioMax)) continue
        g.forEach((i, k) => {
          puestos.push(hecho.cajas[k])
          fijados.set(lista[i].clave, hecho.pts[k])
        })
      }
    }
    const salida: ElementoDeMapa[] = []
    for (const it of lista) {
      const fijo = fijados.get(it.clave)
      if (fijo) {
        const corro = corroHasta(fijo, it.p)
        salida.push(
          it.jugador
            ? { tipo: 'jugador', clave: it.clave, lat: it.p.lat, lon: it.p.lon, corro, jugadores: [it.jugador], presencia: tipoDePresencia(it.jugador) }
            : { tipo: 'jugador', clave: it.clave, lat: it.p.lat, lon: it.p.lon, corro, jugadores: [], presencia: 'live' }
        )
        continue
      }
      const c = enPantalla(it.p)
      const visible = vista ? enLienzo(c) : false
      const cuerpo = conCuerpo.has(it.clave)
      let mejor = { caja: cajaEn(c, cuerpo), pt: c, nota: Infinity, d: 0 }
      const nodosC = nodosCerca(c.x, c.y, radioMax)
      const puestosC = puestosCerca(c.x, c.y, radioMax)
      for (const d of desplazamientos) {
        const base = d.d / anchoCuerpo
        if (base >= mejor.nota) break
        const pt = { x: c.x + d.x, y: c.y + d.y }
        const caja = cajaEn(pt, cuerpo)
        let nota = base
        if (puestosC.some((o) => tapan(o, caja))) nota += 20
        if (nota < mejor.nota && sobreNodo(caja, nodosC)) nota += 12
        if (visible && seCorta(pt, caja, cuerpo)) nota += 3
        if (nota < mejor.nota) mejor = { caja, pt, nota, d: d.d }
      }
      if (mejor.nota >= SIN_SITIO && it.jugador !== null) {
        const nodosL = nodosCerca(c.x, c.y, radioLejos)
        const puestosL = puestosCerca(c.x, c.y, radioLejos)
        for (const d of lejanos) {
          const pt = { x: c.x + d.x, y: c.y + d.y }
          const caja = cajaEn(pt, cuerpo)
          if (puestosL.some((o) => tapan(o, caja)) || sobreNodo(caja, nodosL) || (visible && seCorta(pt, caja, cuerpo))) continue
          mejor = { caja, pt, nota: 0, d: d.d }
          break
        }
      }
      // 7/11: sin sitio limpio (taparía un nodo o a otro): al abanico, salvo tú (siempre en el mapa).
      const sinSitio = mejor.nota >= SIN_SITIO && it.jugador !== null
      if (sinSitio) fuera.push({ i: salida.length, c })
      else puestos.push(mejor.caja)
      const corro = sinSitio || mejor.d < 0.5 ? { este: 0, norte: 0 } : corroHasta(mejor.pt, it.p)
      salida.push(
        it.jugador
          ? { tipo: 'jugador', clave: it.clave, lat: it.p.lat, lon: it.p.lon, corro, jugadores: [it.jugador], presencia: tipoDePresencia(it.jugador) }
          : { tipo: 'jugador', clave: it.clave, lat: it.p.lat, lon: it.p.lon, corro, jugadores: [], presencia: 'live' }
      )
    }
    ponerAbanicos(salida, fuera, puestos, sobreNodo, tapan)
    // Tú vas el último en la lista, como en el plan con retratos.
    return [...salida.filter((el) => el.clave !== CLAVE_PROPIO_EN_PLAN), ...salida.filter((el) => el.clave === CLAVE_PROPIO_EN_PLAN)]
  }

  /**
   * 7/11: los que no caben, en abanicos. Se juntan los que caen cerca en pantalla (a menos de ~3 cuerpos) y cada grupo
   * va a UN abanico (la caja del abanico cerrado: ~1,3 × 1,05 retratos) en el hueco libre más cercano a su centro: sin
   * tapar cuerpos, retratos, nodos ni otro abanico, y mejor sin salirse de la vista.
   */
  function ponerAbanicos(
    salida: ElementoDeMapa[],
    fuera: { i: number; c: { x: number; y: number } }[],
    puestos: { x: number; y: number; w: number; h: number }[],
    sobreNodo: (a: { x: number; y: number; w: number; h: number }) => boolean,
    tapan: (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => boolean
  ) {
    if (!fuera.length) return
    const anchoCuerpo = alturaEnPantallaPx(zoom, lat) * 0.88 * 0.5
    const juntar = anchoCuerpo * 3
    const grupos: (typeof fuera)[] = []
    for (const f of fuera) {
      const g = grupos.find((gr) => gr.some((o) => Math.hypot(o.c.x - f.c.x, o.c.y - f.c.y) < juntar))
      if (g) g.push(f)
      else grupos.push([f])
    }
    const w = ancho * 1.3
    const h = ancho * 1.05
    // Algo más lejos que los cuerpos (8): si la zona está llena hasta ahí, el abanico cabe justo fuera.
    const radio = anchoCuerpo * 12
    const paso = Math.max(4, anchoCuerpo * 0.3)
    const sitios: { x: number; y: number; d: number }[] = []
    for (let dx = -radio; dx <= radio + 0.01; dx += paso)
      for (let dy = -radio; dy <= radio + 0.01; dy += paso) {
        const d = Math.hypot(dx, dy)
        if (d <= radio + 0.01) sitios.push({ x: dx, y: dy, d })
      }
    sitios.sort((a, b) => a.d - b.d)
    const abanicos: { x: number; y: number; w: number; h: number }[] = []
    for (const g of grupos) {
      const cx = g.reduce((s, f) => s + f.c.x, 0) / g.length
      const cy = g.reduce((s, f) => s + f.c.y, 0) / g.length
      let mejor = { caja: { x: cx, y: cy, w, h }, nota: Infinity }
      for (const s of sitios) {
        const base = s.d / anchoCuerpo / 4
        if (base >= mejor.nota) break
        const caja = { x: cx + s.x, y: cy + s.y, w, h }
        let nota = base
        if (puestos.some((o) => tapan(o, caja)) || abanicos.some((o) => tapan(o, caja))) nota += 20
        if (sobreNodo(caja)) nota += 12
        if (vista && cortado(caja, h, 0)) nota += 3
        if (nota < mejor.nota) mejor = { caja, nota }
      }
      abanicos.push(mejor.caja)
      const primero = salida[g[0].i]
      const suelo = conCorro(primero, corroHasta(mejor.caja, primero))
      const id = 'abanico-' + g.map((f) => salida[f.i].clave).sort()[0]
      for (const f of g) salida[f.i].abanico = { id, lat: suelo.lat, lon: suelo.lon }
    }
  }

  /**
   * Cada grupo, PEGADO a su sitio (7/11, Óscar: «cerca, sin líneas y no superlejos del nodo») y en RACIMO (11/11: «en
   * fila no»): retratos casi tocándose (~0,95 de retrato entre centros) en triángulo, rombo o panal alrededor de su
   * centro. Si así tapa un nodo o se corta, el racimo entero se mueve (hasta 2,5 retratos); si ni así, un arco hacia
   * el lado libre o un racimo «con hueco» alrededor de la moneda. Un nodo (el suyo o un vecino) es obstáculo duro
   * (pesa 12, más que cualquier paso). Entre grupos, nunca taparse (si no hay forma, se juntan y se vuelve a colocar).
   */
  const SEP = 0.95
  // 11/11: el retrato vuelve a ser un círculo (sin punta): la separación es la de dos círculos (ESTIRA = 1). El 8/11,
  // con la punta, hubo que estirarla en vertical para que la de abajo no tapase la punta de la de arriba.
  const ESTIRA = altoRetrato / ancho
  const separados = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, (a.y - b.y) / ESTIRA) >= ancho * SEP - 1
  const PASOS: { x: number; y: number }[] = [{ x: 0, y: 0 }]
  // 7/11 (nodos A): hasta ~2,5 retratos si hace falta para salir del nodo (el coste de la distancia es pequeño).
  for (const r of [0.55, 1.1, 1.6, 2.05, 2.5]) {
    const lados = r < 1 ? 8 : 16
    for (let k = 0; k < lados; k += 1) PASOS.push({ x: Math.cos((k * 2 * Math.PI) / lados) * r * ancho, y: Math.sin((k * 2 * Math.PI) / lados) * r * ancho })
  }
  // 11/11 (Óscar: «en fila no; en rombo o junto»): primero el racimo (triángulo, rombo, panal) y el mismo girado 90°;
  // los arcos quedan de último recurso, junto a una chincheta o un borde (y cuestan más que mover el racimo ~1 retrato).
  function formas(cuantos: number, giro = 0): { x: number; y: number }[][] {
    if (cuantos < 2) return [[{ x: 0, y: 0 }]]
    const lista: { x: number; y: number }[][] = []
    const recto = racimo(cuantos, SEP * ancho + 1, (SEP * ancho + 1) * ESTIRA)
    // 12/11 (Óscar: «que no quede forzado»): con círculos, el racimo va algo girado (8-22°, fijo por grupo: no baila),
    // para que no salgan filas de regla. Girar no cambia ninguna distancia entre círculos.
    const [cg, sg] = [Math.cos(giro), Math.sin(giro)]
    const prieto = Math.abs(ESTIRA - 1) < 0.02 && giro ? recto.map((o) => ({ x: o.x * cg - o.y * sg, y: o.x * sg + o.y * cg })) : recto
    // El recto y su giro de 90° siguen detrás (cuestan un poco más): si el girado choca con una chincheta o el borde,
    // gana el recto antes que un arco (medido: sin ellos, 10 juntos acababan en una cadena curva por el borde).
    const giro90 = (f: { x: number; y: number }[]) => f.map((o) => ({ x: o.y / ESTIRA, y: o.x * ESTIRA }))
    lista.push(prieto, ...(prieto === recto ? [] : [recto]), giro90(prieto), ...(prieto === recto ? [] : [giro90(recto)]))
    // Arcos de 180° hacia 8 lados (para dejar libre la chincheta o el borde).
    const paso = Math.PI / (cuantos - 1)
    const rArco = (SEP * ancho) / (2 * Math.sin(paso / 2))
    for (let k = 0; k < 8; k += 1) {
      const lado = (k * Math.PI) / 4
      lista.push(Array.from({ length: cuantos }, (_, i) => {
        const a = lado - Math.PI / 2 + i * paso
        return { x: Math.cos(a) * rArco, y: Math.sin(a) * rArco * ESTIRA }
      }))
    }
    return lista
  }
  // 11/11: si TÚ estás con el grupo (`propioPt`, tu sitio en pantalla), entras en su racimo como uno más: antes ibas
  // aparte y quedabas en fila con ellos o a un retrato de distancia.
  let propioEnRacimo: { x: number; y: number } | null = null
  function colocar(miembros: Jugador[], ocupados: { x: number; y: number }[], propioPt: { x: number; y: number } | null = null): ElementoDeMapa[] {
    const centro = {
      lat: miembros.reduce((s, j) => s + Number(j.lat), 0) / miembros.length,
      lon: miembros.reduce((s, j) => s + Number(j.lon), 0) / miembros.length,
    }
    const enGrupo = miembros.length > MAXIMO_EN_CORONA
    const orden = [...miembros].sort((x, y) => (claveDeJugador(x) < claveDeJugador(y) ? -1 : 1))
    const contigo = !enGrupo && propioPt ? propioPt : null
    // Los sitios reales en pantalla: tú el primero (eliges hueco antes) y luego los demás por clave.
    const reales = [...(contigo ? [contigo] : []), ...orden.map((j) => enPantalla(j as Punto))]
    const c = contigo
      ? { x: reales.reduce((t, q) => t + q.x, 0) / reales.length, y: reales.reduce((t, q) => t + q.y, 0) / reales.length }
      : enPantalla(centro)
    const visible = vista ? enLienzo(c) : false
    let mejor: { pts: { x: number; y: number }[]; nota: number } | null = null
    // El icono con el número (más de MAXIMO_EN_CORONA) también se aparta un poco de su chincheta.
    // El giro del racimo: fijo para el mismo grupo (por las claves), entre 8° y 22°.
    const semilla = orden.reduce((h, j) => [...claveDeJugador(j)].reduce((t, ch) => (t * 31 + ch.charCodeAt(0)) >>> 0, h), 7)
    const giro = (((8 + (semilla % 15)) * Math.PI) / 180) * (semilla & 1 ? 1 : -1)
    const lasFormas = formas(enGrupo ? 1 : reales.length, giro)
    // Lo que cuesta cada forma: el racimo (girado, recto, y los dos a 90°) casi nada; los arcos, de último recurso.
    const conGiro = Math.abs(ESTIRA - 1) < 0.02 && giro !== 0 && !enGrupo && reales.length > 1
    const PENA_FORMA = conGiro ? [0, 0.1, 0.3, 0.35] : [0, 0.3]
    for (const [f, forma] of lasFormas.entries()) {
      // Cada uno, al hueco libre más cercano a su sitio real.
      const libres = forma.map((_, k) => k)
      const huecos = (enGrupo ? [c] : reales).map((real) => {
        let elegido = 0
        let cerca = Infinity
        libres.forEach((k, idx) => {
          const dd = Math.hypot(c.x + forma[k].x - real.x, c.y + forma[k].y - real.y)
          if (dd < cerca - 1e-6) {
            cerca = dd
            elegido = idx
          }
        })
        return forma[libres.splice(elegido, 1)[0]]
      })
      for (const d of PASOS) {
        const pts = huecos.map((o) => ({ x: c.x + o.x + d.x, y: c.y + o.y + d.y }))
        let nota = (Math.hypot(d.x, d.y) / ancho) * 1.5 + (PENA_FORMA[f] ?? 1.2)
        for (const q of pts) {
          // 11/11 (coste): si ya no puede ganar, no se sigue midiendo.
          if (mejor && nota >= mejor.nota) break
          if (ocupados.some((o) => !separados(o, q))) nota += 20
          // Obstáculo duro: cualquier nodo, el suyo o un vecino, pesa más que cualquier paso (el máximo, ~3,75).
          const kp = kEn(q)
          for (const nodo of nodos) if (tapaNodo(q, nodo, kp)) nota += 12
          if (visible && cortado(q)) nota += 3
        }
        if (!mejor || nota < mejor.nota) mejor = { pts, nota }
      }
    }
    /**
     * 11/11: el racimo entero no cabe ni moviéndolo (tu grupo está ENCIMA de una moneda, o entre dos nodos): racimo
     * «con hueco». De la misma red hexagonal, los huecos LIBRES más cercanos al centro (sin tapar nodos ni a otros
     * grupos, y mejor sin cortarse): quedan pegados alrededor de la moneda, en panal, no en fila ni lejos.
     */
    if (!enGrupo && reales.length > 1 && mejor && mejor.nota >= 12) {
      const paso = SEP * ancho + 1
      let conHueco: { pts: { x: number; y: number }[]; coste: number } | null = null
      for (const o of [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 0.5, y: 0.2886751 }, { x: 0.25, y: 0.4330127 }]) {
        const celdas: { x: number; y: number; d: number }[] = []
        for (let fila = -6; fila <= 6; fila += 1)
          for (let col = -7; col <= 7; col += 1) {
            const q = { x: c.x + (col + fila / 2 - o.x) * paso, y: c.y + (fila * 0.8660254 - o.y) * paso * ESTIRA }
            if (ocupados.some((oc) => !separados(oc, q))) continue
            const kp = kEn(q)
            if (nodos.some((nodo) => tapaNodo(q, nodo, kp))) continue
            celdas.push({ ...q, d: Math.hypot(q.x - c.x, q.y - c.y) + (visible && cortado(q) ? 3 * ancho : 0) })
          }
        if (celdas.length < reales.length) continue
        const cerca = celdas.sort((a, b) => a.d - b.d).slice(0, reales.length)
        const coste = cerca.reduce((t, q) => t + q.d, 0)
        if (conHueco && coste >= conHueco.coste - 1e-6) continue
        // Cada uno, al hueco libre más cercano a su sitio real (tú, el primero).
        const libres = cerca.map((_, k) => k)
        const pts = reales.map((real) => {
          let elegido = 0
          let dMin = Infinity
          libres.forEach((k, idx) => {
            const dd = Math.hypot(cerca[k].x - real.x, cerca[k].y - real.y)
            if (dd < dMin - 1e-6) {
              dMin = dd
              elegido = idx
            }
          })
          const q = cerca[libres.splice(elegido, 1)[0]]
          return { x: q.x, y: q.y }
        })
        conHueco = { pts, coste }
      }
      if (conHueco) mejor = { pts: conHueco.pts, nota: 0 }
    }
    const todos = (mejor as { pts: { x: number; y: number }[] }).pts
    for (const q of todos) ocupados.push(q)
    if (contigo) propioEnRacimo = todos[0]
    const elegido = contigo ? todos.slice(1) : todos
    if (enGrupo) {
      const d = corroHasta(elegido[0], centro)
      return [{ tipo: 'grupo', clave: claveDeGrupo(miembros), lat: centro.lat, lon: centro.lon, corro: d, jugadores: miembros, presencia: mejorPresencia(miembros) }]
    }
    return orden.map((j, k) => {
      const real = enPantalla(j as Punto)
      const d = corroHasta(elegido[k], j as Punto)
      const quieto = Math.abs(elegido[k].x - real.x) < 0.5 && Math.abs(elegido[k].y - real.y) < 0.5
      return {
        tipo: 'jugador' as const,
        clave: claveDeJugador(j),
        lat: Number(j.lat),
        lon: Number(j.lon),
        corro: quieto ? { este: 0, norte: 0 } : d,
        jugadores: [j],
        presencia: tipoDePresencia(j),
      }
    })
  }

  // ¿Con quién estás? El compañero más cercano de los que te taparían (su grupo es el tuyo).
  let jPropio = -1
  if (propio) {
    let cerca = tapanM
    visibles.forEach((j, i) => {
      const m = metrosEntre(propio, j as Punto)
      if (m < cerca) {
        cerca = m
        jPropio = i
      }
    })
  }
  let elementos: ElementoDeMapa[] = []
  for (let vuelta = 0; vuelta < 8; vuelta += 1) {
    propioEnRacimo = null
    const grupos = new Map<number, number[]>()
    for (let i = 0; i < n; i += 1) grupos.set(raiz(i), [...(grupos.get(raiz(i)) ?? []), i])
    elementos = []
    const grupoDe: number[] = []
    const ocupados: { x: number; y: number }[] = []
    // Los grandes primero: son los que menos sitio tienen para moverse.
    for (const [r, indices] of [...grupos].sort((x, y) => y[1].length - x[1].length)) {
      const contigo = propio && jPropio >= 0 && raiz(jPropio) === r ? enPantalla(propio) : null
      for (const el of colocar(indices.map((i) => visibles[i]), ocupados, contigo)) {
        elementos.push(el)
        grupoDe.push(r)
      }
    }
    const pts = elementos.map((el) => enPantalla(conCorro(el, el.corro)))
    let junto = false
    for (let a = 0; a < pts.length; a += 1) {
      for (let c = a + 1; c < pts.length; c += 1) {
        if (grupoDe[a] === grupoDe[c]) continue
        if (!separados(pts[a], pts[c])) {
          padre[raiz(grupoDe[a])] = raiz(grupoDe[c])
          junto = true
        }
      }
    }
    if (!junto) break
  }
  // TU retrato (sin corona: tu punto es el GPS): se aparta de las monedas/postes y de los retratos de los demás, hacia
  // el lado libre, igual que ellos. Sale como un elemento más con la clave `CLAVE_PROPIO_EN_PLAN`.
  if (propio) {
    const c = enPantalla(propio)
    const otros = elementos.map((el) => enPantalla(conCorro(el, el.corro)))
    const visible = vista ? enLienzo(c) : false
    let mejor = { pt: c, nota: Infinity }
    for (const d of PASOS) {
      const q = { x: c.x + d.x, y: c.y + d.y }
      let nota = (Math.hypot(d.x, d.y) / ancho) * 1.5
      if (otros.some((o) => !separados(o, q))) nota += 20
      const kp = kEn(q)
      for (const nodo of nodos) if (tapaNodo(q, nodo, kp)) nota += 12
      if (visible && cortado(q)) nota += 3
      if (nota < mejor.nota) mejor = { pt: q, nota }
    }
    // En el racimo de tu grupo, tu hueco ya está elegido.
    const enRacimo = propioEnRacimo as { x: number; y: number } | null
    if (enRacimo) mejor = { pt: enRacimo, nota: 0 }
    const quieto = mejor.pt === c || (Math.abs(mejor.pt.x - c.x) < 0.5 && Math.abs(mejor.pt.y - c.y) < 0.5)
    elementos.push({
      tipo: 'jugador',
      clave: CLAVE_PROPIO_EN_PLAN,
      lat: propio.lat,
      lon: propio.lon,
      corro: quieto ? { este: 0, norte: 0 } : corroHasta(mejor.pt, propio),
      jugadores: [],
      presencia: 'live',
    })
  }
  return elementos
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
