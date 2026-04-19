import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { fetchPublicConfig } from '../shared/api'
import type { PlayerProfile, PublicConfig } from '../types/player'
import { GAME_CATALOG } from '../player/minigames/gameCatalog'
import { tokens } from '../player/ui/tokens'

type LoadState =
  | { status: 'idle' | 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; config: PublicConfig }

function normalizeProfiles(config: PublicConfig): PlayerProfile[] {
  if (Array.isArray(config.player_profiles) && config.player_profiles.length > 0) {
    return config.player_profiles
  }

  return (config.players || []).map((player) => ({
    id: player,
    display_name: player,
    mode: 'solo',
    members: [player],
    status: 'active',
  }))
}

function isStandaloneMode() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  )
}

export default function LoginApp() {
  const [state, setState] = useState<LoadState>({ status: 'idle' })

  useEffect(() => {
    let cancelled = false

    async function run() {
      try {
        setState({ status: 'loading' })
        const config = await fetchPublicConfig()

        if (!cancelled) {
          setState({ status: 'ready', config })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown config error'

        if (!cancelled) {
          setState({ status: 'error', message })
        }
      }
    }

    run()

    return () => {
      cancelled = true
    }
  }, [])

  const profiles = useMemo(() => {
    if (state.status !== 'ready') return []
    return normalizeProfiles(state.config)
  }, [state])

  const nativeModules = useMemo(
    () => GAME_CATALOG.filter((game) => game.status === 'react_native'),
    []
  )

  const standalone = isStandaloneMode()

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <main style={pageWrap}>
        <style>{loginAnimations}</style>
        <div style={ambientGlow} />
        <section style={heroCard}>
          <div style={labelPill}>MISSION ENTRY</div>
          <h1 style={heroTitle}>Loading mission</h1>
        </section>
      </main>
    )
  }

  if (state.status === 'error') {
    return (
      <main style={pageWrap}>
        <style>{loginAnimations}</style>
        <div style={ambientGlow} />
        <section style={heroCard}>
          <div style={labelPill}>MISSION ENTRY</div>
          <h1 style={heroTitle}>Config error</h1>
          <p style={heroBody}>{state.message}</p>
        </section>
      </main>
    )
  }

  if (state.status !== 'ready') return null

  const config = state.config
  const title = config.site_name || 'SAGA'
  const subtitle = config.story_title || 'Choose operator'
  const body = config.story_text || 'Select a profile to enter the mission.'

  const mobile =
    typeof window !== 'undefined' ? window.innerWidth <= 560 : false

  return (
    <main style={pageWrap}>
      <style>{loginAnimations}</style>
      <div style={ambientGlow} />

      <div
        style={{
          ...contentWrap,
          padding: mobile
            ? 'calc(env(safe-area-inset-top, 0px) + 14px) 14px calc(env(safe-area-inset-bottom, 0px) + 18px)'
            : '24px 18px 28px',
        }}
      >
        <section style={heroCard}>
          <div style={heroTop}>
            <div style={labelPill}>MISSION ENTRY</div>
            <a href="/admin" style={adminLink}>
              Admin
            </a>
          </div>

          <h1 style={heroTitle}>{title}</h1>
          <p style={heroSub}>{subtitle}</p>
          <p style={heroBody}>{body}</p>

          <div style={chipRow}>
            {nativeModules.map((game) => (
              <span key={game.id} style={moduleChip}>
                {game.label}
              </span>
            ))}
          </div>
        </section>

        {!standalone ? (
          <section style={installHint}>
            Add to Home Screen for the cleanest mobile mode.
          </section>
        ) : null}

        <section style={operatorGrid}>
          {profiles.map((profile) => {
            const isTeam = profile.mode === 'team'
            const members = profile.members || [profile.display_name]

            return (
              <article key={profile.id} style={operatorCard}>
                <div style={operatorHead}>
                  <div style={operatorName}>{profile.display_name}</div>
                  <div style={modePill}>{isTeam ? 'TEAM' : 'SOLO'}</div>
                </div>

                <div style={operatorMeta}>
                  {isTeam ? members.join(' · ') : 'Field operator'}
                </div>

                <button
                  type="button"
                  style={enterButton}
                  onClick={() => {
                    window.location.href = `/?user=${encodeURIComponent(profile.id)}`
                  }}
                >
                  Enter
                </button>
              </article>
            )
          })}
        </section>
      </div>
    </main>
  )
}

const pageWrap: CSSProperties = {
  minHeight: '100dvh',
  background:
    'radial-gradient(circle at top, rgba(34,197,94,.08), transparent 32%), linear-gradient(180deg, #eef3ed, #e8efea)',
  color: tokens.colors.ink,
  fontFamily: 'Inter, Segoe UI, system-ui, sans-serif',
  position: 'relative',
  overflowX: 'hidden',
}

