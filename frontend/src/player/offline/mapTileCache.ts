import type { PlayerStage } from '../../types/player'
import { esErrorDeCuota } from './almacenamiento'
import { fetchConLimite } from './peticiones'
import {
  evaluarMapaPorResumen,
  firmaDePuntos,
  muestraDeTeselas,
  type EvaluacionDeMapa,
} from './revisiones'

// Tiene que ser exactamente el mismo nombre que usa frontend/public/sw.js.
// El service worker borra al activarse cualquier caché 'saga-route-tile-coverage-*'
// que no sea la suya, así que si aquí se guarda en otra, la descarga del mapa
// se pierde en el siguiente arranque y el jugador se queda sin mapa offline
// creyendo que lo tiene.
const TILE_CACHE_NAME = 'saga-route-tile-coverage-v5.52-pnoa'
/** Donde el service worker guarda la red de caminos. Tiene que coincidir con sw.js. */
const ROAD_GRAPH_CACHE = 'saga-road-graph-v2'
/**
 * v3 desde 5.18.1. Cambiar la clave es lo que obliga a rehacer el paquete.
 *
 * La pantalla de carga se salta la descarga si el resumen guardado dice
 * que ya está al 98 %. Al cambiar QUÉ lleva el paquete -en 5.18.0 entraron
 * el relieve a z14-15 y el corredor por el trazado real- el resumen viejo
 * seguía diciendo "completo", la barra pasaba al 100 % al instante y lo
 * nuevo no se bajaba nunca: "descarga súper rápido y en modo avión no hay
 * nada". Con otra clave el resumen viejo no cuenta; lo que ya está en el
 * móvil no se vuelve a pedir, sólo lo que falta.
 */
const TILE_SUMMARY_KEY = 'saga:offline-map-tiles:v3'

// Control sano: bastante mapa, pero sin intentar descargar media provincia en zoom 18.
/**
 * 8000, no 1500. El tope se aplica por ORDEN DE LLEGADA a la lista, y con
 * los niveles de continente, país y región delante, 1500 dejaba fuera
 * justo lo último: el corredor por donde se camina y el detalle de los
 * nodos. La barra llegaba al 100 % "de golpe" -sólo había bajado lo de
 * lejos- y al acercarse al nodo el mapa tenía que cargar de la red.
 * El paquete completo ronda las 4300 teselas; 8000 deja margen para
 * rutas más largas sin volver a recortar en silencio.
 */
const MAX_TILE_URLS = 8000

/**
 * Los niveles de contexto, de lejos a cerca: zoom, radio máximo en km y
 * presupuesto de teselas (que es lo que fija el lado del cuadrado).
 * Van en una tabla, y no en llamadas sueltas, para que formen parte de la
 * FIRMA del plan (ver abajo).
 */
const NIVELES: Array<[number, number, number, string]> = [
  [3, 3000, 9, 'nivel-continente-z3'],
  [4, 3000, 9, 'nivel-continente-z4'],
  [5, 2000, 25, 'nivel-continente-z5'],
  [6, 1000, 25, 'nivel-pais-z6'],
  [7, 700, 49, 'nivel-pais-z7'],
  /**
   * 5.53: región, comarca y entorno con la mitad de lado (o menos). Eran 922
   * teselas de imagen -un tercio de las ~3000 del paquete- para ver a zoom 8-12
   * hasta 290 km alrededor; un móvil a z11 enseña ~25 km de ancho. Con estos
   * presupuestos se ve sin huecos hasta ~175 km (z9), ~85 km (z10), ~58 km (z11)
   * y ~29 km (z12), y el paquete baja unas 660 teselas menos.
   */
  [8, 400, 25, 'nivel-region-z8'],
  [9, 260, 49, 'nivel-region-z9'],
  [10, 180, 49, 'nivel-comarca-z10'],
  [11, 110, 81, 'nivel-comarca-z11'],
  [12, 60, 81, 'nivel-entorno-z12'],
]

/**
 * Relieve LEJANO (z11-z12): hasta dónde alrededor de la ruta, por zoom.
 *
 * Iba en toda la comarca (z11, ±110 km) y todo el entorno (z12, ±60 km): 561
 * teselas de elevación, 41 MB de los ~92 del paquete, para un monte que sólo se
 * ve al desampliar hasta ver media provincia, y que a ese zoom ya salía plano
 * igual (el relieve de z10 hacia abajo no va en el paquete). Medido en el
 * navegador (r14): con la cámara inclinada el horizonte pide z11 hasta ~30 km
 * de la ruta, y z12 no pasa de los 15 km. Con esto el monte del horizonte es el
 * mismo con y sin cobertura, por ~7 MB en vez de 41.
 */
const RELIEVE_LEJANO_KM: Record<number, number> = { 11: 40, 12: 15 }

/**
 * La versión del mapa 3D que preparó el panel (`mapa3d_version` de /api/config).
 *
 * Va en la URL del relieve y de los edificios (`?v=`). El service worker sirve
 * esas teselas primero de su caché, así que sin versión un relieve rehecho en el
 * panel no llegaba nunca a los móviles que ya tenían el viejo. Con ella la URL
 * cambia, la firma del plan cambia y la pantalla de carga vuelve a bajarlo.
 *
 * Se recuerda en el móvil: el mapa se monta después de la carga y, sin cobertura,
 * con la versión de lo que ya está guardado.
 */
const VERSION_MAPA3D_KEY = 'saga:mapa3d-version'
let versionMapa3d = leerVersionMapa3d()

function limpiarVersion(valor: unknown): string {
  const texto = typeof valor === 'string' ? valor.trim() : ''
  return /^[A-Za-z0-9_-]{1,40}$/.test(texto) ? texto : ''
}

function leerVersionMapa3d(): string {
  try {
    return limpiarVersion(window.localStorage.getItem(VERSION_MAPA3D_KEY))
  } catch {
    return ''
  }
}

/** La fija la pantalla de carga con la configuración (la de ahora, o la guardada sin red). */
export function fijarVersionDelMapa3d(version: string | null | undefined): void {
  // `undefined` = un servidor de antes de esto: no se toca lo que hubiera.
  if (version === undefined) return
  versionMapa3d = limpiarVersion(version)
  try {
    window.localStorage.setItem(VERSION_MAPA3D_KEY, versionMapa3d)
  } catch {
    // Sin almacén se queda en memoria: vale para esta sesión.
  }
}

/** `?v=…` para el relieve y los edificios ('' si el mapa 3D nunca se preparó). */
export function sufijoDelMapa3d(): string {
  return versionMapa3d ? `?v=${versionMapa3d}` : ''
}

const REGIONAL_RADIUS_KM = 30 // contexto amplio, zoom bajo
const MISSION_AREA_RADIUS_KM = 10 // zona jugable amplia, zoom medio
const ROUTE_CORRIDOR_KM = 2 // ancho alrededor de la ruta
const NODE_DETAIL_RADIUS_KM = 0.5 // detalle alto alrededor de nodos

export type OfflineMapTileProgress = {
  label: string
  done: number
  total: number
  detail?: string
  /** Bytes de teselas bajados en esta vuelta. */
  bytes?: number
}

/** Cómo quedó la red de caminos: guardada, o el servidor no tiene ninguna. */
export type EstadoDelGrafo = 'ok' | 'no_disponible' | 'error'

