import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'

import {
  fetchAdminReactOverview,
  fetchPublicConfig,
  type AdminReactOverviewProfile,
  type AdminReactOverviewResponse,
  type AdminReactOverviewStage,
} from '../shared/api'
import type { PublicConfig } from '../types/player'

type LoadState = 'loading' | 'ready' | 'error'
type OverviewState = 'locked' | 'loading' | 'ready' | 'error'
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
    detail: 'Proximity, GPS lock, signal capture, hot/cold search.',
  },
  {
    id: 'bearing_hunt',
    icon: '🧭',
    title: 'Bearing Hunt',
    detail: 'Compass, orientation, heading lock, sector scan.',
  },
  {
    id: 'circuit_matrix',
    icon: '🧩',
    title: 'Circuit Matrix',
    detail: 'Logic grids, route repair, power balance, sequence boards.',
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
      { label: 'Players', value: String(players), detail: 'Simple player list' },
      { label: 'Profiles', value: String(profileCount), detail: `${finished} finished` },
      { label: 'Nodes', value: String(stageCount), detail: 'Runtime route model' },
      { label: 'Map', value: mapCenter, detail: `Zoom ${mapZoom}` },
      { label: 'Theme', value: cfg?.player_theme || 'default', detail: 'Player visual theme' },
    ]
  }, [config, overview])

  const title = overview?.config?.admin_title || config?.admin_title || config?.site_name || 'SAGA Admin'
  const subtitle = overview?.config?.admin_subtitle || config?.admin_subtitle || 'React Mission Control shell'

  function loadOverview() {
    if (!password.trim()) {
      setOverviewError('Enter the admin password to unlock the read-only Mission Control view.')
      setOverviewState('error')
      return
    }

    setOverviewState('loading')
    setOverviewError(null)

    fetchAdminReactOverview(password)
      .then((payload) => {
        if (payload.status !== 'ok') {
          setOverview(null)
          setOverviewError(payload.message || 'Admin overview unavailable')
          setOverviewState('error')
          return
        }

        setOverview(payload)
        setOverviewState('ready')
      })
      .catch((err) => {
        setOverview(null)
        setOverviewError(err instanceof Error ? err.message : 'Unknown error')
        setOverviewState('error')
      })
  }

  function handleOverviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    loadOverview()
  }

  return (
    <main style={page}>
      <section style={hero}>
        <div style={heroTopline}>SAGA ENGINE · MISSION CONTROL</div>
        <h1 style={heroTitle}>{title}</h1>
        <p style={heroSubtitle}>{subtitle}</p>

        <div style={actions}>
          <a href="/admin" style={primaryButton}>Open current admin</a>
          <a href="/" style={secondaryButton}>Open player entry</a>
          <a href="/api/config" style={secondaryButton}>View public config</a>
        </div>
      </section>

      {state === 'loading' ? <section style={panel}>Loading mission config…</section> : null}

      {state === 'error' ? (
        <section style={errorPanel}>
          <strong>Could not load public config.</strong>
          <span>{error}</span>
        </section>
      ) : null}

      <section style={grid}>
        {stats.map((item) => (
          <article key={item.label} style={card}>
            <div style={cardLabel}>{item.label}</div>
            <div style={cardValue}>{item.value}</div>
            <div style={cardDetail}>{item.detail}</div>
          </article>
        ))}
      </section>

      <section style={section}>
        <div style={sectionHeader}>
          <div>
            <div style={sectionKicker}>Read-only operator view</div>
            <h2 style={sectionTitle}>Mission Control</h2>
          </div>
          <span style={overviewReady ? statusPillOk : statusPillWarn}>
            {overviewReady ? 'Read-only live view' : 'Password required'}
          </span>
        </div>

        <form onSubmit={handleOverviewSubmit} style={unlockForm}>
          <input
            type="password"
            value={password}
            placeholder="Admin password"
            onChange={(event) => setPassword(event.target.value)}
            style={passwordInput}
          />
          <button type="submit" style={primaryButton} disabled={overviewState === 'loading'}>
            {overviewState === 'loading' ? 'Loading…' : overviewReady ? 'Refresh Mission Control' : 'Load Mission Control'}
          </button>
        </form>

        {overviewReady ? (
          <div style={inlineNotice}>Read-only data loaded. Use the current admin for edits and refresh this view after changes.</div>
        ) : null}

        {overviewState === 'error' ? (
          <div style={errorPanel}>
            <strong>Overview unavailable.</strong>
            <span>{overviewError}</span>
          </div>
        ) : null}

        {overviewReady ? (
          <div style={controlGrid}>
            <article style={controlPanel}>
              <div style={panelTitleRow}>
                <h3 style={smallTitle}>Profiles</h3>
                <span style={miniBadge}>{profiles.length}</span>
              </div>

              <div style={profileGrid}>
                {profiles.map((profile) => (
                  <ProfileCard key={profile.id} profile={profile} />
                ))}
                {profiles.length === 0 ? <div style={muted}>No profiles found.</div> : null}
              </div>
            </article>

            <article style={controlPanel}>
              <div style={panelTitleRow}>
                <h3 style={smallTitle}>Family distribution</h3>
                <span style={miniBadge}>Runtime</span>
              </div>

              <div style={familyCountList}>
                {familyCards.map((family) => (
                  <div key={family.id} style={familyCountRow}>
                    <div style={familyCountLeft}>
                      <span style={familyMiniIcon}>{family.icon}</span>
                      <div>
                        <strong>{family.title}</strong>
                        <div style={mutedSmall}>{family.id}</div>
                      </div>
                    </div>
                    <strong style={familyCountNumber}>{familyCounts[family.id] || 0}</strong>
                  </div>
                ))}
              </div>
            </article>
          </div>
        ) : (
          <div style={lockedPanel}>
            <strong>Mission Control is locked.</strong>
            <span>Enter the admin password to load profiles, route nodes, family counts, GPS state and progression.</span>
          </div>
        )}
      </section>

      {overviewReady ? (
        <section style={section}>
          <div style={sectionHeader}>
            <div>
              <div style={sectionKicker}>Route model</div>
              <h2 style={sectionTitle}>Nodes</h2>
            </div>
            <span style={statusPillOk}>{stages.length} nodes</span>
          </div>

          <div style={nodeGrid}>
            {stages.map((stage) => (
              <NodeCard key={`${stage.index}-${stage.id ?? stage.title}`} stage={stage} />
            ))}
            {stages.length === 0 ? <div style={muted}>No nodes found.</div> : null}
          </div>
        </section>
      ) : null}

      <section style={section}>
        <div style={sectionHeader}>
          <div>
            <div style={sectionKicker}>Runtime policy</div>
            <h2 style={sectionTitle}>Family-native minigames</h2>
          </div>
          <span style={statusPillOk}>Active path</span>
        </div>

        <div style={familyGrid}>
          {familyCards.map((family) => (
            <article key={family.id} style={familyCard}>
              <div style={familyIcon}>{family.icon}</div>
              <div>
                <h3 style={familyTitle}>{family.title}</h3>
                <p style={familyDetail}>{family.detail}</p>
                <code style={codePill}>{family.id}</code>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section style={section}>
        <div style={sectionHeader}>
          <div>
            <div style={sectionKicker}>Next build area</div>
            <h2 style={sectionTitle}>React admin roadmap</h2>
          </div>
        </div>

        <div style={roadmap}>
          <div style={roadmapItem}>1 · Mission Control read-only cards</div>
          <div style={roadmapItem}>2 · React node detail drawer</div>
          <div style={roadmapItem}>3 · Family schema config editor</div>
          <div style={roadmapItem}>4 · Safe save flow through existing admin APIs</div>
        </div>
      </section>
    </main>
  )
}

function ProfileCard({ profile }: { profile: AdminReactOverviewProfile }) {
  const finished = Boolean(profile.finished)
  const levelLabel = finished ? 'Finished' : `Level ${profile.level ?? 0}`
  const gps = String(profile.gps_status || 'unknown')
  const lastSeen = formatLastSeen(profile.last_seen)

  return (
    <article style={profileCard}>
      <div style={profileTop}>
        <div>
          <div style={profileName}>{profile.display_name || profile.id}</div>
          <div style={profileMeta}>{profile.mode || 'solo'} · {profile.status || 'active'}</div>
        </div>
        <span style={finished ? badgeOk : badgeNeutral}>{levelLabel}</span>
      </div>

      <div style={profileSignals}>
        <span style={gpsBadgeStyle(gps)}>GPS {gps}</span>
        <span style={badgeNeutral}>{profile.presence || 'unknown'}</span>
      </div>

      <div style={profileFooter}>{lastSeen}</div>
    </article>
  )
}

function NodeCard({ stage }: { stage: AdminReactOverviewStage }) {
  const radius = stage.radius ?? 50
  const family = familyCards.find((item) => item.id === stage.type)
  const coords = formatCoords(stage.lat, stage.lon)

  return (
    <article style={nodeCard}>
      <div style={nodeCardTop}>
        <div style={nodeIndex}>{stage.index + 1}</div>
        <div>
          <div style={nodeTitle}>{stage.title}</div>
          <div style={nodeMeta}>{family?.icon || '◇'} {stage.label || stage.type}</div>
        </div>
      </div>

      <div style={nodeInfoGrid}>
        <div>
          <div style={tinyLabel}>Entry</div>
          <strong>{stage.entry_mode || 'gps'}</strong>
        </div>
        <div>
          <div style={tinyLabel}>Radius</div>
          <strong>{radius}m</strong>
        </div>
        <div>
          <div style={tinyLabel}>Coords</div>
          <strong>{coords}</strong>
        </div>
      </div>

      <div style={nodeBadges}>
        {stage.has_hint ? <span style={miniBadge}>Hint</span> : null}
        {stage.has_manual_fallback ? <span style={miniBadge}>Fallback</span> : null}
        <span style={stage.require_proximity ? badgeOk : badgeNeutral}>
          {stage.require_proximity ? 'GPS gated' : 'Free entry'}
        </span>
      </div>
    </article>
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

function gpsBadgeStyle(gps: string): CSSProperties {
  const normalized = gps.toLowerCase()
  if (normalized === 'ok' || normalized === 'ready') return badgeOk
  if (normalized === 'searching' || normalized === 'stale') return badgeWarn
  return badgeNeutral
}

const page: CSSProperties = {
  minHeight: '100vh',
  padding: '24px',
  color: '#e5eefc',
  background:
    'radial-gradient(circle at top left, rgba(56,189,248,0.20), transparent 34%), radial-gradient(circle at top right, rgba(168,85,247,0.16), transparent 30%), #05070d',
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

const hero: CSSProperties = {
  maxWidth: 1180,
  margin: '0 auto 18px',
  padding: 24,
  border: '1px solid rgba(148,163,184,0.24)',
  borderRadius: 28,
  background: 'linear-gradient(135deg, rgba(15,23,42,0.90), rgba(15,23,42,0.62))',
  boxShadow: '0 22px 70px rgba(0,0,0,0.42)',
  backdropFilter: 'blur(18px)',
}

const heroTopline: CSSProperties = {
  fontSize: 12,
  letterSpacing: '0.22em',
  color: '#7dd3fc',
  textTransform: 'uppercase',
  fontWeight: 800,
}

const heroTitle: CSSProperties = {
  margin: '10px 0 8px',
  fontSize: 'clamp(34px, 6vw, 68px)',
  lineHeight: 0.95,
  letterSpacing: '-0.06em',
}

const heroSubtitle: CSSProperties = {
  margin: 0,
  color: '#b6c3d8',
  fontSize: 17,
  maxWidth: 720,
  lineHeight: 1.55,
}

const actions: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  marginTop: 22,
}

const primaryButton: CSSProperties = {
  minHeight: 42,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 16px',
  border: 0,
  borderRadius: 999,
  background: 'linear-gradient(135deg, #38bdf8, #818cf8)',
  color: '#020617',
  fontWeight: 900,
  textDecoration: 'none',
  cursor: 'pointer',
}

const secondaryButton: CSSProperties = {
  minHeight: 42,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 16px',
  borderRadius: 999,
  border: '1px solid rgba(148,163,184,0.28)',
  color: '#dbeafe',
  background: 'rgba(15,23,42,0.62)',
  textDecoration: 'none',
  fontWeight: 800,
}

const grid: CSSProperties = {
  maxWidth: 1180,
  margin: '0 auto 18px',
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
  gap: 14,
}

const card: CSSProperties = {
  padding: 18,
  borderRadius: 22,
  border: '1px solid rgba(148,163,184,0.22)',
  background: 'rgba(15,23,42,0.68)',
  boxShadow: '0 14px 42px rgba(0,0,0,0.25)',
}

const cardLabel: CSSProperties = {
  color: '#94a3b8',
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
  fontWeight: 800,
}

const cardValue: CSSProperties = {
  marginTop: 8,
  fontSize: 24,
  fontWeight: 950,
  letterSpacing: '-0.04em',
  wordBreak: 'break-word',
}

const cardDetail: CSSProperties = {
  marginTop: 4,
  color: '#94a3b8',
  fontSize: 13,
}

const section: CSSProperties = {
  maxWidth: 1180,
  margin: '0 auto 18px',
  padding: 20,
  borderRadius: 26,
  border: '1px solid rgba(148,163,184,0.22)',
  background: 'rgba(15,23,42,0.62)',
  boxShadow: '0 18px 52px rgba(0,0,0,0.28)',
}

const sectionHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 14,
  marginBottom: 16,
}

const sectionKicker: CSSProperties = {
  fontSize: 11,
  color: '#7dd3fc',
  textTransform: 'uppercase',
  letterSpacing: '0.18em',
  fontWeight: 900,
}

const sectionTitle: CSSProperties = {
  margin: '4px 0 0',
  fontSize: 24,
  letterSpacing: '-0.04em',
}

const statusPillOk: CSSProperties = {
  padding: '8px 10px',
  borderRadius: 999,
  background: 'rgba(34,197,94,0.14)',
  border: '1px solid rgba(34,197,94,0.26)',
  color: '#bbf7d0',
  fontSize: 12,
  fontWeight: 900,
}

const statusPillWarn: CSSProperties = {
  ...statusPillOk,
  background: 'rgba(251,191,36,0.12)',
  border: '1px solid rgba(251,191,36,0.24)',
  color: '#fde68a',
}

const unlockForm: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  marginBottom: 14,
}

const passwordInput: CSSProperties = {
  minHeight: 42,
  flex: '1 1 240px',
  borderRadius: 999,
  border: '1px solid rgba(148,163,184,0.28)',
  background: 'rgba(2,6,23,0.62)',
  color: '#e5eefc',
  padding: '0 14px',
  outline: 'none',
}

const inlineNotice: CSSProperties = {
  marginBottom: 14,
  color: '#94a3b8',
  fontSize: 13,
}

const controlGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.35fr) minmax(260px, 0.65fr)',
  gap: 14,
}

