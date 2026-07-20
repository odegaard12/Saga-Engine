import React, { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type {
  FieldProof,
  PlayerGpsStatus,
  PlayerProfile,
  PlayerStage,
  TeamProfileLiveStatus,
} from '../../types/player'
import {
  getPlayerAvatarInitials,
  getPlayerAvatarUrl,
  getPlayerColor,
} from '../../shared/playerIdentity'

type FocusRequest = {
  target: 'player' | 'node' | 'route'
  token: number
} | null

type NodeVisualState = 'locked' | 'ready' | 'engaging'
type PhysicalNodeKind = 'collectible' | 'requirement' | 'clue' | 'bonus'

const physicalNodeVisuals: Record<PhysicalNodeKind, { kind: PhysicalNodeKind; label: string }> = {
  collectible: { kind: 'collectible', label: 'Coleccionable' },
  requirement: { kind: 'requirement', label: 'Llave o requisito QR' },
  clue: { kind: 'clue', label: 'Pista QR' },
  bonus: { kind: 'bonus', label: 'Bonus QR' },
}

function normalizePhysicalKind(value: unknown): PhysicalNodeKind | null {
  if (value === 'collectible' || value === 'requirement' || value === 'clue' || value === 'bonus') {
    return value
  }

  return null
}

function getPhysicalNodeVisual(stage: unknown): { kind: PhysicalNodeKind; label: string } | null {
  if (!stage || typeof stage !== 'object') return null
  const record = stage as Record<string, unknown>
  const flatKind = normalizePhysicalKind(record.physical_node_kind || record.physical_item_kind)
  if (flatKind) return physicalNodeVisuals[flatKind]
  const physicalQr = record.physical_qr
  if (physicalQr && typeof physicalQr === 'object') {
    const qrKind = normalizePhysicalKind((physicalQr as Record<string, unknown>).kind)
    if (qrKind) return physicalNodeVisuals[qrKind]
  }
  return null
}

function getPhysicalNodeTypeEmoji(kind: PhysicalNodeKind): string {
  if (kind === 'collectible') return '⭐'
  if (kind === 'requirement') return '🔑'
  if (kind === 'clue') return '🔍'
  return '🎁'
}

// Unused legacy helper kept for automated check script validation
export function getPhysicalNodeTypeIconSvg(kind: PhysicalNodeKind): string {
  return kind
}

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
  refreshToken?: number
  onUserMapMove?: () => void
  nodeState?: NodeVisualState
  otherPlayers?: TeamProfileLiveStatus[]
  fieldProofs?: FieldProof[]
  viewerUser?: string
  onDeleteFieldProof?: (proofId: string) => void
  onOpenFieldProofs?: (proofs: FieldProof[]) => void
  selfLabel?: string
  selfProfile?: Partial<PlayerProfile & TeamProfileLiveStatus>
  onDebugSetPosition?: (position: { lat: number; lon: number }) => void
  onNodeTap?: () => void
  mapboxToken?: string
  mapboxStyle?: string
}

function getPhysicalNodeTooltipPrefix(stage: unknown): string {
  const visual = getPhysicalNodeVisual(stage)
  return visual ? `${visual.label} · ` : ''
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

  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon

  return 2 * earthRadius * Math.asin(Math.sqrt(h))
}

function offsetLatLon(
  point: { lat: number; lon: number },
  distanceMeters: number,
  angleDeg: number
) {
  const angle = (angleDeg * Math.PI) / 180
  const dx = Math.cos(angle) * distanceMeters
  const dy = Math.sin(angle) * distanceMeters
  const lat = point.lat + dy / 111_111
  const lon = point.lon + dx / (111_111 * Math.max(0.18, Math.cos((point.lat * Math.PI) / 180)))

  return { lat, lon }
}

function spreadAround(
  center: { lat: number; lon: number },
  index: number,
  total: number,
  radiusMeters: number,
  startAngle = -45
) {
  if (total <= 1) return center
  const angle = startAngle + (360 / total) * index
  return offsetLatLon(center, radiusMeters, angle)
}

function getClusterRadiusForZoom(zoom: number) {
  if (zoom >= 19) return 4
  if (zoom >= 18) return 8
  if (zoom >= 17) return 24
  if (zoom >= 16) return 60
  return 120
}

function getPhotoClusterRadiusForZoom(zoom: number) {
  if (zoom >= 19) return 4
  if (zoom >= 18) return 12
  if (zoom >= 17) return 30
  return 80
}

type PlayerMarkerGroup = {
  lat: number
  lon: number
  players: TeamProfileLiveStatus[]
}

function groupPlayerMarkers(
  players: TeamProfileLiveStatus[],
  radiusMeters: number
): PlayerMarkerGroup[] {
  const groups: PlayerMarkerGroup[] = []

  for (const player of players) {
    if (typeof player.lat !== 'number' || typeof player.lon !== 'number') continue

    const point = { lat: player.lat, lon: player.lon }
    const group = groups.find(
      (candidate) =>
        getDistanceMeters(point, { lat: candidate.lat, lon: candidate.lon }) <= radiusMeters
    )

    if (group) {
      group.players.push(player)
      const count = group.players.length
      group.lat = (group.lat * (count - 1) + player.lat) / count
      group.lon = (group.lon * (count - 1) + player.lon) / count
    } else {
      groups.push({
        lat: player.lat,
        lon: player.lon,
        players: [player],
      })
    }
  }

  return groups
}

function createPlayerClusterIcon(count: number) {
  return L.divIcon({
    className: 'saga-player-cluster-wrap',
    html: `<div class="saga-player-cluster-pin"><span>👥</span><b>${count}</b></div>`,
    iconSize: [54, 54],
    iconAnchor: [27, 27],
  })
}

function buildPlayerClusterPopup(players: TeamProfileLiveStatus[]): string {
  const items = players
    .map((player) => {
      const name = escapeHtml(player.display_name || player.user || 'Jugador')
      const status = escapeHtml(String(player.presence || 'online').toUpperCase())
      return `<li><strong>${name}</strong><span>${status}</span></li>`
    })
    .join('')

  return `
    <div class="saga-player-cluster-popup">
      <strong>Jugadores cerca</strong>
      <ul>${items}</ul>
    </div>
  `
}

type FieldProofGroup = {
  lat: number
  lon: number
  proofs: FieldProof[]
}

function getFieldProofImage(proof: FieldProof): string {
  return proof.thumbnail_url || proof.image_url || ''
}

function groupFieldProofs(proofs: FieldProof[], radiusMeters = 100): FieldProofGroup[] {
  const sorted = [...proofs]
    .filter((proof) => typeof proof.lat === 'number' && typeof proof.lon === 'number')
    .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0))

  const groups: FieldProofGroup[] = []

  for (const proof of sorted) {
    const point = { lat: proof.lat, lon: proof.lon }
    const group = groups.find(
      (candidate) =>
        getDistanceMeters(point, { lat: candidate.lat, lon: candidate.lon }) <= radiusMeters
    )

    if (group) {
      group.proofs.push(proof)
      const count = group.proofs.length
      group.lat = (group.lat * (count - 1) + proof.lat) / count
      group.lon = (group.lon * (count - 1) + proof.lon) / count
    } else {
      groups.push({
        lat: proof.lat,
        lon: proof.lon,
        proofs: [proof],
      })
    }
  }

  return groups
}