export type OfflineMapTileSummary = {
  /** Firma del plan con el que se hizo. Si no coincide con la actual, no vale. */
  firma?: string
  /**
   * Firma de la RUTA con la que se hizo: sale de las coordenadas de los nodos
   * (y del trazado). Si se mueve o se añade un nodo cambia, y el mapa guardado
   * deja de valer para la ruta de ahora aunque el plan sea el mismo.
   */
  firma_ruta?: string
  /**
   * Cada tesela del plan está guardada (o el origen no la tiene) y la red de
   * caminos no quedó a medias. Es lo que dice la pantalla de carga: `saved`
   * sólo cuenta, y con el 98 % un hueco en el detalle de un nodo pasaba por bueno.
   */
  completo?: boolean
  /** Teselas del plan que siguen sin guardar tras reintentar. */
  faltan?: number
  /** Teselas del plan que el origen no tiene (404): no se vuelven a pedir. */
  inexistentes?: number
  grafo?: EstadoDelGrafo
  /** Cuándo se miró por última vez si el servidor tenía red de caminos. */
  grafo_comprobado_en?: string
  /** El navegador dijo que no cabía más: la descarga quedó a medias por eso. */
  sin_espacio?: boolean
  cached_at: string
  requested: number
  saved: number
  zooms: number[]
  /**
   * El plan pedia mas teselas de las que caben en el tope y se corto.
   *
   * Importa mucho mas de lo que parece: el detalle de los nodos -zoom 18, lo
   * que se ve plantado en el nodo con el mapa ampliado- se anade el ULTIMO, asi
   * que es lo primero que se pierde. Sin este dato, el panel de "antes de
   * salir" contaba las que pidio -no las que hacian falta- y decia que el mapa
   * estaba listo igual.
   */
  recortado: boolean
  descartadas: number
  detalle_de_nodos: number
  route_points: number
  regional_radius_km: number
  mission_area_radius_km: number
  route_corridor_km: number
  node_detail_radius_km: number
}

type Point = { lat: number; lon: number }

function latLonToTile(lat: number, lon: number, zoom: number) {
  const latRad = (lat * Math.PI) / 180
  const n = 2 ** zoom

  return {
    x: Math.floor(((lon + 180) / 360) * n),
    y: Math.floor(((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n),
  }
}

function tileUrl(zoom: number, x: number, y: number) {
  const n = 2 ** zoom
  const wrappedX = ((x % n) + n) % n
  const clampedY = Math.max(0, Math.min(n - 1, y))
  return `/map-tiles/${zoom}/${wrappedX}/${clampedY}.png`
}

/**
 * La misma tesela, pero de ELEVACIÓN.
 *
 * El relieve usa exactamente el mismo esquema z/x/y que el satélite -las
 * dos son XYZ en Web Mercator de 256 px-, así que una tesela de relieve
 * cubre justo el mismo trozo de terreno que su gemela de satélite. Por eso
 * el plan de abajo no recalcula nada: coge las teselas ya planificadas y
 * añade sus gemelas de relieve.
 */
function demTileUrl(zoom: number, x: number, y: number) {
  const n = 2 ** zoom
  const wrappedX = ((x % n) + n) % n
  const clampedY = Math.min(Math.max(y, 0), n - 1)
  return `/dem-tiles/${zoom}/${wrappedX}/${clampedY}.png${sufijoDelMapa3d()}`
}

/**
 * Zooms de relieve que se bajan. Terrarium no pasa de 15, y tampoco hace
 * falta: MapLibre estira la elevación de un zoom bajo cuando te acercas, y
 * el RELIEVE -la forma del monte- no gana nada con más detalle. Bajar
 * hasta 13 cuesta unos pocos megas; hasta 15 serían cientos.
 */
/**
 * Relieve de z11 a z14.
 *
 * Una tesela de elevación pesa 90 KB, tres o cuatro veces una de imagen:
 * es lo que decide el tamaño del paquete. De z11 a z14 cubre la comarca
 * y la zona de misión, que es donde el monte tiene que ser el mismo con
 * o sin cobertura; el mapa 3D no pide más de z14 (ver la fuente de
 * elevación en MapSurfaceGL), así que z15 sobraba. Y por debajo de z11 el
 * desnivel no se lee a ese zoom. Unas 1000 teselas, ~90 MB.
 */
/**
 * 5.53: otra vez hasta z14. 5.52 añadió z15 (~100 teselas más que 5.51.1) para el
 * sombreado fino; el sombreado vuelve a z14 (ver MapSurfaceGL) y el paquete, al tamaño de 5.51.1.
 */
const ZOOMS_RELIEVE = [11, 12, 13, 14]

/**
 * FIRMA DEL PLAN: cambia sola cuando cambia lo que lleva el paquete.
 *
 * El resumen guardado en el móvil dice "completo" y la pantalla de carga
 * se lo cree. Cada vez que se tocó qué lleva el paquete -relieve nuevo,
 * niveles nuevos, tope nuevo- ese resumen viejo seguía diciendo completo,
 * la barra pasaba al 100 % de golpe y lo nuevo no se bajaba: el jugador
 * entraba y el mapa cargaba de la red mientras se movía. Tres veces.
 * Con la firma dentro del resumen, un resumen de otro plan no vale, sin
 * que nadie tenga que acordarse de cambiar una clave.
 */
const FIRMA_DEL_PLAN = JSON.stringify({
  tope: MAX_TILE_URLS,
  relieve: ZOOMS_RELIEVE,
  niveles: NIVELES,
  mision: [MISSION_AREA_RADIUS_KM, ROUTE_CORRIDOR_KM, NODE_DETAIL_RADIUS_KM],
  grafo: 2,
  // 3: zona de misión también a z15-z16 y detalle de nodo a z19. Con
  // teselas de 256 px el mapa pide un nivel MÁS que el zoom que enseña:
  // al desampliar hasta ver todos los nodos (zoom 14) pedía z15 en toda la
  // zona y sólo estaba el corredor; junto a un nodo (zoom 18) pedía z19 y
  // no había nada. "El mapa aún tiene que cargar".
  // 4: la red de caminos entra en el paquete (ver descargarRedDeCaminos).
  // Sin subir esto, quien ya tenía el mapa se saltaba la pantalla de carga
  // y la red se bajaba mientras jugaba: la guía tardaba un minuto.
  // 5: relieve z12 de la zona de misión. La FORMA del terreno usa sólo
  // hasta z12 (ver la fuente de relieve en MapSurfaceGL) y el paquete casi
  // no lo traía (3 teselas): sin cobertura, el monte de cerca salía plano.
  // 6: satélite PNOA del IGN (otra caché, ver TILE_CACHE_NAME), relieve del
  // MDT05 (hasta z14, como siempre) y los edificios del Catastro.
  plan: 6,
  edificios: 1,
  // 7: relieve lejano (z11-z12) sólo a RELIEVE_LEJANO_KM de la ruta.
  relieveLejano: RELIEVE_LEJANO_KM,
})

/** La firma del plan MÁS la versión del mapa 3D: rehacerlo en el panel la cambia. */
function firmaDelPlan(): string {
  return versionMapa3d ? `${FIRMA_DEL_PLAN}|mapa3d:${versionMapa3d}` : FIRMA_DEL_PLAN
}

function metersPerTile(lat: number, zoom: number) {
  return ((156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom) * 256
}

function getDistanceMeters(a: Point, b: Point) {
  const radius = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2

  return 2 * radius * Math.asin(Math.sqrt(h))
}

/**
 * Los puntos del trazado real de un nodo (`route_track`), si los tiene.
 *
 * Admite los dos formatos que guarda administración: pares `[lat, lon]`
 * y objetos `{lat, lon|lng}`. Devuelve vacío si no hay trazado.
 */
function puntosDelTrack(stage: PlayerStage): Point[] {
  const bruto = (stage as { route_track?: unknown }).route_track
  if (!Array.isArray(bruto)) return []
  const puntos: Point[] = []
  for (const entrada of bruto) {
    if (Array.isArray(entrada) && entrada.length >= 2) {
      const lat = Number(entrada[0])
      const lon = Number(entrada[1])
      if (Number.isFinite(lat) && Number.isFinite(lon)) puntos.push({ lat, lon })
      continue
    }
    if (entrada && typeof entrada === 'object') {
      const o = entrada as { lat?: unknown; lon?: unknown; lng?: unknown }
      const lat = Number(o.lat)
      const lon = Number(o.lon ?? o.lng)
      if (Number.isFinite(lat) && Number.isFinite(lon)) puntos.push({ lat, lon })
    }
  }
  return puntos
}

/**
 * Nodos MÁS el trazado real entre ellos.
 *
 * El corredor de teselas se traza alrededor de estos puntos. Con sólo
 * los nodos, el corredor iba en línea recta de uno a otro, y la ruta de
 * verdad -que da rodeos por caminos- se salía de él: al llegar a esos
 * tramos sin cobertura, el mapa se quedaba en blanco. Con los puntos del
 * trazado, el corredor sigue por donde se camina.
 *
 * Se muestrea cada pocos metros para no disparar el cálculo: el corredor
 * ya tiene dos kilómetros de ancho, no hace falta cada paso.
 */
function uniqueStagePoints(stages: PlayerStage[]) {
  const seen = new Set<string>()
  const points: Point[] = []
  const anadir = (lat: number, lon: number) => {
    const key = `${lat.toFixed(4)}:${lon.toFixed(4)}`
    if (seen.has(key)) return
    seen.add(key)
    points.push({ lat, lon })
  }

  for (const stage of stages || []) {
    if (typeof stage.lat !== 'number' || typeof stage.lon !== 'number') continue
    anadir(stage.lat, stage.lon)
    const track = puntosDelTrack(stage)
    const paso = Math.max(1, Math.floor(track.length / 40))
    for (let i = 0; i < track.length; i += paso) anadir(track[i].lat, track[i].lon)
  }

  return points
}

function routeCenter(points: Point[]): Point | null {
  if (points.length === 0) return null

  return {
    lat: points.reduce((sum, point) => sum + point.lat, 0) / points.length,
    lon: points.reduce((sum, point) => sum + point.lon, 0) / points.length,
  }
}

/**
 * Cuantas teselas se han quedado fuera del tope, y de que capa.
 *
 * Antes esto se descartaba en silencio. Como el detalle de los nodos se anade
 * el ultimo, es lo primero que se pierde, y el jugador se enteraba en el monte.
 */
let descartadasEnEstaVuelta = 0

function addTile(urls: Map<string, string>, zoom: number, x: number, y: number, priority: string) {
  if (urls.size >= MAX_TILE_URLS) {
    descartadasEnEstaVuelta += 1
    return
  }
  const url = tileUrl(zoom, x, y)
  if (!urls.has(url)) urls.set(url, priority)
}

function addSquareAroundPointWithBudget(
  urls: Map<string, string>,
  point: Point,
  zoom: number,
  radiusKm: number,
  maxTilesForZoom: number,
  priority: string
) {
  const center = latLonToTile(point.lat, point.lon, zoom)
  const tileMeters = Math.max(80, metersPerTile(point.lat, zoom))
  let radiusTiles = Math.max(0, Math.ceil((radiusKm * 1000) / tileMeters))

  while ((radiusTiles * 2 + 1) ** 2 > maxTilesForZoom && radiusTiles > 0) {
    radiusTiles -= 1
  }

  for (let dx = -radiusTiles; dx <= radiusTiles; dx += 1) {
    for (let dy = -radiusTiles; dy <= radiusTiles; dy += 1) {
      addTile(urls, zoom, center.x + dx, center.y + dy, priority)
    }
  }
}

function addBBoxTilesWithBudget(
  urls: Map<string, string>,
  points: Point[],
  zoom: number,
  paddingKm: number,
  maxTilesForZoom: number,
  priority: string
) {
  if (points.length === 0) return

  const avgLat = points.reduce((sum, point) => sum + point.lat, 0) / points.length
  let paddingMeters = paddingKm * 1000

  while (paddingMeters >= 500) {
    const latPad = paddingMeters / 111320
    const lonPad = paddingMeters / (111320 * Math.max(0.25, Math.cos((avgLat * Math.PI) / 180)))

    const minLat = Math.min(...points.map((point) => point.lat)) - latPad
    const maxLat = Math.max(...points.map((point) => point.lat)) + latPad
    const minLon = Math.min(...points.map((point) => point.lon)) - lonPad
    const maxLon = Math.max(...points.map((point) => point.lon)) + lonPad

    const nw = latLonToTile(maxLat, minLon, zoom)
    const se = latLonToTile(minLat, maxLon, zoom)

    const minX = Math.min(nw.x, se.x)
    const maxX = Math.max(nw.x, se.x)
    const minY = Math.min(nw.y, se.y)
    const maxY = Math.max(nw.y, se.y)

    const count = (maxX - minX + 1) * (maxY - minY + 1)

    if (count <= maxTilesForZoom) {
      for (let x = minX; x <= maxX; x += 1) {
        for (let y = minY; y <= maxY; y += 1) {
          addTile(urls, zoom, x, y, priority)
        }
      }
      return
    }

    paddingMeters *= 0.72
  }
}

/** Las teselas (x/y) de un zoom que tocan la caja de los puntos más `km` de margen. */
export function cajaDeTeselas(points: Point[], zoom: number, km: number) {
  const latMin = Math.min(...points.map((p) => p.lat))
  const latMax = Math.max(...points.map((p) => p.lat))
  const lonMin = Math.min(...points.map((p) => p.lon))
  const lonMax = Math.max(...points.map((p) => p.lon))
  const latPad = (km * 1000) / 111320
  const lonPad =
    (km * 1000) / (111320 * Math.max(0.25, Math.cos((((latMin + latMax) / 2) * Math.PI) / 180)))
  const nw = latLonToTile(latMax + latPad, lonMin - lonPad, zoom)
  const se = latLonToTile(latMin - latPad, lonMax + lonPad, zoom)
  return { minX: nw.x, maxX: se.x, minY: nw.y, maxY: se.y }
}

function routeSamples(points: Point[], stepMeters: number) {
  if (points.length <= 1) return points

  const samples: Point[] = [points[0]]

  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]
    const b = points[i + 1]
    const distance = getDistanceMeters(a, b)
    const steps = Math.max(1, Math.ceil(distance / stepMeters))

    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps
      samples.push({
        lat: a.lat + (b.lat - a.lat) * t,
        lon: a.lon + (b.lon - a.lon) * t,
      })
    }
  }

  return samples
}

