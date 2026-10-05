import { useEffect, useMemo, useRef, useState } from 'react'
import type { PlayerStage } from '../../../../types/player'
import type { ResolvedWordTrapMinigame } from '../../core/resolver'
import type { WordTrapRound } from '../../core/family-types'
import { haptics, sounds } from '../../../utils/haptics'
import { useI18n } from '../../../../i18n/useI18n'
import { useTextos } from '../../core/useTextos'
import { registrarEvidencia } from '../../../avance/evidencia'
import { leerExplicacion } from './explicacion'

interface Props {
  resolved: ResolvedWordTrapMinigame
  stage: PlayerStage
  helperText: string
  submitting: boolean
  onWin: (penaltyMs?: number) => Promise<void>
}

const DEFAULT_N_ROUNDS = 8
const DEFAULT_TIME_LIMIT_S = 12
const DEFAULT_PENALTY_MS = 30000
/** Pausa tras responder (o agotar el tiempo) antes de pasar a la siguiente
 * ronda: tiempo justo para leer si acertaste y, si hay, la explicación. */
const REVEAL_PAUSE_MS = 1600

/**
 * sha256(salt + ':' + índice de opción elegido), la MISMA función que corre
 * en el servidor (hash_word_trap_answer en minigames.py). Web Crypto
 * (SubtleCrypto) funciona sin red -igual que CuentaSenalesRuntimeScreen.tsx-,
 * así que comprobar la respuesta no necesita conexión.
 */
async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

type RoundResult = 'idle' | 'correct' | 'wrong' | 'timeout'

const STYLES = `
.wtp-root {
  width: 100%;
  margin-top: 8px;
  color: rgba(255,255,255,.96);
}
.wtp-card {
  position: relative;
  overflow: hidden;
  border-radius: 24px;
  padding: 18px 16px;
  background:
    radial-gradient(circle at 50% 0%, rgba(255,255,255,.10), transparent 34%),
    linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.035));
  border: 1px solid rgba(255,255,255,.12);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.13), 0 16px 42px rgba(0,0,0,.16);
  backdrop-filter: blur(22px) saturate(1.18);
  display: grid;
  gap: 14px;
}
.wtp-overline {
  font-size: 10px;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: rgba(226,238,255,.54);
  font-weight: 800;
  text-align: center;
}
.wtp-topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.wtp-round {
  font-size: 12px;
  font-weight: 800;
  color: rgba(226,238,255,.72);
}
.wtp-timer {
  min-width: 44px;
  text-align: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 900;
  background: rgba(255,255,255,.10);
}
.wtp-timer.wtp-timer-low {
  background: rgba(248,113,113,.24);
  color: #fecaca;
}
.wtp-timerbar {
  height: 6px;
  border-radius: 999px;
  background: rgba(255,255,255,.10);
  overflow: hidden;
}
.wtp-timerbar-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, rgb(var(--theme-ok)), rgb(var(--theme-ok-deep)));
  transition: width 120ms linear, background-color 200ms ease;
}
.wtp-timerbar-fill.wtp-timerbar-low {
  background: linear-gradient(90deg, #f87171, #ef4444);
}
.wtp-question {
  font-size: 17px;
  font-weight: 800;
  line-height: 1.35;
  text-align: center;
}
.wtp-options {
  display: grid;
  gap: 10px;
}
.wtp-option {
  min-height: 54px;
  padding: 10px 14px;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,.16);
  background: rgba(255,255,255,.07);
  color: rgba(255,255,255,.96);
  font-size: 15px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
  line-height: 1.3;
}
.wtp-option:disabled {
  cursor: default;
}
.wtp-option.wtp-option-picked {
  background: rgba(var(--theme-info), .22);
  border-color: rgba(var(--theme-info), .5);
}
.wtp-option.wtp-option-correct {
  background: rgba(74,222,128,.24);
  border-color: rgba(74,222,128,.6);
}
.wtp-option.wtp-option-incorrect {
  background: rgba(248,113,113,.22);
  border-color: rgba(248,113,113,.55);
}
.wtp-status {
  font-size: 13px;
  font-weight: 700;
  color: rgba(226,238,255,.78);
  line-height: 1.4;
  text-align: center;
}
.wtp-status.wtp-status-wrong {
  color: #fca5a5;
}
.wtp-status.wtp-status-correct {
  color: #86efac;
}
.wtp-explain {
  font-size: 12px;
  color: rgba(226,238,255,.64);
  line-height: 1.4;
  text-align: center;
}
.wtp-penalty {
  font-size: 11px;
  font-weight: 800;
  color: rgba(251,191,36,.9);
  text-align: center;
}
`

