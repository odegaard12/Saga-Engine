import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { fetchPublicConfig } from '../shared/api'
import type { PlayerProfile, PublicConfig } from '../types/player'
import { getPlayerAvatarInitials, getPlayerAvatarUrl, getPlayerColor } from '../shared/playerIdentity'

type LoadState =
  | { status: 'idle' | 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; config: PublicConfig }

type LoginLocale = 'es' | 'en'

function getLoginLocale(config?: PublicConfig): LoginLocale {
  let stored = ''
  try {
    stored = String(window.localStorage.getItem('saga_locale') || '').toLowerCase()
  } catch {
    stored = ''
  }

  const raw = stored || String(config?.ui_lang || 'es').toLowerCase()
  if (raw.startsWith('en')) return 'en'
  return 'es'
}

function loginText(locale: LoginLocale) {
  if (locale === 'en') {
    return {
      admin: 'Admin',
      bodyFallback: 'Choose a player to continue.',
      enter: 'Enter',
      solo: 'SOLO',
      team: 'TEAM',
      brandKicker: 'FIELD MISSION',
      configError: 'Configuration error',
    }
  }

  return {
    admin: 'Admin',
    bodyFallback: 'Elige jugador para continuar.',
    enter: 'Entrar',
    solo: 'SOLO',
    team: 'EQUIPO',
    brandKicker: 'MISIÓN DE CAMPO',
    configError: 'Error de configuración',
  }
}

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

function resolveLoginCopy(config: PublicConfig, locale: LoginLocale) {
  const copy = loginText(locale)
  const title = !looksPlaceholder(config.site_name) ? config.site_name! : 'SAGA'
  const subtitle = !looksPlaceholder(config.story_title) ? config.story_title! : ''
  const body = !looksPlaceholder(config.story_text) ? config.story_text! : copy.bodyFallback
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

  const mobile = typeof window !== 'undefined' ? window.innerWidth <= 560 : false

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <main style={pageWrap}>
        <style>{loginAnimations}</style>
        <div style={backGlowTop} />
        <div style={backGlowBottom} />
        <div style={backVignette} />

        <div style={shellWrap}>
          <section style={heroCard}>
            <div style={heroTopSpacer} />
            <div style={heroCenter}>
              <div style={sagaWordmark}>SAGA</div>
              <div style={sagaWordmarkSub}>MISIÓN DE CAMPO</div>
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
            <div style={heroTopSpacer} />
            <div style={heroCenter}>
              <div style={sagaWordmark}>SAGA</div>
              <div style={sagaWordmarkSub}>MISIÓN DE CAMPO</div>
              <h1 style={heroTitle}>Error de configuración</h1>
              <p style={heroBody}>{state.message}</p>
            </div>
          </section>
        </div>
      </main>
    )
  }

  if (state.status !== 'ready') return null

  const locale = getLoginLocale(state.config)
  const copy = loginText(locale)
  const { title, subtitle, body } = resolveLoginCopy(state.config, locale)

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
            <div />
            <a href="/admin" style={adminButton}>
              {copy.admin}
            </a>
          </div>

          <div style={heroCenter}>
            {title && title.toUpperCase() !== 'SAGA' ? (
              <h1 style={heroTitle}>{title}</h1>
            ) : (
              <>
                <div style={sagaWordmark}>SAGA</div>
                <div style={sagaWordmarkSub}>{copy.brandKicker}</div>
              </>
            )}

            {subtitle ? <p style={heroSubtitle}>{subtitle}</p> : null}
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
                      background: `linear-gradient(135deg, ${profileColor}, rgba(255,255,255,.20))`,
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
                      <span style={modePill}>{isTeam ? copy.team : copy.solo}</span>
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
                    {copy.enter}
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
    'radial-gradient(circle at 50% 0%, rgba(74,222,128,.15), transparent 34%), linear-gradient(180deg, #253530 0%, #34433e 45%, #25322e 100%)',
  color: '#ffffff',
  fontFamily: 'Inter, Segoe UI, system-ui, sans-serif',
}

const shellWrap: CSSProperties = {
  position: 'relative',
  zIndex: 1,
  width: 'min(100%, 390px)',
  margin: '0 auto',
  padding: '32px 20px 40px',
  display: 'grid',
  gap: 14,
}

const backGlowTop: CSSProperties = {
  position: 'fixed',
  inset: '-180px auto auto 50%',
  width: 420,
  height: 420,
  transform: 'translateX(-50%)',
  borderRadius: 999,
  background: 'rgba(74,222,128,.12)',
  filter: 'blur(34px)',
  pointerEvents: 'none',
}

