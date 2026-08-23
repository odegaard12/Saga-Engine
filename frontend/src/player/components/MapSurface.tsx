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

/**
 * Dibujo de un QR para los nodos con pegatina.
 *
 * Llevaban una impresora, que es lo que se usa para hacerlas, no lo que hay que
 * buscar en el monte. Lo que el jugador tiene delante es una pegatina con un
 * código, así que se dibuja eso: papel blanco y las tres esquinas del código.
 */
// Esto NO sigue al tema, a proposito: es el dibujo de una pegatina de papel,
// negro sobre blanco. Tenido de ladrillo deja de parecer un codigo QR, que es
// justo lo que el jugador tiene que reconocer de lejos.
const TINTA_DE_IMPRENTA = '#0f172a' // no-tema: negro de imprenta

const QR_SVG = `<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
<rect x="1.5" y="1.5" width="21" height="21" rx="3.5" fill="#f8fafc"/>
<g fill="${TINTA_DE_IMPRENTA}">
<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/>
</g>
<g fill="#f8fafc">
<rect x="5.5" y="5.5" width="3" height="3"/><rect x="15.5" y="5.5" width="3" height="3"/><rect x="5.5" y="15.5" width="3" height="3"/>
</g>
<g fill="${TINTA_DE_IMPRENTA}">
<rect x="6.5" y="6.5" width="1" height="1"/><rect x="16.5" y="6.5" width="1" height="1"/><rect x="6.5" y="16.5" width="1" height="1"/>
<rect x="12" y="12" width="2" height="2"/><rect x="16" y="12" width="2" height="2"/><rect x="18" y="15" width="2" height="2"/>
<rect x="12" y="16" width="2" height="2"/><rect x="15" y="18" width="2" height="2"/><rect x="19" y="19" width="1.5" height="1.5"/>
</g>
</svg>`

/**
 * Emoji del nodo en el mapa: los QR llevan el dibujo del código y los
 * coleccionables el icono del objeto concreto (cinta, gemas, hilo...) en vez de
 * una estrella genérica para todos.
 */
function getStageMapEmoji(stage?: PlayerStage): string {
  const record = (stage || {}) as unknown as Record<string, unknown>
  const config =
    record.config && typeof record.config === 'object'
      ? (record.config as Record<string, unknown>)
      : {}

  if (record.qr_payload || record.physical_qr) return QR_SVG

  const custom = String(record.physical_icon || config.physical_icon || '').trim()
  if (custom) return custom

  const visual = getPhysicalNodeVisual(stage)
  return visual ? getPhysicalNodeTypeEmoji(visual.kind) : ''
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
  /** Hint for the initial map position on mount. Uses player GPS or stored position if available. Falls back to node, then Galicia. */
  initialCenter?: { lat: number; lon: number }
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

/**
 * Zoom a partir del cual se dibuja el halo del nodo.
 *
 * Con la ruta entera en pantalla (zoom 13 o menos) los halos de 50 m son
 * puntitos que sólo ensucian. Desde 14 ya se está mirando una zona concreta.
 */
const ZOOM_MINIMO_HALO = 14

/** Nunca más pequeño que esto en pantalla, o desaparece al alejar. */
const RADIO_MINIMO_PX = 20

/**
 * A partir de aquí se avisa de que nos hemos salido del camino.
 *
 * Sólo cambia un texto sobre el mapa: no toca ninguna línea. Con el GPS de un
 * móvil bajo los árboles hay error de sobra para saltar con menos, así que se
 * deja en 50 y no en 30.
 */
const FORA_DO_CAMINO_M = 50

/** Distancia al punto más cercano de un trazado. */
function distanciaAlTrazado(
  desde: { lat: number; lon: number },
  trazado: { lat: number; lon: number }[]
) {
  let minima = Number.POSITIVE_INFINITY
  for (const punto of trazado) {
    const d = getDistanceMeters(desde, punto)
    if (d < minima) minima = d
  }
  return minima
}

/**
 * Radio del nodo en píxeles de pantalla para el zoom actual.
 *
 * Mantiene el radio real (los 50 m de verdad) mientras dé para verse, y a
 * partir de ahí se queda en el mínimo: así el halo señala siempre dónde hay que
 * ir, sin mentir sobre la zona de entrada cuando estás cerca.
 */
function radioDelNodoEnPixeles(map: L.Map, lat: number, metros: number) {
  const metrosPorPixel =
    (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, map.getZoom())
  if (!Number.isFinite(metrosPorPixel) || metrosPorPixel <= 0) return RADIO_MINIMO_PX
  return Math.max(RADIO_MINIMO_PX, metros / metrosPorPixel)
}

/**
 * Trazado guardado en administración para llegar a un nodo (`route_track`).
 *
 * Acepta las dos formas en que se ha ido guardando: pares [lat, lon] y objetos
 * con lat/lon (o latitude/longitude, o lng).
 */
function leerTrackDelNodo(stage: PlayerStage): RoadRoutePoint[] {
  const salida: RoadRoutePoint[] = []
  const crudo = (stage as unknown as Record<string, unknown>).route_track
  if (!Array.isArray(crudo)) return salida

  for (const punto of crudo) {
    let lat: number | null = null
    let lon: number | null = null

    if (Array.isArray(punto) && punto.length >= 2) {
      lat = Number(punto[0])
      lon = Number(punto[1])
    } else if (punto && typeof punto === 'object') {
      const p = punto as Record<string, unknown>
      lat = Number(p.lat ?? p.latitude)
      lon = Number(p.lon ?? p.lng ?? p.longitude)
    }

    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      salida.push({ lat: lat as number, lon: lon as number })
    }
  }

  return salida
}

function getClusterRadiusForZoom(zoom: number) {
  if (zoom >= 19) return 4
  if (zoom >= 18) return 8
  if (zoom >= 17) return 24
  if (zoom >= 16) return 60
  return 120
}

