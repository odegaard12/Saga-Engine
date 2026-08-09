import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import AdminMissionMap from '../AdminMissionMap'
import FamiliesPanel from './FamiliesPanel'
import NodeDetailDrawer from './NodeDetailDrawer'
import NodePhysicalTypePanel from './NodePhysicalTypePanel'
import PlayersPanel from './PlayersPanel'
import SettingsPanel from './SettingsPanel'
import MissionBuilderPanel from './MissionBuilderPanel'
import type {
  AdminProfileAction,
  AdminReactOverviewProfile,
  AdminReactOverviewStage,
} from '../lib/adminApi'
import { familyCards } from '../lib/familyConfigs'
import { findRecipeForOutput } from '../../shared/recipeCatalog'
import { fetchMissionBackup } from '../lib/adminApi'
import { getAdminGameForStage } from '../lib/gameCatalog'
import type { MissionTemplateId } from '../lib/gameCatalog'
import type { PlayerDraft } from '../lib/playerDrafts'
import { getPhysicalNodeVisual } from '../lib/physicalNodeVisuals'
import { useI18n } from '../../i18n/useI18n'
import ObjectsPanel from './ObjectsPanel'
import ReleaseNotesModal from './ReleaseNotesModal'
import { printAllQrs } from '../utils/printQrs'
import '../styles/admin-modern-shell.css'

type CmsPanel = 'none' | 'players' | 'mission' | 'labels' | 'builder' | 'objects'
type StandardSaveState = 'idle' | 'saving' | 'saved' | 'error'
type MissionSaveState = StandardSaveState | 'dirty'

type AdminMissionControlShellProps = {
  title: string
  subtitle: string
  profiles: AdminReactOverviewProfile[]
  stages: AdminReactOverviewStage[]
  familyCounts: Record<string, number>
  selectedStage: AdminReactOverviewStage | null
  cmsPanel: CmsPanel
  localNotice: string | null
  saveState: MissionSaveState
  saveError: string | null
  playerDrafts: PlayerDraft[]
  playerSaveState: StandardSaveState
  playerSaveError: string | null
  profileProgress: Record<string, { level: number | null; finished: boolean }>
  profileActionState: Record<string, string>
  profileActionError: Record<string, string>
  missionDraft: Record<string, string>
  settingsSaveState: StandardSaveState
  settingsSaveError: string | null
  onRefresh: () => void
  onSelectStage: (stage: AdminReactOverviewStage | null) => void
  onCreateNode: () => void
  onCreateNodeAt: (lat: number, lon: number) => void
  onInsertNodeAt?: (lat: number, lon: number, index: number) => void
  onMoveStage: (stage: AdminReactOverviewStage, lat: number, lon: number) => void
  onSetLegVia?: (stage: AdminReactOverviewStage, via: [number, number] | null) => void
  onSetLegTrack?: (stage: AdminReactOverviewStage, track: Array<[number, number]>) => void
  onApplyStage: (stage: AdminReactOverviewStage) => void
  onDeleteStage: (stage: AdminReactOverviewStage) => void
  onReorderStage: (stage: AdminReactOverviewStage, direction: 'up' | 'down') => void
  onSaveStages: () => void
  onSetCmsPanel: (panel: CmsPanel) => void
  onUpdatePlayer: (index: number, key: keyof PlayerDraft, value: string) => void
  onDeletePlayer: (index: number) => void
  onAddPlayer: () => void
  onSavePlayers: () => void
  onProfileAction: (profileId: string, action: AdminProfileAction) => void
  onUpdateMissionDraft: (key: string, value: string) => void
  onSaveSettings: () => void
  onApplyMissionTemplate: (templateId: MissionTemplateId) => void
  onCreateNodesWithItems?: (items: Array<{ id: string; label: string }>) => void
}

export type RouteMetrics = {
  distanceKm: number
  trailKm: number
  elevationM: number
  durationMin: number
  mappedCount: number
  routeCoords: [number, number][]
  /** true cuando la distancia viene del router (camino real), no de la recta */
  measured?: boolean
}

function selectedStageKey(stage: AdminReactOverviewStage | null) {
  if (!stage) return ''
  return String(stage.id ?? stage.index)
}

function getUiBoolean(stage: AdminReactOverviewStage | null, key: string) {
  if (!stage) return false
  return Boolean((stage as unknown as Record<string, unknown>)[key])
}

