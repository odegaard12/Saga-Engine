import { FormEvent, useEffect, useMemo, useState } from 'react'

import AdminMissionMap from './AdminMissionMap'
import {
  fetchAdminReactOverview,
  fetchAdminStages,
  fetchPublicConfig,
  saveAdminStages,
  type AdminRawStage,
  type AdminReactOverviewProfile,
  type AdminReactOverviewResponse,
  type AdminReactOverviewStage,
} from '../shared/api'
import type { PublicConfig } from '../types/player'

type LoadState = 'loading' | 'ready' | 'error'
type OverviewState = 'locked' | 'loading' | 'ready' | 'error'
type CmsPanel = 'none' | 'players' | 'mission' | 'labels'
type FamilyId = 'signal_hunt' | 'bearing_hunt' | 'circuit_matrix'

const familyCards: Array<{
  id: FamilyId
  icon: string
  title: string
  detail: string
}> = [
  {
    id: 'signal_hunt',
    icon: '📡',
    title: 'Signal Hunt',
    detail: 'GPS proximity, signal strength and source capture.',
  },
  {
    id: 'bearing_hunt',
    icon: '🧭',
    title: 'Bearing Hunt',
    detail: 'Compass heading, sector lock and orientation capture.',
  },
  {
    id: 'circuit_matrix',
    icon: '🧩',
    title: 'Circuit Matrix',
    detail: 'Logic grids, route repair and lock-style board puzzles.',
  },
]