function addRouteCorridor(
  urls: Map<string, string>,
  points: Point[],
  zoom: number,
  corridorKm: number,
  sampleStepMeters: number,
  maxNewTiles: number,
  priority: string
) {
  const before = urls.size

  for (const point of routeSamples(points, sampleStepMeters)) {
    if (urls.size - before >= maxNewTiles) return

    const tileMeters = Math.max(80, metersPerTile(point.lat, zoom))
    let radiusTiles = Math.max(0, Math.ceil((corridorKm * 1000) / tileMeters))

    while ((radiusTiles * 2 + 1) ** 2 > 49 && radiusTiles > 1) {
      radiusTiles -= 1
    }

    const center = latLonToTile(point.lat, point.lon, zoom)

    for (let dx = -radiusTiles; dx <= radiusTiles; dx += 1) {
      for (let dy = -radiusTiles; dy <= radiusTiles; dy += 1) {
        if (urls.size - before >= maxNewTiles) return
        addTile(urls, zoom, center.x + dx, center.y + dy, priority)
      }
    }
  }
}

/**
 * Lo que ya está guardado, en una sola lectura.
 *
 * Preguntar por cada tesela de una en una son mil y pico consultas al almacén
 * del navegador; pedir la lista entera es una.
 */
async function urlsYaGuardadas(cache: Cache): Promise<Set<string>> {
  try {
    const claves = await cache.keys()
    // Con la query: el relieve lleva su versión (`?v=`) y uno de otra versión no vale.
    return new Set(
      claves.map((peticion) => {
        const url = new URL(peticion.url)
        return url.pathname + url.search
      })
    )
  } catch {
    return new Set()
  }
}

/* ------------------------------------------------------------------ *
 * Teselas que el origen no tiene
 * ------------------------------------------------------------------ */

