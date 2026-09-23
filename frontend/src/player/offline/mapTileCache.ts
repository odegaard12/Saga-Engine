import type { PlayerStage } from '../../types/player'

// Tiene que ser exactamente el mismo nombre que usa frontend/public/sw.js.
// El service worker borra al activarse cualquier caché 'saga-route-tile-coverage-*'
// que no sea la suya, así que si aquí se guarda en otra, la descarga del mapa
// se pierde en el siguiente arranque y el jugador se queda sin mapa offline
// creyendo que lo tiene.
const TILE_CACHE_NAME = 'saga-route-tile-coverage-v3.9.6'
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
  [8, 400, 81, 'nivel-region-z8'],
  [9, 260, 121, 'nivel-region-z9'],
  [10, 180, 169, 'nivel-comarca-z10'],
  [11, 110, 289, 'nivel-comarca-z11'],
  [12, 60, 289, 'nivel-entorno-z12'],
]

const REGIONAL_RADIUS_KM = 30 // contexto amplio, zoom bajo
const MISSION_AREA_RADIUS_KM = 10 // zona jugable amplia, zoom medio
const ROUTE_CORRIDOR_KM = 2 // ancho alrededor de la ruta
const NODE_DETAIL_RADIUS_KM = 0.5 // detalle alto alrededor de nodos

export type OfflineMapTileProgress = {
  label: string
  done: number
  total: number
  detail?: string
}

export type OfflineMapTileSummary = {
  /** Firma del plan con el que se hizo. Si no coincide con la actual, no vale. */
  firma?: string
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
  return `/dem-tiles/${zoom}/${wrappedX}/${clampedY}.png`
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
  plan: 4,
})

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
    return new Set(claves.map((peticion) => new URL(peticion.url).pathname))
  } catch {
    return new Set()
  }
}

async function fetchAndCacheUrls(
  urls: string[],
  onProgress?: (progress: OfflineMapTileProgress) => void
) {
  if (!('caches' in window)) return 0

  const cache = await caches.open(TILE_CACHE_NAME)

  /**
   * Lo que ya está en el móvil no se vuelve a pedir.
   *
   * Esta función pedía las mil quinientas teselas en cada arranque. No llegaban
   * a la red -el service worker las sirve de su caché-, pero el juego no se
   * abría hasta que terminaban: medido en sagagia.es con todo ya guardado, 22
   * segundos de pantalla de carga cada vez que se abre la aplicación, con el
   * cartel de "Primera vez: se guarda el mapa" puesto siempre.
   */
  const guardadas = await urlsYaGuardadas(cache)

  /**
   * La comprobación se ENSEÑA, tesela a tesela.
   *
   * Con el paquete ya completo, la barra pasaba unos segundos "calculando"
   * y saltaba de 0 a 100 de golpe: parecía que no se cargaba nada, o que
   * se cargaba mal. Lo que pasa de verdad es que las cuatro mil teselas ya
   * están en el móvil y sólo hay que comprobarlo; ahora esa comprobación
   * avanza en la barra con la cuenta real -"3.120 de 4.312 teselas en el
   * móvil"-, cediendo el hilo cada bloque para que la barra se pinte. Dura
   * un segundo largo y se ve lo que ocurre. Lo que falte se baja después,
   * con su propia barra.
   */
  const faltan: string[] = []
  const bloque = 150
  for (let i = 0; i < urls.length; i += bloque) {
    for (const url of urls.slice(i, i + bloque)) {
      if (!guardadas.has(url)) faltan.push(url)
    }
    const hechas = Math.min(urls.length, i + bloque)
    onProgress?.({
      label: 'Comprobando el mapa guardado',
      done: hechas,
      total: urls.length || 1,
      detail: `${hechas.toLocaleString('es')} de ${urls.length.toLocaleString('es')} teselas en el móvil`,
    })
    await new Promise((resolver) => window.setTimeout(resolver, 0))
  }

  if (!faltan.length) {
    onProgress?.({
      label: 'Mapa listo',
      done: urls.length,
      total: urls.length || 1,
      detail: `Las ${urls.length.toLocaleString('es')} teselas ya están en este teléfono`,
    })
    return 0
  }

  let saved = 0
  let completed = 0
  let index = 0
  const workers = 6

  onProgress?.({
    label: 'Mapa offline',
    done: 0,
    total: faltan.length,
    detail: `Descargando ${faltan.length} teselas`,
  })

  async function worker() {
    while (index < faltan.length) {
      const url = faltan[index]
      index += 1

      try {
        const request = new Request(url, {
          method: 'GET',
          mode: 'no-cors',
          cache: 'reload',
        })

        const response = await fetch(request)
        await cache.put(request, response.clone())
        saved += 1
      } catch {
        // Best effort. Offline shell still works without every tile.
      } finally {
        completed += 1

        // De cinco en cinco, no de cien en cien.
        //
        // El aviso salía cada 100 trozos, así que la pantalla se quedaba
        // clavada en el mismo número un buen rato y luego pegaba un salto. En
        // la primera descarga —que son más de mil trozos y varios minutos en el
        // móvil— eso es justo lo que hace pensar que se ha colgado.
        if (completed === faltan.length || completed % 5 === 0) {
          onProgress?.({
            label: 'Mapa offline',
            done: completed,
            total: faltan.length,
            detail: `${completed} de ${faltan.length} trozos · ${saved} guardados`,
          })
          await new Promise(resolve => setTimeout(resolve, 0))
        }
      }
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()))
  return saved
}

