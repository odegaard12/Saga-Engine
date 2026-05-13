import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { fetchPublicConfig } from '../shared/api'
import type { PlayerProfile, PublicConfig } from '../types/player'
import { getPlayerAvatarInitials, getPlayerAvatarUrl, getPlayerColor } from '../shared/playerIdentity'

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

function looksPlaceholder(value?: string) {
  const text = String(value || '').trim()
  if (!text) return true
  return text.toUpperCase().startsWith('PUT ')
}

function resolveLoginCopy(config: PublicConfig) {
  const title = !looksPlaceholder(config.site_name) ? config.site_name! : 'SAGA'
  const subtitle = !looksPlaceholder(config.story_title)
    ? config.story_title!
    : 'Enter mission'
  const body = !looksPlaceholder(config.story_text)
    ? config.story_text!
    : 'Tap an operator to continue.'
  return { title, subtitle, body }
}

function getMeta(profile: PlayerProfile) {
  if (profile.mode === 'team') {
    const members = profile.members || [profile.display_name]
    return members.join(' · ')
  }
  return ''
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

  const mobile =
    typeof window !== 'undefined' ? window.innerWidth <= 560 : false

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <main style={pageWrap}>
        <style>{loginAnimations}</style>
        <div style={backGlowTop} />
        <div style={backGlowBottom} />
        <div style={backVignette} />

        <div style={shellWrap}>
          <section style={heroCard}>
            <div style={heroTop}>
              <div style={eyebrow}>MISSION ENTRY</div>
            </div>
            <div style={heroCenter}>
              <h1 style={heroTitle}>SAGA</h1>
              <p style={heroSubtitle}>Loading mission</p>
            </div>
          </section>
        </div>
      </main>
    )
  }

  if (state.status === 'error') {
    return (
      <main style={pageWrap}>
        <style>{loginAnimations}</style>
        <div style={backGlowTop} />
        <div style={backGlowBottom} />
        <div style={backVignette} />

        <div style={shellWrap}>
          <section style={heroCard}>
            <div style={heroTop}>
              <div style={eyebrow}>MISSION ENTRY</div>
            </div>
            <div style={heroCenter}>
              <h1 style={heroTitle}>Config error</h1>
              <p style={heroBody}>{state.message}</p>
            </div>
          </section>
        </div>
      </main>
    )
  }

  if (state.status !== 'ready') return null

  const { title, subtitle, body } = resolveLoginCopy(state.config)

  return (
    <main style={pageWrap}>
      <style>{loginAnimations}</style>
      <div style={backGlowTop} />
      <div style={backGlowBottom} />
      <div style={backVignette} />

      <div
        style={{
          ...shellWrap,
          padding: mobile
            ? 'calc(env(safe-area-inset-top, 0px) + 16px) 14px calc(env(safe-area-inset-bottom, 0px) + 24px)'
            : '32px 20px 40px',
        }}
      >
        <section style={heroCard}>
          <div style={heroTop}>
            <div style={eyebrow}>MISSION ENTRY</div>

            <a href="/admin" style={adminButton}>
              Admin
            </a>
          </div>

          <div style={heroCenter}>
            <h1 style={heroTitle}>{title}</h1>
            <p style={heroSubtitle}>{subtitle}</p>
            <p style={heroBody}>{body}</p>
          </div>
        </section>

        <section style={listBlock}>
          {profiles.map((profile, index) => {
            const isTeam = profile.mode === 'team'
            const meta = getMeta(profile)
              const profileColor = getPlayerColor(profile)
              const avatarUrl = getPlayerAvatarUrl(profile)
              const avatarInitials = getPlayerAvatarInitials(profile)

            return (
              <article
                key={profile.id}
                style={{
                  ...playerCard,
                  animationDelay: `${index * 35}ms`,
                }}
              >
                <div style={playerLeft}>
                    <div
                      style={{
                        ...avatar,
                        background: `linear-gradient(135deg, ${profileColor}, rgba(255,255,255,.22))`,
                        borderColor: `${profileColor}66`,
                        color: '#ffffff',
                      }}
                    >
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt=""
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            borderRadius: 999,
                            display: 'block',
                          }}
                        />
                      ) : (
                        avatarInitials
                      )}
                    </div>

                  <div style={identity}>
                    <div style={playerName}>{profile.display_name}</div>
                    <div style={identityBottom}>
                      <span style={modePill}>{isTeam ? 'TEAM' : 'SOLO'}</span>
                      {meta ? <span style={playerMetaInline}>{meta}</span> : null}
                    </div>
                  </div>
                </div>

                <div style={playerRight}>
                  <button
                    type="button"
                    style={enterButton}
                    onClick={() => {
                      window.location.href = `/player/${encodeURIComponent(profile.id)}`
                    }}
                  >
                    Enter
                  </button>
                </div>
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
  position: 'relative',
  overflowX: 'hidden',
  background:
    'linear-gradient(180deg, #2f3b36 0%, #394540 28%, #47524e 100%)',
  color: '#ffffff',
  fontFamily: 'Inter, Segoe UI, system-ui, sans-serif',
}

const backGlowTop: CSSProperties = {
  position: 'fixed',
  inset: 0,
  pointerEvents: 'none',
  background:
    'radial-gradient(circle at 50% 0%, rgba(34,197,94,.18), transparent 28%)',
}

