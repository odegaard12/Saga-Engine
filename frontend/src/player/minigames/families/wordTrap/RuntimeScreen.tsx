import { useEffect, useMemo, useRef, useState } from 'react'
import type { PlayerStage } from '../../../../types/player'
import type { ResolvedWordTrapMinigame } from '../../core/resolver'
import type { WordTrapRound } from '../../core/family-types'
import { haptics, sounds } from '../../../utils/haptics'
import { useI18n } from '../../../../i18n/useI18n'
import { useTextos } from '../../core/useTextos'
import { registrarEvidencia } from '../../../avance/evidencia'
import { partidasGuardadas } from '../../core/partidasGuardadas'
import { useSinRetoEnPantalla } from '../../../hooks/useSinRetoEnPantalla'
import { useSalidaDePantalla } from '../../../ui/movimiento'
import { descontarTiempoOculto } from './relojDeRonda'
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
const DEFAULT_PENALTY_MS = 10000
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

/**
 * La partida en curso de cada nodo, fuera del componente (como `nodeClock`).
 *
 * Revisión 19/10: cerrar y reabrir la hoja desmonta el juego, y con él se
 * perdían fallos, penalización y rondas de repuesto: cerrar tras un fallo y
 * volver a abrir dejaba la trampa a cero. Se guarda al resolver cada ronda y se
 * borra al ganar.
 */
interface PartidaGuardada {
  siguiente: number
  penalty: number
  fallos: number
  extras: number
  registro: Array<{ r: number; c: number | null; ms: number }>
  /** Cuándo empezó la ronda `siguiente`. Cerrar la hoja, salir o recargar NO la vuelve a empezar (revisión 30/10:
   * cerrar a mitad de pregunta, buscar la respuesta y reabrir daba otra vez el tiempo entero). */
  inicio?: number
  /** 14/11: la última ronda ya está contestada y solo falta darla por superada. Cerrar o recargar en esa pausa (1,6 s)
   * dejaba `siguiente` fuera de rango, la última ronda salía repetida y el registro duplicaba entradas. */
  terminado?: boolean
}
const partidas = partidasGuardadas<PartidaGuardada>('trampa_palabras')

