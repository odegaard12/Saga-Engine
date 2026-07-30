import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import { fetchAdminReactOverview, type AdminReactOverviewStage } from './lib/adminApi'
import { getPhysicalNodeMapLabel, getPhysicalNodeVisual } from './lib/physicalNodeVisuals'

type AdminMissionMapProps = {
  stages: AdminReactOverviewStage[]
  selectedStage: AdminReactOverviewStage | null
  onSelectStage: (stage: AdminReactOverviewStage) => void
  onCreateStageAt?: (lat: number, lon: number, clientPoint?: { x: number; y: number }) => void
  onMoveStage?: (stage: AdminReactOverviewStage, lat: number, lon: number) => void
  showHeatmap?: boolean
  onToggleHeatmap?: () => void
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
  if (stage.type === 'bearing_hunt') return 'Bearing'
  if (stage.type === 'circuit_matrix') return 'Circuit'
  return 'Signal'
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
  onMoveStage,
  showHeatmap: propShowHeatmap,
  onToggleHeatmap,
}: AdminMissionMapProps) {
  const mapRootRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layersRef = useRef<L.Layer[]>([])
  const routeLayersRef = useRef<L.Layer[]>([])
  const heatmapLayerRef = useRef<L.Layer[]>([])
  const dragClickSuppressUntilRef = useRef(0)
  const [localShowHeatmap, setLocalShowHeatmap] = useState(false)
  const [heatmapStatus, setHeatmapStatus] = useState<'idle' | 'loading' | 'ok' | 'empty' | 'error'>(
    'idle'
  )
  const [playerCount, setPlayerCount] = useState(0)

  const showHeatmap = propShowHeatmap !== undefined ? propShowHeatmap : localShowHeatmap
  const toggleHeatmap =
    onToggleHeatmap !== undefined ? onToggleHeatmap : () => setLocalShowHeatmap(!localShowHeatmap)

  const mappedStages = useMemo(() => stages.filter(hasCoords), [stages])

  const tileLayerRef = useRef<L.LayerGroup | null>(null)
  const [mapTileMode, setMapTileMode] = useState<'satellite' | 'satellite-osm' | 'topo'>('satellite-osm')

  useEffect(() => {
    if (!mapRootRef.current || mapRef.current) return

    const map = L.map(mapRootRef.current, {
      zoomControl: false,
      attributionControl: false,
      doubleClickZoom: false,
    })

    const tileGroup = L.layerGroup().addTo(map)
    tileLayerRef.current = tileGroup

    map.setView([42.36, -8.67], 14)
    mapRef.current = map

    return () => {
      layersRef.current.forEach((layer) => layer.remove())
      layersRef.current = []
      map.remove()
      mapRef.current = null
    }
  }, [])

  const [routeMetricsHUD, setRouteMetricsHUD] = useState({ distanceKm: 0, durationMin: 0, elevationM: 0 })

  useEffect(() => {
    const tileGroup = tileLayerRef.current
    if (!tileGroup) return

    tileGroup.clearLayers()

    if (mapTileMode === 'satellite' || mapTileMode === 'satellite-osm') {
      const esriSat = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxNativeZoom: 18, maxZoom: 21 }
      )
      tileGroup.addLayer(esriSat)

      if (mapTileMode === 'satellite-osm') {
        const osmOverlay = L.tileLayer(
          'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
          { maxNativeZoom: 19, maxZoom: 21, opacity: 0.45 }
        )
        tileGroup.addLayer(osmOverlay)
      } else {
        const waymarkedTrails = L.tileLayer(
          'https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png',
          { maxNativeZoom: 18, maxZoom: 21, opacity: 0.85 }
        )
        const esriRoads = L.tileLayer(
          'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
          { maxNativeZoom: 18, maxZoom: 21, opacity: 0.95 }
        )
        const esriPlaces = L.tileLayer(
          'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
          { maxNativeZoom: 18, maxZoom: 21, opacity: 0.95 }
        )
        tileGroup.addLayer(waymarkedTrails)
        tileGroup.addLayer(esriRoads)
        tileGroup.addLayer(esriPlaces)
      }
    } else {
      const topoMap = L.tileLayer('/map-tiles/{z}/{x}/{y}.png', {
        maxNativeZoom: 18,
        maxZoom: 21,
      })
      tileGroup.addLayer(topoMap)
    }
  }, [mapTileMode])

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
      const coordString = waypoints.map(([lat, lon]) => `${lon},${lat}`).join(';')
      const osrmUrl = `https://router.project-osrm.org/route/v1/foot/${coordString}?overview=false&geometries=geojson&steps=true`

      fetch(osrmUrl)
        .then((res) => res.json())
        .then((data) => {
          oldRouteLayers.forEach((layer) => layer.remove())
          if (data && data.routes && data.routes[0] && data.routes[0].legs) {
            const route = data.routes[0]
            const distanceKm = route.distance / 1000.0
            const durationMin = Math.round((route.duration || (distanceKm * 900)) / 60)
            const elevationM = Math.round(distanceKm * 48)

            setRouteMetricsHUD({ distanceKm, durationMin, elevationM })

            // Extract all coordinates for GPX
            const allCoords: [number, number][] = []
            if (route.legs) {
              route.legs.forEach((leg: any) => {
                leg.steps.forEach((step: any) => {
                  step.geometry.coordinates.forEach(([lon, lat]: [number, number]) => {
                    allCoords.push([lat, lon])
                  })
                })
              })
            }

            // Dispatch metrics back to parent
            window.dispatchEvent(new CustomEvent('saga-route-metrics', { 
              detail: { distanceKm, elevationM, durationMin, mappedCount: waypoints.length, routeCoords: allCoords } 
            }))

            route.legs.forEach((leg: any, i: number) => {
              const legCoords: [number, number][] = []
              leg.steps.forEach((step: any) => {
                step.geometry.coordinates.forEach(([lon, lat]: [number, number]) => {
                  legCoords.push([lat, lon])
                })
              })

              const fromNode = orderedStages[i]
              const toNode = orderedStages[i + 1]
              const legTitle = `🟢 Tramo ${i + 1}: ${fromNode?.title || 'Nodo A'} ➡️ ${toNode?.title || 'Nodo B'} (Pasa ratón para VER EN ROJO / Arrastra la línea para moldear camino)`

              // Outer Dark Emerald Border
              const outerLine = L.polyline(legCoords, {
                color: '#047857',
                weight: 11,
                opacity: 0.8,
                lineCap: 'round',
                lineJoin: 'round',
              }).addTo(map)

              // Inner Vivid Emerald Green Polyline (Base route color: Green)
              const innerLine = L.polyline(legCoords, {
                color: '#10b981',
                weight: 6,
                opacity: 0.95,
                lineCap: 'round',
                lineJoin: 'round',
              }).addTo(map)

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
              let lastFetchTime = 0

              const handleMouseDown = (e: L.LeafletMouseEvent) => {
                L.DomEvent.stopPropagation(e.originalEvent)
                isDraggingLine = true
                map.dragging.disable()

                innerLine.setStyle({ color: '#ff0000', weight: 9 })
                outerLine.setStyle({ color: '#991b1b', weight: 14 })

                const fromPoint = legCoords[0]
                const toPoint = legCoords[legCoords.length - 1]

                const handleMouseMove = (moveEvt: L.LeafletMouseEvent) => {
                  if (!isDraggingLine) return
                  const curPoint = moveEvt.latlng
                  const now = Date.now()

                  // Fast local preview immediately
                  if (!previewLine) {
                    previewLine = L.polyline([fromPoint, [curPoint.lat, curPoint.lng], toPoint], {
                      color: '#ff0000',
                      weight: 7,
                      dashArray: '8, 8',
                      opacity: 0.95,
                    }).addTo(map)
                  }

                  // Throttled OSRM dynamic road snapping (~120ms)
                  if (now - lastFetchTime > 120) {
                    lastFetchTime = now
                    const osrmUrl = `https://router.project-osrm.org/route/v1/foot/${fromPoint[1]},${fromPoint[0]};${curPoint.lng},${curPoint.lat};${toPoint[1]},${toPoint[0]}?overview=full&geometries=geojson`
                    fetch(osrmUrl)
                      .then((res) => res.json())
                      .then((data) => {
                        if (isDraggingLine && data.routes?.[0]?.geometry?.coordinates) {
                          const routePts: [number, number][] = data.routes[0].geometry.coordinates.map(
                            ([lon, lat]: [number, number]) => [lat, lon]
                          )
                          if (previewLine) {
                            previewLine.setLatLngs(routePts)
                            previewLine.setStyle({ dashArray: undefined, color: '#ff0000', weight: 8 })
                          }
                        }
                      })
                      .catch(() => {})
                  }
                }

                const handleMouseUp = (upEvt: L.LeafletMouseEvent) => {
                  map.off('mousemove', handleMouseMove)
                  map.off('mouseup', handleMouseUp)
                  map.dragging.enable()

                  if (previewLine) {
                    map.removeLayer(previewLine)
                    previewLine = null
                  }

                  if (isDraggingLine && onMoveStage) {
                    const dropPt = upEvt.latlng
                    if (dropPt && fromNode) {
                      // Adjust stage waypoint position along trail smoothly
                      onMoveStage(fromNode, dropPt.lat, dropPt.lng)
                    }
                  }
                  isDraggingLine = false
                  innerLine.setStyle({ color: '#10b981', weight: 6 })
                  outerLine.setStyle({ color: '#047857', weight: 11 })
                }

                map.on('mousemove', handleMouseMove)
                map.on('mouseup', handleMouseUp)
              }

              innerLine.on('mousedown', handleMouseDown)
              outerLine.on('mousedown', handleMouseDown)

              routeLayersRef.current.push(outerLine, innerLine)
            })
          } else {
            fallbackLines(map)
          }
        })
        .catch(() => {
          oldRouteLayers.forEach((layer) => layer.remove())
          fallbackLines(map)
        })
    }

    function fallbackLines(m: L.Map) {
      const fallbackLine = L.polyline(waypoints, {
        color: '#dc2626',
        weight: 6,
        opacity: 0.9,
        dashArray: '8, 8',
      }).addTo(m)
      routeLayersRef.current.push(fallbackLine)
      window.dispatchEvent(new CustomEvent('saga-route-metrics', { 
        detail: { distanceKm: 0, elevationM: 0, mappedCount: waypoints.length, routeCoords: [] } 
      }))
    }

    const bounds: L.LatLngExpression[] = []

    mappedStages.forEach((stage) => {
      const coords = getStageCoords(stage)
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
      }).addTo(map)

      const markerSize = selected ? 74 : 62
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
            onSelectStage(stage)
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

        onSelectStage(stage)
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

        onSelectStage(stage)
        marker.openPopup()
      })

      marker.on('dragstart', () => {
        dragClickSuppressUntilRef.current = Date.now() + 700
        map.getContainer().classList.add('admin-map-dragging-node')
      })

      marker.on('drag', () => {
        dragClickSuppressUntilRef.current = Date.now() + 700
        const next = marker.getLatLng()
        ring.setLatLng(next)
      })

      marker.on('dragend', (event: L.LeafletEvent) => {
        const original = (event as L.LeafletEvent & { originalEvent?: Event }).originalEvent
        if (original) {
          L.DomEvent.stopPropagation(original)
          L.DomEvent.preventDefault(original)
        }

        dragClickSuppressUntilRef.current = Date.now() + 700
        map.getContainer().classList.remove('admin-map-dragging-node')
        const next = marker.getLatLng()
        onMoveStage?.(stage, next.lat, next.lng)
      })

      layersRef.current.push(ring, marker)
    })

    // Dibujar línea de orden de ruta entre nodos consecutivos (thin grey)
    for (let i = 0; i < mappedStages.length - 1; i++) {
      const fromCoords = getStageCoords(mappedStages[i])
      const toCoords = getStageCoords(mappedStages[i + 1])
      if (!fromCoords || !toCoords) continue
      const routeLine = L.polyline([fromCoords, toCoords], {
        color: 'rgba(148,163,184,0.25)',
        weight: 1.5,
        opacity: 0.7,
        dashArray: '4 8',
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
      const targetConfig = target.config && typeof target.config === 'object' ? target.config : {}
      // Leer required_item_id desde múltiples posibles ubicaciones
      const reqId = normId(
        target.required_item_id || targetConfig.required_item_id || targetConfig.item_id || ''
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
            source.config && typeof source.config === 'object' ? source.config : {}

          // Buscar en múltiples campos donde puede estar el ID del objeto generado
          const sourceItemId = normId(
            source.physical_item_id ||
              sourceConfig.physical_item_id ||
              (source.physical_qr &&
                typeof source.physical_qr === 'object' &&
                (source.physical_qr as any).item_id) ||
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

    if (!selectedStage) {
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
  }, [mappedStages, selectedStage, onSelectStage, onMoveStage])

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
  }, [showHeatmap, mappedStages])

  useEffect(() => {
    const map = mapRef.current
    const coords = selectedStage ? getStageCoords(selectedStage) : null
    if (!map || !coords) return

    const currentCenter = map.getCenter()
    const targetLatLng = L.latLng(coords)
    
    // Only fly if it's far away (more than 10 meters) to avoid jumping when dragging
    if (currentCenter.distanceTo(targetLatLng) > 10) {
      map.flyTo(coords, Math.max(map.getZoom(), 16), {
        animate: true,
        duration: 0.35,
      })
    }
  }, [selectedStage])

  return (
    <section style={shell}>
      <style>{mapCss}</style>

      <div style={mapChrome}>
        <div>
          <div style={kicker}>Mapa de Misión</div>
          <div style={title}>{mappedStages.length} Nodos Mapeados</div>
          <div style={helper}>
            Haz clic o arrastra la línea roja por el mapa para cambiar la ruta por el monte
          </div>
        </div>

        {/* Floating High-Contrast Route HUD Widget */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95))',
          border: '1.5px solid rgba(239, 68, 68, 0.7)',
          borderRadius: 12,
          padding: '6px 14px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 12px rgba(239, 68, 68, 0.3)',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontSize: 12,
          fontWeight: 800,
          pointerEvents: 'auto',
        }}>
          <span style={{ color: '#ef4444', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 5 }}>
            🟢 RUTA SENDEROS
          </span>
          <span style={{ color: '#ffffff', display: 'flex', alignItems: 'center', gap: 4 }}>
            📏 Distancia: <strong style={{ color: '#facc15', fontSize: 13 }}>{routeMetricsHUD.distanceKm.toFixed(2)} km</strong>
          </span>
          <span style={{ color: '#475569' }}>|</span>
          <span style={{ color: '#ffffff', display: 'flex', alignItems: 'center', gap: 4 }}>
            ⏱️ Tiempo: <strong style={{ color: '#38bdf8', fontSize: 13 }}>{routeMetricsHUD.durationMin >= 60 ? `${Math.floor(routeMetricsHUD.durationMin / 60)}h ${routeMetricsHUD.durationMin % 60}m` : `${routeMetricsHUD.durationMin} min`}</strong>
          </span>
          <span style={{ color: '#475569' }}>|</span>
          <span style={{ color: '#ffffff', display: 'flex', alignItems: 'center', gap: 4 }}>
            ⛰️ Desnivel: <strong style={{ color: '#4ade80', fontSize: 13 }}>+{routeMetricsHUD.elevationM}m</strong>
          </span>
        </div>

        <div style={legend}>
          <button
            type="button"
            onClick={() => {
              if (mapTileMode === 'satellite-osm') setMapTileMode('satellite')
              else if (mapTileMode === 'satellite') setMapTileMode('topo')
              else setMapTileMode('satellite-osm')
            }}
            style={{
              background: mapTileMode.startsWith('satellite') ? 'linear-gradient(135deg, #0ea5e9, #2563eb)' : 'rgba(15, 23, 42, 0.75)',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '11px',
              padding: '6px 14px',
              borderRadius: '10px',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              pointerEvents: 'auto',
            }}
          >
            {mapTileMode === 'satellite-osm' ? '📡 Satélite + Caminos' : mapTileMode === 'satellite' ? '📡 Satélite Limpio' : '🗺️ Mapa Base'}
          </button>
          <button type="button" onClick={toggleHeatmap} style={heatmapBtn}>
            {showHeatmap ? 'Ocultar Rastros' : 'Ver Rastros'}
          </button>
        </div>
      </div>

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
  top: 14,
  left: 14,
  right: 14,
  zIndex: 2,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
  padding: 14,
  borderRadius: 22,
  border: '1px solid rgba(255,255,255,0.16)',
  background: 'rgba(2,6,23,0.58)',
  backdropFilter: 'blur(18px)',
  boxShadow: '0 14px 36px rgba(0,0,0,0.24)',
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
