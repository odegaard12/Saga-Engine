import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { partidasGuardadas } from '../../core/partidasGuardadas'
import type { PlayerStage } from '../../../../types/player'
import type { ResolvedCircuitMatrixMinigame } from '../../core/resolver'
import { normalizeCircuitConfig } from './circuitConfig'
import { buildCircuitPath, isCircuitPathValid, type CellKey } from './circuitPath'
import { useRegenerarAoOcultar } from '../../core/useRegenerarAoOcultar'
import { useTextos } from '../../core/useTextos'
import { useSinRetoEnPantalla } from '../../../hooks/useSinRetoEnPantalla'
import { usePresencia, useValorCongelado } from '../../../ui/movimiento'

interface Props {
  resolved: ResolvedCircuitMatrixMinigame
  stage: PlayerStage
  helperText: string
  submitting: boolean
  /** `false` = el nodo no se aceptó: el botón Continuar tiene que volver a servir. */
  onWin: (penaltyMs?: number) => Promise<void | boolean>
  /** El reloj del nodo no corre hasta aquí: lo arranca Comenzar. */
  onComezar?: () => void
}

type Phase = 'ready' | 'preview' | 'playing' | 'success' | 'failed'

/** Lo que se queda el patrón completo en pantalla antes de que sea tu turno. */
const PATRON_ENTEIRO_MS = 1600

