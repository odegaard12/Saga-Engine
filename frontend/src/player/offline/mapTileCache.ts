import type { PlayerStage } from '../../types/player'

// Tiene que ser exactamente el mismo nombre que usa frontend/public/sw.js.
// El service worker borra al activarse cualquier caché 'saga-route-tile-coverage-*'
// que no sea la suya, así que si aquí se guarda en otra, la descarga del mapa
// se pierde en el siguiente arranque y el jugador se queda sin mapa offline
// creyendo que lo tiene.
const TILE_CACHE_NAME = 'saga-route-tile-coverage-v3.9.6'
const TILE_SUMMARY_KEY = 'saga:offline-map-tiles:v2'

// Control sano: bastante mapa, pero sin intentar descargar media provincia en zoom 18.
const MAX_TILE_URLS = 1500

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

function uniqueStagePoints(stages: PlayerStage[]) {
  const seen = new Set<string>()
  const points: Point[] = []

  for (const stage of stages || []) {
    if (typeof stage.lat !== 'number' || typeof stage.lon !== 'number') continue

    const key = `${stage.lat.toFixed(5)}:${stage.lon.toFixed(5)}`
    if (seen.has(key)) continue

    seen.add(key)
    points.push({ lat: stage.lat, lon: stage.lon })
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
  const faltan = urls.filter((url) => !guardadas.has(url))

  if (!faltan.length) {
    onProgress?.({
      label: 'Mapa listo',
      done: urls.length,
      total: urls.length || 1,
      detail: 'El mapa ya está guardado en este teléfono',
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
    return JSON.parse(raw) as OfflineMapTileSummary
  } catch {
    return null
  }
}

export async function prefetchMissionMapTiles(
  stages: PlayerStage[],
  onProgress?: (progress: OfflineMapTileProgress) => void
): Promise<OfflineMapTileSummary> {
  const routePoints = uniqueStagePoints(stages)
  const urls = new Map<string, string>()
  const center = routeCenter(routePoints)

  onProgress?.({
    label: 'Calculando mapa',
    done: 0,
    total: 100,
    detail: 'Regional + zona misión + corredor + nodos',
  })

  if (routePoints.length > 0 && center) {
    // Contexto regional grande (Galicia/España completa para evitar cuadros negros al desampliar)
    addSquareAroundPointWithBudget(urls, center, 5, 800, 16, 'regional-z5')
    addSquareAroundPointWithBudget(urls, center, 6, 800, 25, 'regional-z6')
    addSquareAroundPointWithBudget(urls, center, 7, 600, 36, 'regional-z7')
    addSquareAroundPointWithBudget(urls, center, 8, 400, 49, 'regional-z8')
    addSquareAroundPointWithBudget(urls, center, 9, 300, 81, 'regional-z9')
    addSquareAroundPointWithBudget(urls, center, 10, 200, 121, 'regional-z10')
    addSquareAroundPointWithBudget(urls, center, 11, 120, 169, 'regional-z11')

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

    // Detalle alto solo cerca de nodos.
    for (const point of routePoints) {
      addSquareAroundPointWithBudget(urls, point, 18, NODE_DETAIL_RADIUS_KM, 25, 'node-z18')
    }
  }

  const orderedUrls = Array.from(urls.keys()).slice(0, MAX_TILE_URLS)
  await fetchAndCacheUrls(orderedUrls, onProgress)

  // Lo que hay guardado de esta ruta, no lo que se ha bajado en esta vuelta:
  // el panel de "antes de salir" tiene que decir si el mapa está o no está, y
  // saltarse las que ya estaban no puede parecer que se han perdido.
  const saved = await contarTeselasGuardadas(orderedUrls)

  const detalleDeNodos = Array.from(urls.values()).filter((p) => p === 'node-z18').length

  const summary: OfflineMapTileSummary = {
    cached_at: new Date().toISOString(),
    requested: orderedUrls.length,
    saved,
    zooms: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
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
