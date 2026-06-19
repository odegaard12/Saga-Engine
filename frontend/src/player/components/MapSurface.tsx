import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { FieldProof, PlayerGpsStatus, PlayerProfile, PlayerStage, TeamProfileLiveStatus } from '../../types/player'
import { getPlayerAvatarInitials, getPlayerAvatarUrl, getPlayerColor } from '../../shared/playerIdentity'

type FocusRequest =
  | {
      target: 'player' | 'node' | 'route'
      token: number
    }
  | null

type NodeVisualState = 'locked' | 'ready' | 'engaging'
type PhysicalNodeKind = 'collectible' | 'requirement' | 'clue' | 'bonus'

const physicalNodeVisuals: Record<
  PhysicalNodeKind,
  {
    icon: string
    label: string
  }
> = {
  collectible: {
    icon: '\u2605',
    label: 'Coleccionable QR',
  },
  requirement: {
    icon: '\u{1F512}\uFE0E',
    label: 'Requisito QR',
  },
  clue: {
    icon: '?',
    label: 'Pista QR',
  },
  bonus: {
    icon: '\u{1F381}\uFE0E',
    label: 'Bonus QR',
  },
}

function normalizePhysicalKind(value: unknown): PhysicalNodeKind | null {
  if (value === 'collectible' || value === 'requirement' || value === 'clue' || value === 'bonus') {
    return value
  }

  return null
}

function getPhysicalNodeVisual(stage: unknown): { icon: string; label: string } | null {
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
}

