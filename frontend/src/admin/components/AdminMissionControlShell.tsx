import { useEffect, useMemo, useState } from 'react'
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
  onMoveStage: (stage: AdminReactOverviewStage, lat: number, lon: number) => void
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
  onMoveStage,
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
  const [showReleaseNotes, setShowReleaseNotes] = useState(false)
  const [saveValidationWarning, setSaveValidationWarning] = useState<string | null>(null)
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

  const [metrics, setMetrics] = useState({ distanceKm: 0, trailKm: 0, elevationM: 0, durationMin: 0 })
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([])

  useEffect(() => {
    function handleRouteMetrics(event: Event) {
      const e = event as CustomEvent
      const { distanceKm, elevationM, durationMin, routeCoords: coords } = e.detail
      
      if (coords && coords.length > 0) {
        setRouteCoords(coords)
      } else {
        const mapped = stages.filter((s) => typeof s.lat === 'number' && typeof s.lon === 'number').sort((a, b) => a.index - b.index)
        const straightCoords: [number, number][] = mapped.map((s) => [s.lat!, s.lon!])
        setRouteCoords(straightCoords)
      }

      // If OSRM returned 0 (fallback), let's calculate straight distance
      if (distanceKm === 0) {
        const mapped = stages.filter((s) => typeof s.lat === 'number' && typeof s.lon === 'number').sort((a, b) => a.index - b.index)
        let straightKm = 0
        for (let i = 0; i < mapped.length - 1; i++) {
          const lat1 = mapped[i].lat!
          const lon1 = mapped[i].lon!
          const lat2 = mapped[i + 1].lat!
          const lon2 = mapped[i + 1].lon!

          const R = 6371.0
          const dlat = ((lat2 - lat1) * Math.PI) / 180
          const dlon = ((lon2 - lon1) * Math.PI) / 180
          const a = Math.sin(dlat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dlon / 2) ** 2
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
          straightKm += R * c
        }
        const trailKm = straightKm * 1.3
        setMetrics({ distanceKm: straightKm, trailKm, elevationM: Math.round(straightKm * 48), durationMin: Math.round(trailKm * 15) })
      } else {
        // Here distanceKm is already the real trail distance
        const trailKm = distanceKm
        const calcDur = durationMin || Math.round(trailKm * 15)
        setMetrics({ distanceKm: distanceKm / 1.3, trailKm, elevationM, durationMin: calcDur })
      }
    }
    
    window.addEventListener('saga-route-metrics', handleRouteMetrics)
    return () => window.removeEventListener('saga-route-metrics', handleRouteMetrics)
  }, [stages])

  function handleExportGpx() {
    if (routeCoords.length === 0) return
    let gpx = '<?xml version="1.0" encoding="UTF-8"?>\n'
    gpx += '<gpx version="1.1" creator="SAGA Engine" xmlns="http://www.topografix.com/GPX/1/1">\n'
    gpx += '  <trk>\n    <name>Ruta SAGA</name>\n    <trkseg>\n'
    routeCoords.forEach(([lat, lon]) => {
      gpx += `      <trkpt lat="${lat}" lon="${lon}"></trkpt>\n`
    })
    gpx += '    </trkseg>\n  </trk>\n</gpx>'

    const blob = new Blob([gpx], { type: 'application/gpx+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ruta_saga.gpx'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
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
    const providedItems = new Set<string>()

    for (const stage of stages) {
      if (stage.physical_item_id) {
        providedItems.add(stage.physical_item_id)
      }
      const config =
        typeof (stage as any).config === 'object' && (stage as any).config
          ? ((stage as any).config as Record<string, unknown>)
          : {}
      if (config.reward_item_id && typeof config.reward_item_id === 'string') {
        providedItems.add(config.reward_item_id)
      }
    }

    const RECIPE_DEPENDENCIES: Record<string, { label: string; inputs: string[] }> = {
      llave_maestra: { label: 'Llave Maestra', inputs: ['llave_rota', 'cinta_aislante'] },
      emp_device: { label: 'Dispositivo EMP', inputs: ['bateria_litio', 'cables_cobre', 'placa_base'] },
      decodificador_cuantico: { label: 'Decodificador Cuántico', inputs: ['chip_encriptado', 'antena_frecuencia', 'bateria_litio'] },
      escaner_biometrico: { label: 'Escáner Biométrico', inputs: ['sensor_optico', 'placa_base', 'cristal_enfoque'] },
      amuleto_guardian: { label: 'Amuleto del Guardián', inputs: ['gemas_antiguas', 'fragmento_escudo', 'hilo_plata'] },
      elixir_alquimia: { label: 'Elixir de Alquimia', inputs: ['hierbas_curativas', 'frasco_cristal', 'agua_purificada'] },
      escudo_runico: { label: 'Escudo Rúnico', inputs: ['placa_hierro', 'runa_proteccion', 'hilo_plata'] },
      orbe_fuego: { label: 'Orbe de Fuego Arcano', inputs: ['esfera_cristal', 'esencia_ignea', 'polvo_estelar'] },
      reliquia_sagrada: { label: 'Reliquia Sagrada', inputs: ['fragmento_reliquia', 'esencia_sagrada', 'pergamino_antiguo'] },
      amuleto_vision: { label: 'Amuleto de Visión Suprema', inputs: ['ojo_mistico', 'gemas_antiguas', 'polvo_estelar'] },
    }

    for (const stage of stages) {
      const reqId = (stage as any).required_item_id || ''
      if (reqId) {
        if (RECIPE_DEPENDENCIES[reqId]) {
          const recipe = RECIPE_DEPENDENCIES[reqId]
          const missing = recipe.inputs.filter((inp) => !providedItems.has(inp))
          if (missing.length > 0) {
            return `El nodo "${stage.title || 'Nodo'}" requiere "${recipe.label}", pero faltan nodos en el mapa que entreguen los ingredientes: ${missing.join(', ')}.`
          }
        } else if (!providedItems.has(reqId)) {
          return `El nodo "${stage.title || 'Nodo'}" requiere el objeto "${reqId}", pero ningún nodo de la misión lo entrega.`
        }
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
              ? t('admin.saving')
              : saveState === 'saved'
                ? t('admin.saved')
                : t('common.save')}
          </button>

          <button type="button" onClick={onRefresh}>
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
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        onReorderStage(stage, 'up')
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      title="Bajar nodo"
                      disabled={routeIndex >= stages.length - 1}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        onReorderStage(stage, 'down')
                      }}
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
            <button type="button" onClick={onSaveStages} disabled={saveState === 'saving'}>
              {saveState === 'saving' ? t('admin.saving') : t('common.save')}
            </button>
            <button type="button" onClick={onRefresh}>
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
              onClick={handleExportGpx}
              disabled={routeCoords.length === 0}
              title="Descargar ruta en formato GPX"
              style={{
                background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(21, 128, 61, 0.2) 100%)',
                border: '1px solid rgba(74, 222, 128, 0.35)',
                color: '#86efac',
                fontWeight: 800,
                fontSize: '11px',
                borderRadius: 10,
                padding: '6px 12px',
                cursor: 'pointer',
                marginLeft: 'auto'
              }}
            >
              ⬇️ Exportar GPX
            </button>
          </div>

          <div className="saga-family-chips" aria-label="Family counts">
            {familyCards.map((family) => (
              <span key={family.id}>
                {family.icon} {familyCounts[family.id] || 0}
              </span>
            ))}
          </div>

          <SaveStatus state={saveState} error={saveError} />        </div>

        <div className="saga-map-frame">
          <AdminMissionMap
            stages={stages}
            selectedStage={selectedStage}
            onSelectStage={onSelectStage}
            onCreateStageAt={requestCreateNodeAt}
            onMoveStage={onMoveStage}
            showHeatmap={showHeatmap}
            onToggleHeatmap={() => setShowHeatmap(!showHeatmap)}
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

function SaveStatus({ state, error }: { state: MissionSaveState; error: string | null }) {
  if (state === 'error') {
    return (
      <div className="saga-save-status error">
        <b>Error al guardar</b>
        <span>{error || 'Error desconocido'}</span>
      </div>
    )
  }

  if (state === 'saving') {
    return (
      <div className="saga-save-status saving">
        <b>Guardando</b>
        <span>Enviando cambios al servidor…</span>
      </div>
    )
  }

  if (state === 'dirty') {
    return (
      <div className="saga-save-status dirty">
        <b>Sin guardar</b>
        <span>Cambios locales pendientes</span>
      </div>
    )
  }

  return (
    <div className="saga-save-status saved">
      <b>Guardado</b>
      <span>Sincronizado con servidor</span>
    </div>
  )
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
