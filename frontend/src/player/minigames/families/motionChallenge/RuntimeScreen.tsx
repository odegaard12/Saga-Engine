import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import type { PlayerStage } from '../../../../types/player'
import type { ResolvedMotionChallengeMinigame } from '../../core/resolver'

interface Props {
  resolved: ResolvedMotionChallengeMinigame
  stage: PlayerStage
  helperText: string
  submitting: boolean
  onWin: () => Promise<void>
}

type RuntimePhase = 'ready' | 'active' | 'fallback' | 'success' | 'failed'

type SagaDeviceMotionEvent = Event & {
  acceleration?: { x: number | null; y: number | null; z: number | null } | null
  accelerationIncludingGravity?: { x: number | null; y: number | null; z: number | null } | null
}

const STYLES = `
.motion-shell {
  overflow: hidden;
  border-radius: 26px;
  border: 1px solid rgba(255,255,255,.12);
  background:
    radial-gradient(circle at 22% 8%, rgba(163,230,53,.10), transparent 34%),
    radial-gradient(circle at 82% 12%, rgba(245,158,11,.07), transparent 30%),
    linear-gradient(180deg, rgba(13,18,27,.98), rgba(3,7,18,.99));
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.08),
    0 18px 44px rgba(2,6,23,.24);
  color: #f8fafc;
}

.motion-topbar,
.motion-bottombar {
  min-height: 44px;
  padding: 0 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  background: rgba(255,255,255,.045);
}

.motion-topbar {
  border-bottom: 1px solid rgba(255,255,255,.075);
}

.motion-bottombar {
  border-top: 1px solid rgba(255,255,255,.075);
}

.motion-chip {
  min-height: 25px;
  padding: 0 9px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(255,255,255,.065);
  border: 1px solid rgba(255,255,255,.08);
  color: rgba(226,232,240,.84);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .10em;
  text-transform: uppercase;
}

.motion-chip.ok {
  color: #bef264;
  border-color: rgba(190,242,100,.20);
  background: rgba(132,204,22,.10);
}

.motion-body {
  padding: 14px;
  display: grid;
  gap: 12px;
}

.motion-heading {
  display: grid;
  gap: 4px;
}

.motion-overline {
  color: #a3e635;
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .15em;
  text-transform: uppercase;
}

.motion-title {
  margin: 0;
  font-size: clamp(24px, 7vw, 34px);
  line-height: 1;
  font-weight: 950;
  letter-spacing: -.045em;
}

.motion-brief {
  color: rgba(226,232,240,.72);
  font-size: 12px;
  line-height: 1.32;
}

.motion-arena {
  position: relative;
  min-height: 178px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 24px;
  border: 1px solid rgba(255,255,255,.08);
  background:
    radial-gradient(circle at 50% 65%, rgba(132,204,22,.16), transparent 42%),
    linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.02));
}

.motion-radar {
  position: absolute;
  width: 180px;
  height: 180px;
  border-radius: 999px;
  border: 1px solid rgba(190,242,100,.13);
  opacity: .7;
}

.motion-radar::before,
.motion-radar::after {
  content: "";
  position: absolute;
  inset: 28px;
  border-radius: inherit;
  border: 1px solid rgba(190,242,100,.10);
}

.motion-radar::after {
  inset: 56px;
}

.motion-arena.is-running .motion-radar {
  animation: sagaRadarSpin 7s linear infinite;
}

.motion-ping {
  position: absolute;
  width: 74px;
  height: 74px;
  border-radius: 999px;
  border: 1px solid rgba(190,242,100,.32);
  opacity: 0;
}

.motion-arena.is-running .motion-ping.one {
  animation: sagaPulse 1.8s ease-out infinite;
}

.motion-arena.is-running .motion-ping.two {
  animation: sagaPulse 1.8s ease-out .6s infinite;
}

.motion-arena.is-running .motion-ping.three {
  animation: sagaPulse 1.8s ease-out 1.2s infinite;
}

.motion-beacon {
  position: relative;
  z-index: 3;
  width: 104px;
  height: 112px;
  display: grid;
  place-items: center;
  border-radius: 28px;
  background:
    linear-gradient(180deg, rgba(248,250,252,.10), rgba(248,250,252,.035));
  border: 1px solid rgba(255,255,255,.14);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.10),
    0 20px 38px rgba(0,0,0,.28);
}

.motion-beacon::before {
  content: "";
  position: absolute;
  top: 15px;
  width: 12px;
  height: 62px;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(190,242,100,.18), rgba(190,242,100,.88));
  box-shadow: 0 0 28px rgba(190,242,100,.36);
  opacity: var(--core-opacity);
}

.motion-beacon::after {
  content: "";
  position: absolute;
  bottom: 16px;
  width: 58px;
  height: 18px;
  border-radius: 999px;
  background: rgba(255,255,255,.07);
  border: 1px solid rgba(255,255,255,.08);
}

.motion-beacon.is-running {
  animation: sagaBeaconFloat 1.1s ease-in-out infinite;
}

.motion-beacon strong {
  position: relative;
  z-index: 2;
  font-size: 38px;
  filter: drop-shadow(0 0 12px rgba(190,242,100,.28));
}

.motion-status {
  text-align: center;
  display: grid;
  gap: 3px;
}

.motion-status strong {
  font-size: 18px;
  line-height: 1.12;
  letter-spacing: -.02em;
}

.motion-status span {
  color: rgba(226,232,240,.68);
  font-size: 12px;
  line-height: 1.32;
}

.motion-meters {
  display: grid;
  gap: 10px;
}

.motion-meter {
  display: grid;
  gap: 5px;
}

.motion-meter-label {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: rgba(226,232,240,.78);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .05em;
  text-transform: uppercase;
}

.motion-bar {
  height: 13px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255,255,255,.075);
  border: 1px solid rgba(255,255,255,.075);
}

.motion-fill {
  height: 100%;
  width: var(--fill);
  border-radius: inherit;
  background: linear-gradient(90deg, #f8fafc, #a3e635, #22c55e);
  transition: width 180ms ease;
}

.motion-fill.heat {
  background: linear-gradient(90deg, #22c55e, #facc15, #fb923c, #ef4444);
}

.motion-rules {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}

.motion-rule {
  min-height: 66px;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,.075);
  background: rgba(255,255,255,.04);
  padding: 9px;
  display: grid;
  align-content: start;
  gap: 4px;
}

.motion-rule b {
  color: #f8fafc;
  font-size: 11px;
  line-height: 1.1;
}

.motion-rule span {
  color: rgba(226,232,240,.58);
  font-size: 10px;
  line-height: 1.25;
}

.motion-pulsebox {
  border-radius: 18px;
  border: 1px solid rgba(190,242,100,.13);
  background: rgba(132,204,22,.07);
  padding: 10px 11px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.motion-pulsebox b {
  color: #bef264;
  font-size: 22px;
  line-height: 1;
}

.motion-pulsebox span {
  color: rgba(226,232,240,.66);
  font-size: 11px;
  font-weight: 800;
}

.motion-button {
  min-height: 48px;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,.12);
  background: linear-gradient(180deg, #e5e7eb, #cbd5e1);
  color: #020617;
  font-size: 13px;
  font-weight: 950;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.motion-button.secondary {
  background: rgba(255,255,255,.07);
  color: #f8fafc;
}

.motion-button.danger {
  background: #fb923c;
  color: #1c0702;
}

.motion-button.success {
  background: linear-gradient(180deg, #bef264, #22c55e);
  color: #052e16;
}

.motion-button:disabled {
  opacity: .58;
}

.motion-actions {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.motion-actions.only {
  grid-template-columns: minmax(0, 1fr);
}

.motion-debug {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.motion-debug button {
  min-height: 32px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.12);
  background: rgba(255,255,255,.06);
  color: #e2e8f0;
  font-size: 11px;
  font-weight: 800;
}

@keyframes sagaPulse {
  0% { transform: scale(.72); opacity: .36; }
  100% { transform: scale(2.8); opacity: 0; }
}

@keyframes sagaBeaconFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
}

@keyframes sagaRadarSpin {
  to { transform: rotate(360deg); }
}

@media (max-width: 430px) {
  .motion-body { padding: 13px; }
  .motion-rules { gap: 6px; }
  .motion-rule { padding: 8px; }
}
`

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function getMotionMagnitude(event: SagaDeviceMotionEvent): number | null {
  const reading = event.accelerationIncludingGravity || event.acceleration
  const x = reading?.x
  const y = reading?.y
  const z = reading?.z
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return null
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null
  return Math.sqrt(x * x + y * y + z * z)
}

