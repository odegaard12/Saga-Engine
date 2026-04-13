import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { PlayerStage } from '../../types/player'

type MapSurfaceProps = {
  currentStage: PlayerStage | null
  className?: string
  playerPosition?: { lat: number; lon: number } | null
  gpsState?: 'idle' | 'searching' | 'ready' | 'error'
  debugSimulation?: boolean
}

function resolveStageMapData(stage: PlayerStage | null) {
  if (!stage) return null

  const lat = typeof stage.lat === 'number' ? stage.lat : null
  const lon = typeof stage.lon === 'number' ? stage.lon : null
  const radius = typeof stage.radius === 'number' ? stage.radius : 30

  if (lat === null || lon === null) return null

  return {
    lat,
    lon,
    radius: radius > 0 ? radius : 30,
    name: stage.title ?? 'Current node',
  }
}

export function MapSurface({
  currentStage,
  className,
  playerPosition,
  gpsState = 'idle',
  debugSimulation = false,
}: MapSurfaceProps) {
  const mapRootRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const nodeMarkerRef = useRef<L.CircleMarker | null>(null)
  const nodeRadiusRef = useRef<L.Circle | null>(null)
  const playerMarkerRef = useRef<L.CircleMarker | null>(null)

  const stageMapData = useMemo(
    () => resolveStageMapData(currentStage),
    [currentStage]
  )

  useEffect(() => {
    if (!mapRootRef.current || mapRef.current) return

    const map = L.map(mapRootRef.current, {
      zoomControl: true,
      attributionControl: true,
    })

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    map.setView([42.4333, -8.65], 13)
    mapRef.current = map

    return () => {
      playerMarkerRef.current?.remove()
      nodeMarkerRef.current?.remove()
      nodeRadiusRef.current?.remove()
      map.remove()
      mapRef.current = null
      playerMarkerRef.current = null
      nodeMarkerRef.current = null
      nodeRadiusRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    nodeMarkerRef.current?.remove()
    nodeRadiusRef.current?.remove()
    nodeMarkerRef.current = null
    nodeRadiusRef.current = null

    if (!stageMapData) {
      map.invalidateSize({ pan: false })
      return
    }

    const center: L.LatLngExpression = [stageMapData.lat, stageMapData.lon]

    const radiusLayer = L.circle(center, {
      radius: stageMapData.radius,
      weight: 1.5,
      opacity: 0.9,
      fillOpacity: 0.12,
    }).addTo(map)

    const markerLayer = L.circleMarker(center, {
      radius: 8,
      weight: 2,
      opacity: 1,
      fillOpacity: 0.9,
    })
      .addTo(map)
      .bindTooltip(stageMapData.name, {
        direction: 'top',
        offset: [0, -8],
      })

    nodeRadiusRef.current = radiusLayer
    nodeMarkerRef.current = markerLayer

    map.fitBounds(radiusLayer.getBounds(), {
      padding: [24, 24],
      maxZoom: 18,
      animate: false,
    })

    map.invalidateSize({ pan: false })
  }, [stageMapData])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    playerMarkerRef.current?.remove()
    playerMarkerRef.current = null

    if (!playerPosition) return

    playerMarkerRef.current = L.circleMarker(
      [playerPosition.lat, playerPosition.lon],
      {
        radius: 6,
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9,
      }
    ).addTo(map)
  }, [playerPosition])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const id = window.setTimeout(() => {
      map.invalidateSize({ pan: false })
    }, 0)

    return () => window.clearTimeout(id)
  }, [stageMapData, gpsState, debugSimulation])

  const hasStage = !!stageMapData

  return (
    <section className={className}>
      <div className="map-surface">
        <div
          ref={mapRootRef}
          className="map-surface__canvas"
          aria-label="Current node map"
        />

        <div className="map-surface__overlay">
          <span className="map-surface__badge">
            {hasStage ? 'NODE ONLINE' : 'NO NODE GPS'}
          </span>

          <span className="map-surface__meta">
            GPS: {gpsState.toUpperCase()}
            {debugSimulation ? ' · SIM' : ''}
          </span>
        </div>
      </div>
    </section>
  )
}

export default MapSurface
