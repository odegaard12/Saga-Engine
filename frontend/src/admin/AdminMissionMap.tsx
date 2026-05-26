import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import type { AdminReactOverviewStage } from './lib/adminApi'
import { getPhysicalNodeMapLabel } from './lib/physicalNodeVisuals'

type AdminMissionMapProps = {
  stages: AdminReactOverviewStage[]
  selectedStage: AdminReactOverviewStage | null
  onSelectStage: (stage: AdminReactOverviewStage) => void
  onCreateStageAt?: (lat: number, lon: number) => void
  onMoveStage?: (stage: AdminReactOverviewStage, lat: number, lon: number) => void
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

function buildPinHtml(stage: AdminReactOverviewStage, selected: boolean, color: string, fill: string) {
  const title = escapeHtml(stage.title || 'Untitled node')
  const family = escapeHtml(getFamilyLabel(stage))
  const label = `${stage.index + 1}`

  return `
    <div class="admin-node-pin-shell${selected ? ' admin-node-pin-shell--selected' : ''}">
      <div
        class="admin-node-pin${selected ? ' admin-node-pin--selected' : ''}"
        style="--node-color:${color};--node-fill:${fill};"
        title="${title} · ${family}"
      >
        <span class="admin-node-pin__index">${label}</span>
        <span class="admin-node-pin__grip">⋮⋮</span>
      </div>
      <div class="admin-node-label${selected ? ' admin-node-label--selected' : ''}">
        <strong>${label}. ${title}</strong>
        <span>${family}</span>
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
}: AdminMissionMapProps) {
  const mapRootRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layersRef = useRef<L.Layer[]>([])

  const mappedStages = useMemo(
    () => stages.filter(hasCoords),
    [stages]
  )

  useEffect(() => {
    if (!mapRootRef.current || mapRef.current) return

    const map = L.map(mapRootRef.current, {
      zoomControl: false,
      attributionControl: false,
      doubleClickZoom: false,
    })

    L.control.zoom({ position: 'bottomright' }).addTo(map)

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    map.setView([42.26, -8.86], 13)
    mapRef.current = map

    return () => {
      layersRef.current.forEach((layer) => layer.remove())
      layersRef.current = []
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !onCreateStageAt) return

    const handleMapClick = (event: L.LeafletMouseEvent) => {
      onCreateStageAt(event.latlng.lat, event.latlng.lng)
    }

    map.on('click', handleMapClick)

    return () => {
      map.off('click', handleMapClick)
    }
  }, [onCreateStageAt])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    layersRef.current.forEach((layer) => layer.remove())
    layersRef.current = []

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
      const stageTitle = physicalLabel ? `${physicalLabel} · ${stage.title || 'Nodo'}` : (stage.title || 'Untitled node')
      const tooltip = `${stage.index + 1}. ${stageTitle} · ${getFamilyLabel(stage)} · ${radius}m`

      marker.bindTooltip(tooltip, {
        direction: 'top',
        opacity: 0.96,
      })

      ring.on('click', (event: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(event.originalEvent)
        onSelectStage(stage)
      })

      marker.on('click', (event: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(event.originalEvent)
        onSelectStage(stage)
      })

      marker.on('dragstart', () => {
        onSelectStage(stage)
        map.getContainer().classList.add('admin-map-dragging-node')
      })

      marker.on('drag', () => {
        const next = marker.getLatLng()
        ring.setLatLng(next)
      })

      marker.on('dragend', () => {
        map.getContainer().classList.remove('admin-map-dragging-node')
        const next = marker.getLatLng()
        onMoveStage?.(stage, next.lat, next.lng)
      })

      layersRef.current.push(ring, marker)
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
    const coords = selectedStage ? getStageCoords(selectedStage) : null
    if (!map || !coords) return

    map.flyTo(coords, Math.max(map.getZoom(), 16), {
      animate: true,
      duration: 0.35,
    })
  }, [selectedStage])

  return (
    <section style={shell}>
      <style>{mapCss}</style>

      <div style={mapChrome}>
        <div>
          <div style={kicker}>Mission map</div>
          <div style={title}>{mappedStages.length} mapped nodes</div>
          <div style={helper}>Click map to add · drag numbered pins to move</div>
        </div>
        <div style={legend}>
          <span><i style={{ background: '#34d399' }} /> Signal</span>
          <span><i style={{ background: '#38bdf8' }} /> Bearing</span>
          <span><i style={{ background: '#a78bfa' }} /> Circuit</span>
        </div>
      </div>

      <div ref={mapRootRef} style={mapCanvas} aria-label="React admin mission map" />

      {mappedStages.length === 0 ? (
        <div style={emptyState}>
          <strong>No mapped nodes yet.</strong>
          <span>Click anywhere on the map to create the first node.</span>
        </div>
      ) : null}
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

@keyframes adminNodePulse {
  0% { stroke-opacity: .92; fill-opacity: .24; }
  50% { stroke-opacity: .36; fill-opacity: .08; }
  100% { stroke-opacity: .92; fill-opacity: .24; }
}
`