const STYLES = `
.circuit-shell {
  overflow: hidden;
  border-radius: var(--theme-radius-panel, 22px);
  border: 1px solid rgba(var(--a-texto-rgb, 255, 255, 255), .09);
  background: var(--mg-board);
  color: var(--mg-text);
}

.circuit-bottombar {
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 17px 17px;
  border: 0;
  background: transparent;
}

.circuit-body {
  position: relative;
  display: grid;
  padding: 17px;
  gap: 14px;
}

/* 21/11: el tablero no se desmonta al fallar o ganar: se funde y el cartel entra ENCIMA, en su mismo hueco. Antes se
   cambiaba uno por otro en seco y, como el cartel es más bajo, la hoja entera saltaba 70 px; al reintentar, otra vez. */
.circuit-juego {
  display: grid;
  gap: 14px;
  transition: opacity var(--saga-dur-media) var(--saga-curva-entra);
}

.circuit-juego.tapado {
  opacity: 0;
  visibility: hidden;
  transition: opacity var(--saga-dur-media) var(--saga-curva-sale), visibility 0s linear var(--saga-dur-media);
}

.circuit-status {
  border-radius: var(--theme-radius-card, 17px);
  display: grid;
  gap: 6px;
  padding: 0;
  border: 0;
  background: transparent;
}

.circuit-status strong {
  font-size: clamp(23px, 7vw, 30px);
  letter-spacing: -.04em;
}

.circuit-status span {
  /* Sitio fijo para tres renglones: el texto cambia en cada fase y con cada fallo (cuenta atrás, memoriza, «te queda
     1 fallo…») y, al cambiar de renglones, la hoja entera daba un saltito. */
  min-height: calc(3em * 1.32);
  line-height: 1.32;
  font-size: 13px;
  color: rgba(var(--a-texto-rgb, 244, 244, 245), .62);
}

.circuit-board-wrap {
  border-radius: var(--theme-radius-panel, 19px);
  border: 1px solid rgba(var(--a-texto-rgb, 255, 255, 255), .07);
  background: var(--mg-deep);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 8px 32px rgba(var(--theme-ink-deep, 0, 0, 0), 0.3), inset 0 0 20px rgba(var(--theme-done), 0.05);
  padding: 9px;
}

.circuit-board {
  display: grid;
  gap: 7px;
}

.circuit-cell {
  position: relative;
  aspect-ratio: 1;
  min-height: 40px;
  border-radius: var(--theme-radius-card, 12px);
  border: 1px solid rgba(var(--a-texto-rgb, 255, 255, 255), .07);
  background: var(--mg-cell);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: var(--mg-text);
  display: grid;
  place-items: center;
  font-weight: 950;
  box-shadow: inset 0 1px 0 rgba(var(--a-texto-rgb, 255, 255, 255), .1), 0 4px 10px rgba(var(--theme-ink-deep, 0, 0, 0), 0.3);
  transition: background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
}

.circuit-cell::after { content: ''; position: absolute; inset: -3px; } /* toque: media separación a cada lado, sin solaparse con la vecina */

.circuit-cell:active {
  transform: scale(0.92);
}

.circuit-cell.preview {
  border-color: var(--mg-good);
  background: var(--mg-good-fondo);
  box-shadow: none;
  animation: circuitPulse 1s infinite alternate;
}

.circuit-cell.done {
  border-color: color-mix(in srgb, var(--mg-good) 48%, transparent);
  background: var(--mg-good-fondo);
  color: var(--mg-text);
  box-shadow: 0 0 20px rgba(var(--theme-done), .3);
  text-shadow: 0 0 5px rgba(var(--a-texto-rgb, 255, 255, 255), 0.8);
}

.circuit-cell.last {
  box-shadow: 0 0 0 2px rgba(var(--a-texto-rgb, 248, 250, 252), .3), 0 0 24px rgba(var(--a-texto-rgb, 255, 255, 255), .2);
}

.circuit-cell.done.last {
  /* 5/11: acierto en la casilla: un latido verde, una vez. */
  animation: circuitAcierto 360ms ease-out;
}

@keyframes circuitAcierto {
  0% { transform: scale(1); box-shadow: 0 0 0 0 color-mix(in srgb, var(--mg-good) 90%, transparent); }
  45% { transform: scale(1.14); box-shadow: 0 0 0 8px color-mix(in srgb, var(--mg-good) 35%, transparent); }
  100% { transform: scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .circuit-cell.done.last { animation: none; }
}

.circuit-cell.wrong {
  animation: circuitWrong 400ms ease-out;
  border-color: var(--mg-bad);
  background: var(--mg-bad-fondo);
  box-shadow: 0 0 20px color-mix(in srgb, var(--mg-bad) 50%, transparent), inset 0 0 20px color-mix(in srgb, var(--mg-bad) 50%, transparent);
}

.circuit-cell span {
  position: relative;
  z-index: 2;
}

.circuit-actions {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
}

.circuit-button {
  min-height: 52px;
  border: 0;
  border-radius: var(--theme-radius-card, 15px);
  background: var(--theme-primary);
  color: var(--mg-on-primary);
  font-size: 14px;
  font-weight: 950;
  letter-spacing: 0;
  text-transform: none;
  /* Es el mismo botón en todas las fases: al pasar de Reintentar a Reiniciar o a Continuar cambia de color fundiéndose. */
  transition: background-color var(--saga-dur-media) ease, border-color var(--saga-dur-media) ease, color var(--saga-dur-media) ease, opacity var(--saga-dur-rapida) ease;
}

.circuit-button.secondary {
  border: 1px solid rgba(var(--a-texto-rgb, 255, 255, 255), .1);
  background: var(--mg-cell);
  color: var(--mg-text);
}

.circuit-button.success {
  background: var(--theme-primary);
  color: var(--mg-on-primary);
}

.circuit-button.danger {
  border: 1px solid var(--mg-bad);
  background: var(--mg-bad-fondo);
  color: var(--mg-text);
}

.circuit-button:disabled {
  opacity: .58;
}

.circuit-final {
  min-height: 320px;
  border-radius: var(--theme-radius-panel, 22px);
  border: 0;
  background: transparent !important;
  padding: 18px;
  display: grid;
  place-items: center;
  text-align: center;
}

.circuit-final.encima {
  position: absolute;
  inset: 17px;
  min-height: 0;
  opacity: 1;
  transition: opacity var(--saga-dur-media) var(--saga-curva-entra);
}

.circuit-final.encima[data-estado="entrando"],
.circuit-final.encima[data-estado="saliendo"] {
  opacity: 0;
}

.circuit-final.encima[data-estado="saliendo"] {
  transition-timing-function: var(--saga-curva-sale);
}

.circuit-final.success {
  border-color: rgba(var(--theme-done), .22);
  background:
    radial-gradient(circle at 50% 20%, rgba(var(--theme-done), .20), transparent 46%),
    color-mix(in srgb, var(--mg-good) 9%, transparent);
}

.circuit-final.failed {
  border-color: color-mix(in srgb, var(--mg-warn) 24%, transparent);
  background:
    radial-gradient(circle at 50% 20%, color-mix(in srgb, var(--mg-warn) 18%, transparent), transparent 46%),
    color-mix(in srgb, var(--mg-warn) 12%, transparent);
}

.circuit-final-inner {
  display: grid;
  gap: 10px;
}

.circuit-final-icon {
  width: 76px;
  height: 76px;
  margin: 0 auto;
  border-radius: var(--theme-radius-pill, 999px);
  display: grid;
  place-items: center;
  border: 1px solid rgba(var(--a-texto-rgb, 255, 255, 255), .18);
  background: rgba(var(--a-texto-rgb, 255, 255, 255), .06);
  font-size: 38px;
  font-weight: 950;
}

.circuit-final.success .circuit-final-icon {
  color: var(--mg-good);
  border-color: rgba(var(--theme-done-soft), .35);
  background: rgba(var(--theme-done), .12);
}

.circuit-final.failed .circuit-final-icon {
  color: var(--mg-warn);
  border-color: color-mix(in srgb, var(--mg-warn) 35%, transparent);
  background: color-mix(in srgb, var(--mg-warn) 12%, transparent);
}

.circuit-final strong {
  font-size: 22px;
}

.circuit-final.success strong {
  color: var(--mg-good);
}

.circuit-final.failed strong {
  color: var(--mg-warn);
}

.circuit-final span {
  color: rgba(var(--a-texto-rgb, 226, 232, 240), .78);
  font-size: 13px;
  line-height: 1.34;
}

@keyframes circuitPulse {
  0% { transform: scale(.94); }
  100% { transform: scale(1); }
}

@keyframes circuitWrong {
  0% { transform: translateX(0); }
  35% { transform: translateX(-2px); }
  70% { transform: translateX(2px); }
  100% { transform: translateX(0); }
}
`

