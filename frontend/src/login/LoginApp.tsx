import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  fetchFieldProofs,
  fetchPlayerGame,
  fetchPublicConfig,
  fetchTeamStatus,
} from '../shared/api'
import type { PlayerProfile, PublicConfig } from '../types/player'
import {
  getPlayerAvatarInitials,
  getPlayerAvatarUrl,
  getPlayerColor,
} from '../shared/playerIdentity'
import { cachePublicConfig, getCachedPublicConfig } from '../shared/offlinePublicConfig'
import { saveMissionPack } from '../player/offline/missionPack'
import { cachePlayerShell, registerPlayerServiceWorker } from '../player/offline/pwaShell'
import {
  prefetchMissionMapTiles,
  type OfflineMapTileProgress,
} from '../player/offline/mapTileCache'
import { cacheTeamProfiles } from '../player/offline/teamPresence'
import { cacheFieldProofAssets, cacheFieldProofs } from '../player/offline/fieldProofCache'
import {
  formatOfflineVaultAge,
  getOfflineVaultSummary,
  makeOfflineVaultPlayer,
  saveOfflineVaultSummary,
  type OfflineVaultPlayer,
  type OfflineVaultSummary,
} from '../shared/offlineVault'

type LoadState =
  | { status: 'idle' | 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; config: PublicConfig }

type LoginLocale = 'es' | 'en'

type OfflinePrepProgress = {
  label: string
  done: number
  total: number
  detail?: string
}

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
      mapboxLimitTitle: '⚠️ Mapbox Quota Warning',
      mapboxLimitText: 'Premium map active. Limit: 200k loads/month.',
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
    mapboxLimitTitle: '⚠️ Límite de Mapbox',
    mapboxLimitText: 'Configurado mapa premium. Límite: 200.000 cargas/mes.',
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

function buildConfigFromOfflineVault(summary: OfflineVaultSummary): PublicConfig | null {
  const players = summary.players.filter((player) => player.ok)

  if (players.length === 0) return null

  return {
    site_name: 'SAGA',
    story_text: 'Datos offline preparados en este teléfono.',
    players: players.map((player) => player.id),
    player_profiles: players.map((player) => ({
      id: player.id,
      display_name: player.display_name || player.id,
      mode: player.mode === 'team' ? 'team' : 'solo',
      members: [player.id],
      status: 'active',
    })),
  }
}

async function warmOfflineProfiles(
  config: PublicConfig,
  onProgress?: (progress: OfflinePrepProgress) => void
): Promise<OfflineVaultSummary> {
  const profiles = normalizeProfiles(config).filter((profile) => profile.status !== 'disabled')

  await registerPlayerServiceWorker()
  await cachePlayerShell('/').catch(() => undefined)

  const players: OfflineVaultPlayer[] = []
  let mapPrepared = false

  onProgress?.({
    label: 'Preparando',
    done: 3,
    total: 100,
    detail: 'Guardando shell de la app',
  })

  for (let index = 0; index < profiles.length; index += 1) {
    const profile = profiles[index]

    try {
      const baseProgress = Math.round(8 + (index / Math.max(1, profiles.length)) * 20)

      onProgress?.({
        label: 'Jugadores',
        done: baseProgress,
        total: 100,
        detail: `${index + 1}/${profiles.length} · ${profile.display_name || profile.id}`,
      })

      const payload = await fetchPlayerGame(profile.id, { offlinePack: true })

      await saveMissionPack({
        user: profile.id,
        config,
        payload,
      })

      // Map prefetch has been moved to PlayerApp to run automatically on load!

      await fetchTeamStatus(profile.id)
        .then((team) => {
          cacheTeamProfiles(profile.id, Array.isArray(team.profiles) ? team.profiles : [])
        })
        .catch(() => undefined)

      await fetchFieldProofs(profile.id)
        .then(async (proofPayload) => {
          const proofs = Array.isArray(proofPayload.proofs) ? proofPayload.proofs : []
          cacheFieldProofs(profile.id, proofs)
          await cacheFieldProofAssets(proofs)
        })
        .catch(() => undefined)

      await cachePlayerShell(`/player/${encodeURIComponent(profile.id)}`).catch(() => undefined)

      players.push(
        makeOfflineVaultPlayer(profile, {
          ok: true,
          stage_count: Array.isArray(payload.stages) ? payload.stages.length : 0,
          level: payload.level || 0,
          finished: Boolean(payload.finished),
        })
      )
    } catch (error) {
      players.push(
        makeOfflineVaultPlayer(profile, {
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown offline preparation error',
        })
      )
    }
  }

  onProgress?.({
    label: 'Finalizando',
    done: 94,
    total: 100,
    detail: 'Guardando resumen offline',
  })

  const summary = saveOfflineVaultSummary(players)

  onProgress?.({
    label: 'Listo',
    done: 100,
    total: 100,
    detail: `${summary.ready_count}/${summary.profile_count} jugadores preparados`,
  })

  return summary
}

