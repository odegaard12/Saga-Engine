import type { TeamProfileLiveStatus } from '../../types/player'
import { getLocale } from '../../i18n'
import { textosDePantallasDe } from './textosDePantallas'
import { desplazar, type MedidaDeMonedas } from '../posicion/fuentePosicion'
import { ZOOM_MINIMO_AVATARES, alturaEnPantallaPx } from '../avatares3d/mixamo/lodAvatares'

/** Los textos del popup, en el idioma de ESTE momento (se construye al tocar). */
function textosDelPopup() {
  return textosDePantallasDe(getLocale()).popup
}

/**
 * Los compañeros (y tú) en el mapa: el plan de dibujo y las fichas.
 *
 * Los retratos se pintan como SÍMBOLOS del mapa (capa WebGL, igual que los nodos) y los cuerpos 3D en la capa de
 * avatares; el abanico de quien no cabe y el aro que late en tu retrato son marcadores del DOM. La coordenada de cada
 * elemento es SIEMPRE la real. 23/11: dónde se DIBUJA cada uno (real + apartado del poste) lo decide una sola fuente,
 * `posicion/fuentePosicion.ts`, con geografía y sin cámara; aquí sólo queda qué elementos hay (grupos con su número
 * de lejos, uno por jugador de cerca). 24/11: el racimo de retratos (`planDeRetratos`, `corro`) ya no lo usa el mapa (en
 * 2D y 3D manda la fuente, que separa a las personas con `separacionEntreJugadoresM` y, en 2D, las aparta de las
 * monedas con `medirMonedas`). Todo el
 * texto se construye con `textContent`, nunca con `innerHTML`: los nombres los escribe el jugador.
 */

export type TipoDePresencia = 'live' | 'recent' | 'offline'

type Punto = { lat: number; lon: number }
type Jugador = TeamProfileLiveStatus

export function tipoDePresencia(jugador: Jugador): TipoDePresencia {
  const presencia = String(jugador.presence || 'offline').toLowerCase()
  return presencia === 'offline' ? 'offline' : presencia === 'stale' ? 'recent' : 'live'
}

/** El punto desplazado `corro` metros (este, norte): el de la fuente de posición (única definición). */
export { desplazar }

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
  cerrar.className = 'saga-popup-cerrar saga-toque saga-toque-cierre' // 22/11: dibujada a 36, toque de 44
  cerrar.setAttribute('aria-label', textosDelPopup().cerrar)
  cerrar.textContent = '×'
  cerrar.addEventListener('click', (ev) => {
    ev.stopPropagation()
    alCerrar?.()
  })
  return cerrar
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