const controlPanel: CSSProperties = {
  padding: 16,
  borderRadius: 20,
  border: '1px solid rgba(148,163,184,0.18)',
  background: 'rgba(2,6,23,0.36)',
}

const panelTitleRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  marginBottom: 12,
}

const profileGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
  gap: 10,
}

const profileCard: CSSProperties = {
  padding: 14,
  borderRadius: 18,
  border: '1px solid rgba(148,163,184,0.16)',
  background: 'rgba(15,23,42,0.58)',
}

const profileTop: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 10,
}

const profileName: CSSProperties = {
  fontWeight: 950,
  letterSpacing: '-0.03em',
}

const profileMeta: CSSProperties = {
  marginTop: 3,
  color: '#94a3b8',
  fontSize: 12,
}

const profileSignals: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  marginTop: 12,
}

const profileFooter: CSSProperties = {
  marginTop: 10,
  color: '#94a3b8',
  fontSize: 12,
}

const familyCountList: CSSProperties = {
  display: 'grid',
  gap: 10,
}

const familyCountRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: 12,
  borderRadius: 16,
  border: '1px solid rgba(148,163,184,0.14)',
  background: 'rgba(15,23,42,0.5)',
}

const familyCountLeft: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
}

const familyMiniIcon: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 12,
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(56,189,248,0.12)',
}

