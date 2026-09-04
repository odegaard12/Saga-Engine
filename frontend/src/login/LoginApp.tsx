import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { fetchFieldProofs, fetchPlayerGame, fetchPublicConfig, fetchTeamStatus } from '../shared/api'
import type { PlayerProfile, PublicConfig } from '../types/player'
import { getPlayerAvatarInitials, getPlayerAvatarUrl, getPlayerColor } from '../shared/playerIdentity'
import { cachePublicConfig, getCachedPublicConfig } from '../shared/offlinePublicConfig'
import { aplicarTema } from '../shared/tema'
import { saveMissionPack } from '../player/offline/missionPack'
import { cachePlayerShell, registerPlayerServiceWorker } from '../player/offline/pwaShell'
import { cacheTeamProfiles } from '../player/offline/teamPresence'
import { cacheFieldProofAssets, cacheFieldProofs } from '../player/offline/fieldProofCache'
import {
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

type LoginLocale = 'gl' | 'es' | 'en'

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
  if (raw.startsWith('gl')) return 'gl'
  if (raw.startsWith('en')) return 'en'
  return 'es'
}

function loginText(locale: LoginLocale) {
  // O galego é o idioma da misión.
  if (locale === 'gl') {
    return {
      admin: 'Admin',
      bodyFallback: 'Escolle xogador para continuar.',
      intro:
        'Unha ruta a pé con probas en cada punto. Só fai falta o móbil, camiñar e mirar arredor.',
      enter: 'Entrar',
      solo: 'SÓ',
      team: 'EQUIPO',
      brandKicker: 'MISIÓN DE CAMPO',
      configError: 'Erro de configuración',
      mapboxLimitTitle: '⚠️ Límite de Mapbox',
      mapboxLimitText: 'Mapa premium activo. Límite: 200.000 cargas/mes.',
    }
  }

  if (locale === 'en') {
    return {
      admin: 'Admin',
      bodyFallback: 'Choose a player to continue.',
      intro:
        'A walking route with a challenge at every point. All you need is your phone, your legs and your eyes.',
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
    intro:
      'Una ruta a pie con pruebas en cada punto. Solo hace falta el móvil, caminar y mirar alrededor.',
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
  // El login es una lista de jugadores, no una pantalla de lectura: aquí sólo
  // cabe una frase. Si la configuración trae un texto largo (el prólogo entero,
  // por ejemplo) se corta en el primer punto y aparte y se limita el largo, que
  // si no empuja la lista de jugadores fuera de la pantalla.
  const crudo = !looksPlaceholder(config.story_text) ? config.story_text! : copy.bodyFallback
  const primeraLinea = String(crudo).split(/\n\s*\n/)[0].trim()
  const body = primeraLinea.length > 240 ? primeraLinea.slice(0, 237).trimEnd() + '…' : primeraLinea

  /**
   * Segunda línea, la de la propia pantalla.
   *
   * El texto de la misión son dos frases y la portada quedaba vacía. Esto no
   * cuenta nada de la historia: dice qué es esto y qué hace falta para salir.
   * Si la misión ya trae un texto largo no se añade nada, que entonces sobra.
   */
  const intro = primeraLinea.length > 150 ? '' : copy.intro

  return { title, subtitle, body, intro }
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
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [offlinePrepState, setOfflinePrepState] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle'
  )
  const [offlinePrepMessage, setOfflinePrepMessage] = useState('')
  const [offlinePrepProgress, setOfflinePrepProgress] = useState<OfflinePrepProgress | null>(null)
  const [offlineVault, setOfflineVault] = useState<OfflineVaultSummary>(() =>
    getOfflineVaultSummary()
  )
  const [playerInput, setPlayerInput] = useState('')
  const [loggingInId, setLoggingInId] = useState<string | null>(null)
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

  useEffect(() => {
    aplicarTema(state.status === 'ready' ? state.config.player_theme : null)
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
  const { title, subtitle, body, intro } = resolveLoginCopy(state.config, locale)

  return (
    <main style={pageWrap}>
      <style>{loginAnimations}</style>
      <div style={fondoFoto} />
      <div style={fondoVelo} />
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
          {/* El título va EN LA MISMA FILA que "Admin", no debajo.
              Antes el botón ocupaba una fila entera para él solo y el rótulo
              empezaba por debajo: eso, más el margen que reservaba una foto
              de portada inexistente, era el hueco muerto de la parte de
              arriba. Ahora la pantalla empieza donde tiene que empezar. */}
          <div style={heroTop}>
            <div style={heroTopTitle}>
              {title && title.toUpperCase() !== 'SAGA' ? (
                <h1 style={heroTitle}>{title}</h1>
              ) : (
                <div style={sagaWordmark}>SAGA</div>
              )}
              {subtitle ? (
                <p style={heroSubtitle}>{subtitle}</p>
              ) : (
                <div style={sagaWordmarkSub}>{copy.brandKicker}</div>
              )}
            </div>
            <a href="/admin" style={adminButton}>
              {copy.admin}
            </a>
          </div>

          <div style={heroExplainerBox}>
            <p style={heroBody}>{body}</p>
            {intro ? <p style={heroIntro}>{intro}</p> : null}
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
              /**
               * La tarjeta ENTERA es el botón, no un botón "ENTRAR" dentro de
               * ella. Catorce botones repetidos con la misma palabra era la
               * mitad del ruido de esta pantalla, y encima dejaba el área de
               * toque pequeña: ahora se pulsa la foto, el nombre o cualquier
               * hueco de la tarjeta.
               */
              <button
                type="button"
                key={profile.id}
                disabled={loggingInId !== null}
                style={{
                  ...playerCard,
                  animationDelay: `${index * 35}ms`,
                  opacity: loggingInId === profile.id ? 0.65 : 1,
                }}
                onClick={() => {
                  setLoggingInId(profile.id)
                  const loginId = Date.now()
                  const href = `/player/${encodeURIComponent(profile.id)}?login=${loginId}`

                  const proceed = () => {
                    window.history.pushState(null, '', href)
                    window.dispatchEvent(new CustomEvent('saga:navigate'))
                  }

                  window.navigator.geolocation.getCurrentPosition(
                    () => proceed(),
                    (err) => {
                      console.warn('GPS request at login failed or denied, proceeding anyway.', err)
                      proceed()
                    },
                    { timeout: 4000, enableHighAccuracy: false, maximumAge: 60000 }
                  )
                }}
              >
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
                        borderRadius: 'var(--theme-radius-avatar)',
                        display: 'block',
                      }}
                    />
                  ) : (
                    avatarInitials
                  )}
                </div>

                <div style={identity}>
                  <div style={playerName}>
                    {loggingInId === profile.id ? '⏳' : profile.display_name}
                  </div>
                  {/* La etiqueta sólo cuando dice algo: con catorce jugadores
                      en solo, catorce "SÓ" idénticos son ruido puro. En
                      equipo sí importa, porque cambia cómo se juega. */}
                  {isTeam ? (
                    <div style={identityBottom}>
                      <span style={modePill}>{copy.team}</span>
                      {meta ? <span style={playerMetaInline}>{meta}</span> : null}
                    </div>
                  ) : null}
                </div>

                <span style={chevron} aria-hidden="true">
                  ›
                </span>
              </button>
            )
          })}
        </section>
      </div>
    </main>
  )
}

