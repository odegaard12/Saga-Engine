import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { entrarComoJugador, fetchPublicConfig } from '../shared/api'
import type { PlayerProfile, PublicConfig } from '../types/player'
import { getPlayerAvatarInitials, getPlayerAvatarUrl, getPlayerColor } from '../shared/playerIdentity'
import { cachePublicConfig, getCachedPublicConfig } from '../shared/offlinePublicConfig'
import { aplicarTema } from '../shared/tema'
import { registerPlayerServiceWorker } from '../player/offline/pwaShell'
import { getOfflineVaultSummary, type OfflineVaultSummary } from '../shared/offlineVault'
import { useTeclado } from '../shared/useTeclado'

type LoadState =
  | { status: 'idle' | 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; config: PublicConfig }

type LoginLocale = 'gl' | 'es' | 'en'

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
      brandKicker: 'Misión de campo',
      configError: 'Erro de configuración',
      mapboxLimitTitle: '⚠️ Límite de Mapbox',
      mapboxLimitText: 'Mapa premium activo. Límite: 200.000 cargas/mes.',
      pinTitle: 'O teu PIN',
      pinWrong: 'PIN incorrecto.',
      pinLocked: 'Demasiados intentos. Agarda uns minutos.',
      cancel: 'Cancelar',
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
      brandKicker: 'Field mission',
      configError: 'Configuration error',
      mapboxLimitTitle: '⚠️ Mapbox Quota Warning',
      mapboxLimitText: 'Premium map active. Limit: 200k loads/month.',
      pinTitle: 'Your PIN',
      pinWrong: 'Wrong PIN.',
      pinLocked: 'Too many attempts. Wait a few minutes.',
      cancel: 'Cancel',
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
    brandKicker: 'Misión de campo',
    configError: 'Error de configuración',
    mapboxLimitTitle: '⚠️ Límite de Mapbox',
    mapboxLimitText: 'Configurado mapa premium. Límite: 200.000 cargas/mes.',
    pinTitle: 'Tu PIN',
    pinWrong: 'PIN incorrecto.',
    pinLocked: 'Demasiados intentos. Espera unos minutos.',
    cancel: 'Cancelar',
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

/*
 * Aquí había `warmOfflineProfiles`: en CADA carga del login bajaba las catorce
 * misiones (unos 214 KB cada una, con las fotos dentro del JSON), el equipo y las
 * fotos de campo de todos los perfiles, y la aplicación entera, aunque el móvil
 * fuese a usar uno solo. Eran ~90 peticiones y unos 3 MB en segundo plano
 * cada vez que se abría el login.
 *
 * Ya no se baja nada desde aquí. La misión de cada jugador (y su app y su mapa)
 * se baja en la pantalla de carga al entrar como él, y «Prepararse» la revisa;
 * los otros jugadores que hayan usado este móvil se refrescan allí mismo, sólo
 * los que ya tienen paquete en él.
 */