export default function LoginApp() {
  const [state, setState] = useState<LoadState>({ status: 'idle' })
  const [offlinePrepState, setOfflinePrepState] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle'
  )
  const [offlinePrepMessage, setOfflinePrepMessage] = useState('')
  const [offlinePrepProgress, setOfflinePrepProgress] = useState<OfflinePrepProgress | null>(null)
  const [offlineVault, setOfflineVault] = useState<OfflineVaultSummary>(() =>
    getOfflineVaultSummary()
  )
  const [mapboxDrawerOpen, setMapboxDrawerOpen] = useState(false)
  const isSecure = typeof window !== 'undefined' ? window.isSecureContext : true

  useEffect(() => {
    let cancelled = false

    async function run() {
      setState({ status: 'loading' })
      void registerPlayerServiceWorker()
      void cachePlayerShell('/')

      const vaultSummary = getOfflineVaultSummary()
      setOfflineVault(vaultSummary)

      const cachedConfig = getCachedPublicConfig()
      const cachedProfiles = cachedConfig
        ? normalizeProfiles(cachedConfig).filter((profile) => profile.status !== 'disabled')
        : []
      const vaultConfig = buildConfigFromOfflineVault(vaultSummary)
      const firstConfig = cachedProfiles.length > 0 ? cachedConfig : vaultConfig

      if (firstConfig && !cancelled) {
        setState({ status: 'ready', config: firstConfig })
      }

      try {
        const config = await fetchPublicConfig()
        cachePublicConfig(config)

        if (!cancelled) {
          setState({ status: 'ready', config })
        }

        void warmOfflineProfiles(config).then((summary) => {
          if (!cancelled) setOfflineVault(summary)
        })
      } catch (error) {
        if (firstConfig) return

        const message =
          error instanceof Error
            ? error.message
            : 'Sin conexión y sin jugadores preparados offline.'

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

  async function handlePrepareOffline() {
    if (state.status !== 'ready') return

    try {
      setOfflinePrepState('saving')
      setOfflinePrepMessage('Descargando datos offline…')
      setOfflinePrepProgress({
        label: 'Conectando',
        done: 2,
        total: 100,
        detail: 'Preparando descarga',
      })

      const onlineConfig = await fetchPublicConfig()
        .then((nextConfig) => {
          cachePublicConfig(nextConfig)
          return nextConfig
        })
        .catch(() => state.config)

      const summary = await warmOfflineProfiles(onlineConfig, setOfflinePrepProgress)

      setOfflineVault(summary)
      setOfflinePrepState(summary.failed_count > 0 ? 'error' : 'saved')
      setOfflinePrepProgress({
        label: summary.failed_count > 0 ? 'Parcial' : 'Listo',
        done: 100,
        total: 100,
        detail: `${summary.ready_count}/${summary.profile_count} jugadores · mapa/fotos actualizados`,
      })
      setOfflinePrepMessage(
        summary.failed_count > 0
          ? `Preparado parcialmente: ${summary.ready_count}/${summary.profile_count} jugadores.`
          : `Modo offline listo: ${summary.ready_count}/${summary.profile_count} jugadores · mapa/fotos actualizados.`
      )
    } catch (error) {
      setOfflinePrepState('error')
      setOfflinePrepProgress({
        label: 'Error',
        done: 100,
        total: 100,
        detail: error instanceof Error ? error.message : 'No se pudo preparar el modo offline.',
      })
      setOfflinePrepMessage(
        error instanceof Error ? error.message : 'No se pudo preparar el modo offline.'
      )
    }
  }

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

        {!isSecure ? (
          <div style={insecureLoginBanner}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 12 }}>
                Entorno no seguro (HTTP en IP remota)
              </div>
              <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2, lineHeight: 1.35 }}>
                El GPS y las descargas de mapa offline están desactivados por el navegador. Para
                probar SAGA en tu móvil, entra en{' '}
                <code
                  style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 4px', borderRadius: 4 }}
                >
                  chrome://flags/#unsafely-treat-insecure-origin-as-secure
                </code>
                , añade esta URL y actívalo.
              </div>
            </div>
          </div>
        ) : null}

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
                      const label = profile.display_name || profile.id
                      const href = `/player/${encodeURIComponent(profile.id)}`

                      const proceed = () => {
                        window.history.pushState(null, '', href)
                        window.dispatchEvent(new CustomEvent('saga:navigate'))
                      }

                      window.navigator.geolocation.getCurrentPosition(
                        () => proceed(),
                        (err) => {
                          console.warn(
                            'GPS request at login failed or denied, proceeding anyway.',
                            err
                          )
                          proceed()
                        },
                        { enableHighAccuracy: true, timeout: 5000 }
                      )
                    }}
                  >
                    {copy.enter}
                  </button>
                </div>
              </article>
            )
          })}
        </section>

        {/* Mapbox Warning Removed */}
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
  background:
    'linear-gradient(90deg, rgba(2,6,23,.12), transparent 22%, transparent 78%, rgba(2,6,23,.12))',
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
  animation: 'sagaFadeIn 260ms ease-out',
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

