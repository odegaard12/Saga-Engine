import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import { fetchAdminReactOverview, type AdminReactOverviewStage } from './lib/adminApi'
import { getPhysicalNodeMapLabel, getPhysicalNodeVisual } from './lib/physicalNodeVisuals'

type AdminMissionMapProps = {
  stages: AdminReactOverviewStage[]
  selectedStage: AdminReactOverviewStage | null
  onSelectStage?: (stage: AdminReactOverviewStage) => void
  onCreateStageAt?: (lat: number, lon: number, pos: { x: number; y: number }) => void
  onInsertStageAt?: (lat: number, lon: number, index: number) => void
  onMoveStage?: (
    stage: AdminReactOverviewStage, lat: number, lon: number, options?: { select?: boolean }) => void
  onSetLegVia?: (stage: AdminReactOverviewStage, via: [number, number] | null) => void
  onSetLegTrack?: (stage: AdminReactOverviewStage, track: Array<[number, number]>) => void
  /** Capa del mapa, gobernada por la barra superior */
  tileMode?: 'satellite-osm' | 'cyclosm' | 'osm' | 'satellite'
  /** Modo libre de edición del trazado, gobernado por la barra superior */
  freeShape?: boolean
  showHeatmap?: boolean
  onToggleHeatmap?: () => void
  onMetricsUpdate?: (metrics: any) => void
  playRouteTrigger?: number
}

/**
 * Desnivel acumulado real de la ruta (Open-Meteo elevation, sin API key).
 * Muestrea hasta 100 puntos del trazado y suma solo las subidas.
 * Devuelve null si el servicio no responde: en ese caso no se inventa un valor.
 */
async function fetchRouteElevationGain(coords: [number, number][]): Promise<number | null> {
  if (coords.length < 2) return null

  const maxPoints = 100
  const step = Math.max(1, Math.ceil(coords.length / maxPoints))
  const sampled = coords.filter((_, index) => index % step === 0)
  const last = coords[coords.length - 1]
  if (sampled[sampled.length - 1] !== last) sampled.push(last)

  const latitudes = sampled.map(([lat]) => lat.toFixed(5)).join(',')
  const longitudes = sampled.map(([, lon]) => lon.toFixed(5)).join(',')

  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/elevation?latitude=${latitudes}&longitude=${longitudes}`
    )
    if (!res.ok) return null
    const data = await res.json()
    const elevations = data?.elevation
    if (!Array.isArray(elevations) || elevations.length < 2) return null

    let gain = 0
    for (let i = 1; i < elevations.length; i++) {
      const delta = Number(elevations[i]) - Number(elevations[i - 1])
      if (Number.isFinite(delta) && delta > 0) gain += delta
    }
    return Math.round(gain)
  } catch {
    return null
  }
}

function readLatLngList(raw: unknown): Array<[number, number]> {
  if (!Array.isArray(raw)) return []
  const out: Array<[number, number]> = []
  for (const item of raw) {
    if (Array.isArray(item) && item.length >= 2) {
      const lat = Number(item[0])
      const lon = Number(item[1])
      if (Number.isFinite(lat) && Number.isFinite(lon)) out.push([lat, lon])
    }
  }
  return out
}

function getStageViaPoints(stage: AdminReactOverviewStage): Array<[number, number]> {
  return readLatLngList((stage as unknown as Record<string, unknown>).route_via)
}

/**
 * Trazado real del tramo que LLEGA a este nodo (importado del GPX de campo).
 * Cuando existe se dibuja tal cual y no se pide ruta al router: es el camino
 * que se anduvo de verdad, no el más corto que calcula OSRM.
 */
function getStageTrack(stage: AdminReactOverviewStage): Array<[number, number]> {
  return readLatLngList((stage as unknown as Record<string, unknown>).route_track)
}

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371.0
  const dLat = ((b[0] - a[0]) * Math.PI) / 180
  const dLon = ((b[1] - a[1]) * Math.PI) / 180
  const q =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q))
}

/**
 * Inserta un punto en el trazado, en el segmento al que queda más cerca.
 * Permite moldear el camino real sin perder el resto del recorrido.
 */
function insertIntoTrack(
  track: Array<[number, number]>,
  point: [number, number]
): Array<[number, number]> {
  if (track.length < 2) return [...track, point]

  let bestIndex = 1
  let bestScore = Infinity
  for (let i = 0; i < track.length - 1; i++) {
    const score = haversineKm(track[i], point) + haversineKm(point, track[i + 1])
    if (score < bestScore) {
      bestScore = score
      bestIndex = i + 1
    }
  }

  const next = [...track]
  next.splice(bestIndex, 0, point)
  return next
}

/**
 * Reajusta un trozo del trazado pasando por `point` PERO siguiendo caminos
 * reales: se pide al router peatonal el tramo (inicio de ventana → punto →
 * fin de ventana) y se cose el resultado dentro del track, conservando todo
 * lo demás del recorrido grabado.
 */
async function snapTrackThroughPoint(
  track: Array<[number, number]>,
  point: [number, number]
): Promise<Array<[number, number]>> {
  if (track.length < 2) return insertIntoTrack(track, point)

  // Índice más cercano al punto arrastrado
  let nearest = 0
  let nearestDist = Infinity
  track.forEach((p, i) => {
    const d = haversineKm(p, point)
    if (d < nearestDist) {
      nearestDist = d
      nearest = i
    }
  })

  // Ventana a reemplazar alrededor del punto
  const span = Math.max(2, Math.round(track.length * 0.12))
  const from = Math.max(0, nearest - span)
  const to = Math.min(track.length - 1, nearest + span)

  const a = track[from]
  const b = track[to]
  const coords = `${a[1]},${a[0]};${point[1]},${point[0]};${b[1]},${b[0]}`
  const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coords}?overview=full&geometries=geojson`

  try {
    const res = await fetch(url)
    const data = await res.json()
    const line = data?.routes?.[0]?.geometry?.coordinates
    if (Array.isArray(line) && line.length >= 2) {
      const routed: Array<[number, number]> = line
        .filter((c: unknown) => Array.isArray(c) && c.length >= 2)
        .map(([lon, lat]: [number, number]) => [lat, lon] as [number, number])
      return [...track.slice(0, from), ...routed, ...track.slice(to + 1)]
    }
  } catch {
    // sin router se cae al inserto simple
  }

  return insertIntoTrack(track, point)
}

function trackLengthKm(points: Array<[number, number]>): number {
  let total = 0
  for (let i = 0; i < points.length - 1; i++) total += haversineKm(points[i], points[i + 1])
  return total
}

function hasCoords(stage: AdminReactOverviewStage) {
  return typeof stage.lat === 'number' && typeof stage.lon === 'number'
}

function getStageCoords(stage: AdminReactOverviewStage): [number, number] | null {
  if (!hasCoords(stage)) return null
  return [stage.lat as number, stage.lon as number]
}

function getRadius(stage: AdminReactOverviewStage) {
  const radius = typeof stage.radius === 'number' ? stage.radius : 50
  return radius > 0 ? radius : 50
}

function getFamilyLabel(stage: AdminReactOverviewStage) {
  const record = stage as unknown as Record<string, unknown>
  const config =
    record.config && typeof record.config === 'object'
      ? (record.config as Record<string, unknown>)
      : {}
  const gameId = String(config.game_id || record.game_type || '')

  // Identidad real del nodo, no solo la familia técnica
  if (record.physical_qr || record.qr_payload) return 'Objeto QR'
  if (config.is_map_collectible || record.is_map_collectible) return 'Coleccionable'
  if (record.physical_node_kind === 'collectible' || record.physical_item_kind === 'collectible')
    return 'Coleccionable'
  if (gameId === 'simple_checkpoint') return 'Checkpoint'
  if (gameId === 'logic_circuit') return 'Matriz de circuitos'
  if (gameId === 'sequence_code') return 'Simón Dice'
  if (gameId === 'place_mosaic') return 'Mosaico del lugar'
  if (gameId === 'tilt_maze') return 'Laberinto'
  if (stage.type === 'bearing_hunt') return 'Bearing'
  if (stage.type === 'circuit_matrix') return 'Circuit'
  if (stage.type === 'motion_challenge') return 'Motion'
  if (stage.type === 'audio_challenge') return 'Audio'
  return 'Checkpoint'
}

