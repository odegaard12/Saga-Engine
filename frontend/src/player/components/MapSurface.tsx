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

function getDistanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const earthRadius = 6371000

  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const sinLat = Math.sin(dLat / 2)
  const sinLon = Math.sin(dLon / 2)

  const h =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon

  return 2 * earthRadius * Math.asin(Math.sqrt(h))
}

export function MapSurface({
  currentStage,
  className,
  playerPosition,
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
      zoomControl: false,
      attributionControl: true,
    })

    L.control.zoom({ position: 'topright' }).addTo(map)

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
      color: '#22c55e',
      weight: 2,
      opacity: 0.95,
      fillColor: '#22c55e',
      fillOpacity: 0.12,
    }).addTo(map)

    const markerLayer = L.circleMarker(center, {
      radius: 9,
      weight: 3,
      color: '#22c55e',
      fillColor: '#dcfce7',
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
        padding: [48, 48],
        maxZoom: 17,
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
        color: '#3b82f6',
        fillColor: '#dbeafe',
        fillOpacity: 0.95,
      }
    )
      .addTo(map)
      .bindTooltip('Player position', {
        direction: 'top',
        offset: [0, -8],
      })

    if (stageMapData) {
      const distance = getDistanceMeters(playerPosition, {
        lat: stageMapData.lat,
        lon: stageMapData.lon,
      })

      if (distance <= 350) {
        const bounds = L.latLngBounds(
          [stageMapData.lat, stageMapData.lon],
          [playerPosition.lat, playerPosition.lon]
        )
        map.fitBounds(bounds.pad(0.28), {
          maxZoom: 17,
          animate: false,
        })
      } else {
        map.setView([stageMapData.lat, stageMapData.lon], 16, {
          animate: false,
        })
      }
    }

    map.invalidateSize({ pan: false })
  }, [playerPosition, stageMapData])

  return (
    <section className={['map-surface', className].filter(Boolean).join(' ')}>
      <div
        ref={mapRootRef}
        className="map-surface__canvas"
        aria-label="Current node map"
      />
    </section>
  )
}

export default MapSurface
