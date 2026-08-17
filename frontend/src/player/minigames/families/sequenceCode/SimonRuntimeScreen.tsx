import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PlayerStage } from '../../../../types/player'
import { haptics, sounds } from '../../../utils/haptics'

interface Props {
  resolved: { config?: Record<string, unknown> }
  stage: PlayerStage
  helperText: string
  submitting: boolean
  onWin: () => Promise<void>
}

type Phase = 'idle' | 'showing' | 'input' | 'failed' | 'won'

const ALL_PADS = [
  { id: 0, name: 'Verde', base: '#15803d', lit: 'rgb(var(--theme-done-soft))', tone: 329.6 },
  { id: 1, name: 'Rojo', base: '#b91c1c', lit: '#f87171', tone: 261.6 },
  { id: 2, name: 'Azul', base: '#1d4ed8', lit: '#60a5fa', tone: 220.0 },
  { id: 3, name: 'Ámbar', base: '#b45309', lit: '#fbbf24', tone: 392.0 },
  { id: 4, name: 'Violeta', base: '#6d28d9', lit: '#c4b5fd', tone: 293.7 },
  { id: 5, name: 'Cian', base: '#0e7490', lit: '#67e8f9', tone: 349.2 },
]

function readInt(config: Record<string, unknown>, key: string, fallback: number): number {
  const value = Number(config[key])
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback
}

/**
 * Genera el patrón a partir de una semilla fija del nodo.
 *
 * Es determinista a propósito: al fallar se vuelve al nivel 1 pero la
 * secuencia es SIEMPRE la misma, así que se puede aprender por ensayo y error.
 */
function buildPattern(seed: string, length: number, padCount: number): number[] {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
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
    const Ctx =
      (window as any).AudioContext || (window as any).webkitAudioContext
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

export function SimonRuntimeScreen({ resolved, stage, submitting, onWin }: Props) {
  const cfg = (resolved?.config || {}) as Record<string, unknown>

  const seed = useMemo(() => {
    const raw = cfg.maze_seed || cfg.seed || stage?.id || stage?.title || 'saga-simon'
    return String(raw)
  }, [cfg.maze_seed, cfg.seed, stage?.id, stage?.title])

  // Patrón completo, fijo para este nodo. Cada nivel usa un prefijo.
  // Todo esto estaba fijo en el código: el editor de admin no controlaba nada
  // de lo que realmente se jugaba.
  const maxLevels = Math.min(8, Math.max(3, readInt(cfg, 'levels', 5)))
  const padCount = Math.min(6, Math.max(3, readInt(cfg, 'pad_count', 4)))
  const baseStepMs = Math.min(1200, Math.max(260, readInt(cfg, 'step_ms', 620)))
  const soundEnabled = cfg.sound_enabled !== false

  const PADS = useMemo(() => ALL_PADS.slice(0, padCount), [padCount])

  const fullPattern = useMemo(
    () => buildPattern(seed, maxLevels + 2, padCount),
    [seed, maxLevels, padCount]
  )

  const [level, setLevel] = useState(1)
  const [phase, setPhase] = useState<Phase>('idle')
  const [activePad, setActivePad] = useState<number | null>(null)
  const [inputIndex, setInputIndex] = useState(0)
  const [message, setMessage] = useState('Memoriza la secuencia de colores.')
  const [attempts, setAttempts] = useState(0)

  const wonRef = useRef(false)
  const timersRef = useRef<number[]>([])

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id))
    timersRef.current = []
  }, [])

  useEffect(() => clearTimers, [clearTimers])

  const sequence = useMemo(() => fullPattern.slice(0, level), [fullPattern, level])

  const showSequence = useCallback(() => {
    clearTimers()
    setPhase('showing')
    setInputIndex(0)
    setActivePad(null)
    setMessage(`Nivel ${level} de ${maxLevels}. Observa...`)

    // Cada nivel va un poco más rápido, sin bajar del mínimo jugable.
    const step = Math.max(300, baseStepMs - level * 50)

    sequence.forEach((pad, index) => {
      timersRef.current.push(
        window.setTimeout(() => {
          setActivePad(pad)
          if (soundEnabled) playTone(PADS[pad].tone, step * 0.55)
          haptics.tick()
        }, index * step + 500)
      )
      timersRef.current.push(
        window.setTimeout(() => setActivePad(null), index * step + 500 + step * 0.55)
      )
    })

    timersRef.current.push(
      window.setTimeout(
        () => {
          setPhase('input')
          setMessage('Tu turno: repite la secuencia.')
        },
        sequence.length * step + 620
      )
    )
  }, [clearTimers, level, sequence])

  function handleStart() {
    setAttempts((value) => value + 1)
    showSequence()
  }

  async function handlePad(pad: number) {
    if (phase !== 'input' || submitting) return

    const expected = sequence[inputIndex]
    setActivePad(pad)
    if (soundEnabled) playTone(PADS[pad].tone, 220)
    window.setTimeout(() => setActivePad(null), 200)

    if (pad !== expected) {
      // Se vuelve al nivel 1, pero el patrón NO cambia.
      haptics.error()
      sounds.error()
      setPhase('failed')
      setLevel(1)
      setInputIndex(0)
      setMessage('Fallaste. Se vuelve al nivel 1, pero la secuencia es la misma.')
      return
    }

    const nextIndex = inputIndex + 1

    if (nextIndex < sequence.length) {
      setInputIndex(nextIndex)
      return
    }

    if (level >= maxLevels) {
      if (wonRef.current) return
      wonRef.current = true
      clearTimers()
      setPhase('won')
      setMessage('¡Secuencia completa!')
      haptics.success()
      sounds.success()
      await onWin()
      return
    }

    setPhase('idle')
    setLevel(level + 1)
    setInputIndex(0)
    setMessage(`¡Bien! Nivel ${level + 1} desbloqueado.`)
  }

  return (
    <div className="simon-root">
      <style>{STYLES}</style>

      <div className="simon-head">
        <span className="simon-kicker">SIMÓN DICE</span>
        <div className="simon-levels" aria-label={`Nivel ${level} de ${maxLevels}`}>
          {Array.from({ length: maxLevels }, (_, i) => (
            <i key={i} className={i < level - 1 ? 'done' : i === level - 1 ? 'current' : ''} />
          ))}
        </div>
      </div>

      <p className="simon-message">{message}</p>

      <div className={`simon-grid ${phase === 'input' ? 'is-input' : ''}`}>
        {PADS.map((pad) => (
          <button
            key={pad.id}
            type="button"
            className={`simon-pad ${activePad === pad.id ? 'is-lit' : ''}`}
            style={{
              background: activePad === pad.id ? pad.lit : pad.base,
              boxShadow: activePad === pad.id ? `0 0 34px ${pad.lit}` : 'none',
            }}
            disabled={phase !== 'input' || submitting}
            onClick={() => void handlePad(pad.id)}
            aria-label={pad.name}
          />
        ))}
      </div>

      {phase === 'input' ? (
        <div className="simon-progress">
          {sequence.map((_, index) => (
            <i key={index} className={index < inputIndex ? 'ok' : ''} />
          ))}
        </div>
      ) : null}

      {phase === 'idle' || phase === 'failed' ? (
        <button type="button" className="simon-start" onClick={handleStart} disabled={submitting}>
          {attempts === 0 ? '▶ Empezar' : phase === 'failed' ? '↻ Reintentar' : '▶ Ver secuencia'}
        </button>
      ) : null}

      {phase === 'showing' ? <div className="simon-watch">Observando…</div> : null}
    </div>
  )
}