export default function AdminMissionControlShell({
  title,
  subtitle,
  profiles,
  stages,
  familyCounts,
  selectedStage,
  cmsPanel,
  localNotice,
  saveState,
  saveError,
  playerDrafts,
  playerSaveState,
  playerSaveError,
  profileProgress,
  profileActionState,
  profileActionError,
  missionDraft,
  settingsSaveState,
  settingsSaveError,
  onRefresh,
  onSelectStage,
  onCreateNode,
  onCreateNodeAt,
  onInsertNodeAt,
  onMoveStage,
  onSetLegVia,
  onSetLegTrack,
  onApplyStage,
  onDeleteStage,
  onReorderStage,
  onSaveStages,
  onSetCmsPanel,
  onUpdatePlayer,
  onDeletePlayer,
  onAddPlayer,
  onSavePlayers,
  onProfileAction,
  onUpdateMissionDraft,
  onSaveSettings,
  onApplyMissionTemplate,
  onCreateNodesWithItems,
}: AdminMissionControlShellProps) {
  const { t } = useI18n()
  const [typeChooserStageKey, setTypeChooserStageKey] = useState<string | null>(null)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [freeShape, setFreeShape] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const [showReleaseNotes, setShowReleaseNotes] = useState(false)
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
  const [saveValidationWarning, setSaveValidationWarning] = useState<string | null>(null)

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveState === 'dirty') {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [saveState])

  const handleRefreshClick = () => {
    if (saveState === 'dirty') {
      setShowUnsavedDialog(true)
    } else {
      onRefresh()
    }
  }
  const [pendingCreateLocation, setPendingCreateLocation] = useState<{
    lat: number
    lon: number
    clientX: number
    clientY: number
  } | null>(null)
  const [pendingPinQueue, setPendingPinQueue] = useState<
    Array<{ label: string; item: { id: string; label: string } }>
  >([])
  const [activePinIndex, setActivePinIndex] = useState(0)

  const liveSelectedStage = selectedStage
    ? stages.find((stage) => selectedStageKey(stage) === selectedStageKey(selectedStage)) ||
      stages.find((stage) => stage.index === selectedStage.index) ||
      selectedStage
    : null

  const selectedIndex = liveSelectedStage
    ? stages.findIndex((stage) => stage.index === liveSelectedStage.index)
    : -1

  const selectedKey = selectedStageKey(liveSelectedStage)

  const hasTypeAssigned = Boolean(
    liveSelectedStage &&
      (getUiBoolean(liveSelectedStage, '_type_choice_done') ||
        Boolean((liveSelectedStage as any).physical_node_kind) ||
        (liveSelectedStage as any).game_type ||
        (liveSelectedStage as any).config?.reward_item_id)
  )

  const shouldShowTypeChooser = Boolean(
    liveSelectedStage &&
      (typeChooserStageKey === selectedKey ||
        (typeof liveSelectedStage.id === 'string' &&
          liveSelectedStage.id.startsWith('local-') &&
          !hasTypeAssigned))
  )

  useEffect(() => {
    if (!liveSelectedStage) {
      setTypeChooserStageKey(null)
      return
    }

    if (
      typeof liveSelectedStage.id === 'string' &&
      liveSelectedStage.id.startsWith('local-') &&
      !hasTypeAssigned
    ) {
      setTypeChooserStageKey(selectedStageKey(liveSelectedStage))
    }
  }, [selectedKey, hasTypeAssigned])

  function handleCreateNodesWithItemsBatch(items: Array<{ id: string; label: string }>) {
    if (!onCreateNodesWithItems || !items.length) return

    setPendingPinQueue(items.map((item) => ({ label: item.label, item })))
    setActivePinIndex(0)

    // Place ONLY the 1st pin on the map
    onCreateNodesWithItems([items[0]])
  }

  function handleConfirmCurrentPin() {
    if (activePinIndex < pendingPinQueue.length - 1) {
      const nextIdx = activePinIndex + 1
      setActivePinIndex(nextIdx)
      const nextItem = (pendingPinQueue[nextIdx] as any)?.item

      if (nextItem && onCreateNodesWithItems) {
        onCreateNodesWithItems([nextItem])
      }
    } else {
      setPendingPinQueue([])
      setActivePinIndex(0)
      onSelectStage(null)
    }
  }

  const mappedCount = stages.filter(
    (stage) => typeof stage.lat === 'number' && typeof stage.lon === 'number'
  ).length

  const liveGeodesicDistanceKm = useMemo(() => {
    const ordered = [...stages]
      .filter(
        (stage): stage is AdminReactOverviewStage & { lat: number; lon: number } =>
          typeof stage.lat === 'number' && typeof stage.lon === 'number'
      )
      .sort((a, b) => a.index - b.index)

    if (ordered.length < 2) return 0

    let totalMeters = 0
    for (let i = 0; i < ordered.length - 1; i += 1) {
      const from = L.latLng(ordered[i].lat, ordered[i].lon)
      const to = L.latLng(ordered[i + 1].lat, ordered[i + 1].lon)
      totalMeters += from.distanceTo(to)
    }
    return totalMeters / 1000
  }, [stages])

  const [metrics, setMetrics] = useState<RouteMetrics>({ distanceKm: 0, trailKm: 0, elevationM: 0, durationMin: 0, mappedCount: 0, routeCoords: [] })
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([])
  const [playCounter, setPlayCounter] = useState(0)
  const localStageCount = stages.length

  // La distancia mostrada es la del router (distancia real por camino) cuando
  // está disponible. Si no lo está, se muestra la distancia en línea recta tal
  // cual y se avisa en la barra: antes se enseñaba la recta multiplicada por
  // 1,32 (un número inventado) y quedaba congelada sin que se notase.
  // Distancia del trazado real (route_track). Se calcula AQUÍ, directamente de
  // los datos, sin depender de que el mapa avise: antes la barra dependía de
  // un efecto del mapa y si ese aviso no llegaba se quedaba en la recta.
  const gpxDistanceKm = useMemo(() => {
    const ordered = [...stages].sort((a, b) => a.index - b.index)
    if (ordered.length < 2) return null

    let total = 0
    for (let i = 1; i < ordered.length; i++) {
      const raw = (ordered[i] as unknown as Record<string, unknown>).route_track
      if (!Array.isArray(raw) || raw.length < 2) return null

      for (let k = 0; k < raw.length - 1; k++) {
        const a = raw[k] as [number, number]
        const b = raw[k + 1] as [number, number]
        if (!Array.isArray(a) || !Array.isArray(b)) return null
        total += L.latLng(a[0], a[1]).distanceTo(L.latLng(b[0], b[1])) / 1000
      }
    }

    return total > 0 ? total : null
  }, [stages])

  const reportedKm =
    gpxDistanceKm !== null
      ? gpxDistanceKm
      : Number.isFinite(metrics.trailKm) && metrics.trailKm > 0
        ? metrics.trailKm
        : Number.isFinite(metrics.distanceKm) && metrics.distanceKm > 0
          ? metrics.distanceKm
          : null

  // Se muestra siempre el último valor reportado por el mapa (incluye los
  // caminos moldeados, por eso cambia en vivo al arrastrar una línea) y la
  // etiqueta dice si es la distancia real por camino o la línea recta.
  const displayDistanceKm = reportedKm ?? liveGeodesicDistanceKm ?? 0
  const distanceIsMeasured =
    gpxDistanceKm !== null || (reportedKm !== null && metrics.measured === true)

  const displayDurationMin =
    Number.isFinite(metrics.durationMin) && metrics.durationMin > 0
      ? metrics.durationMin
      : Math.round(displayDistanceKm * 15)

  const hasElevation = Number.isFinite(metrics.elevationM) && metrics.elevationM > 0
  const displayElevationM = hasElevation ? metrics.elevationM : null

  const handleRouteMetricsUpdate = (newMetrics: Partial<RouteMetrics>) => {
    setMetrics(prev => {
      const updated = { ...prev, ...newMetrics }
      if (updated.routeCoords && updated.routeCoords.length > 0) {
        setRouteCoords(updated.routeCoords)
      }
      return updated
    })
  }

  function descargar(contenido: BlobPart, nombre: string, tipo: string) {
    const url = URL.createObjectURL(new Blob([contenido], { type: tipo }))
    const a = document.createElement('a')
    a.href = url
    a.download = nombre
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function marcaDeTiempo() {
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
  }

  /**
   * Copia de respaldo de la misión entera.
   *
   * Antes este botón bajaba sólo un GPX con el trazado, que no permite
   * recuperar nada: si se pierde la tarjeta de la Raspberry se van con ella los
   * nodos, la configuración de cada juego, los textos, los jugadores y sus
   * fotos. Ahora baja un JSON con todo, y el GPX aparte para quien quiera abrir
   * la ruta en un GPS.
   */
  async function handleExportBackup() {
    if (exportando) return
    setExportando(true)
    setExportError(null)

    try {
      const copia = await fetchMissionBackup()

      if (copia.status !== 'ok') {
        throw new Error('El servidor no devolvió la copia.')
      }

      descargar(
        JSON.stringify(copia, null, 2),
        `saga-copia-${marcaDeTiempo()}.json`,
        'application/json'
      )

      // El GPX sale de la propia copia, así que los dos ficheros siempre
      // cuentan lo mismo.
      const puntos = Array.isArray(copia.route_track)
        ? (copia.route_track as Array<[number, number]>)
        : routeCoords

      if (puntos.length > 0) {
        let gpx = '<?xml version="1.0" encoding="UTF-8"?>\n'
        gpx +=
          '<gpx version="1.1" creator="SAGA Engine" xmlns="http://www.topografix.com/GPX/1/1">\n'
        gpx += '  <trk>\n    <name>Ruta SAGA</name>\n    <trkseg>\n'
        puntos.forEach(([lat, lon]) => {
          gpx += `      <trkpt lat="${lat}" lon="${lon}"></trkpt>\n`
        })
        gpx += '    </trkseg>\n  </trk>\n</gpx>'
        descargar(gpx, `saga-ruta-${marcaDeTiempo()}.gpx`, 'application/gpx+xml')
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'No se pudo exportar.')
    } finally {
      setExportando(false)
    }
  }

  function togglePanel(panel: CmsPanel) {
    onSetCmsPanel(cmsPanel === panel ? 'none' : panel)
  }

  function normalizeCreatePopoverPoint(clientPoint?: { x: number; y: number }) {
    const width = typeof window !== 'undefined' ? window.innerWidth : 390
    const height = typeof window !== 'undefined' ? window.innerHeight : 760
    const rawX = clientPoint?.x ?? width / 2
    const rawY = clientPoint?.y ?? height / 2

    return {
      clientX: Math.min(Math.max(rawX, 82), Math.max(82, width - 82)),
      clientY: Math.min(Math.max(rawY, 112), Math.max(112, height - 126)),
    }
  }

  function requestCreateNodeAt(lat: number, lon: number, clientPoint?: { x: number; y: number }) {
    const point = normalizeCreatePopoverPoint(clientPoint)
    setPendingCreateLocation({ lat, lon, ...point })
  }

  function cancelPendingCreateNode() {
    setPendingCreateLocation(null)
  }

  function confirmPendingCreateNode() {
    if (!pendingCreateLocation) return
    onCreateNodeAt(pendingCreateLocation.lat, pendingCreateLocation.lon)
    setPendingCreateLocation(null)
  }

  function validateRouteDependencies(stages: AdminReactOverviewStage[]): string | null {
    // Cuántas unidades de cada objeto reparte la ruta. Antes se guardaba sólo
    // "qué objetos existen", así que una receta que pedía 2 gemas pasaba la
    // validación aunque un único nodo entregase 1: la misión quedaba imposible
    // de terminar y el fallo sólo aparecía en el último nodo, en el monte.
    const provided = new Map<string, number>()

    function addProvided(itemId: unknown, quantity: unknown) {
      if (typeof itemId !== 'string' || !itemId.trim()) return
      const amount = Number(quantity)
      const safe = Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : 1
      provided.set(itemId, (provided.get(itemId) || 0) + safe)
    }

    for (const stage of stages) {
      const config =
        typeof (stage as any).config === 'object' && (stage as any).config
          ? ((stage as any).config as Record<string, unknown>)
          : {}

      addProvided(
        stage.physical_item_id,
        (stage as any).physical_item_quantity ?? config.physical_item_quantity
      )
      addProvided(config.reward_item_id, config.reward_item_quantity)
    }

    for (const stage of stages) {
      const reqId = String((stage as any).required_item_id || '').trim()
      if (!reqId) continue

      const nodeName = stage.title || 'Nodo'
      const needed = Math.max(1, Number((stage as any).required_item_quantity) || 1)

      // ¿Lo reparte algún nodo directamente?
      if ((provided.get(reqId) || 0) >= needed) continue

      // Si no, tiene que poder fabricarse. El catálogo es el mismo que usa la
      // mesa de trabajo del jugador, así que no puede quedarse desfasado.
      const recipe = findRecipeForOutput(reqId)
      if (!recipe) {
        return `El nodo "${nodeName}" requiere el objeto "${reqId}", pero ningún nodo de la misión lo entrega y ninguna receta lo fabrica.`
      }

      const missing = recipe.inputs
        .filter((input) => (provided.get(input.item_id) || 0) < input.quantity)
        .map((input) => {
          const have = provided.get(input.item_id) || 0
          return `${input.item_id} (hacen falta ${input.quantity}, la ruta da ${have})`
        })

      if (missing.length > 0) {
        return `El nodo "${nodeName}" requiere "${recipe.label}", pero la ruta no reparte sus ingredientes: ${missing.join('; ')}.`
      }
    }

    return null
  }

  function handleSaveStages() {
    const warning = validateRouteDependencies(stages)
    if (warning) {
      setSaveValidationWarning(warning)
      setTimeout(() => setSaveValidationWarning(null), 8000)
      return
    }
    onSaveStages()
  }

  const displayTitle = cleanAdminCopy(title, 'SAGA Engine')
  const displaySubtitle = cleanAdminCopy(subtitle, 'Mission Control')

  return (
    <main
      className={selectedStage ? 'saga-admin-shell has-node-editor' : 'saga-admin-shell'}
      aria-label="SAGA Engine admin mission control"
    >
      <aside className="saga-left-rail" aria-label="Mission navigation">
        <div className="saga-rail-brand">
          <span className="saga-brand-mark">⚡</span>
          <div>
            <strong>SAGA Engine</strong>
            <small>Mission Control</small>
          </div>
        </div>

        <section className="saga-mission-card">
          <span className="saga-eyebrow">{t('admin.liveMission')}</span>
          <h1>{displayTitle}</h1>
          <p>{displaySubtitle}</p>

          <div className="saga-mini-stats">
            <span>
              <b>{stages.length}</b> {t('admin.nodes')}
            </span>
            <span>
              <b>{profiles.length}</b> {t('admin.profiles')}
            </span>
            <span>
              <b>{mappedCount}</b> {t('admin.mapped')}
            </span>
          </div>
        </section>

        <nav className="saga-rail-actions" aria-label="Primary admin actions">
          <button
            type="button"
            className="saga-primary-action saga-admin-add-node-action"
            onClick={onCreateNode}
          >
            + {t('admin.addNode')}
          </button>

          <button
            type="button"
            className="saga-save-action"
            data-state={saveState}
            disabled={saveState === 'saving'}
            onClick={handleSaveStages}
          >
            {saveState === 'saving'
              ? '⏳ Guardando...'
              : saveState === 'dirty'
                ? '✏️ Sin guardar'
                : '✓ Guardado'}
          </button>

          <button type="button" onClick={handleRefreshClick}>
            {t('admin.refresh')}
          </button>
        </nav>

        {saveValidationWarning ? (
          <div className="saga-save-validation-warning">
            <b>⚠️ Misión incompleta</b>
            <p>{saveValidationWarning}</p>
          </div>
        ) : null}

        <div className="saga-panel-switcher">
          <button
            type="button"
            className={cmsPanel === 'players' ? 'active' : ''}
            onClick={() => togglePanel('players')}
          >
            {t('admin.players')}
          </button>
          <button
            type="button"
            className={cmsPanel === 'labels' ? 'active' : ''}
            onClick={() => togglePanel('labels')}
          >
            {t('admin.families')}
          </button>
          <button
            type="button"
            className={cmsPanel === 'objects' ? 'active' : ''}
            onClick={() => togglePanel('objects')}
          >
            Objetos 🎒
          </button>
          <button
            type="button"
            className={cmsPanel === 'mission' ? 'active' : ''}
            onClick={() => togglePanel('mission')}
          >
            {t('admin.settings')}
          </button>
        </div>

        <section className="saga-route-list" aria-label="Route nodes">
          <div className="saga-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span>{t('admin.route')}</span>
              <b>{stages.length}</b>
            </div>
            <button
              type="button"
              className="saga-ghost-action"
              style={{ fontSize: 11, padding: '4px 8px', background: 'rgba(255,255,255,.08)', borderRadius: 8, border: 0, color: '#e2e8f0', cursor: 'pointer' }}
              onClick={() => printAllQrs(stages)}
            >
              🖨️ QRs
            </button>
          </div>

          <div className="saga-node-scroll">
            {stages.map((stage, routeIndex) => {
              const physicalVisual = getPhysicalNodeVisual(stage)
              const stageConfig =
                typeof (stage as unknown as { config?: unknown }).config === 'object' &&
                (stage as unknown as { config?: unknown }).config !== null
                  ? (stage as unknown as { config?: Record<string, unknown> }).config || {}
                  : {}
              const displayGame = getAdminGameForStage(stage.type, stageConfig)
              const selected = selectedStage?.index === stage.index

              return (
                <div
                  key={`${stage.index}-${stage.id ?? stage.title}`}
                  className={selected ? 'saga-node-row active' : 'saga-node-row'}
                >
                  <button
                    type="button"
                    className="saga-node-main"
                    onClick={() => onSelectStage(stage)}
                  >
                    <span className="saga-node-index">{routeIndex + 1}</span>
                    <span className="saga-node-copy">
                      <strong className="saga-node-title-line">
                        {physicalVisual ? (
                          <span
                            className={`saga-physical-node-badge saga-physical-node-badge--${physicalVisual.tone}`}
                            title={physicalVisual.label}
                            aria-label={physicalVisual.label}
                          >
                            {physicalVisual.icon}
                          </span>
                        ) : null}
                        <span className="saga-node-title-text">
                          {stage.title || t('admin.untitledNode')}
                        </span>
                      </strong>
                      <small>
                        {physicalVisual
                          ? physicalVisual.label
                          : displayGame.title || stage.label || stage.type}
                        {' · '}
                        {formatCoords(stage.lat, stage.lon)}
                      </small>
                    </span>
                  </button>

                  <span className="saga-node-order-actions">
                    <button
                      type="button"
                      title="Subir nodo"
                      disabled={routeIndex === 0}
                      onPointerDown={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        onReorderStage(stage, 'up')
                      }}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      title="Bajar nodo"
                      disabled={routeIndex >= stages.length - 1}
                      onPointerDown={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        onReorderStage(stage, 'down')
                      }}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
                    >
                      ↓
                    </button>
                  </span>
                </div>
              )
            })}

            {stages.length === 0 ? (
              <div className="saga-empty-mini">{t('admin.emptyRouteHelp')}</div>
            ) : null}
          </div>
        </section>
      </aside>

      <section className="saga-map-workspace" aria-label="Map workspace">
        <div className="saga-command-bar">
          <div className="saga-command-main">
            <button
              type="button"
              className="saga-command-primary saga-admin-add-node-action"
              onClick={onCreateNode}
            >
              {t('admin.addNode')}
            </button>
            <button 
              type="button" 
              onClick={onSaveStages} 
              disabled={saveState === 'saving'}
              style={{
                backgroundColor: saveState === 'error' ? 'rgba(239, 68, 68, 0.18)' : saveState === 'dirty' ? 'rgba(234, 179, 8, 0.15)' : saveState === 'saved' ? 'rgba(34, 197, 94, 0.15)' : '',
                borderColor: saveState === 'error' ? 'rgba(239, 68, 68, 0.5)' : saveState === 'dirty' ? 'rgba(234, 179, 8, 0.4)' : saveState === 'saved' ? 'rgba(34, 197, 94, 0.4)' : '',
                color: saveState === 'error' ? '#fca5a5' : saveState === 'dirty' ? '#fde047' : saveState === 'saved' ? '#86efac' : '',
                fontWeight: 800,
                opacity: saveState === 'saving' ? 0.65 : 1,
                cursor: saveState === 'saving' ? 'progress' : 'pointer',
              }}
            >
              {saveState === 'saving'
                ? '⏳ Guardando...'
                : saveState === 'error'
                  ? '⚠️ Error, reintentar'
                  : saveState === 'dirty'
                    ? '✏️ Sin guardar'
                    : '✓ Guardado'}
            </button>
            <button type="button" onClick={handleRefreshClick}>
              {t('admin.refresh')}
            </button>
            <button
              type="button"
              id="admin-heatmap-toggle"
              className={showHeatmap ? 'saga-heatmap-toggle active' : 'saga-heatmap-toggle'}
              onClick={() => setShowHeatmap(!showHeatmap)}
              title="Ver heatmap de rastros de jugadores en el mapa"
            >
              {showHeatmap ? '🔥 Ocultar Rastros' : '🔥 Ver Rastros'}
            </button>

            <button
              type="button"
              className="saga-version-notes-btn"
              onClick={() => setShowReleaseNotes(true)}
              title="Ver novedades de las versiones 3.4.0 y 3.5.0"
              style={{
                background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.2) 0%, rgba(37, 99, 235, 0.2) 100%)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                color: '#7dd3fc',
                fontWeight: 800,
                fontSize: '11px',
                borderRadius: 10,
                padding: '6px 12px',
                cursor: 'pointer',
              }}
            >
              📜 Novedades
            </button>
            <button
              type="button"
              onClick={() => setFreeShape((value) => !value)}
              title={
                freeShape
                  ? 'Modo libre: arrastra los picos del trazado uno a uno'
                  : 'Modo normal: arrastra la línea y se ajusta a los caminos'
              }
              style={{
                background: freeShape
                  ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.35) 0%, rgba(180, 83, 9, 0.35) 100%)'
                  : 'linear-gradient(135deg, rgba(245, 158, 11, 0.16) 0%, rgba(180, 83, 9, 0.16) 100%)',
                border: '1px solid rgba(251, 191, 36, 0.45)',
                color: '#fcd34d',
                fontWeight: 800,
                fontSize: '11px',
                borderRadius: 10,
                padding: '6px 12px',
                cursor: 'pointer',
              }}
            >
              {freeShape ? '✏️ Modo libre' : '🔗 Modo normal'}
            </button>
            <button
              type="button"
              onClick={() => void handleExportBackup()}
              disabled={exportando}
              title={
                exportError ||
                'Descarga una copia de respaldo con nodos, juegos, historia, jugadores y trazado (+ el GPX aparte)'
              }
              style={{
                background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(21, 128, 61, 0.2) 100%)',
                border: '1px solid rgba(74, 222, 128, 0.35)',
                color: '#86efac',
                fontWeight: 800,
                fontSize: '11px',
                borderRadius: 10,
                padding: '6px 12px',
                cursor: 'pointer',
                marginLeft: 'auto',
              }}
            >
              {exportando ? '⏳ Exportando…' : exportError ? '⚠️ Reintentar copia' : '⬇️ Copia de respaldo'}
            </button>
          </div>

          <div className="saga-family-chips" aria-label="Family counts">
            {familyCards.map((family) => (
              <span key={family.id}>
                {family.icon} {familyCounts[family.id] || 0}
              </span>
            ))}
          </div>
        </div>

        {/* Centered Route Metrics HUD Bar Floating Below Command Bar */}
        <div
          className="saga-centered-route-hud"
          style={{
            position: 'absolute',
            top: 75,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 90,
            background: 'rgba(2, 6, 23, 0.52)',
            backdropFilter: 'blur(28px) saturate(140%)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            boxShadow: '0 18px 48px rgba(0, 0, 0, 0.24)',
            borderRadius: 24,
            padding: '8px 20px',
            color: '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            fontSize: 12,
            fontWeight: 800,
            whiteSpace: 'nowrap',
            pointerEvents: 'auto',
          }}
        >
          <span style={{ color: '#38bdf8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            🟢 RUTA SENDEROS
          </span>
          <span>
            📏 Distancia: <strong style={{ color: '#facc15', fontSize: 13 }}>{displayDistanceKm.toFixed(2)} km</strong>
            <span
              style={{
                marginLeft: 5,
                fontSize: 9,
                fontWeight: 900,
                letterSpacing: '0.04em',
                color: distanceIsMeasured ? '#4ade80' : '#fbbf24',
              }}
              title={
                distanceIsMeasured
                  ? 'Distancia real por camino, calculada por el router peatonal'
                  : 'Sin respuesta del router: distancia en línea recta entre nodos'
              }
            >
              {gpxDistanceKm !== null ? 'GPS' : distanceIsMeasured ? 'CAMIÑO' : 'RECTA'}
            </span>
          </span>
          <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
          <span>⏱️ Tiempo: <strong style={{ color: '#38bdf8', fontSize: 13 }}>{displayDurationMin >= 60 ? `${Math.floor(displayDurationMin / 60)}h ${displayDurationMin % 60}m` : `${displayDurationMin} min`}</strong></span>
          <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
          <span>⛰️ Desnivel: <strong style={{ color: '#4ade80', fontSize: 13 }}>{displayElevationM === null ? '—' : `+${displayElevationM}m`}</strong></span>
          <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
          <span>📍 <strong style={{ color: '#e2e8f0', fontSize: 13 }}>{localStageCount} Nodos</strong></span>
          <button 
            type="button" 
            onClick={() => setPlayCounter(c => c + 1)}
            style={{ marginLeft: 10, background: '#38bdf8', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 16, padding: '4px 12px', color: '#0f172a', fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, boxShadow: '0 4px 12px rgba(56, 189, 248, 0.4)' }}
            title="Reproducir recorrido"
          >
            ▶️ PLAY
          </button>
        </div>

        <div className="saga-map-frame">
          <AdminMissionMap
            stages={stages}
            selectedStage={selectedStage}
            onSelectStage={onSelectStage}
            onCreateStageAt={requestCreateNodeAt}
            onInsertStageAt={onInsertNodeAt}
            onMoveStage={onMoveStage}
            onSetLegVia={onSetLegVia}
            onSetLegTrack={onSetLegTrack}
            freeShape={freeShape}
            showHeatmap={showHeatmap}
            onToggleHeatmap={() => setShowHeatmap(!showHeatmap)}
            onMetricsUpdate={handleRouteMetricsUpdate}
            playRouteTrigger={playCounter}
          />
        </div>

        {pendingPinQueue.length > 0 ? (
          <div className="saga-pin-placement-banner">
            <div className="saga-pin-placement-info">
              <span className="saga-pin-badge">
                📍 Chincheta {activePinIndex + 1} de {pendingPinQueue.length} ({activePinIndex}/{pendingPinQueue.length} confirmadas)
              </span>
              <strong style={{ fontSize: '14px', color: '#f8fafc' }}>
                {pendingPinQueue[activePinIndex]?.label}
              </strong>
              <small style={{ fontSize: '11px', color: '#94a3b8' }}>
                Arrastra la chincheta en el mapa a su posición real
              </small>
            </div>
            <button
              type="button"
              className="saga-pin-confirm-btn"
              onClick={handleConfirmCurrentPin}
            >
              ✅ Confirmar ubicación ({activePinIndex}/{pendingPinQueue.length})
            </button>
          </div>
        ) : null}

        {showReleaseNotes ? (
          <ReleaseNotesModal onClose={() => setShowReleaseNotes(false)} />
        ) : null}
        {pendingCreateLocation ? (
          <>
            <button
              type="button"
              className="saga-map-create-scrim"
              aria-label="Descartar creación de nodo"
              onClick={cancelPendingCreateNode}
            />
            <section
              className="saga-map-create-mini"
              role="dialog"
              aria-modal="true"
              aria-label="Crear nodo aquí"
              style={{ left: pendingCreateLocation.clientX, top: pendingCreateLocation.clientY }}
            >
              <strong>📍 ¿Crear nuevo nodo aquí?</strong>
              <small>
                Coordenadas: {pendingCreateLocation.lat.toFixed(5)}, {pendingCreateLocation.lon.toFixed(5)}
              </small>
              <div>
                <button type="button" onClick={confirmPendingCreateNode} style={{ fontWeight: 800 }}>
                  ➕ Crear Nodo
                </button>
                <button type="button" onClick={cancelPendingCreateNode}>
                  Cancelar
                </button>
              </div>
            </section>
          </>
        ) : null}

        {localNotice ? (
          <div className="saga-toast" role="status">
            {localNotice}
          </div>
        ) : null}
      </section>

      {liveSelectedStage && pendingPinQueue.length === 0 ? (
        <aside className="saga-node-editor-host is-open" aria-label="Editor de nodo">
          {shouldShowTypeChooser ? (
            <div className="saga-node-type-choice-screen">
              <NodePhysicalTypePanel
                stage={liveSelectedStage}
                chooserOnly
                onApplyLocal={(nextStage) => {
                  onApplyStage({
                    ...(nextStage as unknown as Record<string, unknown>),
                    _type_choice_done: true,
                  } as unknown as AdminReactOverviewStage)
                }}
                onFinishChoice={() => setTypeChooserStageKey(null)}
                onDeleteLocal={onDeleteStage}
              />
            </div>
          ) : (
            <NodeDetailDrawer
              stage={liveSelectedStage}
              stages={stages}
              onClose={() => onSelectStage(null)}
              onApplyLocal={onApplyStage}
              onDeleteLocal={onDeleteStage}
              onRequestChangeType={() =>
                setTypeChooserStageKey(selectedStageKey(liveSelectedStage))
              }
            />
          )}
        </aside>
      ) : null}

      {cmsPanel !== 'none' ? (
        <aside className="saga-floating-panel" aria-label="CMS panel">
          <div className="saga-floating-head">
            <strong>
              {cmsPanel === 'players'
                ? t('admin.players')
                : cmsPanel === 'labels'
                  ? t('admin.families')
                  : cmsPanel === 'builder'
                    ? t('admin.builder')
                    : cmsPanel === 'objects'
                      ? 'Objetos y Recetas'
                      : t('admin.settings')}
            </strong>
            <button type="button" onClick={() => onSetCmsPanel('none')}>
              {t('common.close')}
            </button>
          </div>

          <div className="saga-floating-body">
            {cmsPanel === 'builder' ? (
              <MissionBuilderPanel
                stages={stages}
                onCreateNode={() => {
                  onSetCmsPanel('none')
                  onCreateNode()
                }}
                onApplyTemplate={onApplyMissionTemplate}
              />
            ) : null}

            {cmsPanel === 'players' ? (
              <PlayersPanel
                playerDrafts={playerDrafts}
                playerSaveState={playerSaveState}
                playerSaveError={playerSaveError}
                profiles={profiles}
                stages={stages}
                profileProgress={profileProgress}
                profileActionState={profileActionState}
                profileActionError={profileActionError}
                onProfileAction={onProfileAction}
                onUpdatePlayer={onUpdatePlayer}
                onDeletePlayer={onDeletePlayer}
                onAddPlayer={onAddPlayer}
                onSavePlayers={onSavePlayers}
              />
            ) : null}

            {cmsPanel === 'labels' ? <FamiliesPanel /> : null}

            {cmsPanel === 'objects' ? (
              <ObjectsPanel
                stages={stages}
                onSelectStage={onSelectStage}
                onCreateNodesWithItems={handleCreateNodesWithItemsBatch}
              />
            ) : null}

            {cmsPanel === 'mission' ? (
              <SettingsPanel
                missionDraft={missionDraft}
                settingsSaveState={settingsSaveState}
                settingsSaveError={settingsSaveError}
                onUpdateMissionDraft={onUpdateMissionDraft}
                onSaveSettings={onSaveSettings}
              />
            ) : null}
          </div>
        </aside>
      ) : null}

      <nav className="saga-mobile-actions" aria-label="Mobile actions">
        <button type="button" onClick={onSaveStages}>
          {t('common.save')}
        </button>
        <button type="button" onClick={() => togglePanel('builder')}>
          {t('admin.builder')}
        </button>
        <button type="button" onClick={() => togglePanel('players')}>
          {t('admin.players')}
        </button>
        <button type="button" onClick={() => togglePanel('mission')}>
          {t('admin.settings')}
        </button>
      </nav>

      {showUnsavedDialog && (
        <div className="saga-modal-overlay" style={{ zIndex: 99999 }}>
          <div className="saga-modal" style={{ maxWidth: 400, padding: 24, textAlign: 'center' }}>
            <h3 style={{ marginTop: 0, color: '#fde047' }}>⚠️ Cambios sin guardar</h3>
            <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.5, marginBottom: 24 }}>
              Tienes nodos movidos o cambios en la misión que no han sido guardados. Si refrescas la página, se perderán.
            </p>
            <div className="saga-modal-actions" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button 
                type="button" 
                className="saga-action-btn primary"
                onClick={() => {
                  setShowUnsavedDialog(false)
                  onSaveStages()
                }}
              >
                💾 Guardar cambios
              </button>
              <button 
                type="button" 
                className="saga-action-btn danger"
                onClick={() => {
                  setShowUnsavedDialog(false)
                  onRefresh()
                }}
              >
                Marcharte y continuar sin guardar
              </button>
              <button 
                type="button" 
                className="saga-action-btn ghost"
                onClick={() => setShowUnsavedDialog(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function isPhysicalNode(stage: AdminReactOverviewStage | null) {
  if (!stage) return false

  const record = stage as AdminReactOverviewStage & {
    physical_node_kind?: string
    physical_item_kind?: string
    physical_qr?: { kind?: string }
    is_map_collectible?: boolean
    config?: { is_map_collectible?: boolean }
  }

  if (record.is_map_collectible || record.config?.is_map_collectible) {
    return false
  }

  const kind = record.physical_node_kind || record.physical_item_kind || record.physical_qr?.kind

  return kind === 'collectible' || kind === 'requirement' || kind === 'clue' || kind === 'bonus'
}

function cleanAdminCopy(value: string, fallback: string) {
  const normalized = value.trim()
  if (!normalized) return fallback
  if (/^PUT ADMIN (TITLE|SUBTITLE) HERE$/i.test(normalized)) return fallback
  return normalized
}

function formatCoords(lat: unknown, lon: unknown) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return 'No GPS'
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`
}
