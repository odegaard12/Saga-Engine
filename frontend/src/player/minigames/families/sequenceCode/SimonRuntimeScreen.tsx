import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PlayerStage } from '../../../../types/player'
import { haptics, sounds } from '../../../utils/haptics'
import { useRegenerarAoOcultar } from '../../core/useRegenerarAoOcultar'
import { useTextos } from '../../core/useTextos'
import { useSinRetoEnPantalla } from '../../../hooks/useSinRetoEnPantalla'
import { crearReproductorDeTonos } from '../../core/tonos'

interface Props {
  resolved: { config?: Record<string, unknown> }
  stage: PlayerStage
  helperText: string
  submitting: boolean
  onWin: () => Promise<void>
}

type Phase = 'idle' | 'showing' | 'input' | 'failed' | 'won'

/** El nombre de cada pad sale de `textos.simon.colores`, en el idioma del jugador. */
const ALL_PADS = [
  { id: 0, base: '#15803d', lit: 'rgb(var(--theme-done-soft))', tone: 329.6 },
  { id: 1, base: '#b91c1c', lit: '#f87171', tone: 261.6 },
  { id: 2, base: '#1d4ed8', lit: '#60a5fa', tone: 220.0 },
  { id: 3, base: '#b45309', lit: '#fbbf24', tone: 392.0 },
  { id: 4, base: '#6d28d9', lit: '#c4b5fd', tone: 293.7 },
  { id: 5, base: '#0e7490', lit: '#67e8f9', tone: 349.2 },
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

export function SimonRuntimeScreen({ resolved, stage, submitting, onWin }: Props) {
  const t = useTextos().simon
  const cfg = (resolved?.config || {}) as Record<string, unknown>

  /**
   * UN solo contexto de audio para todas las notas (ver `tonos.ts`): antes cada
   * nota creaba el suyo y el móvil dejaba de sonar a mitad de secuencia.
   */
  const [tonos] = useState(() => crearReproductorDeTonos())
  useEffect(() => () => tonos.cerrar(), [tonos])

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
  const [message, setMessage] = useState(t.memoriza)
  const [attempts, setAttempts] = useState(0)

  const wonRef = useRef(false)
  const timersRef = useRef<number[]>([])

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id))
    timersRef.current = []
  }, [])

  useEffect(() => clearTimers, [clearTimers])

  /**
   * Antitrampas, adaptado a este juego: la secuencia es fija A PROPÓSITO
   * -"se puede aprender por ensayo y error", ver `buildPattern` arriba-,
   * así que regenerarla rompería el propio diseño del reto. Lo que sí se
   * cierra es la pausa gratis: salir a media memorización o a mitad de
   * repetirla cuenta como un fallo -mismo castigo que fallar tocando mal-,
   * no como una pausa sin coste para salir a apuntarla con calma.
   */
  useRegenerarAoOcultar(phase === 'showing' || phase === 'input', () => {
    clearTimers()
    haptics.error()
    setPhase('failed')
    setLevel(1)
    setInputIndex(0)
    setMessage(t.salioAMediaPrueba)
  })

  // Sólo hay reto delante mientras se enseña o se repite la secuencia: en la
  // pantalla de empezar, entre niveles o tras fallar no hay nada que apuntar.
  useSinRetoEnPantalla(phase !== 'showing' && phase !== 'input')

  const sequence = useMemo(() => fullPattern.slice(0, level), [fullPattern, level])

  const showSequence = useCallback(() => {
    clearTimers()
    setPhase('showing')
    setInputIndex(0)
    setActivePad(null)
    setMessage(t.observa(level, maxLevels))

    // Cada nivel va un poco más rápido, sin bajar del mínimo jugable.
    const step = Math.max(300, baseStepMs - level * 50)

    sequence.forEach((pad, index) => {
      timersRef.current.push(
        window.setTimeout(() => {
          setActivePad(pad)
          if (soundEnabled) tonos.tono(PADS[pad].tone, step * 0.55)
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
          setMessage(t.tuTurno)
        },
        sequence.length * step + 620
      )
    )
    // `PADS`, `baseStepMs` y `soundEnabled` salen de la configuración del nodo,
    // que no cambia con el juego abierto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearTimers, level, sequence, t, tonos])

  function handleStart() {
    // El audio se despierta AQUÍ, en el toque del jugador: los navegadores sólo
    // dejan arrancarlo desde un gesto, y las notas suenan después, en temporizadores.
    tonos.preparar()
    setAttempts((value) => value + 1)
    showSequence()
  }

  async function handlePad(pad: number) {
    if (phase !== 'input' || submitting) return

    const expected = sequence[inputIndex]
    setActivePad(pad)
    if (soundEnabled) tonos.tono(PADS[pad].tone, 220)
    window.setTimeout(() => setActivePad(null), 200)

    if (pad !== expected) {
      // Se vuelve al nivel 1, pero el patrón NO cambia.
      haptics.error()
      sounds.error()
      setPhase('failed')
      setLevel(1)
      setInputIndex(0)
      setMessage(t.fallaste)
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
      setMessage(t.completa)
      haptics.success()
      sounds.success()
      await onWin()
      return
    }

    setPhase('idle')
    setLevel(level + 1)
    setInputIndex(0)
    setMessage(t.nivelDesbloqueado(level + 1))
  }

  return (
    <div className="simon-root">
      <style>{STYLES}</style>

      <div className="simon-head">
        <span className="simon-kicker">{t.kicker}</span>
        <div className="simon-levels" aria-label={t.nivelDe(level, maxLevels)}>
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
            aria-label={t.colores[pad.id]}
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
          {attempts === 0 ? t.empezar : phase === 'failed' ? t.reintentar : t.verSecuencia}
        </button>
      ) : null}

      {phase === 'showing' ? <div className="simon-watch">{t.observando}</div> : null}
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