const familyCountNumber: CSSProperties = {
  fontSize: 26,
  letterSpacing: '-0.06em',
}

const nodeGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 12,
}

const nodeCard: CSSProperties = {
  padding: 15,
  borderRadius: 20,
  border: '1px solid rgba(148,163,184,0.16)',
  background: 'rgba(2,6,23,0.34)',
}

const nodeCardTop: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  marginBottom: 14,
}

const nodeIndex: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 14,
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(129,140,248,0.16)',
  border: '1px solid rgba(129,140,248,0.22)',
  fontWeight: 950,
}

const nodeTitle: CSSProperties = {
  fontWeight: 950,
  letterSpacing: '-0.03em',
}

const nodeMeta: CSSProperties = {
  marginTop: 4,
  color: '#94a3b8',
  fontSize: 13,
}

const nodeInfoGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 8,
  marginBottom: 12,
  color: '#cbd5e1',
  fontSize: 13,
}

const tinyLabel: CSSProperties = {
  marginBottom: 4,
  color: '#64748b',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  fontWeight: 900,
}

const nodeBadges: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
}

const badgeOk: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '5px 8px',
  borderRadius: 999,
  background: 'rgba(34,197,94,0.14)',
  border: '1px solid rgba(34,197,94,0.24)',
  color: '#bbf7d0',
  fontSize: 12,
  fontWeight: 850,
}