/**
 * Teselas que el origen NO tiene (404). Se apuntan para no pedirlas otra vez y
 * para no dar el mapa por incompleto eternamente: sin esto, un hueco que nunca se
 * va a llenar hacía saltar la pantalla de carga en cada arranque.
 */
const INEXISTENTES_KEY = 'saga:offline-map-tiles:inexistentes'
const MAX_INEXISTENTES = 1500

function leerInexistentes(): Set<string> {
  try {
    const bruto = window.localStorage.getItem(INEXISTENTES_KEY)
    const lista = bruto ? (JSON.parse(bruto) as unknown) : []
    return new Set(Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

function guardarInexistentes(conjunto: Set<string>): void {
  try {
    window.localStorage.setItem(
      INEXISTENTES_KEY,
      JSON.stringify(Array.from(conjunto).slice(-MAX_INEXISTENTES))
    )
  } catch {
    // Sin sitio se vuelven a pedir: molesta, no rompe nada.
  }
}

/* ------------------------------------------------------------------ *
 * Qué respuesta es una tesela de verdad
 * ------------------------------------------------------------------ */

/**
 * ¿Esta respuesta es una tesela guardable?
 *
 * Se guardaba lo que fuera: la descarga pedía con `no-cors`, una respuesta opaca
 * no dice su estado, y un 429 o un 502 del proxy quedaban como tesela buena para
 * siempre. Ahora tiene que ser un éxito, ser una imagen y traer bytes: si no, es
 * un hueco que se reintenta.
 */
export function respuestaDeTeselaValida(args: {
  ok: boolean
  status?: number
  tipo: string | null | undefined
  bytes?: number
}): boolean {
  if (!args.ok) return false
  if (args.status !== undefined && (args.status < 200 || args.status > 299)) return false
  if (args.bytes !== undefined && args.bytes <= 0) return false
  const tipo = String(args.tipo || '').toLowerCase()
  // Sin cabecera de tipo no se guarda a ciegas: el proxy siempre la manda. Una
  // imagen, o un binario sin más (algunos orígenes lo declaran así): nunca HTML
  // ni texto, que es lo que llega en una página de error.
  return tipo.startsWith('image/') || tipo.includes('octet-stream')
}

export interface ResultadoDeTeselas {
  /** Teselas que se guardaron en esta vuelta. */
  guardadasAhora: number
  /** Teselas del plan que quedaron en la caché (ya estaban o se guardaron). */
  enCache: number
  /** Las que siguen sin estar tras reintentar. */
  faltan: string[]
  /** Las del plan que el origen no tiene. */
  inexistentes: number
  /** El navegador dijo que no cabe más. */
  sinEspacio: boolean
}

interface OpcionesDeDescarga {
  cancelado?: () => boolean
}

const esperar = (ms: number) => new Promise<void>((resolver) => window.setTimeout(resolver, ms))

/**
 * Cuánto se espera a un lote antes de darlo por perdido: 0,75 s por tesela, entre
 * 30 s y 2 min (120 teselas → 90 s).
 *
 * Eran 30 s fijos. Con la caché de la Pi fría el IGN tarda ~3,7 s por tesela y un
 * lote de 120 tardaba casi un minuto: se daba por fallido, y sus 120 teselas se
 * volvían a pedir de una en una. En el iPhone del dueño, unas 1.800 sueltas.
 */
export function tiempoMaximoDelLote(teselas: number): number {
  return Math.min(120000, Math.max(30000, Math.round(teselas * 750)))
}

/**
 * Baja las teselas que faltan, las comprueba y reintenta los huecos.
 *
 * Tres vueltas como mucho: en lote la primera, de una en una la segunda (ahí se
 * ve el estado de cada una, y un 404 se apunta como «no existe»), y una tercera
 * tras una pausa para los fallos pasajeros. Lo que aun así falte se devuelve.
 */
async function fetchAndCacheUrls(
  urls: string[],
  onProgress?: (progress: OfflineMapTileProgress) => void,
  opciones: OpcionesDeDescarga = {}
): Promise<ResultadoDeTeselas> {
  if (!('caches' in window)) {
    return { guardadasAhora: 0, enCache: 0, faltan: urls, inexistentes: 0, sinEspacio: false }
  }

  const cache = await caches.open(TILE_CACHE_NAME)
  const inexistentes = leerInexistentes()
  const cancelado = opciones.cancelado ?? (() => false)

  /**
   * Lo que ya está en el móvil no se vuelve a pedir.
   *
   * Esta función pedía las mil quinientas teselas en cada arranque. No llegaban
   * a la red -el service worker las sirve de su caché-, pero el juego no se
   * abría hasta que terminaban: medido en sagagia.es con todo ya guardado, 22
   * segundos de pantalla de carga cada vez que se abre la aplicación.
   */
  const guardadas = await urlsYaGuardadas(cache)

  /**
   * La comprobación se ENSEÑA, tesela a tesela.
   *
   * Con el paquete ya completo, la barra pasaba unos segundos "calculando"
   * y saltaba de 0 a 100 de golpe: parecía que no se cargaba nada, o que
   * se cargaba mal. Lo que pasa de verdad es que las cuatro mil teselas ya
   * están en el móvil y sólo hay que comprobarlo; ahora esa comprobación
   * avanza en la barra con la cuenta real, cediendo el hilo cada bloque para
   * que la barra se pinte. Lo que falte se baja después, con su propia barra.
   */
  let faltan: string[] = []
  let inexistentesEnElPlan = 0
  const bloque = 150
  for (let i = 0; i < urls.length; i += bloque) {
    for (const url of urls.slice(i, i + bloque)) {
      if (guardadas.has(url)) continue
      if (inexistentes.has(url)) {
        inexistentesEnElPlan += 1
        continue
      }
      faltan.push(url)
    }
    const hechas = Math.min(urls.length, i + bloque)
    onProgress?.({
      label: 'Comprobando el mapa guardado',
      done: hechas,
      total: urls.length || 1,
      detail: `${hechas.toLocaleString('es')} de ${urls.length.toLocaleString('es')} teselas en el móvil`,
    })
    await esperar(0)
  }

  const yaEstaban = urls.length - faltan.length - inexistentesEnElPlan

  if (!faltan.length) {
    onProgress?.({
      label: 'Mapa listo',
      done: urls.length,
      total: urls.length || 1,
      detail: `Las ${yaEstaban.toLocaleString('es')} teselas ya están en este teléfono`,
    })
    return {
      guardadasAhora: 0,
      enCache: yaEstaban,
      faltan: [],
      inexistentes: inexistentesEnElPlan,
      sinEspacio: false,
    }
  }

  const faltanIniciales = faltan
  const totalPorBajar = faltan.length
  let resueltas = 0
  let procesadas = 0
  let sinEspacio = false
  const guardadasAhora = new Set<string>()
  const nuevasInexistentes: string[] = []
  let bytes = 0

  const avisar = () =>
    onProgress?.({
      label: 'Mapa offline',
      done: Math.min(resueltas, totalPorBajar),
      total: totalPorBajar,
      bytes,
      detail: `${Math.min(resueltas, totalPorBajar).toLocaleString('es')} de ${totalPorBajar.toLocaleString('es')} teselas`,
    })

  onProgress?.({
    label: 'Mapa offline',
    done: 0,
    total: totalPorBajar,
    detail: `Descargando ${totalPorBajar} teselas`,
  })

  /** Guarda una tesela ya comprobada. `false` si no cupo. */
  async function guardar(url: string, respuesta: Response): Promise<boolean> {
    try {
      await cache.put(new Request(url), respuesta)
      guardadasAhora.add(url)
      return true
    } catch (error) {
      // Sin sitio no se sigue: cada tesela que se intente será otro fallo igual.
      if (esErrorDeCuota(error)) sinEspacio = true
      return false
    }
  }

  /**
   * De una en una, con el estado de cada respuesta a la vista. Devuelve las que
   * siguen sin guardar por un fallo que puede pasar (red, 429, 5xx).
   */
  async function unaAUna(lista: string[]): Promise<string[]> {
    const siguenFaltando: string[] = []
    let siguiente = 0

    const trabajador = async () => {
      while (siguiente < lista.length && !sinEspacio && !cancelado()) {
        const url = lista[siguiente]
        siguiente += 1
        let resuelta = false
        try {
          const respuesta = await fetchConLimite(url, { method: 'GET', cache: 'reload' }, 15000)
          if (respuesta.status === 404) {
            nuevasInexistentes.push(url)
            inexistentes.add(url)
            resuelta = true
          } else if (
            respuestaDeTeselaValida({
              ok: respuesta.ok,
              status: respuesta.status,
              tipo: respuesta.headers.get('content-type'),
            })
          ) {
            const largo = Number(respuesta.headers.get('content-length')) || 0
            resuelta = await guardar(url, respuesta)
            if (resuelta) bytes += largo
          }
        } catch {
          // Sin red en este momento: se cuenta como hueco y se reintenta.
        }

        if (resuelta) {
          resueltas += 1
        } else {
          siguenFaltando.push(url)
        }
        procesadas += 1
        if (procesadas % 5 === 0) {
          avisar()
          await esperar(0)
        }
      }
    }

    await Promise.all(Array.from({ length: 6 }, () => trabajador()))
    return siguenFaltando
  }

  /**
   * Un lote: hasta 120 teselas en una sola petición (ver /api/teselas/lote
   * en el servidor). Cada tesela suelta tardaba ~0,7 s en ir y volver por
   * el túnel; medido en un móvil nuevo, más de 20 minutos de primera carga
   * para 3.000 teselas. Devuelve `null` si el lote no sirve (servidor viejo,
   * fallo) y hay que ir de una en una; si no, las teselas que no salieron.
   */
  async function unLote(lista: string[]): Promise<string[] | null> {
    let respuesta: Response
    try {
      respuesta = await fetchConLimite(
        '/api/teselas/lote',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teselas: lista }),
        },
        tiempoMaximoDelLote(lista.length)
      )
    } catch {
      return null
    }
    if (!respuesta.ok) return null

    const buffer = await respuesta.arrayBuffer()
    const vista = new DataView(buffer)
    const texto = new TextDecoder()
    if (buffer.byteLength < 8 || texto.decode(new Uint8Array(buffer, 0, 4)) !== 'SAGT') return null

    const cuantas = vista.getUint32(4, true)
    const guardadasEnElLote = new Set<string>()
    let o = 8
    for (let n = 0; n < cuantas; n += 1) {
      const largoRuta = vista.getUint16(o, true)
      const ruta = texto.decode(new Uint8Array(buffer, o + 2, largoRuta))
      o += 2 + largoRuta
      const largoTipo = vista.getUint16(o, true)
      const tipo = texto.decode(new Uint8Array(buffer, o + 2, largoTipo))
      o += 2 + largoTipo
      const largo = vista.getUint32(o, true)
      o += 4

      if (largo > 0 && respuestaDeTeselaValida({ ok: true, tipo: tipo || 'image/png', bytes: largo })) {
        const guardada = await guardar(
          ruta,
          new Response(buffer.slice(o, o + largo), {
            headers: { 'Content-Type': tipo || 'image/png', 'Cache-Control': 'public, max-age=86400' },
          })
        )
        if (guardada) {
          guardadasEnElLote.add(ruta)
          resueltas += 1
          bytes += largo
        }
      }
      o += largo
    }
    avisar()
    return lista.filter((url) => !guardadasEnElLote.has(url))
  }

  // Vuelta 1: en lote, tres a la vez (la Pi pide lo que no tiene en disco de 8 en 8).
  const LOTE = 120
  const lotes: string[][] = []
  for (let i = 0; i < faltan.length; i += LOTE) lotes.push(faltan.slice(i, i + LOTE))

  const sinSalir: string[] = []
  let siguienteLote = 0
  const trabajadorDeLotes = async () => {
    while (siguienteLote < lotes.length && !sinEspacio && !cancelado()) {
      const lote = lotes[siguienteLote]
      siguienteLote += 1
      const restantes = await unLote(lote)
      // Una tesela que el lote no devolvió puede no existir o haber fallado:
      // la segunda vuelta, una a una, lo distingue.
      sinSalir.push(...(restantes === null ? lote : restantes))
    }
  }
  await Promise.all(Array.from({ length: 3 }, () => trabajadorDeLotes()))

  // Vueltas 2 y 3: una a una. Las que fallan por algo pasajero se reintentan
  // tras una pausa; un 404 se apunta y no se vuelve a pedir.
  faltan = sinSalir
  for (let vuelta = 0; vuelta < 2 && faltan.length && !sinEspacio && !cancelado(); vuelta += 1) {
    if (vuelta > 0) await esperar(1500)
    faltan = await unaAUna(faltan)
  }

  if (nuevasInexistentes.length) guardarInexistentes(inexistentes)
  avisar()

  // Lo que no está guardado ni es «no existe» falta, también si se cortó a medias.
  const pendientes = faltanIniciales.filter(
    (url) => !guardadasAhora.has(url) && !inexistentes.has(url)
  )

  return {
    guardadasAhora: guardadasAhora.size,
    enCache: yaEstaban + guardadasAhora.size,
    faltan: pendientes,
    inexistentes: inexistentesEnElPlan + nuevasInexistentes.length,
    sinEspacio,
  }
}

