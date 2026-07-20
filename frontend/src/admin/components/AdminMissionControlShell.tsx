import { useEffect, useState } from 'react'
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
import { printAllQrs } from '../utils/printQrs'
import '../styles/admin-modern-shell.css'

type CmsPanel = 'none' | 'players' | 'mission' | 'labels' | 'builder' | 'objects'
type SaveState = 'idle' | 'saving' | 'saved' | 'error'

type AdminMissionControlShellProps = {
  title: string
  subtitle: string
  profiles: AdminReactOverviewProfile[]
  stages: AdminReactOverviewStage[]
  familyCounts: Record<string, number>
  selectedStage: AdminReactOverviewStage | null
  cmsPanel: CmsPanel
  localNotice: string | null
  saveState: SaveState
  saveError: string | null
  playerDrafts: PlayerDraft[]
  playerSaveState: SaveState
  playerSaveError: string | null
  profileProgress: Record<string, { level: number | null; finished: boolean }>
  profileActionState: Record<string, string>
  profileActionError: Record<string, string>
  missionDraft: Record<string, string>
  settingsSaveState: SaveState
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
}: AdminMissionControlShellProps) {
  const { t } = useI18n()
  const [typeChooserStageKey, setTypeChooserStageKey] = useState<string | null>(null)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [saveValidationWarning, setSaveValidationWarning] = useState<string | null>(null)
  const [pendingCreateLocation, setPendingCreateLocation] = useState<{
    lat: number
    lon: number
    clientX: number
    clientY: number
  } | null>(null)

  const liveSelectedStage = selectedStage
    ? stages.find((stage) => selectedStageKey(stage) === selectedStageKey(selectedStage)) ||
      stages.find((stage) => stage.index === selectedStage.index) ||
      selectedStage
    : null

  const selectedIndex = liveSelectedStage
    ? stages.findIndex((stage) => stage.index === liveSelectedStage.index)
    : -1

  const selectedKey = selectedStageKey(liveSelectedStage)
  const shouldShowTypeChooser = Boolean(
    liveSelectedStage &&
    (typeChooserStageKey === selectedKey ||
      (typeof liveSelectedStage.id === 'string' &&
        liveSelectedStage.id.startsWith('local-') &&
        !getUiBoolean(liveSelectedStage, '_type_choice_done')))
  )

  useEffect(() => {
    if (!liveSelectedStage) {
      setTypeChooserStageKey(null)
      return
    }

    if (
      typeof liveSelectedStage.id === 'string' &&
      liveSelectedStage.id.startsWith('local-') &&
      !getUiBoolean(liveSelectedStage, '_type_choice_done')
    ) {
      setTypeChooserStageKey(selectedStageKey(liveSelectedStage))
    }
  }, [selectedKey])

  const mappedCount = stages.filter(
    (stage) => typeof stage.lat === 'number' && typeof stage.lon === 'number'
  ).length

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

    if (providedItems.has('llave_rota') && !providedItems.has('cinta_aislante')) {
      return 'Tienes un nodo que entrega "Llave rota", pero falta otro nodo que entregue "Cinta aislante" para que el jugador pueda fabricar la Llave Maestra. ¡Añádelo antes de guardar!'
    }
    if (providedItems.has('cinta_aislante') && !providedItems.has('llave_rota')) {
      return 'Tienes un nodo que entrega "Cinta aislante", pero falta otro nodo que entregue "Llave rota" para que el jugador pueda fabricar la Llave Maestra. ¡Añádelo antes de guardar!'
    }

    const empParts = ['placa_base', 'bateria_litio', 'cables_cobre']
    const empProvided = empParts.filter((p) => providedItems.has(p))
    if (empProvided.length > 0 && empProvided.length < 3) {
      const missing = empParts.filter((p) => !providedItems.has(p))
      return `Para fabricar el Dispositivo EMP faltan nodos que entreguen los siguientes ingredientes: ${missing.join(', ')}. ¡Añádelos antes de guardar!`
    }

    for (const stage of stages) {
      const reqId = (stage as any).required_item_id || ''
      if (reqId) {
        if (reqId === 'llave_maestra') {
          if (!providedItems.has('llave_rota') || !providedItems.has('cinta_aislante')) {
            return `El nodo "${stage.title || 'Nodo'}" requiere "Llave maestra", pero no has colocado los ingredientes (Llave rota y Cinta aislante) en la ruta.`
          }
        } else if (reqId === 'emp_device') {
          if (
            !providedItems.has('placa_base') ||
            !providedItems.has('bateria_litio') ||
            !providedItems.has('cables_cobre')
          ) {
            return `El nodo "${stage.title || 'Nodo'}" requiere "Dispositivo EMP", pero no has colocado todos sus ingredientes en la ruta.`
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
          <span className="saga-brand-mark">S</span>
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
          </div>

          <div className="saga-family-chips" aria-label="Family counts">
            {familyCards.map((family) => (
              <span key={family.id}>
                {family.icon} {familyCounts[family.id] || 0}
              </span>
            ))}
          </div>

          <SaveStatus state={saveState} error={saveError} />
        </div>

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
              <strong>Crear nodo aquí?</strong>
              <small>
                {pendingCreateLocation.lat.toFixed(5)}, {pendingCreateLocation.lon.toFixed(5)}
              </small>
              <div>
                <button type="button" onClick={confirmPendingCreateNode}>
                  Crear
                </button>
                <button type="button" onClick={cancelPendingCreateNode}>
                  Descartar
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

      {liveSelectedStage ? (
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

            {cmsPanel === 'objects' ? <ObjectsPanel /> : null}

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

function SaveStatus({ state, error }: { state: SaveState; error: string | null }) {
  if (state === 'error') {
    return (
      <div className="saga-save-status error">
        <b>Error al guardar</b>
        <span>{error || 'Unknown error'}</span>
      </div>
    )
  }

  if (state === 'saving') {
    return (
      <div className="saga-save-status saving">
        <b>Saving</b>
        <span>Writing mission data…</span>
      </div>
    )
  }

  if (state === 'saved') {
    return (
      <div className="saga-save-status saved">
        <b>Guardado</b>
        <span>Backend reloaded</span>
      </div>
    )
  }

  return (
    <div className="saga-save-status idle">
      <b>Sin guardar</b>
      <span>Local changes only</span>
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