function getPhysicalNodeTooltipPrefix(stage: unknown): string {
  const visual = getPhysicalNodeVisual(stage)
  return visual ? `${visual.icon} ${visual.label} · ` : ''
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


function offsetLatLon(point: { lat: number; lon: number }, distanceMeters: number, angleDeg: number) {
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
  if (zoom >= 19) return 12
  if (zoom >= 18) return 28
  if (zoom >= 17) return 60
  return 100
}

type PlayerMarkerGroup = {
  lat: number
  lon: number
  players: TeamProfileLiveStatus[]
}

function groupPlayerMarkers(players: TeamProfileLiveStatus[], radiusMeters: number): PlayerMarkerGroup[] {
  const groups: PlayerMarkerGroup[] = []

  for (const player of players) {
    if (typeof player.lat !== 'number' || typeof player.lon !== 'number') continue

    const point = { lat: player.lat, lon: player.lon }
    const group = groups.find((candidate) =>
      getDistanceMeters(point, { lat: candidate.lat, lon: candidate.lon }) <= radiusMeters
    )

    if (group) {
      group.players.push(player)
      const count = group.players.length
      group.lat = ((group.lat * (count - 1)) + player.lat) / count
      group.lon = ((group.lon * (count - 1)) + player.lon) / count
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
    iconSize: [48, 48],
    iconAnchor: [24, 24],
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
    const group = groups.find((candidate) =>
      getDistanceMeters(point, { lat: candidate.lat, lon: candidate.lon }) <= radiusMeters
    )

    if (group) {
      group.proofs.push(proof)
      const count = group.proofs.length
      group.lat = ((group.lat * (count - 1)) + proof.lat) / count
      group.lon = ((group.lon * (count - 1)) + proof.lon) / count
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
    iconAnchor: [26, 26],
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

function getNodeVisualConfig(
  nodeState: NodeVisualState,
) {
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
      ringOpacity: 0.50,
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


function createMissionNodeIcon(
  index: number,
  state: 'completed' | 'current' | 'locked',
  stage?: PlayerStage,
) {
  const physicalVisual = getPhysicalNodeVisual(stage)
  const number = String(index + 1)
  const title = physicalVisual
    ? `${physicalVisual.label} · Nodo ${number}`
    : state === 'completed'
      ? `Nodo ${number} completado`
      : state === 'current'
        ? `Nodo actual ${number}`
        : `Nodo ${number} bloqueado`

  const topBadge = physicalVisual
    ? `<span class="saga-mission-node-type-badge" aria-hidden="true">${escapeHtml(physicalVisual.icon)}</span>`
    : ''

  const stateBadge = state === 'completed'
    ? '<span class="saga-mission-node-state-badge saga-mission-node-state-badge--done" aria-hidden="true">✓</span>'
    : state === 'locked'
      ? '<span class="saga-mission-node-state-badge saga-mission-node-state-badge--locked" aria-hidden="true">&#128274;&#65038;</span>'
      : ''

  const halo = state === 'current'
    ? '<span class="saga-mission-node-halo" aria-hidden="true"></span><span class="saga-mission-node-halo saga-mission-node-halo--outer" aria-hidden="true"></span>'
    : ''

  const size = state === 'current' ? 58 : 50

  return L.divIcon({
    className: `saga-mission-node-icon-wrap saga-mission-node-icon-wrap--${state}`,
    html:
      `<div class="saga-mission-node-marker saga-mission-node-marker--${state}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">` +
      halo + topBadge +
      `<div class="saga-mission-node-pin saga-mission-node-pin--${state}">` +
      `<span class="saga-mission-node-symbol saga-mission-node-symbol--number">${number}</span>` +
      stateBadge +
      `</div></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

const OfflineGridLayer = L.GridLayer.extend({
  createTile(coords: { x: number; y: number; z: number }) {
    const tile = document.createElement('div')
    tile.className = 'saga-offline-grid-tile'
    tile.innerHTML = ''
    return tile
  },
})

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
}: MapSurfaceProps) {
  const mapRootRef = useRef<HTMLDivElement | null>(null)
  const [mapReadyToken, setMapReadyToken] = useState(0)
  const [mapZoom, setMapZoom] = useState(16)
  const mapRef = useRef<L.Map | null>(null)
  const tileLayerRef =
    useRef<L.TileLayer | null>(null)
  const nodeMarkerRef = useRef<L.CircleMarker | null>(null)
  const nodeRadiusRef = useRef<L.Circle | null>(null)
  const playerMarkerRef =
    useRef<L.Marker | null>(null)

  const playerMarkerIconKeyRef =
    useRef<string | null>(null)

  const playerAuraRef =
    useRef<L.CircleMarker | null>(null)
  const playerAuraModeRef = useRef<'gps' | 'debug' | null>(null)
  const otherPlayerMarkersRef = useRef<Map<string, L.Marker>>(new Map())
  const otherPlayerMarkerStateRef = useRef<Map<string, string>>(new Map())
  const fieldProofLayersRef = useRef<L.Layer[]>([])
  const routeNodeLayersRef = useRef<L.Layer[]>([])
  const onNodeTapRef = useRef(onNodeTap)
  const onUserMapMoveRef =
    useRef(onUserMapMove)
  const lastNodeFrameRef = useRef<string | null>(null)
  const lastPlayerFrameRef = useRef<string | null>(null)
  const lastFocusTokenRef = useRef<number | null>(null)

  useEffect(() => {
    onNodeTapRef.current = onNodeTap
  }, [onNodeTap])

  useEffect(() => {
    onUserMapMoveRef.current =
      onUserMapMove
  }, [onUserMapMove])

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

    const offlineGridLayer = new (OfflineGridLayer as unknown as {
      new(options?: L.GridLayerOptions): L.GridLayer
    })({
      tileSize: 256,
      attribution: 'SAGA offline map',
    })
    offlineGridLayer.addTo(map)

    const tileLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 20,
        maxNativeZoom: 19,
        attribution: 'Tiles © Esri',
      },
    )

    tileLayer
      .on('tileerror', () => {
        mapRootRef.current?.classList.add(
          'saga-map-offline-tiles',
        )
      })
      .on('load', () => {
        mapRootRef.current?.classList.remove(
          'saga-map-offline-tiles',
        )
      })

    tileLayer.addTo(map)
    tileLayerRef.current = tileLayer

    map.setView([42.4333, -8.65], 16)
    mapRef.current = map

    const updateZoom = () => setMapZoom(map.getZoom())
    map.on('zoomend', updateZoom)
    updateZoom()
    setMapReadyToken((value) => value + 1)

    return () => {
      map.off('zoomend', updateZoom)
      playerMarkerRef.current?.remove()
      playerAuraRef.current?.remove()
      nodeMarkerRef.current?.remove()
      nodeRadiusRef.current?.remove()
      routeNodeLayersRef.current.forEach((layer) => layer.remove())
      routeNodeLayersRef.current = []
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
    const map = mapRef.current
    if (!map) return

    const handleManualMove = () => {
      onUserMapMoveRef.current?.()
    }

    map.on('dragstart', handleManualMove)

    return () => {
      map.off('dragstart', handleManualMove)
    }
  }, [mapReadyToken])

  useEffect(() => {
    if (typeof document === 'undefined') return
    if (document.getElementById('saga-player-aura-style')) return

    const style = document.createElement('style')
    style.id = 'saga-player-aura-style'
    style.textContent = `
      .saga-player-aura--gps {
        animation:
          sagaPlayerAuraBreathe
          4.8s
          ease-in-out
          infinite;
      }

      .saga-player-aura--debug {
        animation:
          sagaPlayerAuraBreathe
          4.2s
          ease-in-out
          infinite;
      }

      .saga-avatar-pin--self,
      .saga-avatar-pin--self img {
        animation: none !important;
        opacity: 1 !important;
        transform: translateZ(0) !important;
        filter: none !important;
        will-change: auto !important;
      }

      .saga-mission-node-icon-wrap {
        background: transparent !important;
        border: 0 !important;
      }

      .saga-mission-node-marker {
        position: relative;
        width: 44px;
        height: 44px;
        display: grid;
        place-items: center;
        overflow: visible;
      }

      .saga-mission-node-marker--current {
        width: 52px;
        height: 52px;
      }

      .saga-mission-node-pin {
        position: relative;
        z-index: 2;
        width: 34px;
        height: 34px;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        border:
          2px solid
          rgba(255,255,255,.86);
        color: #ffffff;
        font-family:
          "Segoe UI Symbol",
          "Noto Sans Symbols 2",
          system-ui,
          sans-serif;
        font-size: 12px;
        font-weight: 900;
        line-height: 1;
        transform: translateZ(0);
        animation: none;
      }

      .saga-mission-node-pin--completed {
        background:
          linear-gradient(
            145deg,
            #22c55e,
            #15803d
          );
        border-color:
          rgba(220,252,231,.94);
        box-shadow:
          0 6px 16px
            rgba(20,83,45,.34),
          inset 0 1px 0
            rgba(255,255,255,.24);
      }

      .saga-mission-node-pin--locked {
        background:
          linear-gradient(
            145deg,
            #dc4c4c,
            #991b1b
          );
        border-color:
          rgba(254,226,226,.92);
        box-shadow:
          0 6px 16px
            rgba(127,29,29,.34),
          inset 0 1px 0
            rgba(255,255,255,.20);
      }

      .saga-mission-node-pin--current {
        width: 40px;
        height: 40px;
        background:
          linear-gradient(
            145deg,
            #f4c95d,
            #d6a900
          );
        border-color:
          rgba(255,248,214,.98);
        color: #2f2504;
        font-size: 13px;
        box-shadow:
          0 7px 18px
            rgba(113,83,0,.34),
          inset 0 1px 0
            rgba(255,255,255,.42);
        animation: none;
        will-change: auto;
      }

      .saga-mission-node-halo {
        position: absolute;
        z-index: 1;
        width: 42px;
        height: 42px;
        border-radius: 999px;
        border:
          2px solid
          rgba(244,201,93,.72);
        box-shadow:
          0 0 0 2px
          rgba(214,169,0,.12);
        pointer-events: none;
        transform-origin: center;
        animation:
          sagaCurrentNodeHalo
          3.8s
          cubic-bezier(.22,.61,.36,1)
          infinite;
      }

      .saga-mission-node-symbol {
        position: relative;
        z-index: 2;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        line-height: 1;
      }

      .saga-mission-node-symbol--check {
        font-size: 18px;
      }

      .saga-mission-node-symbol--number {
        font-size: 13px;
        font-variant-numeric:
          tabular-nums;
      }

      .saga-mission-node-symbol--physical {
        font-size: 16px;
      }

      .saga-mission-node-lock-badge {
        position: absolute;
        right: -3px;
        bottom: -3px;
        width: 14px;
        height: 14px;
        display: grid;
        place-items: center;
        border-radius: 999px;
        color: #7f1d1d;
        background:
          rgba(255,255,255,.97);
        border:
          1px solid
          rgba(127,29,29,.22);
        box-shadow:
          0 2px 5px
          rgba(69,10,10,.24);
        font-size: 8px;
        line-height: 1;
      }

      @keyframes sagaPlayerAuraBreathe {
        0%,
        100% {
          opacity: .36;
        }

        50% {
          opacity: .50;
        }
      }

      @keyframes sagaCurrentNodeHalo {
        0% {
          transform: scale(.88);
          opacity: .56;
        }

        68% {
          transform: scale(1.18);
          opacity: .10;
        }

        100% {
          transform: scale(1.24);
          opacity: 0;
        }
      }


      .saga-mission-node-marker { width: 50px; height: 50px; }
      .saga-mission-node-marker--current { width: 58px; height: 58px; }
      .saga-mission-node-pin { width: 36px; height: 36px; }
      .saga-mission-node-pin--current { width: 42px; height: 42px; }
      .saga-mission-node-symbol--number { font-size: 14px; font-weight: 950; }
      .saga-mission-node-type-badge {
        position: absolute; top: -1px; left: 50%; z-index: 4;
        transform: translate(-50%, -42%); min-width: 18px; height: 18px;
        padding: 0 3px; display: grid; place-items: center; border-radius: 999px;
        background: rgba(15,23,42,.94); color: #fff; border: 1.5px solid rgba(255,255,255,.92);
        box-shadow: 0 3px 8px rgba(15,23,42,.34); font-size: 10px; line-height: 1;
      }
      .saga-mission-node-state-badge {
        position: absolute; right: -4px; bottom: -4px; z-index: 4;
        width: 15px; height: 15px; display: grid; place-items: center;
        border-radius: 999px; border: 1px solid rgba(255,255,255,.88);
        box-shadow: 0 2px 6px rgba(15,23,42,.28); font-size: 8px;
      }
      .saga-mission-node-state-badge--done { background: #ecfdf5; color: #166534; }
      .saga-mission-node-state-badge--locked { background: #fff1f2; color: #991b1b; }
      .saga-mission-node-halo { width: 48px; height: 48px; border-width: 3px; animation-duration: 2.8s; }
      .saga-mission-node-halo--outer { width: 54px; height: 54px; opacity: .34; animation-delay: 1.4s; }
      .saga-avatar-pin--self {
        animation: sagaPlayerLocator 2.4s ease-in-out infinite !important;
        opacity: 1 !important; transform-origin: center !important;
      }
      .saga-avatar-pin--self img { opacity: 1 !important; animation: none !important; }
      @keyframes sagaPlayerLocator {
        0%,100% { transform: scale(1) translateZ(0); box-shadow: 0 12px 28px rgba(8,145,178,.28),0 0 0 4px rgba(34,211,238,.16); }
        50% { transform: scale(1.025) translateZ(0); box-shadow: 0 14px 32px rgba(8,145,178,.38),0 0 0 8px rgba(34,211,238,.10); }
      }

      @media (
        prefers-reduced-motion:
        reduce
      ) {
        .saga-player-aura--gps,
        .saga-player-aura--debug,
        .saga-mission-node-halo {
          animation: none !important;
        }
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
      const routeCasing = L.polyline(routeLatLngs, {
        color: '#0f172a',
        weight: 7,
        opacity: 0.42,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false,
      }).addTo(map)
      const routeLine = L.polyline(routeLatLngs, {
        color: '#f8fafc',
        weight: 3,
        opacity: 0.82,
        dashArray: '10 7',
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false,
      }).addTo(map)
      routeNodeLayersRef.current.push(routeCasing, routeLine)
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
      const coincident = stageNodes.filter((candidate) =>
        getDistanceMeters(
          { lat: data.lat, lon: data.lon },
          { lat: candidate.data.lat, lon: candidate.data.lon },
        ) <= 8
      )
      const coincidentIndex = coincident.findIndex((candidate) => candidate.index === index)
      const markerPoint = coincident.length > 1
        ? spreadAround(
            { lat: data.lat, lon: data.lon },
            Math.max(0, coincidentIndex),
            coincident.length,
            mapZoom >= 18 ? 9 : 13,
            -90,
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

      const ringColor =
        state === 'completed'
          ? '#15803d'
          : '#b91c1c'

      const ringFill =
        state === 'completed'
          ? '#22c55e'
          : '#dc4c4c'

      const ghostRadius = L.circle(center, {
        radius: Math.max(16, Math.min(data.radius, 40)),
        color: ringColor,
        weight: 2,
        opacity:
          state === 'completed'
            ? 0.32
            : 0.28,
        fillColor: ringFill,
        fillOpacity:
          state === 'completed'
            ? 0.055
            : 0.04,
        className: `saga-node-radius saga-node-radius--${state}`,
        interactive: false,
      }).addTo(map)

      const ghostMarker = L.marker(markerCenter, {
        icon: createMissionNodeIcon(index, state, entry.stage),
        keyboard: false,
        zIndexOffset: state === 'locked' ? 540 : 560,
      }).addTo(map)

      ghostMarker.bindTooltip(
        state === 'locked' ? `Bloqueado · ${getPhysicalNodeTooltipPrefix(entry.stage)}${data.name}` : `Completado · ${getPhysicalNodeTooltipPrefix(entry.stage)}${data.name}`,
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

    map.invalidateSize({ pan: false })
  }, [
    currentStage,
    missionStages,
    currentLevel,
    onNodeTap,
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
      getPlayerAvatarInitials(
        selfMarkerProfile,
      ),
      getPlayerColor(selfMarkerProfile),
    ].join('|')

    if (!playerMarkerRef.current) {
      playerMarkerRef.current = L.marker(
        nextLatLng,
        {
          icon: createAvatarIcon(
            selfMarkerProfile,
            'self',
          ),
          keyboard: false,
        },
      ).addTo(map)

      playerMarkerIconKeyRef.current =
        selfMarkerIconKey

      playerMarkerRef.current.bindTooltip(
        selfMarkerProfile.display_name || 'YO',
        {
          direction: 'top',
          opacity: 0.92,
        },
      )

      playerMarkerRef.current.bindPopup(
        buildPlayerPopup(
          selfMarkerProfile,
          'self',
        ),
        {
          closeButton: true,
          autoPan: true,
          keepInView: true,
        },
      )

      playerMarkerRef.current.off('click')

      playerMarkerRef.current.on(
        'click',
        () =>
          playerMarkerRef.current?.openPopup(),
      )
    } else {
      playerMarkerRef.current.setLatLng(
        nextLatLng,
      )

      if (
        playerMarkerIconKeyRef.current !==
        selfMarkerIconKey
      ) {
        playerMarkerRef.current.setIcon(
          createAvatarIcon(
            selfMarkerProfile,
            'self',
          ),
        )

        playerMarkerIconKeyRef.current =
          selfMarkerIconKey
      }

      playerMarkerRef.current.bindTooltip(
        selfMarkerProfile.display_name || 'YO',
        {
          direction: 'top',
          opacity: 0.92,
        },
      )

      playerMarkerRef.current.bindPopup(
        buildPlayerPopup(
          selfMarkerProfile,
          'self',
        ),
        {
          closeButton: true,
          autoPan: true,
          keepInView: true,
        },
      )
    }

    playerMarkerRef.current.setZIndexOffset(1000)

    if (followPlayer) {
      const playerFrameKey =
        `${playerPosition.lat.toFixed(6)}:` +
        `${playerPosition.lon.toFixed(6)}`

      if (
        lastPlayerFrameRef.current !==
        playerFrameKey
      ) {
        lastPlayerFrameRef.current =
          playerFrameKey

        const distanceFromCenter =
          map.distance(
            map.getCenter(),
            nextLatLng,
          )

        if (distanceFromCenter > 6) {
          map.panTo(nextLatLng, {
            animate: true,
            duration: 0.32,
          })
        }
      }
    } else {
      lastPlayerFrameRef.current = null
    }
  }, [playerPosition?.lat, playerPosition?.lon, stageMapData, followPlayer, selfLabel, selfProfile, gpsState, debugSimulation])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const seen = new Set<string>()
    const radius = getClusterRadiusForZoom(mapZoom)
    const visiblePlayers = otherPlayers.filter(
      (player) => !player.is_self && typeof player.lat === 'number' && typeof player.lon === 'number'
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
        const kind =
          presence === 'offline'
            ? 'offline'
            : presence === 'stale'
            ? 'recent'
            : 'live'

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
      const center = { lat: group.lat, lon: group.lon }
      const nearSelf = playerPosition && getDistanceMeters(center, playerPosition) <= 16
      const nearOtherPlayer = otherPlayers.some((player) =>
        typeof player.lat === 'number' &&
        typeof player.lon === 'number' &&
        getDistanceMeters(center, { lat: player.lat, lon: player.lon }) <= 16
      )
      const visualCenter =
        nearSelf || nearOtherPlayer
          ? offsetLatLon(center, mapZoom >= 18 ? 14 : 22, -35)
          : center

      const marker = L.marker([visualCenter.lat, visualCenter.lon], {
        icon: createFieldProofIcon(group.proofs),
        keyboard: false,
        riseOnHover: true,
        bubblingMouseEvents: false,
        zIndexOffset: 980,
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
  }, [
    fieldProofs,
    mapReadyToken,
    mapZoom,
    playerPosition?.lat,
    playerPosition?.lon,
    otherPlayers,
    onOpenFieldProofs,
  ])




  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const refreshMap = () => {
      window.requestAnimationFrame(() => {
        map.invalidateSize({ pan: false })

        if (
          typeof navigator === 'undefined' ||
          navigator.onLine !== false
        ) {
          mapRootRef.current?.classList.remove(
            'saga-map-offline-tiles',
          )

          tileLayerRef.current?.redraw()
        }
      })
    }

    refreshMap()

    window.addEventListener(
      'online',
      refreshMap,
    )

    window.addEventListener(
      'pageshow',
      refreshMap,
    )

    const visibilityHandler = () => {
      if (
        document.visibilityState === 'visible'
      ) {
        refreshMap()
      }
    }

    document.addEventListener(
      'visibilitychange',
      visibilityHandler,
    )

    return () => {
      window.removeEventListener(
        'online',
        refreshMap,
      )

      window.removeEventListener(
        'pageshow',
        refreshMap,
      )

      document.removeEventListener(
        'visibilitychange',
        visibilityHandler,
      )
    }
  }, [
    mapReadyToken,
    refreshToken,
  ])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !focusRequest) return
    if (lastFocusTokenRef.current === focusRequest.token) return
    lastFocusTokenRef.current = focusRequest.token

    map.invalidateSize({ pan: false })

    if (focusRequest.target === 'player' && playerPosition) {
      map.stop()
      map.flyTo([playerPosition.lat, playerPosition.lon], 18, {
        animate: true,
        duration: 0.60,
        easeLinearity: 0.22,
      })
      return
    }

    if (focusRequest.target === 'route') {
      const sourceStages =
        Array.isArray(missionStages) &&
        missionStages.length > 0
          ? missionStages
          : currentStage
            ? [currentStage]
            : []

      const routePoints =
        sourceStages
          .map(resolveStageMapData)
          .filter(
            (
              value,
            ): value is NonNullable<
              ReturnType<
                typeof resolveStageMapData
              >
            > => Boolean(value),
          )
          .map((value) =>
            L.latLng(
              value.lat,
              value.lon,
            ),
          )

      if (playerPosition) {
        routePoints.push(
          L.latLng(
            playerPosition.lat,
            playerPosition.lon,
          ),
        )
      }

      if (routePoints.length === 1) {
        map.stop()
        map.flyTo(routePoints[0], 17, {
          animate: true,
          duration: 0.55,
          easeLinearity: 0.22,
        })
        return
      }

      if (routePoints.length > 1) {
        const bounds =
          L.latLngBounds(routePoints)

        map.stop()
        map.invalidateSize({
          pan: false,
        })

        map.flyToBounds(
          bounds.pad(0.14),
          {
            paddingTopLeft: [44, 130],
            paddingBottomRight: [44, 190],
            maxZoom: 17,
            animate: true,
            duration: 0.65,
            easeLinearity: 0.22,
          },
        )

        return
      }

      if (playerPosition) {
        map.stop()
        map.flyTo(
          [
            playerPosition.lat,
            playerPosition.lon,
          ],
          18,
          {
            animate: true,
            duration: 0.35,
          },
        )
      }

      return
    }

    if (focusRequest.target === 'node' && stageMapData) {
      map.stop()
      map.flyTo([stageMapData.lat, stageMapData.lon], 18, {
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
    missionStages,
    currentStage,
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
.saga-offline-grid-tile {
  box-sizing: border-box;
  border: 1px solid rgba(148,163,184,.13);
  background:
    radial-gradient(circle at 50% 50%, rgba(34,197,94,.12), transparent 34%),
    linear-gradient(135deg, rgba(15,23,42,.92), rgba(30,41,59,.90));
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
  width: 42px;
  height: 42px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
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
  min-width: 46px;
  padding: 0;
  width: 46px;
  height: 46px;
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