const STYLES = `
/* 22/11: en la piel de los demás juegos: cabecera con título y reloj en chip, la pregunta en su tarjeta con la ronda
   encima y opciones como piezas con su letra. Sin emojis en los avisos: el color y la palabra bastan. */
.wtp-root {
  width: 100%;
  margin-top: 4px;
  color: var(--mg-text);
}
.wtp-card {
  position: relative;
  display: grid;
  gap: 12px;
}
.wtp-topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.wtp-topbar h2 {
  margin: 0;
  font-size: clamp(20px, 6vw, 24px);
  font-weight: 800;
  line-height: 1.1;
}
.wtp-round {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: rgb(var(--theme-info, 56, 189, 248));
}
.wtp-timer {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 64px;
  padding: 5px 11px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  background: var(--saga-pizarra-tarjeta);
  border: 1px solid var(--saga-pizarra-raya);
}
.wtp-timer svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
}
.wtp-timer.wtp-timer-low {
  background: var(--mg-bad-fondo);
  border-color: color-mix(in srgb, var(--mg-bad) 45%, transparent);
  color: var(--mg-bad);
}
.wtp-timerbar {
  height: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--mg-text) 12%, transparent);
  overflow: hidden;
}
/* 22/11: transform, no width: se repinta cada 100 ms y así no recalcula la maquetación. */
.wtp-timerbar-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, rgb(var(--theme-ok)), rgb(var(--theme-ok-deep)));
  transform-origin: left;
  transition: transform 120ms linear, background-color 200ms ease;
}
/* 22/11: la pregunta nueva, la explicación y el aviso entran fundidos; antes se cambiaban en seco. */
.wtp-ronda {
  display: grid;
  gap: 10px;
  animation: wtp-entra var(--saga-dur-media, .24s) var(--saga-curva-entra, ease-out) both;
}
.wtp-explain,
.wtp-penalty {
  animation: wtp-entra var(--saga-dur-media, .24s) var(--saga-curva-entra, ease-out) both;
}
@keyframes wtp-entra {
  from { opacity: 0; transform: translateY(6px); }
}
@media (prefers-reduced-motion: reduce) {
  @keyframes wtp-entra { from { opacity: 0; } }
  .wtp-timerbar-fill { transition: background-color 200ms ease; }
}
.wtp-timerbar-fill.wtp-timerbar-low {
  background: var(--mg-bad);
}
.wtp-pregunta {
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 16px;
  background: var(--saga-pizarra-tarjeta);
  border: 1px solid var(--saga-pizarra-raya);
}
.wtp-question {
  font-size: 18px;
  font-weight: 800;
  line-height: 1.3;
  text-wrap: pretty;
}
.wtp-options {
  display: grid;
  gap: 8px;
}
.wtp-option {
  display: grid;
  grid-template-columns: 30px 1fr;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 10px 14px 10px 10px;
  border-radius: 14px;
  border: 1px solid var(--saga-pizarra-borde);
  background: var(--saga-pizarra-tarjeta);
  color: var(--mg-text);
  font: inherit;
  font-size: 16px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
  line-height: 1.3;
  box-shadow: var(--saga-sombra-1);
  transition: background-color .18s ease, border-color .18s ease, box-shadow .18s ease;
}
.wtp-letra {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  font-size: 13px;
  font-weight: 800;
  background: color-mix(in srgb, var(--mg-text) 12%, transparent);
  color: var(--mg-text-2);
}
.wtp-option.wtp-option-picked .wtp-letra {
  background: var(--theme-primary);
  color: var(--mg-on-primary);
}
.wtp-option.wtp-option-correct .wtp-letra {
  background: var(--mg-good);
  color: var(--mg-board);
}
.wtp-option.wtp-option-incorrect .wtp-letra {
  background: var(--mg-bad);
  color: var(--mg-board);
}
.wtp-option:disabled {
  cursor: default;
  box-shadow: none;
}
.wtp-option.wtp-option-picked {
  background: rgba(var(--theme-info), .22);
  border-color: rgba(var(--theme-info), .5);
}
.wtp-option.wtp-option-correct {
  background: color-mix(in srgb, var(--mg-good) 24%, transparent);
  border-color: color-mix(in srgb, var(--mg-good) 60%, transparent);
  animation: wtp-buena .42s cubic-bezier(.2,.8,.3,1);
}
@keyframes wtp-buena {
  from { box-shadow: 0 0 0 0 color-mix(in srgb, var(--mg-good) 55%, transparent); }
  to { box-shadow: 0 0 0 10px color-mix(in srgb, var(--mg-good) 0%, transparent); }
}
@media (prefers-reduced-motion: reduce) {
  .wtp-option.wtp-option-correct { animation: none; }
}
.wtp-option.wtp-option-incorrect {
  background: color-mix(in srgb, var(--mg-bad) 22%, transparent);
  border-color: color-mix(in srgb, var(--mg-bad) 55%, transparent);
  animation: wtp-sacude .38s cubic-bezier(.36,.07,.19,.97);
}
/* 4/11: la opción fallada da una sacudida corta (con reducir movimiento, no). */
@keyframes wtp-sacude {
  15%, 85% { transform: translateX(-3px); }
  30%, 70% { transform: translateX(5px); }
  45%, 55% { transform: translateX(-6px); }
}
@media (prefers-reduced-motion: reduce) {
  .wtp-option.wtp-option-incorrect { animation: none; }
}
.wtp-status {
  font-size: 13px;
  font-weight: 700;
  color: var(--mg-text-2);
  line-height: 1.4;
  text-align: center;
}
.wtp-status.wtp-status-wrong,
.wtp-status.wtp-status-correct {
  border-radius: 12px;
  padding: 8px 12px;
  font-size: 15px;
  font-weight: 800;
}
.wtp-status.wtp-status-wrong {
  color: var(--mg-bad);
  background: color-mix(in srgb, var(--mg-bad) 16%, transparent);
}
.wtp-status.wtp-status-correct {
  color: var(--mg-good);
  background: color-mix(in srgb, var(--mg-good) 16%, transparent);
}
.wtp-explain {
  font-size: 14px;
  color: var(--mg-text-2);
  line-height: 1.4;
  text-align: center;
}
.wtp-penalty {
  font-size: 13px;
  font-weight: 800;
  color: var(--mg-warn);
  text-align: center;
}
`

