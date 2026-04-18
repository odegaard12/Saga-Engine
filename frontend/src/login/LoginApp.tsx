import { useEffect, useMemo, useState } from 'react'
import { fetchPublicConfig } from '../shared/api'
import type { PlayerProfile, PublicConfig } from '../types/player'
import { GAME_CATALOG } from '../player/minigames/gameCatalog'

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

  const activeModules = useMemo(
    () => GAME_CATALOG.filter((game) => game.status !== 'planned'),
    []
  )

  const upcomingModules = useMemo(
    () => GAME_CATALOG.filter((game) => game.status === 'planned').slice(0, 4),
    []
  )

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <main style={pageWrap}>
        <div style={ambientGlow} />
        <section style={heroCard}>
          <div style={heroKicker}>MISSION ENTRY</div>
          <h1 style={heroTitle}>Loading session map</h1>
          <p style={heroText}>Fetching operator profiles and runtime modules.</p>
        </section>
      </main>
    )
  }

  if (state.status === 'error') {
    return (
      <main style={pageWrap}>
        <div style={ambientGlow} />
        <section style={heroCard}>
          <div style={heroKicker}>MISSION ENTRY</div>
          <h1 style={heroTitle}>Config error</h1>
          <p style={heroText}>{state.message}</p>
        </section>
      </main>
    )
  }

  if (state.status !== 'ready') return null

  const config = state.config
  const title = config.site_name || 'SAGA ENGINE'
  const storyTitle = config.story_title || 'Select operator'
  const storyText =
    config.story_text || 'Choose an active profile to enter the live mission interface.'

  const mobile =
    typeof window !== 'undefined' ? window.innerWidth <= 560 : false

  return (
    <main style={pageWrap}>
      <div style={ambientGlow} />

      <div
        style={{
          ...contentWrap,
          padding: mobile
            ? 'calc(env(safe-area-inset-top, 0px) + 16px) 14px calc(env(safe-area-inset-bottom, 0px) + 18px)'
            : '24px 18px 28px',
        }}
      >
        <section style={heroCard}>
          <div style={heroTopRow}>
            <div style={heroKicker}>MISSION ENTRY</div>
            <a href="/admin" style={adminLink}>
              ADMIN
            </a>
          </div>

          <h1 style={heroTitle}>{title}</h1>
          <p style={heroSub}>{storyTitle}</p>
          <p style={heroText}>{storyText}</p>

          <div style={moduleStrip}>
            {activeModules.map((game) => (
              <span key={game.id} style={moduleChipActive}>
                {game.label}
              </span>
            ))}
          </div>
        </section>

        <section style={sectionBlock}>
          <div style={sectionEyebrow}>OPERATORS</div>
          <div style={grid}>
            {profiles.map((profile) => {
              const members = profile.members || [profile.display_name]
              const isTeam = profile.mode === 'team'

              return (
                <article key={profile.id} style={playerCard}>
                  <div style={playerTop}>
                    <div style={playerIcon}>{isTeam ? '◎' : '⌁'}</div>
                    <div style={modeBadge}>{profile.mode || 'solo'}</div>
                  </div>

                  <div style={playerName}>{profile.display_name}</div>
                  <div style={playerMeta}>
                    {isTeam ? 'Team-ready session' : 'Field operator'}
                  </div>

                  <div style={membersBox}>{members.join(' · ')}</div>

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
          </div>
        </section>

        <section style={sectionBlock}>
          <div style={sectionEyebrow}>NEXT GAMEPLAY TRACK</div>
          <div style={roadmapGrid}>
            {upcomingModules.map((game) => (
              <article key={game.id} style={roadmapCard}>
                <div style={roadmapTop}>
                  <div style={roadmapTitle}>{game.label}</div>
                  <div style={roadmapCategory}>{game.category}</div>
                </div>

                <div style={roadmapFlags}>
                  {game.supportsTeam ? <span style={flagChip}>TEAM</span> : null}
                  {game.needsGps ? <span style={flagChip}>GPS</span> : null}
                  {game.needsMotion ? <span style={flagChip}>MOTION</span> : null}
                  {game.needsMic ? <span style={flagChip}>MIC</span> : null}
                </div>

                <div style={roadmapText}>{game.notes}</div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}

const pageWrap: React.CSSProperties = {
  minHeight: '100dvh',
  background:
    'radial-gradient(circle at top, rgba(34,197,94,.10), transparent 34%), radial-gradient(circle at 85% 18%, rgba(59,130,246,.10), transparent 28%), linear-gradient(180deg, #eef3ed, #e8efea)',
  color: '#0f172a',
  fontFamily: 'Inter, Segoe UI, system-ui, sans-serif',
  position: 'relative',
  overflowX: 'hidden',
}

const ambientGlow: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  pointerEvents: 'none',
  background:
    'linear-gradient(rgba(255,255,255,.04), rgba(255,255,255,0)), radial-gradient(circle at 20% 10%, rgba(255,255,255,.30), transparent 24%)',
  opacity: 0.8,
}

const contentWrap: React.CSSProperties = {
  position: 'relative',
  zIndex: 2,
  width: 'min(1040px, 100%)',
  margin: '0 auto',
  display: 'grid',
  gap: 16,
}

const heroCard: React.CSSProperties = {
  padding: '18px 18px 16px',
  border: '1px solid rgba(15,23,42,.08)',
  borderRadius: 24,
  background: 'rgba(255,255,255,.88)',
  boxShadow: '0 18px 40px rgba(15,23,42,.06)',
  backdropFilter: 'blur(12px)',
}

const heroTopRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 10,
}

const heroKicker: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 30,
  padding: '0 12px',
  borderRadius: 999,
  border: '1px solid rgba(34,197,94,.16)',
  background: 'rgba(220,252,231,.92)',
  color: '#166534',
  fontSize: 10,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  fontWeight: 900,
}

const adminLink: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 32,
  padding: '0 12px',
  borderRadius: 999,
  border: '1px solid rgba(15,23,42,.08)',
  background: 'rgba(248,250,252,.96)',
  color: '#334155',
  fontSize: 10,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  fontWeight: 900,
  textDecoration: 'none',
}

const heroTitle: React.CSSProperties = {
  marginTop: 14,
  fontSize: 'clamp(30px, 6vw, 50px)',
  lineHeight: 0.96,
  fontWeight: 900,
  letterSpacing: '-0.04em',
  color: '#0f172a',
}

const heroSub: React.CSSProperties = {
  marginTop: 10,
  color: '#166534',
  fontSize: 12,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  fontWeight: 900,
}

const heroText: React.CSSProperties = {
  marginTop: 8,
  maxWidth: 680,
  color: '#475569',
  fontSize: 14,
  lineHeight: 1.5,
}

const moduleStrip: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  marginTop: 14,
}

const moduleChipActive: React.CSSProperties = {
  minHeight: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 10px',
  borderRadius: 999,
  border: '1px solid rgba(59,130,246,.16)',
  background: 'rgba(219,234,254,.96)',
  color: '#1e3a8a',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.12em',
}

const sectionBlock: React.CSSProperties = {
  display: 'grid',
  gap: 10,
}

const sectionEyebrow: React.CSSProperties = {
  color: '#047857',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.16em',
  paddingLeft: 2,
}

const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12,
}

const playerCard: React.CSSProperties = {
  border: '1px solid rgba(15,23,42,.08)',
  background: 'rgba(255,255,255,.88)',
  borderRadius: 22,
  padding: 14,
  boxShadow: '0 12px 28px rgba(15,23,42,.06)',
  display: 'grid',
  gap: 10,
}

const playerTop: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
}

