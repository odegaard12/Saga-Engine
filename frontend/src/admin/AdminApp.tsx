import { useEffect, useMemo, useState } from 'react'
import { fetchPublicConfig } from '../shared/api'
import type { PublicConfig } from '../types/player'

type LoadState = 'loading' | 'ready' | 'error'

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
    const players = Array.isArray(config?.players) ? config.players.length : 0
    const profiles = Array.isArray(config?.player_profiles) ? config.player_profiles.length : 0
    const mapCenter = Array.isArray(config?.map_center) ? config.map_center.join(', ') : 'Not configured'
    const mapZoom = config?.map_zoom ?? '—'

    return [
      { label: 'Players', value: String(players), detail: 'Simple player list' },
      { label: 'Profiles', value: String(profiles), detail: 'Team-ready profiles' },
      { label: 'Map center', value: mapCenter, detail: `Zoom ${mapZoom}` },
      { label: 'Theme', value: config?.player_theme || 'default', detail: 'Player visual theme' },
    ]
  }, [config])

  const title = config?.admin_title || config?.site_name || 'SAGA Admin'
  const subtitle = config?.admin_subtitle || 'React Mission Control shell'

  return (
    <main style={page}>
      <section style={hero}>
        <div style={heroTopline}>SAGA ENGINE · ADMIN REACT SHELL</div>
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
          <strong>Could not load config.</strong>
          <span>{error}</span>
        </section>
      ) : null}

      {state === 'ready' ? (
        <>
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

          <section style={section}>
            <div style={sectionHeader}>
              <div>
                <div style={sectionKicker}>Next build area</div>
                <h2 style={sectionTitle}>React admin roadmap</h2>
              </div>
            </div>

            <div style={roadmap}>
              <div style={roadmapItem}>1 · Mission Control read model</div>
              <div style={roadmapItem}>2 · React node list and node editor</div>
              <div style={roadmapItem}>3 · Family schema config editor</div>
              <div style={roadmapItem}>4 · Safe save flow through existing admin APIs</div>
            </div>
          </section>
        </>
      ) : null}
    </main>
  )
}

const page = {
  minHeight: '100vh',
  padding: '24px',
  color: '#e5eefc',
  background:
    'radial-gradient(circle at top left, rgba(56,189,248,0.22), transparent 34%), radial-gradient(circle at top right, rgba(168,85,247,0.18), transparent 30%), #05070d',
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
} satisfies React.CSSProperties

const hero = {
  maxWidth: 1180,
  margin: '0 auto 18px',
  padding: 24,
  border: '1px solid rgba(148,163,184,0.24)',
  borderRadius: 28,
  background: 'linear-gradient(135deg, rgba(15,23,42,0.86), rgba(15,23,42,0.58))',
  boxShadow: '0 22px 70px rgba(0,0,0,0.42)',
  backdropFilter: 'blur(18px)',
} satisfies React.CSSProperties

const heroTopline = {
  fontSize: 12,
  letterSpacing: '0.22em',
  color: '#7dd3fc',
  textTransform: 'uppercase',
  fontWeight: 800,
} satisfies React.CSSProperties

const heroTitle = {
  margin: '10px 0 8px',
  fontSize: 'clamp(34px, 6vw, 68px)',
  lineHeight: 0.95,
  letterSpacing: '-0.06em',
} satisfies React.CSSProperties

const heroSubtitle = {
  margin: 0,
  color: '#b6c3d8',
  fontSize: 17,
  maxWidth: 720,
  lineHeight: 1.55,
} satisfies React.CSSProperties

const actions = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  marginTop: 22,
} satisfies React.CSSProperties

const primaryButton = {
  minHeight: 42,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 16px',
  borderRadius: 999,
  background: 'linear-gradient(135deg, #38bdf8, #818cf8)',
  color: '#020617',
  fontWeight: 900,
  textDecoration: 'none',
} satisfies React.CSSProperties

const secondaryButton = {
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
} satisfies React.CSSProperties

const grid = {
  maxWidth: 1180,
  margin: '0 auto 18px',
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
  gap: 14,
} satisfies React.CSSProperties

const card = {
  padding: 18,
  borderRadius: 22,
  border: '1px solid rgba(148,163,184,0.22)',
  background: 'rgba(15,23,42,0.68)',
  boxShadow: '0 14px 42px rgba(0,0,0,0.25)',
} satisfies React.CSSProperties

const cardLabel = {
  color: '#94a3b8',
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
  fontWeight: 800,
} satisfies React.CSSProperties

const cardValue = {
  marginTop: 8,
  fontSize: 24,
  fontWeight: 950,
  letterSpacing: '-0.04em',
  wordBreak: 'break-word',
} satisfies React.CSSProperties

const cardDetail = {
  marginTop: 4,
  color: '#9fb0c8',
  fontSize: 13,
} satisfies React.CSSProperties

const panel = {
  maxWidth: 1180,
  margin: '0 auto',
  padding: 20,
  borderRadius: 22,
  background: 'rgba(15,23,42,0.72)',
  border: '1px solid rgba(148,163,184,0.22)',
} satisfies React.CSSProperties

const errorPanel = {
  ...panel,
  display: 'grid',
  gap: 8,
  color: '#fecaca',
  border: '1px solid rgba(248,113,113,0.35)',
} satisfies React.CSSProperties

const section = {
  maxWidth: 1180,
  margin: '0 auto 18px',
  padding: 20,
  borderRadius: 26,
  background: 'rgba(15,23,42,0.62)',
  border: '1px solid rgba(148,163,184,0.22)',
} satisfies React.CSSProperties

const sectionHeader = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 14,
  marginBottom: 14,
} satisfies React.CSSProperties

const sectionKicker = {
  color: '#7dd3fc',
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
} satisfies React.CSSProperties

const sectionTitle = {
  margin: '4px 0 0',
  fontSize: 24,
  letterSpacing: '-0.04em',
} satisfies React.CSSProperties

const statusPill = {
  padding: '8px 12px',
  borderRadius: 999,
  background: 'rgba(34,197,94,0.12)',
  color: '#86efac',
  border: '1px solid rgba(34,197,94,0.28)',
  fontSize: 12,
  fontWeight: 900,
} satisfies React.CSSProperties

const familyGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: 12,
} satisfies React.CSSProperties

const familyCard = {
  display: 'flex',
  gap: 14,
  padding: 16,
  borderRadius: 22,
  background: 'rgba(2,6,23,0.34)',
  border: '1px solid rgba(148,163,184,0.16)',
} satisfies React.CSSProperties

const familyIcon = {
  width: 44,
  height: 44,
  borderRadius: 16,
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(255,255,255,0.08)',
  fontSize: 22,
  flex: '0 0 auto',
} satisfies React.CSSProperties

const familyTitle = {
  margin: 0,
  fontSize: 17,
} satisfies React.CSSProperties

const familyDetail = {
  margin: '6px 0 10px',
  color: '#a8b3c7',
  fontSize: 14,
  lineHeight: 1.45,
} satisfies React.CSSProperties

const codePill = {
  display: 'inline-flex',
  padding: '5px 8px',
  borderRadius: 10,
  background: 'rgba(125,211,252,0.1)',
  color: '#bae6fd',
  fontSize: 12,
} satisfies React.CSSProperties

const roadmap = {
  display: 'grid',
  gap: 10,
} satisfies React.CSSProperties

const roadmapItem = {
  padding: 14,
  borderRadius: 16,
  background: 'rgba(2,6,23,0.36)',
  border: '1px solid rgba(148,163,184,0.14)',
  color: '#cbd5e1',
  fontWeight: 750,
} satisfies React.CSSProperties