async function requestMotionPermission(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  const ctor = (window as unknown as {
    DeviceMotionEvent?: { requestPermission?: () => Promise<'granted' | 'denied'> }
  }).DeviceMotionEvent

  if (typeof ctor?.requestPermission === 'function') {
    const result = await ctor.requestPermission()
    return result === 'granted'
  }

  return 'DeviceMotionEvent' in window || 'ondevicemotion' in window
}

function hasDebugMotion(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  return params.get('debug_motion') === '1' || params.get('debug') === '1'
}

export function MotionChallengeRuntimeScreen({
  resolved,
  stage,
  helperText,
  submitting,
  onWin,
}: Props) {
  const cfg = resolved.config
  const debug = hasDebugMotion()
  const allowFallback = cfg.allow_touch_fallback !== false

  const targetPulses = 16
  const timeLimitMs = Number(cfg.time_limit_ms || 45000)
  const pulseThreshold = 2.75
  const strongThreshold = 8.3
  const minPulseGapMs = 520

  const [phase, setPhase] = useState<RuntimePhase>('ready')
  const [energy, setEnergy] = useState(0)
  const [heat, setHeat] = useState(0)
  const [validPulses, setValidPulses] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(timeLimitMs / 1000))
  const [message, setMessage] = useState('Pulsa iniciar. Quieto no carga.')
  const [sensorDenied, setSensorDenied] = useState(false)

  const phaseRef = useRef<RuntimePhase>('ready')
  const baselineRef = useRef(9.81)
  const lastMagnitudeRef = useRef<number | null>(null)
  const sampleCountRef = useRef(0)
  const lastPulseAtRef = useRef(0)
  const startedAtRef = useRef(0)
  const completedRef = useRef(false)

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  const reset = useCallback(() => {
    completedRef.current = false
    baselineRef.current = 9.81
    lastMagnitudeRef.current = null
    sampleCountRef.current = 0
    lastPulseAtRef.current = 0
    startedAtRef.current = performance.now()
    setEnergy(0)
    setHeat(0)
    setValidPulses(0)
    setSecondsLeft(Math.ceil(timeLimitMs / 1000))
    setSensorDenied(false)
    setMessage('Pulsa iniciar. Quieto no carga.')
    setPhase('ready')
  }, [timeLimitMs])

  const markComplete = useCallback(() => {
    if (completedRef.current) return
    completedRef.current = true
    setEnergy(100)
    setPhase('success')
    setMessage('Nodo completado. Pulsa continuar.')
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.([18, 24, 50])
  }, [])

  const continueRoute = useCallback(async () => {
    if (submitting) return
    await onWin()
  }, [onWin, submitting])

  const registerPulse = useCallback((kind: 'good' | 'strong' | 'touch') => {
    if (kind === 'strong') {
      setEnergy((value) => clamp(value + 3, 0, 100))
      setHeat((value) => {
        const next = clamp(value + 16, 0, 100)
        if (next >= 100) {
          setPhase('failed')
          setMessage('Sobrecarga. Pulsa más suave.')
        }
        return next
      })
      setMessage('Demasiado fuerte. Carga poco.')
      return
    }

    setValidPulses((value) => {
      const nextPulses = value + 1
      setEnergy((energyValue) => {
        const nextEnergy = clamp(energyValue + (kind === 'touch' ? 6 : 8), 0, 100)
        if (nextPulses >= targetPulses && nextEnergy >= 100) markComplete()
        return nextEnergy
      })
      return nextPulses
    })

    setHeat((value) => clamp(value + (kind === 'touch' ? 1 : 2), 0, 100))
    setMessage(kind === 'touch' ? 'Toque válido.' : 'Pulso válido.')
  }, [markComplete])

  const startMotion = useCallback(async () => {
    reset()
    const allowed = await requestMotionPermission().catch(() => false)
    if (!allowed) {
      setSensorDenied(true)
      if (allowFallback) {
        setPhase('fallback')
        setMessage('Sensor no disponible. Usa táctil.')
        return
      }
      setPhase('failed')
      setMessage('Sensor no disponible.')
      return
    }

    startedAtRef.current = performance.now()
    setPhase('active')
    setMessage('Pulsa el móvil en movimientos cortos y separados.')
  }, [allowFallback, reset])

  const startFallback = useCallback(() => {
    reset()
    startedAtRef.current = performance.now()
    setPhase('fallback')
    setMessage('Modo táctil. Toca con ritmo.')
  }, [reset])

  useEffect(() => {
    if (phase !== 'active') return

    const handleMotion = (event: Event) => {
      const magnitude = getMotionMagnitude(event as SagaDeviceMotionEvent)
      if (magnitude === null) return

      if (sampleCountRef.current < 24) {
        sampleCountRef.current += 1
        baselineRef.current = baselineRef.current * 0.88 + magnitude * 0.12
        lastMagnitudeRef.current = magnitude
        return
      }

      const previous = lastMagnitudeRef.current ?? magnitude
      lastMagnitudeRef.current = magnitude

      const delta = Math.abs(magnitude - previous)
      const displacement = Math.abs(magnitude - baselineRef.current)
      const score = Math.max(delta * 1.45, displacement)

      if (score < pulseThreshold) return

      const now = performance.now()
      const gap = now - lastPulseAtRef.current

      if (gap < minPulseGapMs) {
        setHeat((value) => clamp(value + 8, 0, 100))
        setMessage('Muy seguido. Separa los pulsos.')
        return
      }

      lastPulseAtRef.current = now

      if (score > strongThreshold) {
        registerPulse('strong')
        return
      }

      registerPulse('good')
    }

    window.addEventListener('devicemotion', handleMotion, { passive: true })
    return () => window.removeEventListener('devicemotion', handleMotion)
  }, [phase, registerPulse])

  useEffect(() => {
    if (phase !== 'active' && phase !== 'fallback') return

    const timer = window.setInterval(() => {
      const elapsed = performance.now() - startedAtRef.current
      setSecondsLeft(Math.max(0, Math.ceil((timeLimitMs - elapsed) / 1000)))
      setHeat((value) => clamp(value - 1.0, 0, 100))

      if (elapsed >= timeLimitMs && phaseRef.current !== 'success') {
        setPhase('failed')
        setMessage('Tiempo agotado. Faltaron pulsos válidos.')
      }
    }, 500)

    return () => window.clearInterval(timer)
  }, [phase, timeLimitMs])

  const title = stage.title || 'Cargar antena'
  const text = String(stage.content || helperText || '').trim()
  const brief =
    text && !text.toLowerCase().includes('punto marcado')
      ? text
      : 'Baliza sin señal. Cárgala con pulsos para abrir el siguiente tramo.'

  const energyStyle = { '--fill': `${Math.round(clamp(energy, 0, 100))}%` } as CSSProperties
  const heatStyle = { '--fill': `${Math.round(clamp(heat, 0, 100))}%` } as CSSProperties
  const coreStyle = { '--core-opacity': String(0.25 + clamp(energy / 100, 0, 1) * 0.75) } as CSSProperties

  const running = phase === 'active' || phase === 'fallback'
  const actionClass = phase === 'success' || phase === 'ready' || phase === 'failed' ? 'motion-actions only' : 'motion-actions'

  return (
    <section className="motion-shell" aria-label="Cargar antena">
      <style>{STYLES}</style>

      <div className="motion-topbar">
        <span className="motion-chip">SAGA LINK</span>
        <span className={phase === 'success' ? 'motion-chip ok' : 'motion-chip'}>{phase === 'success' ? 'OK' : `${secondsLeft}s`}</span>
      </div>

      <div className="motion-body">
        <div className="motion-heading">
          <div className="motion-overline">Interacción</div>
          <h2 className="motion-title">{title}</h2>
          <div className="motion-brief">{brief}</div>
        </div>

        <div className={['motion-arena', running ? 'is-running' : ''].filter(Boolean).join(' ')}>
          <div className="motion-radar" />
          <div className="motion-ping one" />
          <div className="motion-ping two" />
          <div className="motion-ping three" />
          <div className={['motion-beacon', running ? 'is-running' : ''].filter(Boolean).join(' ')} style={coreStyle}>
            <strong>{phase === 'success' ? '✓' : '⚡'}</strong>
          </div>
        </div>

        <div className="motion-status">
          <strong>
            {phase === 'success'
              ? 'Nodo completado'
              : phase === 'failed'
                ? 'Carga fallida'
                : phase === 'fallback'
                  ? 'Modo táctil'
                  : phase === 'active'
                    ? 'Cargando'
                    : sensorDenied
                      ? 'Sensor no disponible'
                      : 'Preparado'}
          </strong>
          <span>{message}</span>
        </div>

        <div className="motion-meters">
          <div className="motion-meter">
            <div className="motion-meter-label">
              <span>Carga</span>
              <b>{Math.round(energy)}%</b>
            </div>
            <div className="motion-bar">
              <div className="motion-fill" style={energyStyle} />
            </div>
          </div>

          <div className="motion-meter">
            <div className="motion-meter-label">
              <span>Calor</span>
              <b>{Math.round(heat)}%</b>
            </div>
            <div className="motion-bar">
              <div className="motion-fill heat" style={heatStyle} />
            </div>
          </div>
        </div>

        <div className="motion-pulsebox">
          <span>Pulsos válidos</span>
          <b>{Math.min(validPulses, targetPulses)} / {targetPulses}</b>
        </div>

        {phase !== 'success' ? (
          <div className="motion-rules">
            <div className="motion-rule">
              <b>Pulsos cortos</b>
              <span>Golpes breves.</span>
            </div>
            <div className="motion-rule">
              <b>Medio segundo</b>
              <span>Pausa entre pulsos.</span>
            </div>
            <div className="motion-rule">
              <b>Quieto no carga</b>
              <span>No hay energía.</span>
            </div>
          </div>
        ) : null}

        {debug ? (
          <div className="motion-debug">
            <button type="button" onClick={() => registerPulse('good')}>debug pulso</button>
            <button type="button" onClick={() => registerPulse('strong')}>debug fuerte</button>
            <button type="button" onClick={markComplete}>debug completar</button>
          </div>
        ) : null}
      </div>

      <div className="motion-bottombar">
        <div className={actionClass}>
          {phase === 'success' ? (
            <button type="button" className="motion-button success" onClick={() => void continueRoute()} disabled={submitting}>
              {submitting ? 'Guardando…' : 'Continuar'}
            </button>
          ) : phase === 'ready' || phase === 'failed' ? (
            <button type="button" className={phase === 'failed' ? 'motion-button danger' : 'motion-button'} onClick={() => void startMotion()} disabled={submitting}>
              {phase === 'failed' ? 'Reintentar' : 'Iniciar'}
            </button>
          ) : phase === 'active' ? (
            <button type="button" className="motion-button secondary" onClick={reset} disabled={submitting}>
              Reiniciar
            </button>
          ) : null}

          {allowFallback && phase !== 'success' ? (
            <button
              type="button"
              className="motion-button secondary"
              onClick={phase === 'fallback' ? () => registerPulse('touch') : startFallback}
              disabled={submitting}
            >
              {phase === 'fallback' ? 'Tocar' : 'Táctil'}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  )
}

export default MotionChallengeRuntimeScreen