const pageWrap: CSSProperties = {
  // ALTURA FIJA, no minHeight: hay un `body { overflow: hidden }` global (para
  // el mapa del jugador) que recorta cualquier contenido que sobresalga. Con
  // minHeight el contenedor crecía y la lista de jugadores quedaba cortada sin
  // poder deslizarse. Con altura fija el scroll ocurre DENTRO de este
  // contenedor, que sí puede desplazarse.
  height: '100dvh',
  maxHeight: '100dvh',
  position: 'relative',
  overflowX: 'hidden',
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
  overscrollBehavior: 'contain',
  background:
    'radial-gradient(circle at 50% 0%, var(--theme-tint-strong), transparent 34%), linear-gradient(180deg, var(--theme-bg) 0%, var(--theme-surface) 45%, var(--theme-bg) 100%)',
  color: '#ffffff',
  fontFamily: 'Inter, Segoe UI, system-ui, sans-serif',
}

const shellWrap: CSSProperties = {
  position: 'relative',
  zIndex: 1,
  width: 'min(100%, 390px)',
  margin: '0 auto',
  padding: 'calc(32px + env(safe-area-inset-top)) 20px calc(40px + env(safe-area-inset-bottom))',
  display: 'grid',
  gap: 14,
}

const backGlowTop: CSSProperties = {
  position: 'fixed',
  inset: '-180px auto auto 50%',
  width: 420,
  height: 420,
  transform: 'translateX(-50%)',
  borderRadius: 'var(--theme-radius-pill)',
  background: 'var(--theme-tint)',
  filter: 'blur(34px)',
  pointerEvents: 'none',
}