const backGlowBottom: CSSProperties = {
  position: 'fixed',
  inset: 'auto auto -240px 50%',
  width: 520,
  height: 520,
  transform: 'translateX(-50%)',
  borderRadius: 999,
  background: 'rgba(15,23,42,.24)',
  filter: 'blur(44px)',
  pointerEvents: 'none',
}

const backVignette: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'linear-gradient(90deg, rgba(2,6,23,.12), transparent 22%, transparent 78%, rgba(2,6,23,.12))',
  pointerEvents: 'none',
}

const heroCard: CSSProperties = {
  padding: '22px 18px 24px',
  borderRadius: 30,
  border: '1px solid rgba(255,255,255,.14)',
  background: 'linear-gradient(180deg, rgba(78,92,90,.86) 0%, rgba(60,74,70,.76) 100%)',
  boxShadow: '0 22px 52px rgba(5,14,12,.28), inset 0 1px 0 rgba(255,255,255,.10)',
  backdropFilter: 'blur(18px) saturate(135%)',
  WebkitBackdropFilter: 'blur(18px) saturate(135%)',
  animation: 'sagaLoginRise 260ms cubic-bezier(0.22, 1, 0.36, 1)',
}

const heroTopSpacer: CSSProperties = {
  minHeight: 30,
}

const heroTop: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  minHeight: 30,
}

const adminButton: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 28,
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
  marginTop: 8,
  display: 'grid',
  justifyItems: 'center',
  textAlign: 'center',
  gap: 8,
}

const sagaWordmark: CSSProperties = {
  color: '#ffffff',
  fontSize: 'clamp(58px, 14vw, 86px)',
  lineHeight: 0.78,
  fontWeight: 1000,
  letterSpacing: '-0.08em',
  textShadow: '0 16px 34px rgba(2,6,23,.34)',
}

const sagaWordmarkSub: CSSProperties = {
  color: '#dcffe9',
  fontSize: 10,
  lineHeight: 1,
  fontWeight: 1000,
  letterSpacing: '0.36em',
  textTransform: 'uppercase',
  marginTop: 3,
  marginBottom: 8,
}

const heroTitle: CSSProperties = {
  margin: 0,
  fontSize: 'clamp(42px, 10vw, 70px)',
  lineHeight: 0.9,
  fontWeight: 900,
  letterSpacing: '-0.06em',
  color: '#ffffff',
  textShadow: '0 10px 26px rgba(15,23,42,.20)',
}

const heroSubtitle: CSSProperties = {
  margin: 0,
  color: '#dcffe9',
  fontSize: 12,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  fontWeight: 900,
}

const heroBody: CSSProperties = {
  margin: 0,
  maxWidth: 420,
  color: 'rgba(255,255,255,.88)',
  fontSize: 14,
  lineHeight: 1.45,
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
  background: 'linear-gradient(180deg, rgba(78,92,90,.76) 0%, rgba(62,78,73,.66) 100%)',
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
  color: '#ffffff',
  fontSize: 13,
  fontWeight: 900,
  overflow: 'hidden',
}

const identity: CSSProperties = {
  display: 'grid',
  gap: 5,
  minWidth: 0,
}

const playerName: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: '#ffffff',
  fontSize: 18,
  lineHeight: 1,
  fontWeight: 1000,
  letterSpacing: '-0.04em',
  textShadow: '0 8px 18px rgba(2,6,23,.24)',
}

const identityBottom: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  minWidth: 0,
}

const modePill: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 18,
  padding: '0 7px',
  borderRadius: 999,
  background: 'rgba(255,255,255,.14)',
  color: 'rgba(255,255,255,.92)',
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const playerMetaInline: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: 'rgba(255,255,255,.70)',
  fontSize: 11,
  fontWeight: 700,
}

const playerRight: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
}

const enterButton: CSSProperties = {
  minHeight: 32,
  minWidth: 88,
  border: 0,
  borderRadius: 10,
  background: 'linear-gradient(180deg, #35d86e 0%, #16a34a 100%)',
  color: '#ffffff',
  fontSize: 11,
  fontWeight: 1000,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  boxShadow: '0 12px 24px rgba(22,163,74,.22), inset 0 1px 0 rgba(255,255,255,.20)',
  cursor: 'pointer',
}

const loginAnimations = `
@keyframes sagaLoginRise {
  from {
    opacity: 0;
    transform: translateY(8px) scale(.99);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
`