const badgeWarn: CSSProperties = {
  ...badgeOk,
  background: 'rgba(251,191,36,0.12)',
  border: '1px solid rgba(251,191,36,0.24)',
  color: '#fde68a',
}

const badgeNeutral: CSSProperties = {
  ...badgeOk,
  background: 'rgba(148,163,184,0.13)',
  border: '1px solid rgba(148,163,184,0.18)',
  color: '#cbd5e1',
}

const miniBadge: CSSProperties = {
  ...badgeNeutral,
  fontSize: 12,
}

const lockedPanel: CSSProperties = {
  padding: 16,
  borderRadius: 18,
  display: 'grid',
  gap: 6,
  background: 'rgba(2,6,23,0.34)',
  border: '1px solid rgba(148,163,184,0.18)',
  color: '#cbd5e1',
}

const familyGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: 14,
}

const familyCard: CSSProperties = {
  display: 'flex',
  gap: 14,
  padding: 16,
  borderRadius: 20,
  border: '1px solid rgba(148,163,184,0.2)',
  background: 'rgba(2,6,23,0.32)',
}

const familyIcon: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 16,
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(56,189,248,0.13)',
  fontSize: 22,
}

const familyTitle: CSSProperties = {
  margin: 0,
  fontSize: 17,
}

const familyDetail: CSSProperties = {
  margin: '5px 0 10px',
  color: '#aab8ce',
  fontSize: 13,
  lineHeight: 1.45,
}