const backGlowBottom: CSSProperties = {
  position: 'fixed',
  inset: 'auto auto -240px 50%',
  width: 520,
  height: 520,
  transform: 'translateX(-50%)',
  borderRadius: 'var(--theme-radius-pill)',
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

/**
 * "Brasa": la portada NO es una tarjeta de cristal flotando sobre la foto.
 *
 * Antes el rótulo vivía dentro de un panel translúcido con borde, encima de
 * un velo que oscurecía la foto entera por igual: la foto no se veía y el
 * panel parecía un cuadro pegado. Ahora el título se apoya directamente
 * sobre la franja de foto de arriba -sin caja, sin borde, sin desenfoque- y
 * el velo (ver `fondoVelo`) deja esa franja clara y oscurece de la mitad
 * para abajo, que es donde va la lista y donde el texto tiene que leerse.
 */
const heroCard: CSSProperties = {
  padding: '2px 4px 18px',
  background: 'transparent',
  animation: 'sagaFadeIn 260ms ease-out',
}

const heroTopSpacer: CSSProperties = {
  minHeight: 30,
}

const heroTop: CSSProperties = {
  display: 'flex',
  // 'start', no 'center': el título tiene dos líneas y el botón una. Centrado,
  // "Admin" quedaba a media altura del rótulo en vez de arriba con él.
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
}

const heroTopTitle: CSSProperties = {
  display: 'grid',
  gap: 5,
  minWidth: 0,
}

const adminButton: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 28,
  padding: '0 11px',
  borderRadius: 'var(--theme-radius-pill)',
  border: '1px solid rgba(255,255,255,.16)',
  background: 'rgba(255,255,255,.10)',
  color: '#ffffff',
  fontSize: 11,
  fontWeight: 800,
  textDecoration: 'none',
}

// Alineado a la izquierda, no centrado: el rótulo se apoya sobre la franja
// de foto como un titular, no como un cartel. Centrado, con la foto detrás,
// quedaba flotando en medio de la nada.
/**
 * Sin margen de reserva arriba.
 *
 * Tenía 74-96px para dejar respirar una franja de foto de portada... que NO
 * EXISTE: `/login-fondo.jpg` devuelve 404 en producción (comprobado, no
 * supuesto). Resultado: un hueco muerto enorme sobre el título, exactamente
 * lo que Óscar señaló. La portada no puede reservar sitio para algo que a lo
 * mejor no está; si algún día se sube la foto, se ve igual detrás del
 * título, pero sin dejar el agujero cuando falta.
 */
const heroCenter: CSSProperties = {
  marginTop: 0,
  display: 'grid',
  justifyItems: 'start',
  textAlign: 'left',
  gap: 6,
}

// 27px, no 34-50: comparte fila con el botón "Admin". Un rótulo de 50px al
// lado de un botón de 28px de alto no es una fila, es un rótulo con algo
// pegado. A este tamaño los dos se leen como una cabecera.
const sagaWordmark: CSSProperties = {
  color: '#ffffff',
  fontSize: 'clamp(24px, 6.4vw, 30px)',
  lineHeight: 1,
  fontWeight: 1000,
  letterSpacing: '-0.045em',
}

// Del tema, no verde fijo: con el tema de fuego este subtítulo salía verde
// menta bajo un rótulo blanco sobre foto cálida, y cantaba.
const sagaWordmarkSub: CSSProperties = {
  color: 'var(--theme-primary)',
  fontSize: 9.5,
  lineHeight: 1,
  fontWeight: 1000,
  letterSpacing: '0.26em',
  textTransform: 'uppercase',
}

const heroTitle: CSSProperties = {
  margin: 0,
  fontSize: 'clamp(24px, 6.4vw, 30px)',
  lineHeight: 1,
  fontWeight: 1000,
  letterSpacing: '-0.045em',
  color: '#ffffff',
}

const heroSubtitle: CSSProperties = {
  margin: 0,
  color: 'var(--theme-primary)',
  fontSize: 9.5,
  letterSpacing: '0.26em',
  textTransform: 'uppercase',
  fontWeight: 1000,
}

// Filete del color del tema a la izquierda, sin caja: la caja completa
// competía con las tarjetas de jugador de abajo -dos recuadros seguidos-.
// Una línea basta para decir "esto es aparte del título".
const heroExplainerBox: CSSProperties = {
  marginTop: 10,
  width: '100%',
  maxWidth: 420,
  display: 'grid',
  gap: 7,
  paddingLeft: 11,
  borderLeft: '2px solid var(--theme-primary)',
  textAlign: 'left',
}

const heroBody: CSSProperties = {
  margin: 0,
  color: 'rgba(255,255,255,.88)',
  fontSize: 14,
  lineHeight: 1.45,
}

const heroIntro: CSSProperties = {
  margin: 0,
  color: 'rgba(226,255,236,.72)',
  fontSize: 12.5,
  lineHeight: 1.5,
}

/**
 * Foto de fondo de la portada.
 *
 * Va como capa fija por detrás de todo. Si el archivo no está, esto no se ve y
 * queda el degradado de siempre: la pantalla nunca depende de la foto.
 */
const fondoFoto: CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundImage: 'url(/login-fondo.jpg)',
  backgroundSize: 'cover',
  backgroundPosition: 'center 32%',
  pointerEvents: 'none',
}