const ambientGlow: CSSProperties = {
  position: 'fixed',
  inset: 0,
  pointerEvents: 'none',
  background:
    'linear-gradient(rgba(255,255,255,.04), rgba(255,255,255,0)), radial-gradient(circle at 20% 10%, rgba(255,255,255,.28), transparent 24%)',
  opacity: 0.85,
}

const contentWrap: CSSProperties = {
  position: 'relative',
  zIndex: 2,
  width: 'min(820px, 100%)',
  margin: '0 auto',
  display: 'grid',
  gap: 14,
}

const heroCard: CSSProperties = {
  padding: '18px 18px 16px',
  border: `1px solid ${tokens.colors.border}`,
  borderRadius: tokens.radius.panel,
  background: tokens.colors.surfaceOverlay,
  boxShadow: tokens.shadow.soft,
  backdropFilter: 'blur(12px)',
  animation: 'sagaLoginRise 220ms cubic-bezier(0.22, 1, 0.36, 1)',
}

const heroTop: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 10,
}

const labelPill: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 28,
  padding: '0 10px',
  borderRadius: tokens.radius.pill,
  border: `1px solid ${tokens.colors.brandLine}`,
  background: tokens.colors.brandSoft,
  color: tokens.colors.brand,
  fontSize: 10,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  fontWeight: 900,
}

const adminLink: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 30,
  padding: '0 10px',
  borderRadius: tokens.radius.pill,
  border: `1px solid ${tokens.colors.border}`,
  background: tokens.colors.surfaceSoft,
  color: '#334155',
  fontSize: 11,
  fontWeight: 800,
  textDecoration: 'none',
}

const heroTitle: CSSProperties = {
  marginTop: 14,
  fontSize: 'clamp(28px, 6vw, 44px)',
  lineHeight: 0.96,
  fontWeight: 900,
  letterSpacing: '-0.04em',
  color: tokens.colors.ink,
}

const heroSub: CSSProperties = {
  marginTop: 10,
  color: tokens.colors.brand,
  fontSize: 12,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  fontWeight: 900,
}

const heroBody: CSSProperties = {
  marginTop: 8,
  maxWidth: 560,
  color: tokens.colors.soft,
  fontSize: 14,
  lineHeight: 1.5,
}

const chipRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  marginTop: 14,
}

const moduleChip: CSSProperties = {
  minHeight: 26,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 10px',
  borderRadius: tokens.radius.pill,
  border: `1px solid ${tokens.colors.infoLine}`,
  background: tokens.colors.infoSoft,
  color: tokens.colors.info,
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.12em',
}

const installHint: CSSProperties = {
  padding: '12px 14px',
  borderRadius: 16,
  border: `1px solid ${tokens.colors.infoLine}`,
  background: tokens.colors.infoSoft,
  color: tokens.colors.info,
  fontSize: 12,
  fontWeight: 800,
  lineHeight: 1.4,
}

const operatorGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12,
}

const operatorCard: CSSProperties = {
  border: `1px solid ${tokens.colors.border}`,
  background: tokens.colors.surface,
  borderRadius: 22,
  padding: 14,
  boxShadow: tokens.shadow.soft,
  display: 'grid',
  gap: 12,
  animation: 'sagaLoginRise 240ms cubic-bezier(0.22, 1, 0.36, 1)',
}

const operatorHead: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
}

const operatorName: CSSProperties = {
  fontSize: 18,
  lineHeight: 1.05,
  fontWeight: 900,
  color: tokens.colors.ink,
}

const modePill: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 24,
  padding: '0 8px',
  borderRadius: tokens.radius.pill,
  border: `1px solid ${tokens.colors.border}`,
  background: tokens.colors.surfaceSoft,
  color: '#334155',
  fontSize: 10,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  fontWeight: 900,
}

const operatorMeta: CSSProperties = {
  color: tokens.colors.muted,
  fontSize: 12,
  lineHeight: 1.45,
}

const enterButton: CSSProperties = {
  minHeight: 42,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 14,
  border: `1px solid ${tokens.colors.brandLine}`,
  background: 'linear-gradient(180deg, #16a34a, #15803d)',
  color: '#ffffff',
  fontSize: 11,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  fontWeight: 900,
  boxShadow: '0 10px 24px rgba(22,163,74,.18)',
}

const loginAnimations = `
@keyframes sagaLoginRise {
  from {
    opacity: 0;
    transform: translateY(10px) scale(.992);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
`