/** Cuántas de estas teselas están ya en el móvil. */
async function contarTeselasGuardadas(urls: string[]): Promise<number> {
  if (!('caches' in window)) return 0

  try {
    const cache = await caches.open(TILE_CACHE_NAME)
    const guardadas = await urlsYaGuardadas(cache)
    return urls.filter((url) => guardadas.has(url)).length
  } catch {
    return 0
  }
}

export function getOfflineMapTileSummary(): OfflineMapTileSummary | null {
  try {
    const raw = window.localStorage.getItem(TILE_SUMMARY_KEY)
    if (!raw) return null
    const resumen = JSON.parse(raw) as OfflineMapTileSummary
    // Un resumen de otro plan no cuenta: hay que volver a bajar lo que falte.
    if (resumen.firma !== FIRMA_DEL_PLAN) return null
    return resumen
  } catch {
    return null
  }
}

async function descargarRedDeCaminos(onProgress?: (progress: OfflineMapTileProgress) => void): Promise<void> {
  // Sin service worker al mando no hay quien la guarde: no se baja dos veces.
  if (typeof navigator === 'undefined' || !navigator.serviceWorker?.controller) return
  try {
    // Ya guardada: nada que bajar. Sin esta comprobación se volvía a pedir
    // en cada pasada de fondo, a la vez que el worker de la guía la pedía
    // también: dos descargas de 7 MB mientras se jugaba.
    if (typeof caches !== 'undefined') {
      const guardada = await caches.open(ROAD_GRAPH_CACHE).then((c) => c.match('/api/road-graph', { ignoreSearch: true }))
      if (guardada) return
    }
    onProgress?.({ label: 'Red de caminos', done: 0, total: 0, detail: 'Red de caminos para la guía…' })
    const respuesta = await fetch('/api/road-graph')
    if (!respuesta.ok || !respuesta.body) return
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
  } catch {
    // Sin red de caminos la guía va recta: no es motivo para parar el paquete.
  }
}

export async function prefetchMissionMapTiles(
  stages: PlayerStage[],
  onProgress?: (progress: OfflineMapTileProgress) => void,
  opciones: { redDeCaminos?: boolean } = {}
): Promise<OfflineMapTileSummary> {
  const routePoints = uniqueStagePoints(stages)
  const urls = new Map<string, string>()
  const center = routeCenter(routePoints)

  onProgress?.({
    label: 'Abriendo el mapa guardado',
    done: 0,
    total: 100,
    detail: 'Continente · país · región · zona de misión · corredor · nodos',
  })

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
      if (!/^(mission|corridor|nivel-comarca)/.test(etiqueta)) continue
      const urlRelieve = demTileUrl(z, Number(trozos[2]), Number(trozos[3]))
      if (!urls.has(urlRelieve)) urls.set(urlRelieve, `relieve-z${z}`)
    }


    // Detalle alto solo cerca de nodos: z18 y, pegado al nodo, z19, que
    // es lo que el mapa pide con el jugador encima.
    for (const point of routePoints) {
      addSquareAroundPointWithBudget(urls, point, 18, NODE_DETAIL_RADIUS_KM, 25, 'node-z18')
      addSquareAroundPointWithBudget(urls, point, 19, Math.min(NODE_DETAIL_RADIUS_KM, 0.15), 36, 'node-z19')
    }
  }

  const orderedUrls = Array.from(urls.keys()).slice(0, MAX_TILE_URLS)
  await fetchAndCacheUrls(orderedUrls, onProgress)

  /**
   * La red de caminos, DESPUÉS de las teselas y como fase propia. Así la
   * primera vez que se juega ya está guardada por el service worker, que
   * la sirve luego sin cobertura, y el mapa no tiene que bajar 21 MB
   * mientras pinta: eso dejaba el trazado y las fotos para después. No va
   * en la lista de teselas (la barra cuenta teselas y se quedaba "esperando
   * una tesela" durante minutos) ni lleva porcentaje: comprimida no se sabe
   * cuánto ocupa.
   */
  if (opciones.redDeCaminos !== false) await descargarRedDeCaminos(onProgress)

  // Lo que hay guardado de esta ruta, no lo que se ha bajado en esta vuelta:
  // el panel de "antes de salir" tiene que decir si el mapa está o no está, y
  // saltarse las que ya estaban no puede parecer que se han perdido.
  const saved = await contarTeselasGuardadas(orderedUrls)

  const detalleDeNodos = Array.from(urls.values()).filter((p) => p === 'node-z18').length

  const summary: OfflineMapTileSummary = {
    firma: FIRMA_DEL_PLAN,
    cached_at: new Date().toISOString(),
    requested: orderedUrls.length,
    saved,
    zooms: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
    recortado: descartadasEnEstaVuelta > 0,
    descartadas: descartadasEnEstaVuelta,
    detalle_de_nodos: detalleDeNodos,
    route_points: routePoints.length,
    regional_radius_km: REGIONAL_RADIUS_KM,
    mission_area_radius_km: MISSION_AREA_RADIUS_KM,
    route_corridor_km: ROUTE_CORRIDOR_KM,
    node_detail_radius_km: NODE_DETAIL_RADIUS_KM,
  }

  try {
    window.localStorage.setItem(TILE_SUMMARY_KEY, JSON.stringify(summary))
  } catch {
    // best effort
  }

  onProgress?.({
    // No se anuncia "listo" sin mirar si se corto: prometer un mapa completo
    // que no lo esta es peor que decir que falta detalle.
    label: summary.recortado ? 'Mapa guardado, sin todo el detalle' : 'Mapa listo',
    done: orderedUrls.length,
    total: orderedUrls.length || 1,
    detail: summary.recortado
      ? `${saved} teselas guardadas; ${summary.descartadas} no caben en esta ruta`
      : `${saved}/${orderedUrls.length} teselas guardadas`,
  })

  return summary
}