function getPhotoClusterRadiusForZoom(zoom: number) {
  if (zoom >= 19) return 2
  if (zoom >= 18) return 5
  if (zoom >= 17) return 12
  if (zoom >= 16) return 30
  return 60
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
    iconSize: kind === 'self' ? [46, 46] : [42, 42],
    iconAnchor: kind === 'self' ? [23, 23] : [21, 21],
  })
}

function bindMarkerActiveEvents(marker: L.Marker) {
  marker.off('popupopen')
  marker.off('popupclose')
  marker.on('popupopen', () => {
    marker.getElement()?.classList.add('saga-avatar-active')
  })
  marker.on('popupclose', () => {
    marker.getElement()?.classList.remove('saga-avatar-active')
  })
}

/**
 * Lo que se ve al tocar a un compañero en el mapa.
 *
 * Antes decía quién era, si estaba en línea y cuándo se le vio por última vez.
 * Nada de la carrera: ni por qué nodo iba ni cuánto llevaba, que es justo lo
 * que uno quiere saber cuando toca a alguien en mitad de la ruta.
 *
 * Y era blanco, el color por defecto de la librería del mapa, encima de una
 * aplicación entera oscura.
 */
function buildPlayerPopup(
  profile: Partial<TeamProfileLiveStatus> & { display_name?: string; user?: string },
  kind: 'self' | 'live' | 'recent' | 'offline',
  totalNodos = 0
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

  const ms = Number(profile.total_time_ms || 0)
  const tempo = `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`

  const nivel = Number(profile.level || 0)
  const nodo = profile.finished
    ? 'Rematou'
    : totalNodos > 0
      ? `${Math.min(nivel + 1, totalNodos)} / ${totalNodos}`
      : String(nivel + 1)

  const avatar = identity.avatarUrl
    ? `<img src="${escapeHtml(identity.avatarUrl)}" alt="" style="width:42px;height:42px;border-radius:50%;object-fit:cover;border:2px solid ${escapeHtml(identity.color)};" />`
    : `<div style="width:42px;height:42px;border-radius:50%;background:${escapeHtml(identity.color)};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:16px;">${escapeHtml(identity.initials)}</div>`

  const dato = (etiqueta: string, valor: string, destacado = false) => `
    <div style="flex:1;min-width:0;">
      <div style="font-size:${destacado ? '17' : '15'}px;font-weight:900;color:#f8fafc;line-height:1;font-variant-numeric:tabular-nums;">${escapeHtml(valor)}</div>
      <div style="font-size:9px;font-weight:800;letter-spacing:.11em;color:rgba(var(--theme-line), .85);text-transform:uppercase;margin-top:3px;">${escapeHtml(etiqueta)}</div>
    </div>`

  return `
    <div style="min-width:196px;font-family:system-ui,-apple-system,sans-serif;">
      <div style="display:flex;gap:10px;align-items:center;">
        ${avatar}
        <div style="flex:1;min-width:0;">
          <strong style="display:block;font-size:15px;font-weight:900;color:#f8fafc;line-height:1.15;letter-spacing:-.01em;">${escapeHtml(title)}</strong>
          <span style="display:inline-flex;align-items:center;gap:5px;font-size:9px;font-weight:900;letter-spacing:.1em;color:${escapeHtml(identity.color)};margin-top:3px;">
            <span style="width:6px;height:6px;border-radius:50%;background:${escapeHtml(identity.color)};display:inline-block;"></span>${presence}
          </span>
        </div>
      </div>

      <div style="display:flex;gap:12px;margin-top:11px;padding-top:10px;border-top:1px solid rgba(255,255,255,.10);">
        ${dato('Nodo', nodo)}
        ${dato('Tempo', tempo, true)}
      </div>

      <div style="margin-top:8px;font-size:10px;color:rgba(var(--theme-line), .72);">
        ${kind !== 'self' ? `Visto ${escapeHtml(formatSeenAgo(profile.last_seen))}` : 'A túa posición'}
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
  const mapEmoji = getStageMapEmoji(stage)
  const typeBadge = mapEmoji
    ? `<span class="saga-mission-node-type-badge saga-mission-node-type-badge--${physicalVisual?.kind || 'generic'}" aria-hidden="true">${mapEmoji}</span>`
    : ''
  // El aro que late lo dibuja el mapa como una capa única (ver
  // radioDelNodoEnPixeles). Tenerlo también aquí dentro del icono hacía que de
  // lejos se viese uno y de cerca otro distinto.
  const halo = ''
  const size = state === 'current' ? 56 : 48
  /**
   * El color del alfiler lo pone el CSS, por la clase `--${state}`.
   *
   * Aquí había un `style="background:..."` escrito a mano, y como el estilo en
   * línea gana, la regla de CSS del mismo alfiler no pintaba nada: dos
   * verdades sobre el mismo color, y una de ellas muerta sin que se notara.
   *
   * No decían lo mismo, además. El nodo aún por hacer salía ROJO por el estilo
   * en línea, mientras la regla de CSS lo dejaba gris. Lo que se veía en el
   * monte era el rojo, así que es el que se conserva —ahora en el CSS, con las
   * variables del tema, y en un solo sitio—.
   */
  /* La etiqueta colgada del alfiler se probo y se quito (23/8).
   *
   * Dos motivos, los dos de verlo en el mapa de verdad: se solapaba con las
   * fotos de campo y con los alfileres vecinos -que en esta ruta van a menos de
   * 100 m unos de otros-, y el texto que tenia a mano no era el nombre del nodo
   * sino su etiqueta de accesibilidad ("Coleccionable . Nodo 6 . siguiente
   * nodo"), que es otra cosa.
   *
   * El nombre vuelve a la barra de arriba, que ahora es una linea fina y tiene
   * sitio de sobra. */

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
    // Router peatonal (FOSSGIS): el servidor demo de OSRM solo enruta en coche
    // y se negaba a pasar por senderos de tierra.
    const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coords}?overview=full&geometries=geojson&steps=false&continue_straight=false`
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
  initialCenter,
}: MapSurfaceProps) {
  const mapRootRef = useRef<HTMLDivElement | null>(null)
  const [mapReadyToken, setMapReadyToken] = useState(0)
  const [mapZoom, setMapZoom] = useState(16)
  const mapRef = useRef<L.Map | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const nodeMarkerRef = useRef<L.CircleMarker | null>(null)
  const nodeRadiusRef = useRef<L.CircleMarker | null>(null)
  /** Datos del halo del nodo activo, para recalcularlo al cambiar el zoom. */
  const haloDelNodoRef = useRef<{
    capa: L.CircleMarker
    lat: number
    metros: number
    opacidad: number
    opacidadRelleno: number
  } | null>(null)

  /** Reajusta el halo del nodo activo cuando cambia el zoom. */
  function ajustarHaloDelNodo(map: L.Map) {
    const halo = haloDelNodoRef.current
    if (!halo) return

    const visible = map.getZoom() >= ZOOM_MINIMO_HALO
    halo.capa.setRadius(radioDelNodoEnPixeles(map, halo.lat, halo.metros))
    halo.capa.setStyle({
      opacity: visible ? halo.opacidad : 0,
      fillOpacity: visible ? halo.opacidadRelleno : 0,
    })
  }
  const playerMarkerRef = useRef<L.Marker | null>(null)
  const headingConeMarkerRef = useRef<L.Marker | null>(null)
  let headingGroupEl: HTMLDivElement | null = null

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
  const offlineTilesHideTimerRef = useRef<number | null>(null)
  const offlineTilesVisibleSinceRef = useRef<number>(0)

  // Heading cone — dirección de marcha del jugador
  const headingConeRef = useRef<L.SVGOverlay | null>(null)
  const lastHeadingRef = useRef<number | null>(null)

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
        keepBuffer: 150,         // Mantener un buffer enorme para evitar recargas al alejar/acercar
        updateWhenZooming: true, // Cargar teselas de forma fluida DURANTE la animación de zoom (tipo Maps)
        updateWhenIdle: false,   // No esperar a que se pare el mapa para cargar
        crossOrigin: false,       // Same-origin proxy, no CORS needed
        attribution:
          '&copy; <a href="https://www.esri.com/">Esri</a> &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
      }
    )

    tileLayer
      .on('tileerror', () => {
        if (offlineTilesHideTimerRef.current !== null) {
          window.clearTimeout(offlineTilesHideTimerRef.current)
          offlineTilesHideTimerRef.current = null
        }

        const root = mapRootRef.current
        if (!root) return

        if (!root.classList.contains('saga-map-offline-tiles')) {
          offlineTilesVisibleSinceRef.current = Date.now()
        }

        root.classList.add('saga-map-offline-tiles')
      })
      .on('load', () => {
        if (offlineTilesHideTimerRef.current !== null) {
          window.clearTimeout(offlineTilesHideTimerRef.current)
          offlineTilesHideTimerRef.current = null
        }

        const root = mapRootRef.current
        if (!root) return

        const shownForMs = Date.now() - offlineTilesVisibleSinceRef.current
        const minVisibleMs = 300
        const delayMs = Math.max(0, minVisibleMs - shownForMs)

        offlineTilesHideTimerRef.current = window.setTimeout(() => {
          mapRootRef.current?.classList.remove('saga-map-offline-tiles')
          offlineTilesHideTimerRef.current = null
        }, delayMs)
      })

    tileLayer.addTo(map)
    tileLayerRef.current = tileLayer

    // Start map at: 1) supplied initialCenter (player GPS or stored position), 2) node, 3) Galicia fallback
    // This ensures the map does NOT start at the node when we have a known player GPS position.
    const startLat = initialCenter?.lat || stageMapData?.lat || 42.4333
    const startLon = initialCenter?.lon || stageMapData?.lon || -8.65
    map.setView([startLat, startLon], 16)
    mapRef.current = map

    const updateZoom = () => {
      setMapZoom(map.getZoom())
      ajustarHaloDelNodo(map)
    }
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
      if (offlineTilesHideTimerRef.current !== null) {
        window.clearTimeout(offlineTilesHideTimerRef.current)
        offlineTilesHideTimerRef.current = null
      }
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
      .saga-mission-node-pin { position: relative; z-index: 3; width: 35px; height: 35px; box-sizing: border-box; display: grid; place-items: center; border-radius: var(--theme-radius-dot, 999px); border: 2px solid rgba(255,255,255,.92); color: #fff; font-family: system-ui,sans-serif; font-weight: 950; line-height: 1; animation: none; }
      /* Los tres estados del alfiler, en un solo sitio y planos, que es como
         se veian de verdad: el estilo en linea que ganaba era plano, y estas
         reglas tenian degradados que nadie llego a ver nunca. En cristal
         valen los mismos colores exactos de antes. */
      .saga-mission-node-pin--completed { background: rgb(var(--theme-pin-done)); border-color: #ffffff; box-shadow: 0 6px 16px rgba(var(--theme-ok-deep), .34); }
      /* El nodo al que vas. Era azul fijo: en una mision de fuego, el unico
         punto que el jugador tiene que mirar salia del color de otro tema. */
      .saga-mission-node-pin--current { width: 42px; height: 42px; background: rgb(var(--theme-pin)); border-color: #ffffff; color: #ffffff; box-shadow: 0 8px 20px rgba(var(--theme-pin-deep), .40); }
      /* Aun por hacer. En el CSS ponia gris y en la linea rojo; lo que se veia
         en el monte era el rojo, asi que ese es el que queda. */
      .saga-mission-node-pin--locked { background: rgb(var(--theme-pin-todo)); border-color: #ffffff; box-shadow: 0 4px 10px rgba(0,0,0,.35); }
      .saga-mission-node-symbol--number { font-size: 16px; font-weight: 950; font-variant-numeric: tabular-nums; }
      .saga-mission-node-type-badge { position: absolute; top: -34px; left: 50%; z-index: 10; width: 32px; height: 32px; display: grid; place-items: center; transform: translate3d(-50%, 0, 0); will-change: transform; border-radius: var(--theme-radius-dot, 50%); background: rgba(var(--theme-ink), 0.85); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); border: 2px solid #ffffff; box-shadow: 0 4px 12px rgba(var(--theme-ink), 0.45); animation: sagaTypeBadgeFloat 3s ease-in-out infinite; font-size: 16px; line-height: 1; }
      .saga-mission-node-type-badge::after { content: ''; position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%); border-width: 5px 5px 0; border-style: solid; border-color: #ffffff transparent transparent transparent; display: block; width: 0; height: 0; }
      .saga-mission-node-type-badge--collectible { border-color: #fbbf24 !important; }
      .saga-mission-node-type-badge--collectible::after { border-top-color: #fbbf24 !important; }
      .saga-mission-node-type-badge--requirement { border-color: #3b82f6 !important; }
      .saga-mission-node-type-badge--requirement::after { border-top-color: #3b82f6 !important; }
      .saga-mission-node-type-badge--clue { border-color: #a855f7 !important; }
      .saga-mission-node-type-badge--clue::after { border-top-color: #a855f7 !important; }
      .saga-mission-node-type-badge--bonus { border-color: #ec4899 !important; }
      .saga-mission-node-type-badge--bonus::after { border-top-color: #ec4899 !important; }
      .saga-mission-node-halo { position: absolute; z-index: 1; width: 48px; height: 48px; border-radius: var(--theme-radius-dot, 999px); border: 3px solid rgba(var(--theme-pin), .88); box-shadow: 0 0 0 3px rgba(var(--theme-pin-deep), .13),0 0 18px rgba(var(--theme-pin), .28); pointer-events: none; transform-origin: center; will-change: transform, opacity; transform: translateZ(0); animation: sagaCurrentNodeHalo 2.7s cubic-bezier(.22,.61,.36,1) infinite; }
      .saga-road-guide--casing { filter: blur(3px); }
      .saga-road-guide--route { stroke-dasharray: 14 18; animation: sagaRoadFlow 1.2s linear infinite; will-change: stroke-dashoffset; transform: translateZ(0); }

      /* El aro sólo se dibuja para el nodo activo, así que NO se esconde por
         estado. Antes '--locked' lo ocultaba, y locked es justo "todavía no has
         llegado": el halo desaparecía precisamente cuando hace falta para saber
         a dónde vas, y sólo reaparecía al entrar en el radio.
         El latido va aquí, en el aro único, no en un segundo aro del icono. */
      .saga-node-radius--current { display: block !important; animation: sagaCurrentNodeHalo 2.7s ease-in-out infinite !important; transform-origin: center; }
      .saga-node-radius--current,.saga-node-radius--ready,.saga-node-radius--engaging { animation: none; }
      
      /* Leaflet Control Styling overrides */
      .leaflet-bar { border: 1px solid var(--theme-primary-border) !important; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4) !important; border-radius: 12px !important; overflow: hidden !important; }
      .leaflet-bar a, .leaflet-bar a:hover { background: rgba(var(--theme-ink), 0.88) !important; color: var(--theme-primary) !important; border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important; font-weight: bold !important; transition: all 0.2s ease !important; }
      .leaflet-bar a:hover { background: var(--theme-tint-strong) !important; color: var(--theme-primary) !important; }
      .leaflet-control { border: 1px solid var(--theme-primary-border) !important; border-radius: 12px !important; background: rgba(var(--theme-ink), 0.88) !important; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4) !important; }

      @keyframes sagaPlayerAuraBreathe { 0%,100% { opacity:.42; } 50% { opacity:.66; } }
      @keyframes sagaPlayerLocator { 0%,100% { transform:scale(1) translateZ(0); box-shadow:0 12px 28px var(--theme-glow),0 0 0 4px rgba(var(--theme-ok-soft), .24); } 50% { transform:scale(1.035) translateZ(0); box-shadow:0 14px 34px rgba(var(--theme-ok), .55),0 0 0 10px rgba(var(--theme-ok-soft), .14); } }
      /* Latido suave y que NUNCA llegue a opacidad 0: el aro es ahora la única
         señal de dónde hay que ir, y desaparecer a ratos lo hacía perderse. */
      @keyframes sagaCurrentNodeHalo { 0%,100% { opacity:1; } 50% { opacity:.45; } }
      @keyframes sagaRoadFlow { to { stroke-dashoffset: -60; } }
      @keyframes sagaTypeBadgeFloat { 0%,100% { transform: translate3d(-50%, 0, 0); } 50% { transform: translate3d(-50%, -4px, 0); } }
      @media (prefers-reduced-motion: reduce) { .saga-player-aura--gps,.saga-player-aura--debug,.saga-avatar-pin--self,.saga-node-radius--current,.saga-road-guide--route,.saga-mission-node-type-badge { animation:none !important; } }
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

  /**
   * ¿Nos hemos salido del camino?
   *
   * Enciende un aviso sobre el mapa y nada más: no decide qué línea se pinta.
   * Habiendo trazado guardado se sigue el trazado, estemos donde estemos.
   */
  const foraDoCamino = useMemo(() => {
    if (!playerPosition) return false

    const stages =
      Array.isArray(missionStages) && missionStages.length > 0
        ? missionStages
        : currentStage
          ? [currentStage]
          : []

    const nodos = stages
      .map((stage) => ({ stage, data: resolveStageMapData(stage) }))
      .filter((entry) => Boolean(entry.data))

    if (nodos.length === 0) return false

    const activo = nodos[Math.max(0, Math.min(currentLevel || 0, nodos.length - 1))]
    const track = leerTrackDelNodo(activo.stage)

    // Sin trazado no hay camino del que salirse: es el tramo hasta el primer
    // nodo, donde se viene de casa y estar lejos es lo normal.
    if (track.length < 2) return false

    return distanciaAlTrazado(playerPosition, track) > FORA_DO_CAMINO_M
  }, [playerPosition?.lat, playerPosition?.lon, missionStages, currentStage, currentLevel])

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

    /**
     * El camino ya recorrido queda marcado.
     *
     * Antes sólo se pintaba el tramo que tocaba ahora, así que al avanzar de
     * nodo el trozo anterior desaparecía y no quedaba ni rastro de por dónde se
     * había pasado. Los tramos superados se dibujan apagados, por debajo del
     * tramo activo, para que se vea la travesía entera sin robarle atención al
     * que toca. El tramo que se está haciendo ahora no entra aquí: ése lo pinta
     * la línea activa, y pintarlo también en apagado dejaba una línea de más
     * saliendo del nodo anterior, que ya está completado.
     */
    for (let i = 1; i < activeIndex && i < stageNodes.length; i += 1) {
      const puntos = leerTrackDelNodo(stageNodes[i].stage)
      const recorrido =
        puntos.length > 1
          ? puntos
          : [
              { lat: stageNodes[i - 1].data.lat, lon: stageNodes[i - 1].data.lon },
              { lat: stageNodes[i].data.lat, lon: stageNodes[i].data.lon },
            ]

      const latLngs = recorrido.map((p) => L.latLng(p.lat, p.lon))
      if (latLngs.length < 2) continue

      const hecho = L.polyline(latLngs, {
        color: 'rgb(var(--theme-done))',
        weight: 5,
        opacity: 0.42,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false,
        className: 'saga-road-guide--hecho',
      }).addTo(map)

      routeNodeLayersRef.current.push(hecho)
    }

    /**
     * Trazado dibujado a mano en administración para llegar a este nodo.
     *
     * Estando en la ruta manda sobre todo lo demás: la línea tiene que ser el
     * camino que se recorrió y se guardó, no lo que un enrutador decida por su
     * cuenta. Desde lejos no sirve, porque empieza en el nodo anterior y allí no
     * estamos: para eso está la línea que sale de tu posición.
     */
    const destino = stageNodes[activeIndex]
    const trackGuardado = leerTrackDelNodo(destino.stage)

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
      // Puntos de moldeado de ruta definidos en admin (route_via del nodo destino)
      const rawVia = (stageNodes[activeIndex].stage as unknown as Record<string, unknown>)
        .route_via
      if (Array.isArray(rawVia)) {
        for (const item of rawVia) {
          if (Array.isArray(item) && item.length >= 2) {
            const lat = Number(item[0])
            const lon = Number(item[1])
            if (Number.isFinite(lat) && Number.isFinite(lon)) {
              routePoints.push({ lat, lon })
            }
          }
        }
      }
      routePoints.push({
        lat: stageNodes[activeIndex].data.lat,
        lon: stageNodes[activeIndex].data.lon,
      })
    }
    /** Las tres capas de la línea verde: sombra, contorno y trazo. */
    const pintarGuia = (latLngs: L.LatLng[], donde: L.Layer[]) => {
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
        color: 'rgb(var(--theme-done))',
        weight: 8,
        opacity: 0.35,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false,
        className: 'saga-road-guide saga-road-guide--casing',
      }).addTo(map)
      const guide = L.polyline(latLngs, {
        color: 'rgb(var(--theme-done-soft))',
        weight: 5.5,
        opacity: 0.75,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false,
        className: 'saga-road-guide saga-road-guide--route',
      }).addTo(map)
      donde.push(shadow, casing, guide)
    }

    /**
     * El trazado de la ruta se pinta SIEMPRE que exista.
     *
     * Es el camino de verdad, el que se dibujó a mano en administración sobre el
     * GPX, y no lo sustituye nada: ni el enrutador ni la línea de aproximación.
     * Se probó a cambiarlo por la línea desde la posición del jugador cuando
     * estabas lejos y el resultado fue quedarse sin camino hasta el nodo.
     */
    if (trackGuardado.length > 1) {
      pintarGuia(
        trackGuardado.map((p) => L.latLng(p.lat, p.lon)),
        routeNodeLayersRef.current
      )
    }

    /**
     * Y sólo si no hay trazado, la línea que sale de donde estamos.
     *
     * Es el caso de antes de empezar: el primer nodo no tiene trazado guardado
     * (los trazados van de un nodo al siguiente), así que el enrutador te lleva
     * desde donde estés hasta la salida. En cuanto hay trazado manda el trazado
     * y esta línea no se pinta: sumarle encima una segunda línea desde la
     * posición dejaba el mapa con dos caminos distintos hacia el mismo sitio.
     */
    if (trackGuardado.length < 2 && routePoints.length > 1) {
      const cacheKey = getRoadRouteCacheKey(routePoints)
      const drawRoadRoute = (road: CachedRoadRoute) => {
        roadRouteLayersRef.current.forEach((layer) => layer.remove())
        roadRouteLayersRef.current = []
        const latLngs = road.path.map((p) => L.latLng(p.lat, p.lon))
        if (latLngs.length < 2) return
        pintarGuia(latLngs, roadRouteLayersRef.current)
        routePoints.forEach((point, index) => {
          const snapped = road.snapped[index]
          if (!snapped) return
          const distance = getDistanceMeters(point, snapped)
          if (distance < 6 || distance > 1500) return
          const connector = L.polyline(
            [L.latLng(point.lat, point.lon), L.latLng(snapped.lat, snapped.lon)],
            {
              color: 'rgb(var(--theme-done-soft))',
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
              // Sin enrutador, mejor el trazo directo que un mapa sin línea.
              if (!cached) {
                drawRoadRoute({ path: routePoints, snapped: [], savedAt: Date.now() })
              }
            }
          })
      } else if (!cached) {
        // Sin cobertura tampoco se deja el mapa mudo: recta y a caminar.
        drawRoadRoute({ path: routePoints, snapped: [], savedAt: Date.now() })
      }
    }

    // El halo es ahora un círculo de pantalla y no tiene límites geográficos,
    // así que para encuadrar se guardan el centro y el radio en metros.
    let encuadreDelNodo: L.LatLngBounds | null = null

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

        /**
         * UN solo halo para el nodo al que toca ir.
         *
         * Antes había tres cosas dibujadas encima: el círculo geográfico de
         * 50 m, un círculo de tamaño fijo en pantalla y un aro que latía dentro
         * del icono. De lejos se veía uno, de cerca otro, y no parecían lo
         * mismo. Ahora es un único aro: mantiene el radio real cuando el zoom da
         * para verlo, y nunca baja de un mínimo en pantalla para no desaparecer.
         * Por debajo de cierto zoom no se dibuja: con la ruta entera a la vista
         * sólo era ruido.
         */
        const radiusLayer = L.circleMarker(center, {
          radius: radioDelNodoEnPixeles(map, data.lat, data.radius),
          color: visual.ringColor,
          weight: visual.ringWeight,
          opacity: visual.ringOpacity,
          fillColor: visual.ringFillColor,
          fillOpacity: visual.ringFillOpacity,
          className: `saga-node-radius saga-node-radius--current saga-node-radius--${nodeState}`,
        }).addTo(map)

        if (map.getZoom() < ZOOM_MINIMO_HALO) {
          radiusLayer.setStyle({ opacity: 0, fillOpacity: 0 })
        }

        haloDelNodoRef.current = {
          capa: radiusLayer,
          lat: data.lat,
          metros: data.radius,
          opacidad: visual.ringOpacity,
          opacidadRelleno: visual.ringFillOpacity,
        }

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
        encuadreDelNodo = L.latLng(data.lat, data.lon).toBounds(Math.max(40, data.radius) * 2)
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

      if (encuadreDelNodo) {
        map.fitBounds(encuadreDelNodo, {
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

  // Heading cone usando DeviceOrientationEvent
  useEffect(() => {
    if (typeof window === 'undefined') return

    function updateCone(heading: number) {
      lastHeadingRef.current = heading
      const map = mapRef.current
      const pos = playerMarkerRef.current?.getLatLng()
      if (!map || !pos) return

      if (!headingConeMarkerRef.current) {
        headingGroupEl = document.createElement('div')
        headingGroupEl.className = 'saga-player-marker'
        headingGroupEl.style.transform = `rotate(${heading}deg)`
        headingGroupEl.innerHTML = `
          <div class="saga-player-marker-aura"></div>
          <div class="saga-player-marker-cone"></div>
          <div class="saga-player-marker-arrow"></div>
        `
        const icon = L.divIcon({
          html: headingGroupEl,
          className: '',
          iconSize: [140, 140],
          iconAnchor: [70, 70]
        })
        const marker = L.marker(pos, {
          icon,
          interactive: false,
          // POR DEBAJO del avatar (500). Estaba en 900, o sea encima, y el halo
          // azul de esta capa caía sobre la foto del jugador y la teñía. Debajo,
          // el halo y el cono rodean el avatar y la foto se ve limpia; la flecha
          // sale por fuera igual, que es lo que dice hacia dónde miras.
          zIndexOffset: 380
        }).addTo(map)
        
        headingConeMarkerRef.current = marker as any
      }

      if (headingConeMarkerRef.current) {
        headingConeMarkerRef.current.setLatLng(pos)
      }

      if (headingGroupEl) {
        headingGroupEl.style.transform = `rotate(${heading}deg)`
      }
    }

    /**
     * Brújula: escuchar la orientación del móvil.
     *
     * Antes esto pedía el permiso en el PRIMER clic en cualquier parte de la
     * pantalla: el aviso del sistema saltaba al abrir Herramientas, o la
     * Mochila, o lo que tocases primero, sin venir a cuento y sin explicar por
     * qué. Ahora el permiso se pide sólo desde el botón de la pantalla de
     * preparación, que dice para qué es, y aquí únicamente se engancha el
     * escuchador: al arrancar si ya estaba concedido, y en cuanto se conceda.
     */
    const DeviceOrientationEvt = window.DeviceOrientationEvent as any
    const necesitaPermiso = typeof DeviceOrientationEvt?.requestPermission === 'function'

    const engancharBrujula = () => {
      window.removeEventListener('deviceorientation', onOrientation as EventListener, true)
      window.addEventListener('deviceorientation', onOrientation as EventListener, true)
    }

    if (!necesitaPermiso) {
      // Android y escritorio: no hay permiso que pedir.
      engancharBrujula()
    } else {
      // iOS: se engancha cuando la app avisa de que el jugador lo concedió.
      window.addEventListener('saga:motion-granted', engancharBrujula)
    }

    function onOrientation(e: DeviceOrientationEvent) {
      let heading: number | null = null
      if ((e as any).webkitCompassHeading != null) {
        heading = (e as any).webkitCompassHeading as number
      } else if (e.alpha != null) {
        heading = 360 - e.alpha
      }
      if (heading != null && !isNaN(heading)) updateCone(heading)
    }

    const absEvt = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation'
    window.addEventListener(absEvt as 'deviceorientation', onOrientation as EventListener, true)

    return () => {
      window.removeEventListener(absEvt as 'deviceorientation', onOrientation as EventListener, true)
      window.removeEventListener('deviceorientation', onOrientation as EventListener, true)
      window.removeEventListener('saga:motion-granted', engancharBrujula)
      headingConeMarkerRef.current?.remove()
      headingConeMarkerRef.current = null
      headingGroupEl = null
    }
  }, [mapReadyToken])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!playerPosition) {
      playerAuraRef.current?.remove()
      playerAuraRef.current = null
      playerAuraModeRef.current = null
      headingConeMarkerRef.current?.remove()
      headingConeMarkerRef.current = null
      headingConeRef.current?.remove()
      headingConeRef.current = null
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
        // NO interactivo y POR DEBAJO de los nodos.
        //
        // Antes iba a 1200, encima de todo, y se tragaba el toque justo cuando
        // llegabas al nodo: al pulsar salía "MI UBICACIÓN" en vez de abrirse el
        // nodo. Tu propia posición no necesita ser pulsable; el nodo sí.
        interactive: false,
        zIndexOffset: 500,
      }).addTo(map)

      playerMarkerIconKeyRef.current = selfMarkerIconKey

      playerMarkerRef.current.bindTooltip(selfMarkerProfile.display_name || 'YO', {
        direction: 'top',
        opacity: 0.92,
      })
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
    }

    // Se mantiene por debajo de los nodos (560) para no robarles el toque.
    playerMarkerRef.current.setZIndexOffset(500)

    /**
     * Línea desde donde estás hasta el camino del siguiente nodo.
     *
     * El trazado guardado va de nodo a nodo, así que al abrir el mapa se veía la
     * distancia al siguiente punto pero ninguna línea que saliera de ti: el
     * sendero aparecía suelto por delante, sin conectar con tu posición. Va en
     * este efecto, que sí corre con cada actualización del GPS, y no en el que
     * redibuja los nodos: aquél no puede ejecutarse en cada latido.
     */


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
          existing.setZIndexOffset(520)
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
          zIndexOffset: 520,
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
          existing.setZIndexOffset(520)
          existing.bindPopup(buildPlayerPopup(player, kind, missionStages.length), {
            closeButton: true,
            autoPan: true,
            keepInView: true,
          })
          existing.off('click')
          existing.on('click', () => existing.openPopup())
          bindMarkerActiveEvents(existing)
          return
        }

        const marker = L.marker(nextLatLng, {
          icon: createAvatarIcon(player, kind),
          keyboard: false,
          riseOnHover: true,
          bubblingMouseEvents: false,
          zIndexOffset: 520,
        }).addTo(map)

        marker.bindTooltip(label, {
          direction: 'top',
          opacity: 0.92,
        })
        marker.bindPopup(buildPlayerPopup(player, kind, missionStages.length), {
          closeButton: true,
          autoPan: true,
          keepInView: true,
        })
        marker.on('click', () => marker.openPopup())
        bindMarkerActiveEvents(marker)

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

    groups.forEach((group, groupIndex) => {
      const baseCenter = { lat: group.lat, lon: group.lon }
      const nearPlayer = playerPosition && getDistanceMeters(baseCenter, playerPosition) <= 35

      /**
       * Y apartarse tambien de los NODOS, no solo del jugador.
       *
       * Ya habia un desplazamiento para no taparle la flecha al jugador, pero
       * no para los alfileres, y las fotos se hacen JUNTO a un nodo: acaban
       * clavadas encima. Bajarles la capa no basta -se ven a medias detras-;
       * hay que moverlas a un lado.
       *
       * Se aparta en direccion CONTRARIA al nodo, para que no se cruce con el
       * camino ni con el alfiler siguiente. Si la foto esta exactamente encima,
       * no hay direccion que calcular y se manda al este.
       */
      const nodoPegado = (missionStages || [])
        .map((n) => ({ lat: Number(n?.lat), lon: Number(n?.lon) }))
        .filter((n) => Number.isFinite(n.lat) && Number.isFinite(n.lon))
        .find((n) => getDistanceMeters(baseCenter, n) <= 40)

      let visualCenter = baseCenter
      if (nearPlayer) {
        visualCenter = offsetLatLon(baseCenter, 28 + groupIndex * 10, 135 + groupIndex * 45)
      } else if (nodoPegado) {
        const dx = baseCenter.lon - nodoPegado.lon
        const dy = baseCenter.lat - nodoPegado.lat
        const rumbo =
          Math.abs(dx) < 1e-7 && Math.abs(dy) < 1e-7
            ? 0
            : (Math.atan2(dy, dx) * 180) / Math.PI
        visualCenter = offsetLatLon(baseCenter, 34 + groupIndex * 8, rumbo)
      }

      const marker = L.marker([visualCenter.lat, visualCenter.lon], {
        icon: createFieldProofIcon(group.proofs),
        keyboard: false,
        riseOnHover: true,
        bubblingMouseEvents: false,
        // Por DEBAJO de los alfileres de nodo (540/560). Iban a 600 y tapaban
        // la navegacion: en esta ruta hay fotos a menos de 100 m de un nodo y
        // el alfiler desaparecia debajo. Las fotos son recuerdos; los nodos son
        // a donde hay que ir.
        zIndexOffset: 510,
      }).addTo(map)

      marker.bindTooltip(getFieldProofTooltip(group.proofs), {
        direction: 'top',
        opacity: 0.92,
      })

      marker.on('click', () => {
        onOpenFieldProofs?.(group.proofs)
      })

      fieldProofLayersRef.current.push(marker)
    })
  }, [fieldProofs, mapReadyToken, mapZoom, missionStages, onOpenFieldProofs, playerPosition?.lat, playerPosition?.lon])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const refreshMap = (forceRedraw = false) => {
      window.requestAnimationFrame(() => {
        map.invalidateSize({ pan: false })

        // Only redraw tiles when we know we went online — not on every refreshToken change.
        // Redrawing on zoom/pan is handled by Leaflet internally; forcing it causes unnecessary
        // network requests that make cached offline tiles disappear briefly.
        if (forceRedraw && typeof navigator !== 'undefined' && navigator.onLine !== false) {
          tileLayerRef.current?.redraw()
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
          // Smooth pan to if close (prevents tile unloading flickers caused by flyTo)
          map.setView(targetLatLng, 18, {
            animate: true,
            duration: 0.6,
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

        {/*
          Aviso de habernos salido del camino.
          Va suelto encima del mapa, nunca en el flujo de la pantalla: cuando el
          aviso ocupaba sitio empujaba hacia arriba la barra de abajo y dejaba la
          clasificación pegada al borde.
        */}
        {foraDoCamino ? (
          <div style={avisoFueraDeRuta}>
            <span style={avisoIcono}>⚠</span>
            <div>
              <div style={avisoTitulo}>Saíches do camiño</div>
              <div style={avisoDetalle}>Volve á liña verde</div>
            </div>
          </div>
        ) : null}
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

/**
 * Aviso de habernos salido del camino, en el centro de la pantalla.
 *
 * Arriba del todo quedaba pegado bajo la barra y no se leía. En el centro se ve
 * a la primera, y como sólo aparece estando fuera del camino no tapa nada que
 * haga falta: la línea verde a la que hay que volver queda alrededor.
 */
const avisoFueraDeRuta: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  zIndex: 620,
  maxWidth: 'calc(100% - 40px)',
  display: 'flex',
  alignItems: 'center',
  gap: 11,
  padding: '11px 17px 11px 14px',
  borderRadius: 'var(--theme-radius-panel)',
  border: '1px solid rgba(253,224,71,.42)',
  background: 'linear-gradient(180deg, rgba(var(--theme-ink-soft), .90), rgba(var(--theme-ink), .90))',
  backdropFilter: 'var(--theme-blur)',
  WebkitBackdropFilter: 'var(--theme-blur)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.14), 0 18px 44px rgba(var(--theme-ink-deep), .55)',
  color: '#f8fafc',
  animation: 'sagaAvisoEntra 220ms ease-out',
  pointerEvents: 'none',
}

const avisoIcono: React.CSSProperties = {
  flex: '0 0 auto',
  width: 30,
  height: 30,
  display: 'grid',
  placeItems: 'center',
  borderRadius: 'var(--theme-radius-pill)',
  background: 'rgba(253,224,71,.16)',
  border: '1px solid rgba(253,224,71,.38)',
  color: 'rgba(254,240,138,.98)',
  fontSize: 15,
  lineHeight: 1,
}

const avisoTitulo: React.CSSProperties = {
  fontSize: 13.5,
  fontWeight: 850,
  letterSpacing: '-.01em',
  lineHeight: 1.15,
  whiteSpace: 'nowrap',
}

const avisoDetalle: React.CSSProperties = {
  marginTop: 1,
  fontSize: 11,
  fontWeight: 600,
  lineHeight: 1.25,
  color: 'rgba(var(--theme-line-soft), .82)',
  whiteSpace: 'nowrap',
}

const surface: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  borderRadius: 'var(--theme-radius-panel)',
  overflow: 'hidden',
  border: '1px solid rgba(var(--theme-ink), .10)',
  background: 'var(--theme-surface)',
  boxShadow: '0 18px 40px rgba(var(--theme-ink), .08)',
}

const canvas: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
}

const mapAnimations = `
@keyframes sagaAvisoEntra {
  from { opacity: 0; transform: translate(-50%, -50%) scale(.94); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

/**
 * La linea de la ruta, del color del tema.
 *
 * Leaflet escribe el color como atributo del SVG, y ahi var() no resuelve.
 * Pero tambien pone la clase, asi que se tiñe desde aqui: el CSS si lo
 * entiende, y no hay que tocar ni una linea de la logica del mapa.
 */
.saga-road-guide {
  stroke: var(--theme-primary) !important;
}

.saga-road-guide--casing {
  stroke: var(--theme-primary-hover) !important;
}

.saga-offline-grid-tile {
  box-sizing: border-box;
  border: 1px solid rgba(var(--theme-line), .13);
  background:
    radial-gradient(circle at 50% 50%, var(--theme-wash), transparent 34%),
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
  background: rgba(var(--theme-ink), .72);
  color: rgba(255,255,255,.86);
  font: 800 10px/1 system-ui, sans-serif;
  letter-spacing: .08em;
  pointer-events: none;
}

/* El fondo de Leaflet lo pone PlayerLayout, del tema. Aqui habia una segunda
   regla con el azul pizarra clavado y tambien con !important: dos reglas
   iguales empatadas, y decidia el orden de inyeccion. */

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
  filter: drop-shadow(0 0 6px var(--theme-tint));
}

.saga-node-core--ready {
  filter: drop-shadow(0 0 10px var(--theme-tint-strong));
}

.saga-node-core--engaging {
  filter: drop-shadow(0 0 14px var(--theme-glow));
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
  background: linear-gradient(135deg, rgba(var(--theme-ink), .88), rgba(var(--theme-ink-mid), .78));
  border: 3px solid rgba(255,255,255,.94);
  box-shadow: 0 14px 28px rgba(var(--theme-ink), .28), inset 0 1px 0 rgba(255,255,255,.18);
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
  background: rgba(var(--theme-info-mid), .96);
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
  color: rgb(var(--theme-ink));
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
  color: rgb(var(--theme-ink-mid));
  font-size: 11px;
}

.saga-player-cluster-popup li span {
  color: rgb(var(--theme-sheen-a));
  font-size: 10px;
  font-weight: 900;
}

.saga-field-proof-photo-pin {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  overflow: hidden;
  border: 2px solid rgba(255,255,255,.96);
  box-shadow: 0 10px 22px rgba(var(--theme-ink), .24);
  background: rgba(var(--theme-ink), .18);
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
  box-shadow: inset 0 0 0 1px rgba(var(--theme-ink), .10);
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
  background: rgba(var(--theme-ink), .90);
  border: 1px solid rgba(255,255,255,.72);
  color: #fff;
  font-size: 10px;
  font-weight: 950;
  z-index: 2;
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
  border:
    3px solid
    rgba(255,255,255,.94);
  box-shadow:
    0 12px 30px
      rgba(var(--theme-ink), .34),
    inset 0 1px 0
      rgba(255,255,255,.35);
  color: #ffffff;
  background:
    linear-gradient(
      135deg,
      var(--saga-player-color,#0891b2),
      rgba(var(--theme-ink), .72)
    );
  overflow: hidden;
  transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.22s ease;
  animation: none;
}

.saga-avatar-active {
  z-index: 99999 !important;
}

.saga-avatar-active .saga-avatar-pin {
  transform: scale(1.35) translateZ(0) !important;
  box-shadow: 0 16px 36px rgba(var(--theme-ink), .45), 0 0 0 6px rgba(var(--theme-info), .30) !important;
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
  transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.22s ease;
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
          border-color: rgba(var(--theme-line-soft), .82);
        }




`

export default MapSurface
