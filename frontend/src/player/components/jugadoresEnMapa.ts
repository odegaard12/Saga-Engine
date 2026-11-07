import type { TeamProfileLiveStatus } from '../../types/player'
import { getPlayerColor } from '../../shared/playerIdentity'
import { elementoDeRetrato, urlDeFotoValida } from '../avatares/retratoDeMapa'
import { getPlayerAvatarUrl } from '../../shared/playerIdentity'
import { aspectoDe } from '../avatares3d/mixamo/catalogo'
import { ZOOM_MINIMO_AVATARES, alturaEnPantallaPx } from '../avatares3d/mixamo/lodAvatares'
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
import type { ProyeccionDelMapa } from './repartoDeNodos'
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
  opciones: { retratos?: boolean; inclinacion?: number; rumbo?: number; evitar?: readonly Punto[]; vista?: VistaDelMapa; nodosPlanos?: boolean; proyeccion?: ProyeccionDelMapa; propio?: Punto | null; cuerpos?: ReadonlySet<string> | null } = {}
): ElementoDeMapa[] {
  const visibles = jugadores.filter(
    (j) => !j.is_self && typeof j.lat === 'number' && typeof j.lon === 'number'
  )
  const latMedia = visibles.length ? visibles.reduce((suma, j) => suma + Number(j.lat), 0) / visibles.length : 42.5
  if (opciones.retratos)
    return planDeRetratos(visibles, zoom, latMedia, opciones.inclinacion ?? 0, opciones.rumbo ?? 0, opciones.evitar ?? [], opciones.vista ?? null, opciones.nodosPlanos ?? false, opciones.proyeccion, opciones.propio ?? null, opciones.cuerpos ?? null)
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
  const altoRetrato = ancho * 1.14
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
  const kEn = (q: { x: number; y: number }) => {
    if (!proyeccion?.escala) return 1
    const g = proyeccion.alSuelo(q.x, -q.y)
    return Number.isFinite(g.lat) && Number.isFinite(g.lon) ? proyeccion.escala(g) : 1
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
  const altoDelNodo = nodosPlanos ? anchoDelNodo / 2 : altoNodo
  const tapaNodo = (q: { x: number; y: number }, nodo: { x: number; y: number; k: number }, kp = 1) =>
    Math.abs(q.x - nodo.x) < (ancho * kp + anchoDelNodo * nodo.k) / 2 &&
    Math.min(q.y + altoRetrato * kp, nodo.y + altoDelNodo * nodo.k) > Math.max(q.y, nodo.y + bajoNodo * nodo.k)
  const centroVista = vista ? enPantalla(vista.centro) : null
  const aVista = (q: { x: number; y: number }) =>
    vista && centroVista ? { x: vista.ancho / 2 + (q.x - centroVista.x), y: vista.alto / 2 - (q.y - centroVista.y) } : null
  const cortado = (q: { x: number; y: number }) => {
    const v = aVista(q)
    if (!v || !vista) return false
    return v.x - ancho / 2 < 2 || v.x + ancho / 2 > vista.ancho - 2 || v.y - altoRetrato < vista.arriba || v.y > vista.alto - vista.abajo
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
      return { x: q.x, y: q.y, w: ancho * k, h: altoRetrato * k }
    }
    const tapan = (a: Caja, b: Caja) =>
      Math.abs(a.x - b.x) < (a.w + b.w) * 0.48 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.08 * Math.min(a.h, b.h)
    // Medido en el mapa inclinado (z16-z17,5): la moneda acaba a ~1,17 del alto de `tamanoDeNodoPx` sobre el suelo.
    const altoNodoEntero = altoNodo * 1.2
    const sobreNodo = (a: Caja) =>
      nodos.some(
        (nodo) =>
          Math.abs(a.x - nodo.x) < (a.w + anchoDelNodo * nodo.k) / 2 &&
          Math.min(a.y + a.h, nodo.y + altoNodoEntero * nodo.k) > Math.max(a.y, nodo.y + bajoNodo * nodo.k)
      )
    // ponytail: rejilla fija de ~1/4 de cuerpo hasta 5 cuerpos (~1200 sitios); de sobra para un grupo de 10-15.
    const paso = Math.max(4, anchoCuerpo * 0.25)
    const radioMax = anchoCuerpo * 5
    const desplazamientos: { x: number; y: number; d: number }[] = []
    for (let dx = -radioMax; dx <= radioMax + 0.01; dx += paso)
      for (let dy = -radioMax; dy <= radioMax + 0.01; dy += paso) {
        const d = Math.hypot(dx, dy)
        if (d <= radioMax + 0.01) desplazamientos.push({ x: dx, y: dy, d })
      }
    desplazamientos.sort((a, b) => a.d - b.d)
    const puestos: Caja[] = []
    const lista: { clave: string; p: Punto; jugador: Jugador | null }[] = [
      ...(propio ? [{ clave: CLAVE_PROPIO_EN_PLAN, p: propio, jugador: null }] : []),
      // Los cuerpos antes que los retratos: son más estrechos y se quedan los sitios más cerca del suyo.
      ...[...visibles]
        .sort((x, y) => Number(conCuerpo.has(claveDeJugador(y))) - Number(conCuerpo.has(claveDeJugador(x))) || (claveDeJugador(x) < claveDeJugador(y) ? -1 : 1))
        .map((j) => ({ clave: claveDeJugador(j), p: { lat: Number(j.lat), lon: Number(j.lon) }, jugador: j })),
    ]
    const salida: ElementoDeMapa[] = []
    for (const it of lista) {
      const c = enPantalla(it.p)
      const visible = vista ? enLienzo(c) : false
      const cuerpo = conCuerpo.has(it.clave)
      let mejor = { caja: cajaEn(c, cuerpo), nota: Infinity, d: 0 }
      for (const d of desplazamientos) {
        const base = d.d / anchoCuerpo
        if (base >= mejor.nota) break
        const caja = cajaEn({ x: c.x + d.x, y: c.y + d.y }, cuerpo)
        let nota = base
        if (puestos.some((o) => tapan(o, caja))) nota += 20
        if (sobreNodo(caja)) nota += 12
        if (visible && cortado(caja)) nota += 3
        if (nota < mejor.nota) mejor = { caja, nota, d: d.d }
      }
      puestos.push(mejor.caja)
      const corro = mejor.d < 0.5 ? { este: 0, norte: 0 } : corroHasta(mejor.caja, it.p)
      salida.push(
        it.jugador
          ? { tipo: 'jugador', clave: it.clave, lat: it.p.lat, lon: it.p.lon, corro, jugadores: [it.jugador], presencia: tipoDePresencia(it.jugador) }
          : { tipo: 'jugador', clave: it.clave, lat: it.p.lat, lon: it.p.lon, corro, jugadores: [], presencia: 'live' }
      )
    }
    // Tú vas el último en la lista, como en el plan con retratos.
    return [...salida.filter((el) => el.clave !== CLAVE_PROPIO_EN_PLAN), ...salida.filter((el) => el.clave === CLAVE_PROPIO_EN_PLAN)]
  }

  /**
   * 7/11 (4, Óscar: «cerca, en arco, sin líneas y no superlejos del nodo»): cada grupo, PEGADO a su sitio. Corona
   * compacta (retratos casi tocándose, ~0,95 de retrato entre centros) alrededor de su punto; si así tapa la chincheta
   * de SU nodo, un arco de 180° abierto hacia el lado libre; y como mucho un paso pequeño (hasta 1 retrato). 7/11
   * (nodos A): la moneda de un nodo VECINO también se esquiva (duro: pesa 12, más que cualquier paso de hasta 2,5 retratos). Bordes y HUD, igual: se
   * evitan si se puede, sin alejar. Entre grupos, nunca taparse (si no hay forma, se juntan y se vuelve a colocar).
   */
  const SEP = 0.95
  const PASOS: { x: number; y: number }[] = [{ x: 0, y: 0 }]
  // 7/11 (nodos A): hasta ~2,5 retratos si hace falta para salir del nodo (el coste de la distancia es pequeño).
  for (const r of [0.55, 1.1, 1.6, 2.05, 2.5]) {
    const lados = r < 1 ? 8 : 16
    for (let k = 0; k < lados; k += 1) PASOS.push({ x: Math.cos((k * 2 * Math.PI) / lados) * r * ancho, y: Math.sin((k * 2 * Math.PI) / lados) * r * ancho })
  }
  function formas(cuantos: number, giro: number): { x: number; y: number }[][] {
    if (cuantos < 2) return [[{ x: 0, y: 0 }]]
    const lista: { x: number; y: number }[][] = []
    const rCorona = (SEP * ancho) / (2 * Math.sin(Math.PI / cuantos))
    lista.push(Array.from({ length: cuantos }, (_, k) => {
      const a = giro + (k * 2 * Math.PI) / cuantos
      return { x: Math.sin(a) * rCorona, y: Math.cos(a) * rCorona }
    }))
    // Arcos de 180° hacia 8 lados (para dejar libre la chincheta o el borde).
    const paso = Math.PI / (cuantos - 1)
    const rArco = (SEP * ancho) / (2 * Math.sin(paso / 2))
    for (let k = 0; k < 8; k += 1) {
      const lado = (k * Math.PI) / 4
      lista.push(Array.from({ length: cuantos }, (_, i) => {
        const a = lado - Math.PI / 2 + i * paso
        return { x: Math.cos(a) * rArco, y: Math.sin(a) * rArco }
      }))
    }
    return lista
  }
  function colocar(miembros: Jugador[], ocupados: { x: number; y: number }[]): ElementoDeMapa[] {
    const centro = {
      lat: miembros.reduce((s, j) => s + Number(j.lat), 0) / miembros.length,
      lon: miembros.reduce((s, j) => s + Number(j.lon), 0) / miembros.length,
    }
    const enGrupo = miembros.length > MAXIMO_EN_CORONA
    const orden = [...miembros].sort((x, y) => (claveDeJugador(x) < claveDeJugador(y) ? -1 : 1))
    const c = enPantalla(centro)
    const visible = vista ? enLienzo(c) : false
    let mejor: { pts: { x: number; y: number }[]; nota: number } | null = null
    // El icono con el número (más de MAXIMO_EN_CORONA) también se aparta un poco de su chincheta.
    for (const [f, forma] of formas(enGrupo ? 1 : orden.length, anguloDeClave(claveDeJugador(orden[0]))).entries()) {
      for (const d of PASOS) {
        const pts = forma.map((o) => ({ x: c.x + o.x + d.x, y: c.y + o.y + d.y }))
        let nota = (Math.hypot(d.x, d.y) / ancho) * 1.5 + (f > 0 ? 0.4 : 0)
        for (const q of pts) {
          if (ocupados.some((o) => Math.hypot(o.x - q.x, o.y - q.y) < ancho * SEP - 1)) nota += 20
          // Obstáculo duro: cualquier nodo, el suyo o un vecino, pesa más que cualquier paso (el máximo, ~3,75).
          const kp = kEn(q)
          for (const nodo of nodos) if (tapaNodo(q, nodo, kp)) nota += 12
          if (visible && cortado(q)) nota += 3
        }
        if (!mejor || nota < mejor.nota) mejor = { pts, nota }
      }
    }
    const elegido = (mejor as { pts: { x: number; y: number }[] }).pts
    for (const q of elegido) ocupados.push(q)
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

  let elementos: ElementoDeMapa[] = []
  for (let vuelta = 0; vuelta < 8; vuelta += 1) {
    const grupos = new Map<number, number[]>()
    for (let i = 0; i < n; i += 1) grupos.set(raiz(i), [...(grupos.get(raiz(i)) ?? []), i])
    elementos = []
    const grupoDe: number[] = []
    const ocupados: { x: number; y: number }[] = []
    // Los grandes primero: son los que menos sitio tienen para moverse.
    for (const [r, indices] of [...grupos].sort((x, y) => y[1].length - x[1].length)) {
      for (const el of colocar(indices.map((i) => visibles[i]), ocupados)) {
        elementos.push(el)
        grupoDe.push(r)
      }
    }
    const pts = elementos.map((el) => enPantalla(conCorro(el, el.corro)))
    let junto = false
    for (let a = 0; a < pts.length; a += 1) {
      for (let c = a + 1; c < pts.length; c += 1) {
        if (grupoDe[a] === grupoDe[c]) continue
        if (Math.hypot(pts[a].x - pts[c].x, pts[a].y - pts[c].y) < ancho * SEP - 1) {
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
      if (otros.some((o) => Math.hypot(o.x - q.x, o.y - q.y) < ancho * SEP - 1)) nota += 20
      const kp = kEn(q)
      for (const nodo of nodos) if (tapaNodo(q, nodo, kp)) nota += 12
      if (visible && cortado(q)) nota += 3
      if (nota < mejor.nota) mejor = { pt: q, nota }
    }
    const quieto = mejor.pt === c
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