/**
 * Quita del móvil el relieve que ya no está en el plan: el de otra versión del
 * mapa 3D (el panel lo rehízo) y el de la comarca lejana que ya no se baja.
 *
 * Sólo con el relieve del plan ENTERO ya guardado: si se quitase antes, un corte
 * a medias dejaría la zona sin relieve viejo ni nuevo, y sin cobertura el monte
 * saldría plano. Las teselas de imagen no se tocan.
 */
async function podarRelieveViejo(planUrls: string[]): Promise<number> {
  if (typeof caches === 'undefined') return 0
  const enElPlan = new Set(planUrls)
  let quitadas = 0
  try {
    const cache = await caches.open(TILE_CACHE_NAME)
    for (const peticion of await cache.keys()) {
      const url = new URL(peticion.url)
      if (!url.pathname.startsWith('/dem-tiles/')) continue
      if (enElPlan.has(url.pathname + url.search)) continue
      if (await cache.delete(peticion).catch(() => false)) quitadas += 1
    }
  } catch {
    // Ocupa, pero no deja a nadie sin mapa.
  }
  return quitadas
}

export function getOfflineMapTileSummary(): OfflineMapTileSummary | null {
  try {
    const raw = window.localStorage.getItem(TILE_SUMMARY_KEY)
    if (!raw) return null
    const resumen = JSON.parse(raw) as OfflineMapTileSummary
    // Un resumen de otro plan no cuenta: hay que volver a bajar lo que falte.
    if (resumen.firma !== firmaDelPlan()) return null
    return resumen
  } catch {
    return null
  }
}

function guardarResumen(summary: OfflineMapTileSummary): void {
  try {
    window.localStorage.setItem(TILE_SUMMARY_KEY, JSON.stringify(summary))
  } catch {
    // best effort
  }
}

/* ------------------------------------------------------------------ *
 * La red de caminos
 * ------------------------------------------------------------------ */

const URL_RED_DE_CAMINOS = '/api/road-graph'

/**
 * La versión de la red de caminos que tiene ahora el servidor (`road_graph_version`
 * de /api/config). Si el panel la reconstruye sin mover la ruta, la copia guardada
 * deja de valer: sin esto el móvil la conservaba para siempre.
 */
let versionRedEsperada: string | null = null

export function fijarVersionDeRedDeCaminos(version: string | null | undefined): void {
  versionRedEsperada = version ? String(version) : null
}

