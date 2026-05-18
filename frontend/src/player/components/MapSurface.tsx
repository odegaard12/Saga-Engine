import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { PlayerGpsStatus, PlayerStage, TeamProfileLiveStatus } from '../../types/player'
import { getPlayerAvatarInitials, getPlayerAvatarUrl, getPlayerColor } from '../../shared/playerIdentity'

type FocusRequest =
  | {
      target: 'player' | 'node' | 'route'
      token: number
    }
  | null

type NodeVisualState = 'locked' | 'ready' | 'engaging'

type MapSurfaceProps = {
  currentStage: PlayerStage | null
  missionStages?: PlayerStage[]
  currentLevel?: number
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
  onMapTilesReady?: () => void
  introFlyToCoords?: { lat: number; lon: number } | null
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

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function formatSeenAgo(lastSeen?: number): string {
  if (typeof lastSeen !== 'number' || !Number.isFinite(lastSeen)) return 'sin actualizar'
  const diffSeconds = Math.max(0, Math.round((Date.now() - lastSeen * 1000) / 1000))
  if (diffSeconds < 60) return `hace ${diffSeconds}s`
  const diffMinutes = Math.round(diffSeconds / 60)
  if (diffMinutes < 60) return `hace ${diffMinutes}min`
  const diffHours = Math.round(diffMinutes / 60)
  return `hace ${diffHours}h`
}

function getMarkerIdentity(
  profile: Partial<TeamProfileLiveStatus> & { display_name?: string; user?: string },
  fallbackKind: 'self' | 'live' | 'recent' | 'offline'
) {
  const color = getPlayerColor(profile)
  const initials = getPlayerAvatarInitials(profile)
  const avatarUrl = getPlayerAvatarUrl(profile)
  const label = profile.display_name || profile.user || initials || 'Player'

  return { color, initials, avatarUrl, label, kind: fallbackKind }
}

function createAvatarIcon(
  profile: Partial<TeamProfileLiveStatus> & { display_name?: string; user?: string },
  kind: 'self' | 'live' | 'recent' | 'offline'
) {
  const identity = getMarkerIdentity(profile, kind)
  const safeInitials = escapeHtml(identity.initials)
  const safeAvatar = escapeHtml(identity.avatarUrl)
  const safeColor = escapeHtml(identity.color)

  const avatarHtml = safeAvatar
    ? `<img src="${safeAvatar}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:999px;display:block;" />`
    : safeInitials

  return L.divIcon({
    className: 'saga-avatar-icon-wrap',
    html: `<div class="saga-avatar-pin saga-avatar-pin--${kind}" style="--saga-player-color:${safeColor};">${avatarHtml}</div>`,
    iconSize: kind === 'self' ? [46, 46] : [42, 42],
    iconAnchor: kind === 'self' ? [23, 23] : [21, 21],
  })
}

function buildPlayerPopup(
  profile: Partial<TeamProfileLiveStatus> & { display_name?: string; user?: string },
  kind: 'self' | 'live' | 'recent' | 'offline'
): string {
  const identity = getMarkerIdentity(profile, kind)
  const presence = kind === 'self'
    ? 'MI UBICACIÓN'
    : kind === 'live'
      ? 'EN LÍNEA'
      : kind === 'recent'
        ? 'RECIENTE'
        : 'SIN CONEXIÓN'

  const title = kind === 'self' ? 'Tú' : identity.label

  return `
    <div style="min-width:156px;font-family:system-ui,sans-serif;">
      <strong style="display:block;font-size:13px;color:#0f172a;">${escapeHtml(title)}</strong>
      <span style="display:inline-block;margin-top:4px;font-size:10px;font-weight:900;letter-spacing:.08em;color:${escapeHtml(identity.color)};">${presence}</span>
      ${kind !== 'self' ? `<div style="margin-top:6px;font-size:11px;color:#475569;">Visto ${escapeHtml(formatSeenAgo(profile.last_seen))}</div>` : '<div style="margin-top:6px;font-size:11px;color:#475569;">Tu ubicación actual</div>'}
      ${profile.gps_status ? `<div style="margin-top:4px;font-size:11px;color:#64748b;">GPS ${escapeHtml(String(profile.gps_status).toUpperCase())}</div>` : ''}
    </div>
  `
}


function createMissionNodeIcon(index: number, state: 'completed' | 'current' | 'locked') {
  const label =
    state === 'completed'
      ? '✓'
      : state === 'locked'
      ? '🔒'
      : String(index + 1)

  const styles =
    state === 'completed'
      ? 'background:rgba(34,197,94,.92);border-color:rgba(255,255,255,.82);color:#052e16;'
      : state === 'locked'
      ? 'background:rgba(127,29,29,.92);border-color:rgba(254,202,202,.72);color:#fff1f2;'
      : 'background:rgba(34,197,94,.96);border-color:rgba(255,255,255,.94);color:#052e16;'

  return L.divIcon({
    className: `saga-mission-node-icon-wrap saga-mission-node-icon-wrap--${state}`,
    html: `<div style="
      width:30px;
      height:30px;
      border-radius:999px;
      border:2px solid;
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:${state === 'locked' ? '14px' : '13px'};
      font-weight:900;
      box-shadow:0 8px 24px rgba(15,23,42,.28);
      backdrop-filter:blur(10px);
      ${styles}
    ">${label}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })
}

export function MapSurface({
  currentStage,
  missionStages = [],
  currentLevel = 0,
  className,
  playerPosition,
  gpsState,
  debugSimulation,
  followPlayer = true,
  focusRequest,
  nodeState = 'locked',
  otherPlayers = [],
  selfLabel = 'YO',
  onDebugSetPosition,
  onNodeTap,
  onMapTilesReady,
  introFlyToCoords,
}: MapSurfaceProps) {
  const mapRootRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const nodeMarkerRef = useRef<L.CircleMarker | null>(null)
  const nodeRadiusRef = useRef<L.Circle | null>(null)
  const playerMarkerRef = useRef<L.Marker | null>(null)
  const playerAuraRef = useRef<L.CircleMarker | null>(null)
  const playerAuraModeRef = useRef<'gps' | 'debug' | null>(null)
  const otherPlayerMarkersRef = useRef<Map<string, L.Marker>>(new Map())
  const otherPlayerMarkerStateRef = useRef<Map<string, string>>(new Map())
  const routeNodeLayersRef = useRef<L.Layer[]>([])
  const onNodeTapRef = useRef(onNodeTap)
  const lastNodeFrameRef = useRef<string | null>(null)
  const lastPlayerFrameRef = useRef<string | null>(null)
  const lastFocusTokenRef = useRef<number | null>(null)

  useEffect(() => {
    onNodeTapRef.current = onNodeTap
  }, [onNodeTap])

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

    map.setView([40.0, -4.0], 4)  // arranca en Europa — flyTo llegará al jugador
    mapRef.current = map

    // Notificar cuando los primeros tiles estén cargados
    let tilesNotified = false
    map.on('tileloadend', () => {
      if (!tilesNotified) {
        tilesNotified = true
        onMapTilesReady?.()
      }
    })
    // Fallback: si no hay tiles en 3s, notificar igualmente
    const tileTimeout = setTimeout(() => {
      if (!tilesNotified) {
        tilesNotified = true
        onMapTilesReady?.()
      }
    }, 3000)
    ;(mapRef as React.MutableRefObject<L.Map & { _tileTimeout?: ReturnType<typeof setTimeout> }>).current._tileTimeout = tileTimeout

    return () => {
      playerMarkerRef.current?.remove()
      playerAuraRef.current?.remove()
      nodeMarkerRef.current?.remove()
      nodeRadiusRef.current?.remove()
      routeNodeLayersRef.current.forEach((layer) => layer.remove())
      routeNodeLayersRef.current = []
      otherPlayerMarkersRef.current.forEach((marker) => marker.remove())
      otherPlayerMarkersRef.current.clear()
      otherPlayerMarkerStateRef.current.clear()
      map.remove()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      clearTimeout((map as any)._tileTimeout)
      mapRef.current = null
      playerMarkerRef.current = null
      playerAuraRef.current = null
      playerAuraModeRef.current = null
      nodeMarkerRef.current = null
      nodeRadiusRef.current = null
    }
  }, [])


  useEffect(() => {
    if (typeof document === 'undefined') return
    if (document.getElementById('saga-player-aura-style')) return

    const style = document.createElement('style')
    style.id = 'saga-player-aura-style'
    style.textContent = `
      .saga-player-aura--gps {
        animation: sagaPlayerAuraPulse 1.35s ease-in-out infinite;
      }

      .saga-player-aura--debug {
        animation: sagaPlayerAuraPulse 1.05s ease-in-out infinite;
      }

      @keyframes sagaPlayerAuraPulse {
        0% { opacity: 0.95; }
        50% { opacity: 0.25; }
        100% { opacity: 0.95; }
      }
    `
    document.head.appendChild(style)
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
    routeNodeLayersRef.current.forEach((layer) => layer.remove())
    routeNodeLayersRef.current = []
    nodeMarkerRef.current = null
    nodeRadiusRef.current = null

    const stages = Array.isArray(missionStages) && missionStages.length > 0
      ? missionStages
      : currentStage
      ? [currentStage]
      : []

    const stageNodes = stages
      .map((stage, index) => ({
        stage,
        index,
        data: resolveStageMapData(stage),
      }))
      .filter((entry): entry is { stage: PlayerStage; index: number; data: NonNullable<ReturnType<typeof resolveStageMapData>> } => Boolean(entry.data))

    if (stageNodes.length === 0) {
      map.invalidateSize({ pan: false })
      return
    }

    const activeIndex = Math.max(0, Math.min(currentLevel || 0, stageNodes.length - 1))
    const routeLatLngs = stageNodes.map((entry) => L.latLng(entry.data.lat, entry.data.lon))

    if (routeLatLngs.length > 1) {
      const routeLine = L.polyline(routeLatLngs, {
        color: '#64748b',
        weight: 3,
        opacity: 0.42,
        dashArray: '6 8',
        interactive: false,
      }).addTo(map)
      routeNodeLayersRef.current.push(routeLine)
    }

    let activeRadiusLayer: L.Circle | null = null

    for (const entry of stageNodes) {
      const { data, index } = entry
      const state =
        index < activeIndex
          ? 'completed'
          : index === activeIndex
          ? 'current'
          : 'locked'

      const center: L.LatLngExpression = [data.lat, data.lon]

      if (state === 'current') {
        const visual = getNodeVisualConfig(nodeState)

        const radiusLayer = L.circle(center, {
          radius: data.radius,
          color: visual.ringColor,
          weight: visual.ringWeight,
          opacity: visual.ringOpacity,
          fillColor: visual.ringColor,
          fillOpacity: visual.ringFillOpacity,
          className: `saga-node-radius saga-node-radius--${nodeState}`,
        }).addTo(map)

        const markerLayer = L.marker(center, {
          icon: createMissionNodeIcon(index, 'current'),
          keyboard: false,
          zIndexOffset: 720,
        }).addTo(map)

        markerLayer.bindTooltip(data.name, {
          direction: 'top',
          opacity: 0.92,
        })

        if (onNodeTapRef.current) {
          radiusLayer.on('click', () => onNodeTapRef.current?.())
          markerLayer.on('click', () => onNodeTapRef.current?.())
        }

        nodeRadiusRef.current = radiusLayer
        nodeMarkerRef.current = markerLayer as unknown as L.CircleMarker
        activeRadiusLayer = radiusLayer
        routeNodeLayersRef.current.push(radiusLayer, markerLayer)
        continue
      }

      const ringColor = state === 'completed' ? '#22c55e' : '#ef4444'
      const ringFill = state === 'completed' ? '#bbf7d0' : '#fecaca'

      const ghostRadius = L.circle(center, {
        radius: Math.max(16, Math.min(data.radius, 40)),
        color: ringColor,
        weight: 2,
        opacity: state === 'completed' ? 0.42 : 0.58,
        fillColor: ringFill,
        fillOpacity: state === 'completed' ? 0.10 : 0.14,
        interactive: false,
      }).addTo(map)

      const ghostMarker = L.marker(center, {
        icon: createMissionNodeIcon(index, state),
        keyboard: false,
        zIndexOffset: state === 'locked' ? 540 : 560,
      }).addTo(map)

      ghostMarker.bindTooltip(
        state === 'locked' ? `Bloqueado · ${data.name}` : `Completado · ${data.name}`,
        {
          direction: 'top',
          opacity: 0.88,
        }
      )

      routeNodeLayersRef.current.push(ghostRadius, ghostMarker)
    }

    const nodeFrameKey = stageNodes
      .map((entry) => `${entry.index}:${entry.data.lat}:${entry.data.lon}:${entry.data.radius}`)
      .join('|') + `:active:${activeIndex}`

    if (lastNodeFrameRef.current !== nodeFrameKey && !playerPosition) {
      lastNodeFrameRef.current = nodeFrameKey
      lastPlayerFrameRef.current = null

      if (activeRadiusLayer) {
        map.fitBounds(activeRadiusLayer.getBounds(), {
          padding: [56, 56],
          maxZoom: 16,
          animate: true,
          duration: 0.25,
        })
      } else {
        const activeNode = stageNodes[Math.min(activeIndex, stageNodes.length - 1)]
        map.setView([activeNode.data.lat, activeNode.data.lon], 15, {
          animate: true,
          duration: 0.25,
        })
      }
    }

    map.invalidateSize({ pan: false })
  }, [
    currentStage,
    missionStages,
    currentLevel,
    onNodeTap,
    nodeState,
    Boolean(playerPosition),
  ])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!playerPosition) {
      playerMarkerRef.current?.remove()
      playerMarkerRef.current = null
      playerAuraRef.current?.remove()
      playerAuraRef.current = null
      playerAuraModeRef.current = null
      map.invalidateSize({ pan: false })
      return
    }

    const nextLatLng = L.latLng(playerPosition.lat, playerPosition.lon)

    const auraMode =
      debugSimulation ? 'debug' : gpsState === 'ready' || gpsState === 'stale' ? 'gps' : null

    if (!auraMode) {
      playerAuraRef.current?.remove()
      playerAuraRef.current = null
      playerAuraModeRef.current = null
    } else {
      const auraClassName =
        auraMode === 'debug' ? 'saga-player-aura--debug' : 'saga-player-aura--gps'
      const auraColor = auraMode === 'debug' ? '#ef4444' : '#22c55e'
      const auraFill = auraMode === 'debug' ? '#f87171' : '#4ade80'

      if (!playerAuraRef.current || playerAuraModeRef.current !== auraMode) {
        playerAuraRef.current?.remove()
        playerAuraRef.current = L.circleMarker(nextLatLng, {
          radius: 34,
          color: auraColor,
          weight: 5,
          opacity: 0.9,
          fillColor: auraFill,
          fillOpacity: 0.30,
          className: auraClassName,
          interactive: false,
        }).addTo(map)
        playerAuraModeRef.current = auraMode
      } else {
        playerAuraRef.current.setLatLng(nextLatLng)
      }

      playerAuraRef.current.bringToFront()
    }

    if (!playerMarkerRef.current) {
      playerMarkerRef.current = L.marker(nextLatLng, {
        icon: createAvatarIcon({ display_name: 'YO', user: 'YO', avatar_initials: 'YO' }, 'self'),
        keyboard: false,
      }).addTo(map)

      playerMarkerRef.current.bindTooltip('YO', {
        direction: 'top',
        opacity: 0.92,
      })
      playerMarkerRef.current.bindPopup(
        buildPlayerPopup({ display_name: 'YO', user: 'YO', avatar_initials: 'YO', gps_status: gpsState }, 'self'),
        {
          closeButton: true,
          autoPan: true,
          keepInView: true,
        }
      )
      playerMarkerRef.current.off('click')
      playerMarkerRef.current.on('click', () => playerMarkerRef.current?.openPopup())
    } else {
      playerMarkerRef.current.setLatLng(nextLatLng)
    }

    playerMarkerRef.current.setZIndexOffset(1000)

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
            duration: 0.25,
          })
        }
      } else {
        map.setView([playerPosition.lat, playerPosition.lon], 16, {
          animate: true,
          duration: 0.25,
        })
      }
    }
  }, [playerPosition?.lat, playerPosition?.lon, stageMapData, followPlayer, selfLabel, gpsState, debugSimulation])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const seen = new Set<string>()

    for (const player of otherPlayers) {
      if (player.is_self) continue
      if (typeof player.lat !== 'number' || typeof player.lon !== 'number') continue

      const key = String(player.user || player.display_name || `${player.lat}:${player.lon}`)
      seen.add(key)

      const presence = String(player.presence || 'offline').toLowerCase()
      const kind =
        presence === 'offline'
          ? 'offline'
          : presence === 'stale'
          ? 'recent'
          : 'live'

      const label = player.display_name || player.user
      const nextLatLng = L.latLng(player.lat, player.lon)
      const existing = otherPlayerMarkersRef.current.get(key)

      if (existing) {
        existing.setLatLng(nextLatLng)
        existing.setIcon(createAvatarIcon(player, kind))
        existing.setZIndexOffset(900)
        existing.bindPopup(buildPlayerPopup(player, kind), {
          closeButton: true,
          autoPan: true,
          keepInView: true,
        })
        existing.off('click')
        existing.on('click', () => existing.openPopup())
        continue
      }

      const marker = L.marker(nextLatLng, {
        icon: createAvatarIcon(player, kind),
        keyboard: false,
        riseOnHover: true,
        bubblingMouseEvents: false,
        zIndexOffset: 900,
      }).addTo(map)

      marker.bindTooltip(label, {
        direction: 'top',
        opacity: 0.92,
      })
      marker.on('click', () => marker.openPopup())

      otherPlayerMarkersRef.current.set(key, marker)
    }

    for (const [key, marker] of otherPlayerMarkersRef.current.entries()) {
      if (seen.has(key)) continue
      marker.remove()
      otherPlayerMarkersRef.current.delete(key)
      otherPlayerMarkerStateRef.current.delete(key)
    }
  }, [otherPlayers])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !focusRequest) return
    if (lastFocusTokenRef.current === focusRequest.token) return
    lastFocusTokenRef.current = focusRequest.token

    map.invalidateSize({ pan: false })

    if (focusRequest.target === 'player' && playerPosition) {
      map.stop()
      map.flyTo([playerPosition.lat, playerPosition.lon], 17, {
        animate: true,
        duration: 0.60,
        easeLinearity: 0.22,
      })
      return
    }

    if (focusRequest.target === 'route') {
      if (stageMapData && playerPosition) {
        const bounds = L.latLngBounds(
          [stageMapData.lat, stageMapData.lon],
          [playerPosition.lat, playerPosition.lon]
        )

        const routeDistance = getDistanceMeters(playerPosition, {
          lat: stageMapData.lat,
          lon: stageMapData.lon,
        })

        const targetZoom =
          routeDistance > 100000 ? 6 :
          routeDistance > 25000 ? 8 :
          routeDistance > 5000 ? 11 :
          routeDistance > 1000 ? 13 :
          routeDistance > 250 ? 15 :
          17

        map.stop()
        map.invalidateSize({ pan: false })

        if (routeDistance > 100000) {
          const center = bounds.getCenter()
          map.flyTo(center, targetZoom, {
            animate: true,
            duration: 0.65,
            easeLinearity: 0.22,
          })
        } else {
          map.flyToBounds(bounds.pad(0.18), {
            paddingTopLeft: [44, 132],
            paddingBottomRight: [44, 190],
            maxZoom: targetZoom,
            animate: true,
            duration: 0.65,
            easeLinearity: 0.22,
          })
        }

        return
      }

      if (playerPosition) {
        map.stop()
        map.flyTo([playerPosition.lat, playerPosition.lon], 17, {
          animate: true,
          duration: 0.25,
        })
        return
      }
    }

    if (focusRequest.target === 'node' && stageMapData) {
      map.stop()
      map.flyTo([stageMapData.lat, stageMapData.lon], 17, {
        animate: true,
        duration: 0.60,
        easeLinearity: 0.22,
      })
    }
  }, [
    focusRequest,
    playerPosition?.lat,
    playerPosition?.lon,
    stageMapData?.lat,
    stageMapData?.lon,
    stageMapData?.radius,
  ])

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
  will-change: transform;
  transform: translateZ(0);
          width: 42px;
          height: 42px;
          border-radius: 999px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 950;
          border: 3px solid rgba(255,255,255,.94);
          box-shadow: 0 12px 30px rgba(15,23,42,.34), inset 0 1px 0 rgba(255,255,255,.35);
          color: #ffffff;
          background: linear-gradient(135deg, var(--saga-player-color, #22c55e), rgba(15,23,42,.72));
          overflow: hidden;
          transition: transform 160ms ease, opacity 160ms ease;
        }

.saga-avatar-pin--self {
  min-width: 42px;
  padding: 0 7px;
          width: 46px;
          height: 46px;
          border-color: rgba(255,255,255,.98);
          box-shadow: 0 14px 34px rgba(15,23,42,.38), 0 0 0 8px color-mix(in srgb, var(--saga-player-color, #22c55e) 20%, transparent);
        }

.saga-avatar-pin--live {
          border-color: rgba(187,247,208,.92);
        }

.saga-avatar-pin--recent {
          opacity: .86;
          border-color: rgba(253,230,138,.88);
        }

.saga-avatar-pin--offline {
          opacity: .62;
          filter: grayscale(.35);
          border-color: rgba(203,213,225,.82);
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