const backGlowBottom: CSSProperties = {
  position: 'fixed',
  inset: 0,
  pointerEvents: 'none',
  background:
    'radial-gradient(circle at 84% 18%, rgba(59,130,246,.12), transparent 18%), radial-gradient(circle at 12% 82%, rgba(255,255,255,.06), transparent 18%)',
}

const backVignette: CSSProperties = {
  position: 'fixed',
  inset: 0,
  pointerEvents: 'none',
  boxShadow: 'inset 0 0 120px rgba(15,23,42,.26)',
}

const shellWrap: CSSProperties = {
  position: 'relative',
  zIndex: 2,
  width: 'min(760px, 100%)',
  margin: '0 auto',
  display: 'grid',
  gap: 14,
}

const heroCard: CSSProperties = {
  padding: '18px 18px 22px',
  borderRadius: 30,
  border: '1px solid rgba(255,255,255,.16)',
  background:
    'linear-gradient(180deg, rgba(84,91,104,.74) 0%, rgba(110,116,128,.62) 100%)',
  boxShadow: '0 22px 52px rgba(15,23,42,.18), inset 0 1px 0 rgba(255,255,255,.10)',
  backdropFilter: 'blur(20px) saturate(135%)',
  WebkitBackdropFilter: 'blur(20px) saturate(135%)',
  animation: 'sagaLoginRise 260ms cubic-bezier(0.22, 1, 0.36, 1)',
}

const heroTop: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
}

const eyebrow: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 28,
  padding: '0 11px',
  borderRadius: 999,
  border: '1px solid rgba(74,222,128,.18)',
  background: 'rgba(220,252,231,.88)',
  color: '#166534',
  fontSize: 10,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  fontWeight: 900,
}

const adminButton: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 30,
  padding: '0 11px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.16)',
  background: 'rgba(255,255,255,.10)',
  color: '#ffffff',
  fontSize: 11,
  fontWeight: 800,
  textDecoration: 'none',
}

const heroCenter: CSSProperties = {
  marginTop: 26,
  display: 'grid',
  justifyItems: 'center',
  textAlign: 'center',
  gap: 10,
}

const heroTitle: CSSProperties = {
  margin: 0,
  fontSize: 'clamp(48px, 11vw, 76px)',
  lineHeight: 0.9,
  fontWeight: 900,
  letterSpacing: '-0.06em',
  color: '#ffffff',
  textShadow: '0 10px 26px rgba(15,23,42,.20)',
}

const heroSubtitle: CSSProperties = {
  margin: 0,
  color: '#c8ffe1',
  fontSize: 13,
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  fontWeight: 900,
}

const heroBody: CSSProperties = {
  margin: 0,
  maxWidth: 420,
  color: 'rgba(255,255,255,.86)',
  fontSize: 16,
  lineHeight: 1.5,
}

const listBlock: CSSProperties = {
  display: 'grid',
  gap: 8,
}

const playerCard: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: 10,
  alignItems: 'center',
  padding: '12px 12px',
  borderRadius: 22,
  border: '1px solid rgba(255,255,255,.14)',
  background:
    'linear-gradient(180deg, rgba(84,91,104,.68) 0%, rgba(102,108,120,.58) 100%)',
  boxShadow: '0 16px 34px rgba(15,23,42,.14), inset 0 1px 0 rgba(255,255,255,.08)',
  backdropFilter: 'blur(18px) saturate(130%)',
  WebkitBackdropFilter: 'blur(18px) saturate(130%)',
  animation: 'sagaLoginRise 260ms cubic-bezier(0.22, 1, 0.36, 1)',
  animationFillMode: 'both',
}

const playerLeft: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '40px minmax(0, 1fr)',
  gap: 10,
  alignItems: 'center',
  minWidth: 0,
}

const avatar: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 999,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(219,234,254,.92)',
  border: '1px solid rgba(96,165,250,.28)',
  color: '#1d4ed8',
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: '0.04em',
}

const identity: CSSProperties = {
  minWidth: 0,
  display: 'grid',
  gap: 6,
}

const playerName: CSSProperties = {
  fontSize: 22,
  lineHeight: 0.96,
  fontWeight: 900,
  color: '#ffffff',
  letterSpacing: '-0.03em',
}
const identityBottom: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
}

const playerMetaInline: CSSProperties = {
  color: 'rgba(255,255,255,.66)',
  fontSize: 12,
  lineHeight: 1.2,
}


const playerMeta: CSSProperties = {
  marginTop: 3,
  color: 'rgba(255,255,255,.74)',
  fontSize: 11,
  lineHeight: 1.3,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const playerRight: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  minWidth: 132,
}

const modePill: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 22,
  padding: '0 8px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.14)',
  background: 'rgba(255,255,255,.10)',
  color: '#ffffff',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
}

const enterButton: CSSProperties = {
  minWidth: 118,
  minHeight: 34,
  padding: '0 14px',
  borderRadius: 12,
  border: '1px solid rgba(34,197,94,.24)',
  background: 'linear-gradient(180deg, #22c55e, #16a34a)',
  color: '#ffffff',
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  boxShadow: '0 12px 24px rgba(34,197,94,.18)',
}

const loginAnimations = `
@keyframes sagaLoginRise {
  from {
    opacity: 0;
    transform: translateY(12px) scale(.992);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
`

const heroImage: CSSProperties = {
  width: 'min(100%, 420px)',
  maxHeight: 136,
  objectFit: 'cover',
  borderRadius: 26,
  border: '1px solid rgba(255,255,255,.16)',
  boxShadow: '0 20px 50px rgba(2,6,23,.22)',
  marginBottom: 14,
}