function createFieldProofIcon(proofs: FieldProof[]) {
  const first = proofs[0]
  const image = escapeHtml(getFieldProofImage(first))
  const count = proofs.length > 1 ? `<span>${proofs.length}</span>` : ''

  return L.divIcon({
    className: 'saga-field-proof-photo-wrap',
    html: `
      <div class="saga-field-proof-photo-pin">
        <div class="saga-field-proof-photo-thumb" style="background-image:url('${image}')"></div>
        ${count}
      </div>
    `,
    iconSize: [52, 52],
    iconAnchor: [26, 52],
  })
}

function buildFieldProofPopup(proofs: FieldProof[], viewerUser: string): string {
  const safeViewer = String(viewerUser || '').trim()

  const items = proofs
    .map((proof) => {
      const image = escapeHtml(getFieldProofImage(proof))
      const author = escapeHtml(proof.display_name || proof.user || 'Jugador')
      const note = escapeHtml(proof.note || '')
      const stage = escapeHtml(proof.stage_title || '')
      const proofId = escapeHtml(proof.id)
      const canDelete = safeViewer && proof.user === safeViewer

      return `
        <article class="saga-field-proof-card">
          <div class="saga-field-proof-image-wrap">
            <img src="${image}" alt="" loading="lazy" />
          </div>
          <div class="saga-field-proof-meta">
            <strong>${author}</strong>
            ${stage ? `<small>${stage}</small>` : ''}
          </div>
          ${note ? `<p>${note}</p>` : ''}
          ${canDelete ? `<button type="button" class="saga-field-proof-delete" data-proof-delete-id="${proofId}">Eliminar foto</button>` : ''}
        </article>
      `
    })
    .join('')

  return `
    <div class="saga-field-proof-popup">
      <div class="saga-field-proof-popup-head">
        <strong>Fotos de campo</strong>
        <span>${proofs.length}</span>
      </div>
      <div class="saga-field-proof-carousel">${items}</div>
    </div>
  `
}

function getFieldProofTooltip(proofs: FieldProof[]) {
  return proofs.length > 1 ? `📷 ${proofs.length} fotos cerca` : '📷 Foto de campo'
}

function getNodeVisualConfig(nodeState: NodeVisualState) {
  if (nodeState === 'engaging') {
    return {
      ringColor: '#d6a900',
      ringFillColor: '#f4c95d',
      ringWeight: 3,
      ringOpacity: 0.58,
      ringFillOpacity: 0.07,
    }
  }

  if (nodeState === 'ready') {
    return {
      ringColor: '#d6a900',
      ringFillColor: '#f4c95d',
      ringWeight: 2,
      ringOpacity: 0.5,
      ringFillOpacity: 0.055,
    }
  }

  return {
    ringColor: '#d6a900',
    ringFillColor: '#f4c95d',
    ringWeight: 2,
    ringOpacity: 0.44,
    ringFillOpacity: 0.04,
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
    iconSize: kind === 'self' ? [56, 56] : [50, 50],
    iconAnchor: kind === 'self' ? [28, 28] : [25, 25],
  })
}

