import type { PlayerStage } from '../../types/player'

const TILE_CACHE_NAME = 'saga-route-tile-coverage-v550'
const TILE_SUMMARY_KEY = 'saga:offline-map-tiles:v1'
const ESRI_TILE_BASE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile'

// Control sano: bastante mapa, pero sin intentar descargar media provincia en zoom 18.
const MAX_TILE_URLS = 1400

const REGIONAL_RADIUS_KM = 120       // contexto amplio, zoom bajo
const MISSION_AREA_RADIUS_KM = 35    // zona jugable amplia, zoom medio
const ROUTE_CORRIDOR_KM = 6          // ancho alrededor de la ruta
const NODE_DETAIL_RADIUS_KM = 1.2    // detalle alto alrededor de nodos

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

  return `${ESRI_TILE_BASE}/${zoom}/${clampedY}/${wrappedX}`
}

function metersPerTile(lat: number, zoom: number) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / (2 ** zoom) * 256
}

function getDistanceMeters(a: Point, b: Point) {
  const radius = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2

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

function addTile(urls: Map<string, string>, zoom: number, x: number, y: number, priority: string) {
  if (urls.size >= MAX_TILE_URLS) return
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

async function fetchAndCacheUrls(
  urls: string[],
  onProgress?: (progress: OfflineMapTileProgress) => void
) {
  if (!('caches' in window)) return 0

  const cache = await caches.open(TILE_CACHE_NAME)
  let saved = 0
  let completed = 0
  let index = 0
  const workers = 6

  onProgress?.({
    label: 'Mapa offline',
    done: 0,
    total: urls.length,
    detail: `Descargando ${urls.length} teselas`,
  })

  async function worker() {
    while (index < urls.length) {
      const url = urls[index]
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

        if (completed === urls.length || completed % 12 === 0) {
          onProgress?.({
            label: 'Mapa offline',
            done: completed,
            total: urls.length,
            detail: `${completed}/${urls.length} teselas · ${saved} guardadas`,
          })
        }
      }
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()))
  return saved
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
    // Contexto grande, barato.
    addSquareAroundPointWithBudget(urls, center, 8, REGIONAL_RADIUS_KM, 36, 'regional-z8')
    addSquareAroundPointWithBudget(urls, center, 9, REGIONAL_RADIUS_KM, 64, 'regional-z9')
    addSquareAroundPointWithBudget(urls, center, 10, REGIONAL_RADIUS_KM, 100, 'regional-z10')
    addSquareAroundPointWithBudget(urls, center, 11, Math.min(REGIONAL_RADIUS_KM, 80), 140, 'regional-z11')

    // Zona amplia de misión.
    addBBoxTilesWithBudget(urls, routePoints, 12, MISSION_AREA_RADIUS_KM, 180, 'mission-z12')
    addBBoxTilesWithBudget(urls, routePoints, 13, MISSION_AREA_RADIUS_KM, 240, 'mission-z13')
    addBBoxTilesWithBudget(urls, routePoints, 14, Math.min(MISSION_AREA_RADIUS_KM, 22), 260, 'mission-z14')

    // Corredor ancho, no línea fina.
    addRouteCorridor(urls, routePoints, 15, ROUTE_CORRIDOR_KM, 1600, 260, 'corridor-z15')
    addRouteCorridor(urls, routePoints, 16, Math.min(ROUTE_CORRIDOR_KM, 4), 1100, 320, 'corridor-z16')
    addRouteCorridor(urls, routePoints, 17, Math.min(ROUTE_CORRIDOR_KM, 2.2), 850, 320, 'corridor-z17')

    // Detalle alto solo cerca de nodos.
    for (const point of routePoints) {
      addSquareAroundPointWithBudget(urls, point, 18, NODE_DETAIL_RADIUS_KM, 25, 'node-z18')
    }
  }

  const orderedUrls = Array.from(urls.keys()).slice(0, MAX_TILE_URLS)
  const saved = await fetchAndCacheUrls(orderedUrls, onProgress)

  const summary: OfflineMapTileSummary = {
    cached_at: new Date().toISOString(),
    requested: orderedUrls.length,
    saved,
    zooms: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
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
    label: 'Mapa listo',
    done: orderedUrls.length,
    total: orderedUrls.length || 1,
    detail: `${saved}/${orderedUrls.length} teselas guardadas`,
  })

  return summary
}
