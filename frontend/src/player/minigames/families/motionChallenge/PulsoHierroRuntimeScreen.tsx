import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PlayerStage } from '../../../../types/player'
import type { ResolvedMotionChallengeMinigame } from '../../core/resolver'
import { useI18n } from '../../../../i18n/useI18n'
import { useRegenerarAoOcultar } from '../../core/useRegenerarAoOcultar'
import { haptics, sounds } from '../../../utils/haptics'
import { avisarPeticionDePermisoPropia } from '../../../utils/permissionPromptGuard'

interface Props {
  resolved: ResolvedMotionChallengeMinigame
  stage: PlayerStage
  helperText: string
  submitting: boolean
  onWin: () => Promise<void>
}

/**
 * "Pulso de hierro" (owner-approved): reto de dos manos a la vez, cada una
 * con su propio sensor/entrada -es lo que lo hace de verdad más difícil que
 * el resto del catálogo, no solo un número más alto-.
 *
 * - Una mano SUJETA el móvil lo más quieto posible: se mide la varianza del
 *   acelerómetro en una ventana deslizante y tiene que quedarse por debajo
 *   de `pulso_stability_variance_max`. Es motionChallenge invertido -aquí
 *   la quietud es el objetivo, no el movimiento (ver RuntimeScreen.tsx de
 *   esta misma familia)-.
 * - La otra mano repite una secuencia de colores tipo Simón Dice
 *   (sequenceCode/SimonRuntimeScreen.tsx, adaptada) que crece cada ronda.
 *
 * Los dos streams corren A LA VEZ y todo el rato, no solo durante una fase:
 * si la quietud se rompe en cualquier momento -incluso mientras se observa
 * la secuencia-, se reinicia SOLO la ronda de toques en curso (el jugador
 * vuelve a "estabilizar" antes de que la secuencia se repita), nunca la
 * partida entera. Unos pocos reinicios por temblor natural de la mano son
 * parte esperada del diseño -por eso el suelo de anti-trampas
 * (`_suelo_pulso_hierro`, backend/app/runtime/anti_cheat.py) se calcula
 * SOLO con el tiempo de toque real, sin sumar nada por estabilización: es
 * un mínimo físico, no la duración esperada de una partida real.
 */

type Phase = 'ready' | 'stabilizing' | 'showing' | 'input' | 'success' | 'blocked'

type SagaDeviceMotionEvent = Event & {
  acceleration?: { x: number | null; y: number | null; z: number | null } | null
  accelerationIncludingGravity?: { x: number | null; y: number | null; z: number | null } | null
}

const ALL_PADS = [
  { id: 0, name: 'Verde', base: '#15803d', lit: '#4ade80', tone: 329.6 },
  { id: 1, name: 'Rojo', base: '#b91c1c', lit: '#f87171', tone: 261.6 },
  { id: 2, name: 'Azul', base: '#1d4ed8', lit: '#60a5fa', tone: 220.0 },
  { id: 3, name: 'Ámbar', base: '#b45309', lit: '#fbbf24', tone: 392.0 },
  { id: 4, name: 'Violeta', base: '#6d28d9', lit: '#c4b5fd', tone: 293.7 },
  { id: 5, name: 'Cian', base: '#0e7490', lit: '#67e8f9', tone: 349.2 },
]

/** Ventana de muestras de acelerómetro sobre la que se mide la varianza. */
const STABILITY_WINDOW_SAMPLES = 16
/** Tiempo que hay que aguantar por debajo del umbral para (re)entrar en juego. */
const STABILIZE_HOLD_MS = 700

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  const n = Number.isFinite(parsed) ? Math.round(parsed) : fallback
  return Math.max(min, Math.min(max, n))
}

function clampFloat(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  const n = Number.isFinite(parsed) ? parsed : fallback
  return Math.max(min, Math.min(max, n))
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
  const ctor = (
    window as unknown as {
      DeviceMotionEvent?: { requestPermission?: () => Promise<'granted' | 'denied'> }
    }
  ).DeviceMotionEvent

  if (typeof ctor?.requestPermission === 'function') {
    avisarPeticionDePermisoPropia()
    const result = await ctor.requestPermission()
    return result === 'granted'
  }

  return 'DeviceMotionEvent' in window || 'ondevicemotion' in window
}