const offlineVaultCard: CSSProperties = {
  display: 'grid',
  gap: 10,
  padding: 13,
  borderRadius: 22,
  border: '1px solid rgba(255,255,255,.14)',
  background: 'linear-gradient(180deg, rgba(15,23,42,.32), rgba(15,23,42,.22))',
  boxShadow: '0 16px 34px rgba(15,23,42,.12), inset 0 1px 0 rgba(255,255,255,.08)',
  backdropFilter: 'blur(18px) saturate(130%)',
  WebkitBackdropFilter: 'blur(18px) saturate(130%)',
}

const offlineVaultTop: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: 10,
  alignItems: 'center',
}

const offlineVaultEyebrow: CSSProperties = {
  color: '#bbf7d0',
  fontSize: 9,
  fontWeight: 1000,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
}

const offlineVaultTitle: CSSProperties = {
  marginTop: 3,
  color: '#ffffff',
  fontSize: 15,
  fontWeight: 1000,
  letterSpacing: '-0.03em',
}

const offlineVaultText: CSSProperties = {
  marginTop: 4,
  color: 'rgba(255,255,255,.76)',
  fontSize: 11,
  lineHeight: 1.35,
  fontWeight: 700,
}

const offlineVaultButton: CSSProperties = {
  minHeight: 38,
  padding: '0 12px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.16)',
  background: 'rgba(187,247,208,.18)',
  color: '#ffffff',
  fontSize: 11,
  fontWeight: 1000,
}

const offlineVaultStatus: CSSProperties = {
  display: 'flex',
  gap: 7,
  alignItems: 'center',
  color: 'rgba(255,255,255,.82)',
  fontSize: 11,
  fontWeight: 800,
}

const offlineDotOk: CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 999,
  background: '#22c55e',
  boxShadow: '0 0 0 4px rgba(34,197,94,.14)',
  flex: '0 0 auto',
}

const offlineDotPending: CSSProperties = {
  ...offlineDotOk,
  background: '#60a5fa',
  boxShadow: '0 0 0 4px rgba(96,165,250,.14)',
}

