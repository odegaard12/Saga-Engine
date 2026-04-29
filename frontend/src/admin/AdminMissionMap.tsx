import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import type { AdminReactOverviewStage } from '../shared/api'

type AdminMissionMapProps = {
  stages: AdminReactOverviewStage[]
  selectedStage: AdminReactOverviewStage | null
  onSelectStage: (stage: AdminReactOverviewStage) => void
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
    fillOpacity: selected ? 0.98 : 0.82,
    weight: selected ? 4 : 3,
    radius: selected ? 10 : 8,
    ringOpacity: selected ? 0.34 : 0.16,
  }
}

export default function AdminMissionMap({
  stages,
  selectedStage,
  onSelectStage,
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
    })

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
        weight: selected ? 3 : 2,
        opacity: selected ? 0.88 : 0.54,
        fillColor: visual.color,
        fillOpacity: visual.ringOpacity,
        className: selected ? 'admin-node-ring admin-node-ring--selected' : 'admin-node-ring',
      }).addTo(map)

      const marker = L.circleMarker(coords, {
        radius: visual.radius,
        color: visual.color,
        weight: visual.weight,
        fillColor: visual.fillColor,
        fillOpacity: visual.fillOpacity,
        className: selected ? 'admin-node-marker admin-node-marker--selected' : 'admin-node-marker',
      }).addTo(map)

      const label = `${stage.index + 1}. ${stage.title || 'Untitled node'}`
      const tooltip = `${label} · ${getFamilyLabel(stage)} · ${radius}m`

      marker.bindTooltip(tooltip, {
        direction: 'top',
        opacity: 0.94,
      })

      ring.on('click', () => onSelectStage(stage))
      marker.on('click', () => onSelectStage(stage))

      layersRef.current.push(ring, marker)
    })

    if (bounds.length > 1) {
      map.fitBounds(L.latLngBounds(bounds), {
        padding: [44, 44],
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

    map.invalidateSize({ pan: false })
  }, [mappedStages, selectedStage, onSelectStage])

  useEffect(() => {
    const map = mapRef.current
    const coords = selectedStage ? getStageCoords(selectedStage) : null
    if (!map || !coords) return

    map.flyTo(coords, 16, {
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
          <span>Add latitude and longitude to nodes to show them on the Mission Control map.</span>
        </div>
      ) : null}
    </section>
  )
}

const shell: React.CSSProperties = {
  position: 'relative',
  minHeight: 520,
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
  background: 'rgba(2,6,23,0.56)',
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
  filter: drop-shadow(0 8px 16px rgba(15,23,42,.18));
}

.admin-node-ring--selected {
  animation: adminNodePulse 1200ms ease-in-out infinite;
}

.admin-node-marker {
  cursor: pointer;
  filter: drop-shadow(0 6px 14px rgba(15,23,42,.24));
}

.admin-node-marker--selected {
  filter: drop-shadow(0 0 16px rgba(255,255,255,.48));
}

.admin-node-marker:hover,
.admin-node-ring:hover {
  opacity: .92;
}

@keyframes adminNodePulse {
  0% { stroke-opacity: .92; fill-opacity: .24; }
  50% { stroke-opacity: .36; fill-opacity: .08; }
  100% { stroke-opacity: .92; fill-opacity: .24; }
}
`