function getMarkerConfig(stage: AdminReactOverviewStage, selected: boolean) {
  const base =
    stage.type === 'bearing_hunt'
      ? '#38bdf8'
      : stage.type === 'circuit_matrix'
        ? '#a78bfa'
        : '#34d399'

  return {
    color: base,
    fillColor: selected ? '#ffffff' : base,
    ringOpacity: selected ? 0.28 : 0.14,
    ringWeight: selected ? 4 : 2,
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function buildPinHtml(
  stage: AdminReactOverviewStage,
  selected: boolean,
  color: string,
  fill: string
) {
  const title = escapeHtml(stage.title || 'Untitled node')
  const family = escapeHtml(getFamilyLabel(stage))
  const label = `${stage.index + 1}`
  const physicalVisual = getPhysicalNodeVisual(stage)
  const physicalTitle = physicalVisual ? escapeHtml(physicalVisual.label) : ''
  const physicalIcon = physicalVisual ? escapeHtml(physicalVisual.icon) : ''
  const physicalTone = physicalVisual ? escapeHtml(physicalVisual.tone) : ''

  return `
    <div class="admin-node-pin-shell${selected ? ' admin-node-pin-shell--selected' : ''}">
      <div
        class="admin-node-pin${selected ? ' admin-node-pin--selected' : ''}"
        style="--node-color:${color};--node-fill:${fill};"
        title="${title} · ${physicalTitle || family}"
      >
        ${physicalVisual ? `<span class="admin-node-pin__physical admin-node-pin__physical--${physicalTone}" title="${physicalTitle}">${physicalIcon}</span>` : ''}
        <span class="admin-node-pin__index">${label}</span>
        <span class="admin-node-pin__grip">⋮⋮</span>
      </div>
      <div class="admin-node-label${selected ? ' admin-node-label--selected' : ''}">
        <strong>${label}. ${physicalVisual ? `<span class="admin-node-label__physical">${physicalIcon}</span>` : ''}${title}</strong>
        <span>${physicalVisual ? `${physicalTitle} · ${family}` : family}</span>
      </div>
    </div>
  `
}

function buildAdminNodePopupHtml(
  stage: AdminReactOverviewStage,
  totalNodes: number
) {
  const index = stage.index + 1
  const title = escapeHtml(stage.title || `Nodo ${index}`)
  const family = escapeHtml(getFamilyLabel(stage))
  const radius = typeof stage.radius === 'number' ? stage.radius : 25
  const physicalVisual = getPhysicalNodeVisual(stage)
  const physicalText = physicalVisual ? `${physicalVisual.icon} ${escapeHtml(physicalVisual.label)}` : ''

  return `
    <div class="admin-node-quick-popup" style="padding:10px 12px;min-width:230px;color:#f8fafc;font-family:system-ui,sans-serif;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
        <span style="font-size:11px;font-weight:900;background:rgba(56,189,248,0.22);color:#38bdf8;padding:3px 10px;border-radius:999px;border:1px solid rgba(56,189,248,0.45);letter-spacing:0.5px;">
          NODO #${index} DE ${totalNodes}
        </span>
        <span style="font-size:11px;color:#94a3b8;font-weight:800;background:rgba(15,23,42,0.6);padding:3px 8px;border-radius:6px;">📡 ${radius}m</span>
      </div>
      <strong style="display:block;font-size:15px;font-weight:900;color:#fff;margin-bottom:6px;line-height:1.2;">${title}</strong>
      <div style="font-size:12px;color:#cbd5e1;margin-bottom:10px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <span style="background:rgba(255,255,255,0.08);padding:2px 8px;border-radius:6px;">🎮 ${family}</span>
        ${physicalText ? `<span style="color:#34d399;background:rgba(52,211,153,0.14);padding:2px 8px;border-radius:6px;font-weight:700;">${physicalText}</span>` : ''}
      </div>
      <div style="display:flex;gap:6px;margin-top:10px;border-top:1px solid rgba(255,255,255,0.1);padding-top:8px;">
        <button type="button" class="admin-popup-edit-btn" style="flex:1;padding:8px 14px;border-radius:10px;border:1px solid rgba(56,189,248,0.6);background:linear-gradient(135deg,#0ea5e9,#2563eb);color:#fff;font-weight:900;font-size:13px;cursor:pointer;box-shadow:0 4px 14px rgba(14,165,233,0.35);">
          ✏️ Editar Nodo
        </button>
      </div>
    </div>
  `
}

export default function AdminMissionMap({
  stages,
  selectedStage,
  onSelectStage,
  onCreateStageAt,
  onInsertStageAt,
  onMoveStage,
  onSetLegVia,
  onSetLegTrack,
  tileMode,
  freeShape,
  showHeatmap: propShowHeatmap,
  onToggleHeatmap,
  onMetricsUpdate,
  playRouteTrigger,
}: AdminMissionMapProps) {
  const mapRootRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layersRef = useRef<L.Layer[]>([])
  const routeLayersRef = useRef<L.Layer[]>([])
  const heatmapLayerRef = useRef<L.Layer[]>([])
  const lastRouteCoordsRef = useRef<[number, number][]>([])
  const osrmRouteCacheRef = useRef<Map<string, any>>(new Map())
  const elevationCacheRef = useRef<Map<string, number>>(new Map())
  const pickedHandleRef = useRef<string | null>(null)
  const dragClickSuppressUntilRef = useRef(0)
  const isDraggingRef = useRef(false)
  const dragResetTimeoutRef = useRef<number | null>(null)
  const polylineRendererRef = useRef<L.SVG | null>(null)
  const [localShowHeatmap, setLocalShowHeatmap] = useState(false)
  const [heatmapStatus, setHeatmapStatus] = useState<'idle' | 'loading' | 'ok' | 'empty' | 'error'>(
    'idle'
  )
  const [playerCount, setPlayerCount] = useState(0)
  const [heatmapNonce, setHeatmapNonce] = useState(0)
  const [zoomTick, setZoomTick] = useState(0)

  const showHeatmap = propShowHeatmap !== undefined ? propShowHeatmap : localShowHeatmap
  const toggleHeatmap =
    onToggleHeatmap !== undefined ? onToggleHeatmap : () => setLocalShowHeatmap(!localShowHeatmap)

  const mappedStages = useMemo(() => stages.filter(hasCoords), [stages])

  const tileLayerRef = useRef<L.LayerGroup | null>(null)
  const nearbyPathsLayerRef = useRef<L.LayerGroup | null>(null)
  const nearbyPathsControllerRef = useRef<AbortController | null>(null)
  const [localTileMode, setLocalTileMode] = useState<'satellite-osm' | 'cyclosm' | 'osm' | 'satellite'>('satellite-osm')
  const mapTileMode = tileMode ?? localTileMode
  void setLocalTileMode
  // Modo libre: muestra los vértices del trazado para arrastrarlos uno a uno
  // (ajuste visual fino). En modo normal sólo se arrastra la línea entera.
  const freeShapeMode = Boolean(freeShape)

  useEffect(() => {
    if (!mapRootRef.current || mapRef.current) return

    const map = L.map(mapRootRef.current, {
      zoomControl: false,
      attributionControl: false,
      doubleClickZoom: false,
    })
    polylineRendererRef.current = L.svg({ padding: 1.0 })

    map.on('click', (e) => {
      if (isDraggingRef.current || Date.now() < dragClickSuppressUntilRef.current) return
      if (onCreateStageAt) {
        onCreateStageAt(e.latlng.lat, e.latlng.lng, { x: e.originalEvent.clientX, y: e.originalEvent.clientY })
      }
    })

    const tileGroup = L.layerGroup().addTo(map)
    tileLayerRef.current = tileGroup

    const pathsGroup = L.layerGroup().addTo(map)
    nearbyPathsLayerRef.current = pathsGroup

    map.setView([40.4168, -3.7038], 6)
    mapRef.current = map

    // El reparto en abanico y el tamaño de los pines dependen del zoom
    const onZoom = () => setZoomTick((value) => value + 1)
    map.on('zoomend', onZoom)

    return () => {
      if (dragResetTimeoutRef.current) {
        window.clearTimeout(dragResetTimeoutRef.current)
      }
      map.off('zoomend', onZoom)
      layersRef.current.forEach((layer) => layer.remove())
      layersRef.current = []
      map.remove()
      mapRef.current = null
    }
  }, [])

  const hasInitialFitRef = useRef(false)
  const [routeMetricsHUD, setRouteMetricsHUD] = useState({ distanceKm: 0, durationMin: 0, elevationM: 0 })

  useEffect(() => {
    const tileGroup = tileLayerRef.current
    if (!tileGroup) return

    tileGroup.clearLayers()

    if (mapTileMode === 'satellite-osm') {
      const esriSat = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxNativeZoom: 20, maxZoom: 22, updateWhenIdle: false, keepBuffer: 4 }
      )
      const waymarkedTrails = L.tileLayer(
        'https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png',
        { maxNativeZoom: 19, maxZoom: 22, opacity: 0.95, updateWhenIdle: false, keepBuffer: 4 }
      )
      const esriRoads = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
        { maxNativeZoom: 19, maxZoom: 22, opacity: 0.90, updateWhenIdle: false, keepBuffer: 4 }
      )
      const cartoLabels = L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png',
        { maxNativeZoom: 20, maxZoom: 22, opacity: 0.95, subdomains: 'abcd', updateWhenIdle: false, keepBuffer: 4 }
      )
      tileGroup.addLayer(esriSat)
      tileGroup.addLayer(waymarkedTrails)
      tileGroup.addLayer(esriRoads)
      tileGroup.addLayer(cartoLabels)
    } else if (mapTileMode === 'cyclosm') {
      const cyclosmMap = L.tileLayer(
        'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
        { maxNativeZoom: 19, maxZoom: 22, subdomains: ['a', 'b', 'c'], updateWhenIdle: false, keepBuffer: 4 }
      )
      tileGroup.addLayer(cyclosmMap)
    } else if (mapTileMode === 'osm') {
      const openTopo = L.tileLayer(
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        { maxNativeZoom: 19, maxZoom: 22, updateWhenIdle: false, keepBuffer: 4 }
      )
      tileGroup.addLayer(openTopo)
    } else {
      const esriSat = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxNativeZoom: 20, maxZoom: 22, updateWhenIdle: false, keepBuffer: 4 }
      )
      tileGroup.addLayer(esriSat)
    }
  }, [mapTileMode])

  const fetchedWayIdsRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    const map = mapRef.current
    const pathsGroup = nearbyPathsLayerRef.current

    if (!map || !pathsGroup) return

    // Zonas ya descargadas: si la vista actual está contenida en una de ellas,
    // no hace falta volver a pedir a Overpass (ahorra cuota y evita rate-limits).
    const fetchedBoundsList: L.LatLngBounds[] = []
    const overpassMirrors = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
    ]

    function drawWays(elements: any[]) {
      const currentPathsGroup = nearbyPathsLayerRef.current
      if (!currentPathsGroup) return
      elements.forEach((el: any) => {
        if (el.type === 'way' && el.geometry && !fetchedWayIdsRef.current.has(el.id)) {
          fetchedWayIdsRef.current.add(el.id)
          const latlngs = el.geometry.map((pt: any) => [pt.lat, pt.lon] as [number, number])

          L.polyline(latlngs, {
            color: '#ffffff',
            weight: 7,
            opacity: 0.35,
            lineCap: 'round',
            lineJoin: 'round',
            interactive: false,
            noClip: true,
          }).addTo(currentPathsGroup)

          L.polyline(latlngs, {
            color: '#f59e0b',
            weight: 4,
            opacity: 0.95,
            dashArray: '5 7',
            lineCap: 'round',
            lineJoin: 'round',
            interactive: false,
            noClip: true,
          }).addTo(currentPathsGroup)
        }
      })
    }

    async function fetchTrails() {
      const currentMap = mapRef.current
      if (!currentMap || !nearbyPathsLayerRef.current) return

      if (currentMap.getZoom() < 13) return

      const viewBounds = currentMap.getBounds()
      if (fetchedBoundsList.some((cached) => cached.contains(viewBounds))) return

      const bounds = viewBounds.pad(0.25)
      const s = bounds.getSouth()
      const w = bounds.getWest()
      const n = bounds.getNorth()
      const e = bounds.getEast()

      if (nearbyPathsControllerRef.current) {
        nearbyPathsControllerRef.current.abort()
      }

      const controller = new AbortController()
      nearbyPathsControllerRef.current = controller

      const query = `[out:json][timeout:25];(way["highway"](${s},${w},${n},${e}););out geom;`

      for (const mirror of overpassMirrors) {
        try {
          const url = `${mirror}?data=${encodeURIComponent(query)}`
          const res = await fetch(url, { signal: controller.signal })
          if (!res.ok) continue
          const data = await res.json()
          if (data && Array.isArray(data.elements)) {
            drawWays(data.elements)
            fetchedBoundsList.push(bounds)
          }
          return
        } catch (err: any) {
          if (err?.name === 'AbortError') return
          // Probar el siguiente espejo de Overpass
        }
      }
      console.error('Overpass: ningún espejo respondió con los caminos.')
    }

    let timeoutId: number
    function onMoveEnd() {
      clearTimeout(timeoutId)
      timeoutId = window.setTimeout(() => void fetchTrails(), 800)
    }

    map.on('moveend', onMoveEnd)
    // Initial fetch after a slight delay to ensure bounds are ready
    setTimeout(() => void fetchTrails(), 200)

    return () => {
      map.off('moveend', onMoveEnd)
      clearTimeout(timeoutId)
    }
  }, [mapRef.current])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    layersRef.current.forEach((layer) => layer.remove())
    layersRef.current = []

    const oldRouteLayers = routeLayersRef.current
    routeLayersRef.current = []

    const orderedStages = [...mappedStages].sort((a, b) => a.index - b.index)
    const waypoints: [number, number][] = []

    orderedStages.forEach((stage) => {
      const coords = getStageCoords(stage)
      if (coords) waypoints.push(coords)
    })

    if (waypoints.length >= 2) {
      // Construir la lista de puntos para OSRM incluyendo los puntos de moldeado
      // (route_via) de cada tramo. Cada tramo OSRM se asigna a su tramo de nodos.
      const routePoints: [number, number][] = []
      const pointNodeLeg: number[] = []
      orderedStages.forEach((stage, idx) => {
        const coords = getStageCoords(stage)
        if (!coords) return
        if (idx > 0) {
          for (const via of getStageViaPoints(stage)) {
            routePoints.push(via)
            pointNodeLeg.push(idx - 1)
          }
        }
        routePoints.push(coords)
        pointNodeLeg.push(idx - 1)
      })

      // Estimación inmediata por Haversine (incluye los caminos moldeados)
      // para que el HUD nunca esté a 0 ni ignore los via points.
      let haversineDist = 0
      for (let k = 0; k < routePoints.length - 1; k++) {
        const [lat1, lon1] = routePoints[k]
        const [lat2, lon2] = routePoints[k + 1]
        const R = 6371.0
        const dlat = ((lat2 - lat1) * Math.PI) / 180
        const dlon = ((lon2 - lon1) * Math.PI) / 180
        const a =
          Math.sin(dlat / 2) ** 2 +
          Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dlon / 2) ** 2
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
        haversineDist += R * c
      }
      // Trazado real importado del GPX: si TODOS los tramos lo tienen, se
      // dibuja tal cual y se mide sobre él. Es el camino que se anduvo de
      // verdad, así que la distancia coincide con la del reloj en vez de dar
      // la del camino más corto que calcula el router.
      const gpxLegs = orderedStages.slice(1).map((stage) => getStageTrack(stage))
      const hasFullGpxRoute =
        gpxLegs.length > 0 && gpxLegs.every((leg) => leg.length >= 2)

      // Estimación honesta mientras responde el router: distancia en línea
      // recta pasando por los puntos de moldeado. Sin multiplicadores
      // inventados; el HUD la marca como RECTA hasta que llega la real.
      const estDurationMin = Math.round(haversineDist * 15)

      if (!hasFullGpxRoute) {
        setRouteMetricsHUD((prev) => ({
          ...prev,
          distanceKm: haversineDist,
          durationMin: estDurationMin,
        }))

        onMetricsUpdate?.({
          distanceKm: haversineDist,
          trailKm: haversineDist,
          durationMin: estDurationMin,
          mappedCount: waypoints.length,
          routeCoords: waypoints,
          measured: false,
        })
      }

      if (hasFullGpxRoute) {
        oldRouteLayers.forEach((layer) => layer.remove())

        const legDistances = gpxLegs.map(trackLengthKm)
        const totalKm = legDistances.reduce((acc, value) => acc + value, 0)
        ;(map as any)._lastLegDistances = legDistances

        const allCoords: [number, number][] = []
        gpxLegs.forEach((leg) => allCoords.push(...leg))
        lastRouteCoordsRef.current = allCoords

        const durationMin = Math.round(totalKm * 15)
        setRouteMetricsHUD((prev) => ({ ...prev, distanceKm: totalKm, durationMin }))
        onMetricsUpdate?.({
          distanceKm: totalKm,
          trailKm: totalKm,
          durationMin,
          mappedCount: waypoints.length,
          routeCoords: allCoords,
          measured: true,
        })

        gpxLegs.forEach((legCoords, i) => {
          const fromNode = orderedStages[i]
          const toNode = orderedStages[i + 1]
          const legTitle = `🥾 Tramo ${i + 1}: ${fromNode?.title || 'Nodo A'} ➡️ ${toNode?.title || 'Nodo B'} · ${legDistances[i].toFixed(2)} km (trazado real GPX)`

          const outer = L.polyline(legCoords, {
            color: '#047857',
            weight: 11,
            opacity: 0.8,
            lineCap: 'round',
            lineJoin: 'round',
            noClip: true,
            renderer: polylineRendererRef.current ?? undefined,
          }).addTo(map)

          const inner = L.polyline(legCoords, {
            color: '#10b981',
            weight: 6,
            opacity: 0.95,
            lineCap: 'round',
            lineJoin: 'round',
            noClip: true,
            renderer: polylineRendererRef.current ?? undefined,
          }).addTo(map)

          inner.bindTooltip(legTitle, { sticky: true, className: 'saga-route-tooltip-red' })
          inner.on('mouseover', () => {
            inner.setStyle({ color: '#ff0000', weight: 9, opacity: 1 })
            outer.setStyle({ color: '#991b1b', weight: 14, opacity: 0.9 })
          })
          inner.on('mouseout', () => {
            inner.setStyle({ color: '#10b981', weight: 6, opacity: 0.95 })
            outer.setStyle({ color: '#047857', weight: 11, opacity: 0.8 })
          })

          // Reajuste manual del trazado: al arrastrar la línea, el punto se
          // inserta en el tramo más cercano del track en vez de recalcular
          // nada con el router, así el resto del recorrido real se conserva.
          if (toNode && onSetLegTrack) {
            let dragging = false
            let preview: L.Polyline | null = null

            const onDown = (downEvt: L.LeafletMouseEvent) => {
              L.DomEvent.stopPropagation(downEvt.originalEvent)
              dragging = true
              isDraggingRef.current = true
              map.dragging.disable()

              const onMove = (moveEvt: L.LeafletMouseEvent) => {
                if (!dragging) return
                const point: [number, number] = [moveEvt.latlng.lat, moveEvt.latlng.lng]
                const shaped = insertIntoTrack(legCoords, point)
                if (!preview) {
                  preview = L.polyline(shaped, {
                    color: '#ff0000',
                    weight: 8,
                    opacity: 0.95,
                    noClip: true,
                    renderer: polylineRendererRef.current ?? undefined,
                  }).addTo(map)
                } else {
                  preview.setLatLngs(shaped)
                }
                const km = trackLengthKm(shaped)
                const others = legDistances.reduce(
                  (acc, value, idx) => (idx !== i ? acc + value : acc),
                  0
                )
                setRouteMetricsHUD((prev) => ({ ...prev, distanceKm: others + km }))
                onMetricsUpdate?.({
                  distanceKm: others + km,
                  trailKm: others + km,
                  measured: true,
                })
              }

              const onUp = (upEvt: L.LeafletMouseEvent) => {
                map.off('mousemove', onMove)
                map.off('mouseup', onUp)
                map.dragging.enable()
                dragging = false
                dragClickSuppressUntilRef.current = Date.now() + 800
                window.setTimeout(() => {
                  isDraggingRef.current = false
                }, 120)
                if (preview) {
                  map.removeLayer(preview)
                  preview = null
                }
                const point: [number, number] = [upEvt.latlng.lat, upEvt.latlng.lng]
                // Modo normal: se ajusta a caminos reales. El inserto directo
                // sólo se usa si el router no contesta.
                void snapTrackThroughPoint(legCoords, point).then((shaped) => {
                  onSetLegTrack(toNode, shaped)
                })
              }

              map.on('mousemove', onMove)
              map.on('mouseup', onUp)
            }

            inner.on('mousedown', onDown)
            outer.on('mousedown', onDown)
          }

          // MODO LIBRE: un tirador por cada vértice del trazado. Arrastrarlo
          // mueve sólo ese pico, sin recalcular nada, para afinar el dibujo.
          if (freeShapeMode && toNode && onSetLegTrack) {
            legCoords.forEach((point, pointIndex) => {
              if (pointIndex === 0 || pointIndex === legCoords.length - 1) return
              // Muchos más tiradores: antes se veía uno de cada muchos y los
              // puntos intermedios no se podían coger.
              const stride = Math.max(1, Math.ceil(legCoords.length / 60))
              if (pointIndex % stride !== 0) return

              const isPicked = pickedHandleRef.current === `${i}:${pointIndex}`
              const handle = L.circleMarker(point, {
                radius: isPicked ? 9 : 7,
                color: isPicked ? '#ffffff' : '#0f172a',
                weight: isPicked ? 3 : 1.5,
                fillColor: isPicked ? '#ef4444' : '#fbbf24',
                fillOpacity: 1,
                className: 'saga-shape-handle',
                bubblingMouseEvents: false,
              }).addTo(map)

              handle.on('mousedown', (downEvt: L.LeafletMouseEvent) => {
                L.DomEvent.stopPropagation(downEvt.originalEvent)
                isDraggingRef.current = true
                map.dragging.disable()
                // El punto elegido se marca en rojo y sigue visible después.
                pickedHandleRef.current = `${i}:${pointIndex}`
                handle.setStyle({ radius: 9, color: '#ffffff', weight: 3, fillColor: '#ef4444' })

                const working = legCoords.map((p) => [...p] as [number, number])

                const origin = legCoords.map((p) => [...p] as [number, number])
                // Radio de influencia: los puntos cercanos acompañan al
                // arrastre con peso decreciente, así la línea se deforma suave
                // en vez de hacer un pico feo en un solo vértice.
                const influence = Math.max(2, Math.round(stride * 1.6))

                const onMove = (moveEvt: L.LeafletMouseEvent) => {
                  const dLat = moveEvt.latlng.lat - origin[pointIndex][0]
                  const dLon = moveEvt.latlng.lng - origin[pointIndex][1]

                  for (let k = -influence; k <= influence; k++) {
                    const idx = pointIndex + k
                    if (idx <= 0 || idx >= origin.length - 1) continue
                    const weight = 1 - Math.abs(k) / (influence + 1)
                    working[idx] = [
                      origin[idx][0] + dLat * weight,
                      origin[idx][1] + dLon * weight,
                    ]
                  }

                  handle.setLatLng(moveEvt.latlng)
                  inner.setLatLngs(working)
                  outer.setLatLngs(working)
                }

                const onUp = () => {
                  map.off('mousemove', onMove)
                  map.off('mouseup', onUp)
                  map.dragging.enable()
                  dragClickSuppressUntilRef.current = Date.now() + 800
                  window.setTimeout(() => {
                    isDraggingRef.current = false
                  }, 120)
                  onSetLegTrack(toNode, working)
                }

                map.on('mousemove', onMove)
                map.on('mouseup', onUp)
              })

              routeLayersRef.current.push(handle)
            })
          }

          routeLayersRef.current.push(outer, inner)
        })

        const elevationKey = `gpx|${allCoords.length}`
        const cachedGain = elevationCacheRef.current.get(elevationKey)
        if (typeof cachedGain === 'number') {
          setRouteMetricsHUD((prev) => ({ ...prev, elevationM: cachedGain }))
          onMetricsUpdate?.({ elevationM: cachedGain })
        } else {
          void fetchRouteElevationGain(allCoords).then((gain) => {
            if (gain === null) return
            elevationCacheRef.current.set(elevationKey, gain)
            setRouteMetricsHUD((prev) => ({ ...prev, elevationM: gain }))
            onMetricsUpdate?.({ elevationM: gain })
          })
        }
      }

      // Si ya hay trazado real del GPX no se pide nada al router: antes se
      // dibujaban LAS DOS rutas encima (de ahí los caminos raros entre nodos)
      // y la respuesta del router pisaba la distancia real.
      if (!hasFullGpxRoute) {
      const coordString = routePoints.map(([lat, lon]) => `${lon},${lat}`).join(';')
      const osrmUrl = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coordString}?overview=full&geometries=geojson&steps=true`

      const cachedRoute = osrmRouteCacheRef.current.get(coordString)
      const routeDataPromise: Promise<any> = cachedRoute
        ? Promise.resolve(cachedRoute)
        : fetch(osrmUrl).then((res) => res.json())

      routeDataPromise
        .then((data) => {
          if (data && data.routes && data.routes[0] && data.routes[0].legs) {
            osrmRouteCacheRef.current.set(coordString, data)
            if (osrmRouteCacheRef.current.size > 60) {
              const firstKey = osrmRouteCacheRef.current.keys().next().value
              if (firstKey !== undefined) osrmRouteCacheRef.current.delete(firstKey)
            }
            oldRouteLayers.forEach((layer) => layer.remove())
            const route = data.routes[0]
            const distanceKm = route.distance / 1000.0
            const durationMin = Math.round((route.duration || (distanceKm * 900)) / 60)

            // Las métricas se publican ANTES de procesar la geometría: si algo
            // falla más abajo, la distancia real ya llegó al HUD. Antes iba
            // después y cualquier fallo dejaba la barra congelada en la
            // distancia en línea recta.
            setRouteMetricsHUD((prev) => ({ ...prev, distanceKm, durationMin }))
            onMetricsUpdate?.({
              distanceKm,
              trailKm: distanceKm,
              durationMin,
              mappedCount: waypoints.length,
              measured: true,
            })

            // Extract all coordinates for GPX
            const allCoords: [number, number][] = []
            for (const leg of route.legs || []) {
              for (const step of leg?.steps || []) {
                for (const point of step?.geometry?.coordinates || []) {
                  const [lon, lat] = point || []
                  if (Number.isFinite(lat) && Number.isFinite(lon)) allCoords.push([lat, lon])
                }
              }
            }

            lastRouteCoordsRef.current = allCoords
            if (allCoords.length > 0) {
              onMetricsUpdate?.({ routeCoords: allCoords })
            }

            // Desnivel real (asíncrono): sustituye la estimación en cuanto llega.
            const elevationKey = `${coordString}|${allCoords.length}`
            const cachedGain = elevationCacheRef.current.get(elevationKey)
            if (typeof cachedGain === 'number') {
              setRouteMetricsHUD((prev) => ({ ...prev, elevationM: cachedGain }))
              onMetricsUpdate?.({ elevationM: cachedGain })
            } else {
              void fetchRouteElevationGain(allCoords).then((gain) => {
                if (gain === null) return
                elevationCacheRef.current.set(elevationKey, gain)
                setRouteMetricsHUD((prev) => ({ ...prev, elevationM: gain }))
                onMetricsUpdate?.({ elevationM: gain })
              })
            }

            // Agrupar los tramos OSRM por tramo de nodos (un tramo de nodos puede
            // estar dividido en varios tramos OSRM por los puntos de moldeado).
            const nodeLegCount = Math.max(0, orderedStages.length - 1)
            const groupedLegCoords: [number, number][][] = Array.from(
              { length: nodeLegCount },
              () => []
            )
            const groupedLegDistances: number[] = Array.from({ length: nodeLegCount }, () => 0)

            route.legs.forEach((leg: any, osrmLegIndex: number) => {
              const nodeLegIndex = pointNodeLeg[osrmLegIndex + 1]
              if (nodeLegIndex === undefined || nodeLegIndex < 0 || nodeLegIndex >= nodeLegCount) {
                return
              }

              const legPts: [number, number][] = leg.geometry?.coordinates
                ? leg.geometry.coordinates.map(([lon, lat]: [number, number]) => [lat, lon])
                : []

              if (legPts.length === 0 && leg.steps) {
                leg.steps.forEach((step: any) => {
                  if (step.geometry?.coordinates) {
                    step.geometry.coordinates.forEach(([lon, lat]: [number, number]) => {
                      legPts.push([lat, lon])
                    })
                  }
                })
              }

              groupedLegCoords[nodeLegIndex].push(...legPts)
              groupedLegDistances[nodeLegIndex] += (leg.distance || 0) / 1000.0
            })

            const legDists = groupedLegDistances
            ;(map as any)._lastLegDistances = legDists

            groupedLegCoords.forEach((rawLegCoords: [number, number][], i: number) => {
              const fromNode = orderedStages[i]
              const toNode = orderedStages[i + 1]

              // Si el router no devolvió geometría para este tramo, dibujar la
              // línea recta entre nodos: si se queda vacía, el tramo resulta
              // invisible e imposible de arrastrar.
              const fromCoords = fromNode ? getStageCoords(fromNode) : null
              const toCoords = toNode ? getStageCoords(toNode) : null
              const legCoords: [number, number][] =
                rawLegCoords.length >= 2
                  ? rawLegCoords
                  : fromCoords && toCoords
                    ? [fromCoords, toCoords]
                    : []

              if (legCoords.length < 2) return

              const legTitle = `🟢 Tramo ${i + 1}: ${fromNode?.title || 'Nodo A'} ➡️ ${toNode?.title || 'Nodo B'} (Pasa ratón para VER EN ROJO / Arrastra la línea para moldear camino)`

              // Outer Dark Emerald Border
              const outerLine = L.polyline(legCoords, { 
                color: '#047857',
                weight: 11,
                opacity: 0.8,
                lineCap: 'round',
                lineJoin: 'round', 
                noClip: true,
                renderer: polylineRendererRef.current ?? undefined,
              }).addTo(map)

              // Inner Vivid Emerald Green Polyline (Base route color: Green)
              const innerLine = L.polyline(legCoords, { 
                color: '#10b981',
                weight: 6,
                opacity: 0.95,
                lineCap: 'round',
                lineJoin: 'round', 
                noClip: true,
                renderer: polylineRendererRef.current ?? undefined,
              }).addTo(map)

              let fromConnLine: L.Polyline | null = null
              let toConnLine: L.Polyline | null = null

              if (fromNode && legCoords.length > 0) {
                fromConnLine = L.polyline([[fromNode.lat as number, fromNode.lon as number], legCoords[0]], {
                  color: '#10b981',
                  weight: 3,
                  dashArray: '5, 8',
                  opacity: 0.8,
                  noClip: true,
                  renderer: polylineRendererRef.current ?? undefined,
                }).addTo(map)
              }
              if (toNode && legCoords.length > 0) {
                toConnLine = L.polyline([legCoords[legCoords.length - 1], [toNode.lat as number, toNode.lon as number]], {
                  color: '#10b981',
                  weight: 3,
                  dashArray: '5, 8',
                  opacity: 0.8,
                  noClip: true,
                  renderer: polylineRendererRef.current ?? undefined,
                }).addTo(map)
              }

              innerLine.bindTooltip(legTitle, { sticky: true, className: 'saga-route-tooltip-red' })
              
              // Hover state: turns BRIGHT VIVID RED (#ff0000)
              innerLine.on('mouseover', () => {
                innerLine.setStyle({ color: '#ff0000', weight: 9, opacity: 1.0 })
                outerLine.setStyle({ color: '#991b1b', weight: 14, opacity: 0.9 })
              })

              innerLine.on('mouseout', () => {
                innerLine.setStyle({ color: '#10b981', weight: 6, opacity: 0.95 })
                outerLine.setStyle({ color: '#047857', weight: 11, opacity: 0.8 })
              })

              // Real-time Dynamic Polyline Dragging: Snapping to mountain roads as mouse moves
              let previewLine: L.Polyline | null = null
              let isDraggingLine = false
              let movedDuringDrag = false
              let lastFetchTime = 0
              const handleLineClick = (evt: L.LeafletMouseEvent) => {
                L.DomEvent.stopPropagation(evt.originalEvent)
                L.DomEvent.preventDefault(evt.originalEvent)
              }

              const handleMouseDown = (e: L.LeafletMouseEvent) => {
                L.DomEvent.stopPropagation(e.originalEvent)
                isDraggingRef.current = true
                if (dragResetTimeoutRef.current) {
                  window.clearTimeout(dragResetTimeoutRef.current)
                }
                isDraggingLine = true
                movedDuringDrag = false
                map.dragging.disable()

                innerLine.setStyle({ color: '#ff0000', weight: 9 })
                outerLine.setStyle({ color: '#991b1b', weight: 14 })

                const fromPoint = legCoords[0]
                const toPoint = legCoords[legCoords.length - 1]

                const handleMouseMove = (moveEvt: L.LeafletMouseEvent) => {
                  if (!isDraggingLine) return
                  movedDuringDrag = true
                  const curPoint = moveEvt.latlng
                  const now = Date.now()

                  // HUD en tiempo real: estimación inmediata por haversine sin
                  // esperar a la respuesta de OSRM.
                  {
                    const toRad = (v: number) => (v * Math.PI) / 180
                    const havKm = (a: [number, number], b: [number, number]) => {
                      const R = 6371.0
                      const dlat = toRad(b[0] - a[0])
                      const dlon = toRad(b[1] - a[1])
                      const q =
                        Math.sin(dlat / 2) ** 2 +
                        Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dlon / 2) ** 2
                      return R * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q))
                    }
                    const cur: [number, number] = [curPoint.lat, curPoint.lng]
                    // Tramo arrastrado en línea recta + resto de tramos ya
                    // medidos por el router. Sin multiplicadores inventados.
                    const dragLegKm = havKm(fromPoint, cur) + havKm(cur, toPoint)
                    const allLegDists = ((map as any)._lastLegDistances as number[]) || []
                    const baseKm = allLegDists.reduce(
                      (acc, dist, idx) => (idx !== i ? acc + dist : acc),
                      0
                    )
                    const estKm = baseKm + dragLegKm
                    if (Number.isFinite(estKm)) {
                      const estDur = Math.round(estKm * 15)
                      setRouteMetricsHUD((prev) => ({
                        ...prev,
                        distanceKm: estKm,
                        durationMin: estDur,
                      }))
                      // También la barra superior del shell, en tiempo real
                      onMetricsUpdate?.({
                        distanceKm: estKm,
                        trailKm: estKm,
                        durationMin: estDur,
                        mappedCount: waypoints.length,
                        measured: false,
                      })
                    }
                  }

                  // Fast local preview immediately
                  if (!previewLine) {
                    previewLine = L.polyline([fromPoint, [curPoint.lat, curPoint.lng], toPoint], {
                      color: '#ff0000',
                      weight: 7,
                      dashArray: '8, 8',
                      opacity: 0.95,
                      noClip: true,
                      renderer: polylineRendererRef.current ?? undefined,
                    }).addTo(map)
                  }

                  // Throttled OSRM dynamic road snapping (~350ms para no saturar el router)
                  if (now - lastFetchTime > 350) {
                    lastFetchTime = now
                    const osrmUrl = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${fromPoint[1]},${fromPoint[0]};${curPoint.lng},${curPoint.lat};${toPoint[1]},${toPoint[0]}?overview=full&geometries=geojson`
                    fetch(osrmUrl)
                      .then((res) => res.json())
                      .then((data) => {
                        if (isDraggingLine && data.routes?.[0]?.geometry?.coordinates) {
                          const route = data.routes[0]
                          const routePts: [number, number][] = route.geometry.coordinates.map(
                            ([lon, lat]: [number, number]) => [lat, lon]
                          )
                          if (previewLine) {
                            previewLine.setLatLngs(routePts)
                            previewLine.setStyle({ dashArray: undefined, color: '#ff0000', weight: 8 })
                            
                            // HUD con la distancia REAL del tramo arrastrado
                            // (el resto de tramos ya venían medidos).
                            const dragLegDistanceKm = route.distance / 1000.0
                            const dragLegDurMin = (route.duration || 0) / 60
                            const legDists = ((map as any)._lastLegDistances as number[]) || []
                            const baseDistKm = legDists.reduce((acc, dist, idx) => idx !== i ? acc + dist : acc, 0)
                            const newTotalDistKm = baseDistKm + dragLegDistanceKm
                            const newTotalDurMin = Math.round(dragLegDurMin + baseDistKm * 15)
                            if (Number.isFinite(newTotalDistKm)) {
                              setRouteMetricsHUD((prev) => ({ ...prev, distanceKm: newTotalDistKm, durationMin: newTotalDurMin }))
                              onMetricsUpdate?.({ distanceKm: newTotalDistKm, trailKm: newTotalDistKm, durationMin: newTotalDurMin, mappedCount: waypoints.length, measured: true })
                            }
                          }
                        }
                      })
                      .catch(() => {})
                  }
                }

                const handleMouseUp = (upEvt: L.LeafletMouseEvent) => {
                  if (upEvt.originalEvent) {
                    L.DomEvent.stopPropagation(upEvt.originalEvent)
                  }
                  map.off('mousemove', handleMouseMove)
                  map.off('mouseup', handleMouseUp)
                  map.dragging.enable()

                  dragClickSuppressUntilRef.current = Date.now() + 800
                  if (dragResetTimeoutRef.current) {
                    window.clearTimeout(dragResetTimeoutRef.current)
                  }
                  dragResetTimeoutRef.current = window.setTimeout(() => {
                    isDraggingRef.current = false
                  }, 120)

                  if (previewLine) {
                    map.removeLayer(previewLine)
                    previewLine = null
                  }

                  isDraggingLine = false
                  isDraggingRef.current = false
                  innerLine.setStyle({ color: '#10b981', weight: 6 })
                  outerLine.setStyle({ color: '#047857', weight: 11 })

                    // Persistir el moldeado como punto intermedio (via) del tramo,
                    // sin mover ningún nodo. Se guarda en route_via del nodo destino.
                    if (movedDuringDrag && toNode && onSetLegVia) {
                      onSetLegVia(toNode, [upEvt.latlng.lat, upEvt.latlng.lng])
                    }
                }

                map.on('mousemove', handleMouseMove)
                map.on('mouseup', handleMouseUp)
              }

              innerLine.on('mousedown', handleMouseDown)
              outerLine.on('mousedown', handleMouseDown)
              innerLine.on('click', handleLineClick)
              outerLine.on('click', handleLineClick)

              const layersToPush = [outerLine, innerLine]
              if (fromConnLine) layersToPush.push(fromConnLine)
              if (toConnLine) layersToPush.push(toConnLine)
              routeLayersRef.current.push(...layersToPush)
            })

            // Marcadores de puntos de moldeado (via): doble clic para eliminarlos.
            orderedStages.forEach((stage, idx) => {
              if (idx === 0) return
              getStageViaPoints(stage).forEach((via) => {
                const viaMarker = L.circleMarker(via, {
                  radius: 7,
                  color: '#ffffff',
                  weight: 2,
                  fillColor: '#f59e0b',
                  fillOpacity: 0.95,
                }).addTo(map)
                viaMarker.bindTooltip(
                  '🟠 Punto de moldeado del camino (doble clic para quitar)',
                  { sticky: true }
                )
                viaMarker.on('dblclick', (evt: L.LeafletMouseEvent) => {
                  L.DomEvent.stopPropagation(evt.originalEvent)
                  L.DomEvent.preventDefault(evt.originalEvent)
                  onSetLegVia?.(stage, null)
                })
                routeLayersRef.current.push(viaMarker)
              })
            })

            // Fetch & draw nearby footpaths/tracks within 500m of mapped waypoints
            if (waypoints.length > 0) {
              waypoints.slice(0, 3).forEach(([wLat, wLon]) => {
                const overpassUrl = `https://overpass-api.de/api/interpreter?data=[out:json];way(around:500,${wLat},${wLon})["highway"~"footway|path|track|steps"];out geom;`
                fetch(overpassUrl)
                  .then((res) => res.json())
                  .then((data) => {
                    if (data && data.elements) {
                      data.elements.forEach((element: any) => {
                        if (element.geometry && element.geometry.length >= 2) {
                          const pathPts: [number, number][] = element.geometry.map((pt: any) => [pt.lat, pt.lon])
                          // interactive: false — si no, estas líneas capturan el ratón
                          // y no dejan agarrar/moldear la ruta que pasa por debajo.
                          const trailHintLine = L.polyline(pathPts, {
                            color: '#eab308',
                            weight: 3.5,
                            opacity: 0.75,
                            dashArray: '6, 6',
                            noClip: true,
                            interactive: false,
                            renderer: polylineRendererRef.current ?? undefined,
                          }).addTo(map)
                          routeLayersRef.current.push(trailHintLine)
                        }
                      })
                    }
                  })
                  .catch(() => {})
              })
            }
          } else if (oldRouteLayers.length > 0) {
            // Respuesta inválida (p.ej. rate-limit del router): conservar la
            // ruta anterior en vez de pintar la línea roja de emergencia.
            console.warn('SAGA ruta: respuesta del router sin trazado utilizable', data)
            routeLayersRef.current.push(...oldRouteLayers)
          } else {
            console.warn('SAGA ruta: respuesta del router sin trazado utilizable', data)
            fallbackLines(map)
          }
        })
        .catch((error) => {
          // Nunca en silencio: un fallo aquí dejaba la barra de distancia
          // congelada sin ninguna pista de por qué.
          console.error('SAGA ruta: fallo al calcular el trazado', error)
          if (oldRouteLayers.length > 0) {
            routeLayersRef.current.push(...oldRouteLayers)
          } else {
            fallbackLines(map)
          }
        })
      }
    }

    function fallbackLines(m: L.Map) {
      const fallbackLine = L.polyline(waypoints, { 
        color: '#dc2626',
        weight: 6,
        opacity: 0.9,
        dashArray: '8, 8',
        noClip: true,
        renderer: polylineRendererRef.current ?? undefined,
      }).addTo(m)
      routeLayersRef.current.push(fallbackLine)
      lastRouteCoordsRef.current = waypoints
    }

    const bounds: L.LatLngExpression[] = []

    mappedStages.forEach((stage) => {
      let coords = getStageCoords(stage)
      if (!coords) return

      const selected = selectedStage?.index === stage.index
      const visual = getMarkerConfig(stage, selected)
      const radius = getRadius(stage)

      bounds.push(coords)

      const ring = L.circle(coords, {
        radius,
        color: visual.color,
        weight: visual.ringWeight,
        opacity: selected ? 0.94 : 0.62,
        fillColor: visual.color,
        fillOpacity: visual.ringOpacity,
        className: selected ? 'admin-node-ring admin-node-ring--selected' : 'admin-node-ring',
        bubblingMouseEvents: false,
        // En modo libre el círculo de radio no debe capturar el ratón: tapaba
        // las líneas y los tiradores que caen dentro del área del nodo.
        interactive: !freeShapeMode,
      }).addTo(map)

      // Nodos muy juntos (pueden estar a ~130 m): al alejar el zoom
      // los pines se pisaban. Se reducen y se separan en abanico según el zoom.
      const zoom = map.getZoom()
      const baseCoords: [number, number] = coords
      const crowded = mappedStages.filter((other) => {
        const c = getStageCoords(other)
        if (!c || other.index === stage.index) return false
        return map.distance(baseCoords, c) < (zoom >= 17 ? 25 : zoom >= 15 ? 90 : 220)
      })

      if (crowded.length > 0) {
        const order = crowded.filter((other) => other.index < stage.index).length
        if (order > 0) {
          const angle = (order * 2 * Math.PI) / (crowded.length + 1)
          const offsetPx = 26 + order * 4
          const base = map.latLngToLayerPoint(L.latLng(baseCoords))
          const shifted = L.point(
            base.x + Math.cos(angle) * offsetPx,
            base.y + Math.sin(angle) * offsetPx
          )
          const shiftedLatLng = map.layerPointToLatLng(shifted)
          coords = [shiftedLatLng.lat, shiftedLatLng.lng]
        }
      }

      const markerSize = selected ? 74 : zoom < 15 ? 46 : 62
      const marker = L.marker(coords, {
        draggable: Boolean(onMoveStage),
        autoPan: true,
        icon: L.divIcon({
          className: 'admin-node-marker-icon',
          html: buildPinHtml(stage, selected, visual.color, visual.fillColor),
          iconSize: [markerSize, markerSize],
          iconAnchor: [markerSize / 2, markerSize / 2],
        }),
      }).addTo(map)

      const physicalLabel = getPhysicalNodeMapLabel(stage)
      const stageTitle = physicalLabel
        ? `${physicalLabel} · ${stage.title || 'Nodo'}`
        : stage.title || 'Untitled node'
      const tooltip = `${stage.index + 1}. ${stageTitle} · ${getFamilyLabel(stage)} · ${radius}m`

      marker.bindTooltip(tooltip, {
        direction: 'top',
        opacity: 0.96,
      })

      marker.bindPopup(buildAdminNodePopupHtml(stage, mappedStages.length), {
        closeButton: true,
        autoPan: true,
        keepInView: true,
      })

      marker.on('popupopen', () => {
        const popupElement = marker.getPopup()?.getElement()
        const editBtn = popupElement?.querySelector('.admin-popup-edit-btn')
        if (editBtn) {
          editBtn.addEventListener('click', (e) => {
            e.stopPropagation()
            onSelectStage?.(stage)
          })
        }
      })

      ring.on('click', (event: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(event.originalEvent)
        L.DomEvent.preventDefault(event.originalEvent)

        if (
          map.getContainer().classList.contains('admin-map-dragging-node') ||
          Date.now() < dragClickSuppressUntilRef.current
        ) {
          return
        }

        onSelectStage?.(stage)
        marker.openPopup()
      })

      marker.on('click', (event: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(event.originalEvent)
        L.DomEvent.preventDefault(event.originalEvent)

        if (
          map.getContainer().classList.contains('admin-map-dragging-node') ||
          Date.now() < dragClickSuppressUntilRef.current
        ) {
          return
        }

        onSelectStage?.(stage)
        marker.openPopup()
      })

      marker.on('dragstart', () => {
        isDraggingRef.current = true
        if (dragResetTimeoutRef.current) {
          window.clearTimeout(dragResetTimeoutRef.current)
        }
        dragClickSuppressUntilRef.current = Date.now() + 700
        map.getContainer().classList.add('admin-map-dragging-node')
      })

      let previewNodeLine: L.Polyline | null = null
      let lastNodeFetchTime = 0

      marker.on('drag', () => {
        dragClickSuppressUntilRef.current = Date.now() + 700
        const now = Date.now()
        const next = marker.getLatLng()
        ring.setLatLng(next)

        // Live calculation of route distance as node is dragged across map
        const currentWaypoints = mappedStages.map((s) => {
          if (s.index === stage.index) return [next.lat, next.lng] as [number, number]
          return getStageCoords(s)
        }).filter((c): c is [number, number] => c !== null)

        if (currentWaypoints.length >= 2) {
          let straightDist = 0
          for (let k = 0; k < currentWaypoints.length - 1; k++) {
            const [lat1, lon1] = currentWaypoints[k]
            const [lat2, lon2] = currentWaypoints[k + 1]
            const R = 6371.0
            const dlat = ((lat2 - lat1) * Math.PI) / 180
            const dlon = ((lon2 - lon1) * Math.PI) / 180
            const a =
              Math.sin(dlat / 2) ** 2 +
              Math.cos((lat1 * Math.PI) / 180) *
                Math.cos((lat2 * Math.PI) / 180) *
                Math.sin(dlon / 2) ** 2
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
            straightDist += R * c
          }
          const estTrailKm = straightDist * 1.3
          const estDuration = Math.round(estTrailKm * 15)

          setRouteMetricsHUD((prev) => ({
            ...prev,
            distanceKm: estTrailKm,
            durationMin: estDuration,
          }))

          onMetricsUpdate?.({
            distanceKm: estTrailKm,
            trailKm: estTrailKm,
            durationMin: estDuration,
            measured: false,
          })
        }

        if (now - lastNodeFetchTime > 350) {
          lastNodeFetchTime = now
          const idx = orderedStages.findIndex((s) => s.index === stage.index)
          const waypointsList: [number, number][] = []
          if (idx > 0) {
            const c = getStageCoords(orderedStages[idx - 1])
            if (c) waypointsList.push(c)
          }
          waypointsList.push([next.lat, next.lng])
          if (idx < orderedStages.length - 1) {
            const c = getStageCoords(orderedStages[idx + 1])
            if (c) waypointsList.push(c)
          }

          if (waypointsList.length >= 2) {
            const coordString = waypointsList.map(([lat, lon]) => `${lon},${lat}`).join(';')
            const osrmUrl = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coordString}?overview=full&geometries=geojson`
            fetch(osrmUrl)
              .then((r) => r.json())
              .then((data) => {
                if (map.getContainer().classList.contains('admin-map-dragging-node') && data.routes?.[0]?.geometry?.coordinates) {
                  const pts = data.routes[0].geometry.coordinates.map(([lon, lat]: [number, number]) => [lat, lon])
                  if (!previewNodeLine) {
                    previewNodeLine = L.polyline(pts, {
                      color: '#ff0000',
                      weight: 8,
                      dashArray: '8, 8',
                      opacity: 0.95,
                      noClip: true,
                      renderer: polylineRendererRef.current ?? undefined,
                    }).addTo(map)
                  } else {
                    previewNodeLine.setLatLngs(pts)
                  }
                }
              })
              .catch(() => {})
          }
        }
      })

      marker.on('dragend', (event: L.LeafletEvent) => {
        if (previewNodeLine) {
          map.removeLayer(previewNodeLine)
          previewNodeLine = null
        }
        
        const original = (event as L.LeafletEvent & { originalEvent?: Event }).originalEvent
        if (original) {
          L.DomEvent.stopPropagation(original)
          L.DomEvent.preventDefault(original)
        }

        dragClickSuppressUntilRef.current = Date.now() + 700
        if (dragResetTimeoutRef.current) {
          window.clearTimeout(dragResetTimeoutRef.current)
        }
        dragResetTimeoutRef.current = window.setTimeout(() => {
          isDraggingRef.current = false
        }, 120)
        map.getContainer().classList.remove('admin-map-dragging-node')
        const next = marker.getLatLng()
        onMoveStage?.(stage, next.lat, next.lng, { select: false })
      })

      layersRef.current.push(ring, marker)
    })

    // Línea recta de orden entre nodos: sólo cuando NO hay trazado real.
    // Con el track del GPX dibujado, estas rectas cruzando el monte eran
    // justo los "caminos raros" que sobraban entre nodos.
    const skipOrderLines = orderedStages
      .slice(1)
      .every((stage) => getStageTrack(stage).length >= 2)

    for (let i = 0; !skipOrderLines && i < mappedStages.length - 1; i++) {
      const fromCoords = getStageCoords(mappedStages[i])
      const toCoords = getStageCoords(mappedStages[i + 1])
      if (!fromCoords || !toCoords) continue
      const routeLine = L.polyline([fromCoords, toCoords], {
        color: 'rgba(148,163,184,0.25)',
        weight: 1.5,
        opacity: 0.7,
        dashArray: '4 8',
        noClip: true,
        renderer: polylineRendererRef.current ?? undefined,
      }).addTo(map)
      layersRef.current.push(routeLine)
    }

    // Dibujar líneas de dependencias de coleccionables y recetas
    // RECIPES_DB: objeto_resultante -> ingredientes
    const RECIPES_DB: Record<string, string[]> = {
      llave_maestra: ['llave_rota', 'cinta_aislante'],
      emp_device: ['bateria_litio', 'cables_cobre', 'placa_base'],
    }

    // Normalizar ID para comparación consistente
    function normId(value: unknown): string {
      return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[- ]/g, '_')
    }

    mappedStages.forEach((targetStage) => {
      const target = targetStage as any
      const targetConfig = target?.config && typeof target.config === 'object' ? target.config : {}
      // Leer required_item_id desde múltiples posibles ubicaciones
      const reqId = normId(
        target?.required_item_id ?? targetConfig?.required_item_id ?? targetConfig?.item_id ?? ''
      )
      if (!reqId) return

      const targetCoords = getStageCoords(targetStage)
      if (!targetCoords) return

      // Obtener ingredientes/orígenes del objeto requerido
      const sourceItemIds = (RECIPES_DB[reqId] || [reqId]).map(normId)
      const isCrafted = Boolean(RECIPES_DB[reqId])

      sourceItemIds.forEach((itemId) => {
        // Encontrar nodos que producen este item
        mappedStages.forEach((sourceStage) => {
          if (sourceStage === targetStage) return
          const source = sourceStage as any
          const sourceConfig =
            source?.config && typeof source.config === 'object' ? source.config : {}

          // Buscar en múltiples campos donde puede estar el ID del objeto generado
          const sourceItemId = normId(
            source.physical_item_id ||
            sourceConfig?.physical_item_id ||
            (source?.physical_qr &&
                typeof source.physical_qr === 'object' &&
              (source.physical_qr as any)?.item_id) ||
              ''
          )

          if (sourceItemId && sourceItemId === itemId) {
            const sourceCoords = getStageCoords(sourceStage)
            if (!sourceCoords) return

            // Crear polilínea entre nodos enlazados
            const color = isCrafted ? '#a78bfa' : '#38bdf8' // Violeta si es crafteo, Celeste si es directo
            const line = L.polyline([sourceCoords, targetCoords], {
              color,
              weight: 3,
              opacity: 0.9,
              className: 'admin-dependency-polyline',
              noClip: true,
              renderer: polylineRendererRef.current ?? undefined,
            }).addTo(map)

            const srcLabel =
              source.title || source.physical_item_label || `Nodo ${sourceStage.index + 1}`
            const tgtLabel = target.title || `Nodo ${targetStage.index + 1}`
            const tooltipText = isCrafted
              ? `🔧 Ingrediente: "${itemId}" de ${sourceStage.index + 1} (${srcLabel}) → receta de "${reqId}" requerida en ${targetStage.index + 1} (${tgtLabel})`
              : `🔑 Requisito: "${reqId}" obtenido en ${sourceStage.index + 1} (${srcLabel}) → necesario para ${targetStage.index + 1} (${tgtLabel})`

            line.bindTooltip(tooltipText, {
              sticky: true,
              opacity: 0.96,
            })

            layersRef.current.push(line)
          }
        })
      })
    })

    if (!hasInitialFitRef.current && bounds.length > 0) {
      hasInitialFitRef.current = true
      if (bounds.length > 1) {
        map.fitBounds(L.latLngBounds(bounds), {
          padding: [56, 56],
          maxZoom: 16,
          animate: true,
          duration: 0.35,
        })
      } else if (bounds.length === 1) {
        map.setView(bounds[0], 16, {
          animate: true,
          duration: 0.35,
        })
      }
    }

    map.invalidateSize({ pan: false })
  }, [mappedStages, selectedStage, onSelectStage, onMoveStage, onSetLegVia, onSetLegTrack, freeShapeMode, zoomTick])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Limpiar capas previas del heatmap
    heatmapLayerRef.current.forEach((l) => l.remove())
    heatmapLayerRef.current = []

    if (!showHeatmap) {
      setHeatmapStatus('idle')
      setPlayerCount(0)
      return
    }

    setHeatmapStatus('loading')

    // Leer posiciones desde el servidor (los jugadores envían heartbeats con lat/lon)
    fetchAdminReactOverview()
      .then((data: any) => {
        const profiles: any[] = data?.profiles || []
        let count = 0
        const COLORS = ['#f43f5e', '#f97316', '#a855f7', '#3b82f6', '#10b981', '#eab308']

        profiles.forEach((profile, idx) => {
          const lat = profile.lat ?? profile.live_lat ?? profile.last_lat
          const lon = profile.lon ?? profile.live_lon ?? profile.last_lon
          if (typeof lat !== 'number' || typeof lon !== 'number') return
          if (lat === 0 && lon === 0) return

          count++
          const color = COLORS[idx % COLORS.length]
          const name = String(profile.name || profile.id || `Jugador ${idx + 1}`)

          // Círculo de posición actual
          const circle = L.circleMarker([lat, lon], {
            radius: 14,
            color,
            fillColor: color,
            fillOpacity: 0.28,
            weight: 3,
            opacity: 0.9,
            className: 'admin-player-position-ring',
          }).addTo(map)

          // Marcador con nombre
          const pinIcon = L.divIcon({
            className: '',
            iconSize: [10, 10],
            html: `<div class="admin-player-dot" style="background:${color};" title="${name}"></div>`,
          })
          const pin = L.marker([lat, lon], { icon: pinIcon, interactive: false }).addTo(map)

          // Popup con info
          circle.bindTooltip(
            `👤 ${name}<br/>📍 ${lat.toFixed(5)}, ${lon.toFixed(5)}<br/><small>${profile.gps_status || 'ok'}</small>`,
            { sticky: true, opacity: 0.96 }
          )

          heatmapLayerRef.current.push(circle, pin)
        })

        setPlayerCount(count)
        setHeatmapStatus(count > 0 ? 'ok' : 'empty')
      })
      .catch((err) => {
        console.error('Heatmap: error cargando posiciones', err)
        setHeatmapStatus('error')
      })
    // Con jugadores en vivo, refrescar posiciones cada 15 s sin rehacer el
    // resto del mapa. Antes esto se recreaba entero al mover cualquier nodo.
    const refresh = window.setInterval(() => {
      if (showHeatmap) setHeatmapNonce((value) => value + 1)
    }, 15000)

    return () => window.clearInterval(refresh)
    // mappedStages fuera de las dependencias a propósito: mover un nodo no
    // debe tirar abajo y recrear los marcadores de los jugadores.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHeatmap, heatmapNonce])

  // --- Route Play Animation ---
  useEffect(() => {
    if (!playRouteTrigger || playRouteTrigger === 0) return
    const map = mapRef.current
    const coords = lastRouteCoordsRef.current
    if (!map || coords.length < 2) return

    const arrowIcon = L.divIcon({
      className: 'saga-route-animator',
      html: '<div style="width:40px; height:40px; display:flex; align-items:center; justify-content:center;"><div style="font-size:32px; color:#ffffff; font-weight:900; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.8)); transform-origin: center;">➤</div></div>',
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    })
    
    const marker = L.marker(coords[0], { icon: arrowIcon, zIndexOffset: 9999, interactive: false }).addTo(map)

    let startTime: number | null = null
    const durationMs = 8000 // 8s duration for smoother, slower playback
    
    const totalDist = coords.reduce((acc, c, i) => {
      if (i === 0) return 0
      return acc + map.distance(coords[i - 1], c)
    }, 0)

    function animate(time: number) {
      if (!startTime) startTime = time
      const elapsed = time - startTime
      const progress = Math.min(elapsed / durationMs, 1)

      if (progress >= 1) {
        marker.remove()
        return
      }

      const targetDist = progress * totalDist
      let accumulated = 0
      for (let i = 0; i < coords.length - 1; i++) {
        const segDist = map!.distance(coords[i], coords[i+1])
        if (accumulated + segDist >= targetDist) {
          const segProgress = (targetDist - accumulated) / segDist
          const lat = coords[i][0] + (coords[i+1][0] - coords[i][0]) * segProgress
          const lon = coords[i][1] + (coords[i+1][1] - coords[i][1]) * segProgress
          marker.setLatLng([lat, lon])

          const p1 = map!.latLngToLayerPoint(coords[i])
          const p2 = map!.latLngToLayerPoint(coords[i+1])
          const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI)
          
          const iconEl = marker.getElement()
          if (iconEl && iconEl.firstElementChild && iconEl.firstElementChild.firstElementChild) {
            (iconEl.firstElementChild.firstElementChild as HTMLElement).style.transform = `rotate(${angle}deg)`
          }

          break
        }
        accumulated += segDist
      }

      requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }, [playRouteTrigger])

  useEffect(() => {
    const map = mapRef.current
    const coords = selectedStage ? getStageCoords(selectedStage) : null
    if (!map || !coords) return

    const targetLatLng = L.latLng(coords)

    // Only pan if the selected node is outside current visible map bounds, avoiding flyTo zoom-out animations
    if (!map.getBounds().contains(targetLatLng)) {
      map.panTo(coords, {
        animate: true,
        duration: 0.35,
      })
    }
  }, [selectedStage])

  return (
    <section style={shell}>
      <style>{mapCss}</style>

      <div ref={mapRootRef} style={mapCanvas} aria-label="React admin mission map" />

    </section>
  )
}

const shell: React.CSSProperties = {
  position: 'relative',
  minHeight: 580,
  borderRadius: 28,
  overflow: 'hidden',
  border: '1px solid rgba(148,163,184,0.22)',
  background: 'rgba(2,6,23,0.42)',
  boxShadow: '0 20px 54px rgba(0,0,0,0.30)',
}

const mapCanvas: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 1,
}

const mapChrome: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  left: 12,
  zIndex: 10,
  display: 'flex',
  alignItems: 'center',
  padding: '6px 14px',
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(2,6,23,0.65)',
  backdropFilter: 'blur(14px)',
  boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
  pointerEvents: 'none',
}

const kicker: React.CSSProperties = {
  color: '#7dd3fc',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
}

const title: React.CSSProperties = {
  marginTop: 4,
  color: '#f8fafc',
  fontSize: 18,
  fontWeight: 950,
  letterSpacing: '-0.04em',
}

const helper: React.CSSProperties = {
  marginTop: 5,
  color: '#cbd5e1',
  fontSize: 11,
  fontWeight: 750,
}

const legend: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
  gap: 8,
  color: '#cbd5e1',
  fontSize: 11,
  fontWeight: 800,
}

const heatmapBtn: React.CSSProperties = {
  background: 'rgba(244,63,94,0.15)',
  border: '1px solid rgba(244,63,94,0.3)',
  color: '#f43f5e',
  borderRadius: 999,
  padding: '2px 10px',
  fontSize: 10,
  cursor: 'pointer',
  marginLeft: 8,
  pointerEvents: 'auto',
}

const emptyState: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: '50%',
  zIndex: 3,
  transform: 'translate(-50%, -50%)',
  display: 'grid',
  gap: 6,
  width: 'min(320px, calc(100% - 48px))',
  padding: 18,
  borderRadius: 22,
  border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(2,6,23,0.72)',
  color: '#e5eefc',
  textAlign: 'center',
  backdropFilter: 'blur(18px)',
}

const mapCss = `
.admin-osm-multiply-layer {
  mix-blend-mode: multiply !important;
  filter: contrast(150%) brightness(92%);
}

.admin-node-ring {
  cursor: pointer;
  filter: drop-shadow(0 8px 18px rgba(15,23,42,.24));
}

.admin-node-ring--selected {
  animation: adminNodePulse 1200ms ease-in-out infinite;
}

.admin-node-marker-icon {
  display: grid;
  place-items: center;
  background: transparent;
  border: 0;
  /* Sólo el círculo del pin recibe el ratón */
  pointer-events: none;
}

.admin-node-marker-icon .admin-node-pin {
  pointer-events: auto;
}

.admin-node-pin-shell {
  position: relative;
  display: grid;
  place-items: center;
  width: 62px;
  height: 62px;
  transform: translateZ(0);
}

.admin-node-pin-shell--selected {
  width: 74px;
  height: 74px;
}

.admin-node-pin {
  display: grid;
  place-items: center;
  position: relative;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  border: 4px solid var(--node-color);
  background:
    radial-gradient(circle at 38% 28%, rgba(255,255,255,.95), rgba(255,255,255,.68) 28%, var(--node-fill) 72%);
  color: #020617;
  box-shadow:
    0 0 0 5px rgba(255,255,255,.24),
    0 0 0 10px rgba(15,23,42,.20),
    0 12px 28px rgba(2,6,23,.40);
  cursor: grab;
  transition: transform 140ms ease, box-shadow 140ms ease;
}

.admin-node-pin--selected {
  width: 42px;
  height: 42px;
  border-width: 5px;
  box-shadow:
    0 0 0 7px rgba(255,255,255,.30),
    0 0 0 14px rgba(14,165,233,.18),
    0 0 28px rgba(255,255,255,.62),
    0 18px 34px rgba(2,6,23,.46);
}

.admin-node-pin:hover {
  transform: scale(1.08);
}

.admin-node-pin__index {
  font-size: 14px;
  font-weight: 950;
  line-height: 1;
}

.admin-node-pin__grip {
  position: absolute;
  right: -8px;
  top: 50%;
  transform: translateY(-50%);
  color: rgba(226,232,240,.92);
  text-shadow: 0 1px 4px rgba(0,0,0,.7);
  font-size: 11px;
  letter-spacing: -4px;
}

.admin-node-label {
  /* La etiqueta no debe capturar el ratón: arrastrando el texto se movía el
     nodo sin querer. El nodo sólo se arrastra desde su círculo. */
  pointer-events: none;
  position: absolute;
  left: 50%;
  top: calc(100% - 5px);
  transform: translateX(-50%);
  display: none;
  min-width: 120px;
  max-width: 220px;
  padding: 7px 9px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,.18);
  background: rgba(2,6,23,.78);
  box-shadow: 0 12px 24px rgba(2,6,23,.28);
  color: #f8fafc;
  text-align: center;
  backdrop-filter: blur(14px);
  pointer-events: none;
}

.admin-node-label strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
}

.admin-node-label span {
  display: block;
  margin-top: 2px;
  color: #bae6fd;
  font-size: 10px;
  font-weight: 800;
}

.admin-node-label--selected {
  display: block;
}

.admin-map-dragging-node .admin-node-pin {
  cursor: grabbing;
  transform: scale(1.12);
}

.admin-node-marker-icon:hover .admin-node-label {
  display: block;
}

.admin-node-ring:hover {
  opacity: .92;
}

.leaflet-control-zoom {
  border: 0 !important;
  box-shadow: 0 12px 28px rgba(2,6,23,.28) !important;
}

.leaflet-control-zoom a {
  background: rgba(2,6,23,.74) !important;
  color: #f8fafc !important;
  border: 1px solid rgba(255,255,255,.14) !important;
  backdrop-filter: blur(14px);
}


.admin-node-pin__physical {
  position: absolute;
  top: -11px;
  right: -11px;
  display: grid;
  place-items: center;
  width: 25px;
  height: 25px;
  border-radius: 999px;
  border: 2px solid rgba(255,255,255,.92);
  background: rgba(2,6,23,.86);
  box-shadow:
    0 7px 18px rgba(2,6,23,.42),
    inset 0 1px 0 rgba(255,255,255,.16);
  font-size: 13px;
  line-height: 1;
  z-index: 2;
}

.admin-node-pin__physical--collectible {
  background: rgba(113,63,18,.92);
}

.admin-node-pin__physical--requirement {
  background: rgba(30,64,175,.92);
}

.admin-node-pin__physical--clue {
  background: rgba(20,83,45,.92);
}

.admin-node-pin__physical--bonus {
  background: rgba(157,23,77,.92);
}

.admin-node-label__physical {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  margin-right: 5px;
  border-radius: 999px;
  background: rgba(255,255,255,.12);
  font-size: 11px;
  vertical-align: -3px;
}

@keyframes adminNodePulse {
  0% { stroke-opacity: .92; fill-opacity: .24; }
  50% { stroke-opacity: .36; fill-opacity: .08; }
  100% { stroke-opacity: .92; fill-opacity: .24; }
}
`
