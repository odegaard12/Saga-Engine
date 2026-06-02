import type { PlayerStage } from '../../types/player'

const TILE_CACHE_NAME = 'saga-player-shell-v223-map-tile-pack'
const TILE_SUMMARY_KEY = 'saga:offline-map-tiles:v1'
const ESRI_TILE_BASE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile'

export type OfflineMapTileSummary = {
  cached_at: string
  requested: number
  saved: number
  zooms: number[]
}

function latLonToTile(lat: number, lon: number, zoom: number) {
  const latRad = (lat * Math.PI) / 180
  const n = 2 ** zoom

  return {
    x: Math.floor(((lon + 180) / 360) * n),
    y: Math.floor(((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n),
  }
}

function tileUrl(zoom: number, x: number, y: number) {
  return `${ESRI_TILE_BASE}/${zoom}/${y}/${x}`
}

function uniqueStagePoints(stages: PlayerStage[]) {
  const seen = new Set<string>()
  const points: Array<{ lat: number; lon: number }> = []

  for (const stage of stages || []) {
    if (typeof stage.lat !== 'number' || typeof stage.lon !== 'number') continue

    const key = `${stage.lat.toFixed(5)}:${stage.lon.toFixed(5)}`
    if (seen.has(key)) continue

    seen.add(key)
    points.push({ lat: stage.lat, lon: stage.lon })
  }

  return points
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

export async function prefetchMissionMapTiles(stages: PlayerStage[]): Promise<OfflineMapTileSummary> {
  const points = uniqueStagePoints(stages)
  const zooms = [15, 16, 17, 18]
  const urls = new Set<string>()

  for (const point of points) {
    for (const zoom of zooms) {
      const center = latLonToTile(point.lat, point.lon, zoom)
      const radius = zoom >= 18 ? 1 : zoom >= 17 ? 1 : 0

      for (let dx = -radius; dx <= radius; dx += 1) {
        for (let dy = -radius; dy <= radius; dy += 1) {
          urls.add(tileUrl(zoom, center.x + dx, center.y + dy))
        }
      }
    }
  }

  let saved = 0

  if ('caches' in window && urls.size > 0) {
    const cache = await caches.open(TILE_CACHE_NAME)

    for (const url of urls) {
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
      }
    }
  }

  const summary: OfflineMapTileSummary = {
    cached_at: new Date().toISOString(),
    requested: urls.size,
    saved,
    zooms,
  }

  try {
    window.localStorage.setItem(TILE_SUMMARY_KEY, JSON.stringify(summary))
  } catch {
    // best effort
  }

  return summary
}
