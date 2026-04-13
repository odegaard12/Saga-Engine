import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { PlayerGpsStatus, PlayerStage } from '../../types/player'

type MapSurfaceProps = {
  currentStage: PlayerStage | null
  className?: string
  playerPosition?: { lat: number; lon: number } | null
  gpsState?: PlayerGpsStatus
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
  gpsState = 'unavailable',
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
      weight: 2,
      opacity: 0.95,
      fillOpacity: 0.12,
    }).addTo(map)

    const markerLayer = L.circleMarker(center, {
      radius: 9,
      weight: 3,
      opacity: 1,
      fillOpacity: 0.95,
    })
      .addTo(map)
      .bindTooltip(stageMapData.name, {
        direction: 'top',
        offset: [0, -8],
      })

    nodeRadiusRef.current = radiusLayer
    nodeMarkerRef.current = markerLayer

    if (!playerPosition) {
      map.fitBounds(radiusLayer.getBounds(), {
        padding: [28, 28],
        maxZoom: 18,
        animate: false,
      })
    }

    map.invalidateSize({ pan: false })
  }, [stageMapData, playerPosition])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    playerMarkerRef.current?.remove()
    playerMarkerRef.current = null

    if (!playerPosition) {
      map.invalidateSize({ pan: false })
      return
    }

    playerMarkerRef.current = L.circleMarker(
      [playerPosition.lat, playerPosition.lon],
      {
        radius: 7,
        weight: 2,
        opacity: 1,
        fillOpacity: 0.95,
      }
    )
      .addTo(map)
      .bindTooltip('Player position', {
        direction: 'top',
        offset: [0, -8],
      })

    if (stageMapData) {
      const bounds = L.latLngBounds(
        [stageMapData.lat, stageMapData.lon],
        [playerPosition.lat, playerPosition.lon]
      )
      map.fitBounds(bounds.pad(0.35), {
        maxZoom: 17,
        animate: false,
      })
    }

    map.invalidateSize({ pan: false })
  }, [playerPosition, stageMapData])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const id = window.setTimeout(() => {
      map.invalidateSize({ pan: false })
    }, 0)

    return () => window.clearTimeout(id)
  }, [stageMapData, gpsState, debugSimulation])

  const hasStage = !!stageMapData
  const gpsLabel =
    gpsState === 'ready'
      ? 'GPS: READY'
      : gpsState === 'stale'
      ? 'GPS: STALE'
      : gpsState === 'searching'
      ? 'GPS: SEARCHING'
      : gpsState === 'error'
      ? 'GPS: ERROR'
      : 'GPS: UNAVAILABLE'

  return (
    <section className={className}>
      <div className="map-surface">
        <div
          ref={mapRootRef}
          className="map-surface__canvas"
          aria-label="Current node map"
        />

        <div className="map-surface__overlay map-surface__overlay--top">
          <div className="map-surface__title-block">
            <span className="map-surface__eyebrow">MAP SURFACE</span>
            <span className="map-surface__title">
              {currentStage?.title || 'Awaiting node'}
            </span>
          </div>

          <div className="map-surface__overlay-right">
            <span className="map-surface__badge">
              {hasStage ? 'NODE ONLINE' : 'NO NODE GPS'}
            </span>

            <span className="map-surface__meta">
              {gpsLabel}
              {debugSimulation ? ' · SIM' : ''}
            </span>
          </div>
        </div>

        <div className="map-surface__overlay map-surface__overlay--bottom">
          <span className="map-surface__chip">
            {typeof currentStage?.lat === 'number'
              ? `LAT ${currentStage.lat.toFixed(5)}`
              : 'LAT ---'}
          </span>
          <span className="map-surface__chip">
            {typeof currentStage?.lon === 'number'
              ? `LON ${currentStage.lon.toFixed(5)}`
              : 'LON ---'}
          </span>
          <span className="map-surface__chip">
            {typeof currentStage?.radius === 'number'
              ? `RADIUS ${currentStage.radius} M`
              : 'RADIUS ---'}
          </span>
          <span className="map-surface__chip map-surface__chip--player">
            {playerPosition ? 'PLAYER ONLINE' : 'PLAYER ---'}
          </span>
        </div>
      </div>
    </section>
  )
}

export default MapSurface