// 14/11: la ronda se PAUSA con la página oculta (ver `relojDeRonda.ts`).
function useCountdown(
  activeKey: string,
  durationMs: number,
  onExpire: () => void,
  paused: boolean,
  inicioRef: { current: number },
  alReanudar?: () => void
) {
  const [remainingMs, setRemainingMs] = useState(durationMs)
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire
  const alReanudarRef = useRef(alReanudar)
  alReanudarRef.current = alReanudar

  useEffect(() => {
    // 22/11: en pausa (ronda contestada) se queda lo que marcaba. Antes volvía al tiempo entero y, al contestar, el
    // contador y la barra saltaban a «12 s» llenos durante la explicación.
    if (paused) return
    setRemainingMs(Math.max(0, durationMs - (Date.now() - inicioRef.current)))
    let ocultoDesde: number | null = document.visibilityState === 'hidden' ? Date.now() : null
    const reanudar = () => {
      if (ocultoDesde === null || document.visibilityState === 'hidden') return
      inicioRef.current = descontarTiempoOculto(inicioRef.current, ocultoDesde, Date.now())
      ocultoDesde = null
      alReanudarRef.current?.()
    }
    const alCambiarLaVisibilidad = () => {
      if (document.visibilityState === 'hidden') {
        if (ocultoDesde === null) ocultoDesde = Date.now()
      } else reanudar()
    }
    document.addEventListener('visibilitychange', alCambiarLaVisibilidad)
    const interval = window.setInterval(() => {
      // El primer tick tras volver puede llegar antes que el evento: se repone aquí también.
      reanudar()
      if (ocultoDesde !== null) return
      const elapsed = Date.now() - inicioRef.current
      const left = Math.max(0, durationMs - elapsed)
      setRemainingMs(left)
      if (left <= 0) {
        window.clearInterval(interval)
        onExpireRef.current()
      }
    }, 100)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', alCambiarLaVisibilidad)
    }
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

  const claveNodo = String(stage.id ?? '')
  const [guardada] = useState(() => partidas.get(claveNodo))

  const rondaInicial = guardada
    ? Math.max(0, Math.min(guardada.siguiente, baseRounds.length + guardada.extras - 1))
    : 0
  const [roundIndex, setRoundIndex] = useState(rondaInicial)
  const [pickedIndex, setPickedIndex] = useState<number | null>(null)
  const [correctIndex, setCorrectIndex] = useState<number | null>(null)
  /** 31/10: tras un fallo (o sin contestar a tiempo) se marca en verde la buena. Sólo se pinta: no cuenta nada. */
  const [buenaIndex, setBuenaIndex] = useState<number | null>(null)
  const [result, setResult] = useState<RoundResult>('idle')
  const [checking, setChecking] = useState(false)
  const [penaltyAccumMs, setPenaltyAccumMs] = useState(guardada?.penalty ?? 0)
  // La penalización acumulada vive también en un ref: el avance de ronda se
  // decidía DENTRO del actualizador de `setPenaltyAccumMs`, y React (en modo
  // estricto) puede llamar a un actualizador dos veces: dos `advanceOrFinish`,
  // dos temporizadores y una ronda saltada.
  const penaltyRef = useRef(guardada?.penalty ?? 0)
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
  const extrasRef = useRef(guardada?.extras ?? 0)
  const [extrasUsadas, setExtrasUsadas] = useState(guardada?.extras ?? 0)
  const rounds = useMemo(
    () => [...baseRounds, ...extraPool.slice(0, extrasUsadas)],
    [baseRounds, extraPool, extrasUsadas]
  )
  const nRounds = rounds.length > 0 ? rounds.length : Number(cfg.n_rounds) || DEFAULT_N_ROUNDS
  const finishingRef = useRef(false)
  /**
   * 22/11: la pausa de 1,6 s tras contestar seguía corriendo con la hoja ya cerrada: en la última ronda el nodo se daba
   * por superado sin el juego delante y, reabriendo en esa pausa, `onWin` salía dos veces (la del temporizador y la
   * de `terminado`). Se cancela al desmontar; reabrir cierra la partida con lo guardado.
   */
  const pausaRef = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(pausaRef.current), [])
  /**
   * La ronda ya tiene respuesta (pulsada o agotada). Con un ref, no con estado: si el tiempo se acababa mientras se
   * comprobaba la opción pulsada (`await sha256Hex`), contaban las DOS —fallo por tiempo y la respuesta— y se saltaba
   * una ronda (revisión 19/10).
   */
  // Reabierta tras la última ronda ya contestada (`terminado`): esa ronda no se vuelve a jugar.
  const rondaResueltaRef = useRef(guardada?.terminado ? rondaInicial : -1)

  /** Lo que se le cuenta al servidor: cada ronda con su opción y su tiempo. */
  const registroRef = useRef<Array<{ r: number; c: number | null; ms: number }>>(guardada?.registro ?? [])
  const inicioRondaRef = useRef(guardada?.inicio ?? Date.now())
  const fallosRef = useRef(guardada?.fallos ?? 0)

  useEffect(() => {
    // Partida terminada y sin dar por superada: no se reescribe (el efecto de abajo la cierra).
    if (guardada?.terminado) return
    // La ronda que estaba a medias sigue con su reloj; una nueva empieza ahora. Se guarda ya, no al contestar.
    if (!(guardada?.inicio && guardada.siguiente === roundIndex)) inicioRondaRef.current = Date.now()
    partidas.set(claveNodo, {
      siguiente: roundIndex,
      penalty: penaltyRef.current,
      fallos: fallosRef.current,
      extras: extrasRef.current,
      registro: [...registroRef.current],
      inicio: inicioRondaRef.current,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundIndex])

  // 14/11: reabrir con la última ronda ya contestada = darla por superada (antes se volvía a contestar y el registro
  // duplicaba entradas). Mismo cierre que `advanceOrFinish`, con lo guardado.
  useEffect(() => {
    if (!guardada?.terminado || finishingRef.current) return
    finishingRef.current = true
    partidas.delete(claveNodo)
    registrarEvidencia(stage.id ?? '', {
      game: 'trampa_palabras',
      rondas: guardada.registro,
      fallos: guardada.fallos,
      penalty_ms: guardada.penalty,
    })
    void onWin(guardada.penalty)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 15/11: ¿este fallo ha traído una ronda extra? Sólo para decirlo en el aviso («+10 s y una ronda extra»). */
  const [extraAnadida, setExtraAnadida] = useState(false)
  const sumarRondaExtra = () => {
    if (extrasRef.current >= extraPool.length) return
    extrasRef.current += 1
    setExtrasUsadas(extrasRef.current)
    setExtraAnadida(true)
  }

  const round = rounds[roundIndex]
  const rondaEnPantallaRef = useRef(roundIndex)
  rondaEnPantallaRef.current = roundIndex
  const revealed = result !== 'idle'

  // 14/11: contestada la ronda (o sin ronda aún) no hay reto delante: salir de la app ahí no es trampa. La ronda en
  // marcha sí cuenta como reto (la respuesta se puede buscar fuera).
  useSinRetoEnPantalla(revealed || !round)

  /** La ronda en curso con su `inicio` actual: tras pausar por ocultarse, para que recargar no lo pierda. */
  const guardarInicioDeRonda = () => {
    if (guardada?.terminado || finishingRef.current) return
    partidas.set(claveNodo, {
      siguiente: rondaEnPantallaRef.current,
      penalty: penaltyRef.current,
      fallos: fallosRef.current,
      extras: extrasRef.current,
      registro: [...registroRef.current],
      inicio: inicioRondaRef.current,
    })
  }

  const advanceOrFinish = (nextPenaltyAccumMs: number) => {
    partidas.set(claveNodo, {
      siguiente: roundIndex + 1,
      penalty: nextPenaltyAccumMs,
      fallos: fallosRef.current,
      extras: extrasRef.current,
      registro: [...registroRef.current],
      terminado: roundIndex + 1 >= baseRounds.length + extrasRef.current,
    })
    window.clearTimeout(pausaRef.current)
    pausaRef.current = window.setTimeout(() => {
      if (roundIndex + 1 >= baseRounds.length + extrasRef.current) {
        if (finishingRef.current) return
        finishingRef.current = true
        partidas.delete(claveNodo)
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
      setBuenaIndex(null)
      setResult('idle')
      setExtraAnadida(false)
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

  /** La opción buena de la ronda, buscada con el mismo hash que la respuesta (ya contestada: no se adelanta nada). */
  const marcarBuena = async (ronda: WordTrapRound | undefined, ronda0: number) => {
    if (!ronda) return
    for (let i = 0; i < ronda.options.length; i += 1) {
      if ((await sha256Hex(`${ronda.salt}:${i}`)) === ronda.answer_hash) {
        if (rondaEnPantallaRef.current === ronda0) setBuenaIndex(i)
        return
      }
    }
  }

  const handleTimeout = () => {
    if (revealed || !round || rondaResueltaRef.current === roundIndex) return
    rondaResueltaRef.current = roundIndex
    haptics.error()
    registroRef.current.push({ r: roundIndex, c: null, ms: Math.round(timeLimitMs) })
    fallosRef.current += 1
    sumarRondaExtra()
    void mostrarExplicacion(round)
    void marcarBuena(round, roundIndex)
    setResult('timeout')
    setPickedIndex(null)
    setCorrectIndex(null)
    advanceOrFinish(sumarPenalizacion())
  }

  const remainingMs = useCountdown(
    `${roundIndex}`,
    timeLimitMs,
    handleTimeout,
    revealed || !round,
    inicioRondaRef,
    guardarInicioDeRonda
  )

  async function pickOption(index: number) {
    if (revealed || checking || submitting || !round || rondaResueltaRef.current === roundIndex) return
    rondaResueltaRef.current = roundIndex
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
        void marcarBuena(round, roundIndex).catch(() => undefined)
        setResult('wrong')
        advanceOrFinish(sumarPenalizacion())
      }
    } catch {
      // No se pudo comprobar: la ronda sigue abierta (el tiempo o otro toque la resuelven).
      rondaResueltaRef.current = -1
    } finally {
      setChecking(false)
    }
  }

  // 22/11: la ronda contestada, su explicación y el aviso se van fundidos antes de que entre la siguiente (entraban
  // fundidos y se iban en seco). Sólo el dibujo: el reloj de la ronda nueva y `onWin` no esperan.
  // 15/11: las rondas de repuesto (una por fallo, máx. 2) se dicen como tales, no como un «9/8» que no cuadra.
  const rotuloDeRonda =
    roundIndex >= baseRounds.length
      ? t('player.minigames.wordTrap.extraRound')
          .replace('{current}', String(roundIndex - baseRounds.length + 1))
          .replace('{total}', String(extraPool.length))
      : t('player.minigames.wordTrap.round')
          .replace('{current}', String(roundIndex + 1))
          .replace('{total}', String(baseRounds.length || nRounds))
  const rondaVista = useSalidaDePantalla(
    roundIndex,
    round ? (
      <div className="wtp-ronda" key={roundIndex}>
        <div className="wtp-pregunta">
          <span className="wtp-round">{rotuloDeRonda}</span>
          <div className="wtp-question">{round.question}</div>
        </div>

        <div className="wtp-options">
          {round.options.map((option, index) => {
            const isPicked = pickedIndex === index
            const isCorrectReveal = revealed && (correctIndex === index || buenaIndex === index)
            const isWrongPick = revealed && isPicked && correctIndex !== index && buenaIndex !== index
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
                <span className="wtp-letra" aria-hidden="true">
                  {String.fromCharCode(65 + index)}
                </span>
                <span>{option}</span>
              </button>
            )
          })}
        </div>
      </div>
    ) : null
  )
  const explicacionVista = useSalidaDePantalla(
    roundIndex,
    revealed && explicacion ? (
      <div className="wtp-explain" key={roundIndex}>
        {explicacion}
      </div>
    ) : null
  )
  const avisoVisto = useSalidaDePantalla(
    roundIndex,
    penaltyAccumMs > 0 && (result === 'wrong' || result === 'timeout') ? (
      <div className="wtp-penalty" key={roundIndex}>
        {t('player.minigames.wordTrap.penalty').replace('{seconds}', String(Math.round(penaltyAccumMs / 1000)))}
      </div>
    ) : null
  )

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
      ? t('player.minigames.wordTrap.correct')
      : result === 'wrong'
        ? t(extraAnadida ? 'player.minigames.wordTrap.wrongExtra' : 'player.minigames.wordTrap.wrong')
        : result === 'timeout'
          ? t(extraAnadida ? 'player.minigames.wordTrap.timeoutExtra' : 'player.minigames.wordTrap.timeout')
          : tx.leeConCalma

  return (
    <div className="wtp-root">
      <style>{STYLES}</style>
      <div className="wtp-card">
        <div className="wtp-topbar">
          <h2>{tx.titulo}</h2>
          <span className={`wtp-timer${low ? ' wtp-timer-low' : ''}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="13" r="8" />
              <path d="M12 9v4l2.5 2M10 2h4" />
            </svg>
            {secondsLeft}s
          </span>
        </div>

        <div className="wtp-timerbar">
          <div
            className={`wtp-timerbar-fill${low ? ' wtp-timerbar-low' : ''}`}
            style={{ transform: `scaleX(${barRatio})` }}
          />
        </div>

        {rondaVista}

        <div
          className={`wtp-status${result === 'wrong' || result === 'timeout' ? ' wtp-status-wrong' : ''}${
            result === 'correct' ? ' wtp-status-correct' : ''
          }`}
        >
          {statusText}
        </div>

        {explicacionVista}

        {/* 31/10: el aviso sale en la ronda fallada; en las que se aciertan después, no (el total va al resumen del nodo). */}
        {avisoVisto}
      </div>
    </div>
  )
}

export default WordTrapRuntimeScreen