/** Secuencia determinista para esta ronda: mismo seed -> misma secuencia siempre. */
function buildRoundPattern(seed: string, roundIndex: number, length: number, padCount: number): number[] {
  let hash = 2166136261
  const full = `${seed}::round${roundIndex}`
  for (let i = 0; i < full.length; i++) {
    hash ^= full.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  const out: number[] = []
  let state = hash >>> 0
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    out.push(state % padCount)
  }
  return out
}

function playTone(frequency: number, ms: number) {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = frequency
    gain.gain.value = 0.0001
    osc.connect(gain)
    gain.connect(ctx.destination)
    const now = ctx.currentTime
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000)
    osc.start(now)
    osc.stop(now + ms / 1000 + 0.05)
    setTimeout(() => ctx.close().catch(() => undefined), ms + 220)
  } catch {
    // sin audio, el juego sigue siendo jugable por color
  }
}

export function PulsoHierroRuntimeScreen({ resolved, stage, submitting, onWin }: Props) {
  const { t } = useI18n()
  const cfg = resolved.config as Record<string, unknown>

  const seed = useMemo(() => String(stage?.id || stage?.title || 'pulso-hierro'), [stage?.id, stage?.title])

  const startLength = clampInt(cfg.pulso_start_length, 3, 2, 6)
  const targetRounds = clampInt(cfg.pulso_target_rounds, 6, 3, 10)
  const growth = clampInt(cfg.pulso_growth_per_round, 1, 0, 3)
  const varianceMax = clampFloat(cfg.pulso_stability_variance_max, 0.9, 0.2, 3)
  const tapWindowMs = clampInt(cfg.pulso_tap_window_ms, 2600, 1200, 5000)
  const padCount = clampInt(cfg.pulso_pad_count, 4, 3, 6)
  const allowFallback = (cfg.allow_touch_fallback as boolean) !== false
  const useVibration = (cfg.use_vibration as boolean) !== false
  const soundEnabled = useVibration

  const PADS = useMemo(() => ALL_PADS.slice(0, padCount), [padCount])

  const [phase, setPhase] = useState<Phase>('ready')
  const [round, setRound] = useState(0)
  const [activePad, setActivePad] = useState<number | null>(null)
  const [inputIndex, setInputIndex] = useState(0)
  const [message, setMessage] = useState(t('player.minigames.pulsoHierro.holdSteady'))
  const [resets, setResets] = useState(0)
  const [fallbackMode, setFallbackMode] = useState(false)
  const [sensorDenied, setSensorDenied] = useState(false)

  const phaseRef = useRef<Phase>('ready')
  const wonRef = useRef(false)
  const timersRef = useRef<number[]>([])
  const sampleBufferRef = useRef<number[]>([])
  const stableSinceRef = useRef<number | null>(null)
  const tapTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id))
    timersRef.current = []
    if (tapTimeoutRef.current !== null) {
      window.clearTimeout(tapTimeoutRef.current)
      tapTimeoutRef.current = null
    }
  }, [])

  useEffect(() => clearTimers, [clearTimers])

  const sequence = useMemo(
    () => buildRoundPattern(seed, round, startLength + round * growth, padCount),
    [seed, round, startLength, growth, padCount]
  )

  /**
   * Salir de la app a media ronda cuenta como perder la ronda, igual que
   * SimonRuntimeScreen.tsx: no es una pausa gratis para memorizar con calma.
   */
  useRegenerarAoOcultar(phase === 'showing' || phase === 'input', () => {
    clearTimers()
    haptics.error()
    setInputIndex(0)
    setPhase('showing')
    setMessage(t('player.minigames.pulsoHierro.unstable'))
  })

  const showSequence = useCallback(() => {
    clearTimers()
    setPhase('showing')
    setActivePad(null)
    setInputIndex(0)
    setMessage(t('player.minigames.pulsoHierro.watchSequence'))

    const step = Math.max(320, 640 - round * 25)

    sequence.forEach((pad, index) => {
      timersRef.current.push(
        window.setTimeout(() => {
          setActivePad(pad)
          if (soundEnabled) playTone(PADS[pad].tone, step * 0.55)
        }, index * step + 450)
      )
      timersRef.current.push(
        window.setTimeout(() => setActivePad(null), index * step + 450 + step * 0.55)
      )
    })

    timersRef.current.push(
      window.setTimeout(() => {
        setPhase('input')
        setMessage(t('player.minigames.pulsoHierro.yourTurn'))
      }, sequence.length * step + 560)
    )
  }, [clearTimers, sequence, round, soundEnabled, PADS, t])

  /** Se rompió la quietud: se pierde SOLO la ronda de toques en curso. */
  const handleInstability = useCallback(() => {
    if (phaseRef.current !== 'showing' && phaseRef.current !== 'input') return
    clearTimers()
    setActivePad(null)
    setInputIndex(0)
    setResets((n) => n + 1)
    haptics.error()
    stableSinceRef.current = null
    setPhase('stabilizing')
    setMessage(t('player.minigames.pulsoHierro.unstable'))
  }, [clearTimers, t])

  /** Fallo normal de secuencia (ficha equivocada o se acabó el tiempo de toque): se repite la ronda, sin exigir re-estabilizar. */
  const failRound = useCallback(() => {
    clearTimers()
    haptics.error()
    sounds.error()
    setInputIndex(0)
    setPhase('showing')
    timersRef.current.push(window.setTimeout(() => showSequence(), 30))
  }, [clearTimers, showSequence])

  const armTapTimeout = useCallback(() => {
    if (tapTimeoutRef.current !== null) window.clearTimeout(tapTimeoutRef.current)
    tapTimeoutRef.current = window.setTimeout(() => {
      if (phaseRef.current === 'input') failRound()
    }, tapWindowMs)
  }, [failRound, tapWindowMs])

  useEffect(() => {
    if (phase === 'input') armTapTimeout()
    return () => {
      if (tapTimeoutRef.current !== null) {
        window.clearTimeout(tapTimeoutRef.current)
        tapTimeoutRef.current = null
      }
    }
  }, [phase, inputIndex, armTapTimeout])

  const advanceAfterRound = useCallback(async () => {
    const nextRound = round + 1
    if (nextRound >= targetRounds) {
      if (wonRef.current) return
      wonRef.current = true
      clearTimers()
      setPhase('success')
      setMessage(t('player.minigames.pulsoHierro.completed'))
      haptics.success()
      sounds.success()
      await onWin()
      return
    }
    setRound(nextRound)
    setMessage(`¡Ronda ${nextRound} superada!`)
    timersRef.current.push(window.setTimeout(() => showSequence(), 500))
    // showSequence del siguiente round se dispara desde el efecto de `round`
    // vía este timeout directo porque `sequence` todavía referencia la ronda
    // vieja en este cierre.
  }, [round, targetRounds, clearTimers, onWin, showSequence, t])

  function handlePad(pad: number) {
    if (phase !== 'input' || submitting) return

    const expected = sequence[inputIndex]
    setActivePad(pad)
    if (soundEnabled) playTone(PADS[pad].tone, 220)
    window.setTimeout(() => setActivePad(null), 200)

    if (pad !== expected) {
      failRound()
      return
    }

    const nextIndex = inputIndex + 1
    if (nextIndex < sequence.length) {
      setInputIndex(nextIndex)
      armTapTimeout()
      return
    }

    if (tapTimeoutRef.current !== null) {
      window.clearTimeout(tapTimeoutRef.current)
      tapTimeoutRef.current = null
    }
    void advanceAfterRound()
  }

  const startPlaying = useCallback(() => {
    stableSinceRef.current = null
    sampleBufferRef.current = []
    setPhase('stabilizing')
    setMessage(t('player.minigames.pulsoHierro.holdSteady'))
  }, [t])

  const start = useCallback(async () => {
    const allowed = await requestMotionPermission().catch(() => false)
    if (!allowed) {
      setSensorDenied(true)
      if (allowFallback) {
        setFallbackMode(true)
        startPlaying()
        return
      }
      setPhase('blocked')
      setMessage('Sensor de movimiento no disponible.')
      return
    }
    setFallbackMode(false)
    startPlaying()
  }, [allowFallback, startPlaying])

  const startFallback = useCallback(() => {
    setFallbackMode(true)
    startPlaying()
  }, [startPlaying])

  // Stream 1: acelerómetro -> estabilidad, corriendo TODO el rato mientras
  // se juega (stabilizing/showing/input), no solo en una fase concreta.
  useEffect(() => {
    if (fallbackMode) return
    if (phase !== 'stabilizing' && phase !== 'showing' && phase !== 'input') return

    const handleMotion = (event: Event) => {
      const magnitude = getMotionMagnitude(event as SagaDeviceMotionEvent)
      if (magnitude === null) return

      const buffer = sampleBufferRef.current
      buffer.push(magnitude)
      if (buffer.length > STABILITY_WINDOW_SAMPLES) buffer.shift()
      if (buffer.length < Math.min(6, STABILITY_WINDOW_SAMPLES)) return

      const mean = buffer.reduce((a, b) => a + b, 0) / buffer.length
      const variance = buffer.reduce((a, b) => a + (b - mean) * (b - mean), 0) / buffer.length

      const now = performance.now()
      const stable = variance <= varianceMax

      if (!stable) {
        stableSinceRef.current = null
        if (phaseRef.current === 'showing' || phaseRef.current === 'input') {
          handleInstability()
        }
        return
      }

      if (phaseRef.current === 'stabilizing') {
        if (stableSinceRef.current === null) stableSinceRef.current = now
        if (now - stableSinceRef.current >= STABILIZE_HOLD_MS) {
          showSequence()
        }
      }
    }

    window.addEventListener('devicemotion', handleMotion, { passive: true })
    return () => window.removeEventListener('devicemotion', handleMotion)
  }, [phase, fallbackMode, varianceMax, handleInstability, showSequence])

  // Modo táctil (fallback, sin sensor): la estabilidad se da por buena y solo
  // hay que jugar la secuencia -degraded_mode, ver definition.ts-.
  useEffect(() => {
    if (!fallbackMode) return
    if (phase === 'stabilizing') {
      const id = window.setTimeout(() => showSequence(), STABILIZE_HOLD_MS)
      timersRef.current.push(id)
      return () => window.clearTimeout(id)
    }
  }, [fallbackMode, phase, showSequence])

  const title = stage.title || 'Pulso de hierro'

  const stabilityLabel =
    phase === 'stabilizing'
      ? t('player.minigames.pulsoHierro.restabilize')
      : t('player.minigames.pulsoHierro.holdSteady')

  const progressLabel = t('player.minigames.pulsoHierro.roundProgress')
    .replace('{current}', String(Math.min(round + 1, targetRounds)))
    .replace('{total}', String(targetRounds))

  return (
    <div className="pulso-root">
      <style>{STYLES}</style>

      <div className="pulso-head">
        <span className="pulso-kicker">PULSO DE HIERRO</span>
        <span className="pulso-progress-chip">{progressLabel}</span>
      </div>

      <h2 className="pulso-title">{title}</h2>

      {phase === 'ready' ? (
        <>
          <p className="pulso-message">
            Sujeta el móvil lo más quieto posible con una mano. Con la otra, repite la secuencia de
            colores -crece cada ronda-. Moverte de más reinicia la ronda actual, no la partida.
          </p>
          <button type="button" className="pulso-start" onClick={() => void start()} disabled={submitting}>
            ▶ Empezar
          </button>
          {allowFallback ? (
            <button type="button" className="pulso-fallback-link" onClick={startFallback} disabled={submitting}>
              Jugar sin sensor de movimiento
            </button>
          ) : null}
        </>
      ) : phase === 'blocked' ? (
        <p className="pulso-message">{message}</p>
      ) : (
        <>
          <div className={`pulso-stability ${phase === 'stabilizing' ? 'is-warn' : 'is-ok'}`}>
            <b>{fallbackMode ? 'Modo táctil' : stabilityLabel}</b>
            {sensorDenied ? <span>Sensor no disponible: se usa modo táctil.</span> : null}
          </div>

          <p className="pulso-message">{message}</p>

          <div className={`pulso-grid ${phase === 'input' ? 'is-input' : ''}`}>
            {PADS.map((pad) => (
              <button
                key={pad.id}
                type="button"
                className={`pulso-pad ${activePad === pad.id ? 'is-lit' : ''}`}
                style={{
                  background: activePad === pad.id ? pad.lit : pad.base,
                  boxShadow: activePad === pad.id ? `0 0 34px ${pad.lit}` : 'none',
                }}
                disabled={phase !== 'input' || submitting}
                onClick={() => handlePad(pad.id)}
                aria-label={pad.name}
              />
            ))}
          </div>

          {phase === 'input' ? (
            <div className="pulso-dots">
              {sequence.map((_, index) => (
                <i key={index} className={index < inputIndex ? 'ok' : ''} />
              ))}
            </div>
          ) : null}

          {resets > 0 ? <div className="pulso-resets">Reinicios por movimiento: {resets}</div> : null}
        </>
      )}
    </div>
  )
}