const codePill: CSSProperties = {
  display: 'inline-flex',
  padding: '5px 8px',
  borderRadius: 999,
  background: 'rgba(15,23,42,0.8)',
  color: '#bae6fd',
  fontSize: 12,
}

const smallTitle: CSSProperties = {
  margin: 0,
  fontSize: 16,
}

const muted: CSSProperties = {
  color: '#94a3b8',
}

const mutedSmall: CSSProperties = {
  color: '#94a3b8',
  fontSize: 12,
}

const roadmap: CSSProperties = {
  display: 'grid',
  gap: 10,
}

const roadmapItem: CSSProperties = {
  padding: 14,
  borderRadius: 18,
  border: '1px solid rgba(148,163,184,0.16)',
  background: 'rgba(2,6,23,0.32)',
  color: '#cbd5e1',
  fontWeight: 750,
}

const panel: CSSProperties = {
  maxWidth: 1180,
  margin: '0 auto 18px',
  padding: 18,
  borderRadius: 20,
  background: 'rgba(15,23,42,0.7)',
  border: '1px solid rgba(148,163,184,0.22)',
}

const errorPanel: CSSProperties = {
  maxWidth: 1180,
  margin: '0 auto 18px',
  padding: 16,
  borderRadius: 18,
  display: 'grid',
  gap: 6,
  background: 'rgba(127,29,29,0.22)',
  border: '1px solid rgba(248,113,113,0.35)',
  color: '#fecaca',
}