const playerIcon: React.CSSProperties = {
  width: 46,
  height: 46,
  borderRadius: 16,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(248,250,252,.96)',
  border: '1px solid rgba(15,23,42,.08)',
  fontSize: 22,
  color: '#166534',
}

const modeBadge: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 28,
  padding: '0 10px',
  borderRadius: 999,
  border: '1px solid rgba(15,23,42,.08)',
  background: 'rgba(248,250,252,.96)',
  color: '#334155',
  fontSize: 10,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  fontWeight: 900,
}

const playerName: React.CSSProperties = {
  fontSize: 18,
  lineHeight: 1.05,
  fontWeight: 900,
  color: '#0f172a',
}

const playerMeta: React.CSSProperties = {
  color: '#64748b',
  fontSize: 11,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  fontWeight: 800,
}

const membersBox: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 14,
  border: '1px solid rgba(15,23,42,.08)',
  background: 'rgba(248,250,252,.96)',
  color: '#475569',
  fontSize: 12,
  lineHeight: 1.45,
}

const enterButton: React.CSSProperties = {
  minHeight: 42,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 14,
  border: '1px solid rgba(22,163,74,.18)',
  background: 'linear-gradient(180deg, #16a34a, #15803d)',
  color: '#ffffff',
  fontSize: 11,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  fontWeight: 900,
  boxShadow: '0 10px 24px rgba(22,163,74,.18)',
}

const roadmapGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12,
}

const roadmapCard: React.CSSProperties = {
  border: '1px solid rgba(15,23,42,.08)',
  background: 'rgba(255,255,255,.80)',
  borderRadius: 20,
  padding: 14,
  boxShadow: '0 12px 28px rgba(15,23,42,.05)',
  display: 'grid',
  gap: 10,
}

const roadmapTop: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 10,
}

const roadmapTitle: React.CSSProperties = {
  color: '#0f172a',
  fontSize: 16,
  fontWeight: 900,
  lineHeight: 1.08,
}

const roadmapCategory: React.CSSProperties = {
  minHeight: 26,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 9px',
  borderRadius: 999,
  border: '1px solid rgba(59,130,246,.16)',
  background: 'rgba(219,234,254,.96)',
  color: '#1e3a8a',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
}

const roadmapFlags: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
}

const flagChip: React.CSSProperties = {
  minHeight: 24,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 8px',
  borderRadius: 999,
  border: '1px solid rgba(148,163,184,.16)',
  background: 'rgba(241,245,249,.96)',
  color: '#475569',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.10em',
}

const roadmapText: React.CSSProperties = {
  color: '#475569',
  fontSize: 13,
  lineHeight: 1.45,
}
