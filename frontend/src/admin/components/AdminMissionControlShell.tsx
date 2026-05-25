import AdminMissionMap from '../AdminMissionMap'
import FamiliesPanel from './FamiliesPanel'
import NodeDetailDrawer from './NodeDetailDrawer'
import PlayersPanel from './PlayersPanel'
import SettingsPanel from './SettingsPanel'
import PhysicalQrCardsPanel from './PhysicalQrCardsPanel'
import type { AdminReactOverviewProfile, AdminReactOverviewStage } from '../lib/adminApi'
import { familyCards } from '../lib/familyConfigs'
import type { PlayerDraft } from '../lib/playerDrafts'
import '../styles/admin-modern-shell.css'

type CmsPanel = 'none' | 'players' | 'mission' | 'labels' | 'cards'
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
  onUpdateMissionDraft: (key: string, value: string) => void
  onSaveSettings: () => void
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
  onUpdateMissionDraft,
  onSaveSettings,
}: AdminMissionControlShellProps) {
  const selectedIndex = selectedStage
    ? stages.findIndex((stage) => stage.index === selectedStage.index)
    : -1

  const mappedCount = stages.filter(
    (stage) => typeof stage.lat === 'number' && typeof stage.lon === 'number'
  ).length

  function togglePanel(panel: CmsPanel) {
    onSetCmsPanel(cmsPanel === panel ? 'none' : panel)
  }

  const displayTitle = cleanAdminCopy(title, 'SAGA Engine')
  const displaySubtitle = cleanAdminCopy(subtitle, 'Mission Control')

  return (
    <main
      className={selectedStage ? 'saga-admin-shell has-inspector' : 'saga-admin-shell'}
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
          <span className="saga-eyebrow">Live mission</span>
          <h1>{displayTitle}</h1>
          <p>{displaySubtitle}</p>

          <div className="saga-mini-stats">
            <span><b>{stages.length}</b> nodes</span>
            <span><b>{profiles.length}</b> profiles</span>
            <span><b>{mappedCount}</b> mapped</span>
          </div>
        </section>

        <nav className="saga-rail-actions" aria-label="Primary admin actions">
          <button type="button" className="saga-primary-action" onClick={onCreateNode}>
            + Add node
          </button>

          <button
            type="button"
            className="saga-save-action"
            data-state={saveState}
            disabled={saveState === 'saving'}
            onClick={onSaveStages}
          >
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save'}
          </button>

          <button type="button" onClick={onRefresh}>Refresh</button>
        </nav>

        <div className="saga-panel-switcher">
          <button
            type="button"
            className={cmsPanel === 'players' ? 'active' : ''}
            onClick={() => togglePanel('players')}
          >
            Players
          </button>
          <button
            type="button"
            className={cmsPanel === 'labels' ? 'active' : ''}
            onClick={() => togglePanel('labels')}
          >
            Families
          </button>
          <button
            type="button"
            className={cmsPanel === 'mission' ? 'active' : ''}
            onClick={() => togglePanel('mission')}
          >
            Settings
          </button>
          <button
            type="button"
            className={cmsPanel === 'cards' ? 'active' : ''}
            onClick={() => togglePanel('cards')}
          >
            QR
          </button>
        </div>

        <section className="saga-route-list" aria-label="Route nodes">
          <div className="saga-section-title">
            <span>Route</span>
            <b>{stages.length}</b>
          </div>

          <div className="saga-node-scroll">
            {stages.map((stage) => (
              <button
                key={`${stage.index}-${stage.id ?? stage.title}`}
                type="button"
                className={selectedStage?.index === stage.index ? 'saga-node-row active' : 'saga-node-row'}
                onClick={() => onSelectStage(stage)}
              >
                <span className="saga-node-index">{stage.index + 1}</span>
                <span className="saga-node-copy">
                  <strong>{stage.title || 'Untitled node'}</strong>
                  <small>{stage.label || stage.type} · {formatCoords(stage.lat, stage.lon)}</small>
                </span>
              </button>
            ))}

            {stages.length === 0 ? (
              <div className="saga-empty-mini">Click the map to create the first node.</div>
            ) : null}
          </div>
        </section>
      </aside>

      <section className="saga-map-workspace" aria-label="Map workspace">
        <div className="saga-command-bar">
          <div className="saga-command-main">
            <button type="button" className="saga-command-primary" onClick={onCreateNode}>
              Add node
            </button>
            <button type="button" onClick={onSaveStages} disabled={saveState === 'saving'}>
              {saveState === 'saving' ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={onRefresh}>Refresh</button>
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
            onCreateStageAt={onCreateNodeAt}
            onMoveStage={onMoveStage}
          />
        </div>

        {localNotice ? (
          <div className="saga-toast" role="status">{localNotice}</div>
        ) : null}
      </section>

      {selectedStage ? (
        <aside className="saga-inspector is-open" aria-label="Node inspector">
          <NodeDetailDrawer
            stage={selectedStage}
            onClose={() => onSelectStage(null)}
            onApplyLocal={onApplyStage}
            onDeleteLocal={onDeleteStage}
            onMoveLocal={onReorderStage}
            canMoveUp={selectedIndex > 0}
            canMoveDown={selectedIndex >= 0 && selectedIndex < stages.length - 1}
          />
        </aside>
      ) : null}

      {cmsPanel !== 'none' ? (
        <aside className="saga-floating-panel" aria-label="CMS panel">
          <div className="saga-floating-head">
            <strong>{cmsPanel === 'players' ? 'Players' : cmsPanel === 'labels' ? 'Families' : cmsPanel === 'cards' ? 'Tarjetas QR' : 'Mission settings'}</strong>
            <button type="button" onClick={() => onSetCmsPanel('none')}>Close</button>
          </div>

          <div className="saga-floating-body">
            {cmsPanel === 'players' ? (
              <PlayersPanel
                playerDrafts={playerDrafts}
                playerSaveState={playerSaveState}
                playerSaveError={playerSaveError}
                onUpdatePlayer={onUpdatePlayer}
                onDeletePlayer={onDeletePlayer}
                onAddPlayer={onAddPlayer}
                onSavePlayers={onSavePlayers}
              />
            ) : null}

            {cmsPanel === 'labels' ? <FamiliesPanel /> : null}

            {cmsPanel === 'cards' ? <PhysicalQrCardsPanel /> : null}

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
        <button type="button" onClick={onCreateNode}>+ Node</button>
        <button type="button" onClick={onSaveStages}>Save</button>
        <button type="button" onClick={() => togglePanel('players')}>Players</button>
        <button type="button" onClick={() => togglePanel('mission')}>Settings</button>
      </nav>
    </main>
  )
}

function SaveStatus({ state, error }: { state: SaveState; error: string | null }) {
  if (state === 'error') {
    return (
      <div className="saga-save-status error">
        <b>Save failed</b>
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
        <b>Saved</b>
        <span>Backend reloaded</span>
      </div>
    )
  }

  return (
    <div className="saga-save-status idle">
      <b>Unsaved</b>
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