/**
 * Los fallos de cada nodo, sumando todos los intentos, fuera del componente
 * (como `nodeClock`). Revisión 19/10: «Reiniciar» (o salir y volver) ponía los
 * errores a 0 y la penalización de `onWin` sólo contaba los del último
 * intento: fallar mucho y reiniciar salía gratis. Se borra al ganar.
 */
const fallosPorNodo = partidasGuardadas<number>('logic_circuit')

export function CircuitMatrixRuntimeScreen({
  resolved,
  stage,
  helperText,
  submitting,
  onWin,
  onComezar,
}: Props) {
  const textos = useTextos()
  const t = textos.circuit
  const cfg = resolved.config as unknown as Record<string, unknown>
  const stageRecord = stage as unknown as Record<string, unknown>
  const stageSeed = [
    stageRecord.id ?? stageRecord.stage_id ?? '',
    stageRecord.index ?? stageRecord.order ?? '',
    stageRecord.title ?? '',
  ].join(':')

  const runtimeConfig = normalizeCircuitConfig(cfg, stageSeed)
  const { rows, cols, pathLength, previewCellMs, maxErrors, seed, patternMode, fixedPath } =
    runtimeConfig

  const [runSeed, setRunSeed] = useState(() => `${seed}:${Date.now()}:${Math.random()}`)

  const randomPath = useMemo(
    () => buildCircuitPath(rows, cols, pathLength, runSeed),
    [cols, pathLength, rows, runSeed]
  )

  const fixedPathKey = fixedPath.join('|')

  const fixedPatternValid = fixedPath.length >= 4 && isCircuitPathValid(fixedPath, rows, cols)

  const fixedPatternInvalid = patternMode === 'fixed' && !fixedPatternValid

  const path = useMemo(
    () => (patternMode === 'fixed' && fixedPatternValid ? fixedPath : randomPath),
    [fixedPathKey, fixedPatternValid, patternMode, randomPath]
  )

  const alReves = resolved.config.reverse === true

  const [phase, setPhase] = useState<Phase>('ready')
  // El cartel de fin (ganado o bloqueado) entra y sale fundido; mientras sale, el que era.
  const enFinal = phase === 'success' || phase === 'failed'
  const finalPresencia = usePresencia(enFinal)
  const faseFinal = useValorCongelado(phase, enFinal)
  const [selected, setSelected] = useState<CellKey[]>([])
  const [errors, setErrors] = useState(0)
  // Mientras el tablero se funde bajo el cartel sigue diciendo lo de antes (no «Preparado» con la partida acabada).
  const faseTablero = useValorCongelado(phase, !enFinal)
  const fallosTablero = useValorCongelado(errors, !enFinal)
  const claveNodo = String(stageRecord.id ?? stageRecord.stage_id ?? '')
  const fallosTotalesRef = useRef(fallosPorNodo.get(claveNodo) ?? 0)
  const [wrongKey, setWrongKey] = useState<CellKey | null>(null)
  const [previewIndex, setPreviewIndex] = useState(-1)
  const [continuing, setContinuing] = useState(false)
  const continueLockRef = useRef(false)
  const lastTapAtRef = useRef(0)

  const canTapBoard = phase === 'playing'

  /**
   * Al acabar el destello, el patron entero se queda un momento en pantalla.
   *
   * Iban encendiendose las celdas una a una y al terminar se apagaba todo de
   * golpe: quien perdia el hilo a la mitad ya no tenia forma de recomponerlo, y
   * el reto pasaba de acordarse a no despistarse ni un segundo. Viendolo
   * completo se puede repasar el recorrido antes de empezar.
   */
  const [patronEnteroVisible, setPatronEnteroVisible] = useState(false)

  useEffect(() => {
    if (phase !== 'preview') {
      setPatronEnteroVisible(false)
      return
    }

    setPreviewIndex(0)
    setPatronEnteroVisible(false)

    const timers: number[] = []
    path.forEach((_, index) => {
      timers.push(window.setTimeout(() => setPreviewIndex(index), previewCellMs * index))
    })

    const finDoDestello = previewCellMs * path.length + 220

    // El recorrido completo, encendido a la vez.
    timers.push(
      window.setTimeout(() => {
        setPreviewIndex(-1)
        setPatronEnteroVisible(true)
      }, finDoDestello)
    )

    timers.push(
      window.setTimeout(() => {
        setPatronEnteroVisible(false)
        setPhase('playing')
      }, finDoDestello + PATRON_ENTEIRO_MS)
    )

    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [path, phase, previewCellMs])

  const reset = useCallback(() => {
    continueLockRef.current = false
    lastTapAtRef.current = 0
    setContinuing(false)
    setPhase('ready')
    setSelected([])
    setErrors(0)
    setWrongKey(null)
    setPreviewIndex(-1)
  }, [])

  /**
   * Antitrampas: captura el patrón, sale de la app, lo resuelve con calma.
   *
   * `preview` es justo el momento en que el patrón está en pantalla para
   * memorizarlo -el instante que se capturaría-, y `playing` es mientras se
   * reproduce de memoria. Salir en cualquiera de las dos manda de vuelta a
   * "Comenzar": el siguiente intento saca un patrón nuevo si
   * `patternMode` es `random_each_game` -ver `start()`-, así que la
   * captura vieja deja de servir. No se descuenta nada aparte: el reloj
   * del nodo sigue corriendo igual, la trampa simplemente deja de
   * funcionar.
   */
  useRegenerarAoOcultar(phase === 'preview' || phase === 'playing', reset)

  /**
   * Oculta durante la memorización, sea como sea: la ronda vuelve a empezar.
   *
   * Lo de arriba sólo salta si el jugador SE FUE (no con el autobloqueo). Pero
   * los temporizadores del destello siguen corriendo con la página oculta, y
   * al volver ya ponía «Tu turno» sin haber visto el patrón. Aquí no es castigo
   * —ni errores ni nada—: es volver a la cuenta atrás para enseñarlo entero.
   */
  useEffect(() => {
    if (phase !== 'preview') return undefined
    // 11/11: si el destello arranca con la página YA oculta no hay «cambio» que oír: se comprueba también al montar.
    if (document.visibilityState === 'hidden') {
      reset()
      return undefined
    }
    const alCambiar = () => {
      if (document.visibilityState === 'hidden') reset()
    }
    document.addEventListener('visibilitychange', alCambiar)
    return () => document.removeEventListener('visibilitychange', alCambiar)
  }, [phase, reset])

  // La cuenta atrás de antes de empezar y las pantallas de resultado no tienen
  // patrón que capturar: salir de la app ahí no cuenta.
  useSinRetoEnPantalla(phase !== 'preview' && phase !== 'playing')

  const start = useCallback(() => {
    continueLockRef.current = false
    lastTapAtRef.current = 0
    setContinuing(false)

    if (patternMode === 'random_each_game') {
      setRunSeed(`${seed}:${Date.now()}:${Math.random()}`)
    }

    onComezar?.()
    setPhase('preview')
    setSelected([])
    setErrors(0)
    setWrongKey(null)
    setPreviewIndex(-1)
  }, [patternMode, seed, onComezar])

  /**
   * La secuencia arranca sola tras una cuenta atrás de 3.
   *
   * Antes había que pulsar "Iniciar" y el cronómetro del nodo ya iba corriendo
   * mientras tanto: tiempo muerto que no servía para nada. Y no vale con
   * arrancar el reloj al pulsar, porque entonces se podía dejar la pantalla
   * quieta el rato que hiciese falta. Así el patrón y la cuenta empiezan juntos.
   */
  const [cuentaAtras, setCuentaAtras] = useState<number | null>(null)

  useEffect(() => {
    if (phase !== 'ready') {
      setCuentaAtras(null)
      return
    }

    setCuentaAtras(3)
    const id = window.setInterval(() => {
      setCuentaAtras((valor) => {
        if (valor === null) return null
        // 11/11: con la app oculta la cuenta atrás espera; si no, el patrón se enseñaba sin nadie mirando.
        if (document.visibilityState === 'hidden') return valor
        if (valor <= 1) {
          window.clearInterval(id)
          return 0
        }
        return valor - 1
      })
    }, 1000)

    return () => window.clearInterval(id)
  }, [phase, runSeed])

  useEffect(() => {
    if (phase !== 'ready' || cuentaAtras !== 0) return
    start()
  }, [phase, cuentaAtras, start])

  const pressCell = useCallback(
    (key: CellKey) => {
      if (!canTapBoard) return

      const now = window.performance.now()
      if (now - lastTapAtRef.current < 160) return
      lastTapAtRef.current = now

      if (selected.includes(key)) return

      /**
       * Vale en cualquier orden.
       *
       * Habia que repetir el recorrido en la misma secuencia exacta, y eso son
       * dos cosas a la vez: acordarse de QUE casillas y ademas de EN QUE ORDEN.
       * Lo segundo es lo que lo hacia cuesta arriba, y no es lo que el nodo
       * quiere medir. Ahora basta con dar con las casillas del trazado; el
       * orden da igual.
       */
      // Niveles (30/10): con `reverse` el camino se repite AL REVÉS y en orden (del último al primero); si no, como
      // siempre, vale cualquier orden.
      const esperada = alReves ? path[path.length - 1 - selected.length] : null
      if (!path.includes(key) || (esperada !== null && key !== esperada)) {
        setWrongKey(key)
        window.setTimeout(() => setWrongKey(null), 280)
        fallosTotalesRef.current += 1
        fallosPorNodo.set(claveNodo, fallosTotalesRef.current)

        setErrors((value) => {
          const next = Math.min(maxErrors, value + 1)
          if (next >= maxErrors) setPhase('failed')
          return next
        })
        return
      }

      const nextSelected = [...selected, key]
      setSelected(nextSelected)

      if (nextSelected.length === path.length) {
        continueLockRef.current = false
        setContinuing(false)
        setPhase('success')
      }
    },
    [alReves, canTapBoard, claveNodo, maxErrors, path, selected]
  )

  const continueRoute = useCallback(async () => {
    if (phase !== 'success' || submitting || continuing || continueLockRef.current) {
      return
    }

    continueLockRef.current = true
    setContinuing(true)

    try {
      // Cada fallo suma 5 s al tiempo del nodo. Antes sólo gastaba intentos:
      // quien acertaba a la tercera quedaba igual que quien clavó el recorrido
      // a la primera. Cuentan los fallos de TODOS los intentos (revisión 19/10).
      const superado = await onWin(fallosTotalesRef.current * 5000)
      if (superado !== false) fallosPorNodo.delete(claveNodo)

      // El nodo no se aceptó: se suelta el «Guardando…» y Continuar vuelve a
      // servir, en vez de quedarse pegado.
      if (superado === false) {
        continueLockRef.current = false
        setContinuing(false)
      }
    } catch (error) {
      continueLockRef.current = false
      setContinuing(false)
      throw error
    }
  }, [claveNodo, continuing, onWin, phase, submitting])

  if (fixedPatternInvalid) {
    return (
      <section className="circuit-shell saga-glass-panel" aria-label={t.aria}>
        <style>{STYLES}</style>

        <div className="circuit-body">
          <div className="circuit-final failed">
            <div className="circuit-final-inner">
              <div className="circuit-final-icon">!</div>
              <strong>{t.patronNoDisponible}</strong>
              <span>{t.patronRoto}</span>
            </div>
          </div>
        </div>
      </section>
    )
  }

  const boardStyle = {
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
  } as CSSProperties
  return (
    <section className="circuit-shell saga-glass-panel" aria-label={t.aria}>
      <style>{STYLES}</style>

      <div className="circuit-body">
        {finalPresencia.montada ? (
          <div
            className={`circuit-final encima ${faseFinal === 'success' ? 'success' : 'failed'}`}
            data-estado={finalPresencia.estado}
            onTransitionEnd={finalPresencia.alTerminar}
          >
            {faseFinal === 'success' ? (
              <div className="circuit-final-inner">
                <div className="circuit-final-icon">✓</div>
                <strong>{t.completado}</strong>
                {/* 30/10: los fallos que se cobran son los de TODOS los intentos, no sólo los de éste. */}
                <span>
                  {fallosTotalesRef.current > 0 ? t.exitoConFallos(fallosTotalesRef.current) : t.exitoLimpio}
                </span>
              </div>
            ) : (
              <div className="circuit-final-inner">
                <div className="circuit-final-icon">!</div>
                <strong>{t.bloqueada}</strong>
                <span>{t.bloqueadaDetalle}</span>
              </div>
            )}
          </div>
        ) : null}
        {/* aria-hidden mientras lo tapa el cartel: no se lee ni se toca lo que no se ve. */}
        <div className={`circuit-juego${enFinal ? ' tapado' : ''}`} aria-hidden={enFinal ? true : undefined}>
            <div className="circuit-status">
              <strong>
                {faseTablero === 'preview' ? t.memoriza : faseTablero === 'playing' ? (alReves ? t.alReves : t.tuTurno) : t.preparado}
              </strong>
              <span>
                {faseTablero === 'preview'
                  ? t.fijate
                  : faseTablero === 'playing'
                    ? // 4/11: al revés decía «en el orden que quieras» debajo de «Al revés: del último al primero».
                      (alReves ? t.marcaAlReves : t.marca)(Math.max(0, maxErrors - fallosTablero))
                    : cuentaAtras !== null && cuentaAtras > 0
                      ? t.cuentaAtras(cuentaAtras)
                      : t.tienes(maxErrors)}
              </span>
            </div>

            <div className="circuit-board-wrap">
              <div className="circuit-board" style={boardStyle}>
                {Array.from({ length: rows * cols }, (_, index) => {
                  const row = Math.floor(index / cols)
                  const col = index % cols
                  const key = `${row}:${col}` as CellKey
                  const active = selected.includes(key)
                  const isWrong = key === wrongKey
                  const isPreview =
                    faseTablero === 'preview' &&
                    (key === path[previewIndex] || (patronEnteroVisible && path.includes(key)))
                  const isLast =
                    faseTablero === 'playing' &&
                    selected.length > 0 &&
                    key === selected[selected.length - 1]

                  return (
                    <button
                      key={key}
                      type="button"
                      className={[
                        'circuit-cell',
                        active ? 'done' : '',
                        isPreview ? 'preview' : '',
                        isLast ? 'last' : '',
                        isWrong ? 'wrong' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => pressCell(key)}
                      aria-label={t.celda(row + 1, col + 1)}
                    >
                      <span>{isWrong ? '✕' : active ? '•' : isPreview ? '◆' : ''}</span>
                    </button>
                  )
                })}
              </div>
            </div>
        </div>
      </div>

      <div className="circuit-bottombar">
        <div className="circuit-actions">
          {phase === 'success' ? (
            <button
              type="button"
              className="circuit-button success"
              onClick={() => void continueRoute()}
              disabled={submitting || continuing}
            >
              {submitting || continuing ? textos.juego.guardando : textos.juego.continuar}
            </button>
          ) : phase === 'failed' ? (
            <button
              type="button"
              className="circuit-button danger"
              onClick={start}
              disabled={submitting}
            >
              {textos.juego.reintentar}
            </button>
          ) : phase === 'playing' || phase === 'preview' ? (
            <button
              type="button"
              className="circuit-button secondary"
              onClick={reset}
              disabled={submitting}
            >
              {t.reiniciar}
            </button>
          ) : (
            // Arranca sola: el botón sólo sirve para adelantar la cuenta atrás.
            <button type="button" className="circuit-button" onClick={start} disabled={submitting}>
              {cuentaAtras !== null && cuentaAtras > 0 ? t.empezarYa(cuentaAtras) : t.empezar}
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

export default CircuitMatrixRuntimeScreen