function useCountdown(activeKey: string, durationMs: number, onExpire: () => void, paused: boolean) {
  const [remainingMs, setRemainingMs] = useState(durationMs)
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  useEffect(() => {
    setRemainingMs(durationMs)
    if (paused) return
    const startedAt = Date.now()
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - startedAt
      const left = Math.max(0, durationMs - elapsed)
      setRemainingMs(left)
      if (left <= 0) {
        window.clearInterval(interval)
        onExpireRef.current()
      }
    }, 100)
    return () => window.clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, durationMs, paused])

  return remainingMs
}

export function WordTrapRuntimeScreen({ resolved, stage, submitting, onWin }: Props) {
  const { t } = useI18n()
  const tx = useTextos().wordTrap
  const cfg = resolved.config as unknown as Record<string, unknown>

  const baseRounds = useMemo(
    () => (Array.isArray(cfg.rounds) ? (cfg.rounds as WordTrapRound[]) : []),
    [cfg.rounds]
  )
  const extraPool = useMemo(
    () => (Array.isArray(cfg.extra_rounds) ? (cfg.extra_rounds as WordTrapRound[]) : []),
    [cfg.extra_rounds]
  )
  const timeLimitS = Number(cfg.time_limit_s) > 0 ? Number(cfg.time_limit_s) : DEFAULT_TIME_LIMIT_S
  const timeLimitMs = timeLimitS * 1000
  const penaltyMs = Number(cfg.penalty_ms) >= 0 ? Number(cfg.penalty_ms) : DEFAULT_PENALTY_MS

  const [roundIndex, setRoundIndex] = useState(0)
  const [pickedIndex, setPickedIndex] = useState<number | null>(null)
  const [correctIndex, setCorrectIndex] = useState<number | null>(null)
  const [result, setResult] = useState<RoundResult>('idle')
  const [checking, setChecking] = useState(false)
  const [penaltyAccumMs, setPenaltyAccumMs] = useState(0)
  // La penalización acumulada vive también en un ref: el avance de ronda se
  // decidía DENTRO del actualizador de `setPenaltyAccumMs`, y React (en modo
  // estricto) puede llamar a un actualizador dos veces: dos `advanceOrFinish`,
  // dos temporizadores y una ronda saltada.
  const penaltyRef = useRef(0)
  const sumarPenalizacion = () => {
    const next = penaltyRef.current + penaltyMs
    penaltyRef.current = next
    setPenaltyAccumMs(next)
    return next
  }
  const [explicacion, setExplicacion] = useState('')
  /**
   * Cada fallo (o pregunta sin contestar a tiempo) suma UNA ronda de repuesto,
   * hasta agotar las que mandó el servidor. Sin esto, quien lee rápido la
   * acababa en menos de un minuto aunque fallase: el fallo sólo costaba 30 s
   * en el marcador, no tiempo de juego. La cuenta va en un ref además de en el
   * estado porque `advanceOrFinish` decide si es la última ronda en el mismo
   * instante en que se suma.
   */
  const extrasRef = useRef(0)
  const [extrasUsadas, setExtrasUsadas] = useState(0)
  const rounds = useMemo(
    () => [...baseRounds, ...extraPool.slice(0, extrasUsadas)],
    [baseRounds, extraPool, extrasUsadas]
  )
  const nRounds = rounds.length > 0 ? rounds.length : Number(cfg.n_rounds) || DEFAULT_N_ROUNDS
  const finishingRef = useRef(false)

  /** Lo que se le cuenta al servidor: cada ronda con su opción y su tiempo. */
  const registroRef = useRef<Array<{ r: number; c: number | null; ms: number }>>([])
  const inicioRondaRef = useRef(Date.now())
  const fallosRef = useRef(0)

  useEffect(() => {
    inicioRondaRef.current = Date.now()
  }, [roundIndex])

  const sumarRondaExtra = () => {
    if (extrasRef.current >= extraPool.length) return
    extrasRef.current += 1
    setExtrasUsadas(extrasRef.current)
  }

  const round = rounds[roundIndex]
  const revealed = result !== 'idle'

  const advanceOrFinish = (nextPenaltyAccumMs: number) => {
    window.setTimeout(() => {
      if (roundIndex + 1 >= baseRounds.length + extrasRef.current) {
        if (finishingRef.current) return
        finishingRef.current = true
        const registro = registroRef.current
        registrarEvidencia(stage.id ?? '', {
          game: 'trampa_palabras',
          rondas: registro,
          fallos: fallosRef.current,
          penalty_ms: nextPenaltyAccumMs,
        })
        void onWin(nextPenaltyAccumMs)
        return
      }
      setRoundIndex((prev) => prev + 1)
      setPickedIndex(null)
      setCorrectIndex(null)
      setResult('idle')
      setExplicacion('')
    }, REVEAL_PAUSE_MS)
  }

  /** La explicación, ya contestada: se abre ahora, no estaba en el paquete en claro. */
  const mostrarExplicacion = async (ronda: WordTrapRound | undefined) => {
    if (!ronda) return
    if (ronda.explanation) {
      setExplicacion(ronda.explanation)
      return
    }
    const texto = await leerExplicacion(ronda.explanation_enc, ronda.salt, ronda.options.length)
    setExplicacion(texto)
  }

  const handleTimeout = () => {
    if (revealed || !round) return
    haptics.error()
    registroRef.current.push({ r: roundIndex, c: null, ms: Math.round(timeLimitMs) })
    fallosRef.current += 1
    sumarRondaExtra()
    void mostrarExplicacion(round)
    setResult('timeout')
    setPickedIndex(null)
    setCorrectIndex(null)
    advanceOrFinish(sumarPenalizacion())
  }

  const remainingMs = useCountdown(`${roundIndex}`, timeLimitMs, handleTimeout, revealed || !round)

  async function pickOption(index: number) {
    if (revealed || checking || submitting || !round) return
    setChecking(true)
    try {
      const candidate = await sha256Hex(`${round.salt}:${index}`)
      const correct = candidate === round.answer_hash

      registroRef.current.push({
        r: roundIndex,
        c: index,
        ms: Math.max(0, Math.round(Date.now() - inicioRondaRef.current)),
      })

      setPickedIndex(index)
      setCorrectIndex(correct ? index : null)
      void mostrarExplicacion(round)

      if (correct) {
        haptics.signalLock()
        sounds.signalLock()
        setResult('correct')
        advanceOrFinish(penaltyRef.current)
      } else {
        haptics.error()
        fallosRef.current += 1
        sumarRondaExtra()
        setResult('wrong')
        advanceOrFinish(sumarPenalizacion())
      }
    } finally {
      setChecking(false)
    }
  }

  if (!round) {
    return (
      <div className="wtp-root">
        <style>{STYLES}</style>
        <div className="wtp-card">
          <div className="wtp-status">{tx.preparando}</div>
        </div>
      </div>
    )
  }

  const secondsLeft = Math.ceil(remainingMs / 1000)
  const barRatio = Math.max(0, Math.min(1, remainingMs / timeLimitMs))
  const low = remainingMs <= timeLimitMs * 0.25

  const statusText =
    result === 'correct'
      ? `✅ ${t('player.minigames.wordTrap.correct')}`
      : result === 'wrong'
        ? `❌ ${t('player.minigames.wordTrap.wrong')}`
        : result === 'timeout'
          ? `⏱️ ${t('player.minigames.wordTrap.timeout')}`
          : tx.leeConCalma

  return (
    <div className="wtp-root">
      <style>{STYLES}</style>
      <div className="wtp-card">
        <span className="wtp-overline">{tx.titulo}</span>

        <div className="wtp-topbar">
          <span className="wtp-round">
            {t('player.minigames.wordTrap.round')
              .replace('{current}', String(roundIndex + 1))
              .replace('{total}', String(nRounds))}
          </span>
          <span className={`wtp-timer${low ? ' wtp-timer-low' : ''}`}>{secondsLeft}s</span>
        </div>

        <div className="wtp-timerbar">
          <div
            className={`wtp-timerbar-fill${low ? ' wtp-timerbar-low' : ''}`}
            style={{ width: `${barRatio * 100}%` }}
          />
        </div>

        <div className="wtp-question">{round.question}</div>

        <div className="wtp-options">
          {round.options.map((option, index) => {
            const isPicked = pickedIndex === index
            const isCorrectReveal = revealed && correctIndex === index
            const isWrongPick = revealed && isPicked && correctIndex !== index
            const className = [
              'wtp-option',
              isPicked && !revealed ? 'wtp-option-picked' : '',
              isCorrectReveal ? 'wtp-option-correct' : '',
              isWrongPick ? 'wtp-option-incorrect' : '',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <button
                key={index}
                type="button"
                className={className}
                disabled={revealed || checking || submitting}
                onClick={() => void pickOption(index)}
              >
                {option}
              </button>
            )
          })}
        </div>

        <div
          className={`wtp-status${result === 'wrong' || result === 'timeout' ? ' wtp-status-wrong' : ''}${
            result === 'correct' ? ' wtp-status-correct' : ''
          }`}
        >
          {statusText}
        </div>

        {revealed && explicacion ? <div className="wtp-explain">{explicacion}</div> : null}

        {penaltyAccumMs > 0 ? (
          <div className="wtp-penalty">
            {t('player.minigames.wordTrap.penalty').replace('{seconds}', String(Math.round(penaltyAccumMs / 1000)))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default WordTrapRuntimeScreen