/** ¿Está la red de caminos en la caché del móvil, y es la versión de ahora? */
export async function redDeCaminosGuardada(): Promise<boolean> {
  if (typeof caches === 'undefined') return false
  try {
    const cache = await caches.open(ROAD_GRAPH_CACHE)
    const copia = await cache.match(URL_RED_DE_CAMINOS, { ignoreSearch: true })
    if (!copia) return false
    if (!versionRedEsperada) return true
    return copia.headers.get('x-road-graph-version') === versionRedEsperada
  } catch {
    return false
  }
}

/**
 * ¿Tiene el servidor una red de caminos? Pide la ruta y corta en cuanto llegan
 * las cabeceras: no se baja el fichero (7-21 MB) sólo para saber si existe.
 */
async function servidorTieneRedDeCaminos(): Promise<boolean> {
  const control = new AbortController()
  // Con la cobertura del monte una petición puede quedarse colgada: esto se
  // pregunta en la comprobación de la entrada, así que tiene su límite.
  const limite = window.setTimeout(() => control.abort(), 4000)
  try {
    const respuesta = await fetch(URL_RED_DE_CAMINOS, { cache: 'no-store', signal: control.signal })
    return respuesta.ok
  } catch {
    return false
  } finally {
    window.clearTimeout(limite)
    control.abort()
  }
}

/**
 * Baja la red de caminos y la GUARDA ella misma.
 *
 * Antes dependía de que el service worker ya estuviera al mando para que la
 * guardase: en la primera visita no lo estaba, y la red se «bajaba» sin
 * quedarse. Ahora la guarda esta función, con o sin worker. `forzar` tira la
 * copia que hubiera y vuelve a bajarla (la ruta cambió o se reconstruyó en el
 * panel).
 */
async function descargarRedDeCaminos(
  onProgress?: (progress: OfflineMapTileProgress) => void,
  opciones: { forzar?: boolean } = {}
): Promise<EstadoDelGrafo> {
  if (typeof caches === 'undefined') return 'error'

  try {
    const cache = await caches.open(ROAD_GRAPH_CACHE)

    if (!opciones.forzar && (await redDeCaminosGuardada())) return 'ok'
    // Forzada, o la copia es de otra versión: fuera antes de bajar la nueva.
    await cache.delete(URL_RED_DE_CAMINOS, { ignoreSearch: true }).catch(() => false)

    onProgress?.({ label: 'Red de caminos', done: 0, total: 0, detail: 'Red de caminos para la guía…' })

    const respuesta = await fetchConLimite(URL_RED_DE_CAMINOS, { cache: 'reload' }, 30000)
    // Sin red construida en el servidor: la guía va recta, y no es un fallo.
    if (respuesta.status === 404) return 'no_disponible'
    if (!respuesta.ok || !respuesta.body) return 'error'
    if (!/json/i.test(respuesta.headers.get('content-type') || '')) return 'error'

    const paraGuardar = respuesta.clone()
    const lector = respuesta.body.getReader()
    let bytes = 0
    let avisados = 0
    for (;;) {
      const { done, value } = await lector.read()
      if (done) break
      bytes += value.byteLength
      if (bytes - avisados > 512 * 1024) {
        avisados = bytes
        const mb = (bytes / 1048576).toFixed(1).replace('.', ',')
        onProgress?.({ label: 'Red de caminos', done: 0, total: 0, detail: `Red de caminos · ${mb} MB` })
      }
    }

    await cache.put(URL_RED_DE_CAMINOS, paraGuardar)
    return 'ok'
  } catch (error) {
    // Sin sitio o sin red: no es «no disponible», es un fallo que se verá.
    if (esErrorDeCuota(error)) throw error
    return 'error'
  }
}

/* ------------------------------------------------------------------ *
 * Los edificios del Catastro (mapa 3D)
 * ------------------------------------------------------------------ */

const URL_EDIFICIOS = '/api/edificios'

/** La URL de los edificios con la versión del mapa 3D: es la que pide el mapa. */
export function urlDeEdificios(): string {
  return URL_EDIFICIOS + sufijoDelMapa3d()
}

/** ¿Están los edificios de la zona en la caché del mapa, y son de esta versión? */
export async function edificiosGuardados(): Promise<boolean> {
  if (typeof caches === 'undefined') return false
  try {
    const cache = await caches.open(TILE_CACHE_NAME)
    return Boolean(await cache.match(urlDeEdificios()))
  } catch {
    return false
  }
}

/**
 * Baja los edificios (un GeoJSON de ~0,2-1 MB comprimido) y los guarda en la
 * caché del mapa, donde el service worker los busca sin cobertura. Se vuelven a
 * bajar siempre que hay red: el panel puede haber preparado la zona otra vez.
 * Sin preparar, el servidor da una colección vacía y también vale.
 */
async function descargarEdificios(
  onProgress?: (progress: OfflineMapTileProgress) => void
): Promise<boolean> {
  if (typeof caches === 'undefined') return false
  try {
    onProgress?.({
      label: 'Edificios',
      done: 0,
      total: 0,
      detail: 'Casas del Catastro para el mapa 3D…',
    })
    const url = urlDeEdificios()
    const respuesta = await fetchConLimite(url, { cache: 'reload' }, 30000)
    if (!respuesta.ok || !/json/i.test(respuesta.headers.get('content-type') || '')) {
      return edificiosGuardados()
    }
    const cache = await caches.open(TILE_CACHE_NAME)
    await cache.put(url, respuesta)
    // Las de otra versión ya no las pide nadie: fuera (pesan hasta 1 MB).
    for (const peticion of await cache.keys()) {
      const guardada = new URL(peticion.url)
      if (guardada.pathname === URL_EDIFICIOS && guardada.pathname + guardada.search !== url) {
        await cache.delete(peticion).catch(() => false)
      }
    }
    return true
  } catch (error) {
    if (esErrorDeCuota(error)) throw error
    return edificiosGuardados()
  }
}

/* ------------------------------------------------------------------ *
 * El plan de teselas
 * ------------------------------------------------------------------ */

export interface PlanDeTeselas {
  /** Las teselas, en orden de prioridad y ya con el tope aplicado. */
  urls: string[]
  /** Cuántas quedaron fuera del tope. */
  descartadas: number
  detalleDeNodos: number
  /** Puntos de la ruta con los que se hizo el plan (nodos + trazado). */
  puntos: number
  /** Firma de la ruta: cambia si se mueve o se añade un nodo. */
  firmaRuta: string
}

/**
 * Qué teselas necesita una ruta. Puro: no toca red ni almacén, y por eso sirve
 * para COMPROBAR si el mapa guardado vale antes de decidir si hay que bajar algo.
 */