/**
 * Velo sobre la foto: franja de arriba clara, resto casi opaco.
 *
 * Antes el velo era parejo -0.62 arriba, 0.44 al 30 %-: oscurecía la foto
 * entera lo justo para que no se viese bien, y aun así el texto de abajo
 * caía sobre trozos de cielo claro. Ahora la foto SE VE de verdad en la
 * franja de arriba, que es donde va el rótulo (texto blanco grande, se lee
 * igual), y de ahí para abajo cierra a casi negro para que la lista de
 * jugadores tenga fondo estable. Es lo que hace que la portada parezca una
 * cabecera con foto y no un cristal empañado.
 */
const fondoVelo: CSSProperties = {
  position: 'fixed',
  inset: 0,
  // Suave arriba (si algún día HAY foto, se ve) y opaco de la mitad para
  // abajo. Sin foto -que es el caso hoy: /login-fondo.jpg da 404- esto sólo
  // matiza el degradado de `pageWrap` y no deja ningún hueco raro.
  background:
    'linear-gradient(180deg, rgba(0,0,0,.28) 0%, rgba(0,0,0,.55) 30%, rgba(0,0,0,.88) 62%, rgba(0,0,0,.95) 100%)',
  pointerEvents: 'none',
}








const offlineDotOk: CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 'var(--theme-radius-pill)',
  background: '#22c55e',
  boxShadow: '0 0 0 4px rgba(34,197,94,.14)',
  flex: '0 0 auto',
}









const offlineVaultSuccess: CSSProperties = {
  padding: '8px 10px',
  borderRadius: 'var(--theme-radius-card)',
  background: 'rgba(34,197,94,.13)',
  color: '#dcfce7',
  fontSize: 11,
  fontWeight: 800,
}









const insecureLoginBanner: CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'start',
  padding: 12,
  borderRadius: 'var(--theme-radius-card)',
  background: 'rgba(239, 68, 68, 0.15)',
  border: '1px solid rgba(239, 68, 68, 0.3)',
  color: '#fca5a5',
  marginBottom: 16,
}

// Una columna. La rejilla de dos venía de cuando cada jugador era una
// tarjeta con caja: catorce cajas en vertical eran demasiado scroll. Sin
// cajas, una fila ocupa 58px y catorce caben en pantalla y media, leyéndose
// mucho mejor -y con la foto al tamaño en que se distingue una cara-.
const listBlock: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: 0,
  marginTop: 4,
}

/**
 * Fila, no tarjeta: se acabó el recuadro dentro del recuadro.
 *
 * Una foto ya es un rectángulo con su forma; meterla en una tarjeta con
 * borde y fondo propio la encierra en un segundo marco y ensucia toda la
 * pantalla -catorce veces-. Aquí no hay caja ninguna: foto, nombre, y una
 * línea finísima de separación. La fila entera sigue siendo el botón.
 */
const playerCard: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  width: '100%',
  padding: '9px 2px',
  border: 0,
  borderBottom: '0.5px solid rgba(255,255,255,.10)',
  borderRadius: 0,
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
  animation: 'sagaFadeIn 260ms ease-out',
  animationFillMode: 'both',
}

// Sin borde: el aro alrededor de la foto era otro marco más. La foto se
// sostiene sola.
const avatar: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 'var(--theme-radius-avatar)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(219,234,254,.92)',
  border: 0,
  color: '#ffffff',
  fontSize: 15,
  fontWeight: 900,
  overflow: 'hidden',
  flex: '0 0 auto',
}

const identity: CSSProperties = {
  display: 'grid',
  gap: 4,
  minWidth: 0,
  flex: 1,
}

// La flecha dice "esto se pulsa" sin gastar una palabra ni una caja.
const chevron: CSSProperties = {
  color: 'rgba(255,255,255,.34)',
  fontSize: 22,
  lineHeight: 1,
  flex: '0 0 auto',
  paddingRight: 2,
}

const playerName: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '100%',
  color: '#ffffff',
  fontSize: 16,
  lineHeight: 1.15,
  fontWeight: 900,
  letterSpacing: '-0.015em',
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
  borderRadius: 'var(--theme-radius-pill)',
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

// Ya no lo usa la lista -la tarjeta entera es el botón-, pero se queda: es
// el estilo del botón de la pantalla de clave de misión.
const enterButton: CSSProperties = {
  minHeight: 34,
  width: '100%',
  border: 0,
  borderRadius: 'var(--theme-radius-card)',
  // Del tema: es el boton mas pulsado de esta pantalla y con el tema de fuego
  // salia verde. Los otros dos verdes de aqui NO se tocan: el punto y el aviso
  // del paquete offline son senal de "listo", no color de marca.
  background: 'linear-gradient(180deg, var(--theme-primary), var(--theme-primary-hover))',
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
