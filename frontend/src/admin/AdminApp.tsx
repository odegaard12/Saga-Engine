import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'

import {
  fetchAdminReactOverview,
  fetchPublicConfig,
  type AdminReactOverviewResponse,
  type AdminReactOverviewStage,
} from '../shared/api'
import type { PublicConfig } from '../types/player'

type LoadState = 'loading' | 'ready' | 'error'
type OverviewState = 'locked' | 'loading' | 'ready' | 'error'

const familyCards = [
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

  const stats = useMemo(() => {
    const counts = overview?.counts
    const cfg = overview?.config || config
    const players = counts?.players ?? (Array.isArray(config?.players) ? config.players.length : 0)
    const profiles = counts?.profiles ?? (Array.isArray(config?.player_profiles) ? config.player_profiles.length : 0)
    const stages = counts?.stages ?? 0
    const mapCenter = Array.isArray(cfg?.map_center) ? cfg.map_center.join(', ') : 'Not configured'
    const mapZoom = cfg?.map_zoom ?? '—'

    return [
      { label: 'Players', value: String(players), detail: 'Simple player list' },
      { label: 'Profiles', value: String(profiles), detail: 'Team-ready profiles' },
      { label: 'Nodes', value: String(stages), detail: 'Runtime stages' },
      { label: 'Map center', value: mapCenter, detail: `Zoom ${mapZoom}` },
      { label: 'Theme', value: cfg?.player_theme || 'default', detail: 'Player visual theme' },
    ]
  }, [config, overview])

  const title = overview?.config?.admin_title || config?.admin_title || config?.site_name || 'SAGA Admin'
  const subtitle = overview?.config?.admin_subtitle || config?.admin_subtitle || 'React Mission Control shell'
  const familyCounts = overview?.counts?.family_counts || {}

  function handleOverviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
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

  return (
    <main style={page}>
      <section style={hero}>
        <div style={heroTopline}>SAGA ENGINE · ADMIN REACT</div>
        <h1 style={heroTitle}>{title}</h1>
        <p style={heroSubtitle}>{subtitle}</p>

        <div style={actions}>
          <a href="/admin" style={primaryButton}>Open current admin</a>
          <a href="/" style={secondaryButton}>Open player entry</a>
          <a href="/api/config" style={secondaryButton}>View public config</a>
        </div>
      </section>

      {state === 'loading' ? (
        <section style={panel}>Loading mission config…</section>
      ) : null}

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
            <div style={sectionKicker}>Read-only admin model</div>
            <h2 style={sectionTitle}>Mission overview</h2>
          </div>
          <span style={statusPill}>{overviewState === 'ready' ? 'Unlocked' : 'Password required'}</span>
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
            {overviewState === 'loading' ? 'Loading…' : 'Load overview'}
          </button>
        </form>

        {overviewState === 'error' ? (
          <div style={errorPanel}>
            <strong>Overview unavailable.</strong>
            <span>{overviewError}</span>
          </div>
        ) : null}

        {overviewState === 'ready' && overview ? (
          <div style={overviewGrid}>
            <article style={overviewPanel}>
              <h3 style={smallTitle}>Family counts</h3>
              <div style={metricList}>
                {familyCards.map((family) => (
                  <div key={family.id} style={metricRow}>
                    <span>{family.icon} {family.title}</span>
                    <strong>{familyCounts[family.id] || 0}</strong>
                  </div>
                ))}
              </div>
            </article>

            <article style={overviewPanel}>
              <h3 style={smallTitle}>Live profiles</h3>
              <div style={metricList}>
                {(overview.profiles || []).slice(0, 8).map((profile) => (
                  <div key={profile.id} style={metricRow}>
                    <span>{profile.display_name}</span>
                    <strong>{profile.finished ? 'Finished' : `Level ${profile.level ?? '—'}`}</strong>
                  </div>
                ))}
                {(overview.profiles || []).length === 0 ? <div style={muted}>No profiles found.</div> : null}
              </div>
            </article>
          </div>
        ) : null}
      </section>

      <section style={section}>
        <div style={sectionHeader}>
          <div>
            <div style={sectionKicker}>Runtime policy</div>
            <h2 style={sectionTitle}>Family-native minigames</h2>
          </div>
          <span style={statusPill}>Active path</span>
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

      {overviewState === 'ready' && overview ? (
        <section style={section}>
          <div style={sectionHeader}>
            <div>
              <div style={sectionKicker}>Nodes</div>
              <h2 style={sectionTitle}>Read-only route model</h2>
            </div>
          </div>

          <div style={nodeList}>
            {(overview.stages || []).map((stage) => (
              <NodeRow key={`${stage.index}-${stage.id ?? stage.title}`} stage={stage} />
            ))}
          </div>
        </section>
      ) : null}

      <section style={section}>
        <div style={sectionHeader}>
          <div>
            <div style={sectionKicker}>Next build area</div>
            <h2 style={sectionTitle}>React admin roadmap</h2>
          </div>
        </div>

        <div style={roadmap}>
          <div style={roadmapItem}>1 · Read-only Mission Control overview</div>
          <div style={roadmapItem}>2 · React node list and node editor</div>
          <div style={roadmapItem}>3 · Family schema config editor</div>
          <div style={roadmapItem}>4 · Safe save flow through existing admin APIs</div>
        </div>
      </section>
    </main>
  )
}