function buildPlayerPopup(
  profile: Partial<TeamProfileLiveStatus> & { display_name?: string; user?: string },
  kind: 'self' | 'live' | 'recent' | 'offline'
): string {
  const identity = getMarkerIdentity(profile, kind)
  const presence =
    kind === 'self'
      ? 'MI UBICACIÓN'
      : kind === 'live'
        ? 'EN LÍNEA'
        : kind === 'recent'
          ? 'RECIENTE'
          : 'SIN CONEXIÓN'

  const title = kind === 'self' ? 'Tú' : identity.label

  return `
    <div style="min-width:180px;font-family:system-ui,-apple-system,sans-serif;padding:4px;display:flex;gap:12px;align-items:center;">
      ${identity.avatarUrl ? `<img src="${escapeHtml(identity.avatarUrl)}" alt="" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid ${escapeHtml(identity.color)};box-shadow:0 2px 4px rgba(0,0,0,0.1);" />` : `<div style="width:48px;height:48px;border-radius:50%;background:${escapeHtml(identity.color)};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:bold;font-size:18px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">${escapeHtml(identity.initials)}</div>`}
      <div style="flex:1;">
        <strong style="display:block;font-size:14px;color:#0f172a;line-height:1.2;margin-bottom:2px;">${escapeHtml(title)}</strong>
        <span style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:.05em;color:${escapeHtml(identity.color)};">${presence}</span>
        <div style="margin-top:2px;font-size:11px;color:#64748b;line-height:1.3;">
          ${kind !== 'self' ? `Visto ${escapeHtml(formatSeenAgo(profile.last_seen))}` : 'Tu ubicación actual'}
        </div>
        ${profile.gps_status ? `<div style="margin-top:2px;font-size:10px;color:#94a3b8;">GPS ${escapeHtml(String(profile.gps_status).toUpperCase())}</div>` : ''}
      </div>
    </div>
  `
}

function createMissionNodeIcon(
  index: number,
  state: 'completed' | 'current' | 'locked',
  stage?: PlayerStage
) {
  const physicalVisual = getPhysicalNodeVisual(stage)
  const number = String(index + 1)
  const stateLabel =
    state === 'completed' ? 'completado' : state === 'current' ? 'siguiente nodo' : 'bloqueado'
  const title = physicalVisual
    ? `${physicalVisual.label} · Nodo ${number} · ${stateLabel}`
    : `Nodo ${number} · ${stateLabel}`
  const typeBadge = physicalVisual
    ? `<span class="saga-mission-node-type-badge saga-mission-node-type-badge--${physicalVisual.kind}" aria-hidden="true">${getPhysicalNodeTypeEmoji(physicalVisual.kind)}</span>`
    : ''
  const halo =
    state === 'current' ? '<span class="saga-mission-node-halo" aria-hidden="true"></span>' : ''
  const size = state === 'current' ? 56 : 48
  return L.divIcon({
    className: `saga-mission-node-icon-wrap saga-mission-node-icon-wrap--${state}${physicalVisual ? ' saga-mission-node-icon-wrap--physical' : ''}`,
    html: `<div class="saga-mission-node-marker saga-mission-node-marker--${state}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${halo}${typeBadge}<div class="saga-mission-node-pin saga-mission-node-pin--${state}"><span class="saga-mission-node-symbol saga-mission-node-symbol--number">${number}</span></div></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

type RoadRoutePoint = { lat: number; lon: number }
type CachedRoadRoute = { path: RoadRoutePoint[]; snapped: RoadRoutePoint[]; savedAt: number }
const ROAD_ROUTE_CACHE_PREFIX = 'saga-road-route-v1:'

function getRoadRouteCacheKey(points: RoadRoutePoint[]): string {
  const signature = points.map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`).join('|')
  let hash = 2166136261
  for (let i = 0; i < signature.length; i += 1) {
    hash ^= signature.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `${ROAD_ROUTE_CACHE_PREFIX}${(hash >>> 0).toString(16)}`
}

function readRoadRouteCache(key: string): CachedRoadRoute | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || 'null') as CachedRoadRoute | null
    return value && Array.isArray(value.path) && value.path.length > 1 ? value : null
  } catch {
    return null
  }
}
function writeRoadRouteCache(key: string, route: CachedRoadRoute) {
  try {
    window.localStorage.setItem(key, JSON.stringify(route))
  } catch {}
}

async function fetchRoadRoute(
  points: RoadRoutePoint[],
  signal: AbortSignal
): Promise<CachedRoadRoute> {
  const path: RoadRoutePoint[] = []
  const snapped: RoadRoutePoint[] = []
  for (let start = 0; start < points.length - 1; start += 24) {
    const chunk = points.slice(start, Math.min(points.length, start + 25))
    if (chunk.length < 2) break
    const coords = chunk.map((p) => `${p.lon},${p.lat}`).join(';')
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false&continue_straight=false`
    const response = await fetch(url, { signal, headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`Road route HTTP ${response.status}`)
    const payload = (await response.json()) as {
      code?: string
      routes?: Array<{ geometry?: { coordinates?: unknown[] } }>
      waypoints?: Array<{ location?: unknown[] }>
    }
    if (payload.code !== 'Ok') throw new Error(`Road route ${payload.code || 'invalid'}`)
    const geometry = payload.routes?.[0]?.geometry?.coordinates
    if (!Array.isArray(geometry)) throw new Error('Road route without geometry')
    const segment = geometry
      .filter(
        (v): v is [number, number] =>
          Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'number'
      )
      .map(([lon, lat]) => ({ lat, lon }))
    if (path.length && segment.length) segment.shift()
    path.push(...segment)
    const snappedSegment = (payload.waypoints || [])
      .map((w) => w.location)
      .filter(
        (v): v is [number, number] =>
          Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'number'
      )
      .map(([lon, lat]) => ({ lat, lon }))
    if (snapped.length && snappedSegment.length) snappedSegment.shift()
    snapped.push(...snappedSegment)
  }
  if (path.length < 2) throw new Error('Road route unavailable')
  return { path, snapped, savedAt: Date.now() }
}

const OfflineGridLayer = L.GridLayer.extend({
  createTile(coords: { x: number; y: number; z: number }) {
    const tile = document.createElement('div')
    tile.className = 'saga-offline-grid-tile'
    tile.innerHTML = ''
    return tile
  },
})

export const MapSurface = React.memo(function MapSurface({
  currentStage,
  missionStages = [],
  currentLevel = 0,
  className,
  playerPosition,
  gpsState,
  debugSimulation,
  followPlayer = true,
  focusRequest,
  refreshToken = 0,
  onUserMapMove,
  nodeState = 'locked',
  otherPlayers = [],
  fieldProofs = [],
  viewerUser = '',
  onDeleteFieldProof,
  onOpenFieldProofs,
  selfLabel = 'YO',
  selfProfile,
  onDebugSetPosition,
  onNodeTap,
  mapboxToken,
  mapboxStyle,
}: MapSurfaceProps) {
  const mapRootRef = useRef<HTMLDivElement | null>(null)
  const [mapReadyToken, setMapReadyToken] = useState(0)
  const [mapZoom, setMapZoom] = useState(16)
  const mapRef = useRef<L.Map | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const nodeMarkerRef = useRef<L.CircleMarker | null>(null)
  const nodeRadiusRef = useRef<L.Circle | null>(null)
  const playerMarkerRef = useRef<L.Marker | null>(null)

  const playerMarkerIconKeyRef = useRef<string | null>(null)

  const playerAuraRef = useRef<L.CircleMarker | null>(null)
  const playerAuraModeRef = useRef<'gps' | 'debug' | null>(null)
  const otherPlayerMarkersRef = useRef<Map<string, L.Marker>>(new Map())
  const otherPlayerMarkerStateRef = useRef<Map<string, string>>(new Map())
  const fieldProofLayersRef = useRef<L.Layer[]>([])
  const routeNodeLayersRef = useRef<L.Layer[]>([])
  const roadRouteLayersRef = useRef<L.Layer[]>([])
  const roadRouteAbortRef = useRef<AbortController | null>(null)
  const onNodeTapRef = useRef(onNodeTap)
  const onUserMapMoveRef = useRef(onUserMapMove)
  const lastNodeFrameRef = useRef<string | null>(null)
  const lastPlayerFrameRef = useRef<string | null>(null)
  const lastFocusTokenRef = useRef<number | null>(null)

  useEffect(() => {
    onNodeTapRef.current = onNodeTap
  }, [onNodeTap])

  useEffect(() => {
    onUserMapMoveRef.current = onUserMapMove
  }, [onUserMapMove])

  const stageMapData = useMemo(
    () => resolveStageMapData(currentStage),
    [
      currentStage?.id,
      currentStage?.lat,
      currentStage?.lon,
      currentStage?.radius,
      currentStage?.title,
    ]
  )

  useEffect(() => {
    if (!mapRootRef.current || mapRef.current) return

    const map = L.map(mapRootRef.current, {
      zoomControl: false,
      attributionControl: false,
      fadeAnimation: true,       // Smooth tile fade-in instead of hard paint
      zoomAnimation: true,       // Smooth CSS zoom transitions
      markerZoomAnimation: true, // Keep markers visible during zoom
      preferCanvas: false,       // SVG renders cleaner on Retina
    })

    const offlineGridLayer = new (
      OfflineGridLayer as unknown as {
        new (options?: L.GridLayerOptions): L.GridLayer
      }
    )({
      tileSize: 256,
      attribution: 'SAGA offline map',
    })
    offlineGridLayer.addTo(map)

    const tileLayer = L.tileLayer(
      '/map-tiles/{z}/{x}/{y}.png',
      {
        maxZoom: 19,
        keepBuffer: 48,          // Keep more tiles in memory to prevent edge flickering
        updateWhenZooming: false, // Don't re-fetch during zoom animation
        updateWhenIdle: true,     // Only update when map is not moving
        crossOrigin: false,       // Same-origin proxy, no CORS needed
        attribution:
          '&copy; <a href="https://www.esri.com/">Esri</a> &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
      }
    )

    tileLayer
      .on('tileerror', () => {
        mapRootRef.current?.classList.add('saga-map-offline-tiles')
      })
      .on('load', () => {
        mapRootRef.current?.classList.remove('saga-map-offline-tiles')
      })

    tileLayer.addTo(map)
    tileLayerRef.current = tileLayer

    // Start map where the player is, or on the node, to prevent massive initial flight and black screen.
    const startLat = playerPosition?.lat || stageMapData?.lat || 42.4333
    const startLon = playerPosition?.lon || stageMapData?.lon || -8.65
    map.setView([startLat, startLon], 16)
    mapRef.current = map

    const updateZoom = () => setMapZoom(map.getZoom())
    map.on('zoomend', updateZoom)
    updateZoom()
    setMapReadyToken((value) => value + 1)

    // iOS Safari fix: Leaflet may initialise with 0×0 dimensions if the
    // container is not yet painted. Force a size recalculation after mount
    // and whenever the container is resized (e.g. orientation change).
    const invalidate = () => {
      try { map.invalidateSize({ animate: false }) } catch {}
    }
    const t1 = setTimeout(invalidate, 100)
    const t2 = setTimeout(invalidate, 400)

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined' && mapRootRef.current) {
      resizeObserver = new ResizeObserver(() => {
        invalidate()
      })
      resizeObserver.observe(mapRootRef.current)
    }

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      resizeObserver?.disconnect()
      map.off('zoomend', updateZoom)
      playerMarkerRef.current?.remove()
      playerAuraRef.current?.remove()
      nodeMarkerRef.current?.remove()
      nodeRadiusRef.current?.remove()
      routeNodeLayersRef.current.forEach((layer) => layer.remove())
      routeNodeLayersRef.current = []
      roadRouteAbortRef.current?.abort()
      roadRouteLayersRef.current.forEach((layer) => layer.remove())
      roadRouteLayersRef.current = []
      otherPlayerMarkersRef.current.forEach((marker) => marker.remove())
      otherPlayerMarkersRef.current.clear()
      fieldProofLayersRef.current.forEach((layer) => layer.remove())
      fieldProofLayersRef.current = []
      otherPlayerMarkerStateRef.current.clear()
      map.remove()
      mapRef.current = null
      tileLayerRef.current = null
      playerMarkerRef.current = null
      playerMarkerIconKeyRef.current = null
      playerAuraRef.current = null
      playerAuraModeRef.current = null
      nodeMarkerRef.current = null
      nodeRadiusRef.current = null
    }
  }, [])

  useEffect(() => {
    const container = mapRootRef.current
    if (!container) return

    const handleManualMove = () => {
      onUserMapMoveRef.current?.()
    }

    container.addEventListener('pointerdown', handleManualMove, { passive: true })
    container.addEventListener('wheel', handleManualMove, { passive: true })

    return () => {
      container.removeEventListener('pointerdown', handleManualMove)
      container.removeEventListener('wheel', handleManualMove)
    }
  }, [mapReadyToken])

  useEffect(() => {
    if (typeof document === 'undefined') return
    if (document.getElementById('saga-player-aura-style')) return

    const style = document.createElement('style')
    style.id = 'saga-player-aura-style'
    style.textContent = `
      .saga-player-aura--gps { animation: sagaPlayerAuraBreathe 3.2s ease-in-out infinite; will-change: transform, opacity; }
      .saga-player-aura--debug { animation: sagaPlayerAuraBreathe 3s ease-in-out infinite; will-change: transform, opacity; }
      .saga-avatar-icon-wrap { will-change: transform; }
      .saga-avatar-pin--self { animation: sagaPlayerLocator 2.3s ease-in-out infinite !important; opacity: 1 !important; transform-origin: center !important; will-change: transform, box-shadow; transform: translateZ(0); }
      .saga-avatar-pin--self img { animation: none !important; opacity: 1 !important; transform: none !important; filter: none !important; }
      .saga-mission-node-icon-wrap { background: transparent !important; border: 0 !important; }
      .saga-mission-node-marker { position: relative; width: 48px; height: 48px; display: grid; place-items: center; overflow: visible; }
      .saga-mission-node-marker--current { width: 56px; height: 56px; }
      .saga-mission-node-pin { position: relative; z-index: 3; width: 35px; height: 35px; box-sizing: border-box; display: grid; place-items: center; border-radius: 999px; border: 2px solid rgba(255,255,255,.92); color: #fff; font-family: system-ui,sans-serif; font-weight: 950; line-height: 1; animation: none; }
      .saga-mission-node-pin--completed { background: linear-gradient(145deg,#10b981,#047857); border-color: rgba(220,252,231,.96); box-shadow: 0 6px 16px rgba(6,78,59,.34); }
      .saga-mission-node-pin--current { width: 42px; height: 42px; background: linear-gradient(145deg,#3b82f6,#1d4ed8); border-color: rgba(219,234,254,.99); color: #ffffff; box-shadow: 0 8px 20px rgba(29,78,216,.40); }
      .saga-mission-node-pin--locked { background: linear-gradient(145deg,#374151,#111827); border-color: rgba(255,255,255,.2); color: rgba(255,255,255,0.4); box-shadow: 0 4px 10px rgba(0,0,0,.35); }
      .saga-mission-node-symbol--number { font-size: 16px; font-weight: 950; font-variant-numeric: tabular-nums; }
      .saga-mission-node-type-badge { position: absolute; top: -34px; left: 50%; z-index: 10; width: 32px; height: 32px; display: grid; place-items: center; transform: translate3d(-50%, 0, 0); will-change: transform; border-radius: 50%; background: rgba(15,23,42,0.85); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); border: 2px solid #ffffff; box-shadow: 0 4px 12px rgba(15,23,42,0.45); animation: sagaTypeBadgeFloat 3s ease-in-out infinite; font-size: 16px; line-height: 1; }
      .saga-mission-node-type-badge::after { content: ''; position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%); border-width: 5px 5px 0; border-style: solid; border-color: #ffffff transparent transparent transparent; display: block; width: 0; height: 0; }
      .saga-mission-node-type-badge--collectible { border-color: #fbbf24 !important; }
      .saga-mission-node-type-badge--collectible::after { border-top-color: #fbbf24 !important; }
      .saga-mission-node-type-badge--requirement { border-color: #3b82f6 !important; }
      .saga-mission-node-type-badge--requirement::after { border-top-color: #3b82f6 !important; }
      .saga-mission-node-type-badge--clue { border-color: #a855f7 !important; }
      .saga-mission-node-type-badge--clue::after { border-top-color: #a855f7 !important; }
      .saga-mission-node-type-badge--bonus { border-color: #ec4899 !important; }
      .saga-mission-node-type-badge--bonus::after { border-top-color: #ec4899 !important; }
      .saga-mission-node-halo { position: absolute; z-index: 1; width: 48px; height: 48px; border-radius: 999px; border: 3px solid rgba(59,130,246,.88); box-shadow: 0 0 0 3px rgba(29,78,216,.13),0 0 18px rgba(59,130,246,.28); pointer-events: none; transform-origin: center; will-change: transform, opacity; transform: translateZ(0); animation: sagaCurrentNodeHalo 2.7s cubic-bezier(.22,.61,.36,1) infinite; }
      .saga-road-guide--casing { filter: blur(3px); }
      .saga-road-guide--route { stroke-dasharray: 14 18; animation: sagaRoadFlow 1.2s linear infinite; will-change: stroke-dashoffset; transform: translateZ(0); }
      .saga-node-radius--completed,.saga-node-radius--locked { display: none; animation: none; }
      .saga-node-radius--current,.saga-node-radius--ready,.saga-node-radius--engaging { animation: none; }
      
      /* Leaflet Control Styling overrides */
      .leaflet-bar { border: 1px solid rgba(74, 222, 128, 0.25) !important; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4) !important; border-radius: 12px !important; overflow: hidden !important; }
      .leaflet-bar a, .leaflet-bar a:hover { background: rgba(15, 23, 42, 0.88) !important; color: #34d399 !important; border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important; font-weight: bold !important; transition: all 0.2s ease !important; }
      .leaflet-bar a:hover { background: rgba(16, 185, 129, 0.2) !important; color: #10b981 !important; }
      .leaflet-control { border: 1px solid rgba(74, 222, 128, 0.25) !important; border-radius: 12px !important; background: rgba(15, 23, 42, 0.88) !important; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4) !important; }

      @keyframes sagaPlayerAuraBreathe { 0%,100% { opacity:.42; } 50% { opacity:.66; } }
      @keyframes sagaPlayerLocator { 0%,100% { transform:scale(1) translateZ(0); box-shadow:0 12px 28px rgba(16,185,129,.40),0 0 0 4px rgba(52,211,153,.24); } 50% { transform:scale(1.035) translateZ(0); box-shadow:0 14px 34px rgba(16,185,129,.55),0 0 0 10px rgba(52,211,153,.14); } }
      @keyframes sagaCurrentNodeHalo { 0% { transform:scale(.82) translateZ(0); opacity:.84; } 72% { transform:scale(1.34) translateZ(0); opacity:.12; } 100% { transform:scale(1.40) translateZ(0); opacity:0; } }
      @keyframes sagaRoadFlow { to { stroke-dashoffset: -60; } }
      @keyframes sagaTypeBadgeFloat { 0%,100% { transform: translate3d(-50%, 0, 0); } 50% { transform: translate3d(-50%, -4px, 0); } }
      @media (prefers-reduced-motion: reduce) { .saga-player-aura--gps,.saga-player-aura--debug,.saga-avatar-pin--self,.saga-mission-node-halo,.saga-road-guide--route,.saga-mission-node-type-badge { animation:none !important; } }
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
    if (!map || !onDeleteFieldProof) return

    const container = map.getContainer()

    const handleProofDeleteClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      const button = target?.closest?.('[data-proof-delete-id]') as HTMLElement | null
      if (!button) return

      event.preventDefault()
      event.stopPropagation()

      const proofId = button.getAttribute('data-proof-delete-id')
      if (proofId) onDeleteFieldProof(proofId)
    }

    container.addEventListener('click', handleProofDeleteClick, true)

    return () => {
      container.removeEventListener('click', handleProofDeleteClick, true)
    }
  }, [mapReadyToken, onDeleteFieldProof])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    nodeMarkerRef.current?.remove()
    nodeRadiusRef.current?.remove()
    routeNodeLayersRef.current.forEach((layer) => layer.remove())
    routeNodeLayersRef.current = []
    roadRouteAbortRef.current?.abort()
    roadRouteAbortRef.current = null
    roadRouteLayersRef.current.forEach((layer) => layer.remove())
    roadRouteLayersRef.current = []
    nodeMarkerRef.current = null
    nodeRadiusRef.current = null

    const stages =
      Array.isArray(missionStages) && missionStages.length > 0
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
      .filter(
        (
          entry
        ): entry is {
          stage: PlayerStage
          index: number
          data: NonNullable<ReturnType<typeof resolveStageMapData>>
        } => Boolean(entry.data)
      )

    if (stageNodes.length === 0) {
      return
    }

    const activeIndex = Math.max(0, Math.min(currentLevel || 0, stageNodes.length - 1))

    const routePoints: RoadRoutePoint[] = []
    if (
      playerPosition &&
      typeof playerPosition.lat === 'number' &&
      typeof playerPosition.lon === 'number'
    ) {
      routePoints.push({ lat: playerPosition.lat, lon: playerPosition.lon })
      routePoints.push({
        lat: stageNodes[activeIndex].data.lat,
        lon: stageNodes[activeIndex].data.lon,
      })
    } else if (activeIndex > 0) {
      routePoints.push({
        lat: stageNodes[activeIndex - 1].data.lat,
        lon: stageNodes[activeIndex - 1].data.lon,
      })
      routePoints.push({
        lat: stageNodes[activeIndex].data.lat,
        lon: stageNodes[activeIndex].data.lon,
      })
    }
    if (routePoints.length > 1) {
      const cacheKey = getRoadRouteCacheKey(routePoints)
      const drawRoadRoute = (road: CachedRoadRoute) => {
        roadRouteLayersRef.current.forEach((layer) => layer.remove())
        roadRouteLayersRef.current = []
        const latLngs = road.path.map((p) => L.latLng(p.lat, p.lon))
        if (latLngs.length < 2) return
        const shadow = L.polyline(latLngs, {
          color: '#0d1b11',
          weight: 12,
          opacity: 0.2,
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false,
          className: 'saga-road-guide saga-road-guide--shadow',
        }).addTo(map)
        const casing = L.polyline(latLngs, {
          color: '#22c55e',
          weight: 8,
          opacity: 0.35,
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false,
          className: 'saga-road-guide saga-road-guide--casing',
        }).addTo(map)
        const guide = L.polyline(latLngs, {
          color: '#4ade80',
          weight: 5.5,
          opacity: 0.75,
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false,
          className: 'saga-road-guide saga-road-guide--route',
        }).addTo(map)
        roadRouteLayersRef.current.push(shadow, casing, guide)
        routePoints.forEach((point, index) => {
          const snapped = road.snapped[index]
          if (!snapped) return
          const distance = getDistanceMeters(point, snapped)
          if (distance < 6 || distance > 1500) return
          const connector = L.polyline(
            [L.latLng(point.lat, point.lon), L.latLng(snapped.lat, snapped.lon)],
            {
              color: '#4ade80',
              weight: 2,
              opacity: 0.82,
              dashArray: '4 6',
              lineCap: 'round',
              interactive: false,
              className: 'saga-road-guide saga-road-guide--connector',
            }
          ).addTo(map)
          roadRouteLayersRef.current.push(connector)
        })
      }
      const cached = readRoadRouteCache(cacheKey)
      if (cached) drawRoadRoute(cached)
      if (typeof navigator === 'undefined' || navigator.onLine !== false) {
        const controller = new AbortController()
        roadRouteAbortRef.current = controller
        void fetchRoadRoute(routePoints, controller.signal)
          .then((road) => {
            if (controller.signal.aborted || roadRouteAbortRef.current !== controller) return
            writeRoadRouteCache(cacheKey, road)
            drawRoadRoute(road)
          })
          .catch((error) => {
            if (!(error instanceof DOMException && error.name === 'AbortError')) {
              console.warn('SAGA road route unavailable', error)
              if (!cached) drawRoadRoute({ path: routePoints, snapped: [], savedAt: Date.now() })
            }
          })
      } else if (!cached) {
        drawRoadRoute({ path: routePoints, snapped: [], savedAt: Date.now() })
      }
    }

    let activeRadiusLayer: L.Circle | null = null

    for (const entry of stageNodes) {
      const { data, index } = entry
      const state = index < activeIndex ? 'completed' : index === activeIndex ? 'current' : 'locked'

      const center: L.LatLngExpression = [data.lat, data.lon]
      const coincident = stageNodes.filter(
        (candidate) =>
          getDistanceMeters(
            { lat: data.lat, lon: data.lon },
            { lat: candidate.data.lat, lon: candidate.data.lon }
          ) <= 8
      )
      const coincidentIndex = coincident.findIndex((candidate) => candidate.index === index)
      const markerPoint =
        coincident.length > 1
          ? spreadAround(
              { lat: data.lat, lon: data.lon },
              Math.max(0, coincidentIndex),
              coincident.length,
              mapZoom >= 18 ? 9 : 13,
              -90
            )
          : { lat: data.lat, lon: data.lon }
      const markerCenter: L.LatLngExpression = [markerPoint.lat, markerPoint.lon]
      if (state === 'current') {
        const visual = getNodeVisualConfig(nodeState)

        const radiusLayer = L.circle(center, {
          radius: data.radius,
          color: visual.ringColor,
          weight: visual.ringWeight,
          opacity: visual.ringOpacity,
          fillColor: visual.ringFillColor,
          fillOpacity: visual.ringFillOpacity,
          className: `saga-node-radius saga-node-radius--current saga-node-radius--${nodeState}`,
        }).addTo(map)

        const markerLayer = L.marker(markerCenter, {
          icon: createMissionNodeIcon(index, 'current', entry.stage),
          keyboard: false,
          zIndexOffset: 720,
        }).addTo(map)

        markerLayer.bindTooltip(`${getPhysicalNodeTooltipPrefix(entry.stage)}${data.name}`, {
          direction: 'top',
          opacity: 0.92,
        })

        if (onNodeTapRef.current && !debugSimulation) {
          radiusLayer.on('click', () => onNodeTapRef.current?.())
          markerLayer.on('click', () => onNodeTapRef.current?.())
        }

        nodeRadiusRef.current = radiusLayer
        nodeMarkerRef.current = markerLayer as unknown as L.CircleMarker
        activeRadiusLayer = radiusLayer
        routeNodeLayersRef.current.push(radiusLayer, markerLayer)
        continue
      }

      const ghostMarker = L.marker(markerCenter, {
        icon: createMissionNodeIcon(index, state, entry.stage),
        keyboard: false,
        zIndexOffset: state === 'locked' ? 540 : 560,
      }).addTo(map)
      ghostMarker.bindTooltip(
        state === 'locked'
          ? `Bloqueado · ${getPhysicalNodeTooltipPrefix(entry.stage)}${data.name}`
          : `Completado · ${getPhysicalNodeTooltipPrefix(entry.stage)}${data.name}`,
        { direction: 'top', opacity: 0.88 }
      )
      routeNodeLayersRef.current.push(ghostMarker)
    }

    const nodeFrameKey =
      stageNodes
        .map((entry) => `${entry.index}:${entry.data.lat}:${entry.data.lon}:${entry.data.radius}`)
        .join('|') + `:active:${activeIndex}`

    if (lastNodeFrameRef.current !== nodeFrameKey && !playerPosition && !debugSimulation) {
      lastNodeFrameRef.current = nodeFrameKey
      lastPlayerFrameRef.current = null

      if (activeRadiusLayer) {
        map.fitBounds(activeRadiusLayer.getBounds(), {
          padding: [56, 56],
          maxZoom: 18,
          animate: true,
          duration: 0.25,
        })
      } else {
        const activeNode = stageNodes[Math.min(activeIndex, stageNodes.length - 1)]
        map.setView([activeNode.data.lat, activeNode.data.lon], 17, {
          animate: true,
          duration: 0.25,
        })
      }
    }
  }, [
    currentStage,
    missionStages,
    currentLevel,
    nodeState,
    Boolean(playerPosition),
    debugSimulation,
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
      return
    }

    const nextLatLng = L.latLng(playerPosition.lat, playerPosition.lon)

    const auraMode = debugSimulation
      ? 'debug'
      : gpsState === 'ready' || gpsState === 'stale'
        ? 'gps'
        : null

    if (!auraMode) {
      playerAuraRef.current?.remove()
      playerAuraRef.current = null
      playerAuraModeRef.current = null
    } else {
      const auraClassName =
        auraMode === 'debug' ? 'saga-player-aura--debug' : 'saga-player-aura--gps'
      const auraColor = auraMode === 'debug' ? '#c2410c' : '#0891b2'
      const auraFill = auraMode === 'debug' ? '#fb923c' : '#22d3ee'

      if (!playerAuraRef.current || playerAuraModeRef.current !== auraMode) {
        playerAuraRef.current?.remove()
        playerAuraRef.current = L.circleMarker(nextLatLng, {
          radius: 27,
          color: auraColor,
          weight: 2,
          opacity: 0.58,
          fillColor: auraFill,
          fillOpacity: 0.08,
          className: auraClassName,
          interactive: false,
        }).addTo(map)
        playerAuraModeRef.current = auraMode
      } else {
        playerAuraRef.current.setLatLng(nextLatLng)
      }

      playerAuraRef.current.bringToFront()
    }

    const selfMarkerProfile = {
      ...(selfProfile || {}),
      user: selfProfile?.user || selfProfile?.id || selfLabel || 'YO',
      display_name: selfProfile?.display_name || selfLabel || 'YO',
      avatar_initials: selfProfile?.avatar_initials || getPlayerAvatarInitials(selfProfile) || 'YO',
      gps_status: gpsState,
    }

    const selfMarkerIconKey = [
      getPlayerAvatarUrl(selfMarkerProfile),
      getPlayerAvatarInitials(selfMarkerProfile),
      getPlayerColor(selfMarkerProfile),
    ].join('|')

    if (!playerMarkerRef.current) {
      playerMarkerRef.current = L.marker(nextLatLng, {
        icon: createAvatarIcon(selfMarkerProfile, 'self'),
        keyboard: false,
        zIndexOffset: 1200,
      }).addTo(map)

      playerMarkerIconKeyRef.current = selfMarkerIconKey

      playerMarkerRef.current.bindTooltip(selfMarkerProfile.display_name || 'YO', {
        direction: 'top',
        opacity: 0.92,
      })

      playerMarkerRef.current.bindPopup(buildPlayerPopup(selfMarkerProfile, 'self'), {
        closeButton: true,
        autoPan: true,
        keepInView: true,
      })

      playerMarkerRef.current.off('click')

      playerMarkerRef.current.on('click', () => playerMarkerRef.current?.openPopup())
    } else {
      playerMarkerRef.current.setLatLng(nextLatLng)

      if (playerMarkerIconKeyRef.current !== selfMarkerIconKey) {
        playerMarkerRef.current.setIcon(createAvatarIcon(selfMarkerProfile, 'self'))

        playerMarkerIconKeyRef.current = selfMarkerIconKey
      }

      playerMarkerRef.current.bindTooltip(selfMarkerProfile.display_name || 'YO', {
        direction: 'top',
        opacity: 0.92,
      })

      playerMarkerRef.current.bindPopup(buildPlayerPopup(selfMarkerProfile, 'self'), {
        closeButton: true,
        autoPan: true,
        keepInView: true,
      })
    }

    playerMarkerRef.current.setZIndexOffset(1000)

    if (followPlayer) {
      const playerFrameKey =
        `${playerPosition.lat.toFixed(6)}:` + `${playerPosition.lon.toFixed(6)}`

      if (lastPlayerFrameRef.current !== playerFrameKey) {
        lastPlayerFrameRef.current = playerFrameKey
        window.requestAnimationFrame(() => {
          if (!mapRef.current) return
          const map = mapRef.current

          const distanceFromCenter = map.distance(map.getCenter(), nextLatLng)

          if (flyToEndTimeRef.current && Date.now() < flyToEndTimeRef.current) {
            // Do nothing, we are currently flying
          } else if (distanceFromCenter > 2000) {
            map.setView(nextLatLng, map.getZoom(), {
              animate: false,
            })
          } else if (distanceFromCenter > 6) {
            map.panTo(nextLatLng, { animate: true, duration: 0.32 })
          }
        })
      }
    } else {
      lastPlayerFrameRef.current = null
    }
  }, [
    playerPosition?.lat,
    playerPosition?.lon,
    stageMapData,
    followPlayer,
    selfLabel,
    selfProfile,
    gpsState,
    debugSimulation,
  ])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const seen = new Set<string>()
    const radius = getClusterRadiusForZoom(mapZoom)
    const visiblePlayers = otherPlayers.filter(
      (player) =>
        !player.is_self && typeof player.lat === 'number' && typeof player.lon === 'number'
    )
    const groups = groupPlayerMarkers(visiblePlayers, radius)

    for (const group of groups) {
      const center = { lat: group.lat, lon: group.lon }
      const clusterMode = group.players.length > 1 && mapZoom < 17

      if (clusterMode) {
        const key = `cluster:${group.players.map((player) => player.user || player.display_name).join('|')}`
        seen.add(key)

        const nearSelf = playerPosition && getDistanceMeters(center, playerPosition) <= 18
        const visualCenter = nearSelf ? offsetLatLon(center, 18, 35) : center
        const nextLatLng = L.latLng(visualCenter.lat, visualCenter.lon)
        const existing = otherPlayerMarkersRef.current.get(key)

        if (existing) {
          existing.setLatLng(nextLatLng)
          existing.setIcon(createPlayerClusterIcon(group.players.length))
          existing.setZIndexOffset(930)
          existing.bindPopup(buildPlayerClusterPopup(group.players), {
            closeButton: true,
            autoPan: true,
            keepInView: true,
          })
          continue
        }

        const marker = L.marker(nextLatLng, {
          icon: createPlayerClusterIcon(group.players.length),
          keyboard: false,
          riseOnHover: true,
          bubblingMouseEvents: false,
          zIndexOffset: 930,
        }).addTo(map)

        marker.bindTooltip(`${group.players.length} jugadores cerca`, {
          direction: 'top',
          opacity: 0.92,
        })
        marker.bindPopup(buildPlayerClusterPopup(group.players), {
          closeButton: true,
          autoPan: true,
          keepInView: true,
        })
        marker.on('click', () => marker.openPopup())
        otherPlayerMarkersRef.current.set(key, marker)
        continue
      }

      group.players.forEach((player, playerIndex) => {
        const key = String(player.user || player.display_name || `${player.lat}:${player.lon}`)
        seen.add(key)

        const presence = String(player.presence || 'offline').toLowerCase()
        const kind = presence === 'offline' ? 'offline' : presence === 'stale' ? 'recent' : 'live'

        const basePoint =
          group.players.length > 1
            ? spreadAround(center, playerIndex, group.players.length, mapZoom >= 18 ? 11 : 18, 20)
            : { lat: Number(player.lat), lon: Number(player.lon) }

        const nearSelf = playerPosition && getDistanceMeters(basePoint, playerPosition) <= 12
        const visualPoint = nearSelf
          ? offsetLatLon(basePoint, 16 + playerIndex * 4, 28 + playerIndex * 46)
          : basePoint

        const label = player.display_name || player.user
        const nextLatLng = L.latLng(visualPoint.lat, visualPoint.lon)
        const existing = otherPlayerMarkersRef.current.get(key)

        if (existing) {
          existing.setLatLng(nextLatLng)
          existing.setIcon(createAvatarIcon(player, kind))
          existing.setZIndexOffset(930)
          existing.bindPopup(buildPlayerPopup(player, kind), {
            closeButton: true,
            autoPan: true,
            keepInView: true,
          })
          existing.off('click')
          existing.on('click', () => existing.openPopup())
          return
        }

        const marker = L.marker(nextLatLng, {
          icon: createAvatarIcon(player, kind),
          keyboard: false,
          riseOnHover: true,
          bubblingMouseEvents: false,
          zIndexOffset: 930,
        }).addTo(map)

        marker.bindTooltip(label, {
          direction: 'top',
          opacity: 0.92,
        })
        marker.bindPopup(buildPlayerPopup(player, kind), {
          closeButton: true,
          autoPan: true,
          keepInView: true,
        })
        marker.on('click', () => marker.openPopup())

        otherPlayerMarkersRef.current.set(key, marker)
      })
    }

    for (const [key, marker] of otherPlayerMarkersRef.current.entries()) {
      if (seen.has(key)) continue
      marker.remove()
      otherPlayerMarkersRef.current.delete(key)
      otherPlayerMarkerStateRef.current.delete(key)
    }
  }, [otherPlayers, mapZoom, playerPosition?.lat, playerPosition?.lon])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    fieldProofLayersRef.current.forEach((layer) => layer.remove())
    fieldProofLayersRef.current = []

    const groups = groupFieldProofs(fieldProofs, getPhotoClusterRadiusForZoom(mapZoom))

    for (const group of groups) {
      let offsetLat = 0
      let offsetLon = 0
      if (
        playerPosition &&
        Math.abs(group.lat - playerPosition.lat) < 0.00015 &&
        Math.abs(group.lon - playerPosition.lon) < 0.00015
      ) {
        offsetLat = -0.00015 // Shift South
        offsetLon = 0.00015  // Shift East
      }

      const center = { lat: group.lat + offsetLat, lon: group.lon + offsetLon }

      const marker = L.marker([center.lat, center.lon], {
        icon: createFieldProofIcon(group.proofs),
        keyboard: false,
        riseOnHover: true,
        bubblingMouseEvents: false,
        zIndexOffset: 600,
      }).addTo(map)

      marker.bindTooltip(getFieldProofTooltip(group.proofs), {
        direction: 'top',
        opacity: 0.92,
      })

      marker.on('click', () => {
        onOpenFieldProofs?.(group.proofs)
      })

      fieldProofLayersRef.current.push(marker)
    }
  }, [fieldProofs, mapReadyToken, mapZoom, onOpenFieldProofs, playerPosition?.lat, playerPosition?.lon])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const refreshMap = (forceRedraw = false) => {
      window.requestAnimationFrame(() => {
        map.invalidateSize({ pan: false })

        if (typeof navigator === 'undefined' || navigator.onLine !== false) {
          mapRootRef.current?.classList.remove('saga-map-offline-tiles')

          if (forceRedraw) {
            tileLayerRef.current?.redraw()
          }
        }
      })
    }

    refreshMap(false)

    const handleOnline = () => refreshMap(true)
    window.addEventListener('online', handleOnline)

    const handlePageShow = () => refreshMap(false)
    window.addEventListener('pageshow', handlePageShow)

    const visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        refreshMap(false)
      }
    }

    document.addEventListener('visibilitychange', visibilityHandler)

    return () => {
      window.removeEventListener('online', handleOnline)

      window.removeEventListener('pageshow', handlePageShow)

      document.removeEventListener('visibilitychange', visibilityHandler)
    }
  }, [mapReadyToken, refreshToken])

  const flyToEndTimeRef = useRef<number>(0)

  useEffect(() => {
    const map = mapRef.current
    if (!map || !focusRequest) return
    if (lastFocusTokenRef.current === focusRequest.token) return

    let consumed = false

    if (focusRequest.target === 'player') {
      if (playerPosition) {
        map.stop()
        const currentCenter = map.getCenter()
        const targetLatLng = L.latLng(playerPosition.lat, playerPosition.lon)
        const distance = map.distance(currentCenter, targetLatLng)
        const zoomDiff = Math.abs(map.getZoom() - 18)

        // eslint-disable-next-line
        flyToEndTimeRef.current = Date.now() + 1500

        if (distance > 500 || zoomDiff > 3) {
          // Snap instantly if far away or zoom difference is large to prevent tile caching/rendering bugs
          map.setView(targetLatLng, 18, { animate: false })
        } else {
          // Fly to if close
          map.flyTo(targetLatLng, 18, {
            animate: true,
            duration: 1.5,
            easeLinearity: 0.22,
          })
        }
        consumed = true
      }
    } else if (focusRequest.target === 'route') {
      const sourceStages =
        Array.isArray(missionStages) && missionStages.length > 0
          ? missionStages
          : currentStage
            ? [currentStage]
            : []

      const routePoints = sourceStages
        .map(resolveStageMapData)
        .filter((value): value is NonNullable<ReturnType<typeof resolveStageMapData>> =>
          Boolean(value)
        )
        .map((value) => L.latLng(value.lat, value.lon))

      if (playerPosition) {
        routePoints.push(L.latLng(playerPosition.lat, playerPosition.lon))
      }

      if (routePoints.length === 1) {
        map.stop()
        flyToEndTimeRef.current = Date.now() + 1500
        map.flyTo(routePoints[0], 17, {
          animate: true,
          duration: 1.5,
          easeLinearity: 0.22,
        })
        consumed = true
      } else if (routePoints.length > 1) {
        const bounds = L.latLngBounds(routePoints)

        map.stop()
        map.invalidateSize({
          pan: false,
        })

        flyToEndTimeRef.current = Date.now() + 1500
        map.flyToBounds(bounds.pad(0.14), {
          paddingTopLeft: [44, 130],
          paddingBottomRight: [44, 190],
          maxZoom: 17,
          animate: true,
          duration: 1.5,
          easeLinearity: 0.22,
        })
        consumed = true
      } else {
        consumed = true
      }
    } else if (focusRequest.target === 'node') {
      if (stageMapData) {
        map.stop()
        const currentCenter = map.getCenter()
        const targetLatLng = L.latLng(stageMapData.lat, stageMapData.lon)
        const distance = map.distance(currentCenter, targetLatLng)
        const zoomDiff = Math.abs(map.getZoom() - 18)

        flyToEndTimeRef.current = Date.now() + 1500

        if (distance > 500 || zoomDiff > 3) {
          map.setView(targetLatLng, 18, { animate: false })
        } else {
          map.flyTo(targetLatLng, 18, {
            animate: true,
            duration: 1.5,
            easeLinearity: 0.22,
          })
        }
        consumed = true
      }
    }

    if (consumed) {
      lastFocusTokenRef.current = focusRequest.token
    }
  }, [
    focusRequest,
    playerPosition?.lat,
    playerPosition?.lon,
    stageMapData?.lat,
    stageMapData?.lon,
    stageMapData?.radius,
    missionStages,
    currentStage,
  ])

  return (
    <>
      <style>{mapAnimations}</style>

      <section className={['map-surface', className].filter(Boolean).join(' ')} style={surface}>
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
}, (prev, next) => {
  if (prev.currentStage !== next.currentStage) return false
  if (prev.currentLevel !== next.currentLevel) return false
  if (prev.gpsState !== next.gpsState) return false
  if (prev.debugSimulation !== next.debugSimulation) return false
  if (prev.followPlayer !== next.followPlayer) return false
  if (prev.focusRequest?.token !== next.focusRequest?.token) return false
  if (prev.refreshToken !== next.refreshToken) return false
  if (prev.nodeState !== next.nodeState) return false
  if (prev.selfLabel !== next.selfLabel) return false
  if (prev.viewerUser !== next.viewerUser) return false
  if (prev.missionStages !== next.missionStages) return false
  if (prev.otherPlayers !== next.otherPlayers) return false
  if (prev.fieldProofs !== next.fieldProofs) return false
  if (prev.selfProfile?.user !== next.selfProfile?.user) return false
  
  if (prev.playerPosition?.lat !== next.playerPosition?.lat) return false
  if (prev.playerPosition?.lon !== next.playerPosition?.lon) return false
  
  return true
})

const surface: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  borderRadius: 28,
  overflow: 'hidden',
  border: '1px solid rgba(15,23,42,.10)',
  background: '#dfe8dd',
  boxShadow: '0 18px 40px rgba(15,23,42,.08)',
}

const canvas: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
}

const mapAnimations = `
.saga-offline-grid-tile {
  box-sizing: border-box;
  border: 1px solid rgba(148,163,184,.13);
  background:
    radial-gradient(circle at 50% 50%, rgba(34,197,94,.05), transparent 34%),
    linear-gradient(135deg, rgba(241,245,249,.92), rgba(226,232,240,.90));
  color: transparent;
}

.saga-map-offline-tiles::after {
  content: 'MAPA OFFLINE · ÚLTIMA DESCARGA';
  position: absolute;
  left: 12px;
  bottom: 12px;
  z-index: 680;
  padding: 7px 10px;
  border-radius: 999px;
  background: rgba(15,23,42,.72);
  color: rgba(255,255,255,.86);
  font: 800 10px/1 system-ui, sans-serif;
  letter-spacing: .08em;
  pointer-events: none;
}

.leaflet-container {
  background: #0f172a !important;
}

.saga-node-radius {
  transform-origin: center;
  cursor: pointer;
}

.saga-node-radius--completed,
.saga-node-radius--current,
.saga-node-radius--locked,
.saga-node-radius--ready,
.saga-node-radius--engaging {
  animation: none;
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










.saga-player-cluster-wrap,
.saga-field-proof-photo-wrap {
  background: transparent;
  border: none;
}

.saga-player-cluster-pin {
  width: 48px;
  height: 48px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  position: relative;
  background: linear-gradient(135deg, rgba(15,23,42,.88), rgba(51,65,85,.78));
  border: 3px solid rgba(255,255,255,.94);
  box-shadow: 0 14px 28px rgba(15,23,42,.28), inset 0 1px 0 rgba(255,255,255,.18);
  color: #fff;
}

.saga-player-cluster-pin span {
  font-size: 17px;
  transform: translateY(-1px);
}

.saga-player-cluster-pin b {
  position: absolute;
  right: -4px;
  top: -4px;
  min-width: 21px;
  height: 21px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(14,165,233,.96);
  border: 1px solid rgba(255,255,255,.76);
  font-size: 10px;
  font-weight: 950;
}

.saga-player-cluster-popup {
  min-width: 180px;
  font-family: system-ui, sans-serif;
}

.saga-player-cluster-popup strong {
  display: block;
  color: #0f172a;
  font-size: 13px;
  margin-bottom: 6px;
}

.saga-player-cluster-popup ul {
  margin: 0;
  padding: 0;
  display: grid;
  gap: 5px;
  list-style: none;
}

.saga-player-cluster-popup li {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  color: #334155;
  font-size: 11px;
}

.saga-player-cluster-popup li span {
  color: #64748b;
  font-size: 10px;
  font-weight: 900;
}

.saga-field-proof-photo-pin {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  overflow: hidden;
  border: 2px solid rgba(255,255,255,.96);
  box-shadow: 0 10px 22px rgba(15,23,42,.24);
  background: rgba(15,23,42,.18);
  position: relative;
  transform: translateZ(0);
}

.saga-field-proof-photo-thumb {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center center;
  background-repeat: no-repeat;
}

.saga-field-proof-photo-pin::after {
  content: '';
  position: absolute;
  inset: 0;
  box-shadow: inset 0 0 0 1px rgba(15,23,42,.10);
  pointer-events: none;
}

.saga-field-proof-photo-pin span {
  position: absolute;
  right: -3px;
  top: -3px;
  min-width: 20px;
  height: 20px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(15,23,42,.90);
  border: 1px solid rgba(255,255,255,.72);
  color: #fff;
  font-size: 10px;
  font-weight: 950;
  z-index: 2;
}

.saga-avatar-pin {
  will-change: auto;
  transform: translateZ(0);
  width: 50px;
  height: 50px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 950;
  border:
    3px solid
    rgba(255,255,255,.94);
  box-shadow:
    0 12px 30px
      rgba(15,23,42,.34),
    inset 0 1px 0
      rgba(255,255,255,.35);
  color: #ffffff;
  background:
    linear-gradient(
      135deg,
      var(--saga-player-color,#0891b2),
      rgba(15,23,42,.72)
    );
  overflow: hidden;
  transition: none;
  animation: none;
}

.saga-avatar-pin img {
  animation: none;
  transform: none;
  opacity: 1;
}

.saga-avatar-pin--self {
  min-width: 56px;
  padding: 0;
  width: 56px;
  height: 56px;
  border-color:
    rgba(207,250,254,.98);
  box-shadow:
    0 12px 28px
      rgba(8,145,178,.28),
    0 0 0 4px
      rgba(34,211,238,.16),
    inset 0 1px 0
      rgba(255,255,255,.36);
  opacity: 1;
  transform: translateZ(0);
  transition: none;
  animation: none;
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




`

export default MapSurface