const offlineProgressWrap: CSSProperties = {
  display: 'grid',
  gap: 7,
  padding: '9px 10px',
  borderRadius: 16,
  background: 'rgba(255,255,255,.075)',
  border: '1px solid rgba(255,255,255,.10)',
}

const offlineProgressTop: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  color: 'rgba(255,255,255,.90)',
  fontSize: 11,
  fontWeight: 950,
}

const offlineProgressTrack: CSSProperties = {
  height: 8,
  overflow: 'hidden',
  borderRadius: 999,
  background: 'rgba(15,23,42,.36)',
  boxShadow: 'inset 0 1px 2px rgba(0,0,0,.20)',
}

const offlineProgressFill: CSSProperties = {
  height: '100%',
  borderRadius: 999,
  background:
    'linear-gradient(90deg, rgba(34,197,94,.98), rgba(132,204,22,.98), rgba(187,247,208,.98))',
  transition: 'width 180ms ease',
}

const offlineProgressDetails: CSSProperties = {
  color: 'rgba(255,255,255,.72)',
  fontSize: 10,
  fontWeight: 750,
}

const offlineProgressSummary: CSSProperties = {
  cursor: 'pointer',
  listStyle: 'none',
}

const offlineProgressDetailText: CSSProperties = {
  marginTop: 4,
  lineHeight: 1.35,
}

const offlineVaultSuccess: CSSProperties = {
  padding: '8px 10px',
  borderRadius: 14,
  background: 'rgba(34,197,94,.13)',
  color: '#dcfce7',
  fontSize: 11,
  fontWeight: 800,
}

const offlineVaultError: CSSProperties = {
  ...offlineVaultSuccess,
  background: 'rgba(251,191,36,.14)',
  color: '#fef3c7',
}

const launchOverlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 9900,
  display: 'grid',
  placeItems: 'center',
  padding: 18,
  background: 'radial-gradient(circle at center, rgba(16, 185, 129, 0.12), #020617 85%)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  animation: 'sagaFadeIn 0.3s ease-out forwards',
}

const launchCard: CSSProperties = {
  width: 'min(340px, calc(100vw - 36px))',
  display: 'grid',
  justifyItems: 'center',
  gap: 16,
  padding: '24px 20px',
  borderRadius: 28,
  border: '1px solid rgba(52, 211, 153, 0.25)',
  background: 'linear-gradient(180deg, rgba(15,23,42,0.96), rgba(2,6,23,0.99))',
  boxShadow:
    '0 0 35px rgba(52, 211, 153, 0.12), 0 24px 54px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
  color: '#ffffff',
  animation: 'sagaFadeIn 0.4s ease-out forwards',
}

const launchSpinner: CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: '50%',
  border: '3px solid rgba(16,185,129,.12)',
  borderTopColor: '#34d399',
  animation: 'sagaSpin 800ms linear infinite',
}

const launchTitle: CSSProperties = {
  color: '#ffffff',
  fontSize: 15,
  fontWeight: 1000,
  letterSpacing: '0.06em',
  textAlign: 'center',
}

const launchText: CSSProperties = {
  color: 'rgba(226,232,240,.72)',
  fontSize: 11,
  fontWeight: 800,
  textAlign: 'center',
}

const launchProgressTrack: CSSProperties = {
  width: '100%',
  height: 6,
  background: 'rgba(15,23,42,.6)',
  borderRadius: 99,
  overflow: 'hidden',
  border: '1px solid rgba(255,255,255,.06)',
  marginTop: 4,
}

const launchProgressFill: CSSProperties = {
  height: '100%',
  background: 'linear-gradient(90deg, #10b981, #34d399)',
  borderRadius: 99,
  transition: 'width 80ms ease-out',
}

const insecureLoginBanner: CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'start',
  padding: 12,
  borderRadius: 16,
  background: 'rgba(239, 68, 68, 0.15)',
  border: '1px solid rgba(239, 68, 68, 0.3)',
  color: '#fca5a5',
  marginBottom: 16,
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
  animation: 'sagaFadeIn 260ms ease-out',
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
  @keyframes sagaSpin {
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes sagaFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
`
