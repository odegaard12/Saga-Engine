import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { PlayerGpsStatus, PlayerStage, TeamProfileLiveStatus } from '../../types/player'

type FocusRequest =
  | {
      target: 'player' | 'node'
      token: number
    }
  | null

type NodeVisualState = 'locked' | 'ready' | 'engaging'

type MapSurfaceProps = {
  currentStage: PlayerStage | null
  className?: string
  playerPosition?: { lat: number; lon: number } | null
  gpsState?: PlayerGpsStatus
  debugSimulation?: boolean
  followPlayer?: boolean
  focusRequest?: FocusRequest
  nodeState?: NodeVisualState
  otherPlayers?: TeamProfileLiveStatus[]
  selfLabel?: string
  onDebugSetPosition?: (position: { lat: number; lon: number }) => void
  onNodeTap?: () => void
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

function getNodeVisualConfig(nodeState: NodeVisualState) {
  if (nodeState === 'engaging') {
    return {
      ringColor: '#22c55e',
      ringWeight: 3,
      ringOpacity: 0.96,
      ringFillOpacity: 0.14,
      markerRadius: 8,
      markerWeight: 3,
      markerStroke: '#16a34a',
      markerFill: '#ffffff',
    }
  }

  if (nodeState === 'ready') {
    return {
      ringColor: '#22c55e',
      ringWeight: 3,
      ringOpacity: 0.88,
      ringFillOpacity: 0.10,
      markerRadius: 8,
      markerWeight: 3,
      markerStroke: '#16a34a',
      markerFill: '#dcfce7',
    }
  }

  return {
    ringColor: '#22c55e',
    ringWeight: 2,
    ringOpacity: 0.70,
    ringFillOpacity: 0.06,
    markerRadius: 8,
    markerWeight: 3,
    markerStroke: '#16a34a',
    markerFill: '#dcfce7',
  }
}

function getInitials(label?: string) {
  const cleaned = String(label || '').trim()
  if (!cleaned) return '?'
  const parts = cleaned.split(/\s+/).slice(0, 2)
  return parts.map((part) => part[0]?.toUpperCase() || '').join('') || '?'
}

function createAvatarIcon(label: string, kind: 'self' | 'live' | 'recent' | 'offline') {
  const initials = getInitials(label)

  return L.divIcon({
    className: 'saga-avatar-icon-wrap',
    html: `<div class="saga-avatar-pin saga-avatar-pin--${kind}">${initials}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  })
}

export function MapSurface({
  currentStage,
  className,
  playerPosition,
  debugSimulation,
  followPlayer = true,
  focusRequest,
  nodeState = 'locked',
  otherPlayers = [],
  selfLabel = 'ME',
  onDebugSetPosition,
  onNodeTap,
}: MapSurfaceProps) {
  const mapRootRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const nodeMarkerRef = useRef<L.CircleMarker | null>(null)
  const nodeRadiusRef = useRef<L.Circle | null>(null)
  const playerMarkerRef = useRef<L.Marker | null>(null)
  const otherPlayerLayersRef = useRef<L.Layer[]>([])
  const lastNodeFrameRef = useRef<string | null>(null)
  const lastPlayerFrameRef = useRef<string | null>(null)

  const stageMapData = useMemo(
    () => resolveStageMapData(currentStage),
    [currentStage?.id, currentStage?.lat, currentStage?.lon, currentStage?.radius, currentStage?.title]
  )

  useEffect(() => {
    if (!mapRootRef.current || mapRef.current) return

    const map = L.map(mapRootRef.current, {
      zoomControl: false,
      attributionControl: false,
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
      otherPlayerLayersRef.current.forEach((layer) => layer.remove())
      otherPlayerLayersRef.current = []
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

    const handleMapClick = (event: L.LeafletMouseEvent) => {
      if (!debugSimulation || !onDebugSetPosition) return
      onDebugSetPosition({
        lat: event.latlng.lat,
        lon: event.latlng.lng,
      })
    }

    map.on('click', handleMapClick)

    return () => {
      map.off('click', handleMapClick)
    }
  }, [debugSimulation, onDebugSetPosition])

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

    const visual = getNodeVisualConfig(nodeState)
    const center: L.LatLngExpression = [stageMapData.lat, stageMapData.lon]

    const radiusLayer = L.circle(center, {
      radius: stageMapData.radius,
      color: visual.ringColor,
      weight: visual.ringWeight,
      opacity: visual.ringOpacity,
      fillColor: visual.ringColor,
      fillOpacity: visual.ringFillOpacity,
      className: `saga-node-radius saga-node-radius--${nodeState}`,
    }).addTo(map)

    const markerLayer = L.circleMarker(center, {
      radius: visual.markerRadius,
      weight: visual.markerWeight,
      color: visual.markerStroke,
      fillColor: visual.markerFill,
      fillOpacity: 0.98,
      className: `saga-node-core saga-node-core--${nodeState}`,
    }).addTo(map)

    if (onNodeTap) {
      radiusLayer.on('click', () => onNodeTap())
      markerLayer.on('click', () => onNodeTap())
    }

    nodeRadiusRef.current = radiusLayer
    nodeMarkerRef.current = markerLayer

    const nodeFrameKey = `${stageMapData.lat}:${stageMapData.lon}:${stageMapData.radius}`
    if (lastNodeFrameRef.current !== nodeFrameKey) {
      lastNodeFrameRef.current = nodeFrameKey
      lastPlayerFrameRef.current = null
      map.fitBounds(radiusLayer.getBounds(), {
        padding: [56, 56],
        maxZoom: 16,
        animate: true,
        duration: 0.35,
      })
    }

    map.invalidateSize({ pan: false })
  }, [stageMapData, onNodeTap, nodeState])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    playerMarkerRef.current?.remove()
    playerMarkerRef.current = null

    if (!playerPosition) {
      map.invalidateSize({ pan: false })
      return
    }

    playerMarkerRef.current = L.marker(
      [playerPosition.lat, playerPosition.lon],
      {
        icon: createAvatarIcon(selfLabel, 'self'),
        keyboard: false,
      }
    ).addTo(map)

    playerMarkerRef.current.bindTooltip(selfLabel, {
      direction: 'top',
      opacity: 0.92,
    })

    const playerFrameKey = stageMapData
      ? `${stageMapData.lat}:${stageMapData.lon}:player`
      : `player:${selfLabel}`

    if (followPlayer && lastPlayerFrameRef.current !== playerFrameKey) {
      lastPlayerFrameRef.current = playerFrameKey

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
          map.fitBounds(bounds.pad(0.30), {
            maxZoom: 16,
            animate: true,
            duration: 0.35,
          })
        }
      } else {
        map.setView([playerPosition.lat, playerPosition.lon], 16, {
          animate: true,
          duration: 0.35,
        })
      }
    }

    map.invalidateSize({ pan: false })
  }, [playerPosition, stageMapData, followPlayer, selfLabel])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    otherPlayerLayersRef.current.forEach((layer) => layer.remove())
    otherPlayerLayersRef.current = []

    for (const player of otherPlayers) {
      if (player.is_self) continue
      if (typeof player.lat !== 'number' || typeof player.lon !== 'number') continue

      const presence = String(player.presence || 'offline').toLowerCase()
      const kind =
        presence === 'offline'
          ? 'offline'
          : presence === 'stale'
          ? 'recent'
          : 'live'

      const marker = L.marker([player.lat, player.lon], {
        icon: createAvatarIcon(player.display_name || player.user, kind),
        keyboard: false,
      }).addTo(map)

      marker.bindTooltip(player.display_name || player.user, {
        direction: 'top',
        opacity: 0.92,
      })

      otherPlayerLayersRef.current.push(marker)
    }
  }, [otherPlayers])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !focusRequest) return

    if (focusRequest.target === 'player' && playerPosition) {
      map.flyTo([playerPosition.lat, playerPosition.lon], 17, {
        animate: true,
        duration: 0.45,
      })
      map.invalidateSize({ pan: false })
      return
    }

    if (focusRequest.target === 'node' && stageMapData) {
      map.flyTo([stageMapData.lat, stageMapData.lon], 17, {
        animate: true,
        duration: 0.45,
      })
      map.invalidateSize({ pan: false })
    }
  }, [focusRequest, playerPosition, stageMapData])

  return (
    <>
      <style>{mapAnimations}</style>

      <section
        className={['map-surface', className].filter(Boolean).join(' ')}
        style={surface}
      >
        <div
          ref={mapRootRef}
          aria-label="Current node map"
          style={{
            ...canvas,
            cursor: debugSimulation ? 'crosshair' : 'default',
          }}
        />
      </section>
    </>
  )
}

const surface: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '100%',
  minHeight: 0,
  borderRadius: 28,
  overflow: 'hidden',
  border: '1px solid rgba(15,23,42,.10)',
  background: '#dfe8dd',
  boxShadow: '0 18px 40px rgba(15,23,42,.08)',
}

const canvas: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
}

const mapAnimations = `
.saga-node-radius {
  transform-origin: center;
  cursor: pointer;
}

.saga-node-radius--locked {
  animation: sagaNodeHaloLocked 2200ms ease-in-out infinite;
}

.saga-node-radius--ready {
  animation: sagaNodeHaloReady 1100ms ease-in-out infinite;
}

.saga-node-radius--engaging {
  animation: sagaNodeHaloEngaging 520ms ease-in-out 3;
}

.saga-node-core {
  cursor: pointer;
}

.saga-node-core--locked {
  filter: drop-shadow(0 0 6px rgba(34,197,94,.18));
}

.saga-node-core--ready {
  filter: drop-shadow(0 0 10px rgba(34,197,94,.28));
}

.saga-node-core--engaging {
  filter: drop-shadow(0 0 14px rgba(34,197,94,.38));
}

.saga-avatar-icon-wrap {
  background: transparent;
  border: none;
}

.saga-avatar-pin {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.04em;
  border: 2px solid rgba(255,255,255,.92);
  box-sizing: border-box;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.saga-avatar-pin--self {
  background: rgba(37,99,235,.96);
  color: #ffffff;
  box-shadow: 0 0 0 5px rgba(37,99,235,.22), 0 10px 22px rgba(15,23,42,.22);
}

.saga-avatar-pin--live {
  background: rgba(249,115,22,.95);
  color: #ffffff;
  box-shadow: 0 0 0 4px rgba(249,115,22,.20);
}

.saga-avatar-pin--recent {
  background: rgba(249,115,22,.78);
  color: #ffffff;
  box-shadow: 0 0 0 4px rgba(249,115,22,.14);
}

.saga-avatar-pin--offline {
  background: rgba(148,163,184,.88);
  color: #ffffff;
  box-shadow: 0 0 0 4px rgba(148,163,184,.14);
}

@keyframes sagaNodeHaloLocked {
  0% { stroke-opacity: .72; fill-opacity: .06; }
  50% { stroke-opacity: .40; fill-opacity: .02; }
  100% { stroke-opacity: .72; fill-opacity: .06; }
}

@keyframes sagaNodeHaloReady {
  0% { stroke-opacity: .94; fill-opacity: .12; }
  50% { stroke-opacity: .36; fill-opacity: .02; }
  100% { stroke-opacity: .94; fill-opacity: .12; }
}

@keyframes sagaNodeHaloEngaging {
  0% { stroke-opacity: 1; fill-opacity: .16; }
  50% { stroke-opacity: .30; fill-opacity: .01; }
  100% { stroke-opacity: 1; fill-opacity: .16; }
}
`

export default MapSurface