export type ElementoDeMapa = {
  tipo: 'jugador' | 'grupo'
  clave: string
  /** Posición REAL (la del jugador, o el centro del grupo). Nunca se desplaza. */
  lat: number
  lon: number
  /** Racimo de la vista 2D: metros hacia el este y el norte desde su punto real (0, 0 = en su sitio). Si no, siempre 0. */
  corro: { este: number; norte: number }
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
 * Qué elementos hay. Función pura: sin mapa ni DOM.
 *
 * - Lejos (< z16): los que se taparían forman un icono con su número (`planLejano`).
 * - De cerca: uno por jugador, en su punto real (`planCercano`); el apartado del poste lo pone la fuente de posición.
 *   En la vista 2D (`racimos`, por defecto), los retratos que se taparían se colocan en racimo alrededor de su centro (`corro`),
 *   sin tapar nodos ni tu retrato (`propio`, que no se mueve).
 */
export function planDeJugadores(
  jugadores: Jugador[],
  zoom: number,
  opciones: { lejos?: boolean; evitar?: readonly Punto[]; nodosPlanos?: boolean; propio?: Punto | null; racimos?: boolean } = {}
): ElementoDeMapa[] {
  const visibles = jugadores.filter(
    (j) => !j.is_self && typeof j.lat === 'number' && typeof j.lon === 'number'
  )
  if (opciones.lejos ?? zoom < ZOOM_SEPARAR) return planLejano(visibles, zoom, opciones.propio ?? null)
  if (opciones.racimos === false) return visibles.map((j) => elementoSuelto(j))
  // Sin compañeros, la latitud es la tuya (11/11: con 42,5 fija, lejos de ahí tu retrato medía un 3 % de más o de menos).
  const latMedia = visibles.length ? visibles.reduce((suma, j) => suma + Number(j.lat), 0) / visibles.length : (opciones.propio?.lat ?? 42.5)
  return planDeRetratos(visibles, zoom, latMedia, opciones.evitar ?? [], opciones.nodosPlanos ?? false, opciones.propio ?? null)
}

function elementoSuelto(j: Jugador): ElementoDeMapa {
  return { tipo: 'jugador', clave: claveDeJugador(j), lat: Number(j.lat), lon: Number(j.lon), corro: { este: 0, norte: 0 }, jugadores: [j], presencia: tipoDePresencia(j) }
}

/**
 * Vista lejana (zoom < ZOOM_SEPARAR): cada uno en su punto REAL (corro 0), también tú; los que se taparían en pantalla
 * (a menos de un retrato) forman un único icono con su número, en el centroide real de sus miembros. Determinista:
 * mismo estado y zoom, mismo resultado; no aparta a nadie.
 */
/** 1 hasta z15 y 0 en z16 (suave): cuánto cuenta aún el umbral de agrupar justo antes de pasar a retratos sueltos. */
export function fundidoDelGrupo(zoom: number): number {
  const t = Math.min(1, Math.max(0, zoom - (ZOOM_SEPARAR - 1)))
  return 1 - t * t * (3 - 2 * t)
}

function planLejano(visibles: Jugador[], zoom: number, propio: Punto | null): ElementoDeMapa[] {
  const n = visibles.length
  const lat = n ? visibles.reduce((s, j) => s + Number(j.lat), 0) / n : (propio?.lat ?? 42.5)
  // ×2: peor caso de perspectiva (inclinación máxima 60° => cos = 0,5): los iconos no se tapan con NINGUNA inclinación ni rumbo,
  // y el resultado no depende de la cámara (nada cambia al soltar un gesto).
  // 23/11: y el umbral se funde a 0 entre z15 y z16 (`fundidoDelGrupo`): en z16 nadie se agrupa, así que cruzarlo ya no hace
  // saltar a quien estaba en un grupo (antes, de golpe, hasta ~115 m del centroide a su sitio): se deshace poco a poco.
  const tapanM = anchoDeRetratoPx(zoom) * metrosPorPixel(zoom, lat) * 2 * fundidoDelGrupo(zoom)
  const padre = visibles.map((_, i) => i)
  const raiz = (i: number): number => (padre[i] === i ? i : (padre[i] = raiz(padre[i])))
  for (let a = 0; a < n; a += 1)
    for (let c = a + 1; c < n; c += 1)
      if (metrosEntre(visibles[a] as Punto, visibles[c] as Punto) < tapanM) padre[raiz(a)] = raiz(c)
  // Un grupo se dibuja en su centroide: dos grupos cuyos centroides quedan a menos de un retrato también se juntan (repetido
  // hasta que ya no haya ninguno; determinista).
  for (let vuelta = 0; vuelta < 12; vuelta += 1) {
    const cs = new Map<number, { la: number; lo: number; k: number }>()
    visibles.forEach((j, i) => {
      const c = cs.get(raiz(i)) ?? { la: 0, lo: 0, k: 0 }
      cs.set(raiz(i), { la: c.la + Number(j.lat), lo: c.lo + Number(j.lon), k: c.k + 1 })
    })
    const claves = [...cs.keys()]
    let unido = false
    for (let a = 0; a < claves.length && !unido; a += 1)
      for (let c = a + 1; c < claves.length && !unido; c += 1) {
        const x = cs.get(claves[a])!
        const y = cs.get(claves[c])!
        if (metrosEntre({ lat: x.la / x.k, lon: x.lo / x.k }, { lat: y.la / y.k, lon: y.lo / y.k }) < tapanM) {
          padre[raiz(claves[a])] = raiz(claves[c])
          unido = true
        }
      }
    if (!unido) break
  }
  const grupos = new Map<number, Jugador[]>()
  visibles.forEach((j, i) => grupos.set(raiz(i), [...(grupos.get(raiz(i)) ?? []), j]))
  const sin = { este: 0, norte: 0 }
  const salida: ElementoDeMapa[] = []
  for (const miembros of grupos.values()) {
    miembros.sort((x, y) => (claveDeJugador(x) < claveDeJugador(y) ? -1 : 1))
    if (miembros.length === 1) {
      salida.push(elementoSuelto(miembros[0]))
    } else {
      const lat0 = miembros.reduce((s, j) => s + Number(j.lat), 0) / miembros.length
      const lon0 = miembros.reduce((s, j) => s + Number(j.lon), 0) / miembros.length
      salida.push({ tipo: 'grupo', clave: claveDeGrupo(miembros), lat: lat0, lon: lon0, corro: sin, jugadores: miembros, presencia: mejorPresencia(miembros) })
    }
  }
  return salida
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
 * La chincheta de un nodo en pantalla (px CSS) a este zoom: la curva de TAMANO_NODOS de MapSurfaceGL (0,6 a z12,
 * 3,6 a z19,5, exponencial 1,15) por la imagen del nodo. Medido en el mapa a z17 (tamaño 2,24): la moneda acaba
 * ~175 px sobre el suelo y mide ~80 px de ancho. Si cambia el dibujo del nodo, se cambia aquí.
 */
export function tamanoDeNodoPx(zoom: number): { alto: number; ancho: number } {
  const tamano = factorDeTamanoDeNodo(zoom)
  return { alto: 78 * tamano, ancho: 36 * tamano }
}

/**
 * 16/11 (Óscar: «los nodos no guardan el tamaño de donde están: se amplían aunque tengamos vista de Galicia»): el
 * `icon-size` de las chinchetas (TAMANO_NODOS de MapSurfaceGL) en función del zoom. Antes valía 0,6 por debajo de z12 y
 * el nodo medía lo mismo a z12 que a z8; ahora sigue encogiéndose hasta un punto (0,1 a z8). Misma curva que el estilo
 * (interpolación exponencial de base 1,15 entre paradas): si se toca allí, se toca aquí.
 */
export const PARADAS_TAMANO_NODO: readonly (readonly [number, number])[] = [[8, 0.7], [12, 0.76], [19.5, 3.6]]
export function factorDeTamanoDeNodo(zoom: number): number {
  const p = PARADAS_TAMANO_NODO
  if (zoom <= p[0][0]) return p[0][1]
  for (let i = 1; i < p.length; i += 1) {
    if (zoom <= p[i][0]) {
      const [z0, v0] = p[i - 1]
      const [z1, v1] = p[i]
      const f = (1.15 ** (zoom - z0) - 1) / (1.15 ** (z1 - z0) - 1)
      return v0 + f * (v1 - v0)
    }
  }
  return p[p.length - 1][1]
}

/**
 * 16/11: tamaño del nodo 3D (bola con mástil) en función del zoom: completo (1) desde z16, y por debajo se encoge de
 * forma continua (suavizado, sin esquinas) hasta 0,2 a z11 o menos. Se multiplica a la altura que ya sigue al zoom.
 */
export function factorTresDDeNodo(zoom: number): number {
  const g = Math.min(1, Math.max(0, (zoom - 11) / 5))
  return 0.2 + 0.8 * g * g * (3 - 2 * g)
}

/**
 * 16/11: por debajo de este zoom nadie se aparta de su punto: ni nodos (repartoDeNodos.ts) ni jugadores. Apartar es
 * mover en PÍXELES, y a z8 un retrato de separación son 10 km: el marcador salía «por otros concellos» (regresión de
 * 6.7.0 y 6.8-6.9). Lejos sólo se AGRUPA: los jugadores que se tapan, en un icono con su número en el centroide real.
 */
export const ZOOM_SEPARAR = ZOOM_MINIMO_AVATARES
/** Sin histéresis ni estado (16/11, banco con gestos reales): el modo depende sólo del zoom de ahora. */
export function estaLejos(zoom: number): boolean {
  return zoom < ZOOM_SEPARAR
}

/**
 * El zoom con el que se reparten los nodos (y el racimo de retratos de la vista 2D). 23/11: de cerca, SIEMPRE
 * `ZOOM_DEL_REPARTO` (el de jugar): ni el nodo ni quien se aparta de su poste cambian de sitio al hacer zoom; lejos, a
 * cuartos de nivel (nadie se mueve a esa distancia, sólo se agrupa). Única definición, la usan nodos y jugadores.
 */
export const ZOOM_DEL_REPARTO = 17.5
export function zoomDeReparto(zoom: number): number {
  return estaLejos(zoom) ? Math.floor(zoom * 4) / 4 : ZOOM_DEL_REPARTO
}

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

/** 24/11: el aro del cuerpo 3D (radio de fuera 0,52 de 1,75 m en el tuyo) en altos del cuerpo: ~0,6. */
export const ARO_EN_ALTOS = (2 * 0.52) / 1.75
/** 24/11: margen sobre la huella, para que ni el canto del retrato ni la sombra lleguen a tocarse. */
export const MARGEN_DE_HUELLA = 1.08
/**
 * 24/11 (Óscar: «el de mi compañera está pegadísimo al mío»): la distancia mínima en el SUELO (m) entre dos jugadores para que
 * no se pisen tal y como se ven a este zoom: la huella mayor (el retrato, o el aro del cuerpo 3D, que es menor) por los
 * metros de un píxel, con un 8 % de margen. Es la misma en 2D y en 3D (cambiar de vista no mueve a nadie) y no depende
 * del rumbo ni de la inclinación; con el zoom cambia de forma continua (y entre z15 y z16 entra poco a poco, al ritmo
 * al que se deshacen los grupos de lejos: `fundidoDelGrupo`). Medido: ~62 m a z16, ~26 m a z17,5, ~11 m a z19, ~6,5 m a z20.
 * Un cuerpo inclinado puede tapar las piernas del de detrás si quedan en la línea de la cámara: separar eso dependería
 * del rumbo, y eso no se hace (la posición sólo depende del mundo).
 */
export function separacionEntreJugadoresM(zoom: number, lat: number): number {
  if (!Number.isFinite(zoom)) return 0
  const px = Math.max(anchoDeRetratoPx(zoom), ARO_EN_ALTOS * alturaEnPantallaPx(zoom, lat))
  return px * MARGEN_DE_HUELLA * metrosPorPixel(zoom, lat) * (1 - fundidoDelGrupo(zoom))
}

/** 24/11: radio del círculo del retrato en pantalla (px): el aro de fuera (25 de 56 px) a este zoom; `anchoDeRetratoPx` lleva holgura. */
export function radioDeRetratoPx(zoom: number): number {
  return (anchoDeRetratoPx(zoom) * 25) / 58
}

/**
 * 24/11: el radio de la moneda 2D (px a tamaño 1) con su canto: la de `dibujarMoneda` (21, 18 y 15,5) más 0,75; la hecha,
 * hasta el borde de su chapa ✓ (a 0,72·r en diagonal, radio 7): no es un círculo, pero el que la envuelve no depende del rumbo.
 */
export function radioDeMonedaPx(estado: 'hecho' | 'actual' | 'siguiente' | 'pendiente' | 'oro'): number {
  if (estado === 'actual') return 21.75
  if (estado === 'siguiente') return 18.75
  if (estado === 'pendiente') return 16.25
  return 15.5 * 0.72 * Math.SQRT2 + 7.75
}

/** 24/11: lo que separa el canto de un retrato del de una moneda (px), para que se vea el aire entre los dos. */
export const MARGEN_MONEDA_PX = 6

/**
 * 24/11: las monedas en el suelo a este zoom, sin crear nada (se llama en cada dibujo): metros por píxel con el mismo
 * fundido de lejos que la separación (0 hasta z15, entero en z16: más lejos nadie se aparta), el tamaño de los nodos y
 * el radio del retrato más el margen.
 */
export function medirMonedas(zoom: number, lat: number, m: MedidaDeMonedas): void {
  const k = Number.isFinite(zoom) ? 1 - fundidoDelGrupo(zoom) : 0
  m.mpp = k > 0 ? metrosPorPixel(zoom, lat) * k : 0
  m.escala = factorDeTamanoDeNodo(zoom)
  m.retratoPx = radioDeRetratoPx(zoom) + MARGEN_MONEDA_PX
}

function planDeRetratos(
  visibles: Jugador[],
  zoom: number,
  lat: number,
  evitar: readonly Punto[],
  nodosPlanos: boolean,
  propio: Punto | null
): ElementoDeMapa[] {
  const mpp = metrosPorPixel(zoom, lat)
  const ancho = anchoDeRetratoPx(zoom)
  // 11/11: el retrato es sólo el círculo (sin punta) y su punto es el CENTRO: alto = ancho, mitad arriba y mitad abajo.
  const altoRetrato = ancho
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
    const e = (p.lon - lon0) * 111320 * Math.cos((lat0 * Math.PI) / 180)
    const nn = (p.lat - lat0) * 111320
    return { x: e / mpp, y: nn / mpp }
  }
  // El desplazamiento en el suelo (este/norte, m) que lleva el retrato de `desde` al punto de pantalla `q`.
  const corroHasta = (q: { x: number; y: number }, desde: Punto) => {
    const o = enPantalla(desde)
    return { este: (q.x - o.x) * mpp, norte: (q.y - o.y) * mpp }
  }
  const nodos = evitar.map((p) => enPantalla(p)).filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y))
  const { alto: altoNodo, ancho: anchoNodo } = tamanoDeNodoPx(zoom)
  // 7/11 (nodos A): en 2D el nodo es una moneda centrada en su punto (sin poste); en 3D, el poste sobre su punto.
  // El rectángulo del nodo ENTERO: la moneda en 2D (la del nodo en juego es un 17 % mayor, y el halo es sólo luz);
  // con postes, la peana del suelo, el poste, la moneda de arriba y el cubo de al lado (~1,6 monedas de ancho).
  // 7/11: obstáculo DURO.
  const anchoDelNodo = anchoNodo * (nodosPlanos ? 1.17 : 1.6)
  const bajoNodo = nodosPlanos ? -anchoDelNodo / 2 : -anchoNodo * 0.3
  // Medido en el mapa inclinado (z16-z17,5): la moneda del poste acaba a ~1,17 del alto de `tamanoDeNodoPx`.
  const altoDelNodo = nodosPlanos ? anchoDelNodo / 2 : altoNodo * 1.2
  const tapaNodo = (q: { x: number; y: number }, nodo: { x: number; y: number }) =>
    Math.abs(q.x - nodo.x) < (ancho + anchoDelNodo) / 2 &&
    Math.min(q.y + altoRetrato / 2, nodo.y + altoDelNodo) > Math.max(q.y - altoRetrato / 2, nodo.y + bajoNodo)
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
  function colocar(miembros: Jugador[], ocupados: { x: number; y: number }[]): ElementoDeMapa[] {
    const centro = {
      lat: miembros.reduce((s, j) => s + Number(j.lat), 0) / miembros.length,
      lon: miembros.reduce((s, j) => s + Number(j.lon), 0) / miembros.length,
    }
    const enGrupo = miembros.length > MAXIMO_EN_CORONA
    const orden = [...miembros].sort((x, y) => (claveDeJugador(x) < claveDeJugador(y) ? -1 : 1))
    // Los sitios reales en pantalla (por clave).
    const reales = orden.map((j) => enPantalla(j as Punto))
    const c = enPantalla(centro)
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
          for (const nodo of nodos) if (tapaNodo(q, nodo)) nota += 12
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
            if (nodos.some((nodo) => tapaNodo(q, nodo))) continue
            celdas.push({ ...q, d: Math.hypot(q.x - c.x, q.y - c.y) })
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
    const elegido = todos
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
    // Tu retrato no se mueve (`dibujo(yo) = real(yo)`): es un obstáculo fijo que los racimos esquivan.
    const ocupados: { x: number; y: number }[] = propio ? [enPantalla(propio)] : []
    // Los grandes primero: son los que menos sitio tienen para moverse.
    for (const [r, indices] of [...grupos].sort((x, y) => y[1].length - x[1].length)) {
      for (const el of colocar(indices.map((i) => visibles[i]), ocupados)) {
        elementos.push(el)
        grupoDe.push(r)
      }
    }
    const pts = elementos.map((el) => enPantalla(desplazar(el, el.corro)))
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
  return elementos
}

/** Las líneas finas de la corona: de cada retrato apartado a su sitio real (GeoJSON para una capa de líneas). */
export function lineasDeCorona(elementos: readonly ElementoDeMapa[]) {
  return {
    type: 'FeatureCollection' as const,
    features: elementos
      .filter((el) => el.tipo === 'jugador' && (el.corro.este || el.corro.norte))
      .map((el) => {
        const sitio = desplazar(el, el.corro)
        return {
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'LineString' as const, coordinates: [[el.lon, el.lat], [sitio.lon, sitio.lat]] },
        }
      }),
  }
}