export default function AdminApp() {
  const [config, setConfig] = useState<PublicConfig | null>(null)
  const [state, setState] = useState<LoadState>('loading')
  const [error, setError] = useState<string | null>(null)

  const [password, setPassword] = useState('')
  const [overview, setOverview] = useState<AdminReactOverviewResponse | null>(null)
  const [overviewState, setOverviewState] = useState<OverviewState>('locked')
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [selectedStage, setSelectedStage] = useState<AdminReactOverviewStage | null>(null)
  const [cmsPanel, setCmsPanel] = useState<CmsPanel>('none')
  const [localNotice, setLocalNotice] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    fetchPublicConfig()
      .then((payload) => {
        if (cancelled) return
        setConfig(payload)
        setState('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Unknown error')
        setState('error')
      })

    return () => {
      cancelled = true
    }
  }, [])

  const profiles = overview?.profiles || []
  const stages = overview?.stages || []
  const familyCounts = overview?.counts?.family_counts || {}
  const overviewReady = overviewState === 'ready' && Boolean(overview)

  const title = overview?.config?.admin_title || config?.admin_title || config?.site_name || 'SAGA Admin'
  const subtitle = overview?.config?.admin_subtitle || config?.admin_subtitle || 'Mission Control'

  const stats = useMemo(() => {
    const counts = overview?.counts
    const cfg = overview?.config || config
    const players = counts?.players ?? (Array.isArray(config?.players) ? config.players.length : 0)
    const profileCount = counts?.profiles ?? (Array.isArray(config?.player_profiles) ? config.player_profiles.length : 0)
    const stageCount = counts?.stages ?? 0
    const finished = counts?.finished_profiles ?? 0
    const mapCenter = Array.isArray(cfg?.map_center) ? cfg.map_center.join(', ') : 'Not configured'
    const mapZoom = cfg?.map_zoom ?? '—'

    return [
      { label: 'Players', value: String(players), detail: 'Configured entries' },
      { label: 'Profiles', value: String(profileCount), detail: `${finished} finished` },
      { label: 'Nodes', value: String(stageCount), detail: 'Route model' },
      { label: 'Map', value: mapCenter, detail: `Zoom ${mapZoom}` },
      { label: 'Theme', value: cfg?.player_theme || 'classic', detail: 'Player shell' },
    ]
  }, [config, overview])

  function loadOverview() {
    if (!password.trim()) {
      setOverviewError('Enter the admin password to unlock Mission Control.')
      setOverviewState('error')
      return
    }

    setOverviewState('loading')
    setOverviewError(null)

    fetchAdminReactOverview(password)
      .then((payload) => {
        if (payload.status !== 'ok') {
          setOverview(null)
          setSelectedStage(null)
          setOverviewError(payload.message || 'Admin overview unavailable')
          setOverviewState('error')
          return
        }

        setOverview(payload)
        setSelectedStage(null)
        setOverviewState('ready')
      })
      .catch((err) => {
        setOverview(null)
        setSelectedStage(null)
        setOverviewError(err instanceof Error ? err.message : 'Unknown error')
        setOverviewState('error')
      })
  }

  function stageSaveIdentity(stage: AdminReactOverviewStage) {
    if (typeof stage.id === 'number') return String(stage.id)
    return String(stage.index)
  }

  function rawStageIdentity(stage: AdminRawStage, fallbackIndex: number) {
    const rawId = stage.id
    if (typeof rawId === 'number' || typeof rawId === 'string') return String(rawId)
    return String(fallbackIndex)
  }

  function mergeStageForSave(
    rawStage: AdminRawStage | null,
    stage: AdminReactOverviewStage
  ): AdminRawStage {
    const messages = stage.messages || {}

    return {
      ...(rawStage || {}),
      id:
        typeof stage.id === 'number'
          ? stage.id
          : rawStage?.id ?? stage.index,
      title: stage.title || 'Untitled node',
      type: stage.type || 'signal_hunt',
      lat: stage.lat ?? null,
      lon: stage.lon ?? null,
      radius: stage.radius ?? 50,
      content: stage.content || '',
      entry_mode: stage.entry_mode || 'gps',
      require_proximity: Boolean(stage.require_proximity),
      hint: messages.hint || '',
      gps_unavailable_message: messages.gps_unavailable || '',
      locked_message: messages.locked || '',
      config:
        typeof rawStage?.config === 'object' && rawStage?.config !== null
          ? rawStage.config
          : {},
      answer: rawStage?.answer ?? '',
      rune: rawStage?.rune ?? '',
    }
  }

  function buildRawStageFromOverview(
    stage: AdminReactOverviewStage,
    index: number
  ): AdminRawStage {
    const messages = stage.messages || {}

    return {
      id: typeof stage.id === 'number' ? stage.id : index,
      title: stage.title || `NODE ${index + 1}`,
      type: stage.type || 'signal_hunt',
      lat: typeof stage.lat === 'number' ? stage.lat : null,
      lon: typeof stage.lon === 'number' ? stage.lon : null,
      radius: typeof stage.radius === 'number' ? stage.radius : 50,
      content: stage.content || '',
      entry_mode: stage.entry_mode || 'gps',
      require_proximity: Boolean(stage.require_proximity),
      hint: messages.hint || '',
      gps_unavailable_message: messages.gps_unavailable || '',
      locked_message: messages.locked || '',
      config: {},
      answer: '',
      rune: '',
    }
  }

  function buildRawStagesFromOverview(overviewStages: AdminReactOverviewStage[]) {
    return overviewStages.map((stage, index) => buildRawStageFromOverview(stage, index))
  }

  function mergeOverviewIntoRawStages(
    rawStages: AdminRawStage[],
    overviewStages: AdminReactOverviewStage[]
  ) {
    return overviewStages.map((stage, index) => {
      const wantedIdentity = stageSaveIdentity(stage)
      const rawStage =
        rawStages.find(
          (candidate, candidateIndex) =>
            rawStageIdentity(candidate, candidateIndex) === wantedIdentity
        ) || null

      return mergeStageForSave(rawStage, {
        ...stage,
        index,
        id: typeof stage.id === 'string' && stage.id.startsWith('local-') ? index : stage.id,
      })
    })
  }




  async function saveLocalStages() {
    if (!password.trim()) {
      setSaveState('error')
      setSaveError('Admin password is missing. Unlock the admin again.')
      return
    }

    if (!overview) {
      setSaveState('error')
      setSaveError('No admin overview is loaded.')
      return
    }

    setSaveState('saving')
    setSaveError(null)

    try {
      let persistedStages: AdminRawStage[] = []
      let usedFallback = false

      const raw = await fetchAdminStages(password)

      if (raw.status === 'ok') {
        persistedStages = mergeOverviewIntoRawStages(raw.stages || [], overview.stages || [])
      } else {
        usedFallback = true
        persistedStages = buildRawStagesFromOverview(overview.stages || [])
      }

      const saved = await saveAdminStages(password, persistedStages)

      if (saved.status !== 'ok') {
        throw new Error(saved.message || 'Could not save admin stages.')
      }

      const refreshed = await fetchAdminReactOverview(password)
      if (refreshed.status === 'ok') {
        setOverview(refreshed)
        setSelectedStage(null)
      }

      setSaveState('saved')
      setLocalNotice(
        usedFallback
          ? 'Saved using fallback payload. Mission data reloaded.'
          : 'Saved to backend. Mission data reloaded.'
      )
    } catch (err) {
      setSaveState('error')
      setSaveError(err instanceof Error ? err.message : 'Unknown save error')
    }
  }


  function deleteLocalStage(stageToDelete: AdminReactOverviewStage) {
    const deleteIdentity = stageSaveIdentity(stageToDelete)

    setOverview((current) => {
      if (!current) return current

      const nextStages = (current.stages || [])
        .filter((stage) => stageSaveIdentity(stage) !== deleteIdentity)
        .map((stage, index) => ({
          ...stage,
          index,
        }))

      const familyCounts = nextStages.reduce<Record<string, number>>((acc, stage) => {
        const family = stage.type || 'signal_hunt'
        acc[family] = (acc[family] || 0) + 1
        return acc
      }, {})

      return {
        ...current,
        stages: nextStages,
        counts: current.counts
          ? {
              ...current.counts,
              stages: nextStages.length,
              family_counts: familyCounts,
            }
          : current.counts,
      }
    })

    setSelectedStage(null)
    setSaveState('idle')
    setLocalNotice('Node removed locally. Save changes to persist deletion.')
  }


  function syncLocalStage(nextStage: AdminReactOverviewStage) {
    setOverview((current) => {
      if (!current) return current

      const currentStages = current.stages || []
      const exists = currentStages.some((stage) => stage.index === nextStage.index)
      const nextStages = exists
        ? currentStages.map((stage) => (stage.index === nextStage.index ? nextStage : stage))
        : [...currentStages, nextStage]

      const familyCounts = nextStages.reduce<Record<string, number>>((acc, stage) => {
        const family = stage.type || 'signal_hunt'
        acc[family] = (acc[family] || 0) + 1
        return acc
      }, {})

      return {
        ...current,
        stages: nextStages,
        counts: current.counts
          ? {
              ...current.counts,
              stages: nextStages.length,
              family_counts: familyCounts,
            }
          : current.counts,
      }
    })

    setSelectedStage(nextStage)
    setLocalNotice('Local preview updated. Save changes to persist.')
  }

  function createLocalNodeAt(lat?: number, lon?: number) {
    const mapCenter =
      overview?.config?.map_center ||
      config?.map_center ||
      ([40.4168, -3.7038] as [number, number])

    const nextIndex = stages.length
    const nextLat = typeof lat === 'number' ? lat : mapCenter[0]
    const nextLon = typeof lon === 'number' ? lon : mapCenter[1]

    const nextStage: AdminReactOverviewStage = {
      id: `local-${Date.now()}`,
      index: nextIndex,
      title: `NEW NODE ${nextIndex + 1}`,
      type: 'signal_hunt',
      label: 'Signal Hunt',
      lat: nextLat,
      lon: nextLon,
      radius: 50,
      entry_mode: 'gps',
      require_proximity: true,
      has_hint: false,
      has_manual_fallback: false,
      content: '',
      objective: '',
      config_summary: [],
      messages: {
        hint: '',
        gps_unavailable: 'GPS unavailable message.',
        locked: 'Move closer to unlock this node.',
      },
    }

    setCmsPanel('none')
    setSaveState('idle')
    syncLocalStage(nextStage)
    setLocalNotice(
      typeof lat === 'number' && typeof lon === 'number'
        ? 'Node created from map click. Edit details, then save changes.'
        : 'Node created at mission center. Drag it on the map or edit coordinates.'
    )
  }

  function moveLocalStage(
    stageToMove: AdminReactOverviewStage,
    lat: number,
    lon: number
  ) {
    const movedStage: AdminReactOverviewStage = {
      ...stageToMove,
      lat,
      lon,
    }

    setSaveState('idle')
    syncLocalStage(movedStage)
    setLocalNotice('Node moved on map. Save changes to persist the new position.')
  }


  function handleOverviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    loadOverview()
  }

  if (!overviewReady) {
    return (
      <main className="admin-root admin-root-login-only">
        <style>{styles}</style>

        <section className="admin-login-minimal" aria-label="Admin login">
          <div className="admin-login-orb admin-login-orb-a" aria-hidden="true" />
          <div className="admin-login-orb admin-login-orb-b" aria-hidden="true" />

          <form onSubmit={handleOverviewSubmit} className="admin-login-card admin-login-card-minimal">
            <div className="admin-brand">SAGA ENGINE · ADMIN</div>

            <div className="admin-login-copy">
              <h1>Mission Control</h1>
              <p>Protected admin access</p>
            </div>

            <div className="admin-login-form">
              <label>Admin password</label>
              <input
                type="password"
                value={password}
                placeholder="Enter admin password"
                autoComplete="current-password"
                autoFocus
                onChange={(event) => setPassword(event.target.value)}
              />
              <button type="submit" disabled={overviewState === 'loading'}>
                {overviewState === 'loading' ? 'Unlocking…' : 'Unlock'}
              </button>
            </div>

            {overviewState === 'error' ? (
              <div className="admin-error">
                <strong>Access denied</strong>
                <span>{overviewError}</span>
              </div>
            ) : null}

            {state === 'error' ? (
              <div className="admin-error">
                <strong>Public config unavailable</strong>
                <span>{error}</span>
              </div>
            ) : null}

            <div className="admin-login-foot">
              <span>No mission data is shown before unlock.</span>
              <div>
                <a href="/">Player entry</a>
              </div>
            </div>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="admin-root">
      <style>{styles}</style>

      <div className="admin-console-layout">
        <aside className="admin-sidebar">
          <div className="admin-brand">SAGA ENGINE · ADMIN CMS</div>
          <div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>

          <div className="admin-sidebar-actions">
            <button type="button" onClick={loadOverview}>Refresh live view</button>
          </div>

        <section className="admin-sidebar-cms">
          <div className="admin-sidebar-section-head">
            <span className="admin-kicker">Mission CMS</span>
            <h3>Mission tools</h3>
          </div>

          <div className="admin-sidebar-cms-actions">
            <button
              type="button"
              className="admin-cms-side-action admin-cms-side-action--primary"
              onClick={() => createLocalNodeAt()}
            >
              Add node
            </button>
            <button
              type="button"
              className="admin-cms-side-action admin-cms-side-action--save"
              onClick={saveLocalStages}
              disabled={saveState === 'saving'}
            >
              {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save changes'}
            </button>
            <button
              type="button"
              className={`admin-cms-side-action${cmsPanel === 'players' ? ' active' : ''}`}
              onClick={() => setCmsPanel(cmsPanel === 'players' ? 'none' : 'players')}
            >
              Players
            </button>
            <button
              type="button"
              className={`admin-cms-side-action${cmsPanel === 'labels' ? ' active' : ''}`}
              onClick={() => setCmsPanel(cmsPanel === 'labels' ? 'none' : 'labels')}
            >
              Families
            </button>
            <button
              type="button"
              className={`admin-cms-side-action${cmsPanel === 'mission' ? ' active' : ''}`}
              onClick={() => setCmsPanel(cmsPanel === 'mission' ? 'none' : 'mission')}
            >
              Settings
            </button>
          </div>

          <div className="admin-sidebar-cms-note">
            Click map to add. Drag nodes to move. Save when ready.
          </div>

          {localNotice ? (
            <div className="admin-local-notice">{localNotice}</div>
          ) : null}

          {saveState === 'error' && saveError ? (
            <div className="admin-save-error">
              <strong>Save failed</strong>
              <span>{saveError}</span>
            </div>
          ) : null}

          {cmsPanel === 'players' ? (
            <div className="admin-cms-local-panel">
              <strong>Players</strong>
              <span>Current mission profiles. Full create/delete/team save flow comes next.</span>

              <div className="admin-local-list">
                {profiles.map((profile) => (
                  <button type="button" key={profile.id} className="admin-local-row">
                    <span>{profile.display_name || profile.id}</span>
                    <small>{profile.mode || 'solo'} · level {profile.level ?? 0}</small>
                  </button>
                ))}
              </div>

              <button type="button" className="admin-cms-side-action">
                Add player locally soon
              </button>
            </div>
          ) : null}

          {cmsPanel === 'mission' ? (
            <div className="admin-cms-local-panel">
              <strong>Settings</strong>
              <span>Basic text/config surface. Persistent save comes next.</span>

              <label>
                Admin title
                <input value={title} readOnly />
              </label>

              <label>
                Admin subtitle
                <input value={subtitle} readOnly />
              </label>

              <label>
                Theme
                <input value={overview?.config?.player_theme || config?.player_theme || 'classic'} readOnly />
              </label>
            </div>
          ) : null}

          {cmsPanel === 'labels' ? (
            <div className="admin-cms-local-panel">
              <strong>Families / labels</strong>
              <span>Available family-native runtime labels.</span>

              <div className="admin-local-list">
                {familyCards.map((family) => (
                  <div key={family.id} className="admin-local-row static">
                    <span>{family.icon} {family.title}</span>
                    <small>{family.id}</small>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="admin-sidebar-cms">
          <div className="admin-sidebar-section-head">
            <span className="admin-kicker">Route</span>
            <h3>Nodes</h3>
          </div>

          <div className="admin-sidebar-node-list">
            {stages.map((stage) => {
              const active = selectedStage?.index === stage.index
              const key = `${stage.index}-${stage.id ?? stage.title}`
              const radiusLabel =
                typeof stage.radius === 'number' && stage.radius > 0 ? `${stage.radius}m` : 'no radius'

              return (
                <button
                  type="button"
                  key={key}
                  className={`admin-sidebar-node-item${active ? ' active' : ''}`}
                  onClick={() => setSelectedStage(stage)}
                >
                  <span>{stage.index + 1}</span>
                  <div>
                    <strong>{stage.title || 'Untitled node'}</strong>
                    <small>{stage.label || stage.type} · {radiusLabel}</small>
                    <small className="admin-sidebar-node-coords">{formatCoords(stage.lat, stage.lon)}</small>
                  </div>
                </button>
              )
            })}

            {stages.length === 0 ? (
              <div className="admin-sidebar-empty">No nodes yet. Click the map to add one.</div>
            ) : null}
          </div>
        </section>


          <div className="admin-sidebar-stats">
            {stats.map((item) => (
              <StatCard key={item.label} item={item} compact />
            ))}
          </div>

          <details className="admin-disclosure" open>
            <summary>
              <SectionHeader title="Profiles" count={profiles.length} />
            </summary>

            <div className="admin-profile-list">
              {profiles.map((profile) => (
                <ProfileCard key={profile.id} profile={profile} />
              ))}
              {profiles.length === 0 ? <div className="admin-muted">No profiles found.</div> : null}
            </div>
          </details>

          <details className="admin-disclosure">
            <summary>
              <SectionHeader title="Families" count={familyCards.length} />
            </summary>

            <div className="admin-family-count-list">
              {familyCards.map((family) => (
                <div key={family.id} className="admin-family-row">
                  <span>{family.icon}</span>
                  <div>
                    <strong>{family.title}</strong>
                    <small>{family.id}</small>
                  </div>
                  <b>{familyCounts[family.id] || 0}</b>
                </div>
              ))}
            </div>
          </details>
        </aside>

        <section className="admin-workspace">
          <div className="admin-workspace-bar">
            <div>
              <span className="admin-kicker">Route workspace</span>
              <h2>Mission map</h2>
            </div>
            <div className="admin-topbar-pills admin-cms-actions">
              <button type="button" className="admin-cms-action primary">Add node</button>
              <button type="button" className="admin-cms-action">Players</button>
              <span className="pill ok">Live read model</span>
              <span className="pill neutral">{stages.length} nodes</span>
            </div>
          </div>

          <div className="admin-map-area">
            <AdminMissionMap
              stages={stages}
              selectedStage={selectedStage}
              onSelectStage={setSelectedStage}
              onCreateStageAt={createLocalNodeAt}
              onMoveStage={moveLocalStage}
            />

            <aside className="admin-node-rail">
              <details className="admin-disclosure admin-disclosure-nodes" open>
                <summary>
                  <div className="admin-node-rail-head">
                    <div>
                      <span className="admin-kicker">Nodes</span>
                      <h3>Route sequence</h3>
                    </div>
                    <span className="pill neutral">{stages.length}</span>
                  </div>
                </summary>

                <div className="admin-node-list">
                  {stages.map((stage) => (
                    <NodeCard
                      key={`${stage.index}-${stage.id ?? stage.title}`}
                      stage={stage}
                      selected={selectedStage?.index === stage.index}
                      onOpen={() => setSelectedStage(stage)}
                    />
                  ))}
                  {stages.length === 0 ? <div className="admin-muted">No nodes found.</div> : null}
                </div>
              </details>
            </aside>
          </div>

          <div className="admin-operator-strip admin-operator-strip-compact">
            <div>
              <strong>CMS mode coming next</strong>
              <span>Select a node to inspect it. Editing, create/delete/reorder and player/team management come through the next save-flow PRs.</span>
            </div>
            <span className="pill warn">Inspect mode</span>
          </div>
        </section>
      </div>

      {selectedStage ? (
        <NodeDetailDrawer
          stage={selectedStage}
          onClose={() => setSelectedStage(null)}
          onApplyLocal={syncLocalStage}
          onDeleteLocal={deleteLocalStage}
        />
      ) : null}
    </main>
  )
}

function StatCard({
  item,
  compact = false,
}: {
  item: { label: string; value: string; detail: string }
  compact?: boolean
}) {
  return (
    <article className={compact ? 'admin-stat compact' : 'admin-stat'}>
      <span>{item.label}</span>
      <strong>{item.value}</strong>
      <small>{item.detail}</small>
    </article>
  )
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="admin-section-head">
      <h2>{title}</h2>
      <span className="pill neutral">{count}</span>
    </div>
  )
}

function ProfileCard({ profile }: { profile: AdminReactOverviewProfile }) {
  const finished = Boolean(profile.finished)
  const gps = String(profile.gps_status || 'unknown')
  const lastSeen = formatLastSeen(profile.last_seen)

  return (
    <article className="admin-profile-card">
      <div>
        <strong>{profile.display_name || profile.id}</strong>
        <small>{profile.mode || 'solo'} · {profile.status || 'active'}</small>
      </div>

      <div className="admin-badge-row">
        <span className={finished ? 'pill ok' : 'pill neutral'}>
          {finished ? 'Finished' : `Level ${profile.level ?? 0}`}
        </span>
        <span className={gpsClass(gps)}>GPS {gps}</span>
        <span className="pill neutral">{profile.presence || 'unknown'}</span>
      </div>

      <small>{lastSeen}</small>
    </article>
  )
}

function NodeCard({
  stage,
  selected,
  onOpen,
}: {
  stage: AdminReactOverviewStage
  selected: boolean
  onOpen: () => void
}) {
  const radius = stage.radius ?? 50
  const family = familyCards.find((item) => item.id === stage.type)
  const coords = formatCoords(stage.lat, stage.lon)

  return (
    <button type="button" className={selected ? 'admin-node-card selected' : 'admin-node-card'} onClick={onOpen}>
      <div className="admin-node-top">
        <span>{stage.index + 1}</span>
        <div>
          <strong>{stage.title || 'Untitled node'}</strong>
          <small>{family?.icon || '◇'} {stage.label || stage.type}</small>
        </div>
      </div>

      <div className="admin-node-meta">
        <span>{stage.entry_mode || 'gps'}</span>
        <span>{radius}m</span>
        <span>{coords}</span>
      </div>
    </button>
  )
}

function NodeDetailDrawer({
  stage,
  onClose,
  onApplyLocal,
  onDeleteLocal,
}: {
  stage: AdminReactOverviewStage
  onClose: () => void
  onApplyLocal: (stage: AdminReactOverviewStage) => void
  onDeleteLocal: (stage: AdminReactOverviewStage) => void
}) {
  const [draft, setDraft] = useState<AdminReactOverviewStage>(stage)

  useEffect(() => {
    setDraft(stage)
  }, [stage])

  const family = familyCards.find((item) => item.id === draft.type)
  const messages = draft.messages || {}
  const configSummary = draft.config_summary || []
  const isLocalNew = typeof draft.id === 'string' && draft.id.startsWith('local-')

  function setDraftField<K extends keyof AdminReactOverviewStage>(
    key: K,
    value: AdminReactOverviewStage[K]
  ) {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function setDraftMessage(
    key: 'hint' | 'gps_unavailable' | 'locked',
    value: string
  ) {
    setDraft((current) => ({
      ...current,
      messages: {
        ...(current.messages || {}),
        [key]: value,
      },
    }))
  }

  function numberOrNull(value: string) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return (
    <div className="admin-drawer-overlay admin-drawer-overlay--nonblocking" role="presentation">
      <aside
        className="admin-drawer admin-drawer-editable"
        role="dialog"
        aria-modal="true"
        aria-label={`Node editor: ${draft.title}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-drawer-head">
          <div>
            <span className="admin-kicker">{isLocalNew ? 'Add node · local preview' : 'Node editor · local preview'}</span>
            <h2>{draft.index + 1}. {draft.title || 'Untitled node'}</h2>
            <small>{family?.icon || '◇'} {draft.label || draft.type}</small>
          </div>

          <button type="button" onClick={onClose}>Close</button>
        </div>

        <div className="admin-drawer-body">
          <section className="admin-edit-section">
            <div className="admin-edit-section-head">
              <strong>Basics</strong>
              <span>Editable locally</span>
            </div>

            <label className="admin-edit-field">
              Title
              <input
                value={draft.title || ''}
                onChange={(event) => setDraftField('title', event.target.value)}
              />
            </label>

            <label className="admin-edit-field">
              Family
              <select
                value={draft.type || 'signal_hunt'}
                onChange={(event) => {
                  const nextType = event.target.value
                  const nextFamily = familyCards.find((item) => item.id === nextType)
                  setDraft((current) => ({
                    ...current,
                    type: nextType,
                    label: nextFamily?.title || nextType,
                  }))
                }}
              >
                {familyCards.map((item) => (
                  <option key={item.id} value={item.id}>{item.title}</option>
                ))}
              </select>
            </label>

            <label className="admin-edit-field">
              Node content
              <textarea
                rows={5}
                value={draft.content || ''}
                onChange={(event) => setDraftField('content', event.target.value)}
              />
            </label>
          </section>

          <section className="admin-edit-section">
            <div className="admin-edit-section-head">
              <strong>Location</strong>
              <span>{formatCoords(draft.lat, draft.lon)}</span>
            </div>

            <div className="admin-edit-grid">
              <label className="admin-edit-field">
                Latitude
                <input
                  inputMode="decimal"
                  value={draft.lat ?? ''}
                  onChange={(event) => setDraftField('lat', numberOrNull(event.target.value))}
                />
              </label>

              <label className="admin-edit-field">
                Longitude
                <input
                  inputMode="decimal"
                  value={draft.lon ?? ''}
                  onChange={(event) => setDraftField('lon', numberOrNull(event.target.value))}
                />
              </label>

              <label className="admin-edit-field">
                Radius meters
                <input
                  inputMode="numeric"
                  value={draft.radius ?? ''}
                  onChange={(event) => setDraftField('radius', numberOrNull(event.target.value))}
                />
              </label>

              <label className="admin-edit-field">
                Entry mode
                <select
                  value={draft.entry_mode || 'gps'}
                  onChange={(event) => setDraftField('entry_mode', event.target.value)}
                >
                  <option value="gps">GPS</option>
                  <option value="free">Free</option>
                </select>
              </label>
            </div>

            <label className="admin-edit-check">
              <input
                type="checkbox"
                checked={Boolean(draft.require_proximity)}
                onChange={(event) => setDraftField('require_proximity', event.target.checked)}
              />
              Require proximity
            </label>
          </section>

          <section className="admin-edit-section">
            <div className="admin-edit-section-head">
              <strong>Messages</strong>
              <span>Player-facing copy</span>
            </div>

            <label className="admin-edit-field">
              Hint
              <textarea
                rows={3}
                value={messages.hint || ''}
                onChange={(event) => setDraftMessage('hint', event.target.value)}
              />
            </label>

            <label className="admin-edit-field">
              GPS unavailable message
              <input
                value={messages.gps_unavailable || ''}
                onChange={(event) => setDraftMessage('gps_unavailable', event.target.value)}
              />
            </label>

            <label className="admin-edit-field">
              Locked / success copy
              <input
                value={messages.locked || ''}
                onChange={(event) => setDraftMessage('locked', event.target.value)}
              />
            </label>
          </section>

          <section className="admin-edit-section">
            <div className="admin-edit-section-head">
              <strong>Runtime config</strong>
              <span>Schema editor next</span>
            </div>

            <div className="admin-chip-wrap">
              {configSummary.length ? (
                configSummary.map((key) => <code key={key}>{key}</code>)
              ) : (
                <small>No config keys exposed yet.</small>
              )}
            </div>
          </section>

          <div className="admin-edit-actions admin-edit-actions-three">
            <button
              type="button"
              className="admin-cms-side-action admin-cms-side-action--primary"
              onClick={() => onApplyLocal(draft)}
            >
              Apply preview
            </button>

            <button
              type="button"
              className="admin-cms-side-action admin-cms-side-action--danger"
              onClick={() => {
                if (window.confirm(`Delete node "${draft.title || 'Untitled node'}"? Save changes afterwards to persist.`)) {
                  onDeleteLocal(draft)
                }
              }}
            >
              Delete node
            </button>

            <button type="button" className="admin-cms-side-action" onClick={onClose}>
              Cancel
            </button>
          </div>

          <div className="admin-local-notice">
            Local preview. Use Save changes in the left rail to persist to backend.
          </div>
        </div>
      </aside>
    </div>
  )
}


function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function formatCoords(lat?: number | null, lon?: number | null) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return '—'
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`
}

function formatLastSeen(value?: number | string | null) {
  if (value === undefined || value === null || value === '') return 'No heartbeat yet'

  let ts: number | null = null

  if (typeof value === 'number') {
    ts = value
  } else {
    const asNumber = Number(value)
    if (Number.isFinite(asNumber)) {
      ts = asNumber
    } else {
      const parsed = Date.parse(value)
      if (Number.isFinite(parsed)) ts = Math.floor(parsed / 1000)
    }
  }

  if (!ts) return 'No heartbeat yet'
  if (ts > 1000000000000) ts = Math.floor(ts / 1000)

  const now = Math.floor(Date.now() / 1000)
  const delta = Math.max(0, now - ts)

  if (delta < 60) return 'Seen just now'
  if (delta < 3600) return `Seen ${Math.floor(delta / 60)} min ago`
  if (delta < 86400) return `Seen ${Math.floor(delta / 3600)} h ago`
  return `Seen ${Math.floor(delta / 86400)} d ago`
}

function gpsClass(gps: string) {
  const normalized = gps.toLowerCase()
  if (normalized === 'ok' || normalized === 'ready') return 'pill ok'
  if (normalized === 'searching' || normalized === 'stale') return 'pill warn'
  return 'pill neutral'
}

const styles = `
* {
  box-sizing: border-box;
}

.admin-root {
  min-height: 100vh;
  padding: 14px;
  color: #e5eefc;
  background:
    radial-gradient(circle at 0% 0%, rgba(56,189,248,0.18), transparent 28%),
    radial-gradient(circle at 100% 0%, rgba(34,197,94,0.12), transparent 30%),
    #020617;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.admin-login-layout,
.admin-console-layout {
  min-height: calc(100vh - 28px);
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  gap: 14px;
}

.admin-login-card,
.admin-sidebar {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  border-radius: 28px;
  border: 1px solid rgba(148,163,184,0.24);
  background: rgba(15,23,42,0.76);
  box-shadow: 0 24px 80px rgba(0,0,0,0.34);
  backdrop-filter: blur(20px);
}

.admin-sidebar {
  overflow: auto;
}

.admin-brand {
  width: fit-content;
  padding: 7px 10px;
  border-radius: 999px;
  background: rgba(56,189,248,0.10);
  border: 1px solid rgba(56,189,248,0.22);
  color: #7dd3fc;
  font-size: 10px;
  font-weight: 950;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.admin-login-card h1,
.admin-sidebar h1 {
  margin: 0;
  font-size: 42px;
  line-height: 0.95;
  letter-spacing: -0.07em;
}

.admin-sidebar h1 {
  font-size: 28px;
}

.admin-login-card p,
.admin-sidebar p {
  margin: 8px 0 0;
  color: #94a3b8;
  line-height: 1.45;
}

.admin-login-form {
  display: grid;
  gap: 9px;
}

.admin-login-form label,
.admin-detail-block > span,
.admin-kicker {
  color: #7dd3fc;
  font-size: 10px;
  font-weight: 950;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.admin-login-form input {
  height: 44px;
  border: 1px solid rgba(148,163,184,0.25);
  border-radius: 16px;
  background: rgba(2,6,23,0.62);
  color: #e5eefc;
  padding: 0 13px;
  outline: none;
}

.admin-login-form button,
.admin-sidebar-actions button,
.admin-drawer-head button {
  min-height: 42px;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(135deg, #38bdf8, #818cf8);
  color: #020617;
  font-weight: 950;
  cursor: pointer;
}

.admin-link-row,
.admin-sidebar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.admin-link-row {
  margin-top: auto;
}

.admin-link-row a,
.admin-sidebar-actions a {
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(148,163,184,0.24);
  color: #dbeafe;
  background: rgba(15,23,42,0.54);
  text-decoration: none;
  font-weight: 850;
  font-size: 12px;
}

.admin-locked-workspace,
.admin-workspace {
  min-width: 0;
  display: grid;
  gap: 14px;
}

.admin-locked-workspace {
  grid-template-rows: auto minmax(360px, 1fr) auto auto;
  padding: 18px;
  border-radius: 30px;
  border: 1px solid rgba(148,163,184,0.22);
  background: rgba(15,23,42,0.48);
  box-shadow: 0 24px 80px rgba(0,0,0,0.26);
  backdrop-filter: blur(18px);
}

.admin-workspace {
  grid-template-rows: auto minmax(0, 1fr) auto;
}

.admin-workspace-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
  border-radius: 24px;
  border: 1px solid rgba(148,163,184,0.18);
  background: rgba(15,23,42,0.62);
  backdrop-filter: blur(18px);
}

.admin-workspace-bar h2 {
  margin: 0;
  font-size: 26px;
  letter-spacing: -0.05em;
}

.admin-locked-map {
  position: relative;
  min-height: 420px;
  border-radius: 30px;
  overflow: hidden;
  border: 1px solid rgba(148,163,184,0.18);
  background:
    linear-gradient(135deg, rgba(15,23,42,0.92), rgba(2,6,23,0.92)),
    radial-gradient(circle at 50% 50%, rgba(56,189,248,0.30), transparent 28%);
}

.admin-grid-bg {
  position: absolute;
  inset: 0;
  opacity: 0.24;
  background-image:
    linear-gradient(rgba(125,211,252,.18) 1px, transparent 1px),
    linear-gradient(90deg, rgba(125,211,252,.18) 1px, transparent 1px);
  background-size: 44px 44px;
}

.admin-locked-message {
  position: absolute;
  left: 50%;
  top: 50%;
  width: min(420px, calc(100% - 40px));
  transform: translate(-50%, -50%);
  display: grid;
  gap: 8px;
  padding: 20px;
  border-radius: 24px;
  border: 1px solid rgba(255,255,255,0.16);
  background: rgba(2,6,23,0.76);
  backdrop-filter: blur(20px);
  text-align: center;
  color: #cbd5e1;
}

.admin-stat-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.admin-sidebar-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.admin-stat {
  padding: 13px;
  border-radius: 18px;
  border: 1px solid rgba(148,163,184,0.16);
  background: rgba(2,6,23,0.42);
}

.admin-stat.compact {
  padding: 11px;
}

.admin-stat span {
  color: #8aa0bd;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.admin-stat strong {
  display: block;
  margin-top: 5px;
  font-size: 20px;
  font-weight: 950;
  letter-spacing: -0.05em;
  word-break: break-word;
}

.admin-stat small {
  display: block;
  margin-top: 3px;
  color: #94a3b8;
  font-size: 11px;
}

.admin-family-compact-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.admin-family-compact,
.admin-family-row,
.admin-profile-card,
.admin-node-card,
.admin-muted,
.admin-detail-item,
.admin-detail-block {
  border: 1px solid rgba(148,163,184,0.16);
  background: rgba(2,6,23,0.35);
  border-radius: 18px;
}

.admin-family-compact {
  display: flex;
  gap: 10px;
  padding: 13px;
  color: #cbd5e1;
}

.admin-family-compact > span,
.admin-family-row > span {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 13px;
  background: rgba(56,189,248,0.12);
  flex: 0 0 auto;
}

.admin-family-compact small,
.admin-family-row small,
.admin-profile-card small,
.admin-node-card small {
  display: block;
  margin-top: 3px;
  color: #94a3b8;
}

.admin-map-area {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 14px;
}

.admin-node-rail {
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 14px;
  border-radius: 28px;
  border: 1px solid rgba(148,163,184,0.18);
  background: rgba(15,23,42,0.60);
  backdrop-filter: blur(18px);
}

.admin-node-rail-head,
.admin-section-head,
.admin-profile-card > div:first-child {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.admin-node-rail-head h3,
.admin-section-head h2 {
  margin: 0;
  font-size: 18px;
  letter-spacing: -0.04em;
}

.admin-node-list,
.admin-profile-list,
.admin-family-count-list {
  display: grid;
  gap: 9px;
}

.admin-node-list {
  overflow: auto;
  padding-right: 2px;
}

.admin-node-card {
  width: 100%;
  color: inherit;
  text-align: left;
  padding: 12px;
  cursor: pointer;
  font: inherit;
}

.admin-node-card.selected {
  border-color: rgba(56,189,248,0.52);
  background: rgba(8,47,73,0.44);
  box-shadow: 0 0 0 1px rgba(56,189,248,0.16) inset;
}

.admin-node-top {
  display: flex;
  align-items: center;
  gap: 10px;
}

.admin-node-top > span {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: rgba(129,140,248,0.18);
  font-weight: 950;
}

.admin-node-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin-top: 10px;
  color: #94a3b8;
  font-size: 11px;
}

.admin-profile-card,
.admin-muted {
  padding: 12px;
}

.admin-badge-row,
.admin-topbar-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.admin-family-row {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  padding: 10px;
}

.pill {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 5px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 900;
}

.pill.ok {
  border: 1px solid rgba(34,197,94,0.26);
  background: rgba(34,197,94,0.14);
  color: #bbf7d0;
}

.pill.warn {
  border: 1px solid rgba(251,191,36,0.26);
  background: rgba(251,191,36,0.12);
  color: #fde68a;
}

.pill.neutral {
  border: 1px solid rgba(148,163,184,0.20);
  background: rgba(148,163,184,0.10);
  color: #cbd5e1;
}

.admin-error {
  display: grid;
  gap: 4px;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid rgba(248,113,113,0.28);
  background: rgba(127,29,29,0.22);
  color: #fecaca;
  font-size: 12px;
}

.admin-operator-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 13px;
  border-radius: 20px;
  border: 1px solid rgba(148,163,184,0.18);
  background: rgba(15,23,42,0.58);
  color: #cbd5e1;
}

.admin-operator-strip span {
  display: block;
  margin-top: 3px;
  color: #94a3b8;
  font-size: 12px;
}

.admin-drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  justify-content: flex-end;
  background: rgba(2,6,23,0.58);
  backdrop-filter: blur(8px);
}

.admin-drawer {
  width: min(560px, 100%);
  height: 100%;
  overflow: auto;
  border-left: 1px solid rgba(148,163,184,0.22);
  background: rgba(15,23,42,0.94);
  box-shadow: -24px 0 80px rgba(0,0,0,0.40);
}

.admin-drawer-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 20px;
  border-bottom: 1px solid rgba(148,163,184,0.18);
  background: rgba(15,23,42,0.92);
  backdrop-filter: blur(18px);
}

.admin-drawer-head h2 {
  margin: 6px 0 0;
  font-size: 26px;
  line-height: 1.05;
  letter-spacing: -0.05em;
}

.admin-drawer-body {
  display: grid;
  gap: 14px;
  padding: 20px;
}

.admin-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.admin-detail-item {
  display: grid;
  gap: 4px;
  padding: 12px;
}

.admin-detail-item span {
  color: #8aa0bd;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.admin-detail-block {
  display: grid;
  gap: 8px;
  padding: 14px;
}

.admin-detail-block p {
  margin: 0;
  color: #dbeafe;
  line-height: 1.55;
}

.admin-chip-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.admin-chip-wrap code {
  padding: 5px 8px;
  border-radius: 999px;
  color: #bae6fd;
  background: rgba(14,165,233,0.12);
  border: 1px solid rgba(14,165,233,0.20);
  font-size: 11px;
}

@media (max-width: 1100px) {
  .admin-login-layout,
  .admin-console-layout {
    grid-template-columns: 1fr;
  }

  .admin-map-area {
    grid-template-columns: 1fr;
  }

  .admin-stat-grid,
  .admin-family-compact-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 700px) {
  .admin-root {
    padding: 8px;
  }

  .admin-stat-grid,
  .admin-family-compact-grid,
  .admin-sidebar-stats,
  .admin-detail-grid {
    grid-template-columns: 1fr;
  }

  .admin-login-card h1 {
    font-size: 34px;
  }
}

/* Minimal protected login pass */
.admin-root-login-only {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 18px;
  background:
    radial-gradient(circle at 22% 18%, rgba(125,211,252,0.22), transparent 30%),
    radial-gradient(circle at 78% 12%, rgba(129,140,248,0.18), transparent 30%),
    radial-gradient(circle at 50% 95%, rgba(34,197,94,0.12), transparent 34%),
    linear-gradient(180deg, #eef6ff 0%, #dbeafe 38%, #b9c9dc 100%);
}

.admin-login-minimal {
  position: relative;
  width: min(430px, 100%);
}

.admin-login-card-minimal {
  position: relative;
  z-index: 2;
  min-height: auto;
  padding: 24px;
  border-radius: 34px;
  border: 1px solid rgba(255,255,255,0.62);
  background:
    linear-gradient(180deg, rgba(255,255,255,0.72), rgba(255,255,255,0.42)),
    rgba(255,255,255,0.36);
  box-shadow:
    0 30px 90px rgba(15,23,42,0.22),
    inset 0 1px 0 rgba(255,255,255,0.74);
  backdrop-filter: blur(28px) saturate(160%);
  -webkit-backdrop-filter: blur(28px) saturate(160%);
  color: #0f172a;
}

.admin-login-card-minimal .admin-brand {
  background: rgba(14,165,233,0.12);
  border-color: rgba(14,165,233,0.18);
  color: #0369a1;
}

.admin-login-copy {
  display: grid;
  gap: 8px;
  margin: 20px 0 18px;
}

.admin-login-card-minimal h1 {
  margin: 0;
  color: #0f172a;
  font-size: 42px;
  line-height: 0.92;
  letter-spacing: -0.08em;
}

.admin-login-card-minimal p {
  margin: 0;
  color: #475569;
  font-size: 14px;
}

.admin-login-card-minimal .admin-login-form label {
  color: #0369a1;
}

.admin-login-card-minimal .admin-login-form input {
  height: 48px;
  border-color: rgba(15,23,42,0.12);
  background: rgba(255,255,255,0.62);
  color: #0f172a;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.70);
}

.admin-login-card-minimal .admin-login-form input::placeholder {
  color: #64748b;
}

.admin-login-card-minimal .admin-login-form input:focus {
  border-color: rgba(14,165,233,0.52);
  box-shadow:
    0 0 0 4px rgba(14,165,233,0.12),
    inset 0 1px 0 rgba(255,255,255,0.70);
}

.admin-login-card-minimal .admin-login-form button {
  height: 48px;
  box-shadow: 0 14px 30px rgba(59,130,246,0.28);
}

.admin-login-card-minimal .admin-error {
  border-color: rgba(239,68,68,0.25);
  background: rgba(254,226,226,0.72);
  color: #7f1d1d;
}

.admin-login-foot {
  display: grid;
  gap: 12px;
  margin-top: 20px;
  color: #64748b;
  font-size: 12px;
}

.admin-login-foot > div {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.admin-login-foot a {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid rgba(15,23,42,0.10);
  background: rgba(255,255,255,0.38);
  color: #334155;
  text-decoration: none;
  font-weight: 850;
}

.admin-login-orb {
  position: absolute;
  z-index: 1;
  border-radius: 999px;
  filter: blur(2px);
  opacity: 0.72;
  pointer-events: none;
}

.admin-login-orb-a {
  width: 180px;
  height: 180px;
  left: -64px;
  top: -62px;
  background: radial-gradient(circle, rgba(56,189,248,0.60), transparent 68%);
}

.admin-login-orb-b {
  width: 220px;
  height: 220px;
  right: -86px;
  bottom: -82px;
  background: radial-gradient(circle, rgba(129,140,248,0.45), transparent 70%);
}

@media (max-width: 700px) {
  .admin-root-login-only {
    padding: 12px;
  }

  .admin-login-card-minimal {
    border-radius: 28px;
    padding: 20px;
  }

  .admin-login-card-minimal h1 {
    font-size: 36px;
  }
}


/* Unlocked workspace glass pass */
.admin-root:not(.admin-root-login-only) {
  height: 100vh;
  overflow: hidden;
  padding: 10px;
  color: #102033;
  background:
    radial-gradient(circle at 12% 8%, rgba(56,189,248,0.22), transparent 30%),
    radial-gradient(circle at 88% 6%, rgba(129,140,248,0.18), transparent 32%),
    radial-gradient(circle at 55% 96%, rgba(34,197,94,0.10), transparent 34%),
    linear-gradient(180deg, #eef6ff 0%, #dbeafe 42%, #c4d5e8 100%);
}

.admin-root:not(.admin-root-login-only) .admin-console-layout {
  height: calc(100vh - 20px);
  min-height: 0;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 10px;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar,
.admin-root:not(.admin-root-login-only) .admin-workspace-bar,
.admin-root:not(.admin-root-login-only) .admin-node-rail,
.admin-root:not(.admin-root-login-only) .admin-operator-strip,
.admin-root:not(.admin-root-login-only) .admin-stat,
.admin-root:not(.admin-root-login-only) .admin-profile-card,
.admin-root:not(.admin-root-login-only) .admin-family-row,
.admin-root:not(.admin-root-login-only) .admin-node-card,
.admin-root:not(.admin-root-login-only) .admin-muted {
  border-color: rgba(255,255,255,0.56);
  background:
    linear-gradient(180deg, rgba(255,255,255,0.62), rgba(255,255,255,0.34)),
    rgba(255,255,255,0.30);
  box-shadow:
    0 18px 42px rgba(15,23,42,0.10),
    inset 0 1px 0 rgba(255,255,255,0.58);
  backdrop-filter: blur(22px) saturate(150%);
  -webkit-backdrop-filter: blur(22px) saturate(150%);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar {
  padding: 14px;
  border-radius: 30px;
  gap: 12px;
  color: #102033;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar h1 {
  font-size: 23px;
  color: #0f172a;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar p,
.admin-root:not(.admin-root-login-only) .admin-stat small,
.admin-root:not(.admin-root-login-only) .admin-profile-card small,
.admin-root:not(.admin-root-login-only) .admin-node-card small,
.admin-root:not(.admin-root-login-only) .admin-family-row small,
.admin-root:not(.admin-root-login-only) .admin-operator-strip span {
  color: #516276;
}

.admin-root:not(.admin-root-login-only) .admin-brand {
  background: rgba(14,165,233,0.12);
  border-color: rgba(14,165,233,0.20);
  color: #0369a1;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-actions button,
.admin-root:not(.admin-root-login-only) .admin-sidebar-actions a,
.admin-root:not(.admin-root-login-only) .admin-drawer-head button {
  min-height: 38px;
  border-radius: 999px;
  border: 1px solid rgba(15,23,42,0.08);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-actions button {
  background: linear-gradient(135deg, #38bdf8, #818cf8);
  color: #07111f;
  box-shadow: 0 12px 28px rgba(59,130,246,0.22);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-actions a {
  color: #334155;
  background: rgba(255,255,255,0.45);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-stats {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.admin-root:not(.admin-root-login-only) .admin-stat {
  padding: 10px;
  border-radius: 18px;
}

.admin-root:not(.admin-root-login-only) .admin-stat strong {
  color: #0f172a;
  font-size: 18px;
}

.admin-root:not(.admin-root-login-only) .admin-stat span,
.admin-root:not(.admin-root-login-only) .admin-kicker,
.admin-root:not(.admin-root-login-only) .admin-detail-block > span {
  color: #0369a1;
}

.admin-root:not(.admin-root-login-only) .admin-workspace {
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 10px;
}

.admin-root:not(.admin-root-login-only) .admin-workspace-bar {
  min-height: 74px;
  padding: 14px 16px;
  border-radius: 28px;
  color: #0f172a;
}

.admin-root:not(.admin-root-login-only) .admin-workspace-bar h2 {
  font-size: 24px;
  color: #0f172a;
}

.admin-root:not(.admin-root-login-only) .admin-map-area {
  min-height: 0;
  height: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 10px;
}

.admin-root:not(.admin-root-login-only) .admin-map-area > section {
  min-height: 0 !important;
  height: 100% !important;
  border-radius: 32px !important;
  border-color: rgba(255,255,255,0.58) !important;
  box-shadow:
    0 26px 80px rgba(15,23,42,0.18),
    inset 0 1px 0 rgba(255,255,255,0.55) !important;
}

.admin-root:not(.admin-root-login-only) .admin-node-rail {
  min-height: 0;
  overflow: hidden;
  padding: 12px;
  border-radius: 28px;
}

.admin-root:not(.admin-root-login-only) .admin-node-list {
  max-height: calc(100vh - 220px);
  overflow: auto;
  padding-right: 2px;
}

.admin-root:not(.admin-root-login-only) .admin-node-card {
  color: #102033;
  border-radius: 18px;
}

.admin-root:not(.admin-root-login-only) .admin-node-card.selected {
  border-color: rgba(14,165,233,0.46);
  background:
    linear-gradient(180deg, rgba(224,242,254,0.80), rgba(255,255,255,0.44)),
    rgba(186,230,253,0.40);
  box-shadow:
    0 16px 36px rgba(14,165,233,0.14),
    inset 0 1px 0 rgba(255,255,255,0.74);
}

.admin-root:not(.admin-root-login-only) .admin-node-top > span {
  background: rgba(14,165,233,0.14);
  color: #0369a1;
}

.admin-root:not(.admin-root-login-only) .pill.ok {
  color: #166534;
  border-color: rgba(22,101,52,0.16);
  background: rgba(187,247,208,0.62);
}

.admin-root:not(.admin-root-login-only) .pill.warn {
  color: #92400e;
  border-color: rgba(146,64,14,0.16);
  background: rgba(254,243,199,0.70);
}

.admin-root:not(.admin-root-login-only) .pill.neutral {
  color: #334155;
  border-color: rgba(15,23,42,0.10);
  background: rgba(255,255,255,0.46);
}

.admin-disclosure {
  display: grid;
  gap: 8px;
}

.admin-disclosure summary {
  list-style: none;
  cursor: pointer;
}

.admin-disclosure summary::-webkit-details-marker {
  display: none;
}

.admin-disclosure summary .admin-section-head,
.admin-disclosure summary .admin-node-rail-head {
  position: relative;
  padding-right: 22px;
}

.admin-disclosure summary .admin-section-head::after,
.admin-disclosure summary .admin-node-rail-head::after {
  content: "⌄";
  position: absolute;
  right: 0;
  top: 2px;
  color: #64748b;
  font-weight: 900;
  transition: transform .18s ease;
}

.admin-disclosure[open] summary .admin-section-head::after,
.admin-disclosure[open] summary .admin-node-rail-head::after {
  transform: rotate(180deg);
}

.admin-root:not(.admin-root-login-only) .admin-family-row,
.admin-root:not(.admin-root-login-only) .admin-profile-card {
  color: #102033;
}

.admin-root:not(.admin-root-login-only) .admin-drawer-overlay {
  background: rgba(148,163,184,0.30);
  backdrop-filter: blur(12px);
}

.admin-root:not(.admin-root-login-only) .admin-drawer {
  background:
    linear-gradient(180deg, rgba(255,255,255,0.82), rgba(255,255,255,0.58)),
    rgba(255,255,255,0.54);
  color: #102033;
  border-left: 1px solid rgba(255,255,255,0.64);
}

.admin-root:not(.admin-root-login-only) .admin-drawer-head {
  background: rgba(255,255,255,0.70);
  border-bottom-color: rgba(15,23,42,0.08);
  color: #0f172a;
}

.admin-root:not(.admin-root-login-only) .admin-detail-item,
.admin-root:not(.admin-root-login-only) .admin-detail-block {
  background: rgba(255,255,255,0.46);
  border-color: rgba(15,23,42,0.08);
  color: #102033;
}

.admin-root:not(.admin-root-login-only) .admin-detail-block p {
  color: #102033;
}

@media (max-width: 1200px) {
  .admin-root:not(.admin-root-login-only) {
    height: auto;
    overflow: auto;
  }

  .admin-root:not(.admin-root-login-only) .admin-console-layout {
    height: auto;
    grid-template-columns: 1fr;
  }

  .admin-root:not(.admin-root-login-only) .admin-map-area {
    grid-template-columns: 1fr;
  }

  .admin-root:not(.admin-root-login-only) .admin-map-area > section {
    min-height: 520px !important;
  }

  .admin-root:not(.admin-root-login-only) .admin-node-list {
    max-height: none;
  }
}

@media (max-width: 760px) {
  .admin-root:not(.admin-root-login-only) {
    padding: 8px;
  }

  .admin-root:not(.admin-root-login-only) .admin-sidebar-stats {
    grid-template-columns: 1fr;
  }

  .admin-root:not(.admin-root-login-only) .admin-workspace-bar {
    align-items: flex-start;
    flex-direction: column;
  }
}


/* Map-first CMS workspace tightening */
.admin-root:not(.admin-root-login-only) .admin-console-layout {
  grid-template-columns: 280px minmax(0, 1fr);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar {
  padding: 12px;
  gap: 10px;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar h1 {
  font-size: 20px;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar p {
  font-size: 12px;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-stats {
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.admin-root:not(.admin-root-login-only) .admin-stat {
  padding: 8px;
  border-radius: 15px;
  box-shadow:
    0 10px 24px rgba(15,23,42,0.07),
    inset 0 1px 0 rgba(255,255,255,0.55);
}

.admin-root:not(.admin-root-login-only) .admin-stat strong {
  font-size: 16px;
}

.admin-root:not(.admin-root-login-only) .admin-stat small {
  font-size: 10px;
}

.admin-root:not(.admin-root-login-only) .admin-workspace {
  gap: 8px;
}

.admin-root:not(.admin-root-login-only) .admin-workspace-bar {
  min-height: 58px;
  padding: 10px 13px;
  border-radius: 23px;
}

.admin-root:not(.admin-root-login-only) .admin-workspace-bar h2 {
  font-size: 22px;
}

.admin-root:not(.admin-root-login-only) .admin-map-area {
  grid-template-columns: minmax(0, 1fr) 245px;
  gap: 8px;
}

.admin-root:not(.admin-root-login-only) .admin-map-area > section {
  border-radius: 26px !important;
}

.admin-root:not(.admin-root-login-only) .admin-node-rail {
  padding: 9px;
  border-radius: 22px;
}

.admin-root:not(.admin-root-login-only) .admin-node-rail-head h3 {
  font-size: 15px;
}

.admin-root:not(.admin-root-login-only) .admin-node-list {
  max-height: calc(100vh - 168px);
  gap: 7px;
}

.admin-root:not(.admin-root-login-only) .admin-node-card {
  padding: 9px;
  border-radius: 15px;
  box-shadow:
    0 10px 24px rgba(15,23,42,0.07),
    inset 0 1px 0 rgba(255,255,255,0.55);
}

.admin-root:not(.admin-root-login-only) .admin-node-top {
  gap: 8px;
}

.admin-root:not(.admin-root-login-only) .admin-node-top > span {
  width: 28px;
  height: 28px;
  border-radius: 10px;
}

.admin-root:not(.admin-root-login-only) .admin-node-meta {
  grid-template-columns: 1fr;
  gap: 3px;
  margin-top: 7px;
  font-size: 10px;
}

.admin-root:not(.admin-root-login-only) .admin-profile-card,
.admin-root:not(.admin-root-login-only) .admin-family-row,
.admin-root:not(.admin-root-login-only) .admin-muted {
  border-radius: 15px;
  padding: 9px;
  box-shadow:
    0 10px 24px rgba(15,23,42,0.06),
    inset 0 1px 0 rgba(255,255,255,0.52);
}

.admin-root:not(.admin-root-login-only) .admin-profile-list,
.admin-root:not(.admin-root-login-only) .admin-family-count-list {
  gap: 7px;
}

.admin-root:not(.admin-root-login-only) .admin-family-row {
  grid-template-columns: 28px minmax(0, 1fr) auto;
}

.admin-root:not(.admin-root-login-only) .admin-family-row > span {
  width: 28px;
  height: 28px;
  border-radius: 10px;
}

.admin-cms-actions {
  align-items: center;
}

.admin-cms-action {
  min-height: 32px;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid rgba(15,23,42,0.10);
  background: rgba(255,255,255,0.52);
  color: #334155;
  font-weight: 900;
  font-size: 11px;
  cursor: pointer;
}

.admin-cms-action.primary {
  background: linear-gradient(135deg, #38bdf8, #818cf8);
  color: #07111f;
  border-color: transparent;
  box-shadow: 0 10px 22px rgba(59,130,246,0.18);
}

.admin-operator-strip-compact {
  min-height: 50px;
  padding: 9px 12px !important;
  border-radius: 18px !important;
}

.admin-root:not(.admin-root-login-only) .admin-operator-strip-compact span {
  font-size: 11px;
}

.admin-root:not(.admin-root-login-only) .admin-drawer {
  width: min(520px, 100%);
}

@media (min-width: 1500px) {
  .admin-root:not(.admin-root-login-only) .admin-console-layout {
    grid-template-columns: 280px minmax(0, 1fr);
  }

  .admin-root:not(.admin-root-login-only) .admin-map-area {
    grid-template-columns: minmax(0, 1fr) 260px;
  }
}

@media (max-width: 1200px) {
  .admin-root:not(.admin-root-login-only) .admin-map-area > section {
    min-height: 620px !important;
  }
}


/* Legacy operator shell pass */
.admin-root:not(.admin-root-login-only) {
  height: 100vh;
  overflow: hidden;
  padding: 10px;
  background:
    radial-gradient(circle at 18% 12%, rgba(16,185,129,0.12), transparent 28%),
    radial-gradient(circle at 84% 10%, rgba(59,130,246,0.10), transparent 30%),
    linear-gradient(180deg, #0b1220 0%, #0f172a 58%, #111827 100%);
}

.admin-root:not(.admin-root-login-only) .admin-console-layout {
  height: calc(100vh - 20px) !important;
  min-height: 0 !important;
  grid-template-columns: 340px minmax(0, 1fr) !important;
  gap: 10px !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar {
  width: auto !important;
  min-width: 0 !important;
  height: 100% !important;
  min-height: 0 !important;
  overflow: auto !important;
  padding: 14px !important;
  gap: 12px !important;
  border-radius: 28px !important;
  border: 1px solid rgba(255,255,255,0.10) !important;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03)),
    rgba(17,24,39,0.74) !important;
  box-shadow:
    0 20px 60px rgba(0,0,0,0.28),
    inset 0 1px 0 rgba(255,255,255,0.08) !important;
  backdrop-filter: blur(22px) saturate(135%);
  -webkit-backdrop-filter: blur(22px) saturate(135%);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar .admin-brand {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: flex-start !important;
  width: auto !important;
  min-height: 40px !important;
  padding: 0 14px !important;
  border-radius: 18px !important;
  font-size: 11px !important;
  letter-spacing: 0.22em !important;
  background: rgba(255,255,255,0.08) !important;
  color: #86efac !important;
  border: 1px solid rgba(255,255,255,0.08) !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar > div:nth-of-type(2) h1 {
  margin: 0 !important;
  font-size: 18px !important;
  line-height: 1.04 !important;
  letter-spacing: -0.05em !important;
  color: #f8fafc !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar > div:nth-of-type(2) p {
  color: rgba(255,255,255,0.46) !important;
  font-size: 12px !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-actions {
  display: grid !important;
  grid-template-columns: 1fr 1fr !important;
  gap: 8px !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-actions button,
.admin-root:not(.admin-root-login-only) .admin-sidebar-actions a {
  min-height: 42px !important;
  height: 42px !important;
  padding: 0 12px !important;
  border-radius: 14px !important;
  font-size: 12px !important;
  font-weight: 900 !important;
  text-decoration: none !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-stats,
.admin-root:not(.admin-root-login-only) .admin-sidebar .admin-disclosure {
  display: none !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-cms {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 22px;
  border: 1px solid rgba(255,255,255,0.08);
  background:
    linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02)),
    rgba(255,255,255,0.03);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.06),
    0 12px 30px rgba(0,0,0,0.18);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-section-head {
  display: grid;
  gap: 4px;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-section-head h3 {
  margin: 0;
  color: #f8fafc;
  font-size: 14px;
  line-height: 1.1;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-cms-actions {
  display: grid;
  gap: 8px;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action {
  min-height: 42px;
  padding: 0 12px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
  color: #e5e7eb;
  font-size: 12px;
  font-weight: 900;
  text-align: left;
  cursor: pointer;
  transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action:hover {
  transform: translateY(-1px);
  background: rgba(255,255,255,0.08);
  border-color: rgba(255,255,255,0.14);
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action--primary {
  background: linear-gradient(135deg, rgba(16,185,129,0.28), rgba(14,165,233,0.22));
  color: #f8fafc;
  border-color: rgba(110,231,183,0.22);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-cms-note {
  color: rgba(255,255,255,0.50);
  font-size: 11px;
  line-height: 1.4;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-list {
  display: grid;
  gap: 8px;
  max-height: 320px;
  overflow: auto;
  padding-right: 2px;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
  color: #e5e7eb;
  text-align: left;
  cursor: pointer;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item:hover,
.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item.active {
  background: rgba(59,130,246,0.16);
  border-color: rgba(96,165,250,0.26);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item > span {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: rgba(255,255,255,0.10);
  color: #93c5fd;
  font-size: 13px;
  font-weight: 900;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item strong {
  display: block;
  color: #f8fafc;
  font-size: 12px;
  line-height: 1.15;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item small {
  display: block;
  margin-top: 4px;
  color: rgba(255,255,255,0.54);
  font-size: 10px;
  line-height: 1.35;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-empty {
  padding: 12px;
  border-radius: 14px;
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.50);
  font-size: 11px;
}

.admin-root:not(.admin-root-login-only) .admin-workspace {
  height: 100% !important;
  min-height: 0 !important;
  grid-template-rows: minmax(0, 1fr) !important;
  gap: 0 !important;
}

.admin-root:not(.admin-root-login-only) .admin-workspace-bar,
.admin-root:not(.admin-root-login-only) .admin-topbar-pills,
.admin-root:not(.admin-root-login-only) .admin-operator-strip,
.admin-root:not(.admin-root-login-only) .admin-operator-strip-compact,
.admin-root:not(.admin-root-login-only) .admin-node-rail {
  display: none !important;
}

.admin-root:not(.admin-root-login-only) .admin-map-area {
  height: 100% !important;
  min-height: 0 !important;
  display: grid !important;
  grid-template-columns: 1fr !important;
  gap: 0 !important;
}

.admin-root:not(.admin-root-login-only) .admin-map-area > section:first-child {
  height: 100% !important;
  min-height: 0 !important;
  border-radius: 28px !important;
  overflow: hidden !important;
  border: 1px solid rgba(255,255,255,0.08) !important;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.03)),
    rgba(255,255,255,0.03) !important;
  box-shadow:
    0 22px 60px rgba(0,0,0,0.24),
    inset 0 1px 0 rgba(255,255,255,0.08) !important;
}

.admin-root:not(.admin-root-login-only) .admin-drawer {
  width: min(480px, calc(100vw - 28px)) !important;
  border-left: 1px solid rgba(255,255,255,0.08) !important;
  background:
    linear-gradient(180deg, rgba(17,24,39,0.92), rgba(17,24,39,0.96)) !important;
  backdrop-filter: blur(24px) saturate(125%);
  -webkit-backdrop-filter: blur(24px) saturate(125%);
}

.admin-root:not(.admin-root-login-only) .admin-drawer-head,
.admin-root:not(.admin-root-login-only) .admin-drawer-body {
  padding: 16px !important;
}

.admin-root:not(.admin-root-login-only) .admin-detail-grid {
  grid-template-columns: 1fr 1fr !important;
  gap: 8px !important;
}

.admin-root:not(.admin-root-login-only) .admin-detail-item,
.admin-root:not(.admin-root-login-only) .admin-detail-block {
  border-radius: 16px !important;
  padding: 12px !important;
  border: 1px solid rgba(255,255,255,0.08) !important;
  background: rgba(255,255,255,0.03) !important;
}

@media (max-width: 1180px) {
  .admin-root:not(.admin-root-login-only) {
    height: auto;
    overflow: auto;
  }

  .admin-root:not(.admin-root-login-only) .admin-console-layout {
    height: auto !important;
    grid-template-columns: 1fr !important;
  }

  .admin-root:not(.admin-root-login-only) .admin-sidebar {
    height: auto !important;
  }

  .admin-root:not(.admin-root-login-only) .admin-map-area > section:first-child {
    min-height: 72vh !important;
  }
}



/* Local CMS actions and editable drawer pass */
.admin-root:not(.admin-root-login-only) .admin-sidebar > div:nth-of-type(2) h1,
.admin-root:not(.admin-root-login-only) .admin-sidebar-section-head h3,
.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item strong {
  text-shadow: 0 1px 0 rgba(0,0,0,0.18);
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action.active {
  background: rgba(59,130,246,0.22);
  border-color: rgba(147,197,253,0.34);
  color: #f8fafc;
}

.admin-local-notice {
  padding: 10px 11px;
  border-radius: 14px;
  border: 1px solid rgba(110,231,183,0.18);
  background: rgba(16,185,129,0.12);
  color: rgba(236,253,245,0.86);
  font-size: 11px;
  line-height: 1.35;
}

.admin-cms-local-panel {
  display: grid;
  gap: 9px;
  padding: 11px;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
}

.admin-cms-local-panel > strong {
  color: #f8fafc;
  font-size: 13px;
}

.admin-cms-local-panel > span,
.admin-cms-local-panel label {
  color: rgba(255,255,255,0.58);
  font-size: 11px;
  line-height: 1.35;
}

.admin-cms-local-panel label {
  display: grid;
  gap: 5px;
}

.admin-cms-local-panel input {
  min-height: 36px;
  padding: 0 10px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(15,23,42,0.54);
  color: #f8fafc;
}

.admin-local-list {
  display: grid;
  gap: 6px;
}

.admin-local-row {
  display: grid;
  gap: 3px;
  min-height: 40px;
  padding: 8px 9px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
  color: #f8fafc;
  text-align: left;
}

.admin-local-row.static {
  cursor: default;
}

.admin-local-row small {
  color: rgba(255,255,255,0.52);
}

.admin-drawer-editable .admin-drawer-body {
  gap: 12px;
}

.admin-edit-section {
  display: grid;
  gap: 10px;
  padding: 13px;
  border-radius: 18px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.035);
}

.admin-edit-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.admin-edit-section-head strong {
  color: #f8fafc;
  font-size: 13px;
}

.admin-edit-section-head span {
  color: rgba(255,255,255,0.48);
  font-size: 11px;
}

.admin-edit-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
}

.admin-edit-field {
  display: grid;
  gap: 6px;
  color: rgba(255,255,255,0.62);
  font-size: 11px;
  font-weight: 850;
}

.admin-edit-field input,
.admin-edit-field select,
.admin-edit-field textarea {
  width: 100%;
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 12px;
  background: rgba(15,23,42,0.56);
  color: #f8fafc;
  padding: 10px;
  font: inherit;
  outline: none;
}

.admin-edit-field input,
.admin-edit-field select {
  min-height: 39px;
}

.admin-edit-field textarea {
  resize: vertical;
  line-height: 1.45;
}

.admin-edit-field input:focus,
.admin-edit-field select:focus,
.admin-edit-field textarea:focus {
  border-color: rgba(96,165,250,0.48);
  box-shadow: 0 0 0 3px rgba(59,130,246,0.16);
}

.admin-edit-check {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(255,255,255,0.72);
  font-size: 12px;
  font-weight: 850;
}

.admin-edit-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
}

@media (max-width: 620px) {
  .admin-edit-grid,
  .admin-edit-actions {
    grid-template-columns: 1fr;
  }
}



/* Persistent save flow pass */
.admin-root:not(.admin-root-login-only) .admin-cms-side-action--save {
  background: rgba(14,165,233,0.16);
  border-color: rgba(125,211,252,0.26);
  color: #e0f2fe;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action--save:disabled {
  opacity: 0.68;
  cursor: wait;
}

.admin-save-error {
  display: grid;
  gap: 4px;
  padding: 10px 11px;
  border-radius: 14px;
  border: 1px solid rgba(248,113,113,0.26);
  background: rgba(127,29,29,0.24);
  color: #fecaca;
  font-size: 11px;
  line-height: 1.35;
}

.admin-save-error strong {
  color: #fee2e2;
}



/* Delete node and CMS clarity pass */
.admin-root:not(.admin-root-login-only) .admin-sidebar {
  scrollbar-width: thin;
  scrollbar-color: rgba(148,163,184,0.45) transparent;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar > div:nth-of-type(2) h1 {
  color: #ffffff !important;
  font-size: 19px !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar > div:nth-of-type(2) p {
  color: rgba(226,232,240,0.76) !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-actions {
  grid-template-columns: 1fr !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-actions button {
  text-align: left;
  justify-content: flex-start;
  background: rgba(14,165,233,0.12) !important;
  border-color: rgba(125,211,252,0.18) !important;
  color: #e0f2fe !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-cms {
  gap: 12px;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-section-head h3 {
  font-size: 15px;
  color: #ffffff;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-cms-note {
  color: rgba(226,232,240,0.76);
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action::after {
  content: "›";
  opacity: .45;
  font-size: 16px;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action--primary::after,
.admin-root:not(.admin-root-login-only) .admin-cms-side-action--save::after,
.admin-root:not(.admin-root-login-only) .admin-cms-side-action--danger::after {
  content: "";
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action--danger {
  background: rgba(127,29,29,0.30);
  border-color: rgba(248,113,113,0.30);
  color: #fecaca;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action--danger:hover {
  background: rgba(153,27,27,0.42);
  border-color: rgba(252,165,165,0.38);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-list {
  max-height: 44vh;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item {
  position: relative;
  transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item:hover {
  transform: translateY(-1px);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item.active {
  box-shadow: inset 0 0 0 1px rgba(147,197,253,0.20), 0 12px 28px rgba(0,0,0,0.18);
}

.admin-sidebar-node-coords {
  color: rgba(186,230,253,0.70) !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}

.admin-edit-actions-three {
  grid-template-columns: 1fr 1fr 1fr;
}

.admin-drawer-editable .admin-drawer-head h2 {
  color: #ffffff;
}

.admin-root:not(.admin-root-login-only) .admin-local-notice {
  color: #d1fae5;
}

@media (max-width: 760px) {
  .admin-edit-actions-three {
    grid-template-columns: 1fr;
  }
}



/* Resilient save and modern CMS polish */
.admin-root:not(.admin-root-login-only) .admin-sidebar h1,
.admin-root:not(.admin-root-login-only) .admin-sidebar-section-head h3,
.admin-root:not(.admin-root-login-only) .admin-cms-local-panel > strong,
.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item strong {
  color: #f8fafc !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar p,
.admin-root:not(.admin-root-login-only) .admin-sidebar small,
.admin-root:not(.admin-root-login-only) .admin-cms-local-panel > span,
.admin-root:not(.admin-root-login-only) .admin-sidebar-cms-note {
  color: rgba(226,232,240,0.78) !important;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action,
.admin-root:not(.admin-root-login-only) .admin-sidebar-actions button,
.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item {
  border-radius: 16px;
  transition: transform 140ms ease, background 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action:hover,
.admin-root:not(.admin-root-login-only) .admin-sidebar-actions button:hover,
.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item:hover {
  transform: translateY(-1px);
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action--save {
  background: linear-gradient(180deg, rgba(14,165,233,0.24), rgba(14,165,233,0.14));
  border-color: rgba(125,211,252,0.32);
  box-shadow: 0 10px 26px rgba(14,165,233,0.18);
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action--danger {
  background: rgba(127,29,29,0.32);
  border-color: rgba(248,113,113,0.30);
  color: #fecaca;
}

.admin-root:not(.admin-root-login-only) .admin-local-notice {
  border: 1px solid rgba(74,222,128,0.22);
  background: rgba(20,83,45,0.24);
  color: #dcfce7;
}

.admin-root:not(.admin-root-login-only) .admin-save-error {
  border-radius: 16px;
}

.admin-root:not(.admin-root-login-only) .admin-edit-field input,
.admin-root:not(.admin-root-login-only) .admin-edit-field select,
.admin-root:not(.admin-root-login-only) .admin-edit-field textarea {
  border-radius: 14px;
  background: rgba(2,6,23,0.66);
  color: #f8fafc;
}

.admin-root:not(.admin-root-login-only) .admin-edit-field input:focus,
.admin-root:not(.admin-root-login-only) .admin-edit-field select:focus,
.admin-root:not(.admin-root-login-only) .admin-edit-field textarea:focus {
  border-color: rgba(125,211,252,0.42);
  box-shadow: 0 0 0 4px rgba(56,189,248,0.10);
}



/* Map node interaction polish */
.admin-root:not(.admin-root-login-only) .admin-sidebar-cms-note {
  border: 1px solid rgba(125,211,252,0.16);
  background: rgba(14,165,233,0.08);
  padding: 10px 11px;
  border-radius: 14px;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-empty {
  color: rgba(226,232,240,0.78);
  border: 1px dashed rgba(125,211,252,0.20);
  background: rgba(14,165,233,0.07);
}

.admin-root:not(.admin-root-login-only) .admin-node-map-hint {
  color: rgba(226,232,240,0.76);
}



/* Non-blocking map editor drawer */
.admin-root:not(.admin-root-login-only) .admin-drawer-overlay--nonblocking {
  pointer-events: none !important;
  background: transparent !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.admin-root:not(.admin-root-login-only) .admin-drawer-overlay--nonblocking .admin-drawer {
  pointer-events: auto !important;
}

.admin-root:not(.admin-root-login-only) .admin-drawer-overlay--nonblocking::before,
.admin-root:not(.admin-root-login-only) .admin-drawer-overlay--nonblocking::after {
  pointer-events: none !important;
  display: none !important;
}

.admin-root:not(.admin-root-login-only) .admin-drawer {
  box-shadow:
    -22px 0 60px rgba(2,6,23,0.38),
    inset 1px 0 0 rgba(255,255,255,0.08);
}

.admin-root:not(.admin-root-login-only) .admin-drawer-head {
  cursor: default;
}

.admin-root:not(.admin-root-login-only) .admin-map-dragging-node {
  cursor: grabbing !important;
}


`
