import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { isFirstRunForPlayer, markFirstRunCompleteForPlayer } from './utils/gpsStorage'
import { getPrewarmedGps, type SagaGpsCoords } from '../shared/gpsPrewarm'
import { saveInitialOfflinePack } from './autoOfflinePack'

type Coords = { lat: number; lon: number; accuracy?: number }
type Phase =
  | 'init'
  | 'first_run_ask'
  | 'gps_waiting'
  | 'gps_error'
  | 'loading'
  | 'route_hold'
  | 'context_out'
  | 'player_fly'
  | 'done'

interface Props {
  playerUser: string
  playerName: string
  payloadReady: boolean
  mapTilesReady: boolean
  onGpsReady: (coords: Coords | null) => void
  onIntroCameraStart: (coords: Coords | null) => void
  onDone: () => void
}

export const GPS_KEY = 'saga_gps_granted'
export const FIRST_RUN_KEY = 'saga_first_run_done'
export function markFirstRunDone() {}
export function shouldShowFirstRun() { return true }
export function isReturningPlayer() { return false }

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

function isGoodGps(coords: SagaGpsCoords | null): coords is SagaGpsCoords {
  if (!coords) return false

  // Si el navegador informa precisión enorme, normalmente es IP/WiFi aproximado.
  // No queremos iniciar cinemática a Madrid con un GPS falso.
  if (typeof coords.accuracy === 'number' && coords.accuracy > 2500) return false

  return true
}