function NodeRow({ stage }: { stage: AdminReactOverviewStage }) {
  return (
    <article style={nodeRow}>
      <div>
        <div style={nodeTitle}>{stage.index + 1}. {stage.title}</div>
        <div style={nodeMeta}>
          {stage.label || stage.type} · {stage.entry_mode || 'gps'} · radius {stage.radius ?? '—'}m
        </div>
      </div>
      <div style={nodeBadges}>
        {stage.has_hint ? <span style={miniBadge}>Hint</span> : null}
        {stage.has_manual_fallback ? <span style={miniBadge}>Fallback</span> : null}
        <span style={miniBadge}>{stage.require_proximity ? 'GPS' : 'Free'}</span>
      </div>
    </article>
  )
}

const page: CSSProperties = {
  minHeight: '100vh',
  padding: '24px',
  color: '#e5eefc',
  background:
    'radial-gradient(circle at top left, rgba(56,189,248,0.22), transparent 34%), radial-gradient(circle at top right, rgba(168,85,247,0.18), transparent 30%), #05070d',
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

const hero: CSSProperties = {
  maxWidth: 1180,
  margin: '0 auto 18px',
  padding: 24,
  border: '1px solid rgba(148,163,184,0.24)',
  borderRadius: 28,
  background: 'linear-gradient(135deg, rgba(15,23,42,0.86), rgba(15,23,42,0.58))',
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

const statusPill: CSSProperties = {
  padding: '8px 10px',
  borderRadius: 999,
  background: 'rgba(34,197,94,0.14)',
  border: '1px solid rgba(34,197,94,0.26)',
  color: '#bbf7d0',
  fontSize: 12,
  fontWeight: 900,
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

const overviewGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 14,
}

const overviewPanel: CSSProperties = {
  padding: 16,
  borderRadius: 20,
  border: '1px solid rgba(148,163,184,0.18)',
  background: 'rgba(2,6,23,0.36)',
}

const smallTitle: CSSProperties = {
  margin: '0 0 12px',
  fontSize: 16,
}

const metricList: CSSProperties = {
  display: 'grid',
  gap: 8,
}

const metricRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  color: '#cbd5e1',
  fontSize: 14,
}

const muted: CSSProperties = {
  color: '#94a3b8',
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

const nodeList: CSSProperties = {
  display: 'grid',
  gap: 10,
}

const nodeRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 14,
  padding: 14,
  borderRadius: 18,
  border: '1px solid rgba(148,163,184,0.16)',
  background: 'rgba(2,6,23,0.32)',
}

const nodeTitle: CSSProperties = {
  fontWeight: 900,
}

const nodeMeta: CSSProperties = {
  marginTop: 4,
  color: '#94a3b8',
  fontSize: 13,
}

const nodeBadges: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
  gap: 6,
}

const miniBadge: CSSProperties = {
  padding: '5px 8px',
  borderRadius: 999,
  background: 'rgba(148,163,184,0.13)',
  color: '#cbd5e1',
  fontSize: 12,
  fontWeight: 800,
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