const STYLES = `
.pulso-root {
  width: 100%;
  display: grid;
  gap: 12px;
  padding: 14px;
  color: #f8fafc;
}
.pulso-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.pulso-kicker {
  font-size: 10px;
  letter-spacing: .18em;
  font-weight: 900;
  color: rgba(226,238,255,.6);
}
.pulso-progress-chip {
  min-height: 22px;
  padding: 0 9px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  background: rgba(255,255,255,.08);
  border: 1px solid rgba(255,255,255,.1);
  font-size: 11px;
  font-weight: 900;
}
.pulso-title {
  margin: 0;
  font-size: clamp(20px, 6vw, 28px);
  font-weight: 950;
  letter-spacing: -.03em;
}
.pulso-message {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: rgba(226,238,255,.82);
  line-height: 1.35;
}
.pulso-stability {
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,.12);
  padding: 10px 12px;
  display: grid;
  gap: 2px;
}
.pulso-stability.is-warn {
  border-color: rgba(251,191,36,.4);
  background: rgba(251,191,36,.08);
}
.pulso-stability.is-ok {
  border-color: rgba(163,230,53,.25);
  background: rgba(163,230,53,.06);
}
.pulso-stability b { font-size: 13px; }
.pulso-stability span { font-size: 11px; color: rgba(226,232,240,.65); }
.pulso-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  max-width: 340px;
  margin: 0 auto;
  width: 100%;
  opacity: .75;
  transition: opacity .18s ease;
}
.pulso-grid.is-input { opacity: 1; }
.pulso-pad {
  aspect-ratio: 1 / 1;
  border: none;
  border-radius: 18px;
  cursor: pointer;
  transition: background .12s ease, box-shadow .12s ease, transform .08s ease;
}
.pulso-pad:active:not(:disabled) { transform: scale(.96); }
.pulso-pad:disabled { cursor: default; }
.pulso-dots { display: flex; gap: 6px; justify-content: center; }
.pulso-dots i {
  width: 9px; height: 9px; border-radius: 999px;
  background: rgba(255,255,255,.18);
}
.pulso-dots i.ok { background: #4ade80; }
.pulso-start {
  min-height: 50px;
  border: none;
  border-radius: 16px;
  background: linear-gradient(135deg, #bef264, #4ade80);
  color: #022c22;
  font-size: 15px;
  font-weight: 900;
  cursor: pointer;
}
.pulso-fallback-link {
  background: none;
  border: none;
  color: rgba(226,238,255,.6);
  font-size: 11px;
  text-decoration: underline;
  cursor: pointer;
}
.pulso-resets {
  text-align: center;
  font-size: 11px;
  color: rgba(226,232,240,.5);
}
`

export default PulsoHierroRuntimeScreen