export function planificarTeselas(stages: PlayerStage[]): PlanDeTeselas {
  descartadasEnEstaVuelta = 0

  const routePoints = uniqueStagePoints(stages)
  const urls = new Map<string, string>()
  const center = routeCenter(routePoints)

  if (routePoints.length > 0 && center) {
    /**
     * Calidad por distancia, en cuatro niveles alrededor de la ruta.
     *
     * La idea es la de cualquier mapa que se lleva al monte: el continente
     * en calidad general, el país algo mejor, la región mejor, y la máxima
     * sólo donde se camina. Al desampliar sin cobertura nunca aparece un
     * hueco: siempre hay una tesela de algún nivel debajo.
     *
     * Alcances medidos para una ruta en Galicia (lat 42), cuadrados
     * centrados en la ruta:
     *   continente  z3-z5   ±1850..3700 km   43 teselas
     *   país        z6-z7   ±700..925 km     74 teselas
     *   región      z8-z9   ±290..460 km    202 teselas
     *   comarca     z10-z11 ±115..175 km    458 teselas
     * Total ~780 teselas, unos 23 MB de imagen. El presupuesto de cada
     * zoom es lo que fija el lado del cuadrado; el radio en km es el
     * máximo que se pide, por si algún día la ruta cae en otra latitud.
     */
    for (const [zoom, radioKm, presupuesto, etiqueta] of NIVELES) {
      addSquareAroundPointWithBudget(urls, center, zoom, radioKm, presupuesto, etiqueta)
    }

    // Zona amplia de misión.
    addBBoxTilesWithBudget(urls, routePoints, 12, MISSION_AREA_RADIUS_KM, 200, 'mission-z12')
    addBBoxTilesWithBudget(urls, routePoints, 13, MISSION_AREA_RADIUS_KM, 260, 'mission-z13')
    addBBoxTilesWithBudget(
      urls,
      routePoints,
      14,
      Math.min(MISSION_AREA_RADIUS_KM, 25),
      280,
      'mission-z14'
    )

    // Zona de misión también a z15 y z16, con menos margen: es lo que el
    // mapa pide al desampliar hasta ver todos los nodos (ver FIRMA, plan 3).
    addBBoxTilesWithBudget(urls, routePoints, 15, Math.min(MISSION_AREA_RADIUS_KM, 3), 360, 'mission-z15')
    addBBoxTilesWithBudget(urls, routePoints, 16, Math.min(MISSION_AREA_RADIUS_KM, 1.8), 560, 'mission-z16')

    // Corredor ancho, no línea fina.
    addRouteCorridor(urls, routePoints, 15, ROUTE_CORRIDOR_KM, 1600, 280, 'corridor-z15')
    addRouteCorridor(
      urls,
      routePoints,
      16,
      Math.min(ROUTE_CORRIDOR_KM, 4),
      1100,
      340,
      'corridor-z16'
    )
    addRouteCorridor(
      urls,
      routePoints,
      17,
      Math.min(ROUTE_CORRIDOR_KM, 2.2),
      850,
      340,
      'corridor-z17'
    )

    /**
     * Relieve: las gemelas de lo que ya se va a bajar.
     *
     * DESPUÉS del corredor, no antes: este bucle recorre lo que ya está
     * en la lista, y puesto antes del corredor no veía las teselas de
     * z15 -las que el terreno pide al caminar- y se quedaban sin gemela.
     *
     * Sin esto, el mapa 3D pide la elevación al entrar -y eso es
     * exactamente la tardanza que se notaba en el móvil-. Se hace aquí,
     * en la pantalla de carga, donde ya se está esperando a propósito.
     */
    const cajasLejanas = new Map(
      Object.entries(RELIEVE_LEJANO_KM).map(
        ([z, km]) => [Number(z), cajaDeTeselas(routePoints, Number(z), km)] as const
      )
    )
    for (const clave of Array.from(urls.keys())) {
      const trozos = /^\/map-tiles\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(clave)
      if (!trozos) continue
      const z = Number(trozos[1])
      if (!ZOOMS_RELIEVE.includes(z)) continue
      /**
       * Relieve para región, comarca, zona de misión y corredor: todo lo
       * que va de z8 hacia arriba. Continente y país (z3-z7) quedan sin
       * relieve, que a ese zoom no se lee y la fuente tampoco lo sirve
       * por debajo de z8.
       *
       * Son unos 50 MB más de paquete. Se decidió a propósito: el enlace
       * se da días antes de la salida y cada jugador entra en casa, con
       * wifi, a bajar todo; la cortina de cuenta atrás bloquea jugar hasta
       * la hora. A cambio, el monte es el mismo con o sin cobertura desde
       * la vista de toda Galicia hasta el camino.
       */
      const etiqueta = urls.get(clave) || ''
      // z12 entra también desde el nivel "entorno" (que ya la pone antes que
      // la zona de misión): es la que usa la forma del terreno.
      const esEntornoZ12 = z === 12 && etiqueta.startsWith('nivel-entorno')
      if (!esEntornoZ12 && !/^(mission|corridor|nivel-comarca)/.test(etiqueta)) continue
      const x = Number(trozos[2])
      const y = Number(trozos[3])
      // z11-z12 sólo cerca de la ruta (ver RELIEVE_LEJANO_KM).
      const caja = cajasLejanas.get(z)
      if (caja && (x < caja.minX || x > caja.maxX || y < caja.minY || y > caja.maxY)) continue
      const urlRelieve = demTileUrl(z, x, y)
      if (!urls.has(urlRelieve)) urls.set(urlRelieve, `relieve-z${z}`)
    }

    // Detalle alto solo cerca de nodos: z18 y, pegado al nodo, z19, que
    // es lo que el mapa pide con el jugador encima.
    for (const point of routePoints) {
      addSquareAroundPointWithBudget(urls, point, 18, NODE_DETAIL_RADIUS_KM, 25, 'node-z18')
      addSquareAroundPointWithBudget(urls, point, 19, Math.min(NODE_DETAIL_RADIUS_KM, 0.15), 36, 'node-z19')
    }
  }

  const ordenadas = Array.from(urls.keys()).slice(0, MAX_TILE_URLS)
  const detalleDeNodos = Array.from(urls.values()).filter((p) => p === 'node-z18').length

  return {
    urls: ordenadas,
    descartadas: descartadasEnEstaVuelta,
    detalleDeNodos,
    puntos: routePoints.length,
    firmaRuta: firmaDePuntos(routePoints),
  }
}

/* ------------------------------------------------------------------ *
 * La comprobación: ¿el mapa del móvil vale para ESTA ruta?
 * ------------------------------------------------------------------ */

export interface ComprobacionDeMapa {
  evaluacion: EvaluacionDeMapa
  /** Teselas que faltan de verdad (`null` = no hizo falta contarlas). */
  faltan: number | null
  grafo: 'ok' | 'falta' | 'no_disponible'
  /** Sin nodos con coordenadas no hay mapa que guardar. */
  sinRuta: boolean
  /** Ya estaba todo aunque la ruta cambiase: sólo se actualizó el resumen. */
  actualizadoSinBajar: boolean
}

/** Cada cuánto se vuelve a mirar si el servidor ya tiene red de caminos. */
const REPASO_DEL_GRAFO_MS = 6 * 60 * 60 * 1000

/**
 * ¿El mapa guardado está entero y es de esta ruta?
 *
 * El arranque sólo miraba si el resumen decía «98 % guardado», sin mirar de qué
 * ruta: un nodo movido o añadido dejaba el mapa viejo dando por bueno. Aquí se
 * compara la firma de la ruta y, si el resumen dice que todo está, se comprueban
 * unas cuantas teselas de verdad — el navegador puede vaciar la caché sin avisar.
 *
 * Si algo no cuadra se cuentan las que faltan de verdad: cambiar la ruta un poco
 * suele dejarla cubierta por teselas que ya están, y en ese caso no hay nada que
 * bajar (se actualiza el resumen y no se molesta al jugador).
 */