const STYLES = `
.simon-root {
  width: 100%;
  display: grid;
  gap: 12px;
  padding: 14px;
  color: #f8fafc;
}
.simon-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.simon-kicker {
  font-size: 10px;
  letter-spacing: .18em;
  font-weight: 900;
  color: rgba(226,238,255,.6);
}
.simon-levels { display: flex; gap: 5px; }
.simon-levels i {
  width: 22px; height: 5px; border-radius: 999px;
  background: rgba(255,255,255,.16);
}
.simon-levels i.done { background: rgb(var(--theme-done-soft)); }
.simon-levels i.current { background: #fbbf24; }
.simon-message {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: rgba(226,238,255,.82);
  min-height: 34px;
  line-height: 1.35;
}
.simon-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  max-width: 340px;
  margin: 0 auto;
  width: 100%;
  opacity: .75;
  transition: opacity .18s ease;
}
.simon-grid.is-input { opacity: 1; }
.simon-pad {
  aspect-ratio: 1 / 1;
  border: none;
  border-radius: 18px;
  cursor: pointer;
  transition: background .12s ease, box-shadow .12s ease, transform .08s ease;
}
.simon-pad:active:not(:disabled) { transform: scale(.96); }
.simon-pad:disabled { cursor: default; }
.simon-progress { display: flex; gap: 6px; justify-content: center; }
.simon-progress i {
  width: 9px; height: 9px; border-radius: 999px;
  background: rgba(255,255,255,.18);
}
.simon-progress i.ok { background: rgb(var(--theme-done-soft)); }
.simon-start {
  min-height: 50px;
  border: none;
  border-radius: 16px;
  background: linear-gradient(135deg, rgb(var(--theme-ok)), rgb(var(--theme-ok-deep)));
  color: #022c22;
  font-size: 15px;
  font-weight: 900;
  cursor: pointer;
}
.simon-watch {
  text-align: center;
  font-size: 12px;
  font-weight: 800;
  color: #fbbf24;
}
`

export default SimonRuntimeScreen