export default function FirstRunGate({
  playerUser,
  playerName,
  payloadReady,
  mapTilesReady,
  onGpsReady,
  onIntroCameraStart,
  onDone,
}: Props) {
  const [phase, setPhase] = useState<Phase>('init')
  const [gpsError, setGpsError] = useState('')
  const [gpsCoords, setGpsCoords] = useState<Coords | null>(null)
  const firstRunRef = useRef<boolean | null>(null)
  const startedRef = useRef(false)
  const doneRef = useRef(false)

  useEffect(() => {
    if (firstRunRef.current !== null) return

    const firstRun = isFirstRunForPlayer(playerUser)
    firstRunRef.current = firstRun

    if (firstRun) {
      setPhase('first_run_ask')
    } else {
      void requestGpsThenLoad()
    }
  }, [playerUser])

  async function requestGpsThenLoad() {
    if (startedRef.current) return
    startedRef.current = true

    setGpsError('')
    setPhase('gps_waiting')

    const coords = await getPrewarmedGps()
    const accuracy =
      coords && typeof coords.accuracy === 'number'
        ? coords.accuracy
        : null

    if (!isGoodGps(coords)) {
      startedRef.current = false
      setGpsCoords(null)
      setGpsError(
        accuracy !== null
          ? `GPS impreciso (${Math.round(accuracy)} m). Activa ubicación precisa o prueba desde el móvil.`
          : 'No se pudo activar GPS. Permite ubicación en el navegador.'
      )
      setPhase('gps_error')
      return
    }

    const goodCoords = {
      lat: coords.lat,
      lon: coords.lon,
      accuracy: coords.accuracy,
    }

    setGpsCoords(goodCoords)
    onGpsReady(goodCoords)
    setPhase('loading')
  }

  useEffect(() => {
    if (phase !== 'loading') return
    if (!payloadReady || !mapTilesReady || !gpsCoords) return

    let cancelled = false

    async function run() {
      markFirstRunCompleteForPlayer(playerUser)

      // Preparar misión offline antes de la cinemática:
      // shell + payload + progreso local quedan listos para cortes de cobertura.
      await saveInitialOfflinePack(playerUser).catch((error) => {
        console.warn('SAGA offline preload failed', error)
      })

      // Ahora sí: la cámara solo arranca con GPS válido y pack offline intentado.
      onIntroCameraStart(gpsCoords)

      setPhase('route_hold')
      await sleep(3000)
      if (cancelled) return

      setPhase('context_out')
      await sleep(2500)
      if (cancelled) return

      setPhase('player_fly')
      await sleep(4300)
      if (cancelled || doneRef.current) return

      doneRef.current = true
      setPhase('done')
      onDone()
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [
    phase,
    payloadReady,
    mapTilesReady,
    gpsCoords,
    playerUser,
    onIntroCameraStart,
    onDone,
  ])

  if (phase === 'done') return null
  if (phase === 'init') return <div style={blackout} />

  if (phase === 'first_run_ask') {
    return (
      <div style={askOverlay}>
        <div style={askPanel}>
          <div style={kicker}>SAGA ENGINE</div>
          <div style={title}>INICIAR OPERATIVO</div>
          <div style={subtitle}>{playerName}</div>
          <p style={body}>
            Activaremos GPS, cargaremos la misión y abriremos la ruta de operación.
          </p>
          <button type="button" style={primaryButton} onClick={() => void requestGpsThenLoad()}>
            ACTIVAR GPS E INICIAR →
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'gps_waiting') {
    return (
      <div style={loadingOverlay}>
        <div style={loadingPanel}>
          <div style={scanLine} />
          <div style={smallKicker}>SAGA ENGINE</div>
          <div style={loadingTitle}>ACTIVANDO GPS</div>
          <div style={loadingText}>
            Esperando ubicación precisa del navegador. La cinemática empezará cuando el GPS esté listo.
          </div>
          <div style={pulseRow}>
            <span style={{ ...pulseDot, animationDelay: '0ms' }} />
            <span style={{ ...pulseDot, animationDelay: '140ms' }} />
            <span style={{ ...pulseDot, animationDelay: '280ms' }} />
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'gps_error') {
    return (
      <div style={askOverlay}>
        <div style={askPanel}>
          <div style={kicker}>SAGA ENGINE</div>
          <div style={title}>GPS NECESARIO</div>
          <div style={subtitle}>{playerName}</div>
          <p style={body}>{gpsError}</p>
          <button type="button" style={primaryButton} onClick={() => void requestGpsThenLoad()}>
            REINTENTAR GPS →
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'loading') {
    return (
      <div style={loadingOverlay}>
        <div style={loadingPanel}>
          <div style={scanLine} />
          <div style={smallKicker}>SAGA ENGINE</div>
          <div style={loadingTitle}>CARGANDO MISIÓN</div>
          <div style={loadingText}>
            GPS activo · {payloadReady ? 'Misión lista' : 'Descargando misión'} ·{' '}
            {mapTilesReady ? 'Mapa listo' : 'Preparando mapa'}
          </div>
          <div style={pulseRow}>
            <span style={{ ...pulseDot, animationDelay: '0ms' }} />
            <span style={{ ...pulseDot, animationDelay: '140ms' }} />
            <span style={{ ...pulseDot, animationDelay: '280ms' }} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={cinematicOverlay}>
      <div style={topShade} />
      <div style={bottomShade} />
    </div>
  )
}

const blackout: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 2000,
  background: '#050a0d',
}

const askOverlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 2000,
  background:
    'radial-gradient(circle at 50% 30%, rgba(0,200,150,.18), transparent 34%), #050a0d',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 22,
}

const askPanel: CSSProperties = {
  width: 'min(100%, 390px)',
  borderRadius: 26,
  padding: '30px 26px',
  background: 'rgba(9,15,19,.94)',
  border: '1px solid rgba(0,200,150,.24)',
  boxShadow: '0 28px 90px rgba(0,0,0,.62), inset 0 1px 0 rgba(255,255,255,.06)',
  textAlign: 'center',
  fontFamily: 'system-ui, sans-serif',
}

const kicker: CSSProperties = {
  fontSize: 11,
  letterSpacing: '.28em',
  color: 'rgba(0,200,150,.86)',
  fontWeight: 800,
  marginBottom: 12,
}

const title: CSSProperties = {
  fontSize: 25,
  lineHeight: 1.05,
  letterSpacing: '.05em',
  color: '#f4fbff',
  fontWeight: 900,
}

const subtitle: CSSProperties = {
  marginTop: 8,
  fontSize: 14,
  color: 'rgba(230,244,250,.68)',
  fontWeight: 700,
}

const body: CSSProperties = {
  margin: '18px auto 22px',
  maxWidth: 310,
  fontSize: 13,
  lineHeight: 1.65,
  color: 'rgba(210,225,232,.68)',
}

const primaryButton: CSSProperties = {
  width: '100%',
  minHeight: 50,
  borderRadius: 15,
  border: 0,
  background: 'linear-gradient(135deg, #00e0a4, #6efacc)',
  color: '#04100d',
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: '.12em',
  cursor: 'pointer',
  boxShadow: '0 14px 36px rgba(0,200,150,.28)',
}

const loadingOverlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 2000,
  background:
    'radial-gradient(circle at 50% 42%, rgba(0,200,150,.16), transparent 32%), linear-gradient(180deg, #050a0d, #071216)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 22,
}

const loadingPanel: CSSProperties = {
  width: 'min(100%, 360px)',
  minHeight: 190,
  position: 'relative',
  overflow: 'hidden',
  borderRadius: 24,
  padding: '30px 24px',
  background: 'rgba(8,14,18,.78)',
  border: '1px solid rgba(0,200,150,.18)',
  boxShadow: '0 24px 70px rgba(0,0,0,.48)',
  textAlign: 'center',
  fontFamily: 'system-ui, sans-serif',
}

const scanLine: CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  height: 2,
  background: 'linear-gradient(90deg, transparent, rgba(0,224,164,.95), transparent)',
  animation: 'saga-scan 1.4s linear infinite',
}

const smallKicker: CSSProperties = {
  fontSize: 10,
  letterSpacing: '.30em',
  color: 'rgba(0,200,150,.72)',
  fontWeight: 900,
  marginBottom: 12,
}

const loadingTitle: CSSProperties = {
  fontSize: 20,
  color: '#f4fbff',
  fontWeight: 900,
  letterSpacing: '.08em',
}

const loadingText: CSSProperties = {
  marginTop: 14,
  fontSize: 12,
  lineHeight: 1.6,
  color: 'rgba(210,225,232,.62)',
}

const pulseRow: CSSProperties = {
  marginTop: 22,
  display: 'flex',
  justifyContent: 'center',
  gap: 8,
}

const pulseDot: CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: '50%',
  background: '#00e0a4',
  boxShadow: '0 0 14px rgba(0,224,164,.85)',
  animation: 'saga-pulse 900ms ease-in-out infinite',
}

const cinematicOverlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 2000,
  pointerEvents: 'none',
  background: 'transparent',
}

const topShade: CSSProperties = {
  position: 'fixed',
  left: 0,
  right: 0,
  top: 0,
  height: 170,
  background: 'linear-gradient(180deg, rgba(5,10,13,.92), rgba(5,10,13,.52), transparent)',
}

const bottomShade: CSSProperties = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  height: 220,
  background: 'linear-gradient(0deg, rgba(5,10,13,.92), rgba(5,10,13,.46), transparent)',
}

const cinematicBadge: CSSProperties = {
  position: 'fixed',
  left: '50%',
  bottom: 28,
  transform: 'translateX(-50%)',
  padding: '10px 14px',
  borderRadius: 999,
  background: 'rgba(5,10,13,.62)',
  border: '1px solid rgba(255,255,255,.10)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  display: 'none',
  alignItems: 'center',
  gap: 8,
  color: 'rgba(244,251,255,.86)',
  fontFamily: 'system-ui, sans-serif',
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: '.18em',
  whiteSpace: 'nowrap',
}

const badgeDot: CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: '50%',
  background: '#00e0a4',
  boxShadow: '0 0 12px rgba(0,224,164,.90)',
}