export default function LoginApp() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [playerInput, setPlayerInput] = useState('')
  const [loggingInId, setLoggingInId] = useState<string | null>(null)
  // Fase 2 (auditoría 15/10): con PIN por jugador, tocar el nombre abre esto en vez de entrar.
  const [pinPara, setPinPara] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('pin')
  )
  const [pin, setPin] = useState('')
  // Un intento a la vez (revisión 23/10): Intro y el botón, o dos toques, mandaban el PIN dos veces y un PIN mal
  // escrito gastaba dos de los cinco intentos antes del bloqueo. El ref corta antes de que React repinte.
  const enviandoPinRef = useRef(false)
  const [enviandoPin, setEnviandoPin] = useState(false)
  const teclado = useTeclado()
  const [pinError, setPinError] = useState('')
  const [mapboxDrawerOpen, setMapboxDrawerOpen] = useState(false)
  const isSecure = typeof window !== 'undefined' ? window.isSecureContext : true

  useEffect(() => {
    let cancelled = false

    async function run() {
      setState({ status: 'loading' })
      // Registrar el worker no baja nada: la instalación es mínima.
      void registerPlayerServiceWorker()

      const vaultSummary = getOfflineVaultSummary()

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

  const cieloDeLaFoto = useColorDeArribaDeLaFoto(state.status === 'ready')

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
              <div style={sagaWordmarkSub}>Misión de campo</div>
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
              <div style={sagaWordmarkSub}>Misión de campo</div>
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

  function irAJugador(id: string) {
    setLoggingInId(id)
    const loginId = Date.now()
    const href = `/player/${encodeURIComponent(id)}?login=${loginId}`

    /**
     * SE ENTRA YA. El GPS se pide por detras.
     *
     * Antes esto esperaba a `getCurrentPosition` -hasta 4
     * segundos de espera permitida- ANTES de navegar: se pulsaba
     * un jugador y no pasaba nada durante un segundo largo, sin
     * nada en pantalla que dijera que se habia registrado el
     * toque. Y la espera ya no sirve para lo que servia: los
     * permisos se piden ahora en la pantalla de carga, que es
     * donde el jugador los ve y los concede.
     *
     * Se sigue disparando la peticion, pero sin esperarla: sirve
     * para que el navegador vaya calentando la posicion mientras
     * se monta la mision.
     */
    try {
      window.navigator.geolocation?.getCurrentPosition(
        () => {},
        () => {},
        { timeout: 4000, enableHighAccuracy: false, maximumAge: 60000 }
      )
    } catch {
      /* sin geolocalizacion tampoco pasa nada: se entra igual */
    }

    window.history.pushState(null, '', href)
    window.dispatchEvent(new CustomEvent('saga:navigate'))
  }

  /**
   * Cierra la hoja del PIN y quita `?pin=` de la dirección (revisión 23/10). Si se quedaba, recargar la portada,
   * o volver a ella con «atrás» desde la partida, abría otra vez el PIN de alguien que ya había cancelado o entrado.
   */
  function cerrarPin() {
    setPinPara(null)
    const params = new URLSearchParams(window.location.search)
    if (!params.has('pin')) return
    params.delete('pin')
    const resto = params.toString()
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${resto ? `?${resto}` : ''}`)
  }

  async function entrarConPin() {
    if (!pinPara || pin.length < 4 || enviandoPinRef.current) return
    enviandoPinRef.current = true
    setEnviandoPin(true)
    setPinError('')
    try {
      await entrarComoJugador(pinPara, pin)
    } catch (error) {
      const motivo = error instanceof Error ? error.message : ''
      // Sin red (TypeError): se entra igual (la sesión y el paquete que ya tenga el móvil sirven offline).
      const fallo =
        motivo === 'wrong-pin' ? copy.pinWrong
        : motivo === 'too-many-attempts' ? copy.pinLocked
        : error instanceof TypeError ? ''
        : copy.pinWrong
      if (fallo) {
        enviandoPinRef.current = false
        setEnviandoPin(false)
        return setPinError(fallo)
      }
    }
    const id = pinPara
    cerrarPin()
    irAJugador(id)
  }

  return (
    <main style={pageWrap}>
      <style>{loginAnimations}</style>
      <div style={cieloDeLaFoto ? { ...fondoFoto, backgroundColor: cieloDeLaFoto } : fondoFoto} />
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
                  // 55, no 35: con catorce jugadores, 35ms los enciende todos
                  // en menos de medio segundo y no da tiempo a leer la caida.
                  animationDelay: `${index * 55}ms`,
                  ...(loggingInId === profile.id
                    ? {
                        animation: 'sagaFilaEntrando 900ms ease-in-out infinite',
                        animationDelay: '0ms',
                        background: 'rgba(255,255,255,.07)',
                      }
                    : null),
                  // La que no es no se apaga del todo: apagarlas todas menos
                  // una hace parecer que la pantalla se ha colgado.
                  opacity: loggingInId && loggingInId !== profile.id ? 0.4 : 1,
                }}
                onClick={() => {
                  if (state.config.player_pins_required) {
                    setPin('')
                    setPinError('')
                    enviandoPinRef.current = false
                    setEnviandoPin(false)
                    setPinPara(profile.id)
                    return
                  }
                  irAJugador(profile.id)
                }}
              >
                <div
                  style={{
                    ...avatar,
                    background: profileColor,
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
      {pinPara ? (
        <div
          style={teclado ? { ...pinVelo, top: teclado.arriba, height: teclado.alto, bottom: 'auto' } : pinVelo}
          onClick={cerrarPin}
        >
          <form
            style={pinCaja}
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault()
              void entrarConPin()
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 16 }}>{copy.pinTitle}</div>
            <div style={{ fontSize: 13, opacity: 0.75 }}>
              {profiles.find((p) => p.id === pinPara)?.display_name || pinPara}
            </div>
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
              style={pinCampo}
              aria-label={copy.pinTitle}
            />
            {pinError ? <div style={{ fontSize: 13, color: '#fca5a5' }}>{pinError}</div> : null}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" style={pinBoton} onClick={cerrarPin}>
                {copy.cancel}
              </button>
              <button type="submit" style={{ ...pinBoton, background: 'var(--theme-primary)' }} disabled={pin.length < 4 || enviandoPin}>
                {copy.enter}
              </button>
            </div>
          </form>
        </div>
      ) : null}
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
  // 16/10: con la foto de portada ya servida, el subtítulo quedaba pegado a las letras con rabo del título.
  gap: 8,
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
  lineHeight: 1.12,
  textShadow: '0 1px 12px rgba(0,0,0,.35)',
  fontWeight: 1000,
  letterSpacing: '-0.045em',
}

// Del tema, no verde fijo: con el tema de fuego este subtítulo salía verde
// menta bajo un rótulo blanco sobre foto cálida, y cantaba.
// 17/10: sin mayúsculas espaciadas de 9,5 px (rótulo diminuto): la frase normal, a tamaño de leer.
const sagaWordmarkSub: CSSProperties = {
  color: 'var(--theme-primary)',
  fontSize: 13,
  lineHeight: 1.2,
  fontWeight: 900,
}

const heroTitle: CSSProperties = {
  margin: 0,
  fontSize: 'clamp(24px, 6.4vw, 30px)',
  lineHeight: 1.12,
  textShadow: '0 1px 12px rgba(0,0,0,.35)',
  fontWeight: 1000,
  letterSpacing: '-0.045em',
  color: '#ffffff',
}

const heroSubtitle: CSSProperties = {
  margin: 0,
  color: 'var(--theme-primary)',
  // 16/10: sobre la foto de portada (cielo claro) el azul no se leía y la sombra lo emborronaba: etiqueta
  // con fondo oscuro discreto, pegada a la izquierda.
  justifySelf: 'start',
  padding: '3px 7px',
  borderRadius: 6,
  background: 'rgba(3, 12, 22, .45)',
  fontSize: 13,
  fontWeight: 900,
}

// Sin caja (competía con las filas de jugador) y, desde el 17/10, sin filete a la izquierda: lo separa del
// título el espacio, no una raya.
const heroExplainerBox: CSSProperties = {
  marginTop: 12,
  width: '100%',
  maxWidth: 440,
  display: 'grid',
  gap: 6,
  textAlign: 'left',
}

// 17/10: la descripción iba a 12,5 px y en gris sobre la foto; en el móvil no se leía. A tamaño de texto y en
// blanco casi pleno.
const heroBody: CSSProperties = {
  margin: 0,
  color: '#ffffff',
  fontSize: 16,
  fontWeight: 700,
  lineHeight: 1.4,
}

const heroIntro: CSSProperties = {
  margin: 0,
  color: 'rgba(255,255,255,.9)',
  fontSize: 15,
  lineHeight: 1.45,
}

/**
 * El color del cielo de la foto (su franja de arriba), para la barra de estado del iPhone.
 *
 * 18/10/2026 (captura de Óscar): en la portada quedaba una franja de azul liso junto a la isla dinámica, encima
 * de la foto. Safari pinta esa zona con un color liso: el de `theme-color` o el del fondo que encuentra arriba, y
 * la foto (una imagen, sin color propio) no se lo daba, así que salía el azul del tema. Ahora se mide la foto al
 * cargar y su color de arriba va a `theme-color`, al fondo de la página y al de la capa de la foto: la barra se
 * funde con el cielo. Al salir de la portada se deja todo como estaba.
 */
function useColorDeArribaDeLaFoto(activo: boolean): string | null {
  const [color, setColor] = useState<string | null>(null)
  useEffect(() => {
    if (!activo) return undefined
    let vivo = true
    const img = new Image()
    img.onload = () => {
      if (!vivo || !img.naturalWidth) return
      try {
        const lienzo = document.createElement('canvas')
        lienzo.width = 32
        lienzo.height = 4
        const ctx = lienzo.getContext('2d')
        if (!ctx) return
        // La franja de arriba del recorte que se ve (la foto va centrada al 32 %; arriba del todo vale).
        ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight * 0.06, 0, 0, 32, 4)
        const px = ctx.getImageData(0, 0, 32, 4).data
        let r = 0
        let g = 0
        let b = 0
        for (let i = 0; i < px.length; i += 4) {
          r += px[i]
          g += px[i + 1]
          b += px[i + 2]
        }
        const n = px.length / 4
        // Con el velo de arriba (10 % del tono oscuro del tema) que lleva la foto encima: un pelín más oscuro.
        const k = 0.92
        setColor(`rgb(${Math.round((r / n) * k)}, ${Math.round((g / n) * k)}, ${Math.round((b / n) * k)})`)
      } catch {
        // Sin poder leerla: se queda como estaba.
      }
    }
    img.src = '/login-fondo.jpg'
    return () => {
      vivo = false
    }
  }, [activo])

  useEffect(() => {
    if (!color) return undefined
    const metas = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'))
    const antes = metas.map((m) => m.content)
    metas.forEach((m) => (m.content = color))
    const html = document.documentElement.style.backgroundColor
    const body = document.body.style.backgroundColor
    document.documentElement.style.backgroundColor = color
    document.body.style.backgroundColor = color
    return () => {
      metas.forEach((m, i) => (m.content = antes[i]))
      document.documentElement.style.backgroundColor = html
      document.body.style.backgroundColor = body
    }
  }, [color])
  return color
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
  // 5.59: del color del tema y mucho más suave. Cerraba a negro al 95 % para una foto que no existe y dejaba la
  // lista de jugadores casi negra en todos los temas («es muy oscuro el diseño»).
  background:
    'linear-gradient(180deg, rgba(var(--theme-ink-deep), .10) 0%, rgba(var(--theme-ink-deep), .22) 40%, rgba(var(--theme-ink-deep), .40) 100%)',
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
  // Sin raya entre filas (17/10): las separa el aire.
  padding: '8px 2px',
  border: 0,
  borderRadius: 0,
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
  /**
   * Caen, no aparecen.
   *
   * Ya habia escalonado (`animationDelay` por indice), pero la animacion era
   * `sagaFadeIn`: solo opacidad. Catorce nombres encendiendose casi a la vez
   * se leen como "salieron todos de golpe", que es justo lo que se veia. Con
   * un palmo de recorrido hacia abajo y el paso un poco mas largo, la lista
   * se lee CAYENDO: primero el de arriba, luego el siguiente.
   */
  animation: 'sagaFilaCae 320ms cubic-bezier(0.22, 1, 0.36, 1)',
  animationFillMode: 'both',
  // La respuesta al dedo tiene que ser instantanea aunque lo que venga
  // detras tarde: es lo unico que dice "te he oido".
  transition: 'transform 120ms ease-out, background 120ms ease-out',
}

// Sin borde: el aro alrededor de la foto era otro marco más. La foto se
// sostiene sola.
const avatar: CSSProperties = {
  width: 60,
  height: 60,
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

// Sin `flex: 1`: eso estiraba el bloque del nombre hasta el borde y empujaba
// la flecha al extremo, dejando un vacío enorme entre las dos cosas. Ahora el
// nombre ocupa lo que mide y la flecha va justo detrás; el hueco sobrante
// queda a la derecha de la fila, donde no molesta.
const identity: CSSProperties = {
  display: 'grid',
  gap: 4,
  minWidth: 0,
}

// La flecha dice "esto se pulsa" sin gastar una palabra ni una caja.
const chevron: CSSProperties = {
  color: 'rgba(255,255,255,.30)',
  fontSize: 22,
  lineHeight: 1,
  flex: '0 0 auto',
}

const playerName: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '100%',
  color: '#ffffff',
  fontSize: 20,
  lineHeight: 1.15,
  fontWeight: 900,
  letterSpacing: '-0.02em',
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
  fontSize: 11.5,
  fontWeight: 800,
}

const playerMetaInline: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: 'rgba(255,255,255,.85)',
  fontSize: 13,
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
  @keyframes sagaFilaCae {
    from { opacity: 0; transform: translateY(-12px); }
    to { opacity: 1; transform: translateY(0); }
  }
  /* Mientras se entra: la fila elegida late despacio, para que se vea que
     algo esta pasando aunque el mapa tarde en montarse. */
  @keyframes sagaFilaEntrando {
    0%, 100% { opacity: .58; }
    50% { opacity: .9; }
  }
`

const pinVelo: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 50,
  display: 'grid',
  placeItems: 'center',
  padding: 16,
  background: 'rgba(0, 0, 0, .55)',
}

const pinCaja: CSSProperties = {
  display: 'grid',
  gap: 10,
  width: 'min(320px, 100%)',
  padding: 18,
  borderRadius: 16,
  background: 'rgba(9, 15, 11, .96)', // no-tema: la misma tinta oscura del mapa
  color: '#ffffff',
  textAlign: 'center',
}

const pinCampo: CSSProperties = {
  fontSize: 28,
  letterSpacing: '0.4em',
  textAlign: 'center',
  padding: '10px 8px',
  borderRadius: 10,
  border: '1px solid rgba(255, 255, 255, .25)',
  background: 'rgba(255, 255, 255, .06)',
  color: '#ffffff',
}

const pinBoton: CSSProperties = {
  flex: 1,
  padding: '10px 8px',
  borderRadius: 10,
  border: 0,
  background: 'rgba(255, 255, 255, .12)',
  color: '#ffffff',
  font: 'inherit',
  fontWeight: 700,
}
