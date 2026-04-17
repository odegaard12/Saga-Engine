import { useEffect, useMemo, useState } from 'react'
import { fetchPublicConfig } from '../shared/api'
import type { PlayerProfile, PublicConfig } from '../types/player'

type LoadState =
  | { status: 'idle' | 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; config: PublicConfig }

function normalizeProfiles(config: PublicConfig): PlayerProfile[] {
  if (Array.isArray(config.player_profiles) && config.player_profiles.length > 0) {
    return config.player_profiles
  }

  return (config.players || []).map((player, index) => ({
    id: player,
    display_name: player,
    mode: 'solo',
    members: [player],
    status: index === 0 ? 'active' : 'active',
  }))
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

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <main style={pageWrap}>
        <div style={scanLine} />
        <div style={gridOverlay} />
        <section style={heroCard}>
          <div style={heroKicker}>MISSION CONTROL</div>
          <h1 style={heroTitle}>Loading terminal</h1>
          <p style={heroText}>Fetching operator profiles and mission entry configuration.</p>
        </section>
      </main>
    )
  }

  if (state.status === 'error') {
    return (
      <main style={pageWrap}>
        <div style={scanLine} />
        <div style={gridOverlay} />
        <section style={heroCard}>
          <div style={heroKicker}>MISSION CONTROL</div>
          <h1 style={heroTitle}>Config error</h1>
          <p style={heroText}>{state.message}</p>
        </section>
      </main>
    )
  }

  if (state.status !== 'ready') return null

  if (state.status !== 'ready') return null

  const config = state.config
  const title = config.site_name || 'SAGA ENGINE'
  const storyTitle = config.story_title || 'SELECT OPERATOR'
  const storyText =
    config.story_text || 'Choose an active profile to enter the live mission interface.'

  return (
    <main style={pageWrap}>
      <div style={scanLine} />
      <div style={gridOverlay} />

      <div style={contentWrap}>
        <section style={heroCard}>
          <div style={heroKicker}>MISSION CONTROL</div>
          <h1 style={heroTitle}>{title}</h1>
          <p style={heroSub}>{storyTitle}</p>
          <p style={heroText}>{storyText}</p>
        </section>

        <section style={grid}>
          {profiles.map((profile) => {
            const members = profile.members || [profile.display_name]
            return (
              <article key={profile.id} style={playerCard}>
                <div style={playerTop}>
                  <div style={playerIcon}>⌁</div>
                  <div style={modeBadge}>{profile.mode || 'solo'}</div>
                </div>

                <div style={playerName}>{profile.display_name}</div>
                <div style={playerMeta}>
                  {profile.mode === 'team' ? 'Team mission profile' : 'Field operator profile'}
                </div>

                <div style={membersBox}>
                  {members.join(' · ')}
                </div>

                <button
                  type="button"
                  style={enterButton}
                  onClick={() => {
                    window.location.href = `/?user=${encodeURIComponent(profile.id)}`
                  }}
                >
                  OPEN MISSION
                </button>
              </article>
            )
          })}
        </section>

        <div style={adminEntry}>
          <a href="/admin" style={adminLink}>
            ADMIN ACCESS
          </a>
        </div>
      </div>
    </main>
  )
}

const pageWrap: React.CSSProperties = {
  minHeight: '100vh',
  background:
    'radial-gradient(circle at top, rgba(34,211,238,.12), transparent 34%), radial-gradient(circle at 85% 15%, rgba(96,165,250,.16), transparent 28%), linear-gradient(180deg, #0b1220, #04070d)',
  color: '#e5f0ff',
  fontFamily: 'Inter, Segoe UI, system-ui, sans-serif',
  position: 'relative',
  overflowX: 'hidden',
  padding: 18,
}

const scanLine: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100%',
  height: 2,
  background: 'linear-gradient(90deg, transparent, rgba(96,165,250,.40), transparent)',
  opacity: 0.35,
  pointerEvents: 'none',
  zIndex: 1,
}

const gridOverlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  pointerEvents: 'none',
  backgroundImage:
    'linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px)',
  backgroundSize: '24px 24px',
  opacity: 0.6,
  zIndex: 0,
}

const contentWrap: React.CSSProperties = {
  position: 'relative',
  zIndex: 2,
  width: 'min(1040px, 100%)',
  margin: '0 auto',
}

const heroCard: React.CSSProperties = {
  margin: '0 auto 18px auto',
  padding: '20px 22px',
  border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 24,
  background: 'linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03))',
  boxShadow: '0 20px 60px rgba(0,0,0,.30)',
  backdropFilter: 'blur(18px)',
}

const heroKicker: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 30,
  padding: '0 12px',
  borderRadius: 999,
  border: '1px solid rgba(56,189,248,.24)',
  background: 'rgba(96,165,250,.10)',
  color: '#dbeafe',
  fontSize: 11,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  fontWeight: 800,
}

const heroTitle: React.CSSProperties = {
  marginTop: 16,
  fontSize: 'clamp(32px, 6vw, 58px)',
  lineHeight: 0.96,
  fontWeight: 900,
  letterSpacing: '-0.04em',
  color: '#fff',
}

const heroSub: React.CSSProperties = {
  marginTop: 12,
  color: '#c7d4e6',
  fontSize: 13,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  fontWeight: 800,
}

const heroText: React.CSSProperties = {
  marginTop: 10,
  maxWidth: 700,
  color: '#97a6ba',
  fontSize: 13,
  lineHeight: 1.55,
}

const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 12,
}

const playerCard: React.CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(10,14,24,.78)',
  borderRadius: 22,
  padding: 16,
  boxShadow: '0 16px 38px rgba(0,0,0,.22)',
  backdropFilter: 'blur(16px)',
}

const playerTop: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 14,
}

const playerIcon: React.CSSProperties = {
  width: 52,
  height: 52,
  borderRadius: 18,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(255,255,255,.05)',
  border: '1px solid rgba(255,255,255,.08)',
  fontSize: 24,
}

const modeBadge: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 28,
  padding: '0 10px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.04)',
  color: '#dbe7f7',
  fontSize: 10,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  fontWeight: 800,
}

const playerName: React.CSSProperties = {
  marginTop: 12,
  fontSize: 18,
  lineHeight: 1.05,
  fontWeight: 900,
  color: '#fff',
}

const playerMeta: React.CSSProperties = {
  marginTop: 6,
  color: '#97a6ba',
  fontSize: 10,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  fontWeight: 800,
}

const membersBox: React.CSSProperties = {
  marginTop: 10,
  padding: '10px 12px',
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,.06)',
  background: 'rgba(255,255,255,.04)',
  color: '#c7d4e6',
  fontSize: 11,
  lineHeight: 1.5,
}

const enterButton: React.CSSProperties = {
  marginTop: 12,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 40,
  padding: '0 14px',
  borderRadius: 13,
  border: '1px solid rgba(96,165,250,.22)',
  background: 'linear-gradient(180deg, rgba(37,99,235,.18), rgba(37,99,235,.10))',
  color: '#f8fbff',
  fontSize: 11,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  fontWeight: 800,
}

const adminEntry: React.CSSProperties = {
  margin: '18px auto 0 auto',
  width: 'fit-content',
}

const adminLink: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 40,
  padding: '0 14px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.04)',
  color: '#98a8bc',
  fontSize: 11,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  fontWeight: 800,
  textDecoration: 'none',
}