export async function comprobarMapaGuardado(
  stages: PlayerStage[],
  opciones: { sinRed?: boolean } = {}
): Promise<ComprobacionDeMapa> {
  const plan = planificarTeselas(stages)

  if (plan.puntos === 0) {
    return {
      evaluacion: { estado: 'ok', motivo: null },
      faltan: 0,
      grafo: 'ok',
      sinRuta: true,
      actualizadoSinBajar: false,
    }
  }

  const resumen = getOfflineMapTileSummary()
  const inexistentes = leerInexistentes()
  let evaluacion = evaluarMapaPorResumen({ resumen, firmaRutaActual: plan.firmaRuta })

  const grafoGuardado = await redDeCaminosGuardada()
  let grafo: ComprobacionDeMapa['grafo'] = grafoGuardado ? 'ok' : 'falta'

  if (!grafoGuardado) {
    // Sin red de caminos guardada: ¿es que el servidor no tiene ninguna? Se
    // mira, pero sin una petición en cada arranque: si ya se vio que no había,
    // se vuelve a mirar de vez en cuando por si se construyó después.
    const sinRed =
      Boolean(opciones.sinRed) || (typeof navigator !== 'undefined' && navigator.onLine === false)
    const ultima = Date.parse(resumen?.grafo_comprobado_en || '')
    const reciente = Number.isFinite(ultima) && Date.now() - ultima < REPASO_DEL_GRAFO_MS

    if (resumen?.grafo === 'no_disponible' && (reciente || sinRed)) {
      grafo = 'no_disponible'
    } else if (!sinRed) {
      if (await servidorTieneRedDeCaminos()) {
        grafo = 'falta'
      } else {
        grafo = 'no_disponible'
        if (resumen) guardarResumen({ ...resumen, grafo: 'no_disponible', grafo_comprobado_en: new Date().toISOString() })
      }
    }
  }

  // El resumen dice que está todo: se comprueba de verdad con una muestra.
  if (evaluacion.estado === 'ok' && 'caches' in window) {
    try {
      const cache = await caches.open(TILE_CACHE_NAME)
      const muestra = muestraDeTeselas(plan.urls.filter((url) => !inexistentes.has(url)))
      for (const url of muestra) {
        if (!(await cache.match(url))) {
          evaluacion = { estado: 'incompleto', motivo: 'incompleto' }
          break
        }
      }
    } catch {
      evaluacion = { estado: 'incompleto', motivo: 'incompleto' }
    }
  }

  if (evaluacion.estado === 'ok' && !(await edificiosGuardados())) {
    evaluacion = { estado: 'incompleto', motivo: 'incompleto' }
  }

  if (evaluacion.estado === 'ok') {
    return {
      evaluacion: grafo === 'falta' ? { estado: 'incompleto', motivo: 'incompleto' } : evaluacion,
      faltan: null,
      grafo,
      sinRuta: false,
      actualizadoSinBajar: false,
    }
  }

  // Algo no cuadra: se cuentan las que faltan de verdad.
  let faltan = plan.urls.length
  if ('caches' in window) {
    try {
      const cache = await caches.open(TILE_CACHE_NAME)
      const guardadas = await urlsYaGuardadas(cache)
      faltan = plan.urls.filter((url) => !guardadas.has(url) && !inexistentes.has(url)).length
    } catch {
      faltan = plan.urls.length
    }
  }

  if (faltan === 0 && grafo !== 'falta' && (await edificiosGuardados())) {
    // Ya estaba todo: la ruta cambió pero las teselas ya la cubrían.
    const enCache = plan.urls.filter((url) => !inexistentes.has(url)).length
    guardarResumen({
      firma: firmaDelPlan(),
      firma_ruta: plan.firmaRuta,
      completo: true,
      faltan: 0,
      inexistentes: plan.urls.length - enCache,
      grafo: grafo === 'no_disponible' ? 'no_disponible' : 'ok',
      grafo_comprobado_en: new Date().toISOString(),
      cached_at: resumen?.cached_at || new Date().toISOString(),
      requested: plan.urls.length,
      saved: enCache,
      zooms: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
      recortado: plan.descartadas > 0,
      descartadas: plan.descartadas,
      detalle_de_nodos: plan.detalleDeNodos,
      route_points: plan.puntos,
      regional_radius_km: REGIONAL_RADIUS_KM,
      mission_area_radius_km: MISSION_AREA_RADIUS_KM,
      route_corridor_km: ROUTE_CORRIDOR_KM,
      node_detail_radius_km: NODE_DETAIL_RADIUS_KM,
    })
    return {
      evaluacion: { estado: 'ok', motivo: null },
      faltan: 0,
      grafo,
      sinRuta: false,
      actualizadoSinBajar: true,
    }
  }

  return { evaluacion, faltan, grafo, sinRuta: false, actualizadoSinBajar: false }
}

/**
 * Baja el mapa de la ruta y deja el resumen de cómo quedó.
 *
 * `forzarGrafo` tira la red de caminos guardada y la baja otra vez: se usa
 * cuando la ruta cambió o el jugador pide volver a bajar el mapa.
 */
export async function prefetchMissionMapTiles(
  stages: PlayerStage[],
  onProgress?: (progress: OfflineMapTileProgress) => void,
  opciones: { redDeCaminos?: boolean; forzarGrafo?: boolean; cancelado?: () => boolean } = {}
): Promise<OfflineMapTileSummary> {
  onProgress?.({
    label: 'Abriendo el mapa guardado',
    done: 0,
    total: 100,
    detail: 'Continente · país · región · zona de misión · corredor · nodos',
  })

  const plan = planificarTeselas(stages)
  const resultado = await fetchAndCacheUrls(plan.urls, onProgress, { cancelado: opciones.cancelado })

  /**
   * La red de caminos, DESPUÉS de las teselas y como fase propia. Así la
   * primera vez que se juega ya está guardada, y el mapa no tiene que bajar
   * 21 MB mientras pinta: eso dejaba el trazado y las fotos para después. No va
   * en la lista de teselas (la barra cuenta teselas y se quedaba "esperando
   * una tesela" durante minutos) ni lleva porcentaje: comprimida no se sabe
   * cuánto ocupa.
   */
  let grafo: EstadoDelGrafo = 'ok'
  let sinEspacio = resultado.sinEspacio
  if (opciones.redDeCaminos !== false && !sinEspacio && !(opciones.cancelado?.() ?? false)) {
    try {
      grafo = opciones.forzarGrafo
        ? await descargarRedDeCaminos(onProgress, { forzar: true })
        : await descargarRedDeCaminos(onProgress)
    } catch {
      grafo = 'error'
      sinEspacio = true
    }
  } else if (opciones.redDeCaminos !== false && !(await redDeCaminosGuardada())) {
    grafo = 'error'
  }

  // Los edificios, también en la pantalla de carga (nunca mientras se juega).
  let edificios = true
  if (!sinEspacio && !(opciones.cancelado?.() ?? false)) {
    try {
      edificios = await descargarEdificios(onProgress)
    } catch {
      edificios = false
      sinEspacio = true
    }
  } else {
    edificios = await edificiosGuardados()
  }

  const completo = resultado.faltan.length === 0 && grafo !== 'error' && !sinEspacio && edificios

  if (resultado.faltan.length === 0 && !resultado.sinEspacio) await podarRelieveViejo(plan.urls)

  const summary: OfflineMapTileSummary = {
    firma: firmaDelPlan(),
    firma_ruta: plan.firmaRuta,
    completo,
    faltan: resultado.faltan.length,
    inexistentes: resultado.inexistentes,
    grafo,
    grafo_comprobado_en: new Date().toISOString(),
    sin_espacio: sinEspacio || undefined,
    cached_at: new Date().toISOString(),
    requested: plan.urls.length,
    // Lo que hay guardado de esta ruta, no lo que se ha bajado en esta vuelta:
    // el panel de "antes de salir" tiene que decir si el mapa está o no está, y
    // saltarse las que ya estaban no puede parecer que se han perdido.
    saved: resultado.enCache,
    zooms: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
    recortado: plan.descartadas > 0,
    descartadas: plan.descartadas,
    detalle_de_nodos: plan.detalleDeNodos,
    route_points: plan.puntos,
    regional_radius_km: REGIONAL_RADIUS_KM,
    mission_area_radius_km: MISSION_AREA_RADIUS_KM,
    route_corridor_km: ROUTE_CORRIDOR_KM,
    node_detail_radius_km: NODE_DETAIL_RADIUS_KM,
  }

  guardarResumen(summary)

  // No se anuncia "listo" sin mirar si se corto: prometer un mapa completo
  // que no lo esta es peor que decir que falta detalle.
  const etiquetaFinal =
    summary.recortado ? 'Mapa guardado, sin todo el detalle'
    : completo ? 'Mapa listo'
    : sinEspacio ? 'Sin espacio para el mapa'
    : 'Mapa incompleto'

  onProgress?.({
    label: etiquetaFinal,
    done: plan.urls.length,
    total: plan.urls.length || 1,
    detail: summary.recortado
      ? `${summary.saved} teselas guardadas; ${summary.descartadas} no caben en esta ruta`
      : completo
        ? `${summary.saved}/${plan.urls.length} teselas guardadas`
        : `Faltan ${resultado.faltan.length} teselas${grafo === 'error' ? ' y la red de caminos' : ''}${edificios ? '' : ' y los edificios'}`,
  })

  return summary
}
