import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { PlayerStage } from '../../../../types/player'
import type { ResolvedCircuitMatrixMinigame } from '../../core/resolver'
import { normalizeCircuitConfig } from './circuitConfig'
import { buildCircuitPath, isCircuitPathValid, type CellKey } from './circuitPath'

interface Props {
  resolved: ResolvedCircuitMatrixMinigame
  stage: PlayerStage
  helperText: string
  submitting: boolean
  onWin: () => Promise<void>
}

type Phase = 'ready' | 'preview' | 'playing' | 'success' | 'failed'

const STYLES = `
.circuit-shell {
  overflow: hidden;
  border-radius: 24px;
  border: 1px solid rgba(255,255,255,.11);
  background:
    radial-gradient(circle at 50% -18%, rgba(34,197,94,.10), transparent 34%),
    radial-gradient(circle at 80% 18%, rgba(251,146,60,.06), transparent 32%),
    linear-gradient(180deg, rgba(10,15,24,.99), rgba(2,6,23,.99));
  color: #f8fafc;
}

.circuit-topbar,
.circuit-bottombar {
  min-height: 42px;
  padding: 0 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  background: rgba(255,255,255,.045);
}

.circuit-topbar {
  border-bottom: 1px solid rgba(255,255,255,.075);
}

.circuit-bottombar {
  border-top: 1px solid rgba(255,255,255,.075);
}

.circuit-chip {
  min-height: 25px;
  padding: 0 9px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  background: rgba(255,255,255,.065);
  border: 1px solid rgba(255,255,255,.08);
  color: rgba(226,232,240,.84);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .10em;
  text-transform: uppercase;
}

.circuit-chip.ok {
  color: #bbf7d0;
  border-color: rgba(34,197,94,.22);
  background: rgba(34,197,94,.10);
}

.circuit-chip.fail {
  color: #fed7aa;
  border-color: rgba(251,146,60,.22);
  background: rgba(251,146,60,.10);
}

.circuit-body {
  padding: 14px;
  display: grid;
  gap: 12px;
}

.circuit-title-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.circuit-overline {
  color: #86efac;
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .15em;
  text-transform: uppercase;
}

.circuit-title {
  margin: 4px 0 0;
  font-size: clamp(24px, 7vw, 34px);
  line-height: 1;
  font-weight: 950;
  letter-spacing: -.045em;
}

.circuit-brief {
  color: rgba(226,232,240,.64);
  font-size: 12px;
  line-height: 1.34;
  margin-top: 5px;
}

.circuit-mini-stat {
  flex: 0 0 auto;
  min-width: 72px;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,.08);
  background: rgba(255,255,255,.045);
  padding: 8px 9px;
  text-align: right;
}

.circuit-mini-stat strong {
  display: block;
  color: #86efac;
  font-size: 19px;
  line-height: 1;
}

.circuit-mini-stat span {
  display: block;
  color: rgba(226,232,240,.58);
  font-size: 10px;
  font-weight: 850;
  margin-top: 4px;
  text-transform: uppercase;
}

.circuit-status {
  border-radius: 17px;
  border: 1px solid rgba(255,255,255,.075);
  background: rgba(255,255,255,.045);
  padding: 10px 11px;
  display: grid;
  gap: 3px;
}

.circuit-status strong {
  font-size: 16px;
}

.circuit-status span {
  color: rgba(226,232,240,.66);
  font-size: 12px;
  line-height: 1.32;
}

.circuit-board-wrap {
  border-radius: 22px;
  border: 1px solid rgba(255,255,255,.08);
  background:
    radial-gradient(circle at 50% 50%, rgba(34,197,94,.10), transparent 52%),
    rgba(255,255,255,.030);
  padding: 12px;
}

.circuit-board {
  display: grid;
  gap: 7px;
}

.circuit-cell {
  position: relative;
  aspect-ratio: 1;
  min-height: 43px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,.095);
  background: rgba(15,23,42,.86);
  color: rgba(226,232,240,.76);
  display: grid;
  place-items: center;
  font-weight: 950;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.05);
}

.circuit-cell.source {
  border-color: rgba(34,197,94,.28);
}

.circuit-cell.target {
  border-color: rgba(251,146,60,.28);
}

.circuit-cell.preview {
  border-color: rgba(134,239,172,.70);
  background: rgba(34,197,94,.24);
  box-shadow: 0 0 0 2px rgba(34,197,94,.16), 0 0 26px rgba(34,197,94,.24);
  animation: circuitPulse 420ms ease-out;
}

.circuit-cell.done {
  border-color: rgba(34,197,94,.46);
  background: linear-gradient(180deg, rgba(34,197,94,.32), rgba(21,128,61,.24));
  color: #dcfce7;
}

.circuit-cell.last {
  box-shadow: 0 0 0 2px rgba(248,250,252,.12), 0 0 24px rgba(255,255,255,.10);
}

.circuit-cell.wrong {
  animation: circuitWrong 260ms ease-out;
  border-color: rgba(239,68,68,.75);
  background: rgba(127,29,29,.38);
}

.circuit-cell span {
  position: relative;
  z-index: 2;
}

.circuit-meter {
  display: grid;
  gap: 5px;
}

.circuit-meter-label {
  display: flex;
  justify-content: space-between;
  color: rgba(226,232,240,.76);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .05em;
  text-transform: uppercase;
}

.circuit-bar {
  height: 12px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255,255,255,.075);
  border: 1px solid rgba(255,255,255,.075);
}

.circuit-fill {
  height: 100%;
  width: var(--fill);
  border-radius: inherit;
  background: linear-gradient(90deg, #f8fafc, #86efac, #22c55e);
  transition: width 160ms ease;
}

.circuit-fill.err {
  background: linear-gradient(90deg, #22c55e, #f59e0b, #ef4444);
}

.circuit-rules {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}

.circuit-rule {
  border-radius: 15px;
  border: 1px solid rgba(255,255,255,.075);
  background: rgba(255,255,255,.04);
  padding: 8px;
  display: grid;
  gap: 3px;
}

.circuit-rule b {
  font-size: 11px;
}

.circuit-rule span {
  color: rgba(226,232,240,.58);
  font-size: 10px;
  line-height: 1.25;
}

.circuit-final {
  min-height: 260px;
  border-radius: 22px;
  border: 1px solid rgba(255,255,255,.09);
  padding: 18px;
  display: grid;
  place-items: center;
  text-align: center;
}

.circuit-final.success {
  border-color: rgba(34,197,94,.22);
  background:
    radial-gradient(circle at 50% 20%, rgba(34,197,94,.20), transparent 46%),
    rgba(22,163,74,.09);
}

.circuit-final.failed {
  border-color: rgba(251,146,60,.24);
  background:
    radial-gradient(circle at 50% 20%, rgba(251,146,60,.18), transparent 46%),
    rgba(124,45,18,.12);
}

.circuit-final-inner {
  display: grid;
  gap: 10px;
}

.circuit-final-icon {
  width: 76px;
  height: 76px;
  margin: 0 auto;
  border-radius: 999px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255,255,255,.18);
  background: rgba(255,255,255,.06);
  font-size: 38px;
  font-weight: 950;
}

.circuit-final.success .circuit-final-icon {
  color: #bbf7d0;
  border-color: rgba(134,239,172,.35);
  background: rgba(34,197,94,.12);
}

.circuit-final.failed .circuit-final-icon {
  color: #fed7aa;
  border-color: rgba(251,146,60,.35);
  background: rgba(251,146,60,.12);
}

.circuit-final strong {
  font-size: 22px;
}

.circuit-final.success strong {
  color: #bbf7d0;
}

.circuit-final.failed strong {
  color: #fed7aa;
}

.circuit-final span {
  color: rgba(226,232,240,.78);
  font-size: 13px;
  line-height: 1.34;
}

.circuit-actions {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
}

.circuit-button {
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

.circuit-button.secondary {
  background: rgba(255,255,255,.07);
  color: #f8fafc;
}

.circuit-button.success {
  background: linear-gradient(180deg, #86efac, #22c55e);
  color: #052e16;
}

.circuit-button.danger {
  background: #fb923c;
  color: #1c0702;
}

.circuit-button:disabled {
  opacity: .58;
}


.circuit-topbar,
.circuit-title-row,
.circuit-meter,
.circuit-rules {
  display: none !important;
}

.circuit-shell {
  border-radius: 22px;
  border: 1px solid rgba(255,255,255,.09);
  background: #111315;
  color: #f4f4f5;
}

.circuit-body {
  padding: 17px;
  gap: 14px;
}

.circuit-status {
  padding: 0;
  border: 0;
  background: transparent;
  gap: 6px;
}

.circuit-status strong {
  font-size: clamp(23px, 7vw, 30px);
  letter-spacing: -.04em;
}

.circuit-status span {
  font-size: 13px;
  color: rgba(244,244,245,.62);
}

.circuit-board-wrap {
  padding: 9px;
  border-radius: 19px;
  border: 1px solid rgba(255,255,255,.07);
  background: #17191c;
}

.circuit-board {
  gap: 7px;
}

.circuit-cell.source,
.circuit-cell.target {
  border-color: rgba(255,255,255,.07);
}

.circuit-cell {
  min-height: 40px;
  border-radius: 12px;
  border-color: rgba(255,255,255,.07);
  background: #24272b;
  color: #f4f4f5;
}

.circuit-cell.preview {
  border-color: #72df91;
  background: #285d39;
  box-shadow: none;
}

.circuit-cell.done {
  border-color: rgba(114,223,145,.48);
  background: #234a30;
  color: #f4f4f5;
}

.circuit-cell.wrong {
  border-color: #efa15c;
  background: #63391e;
}

.circuit-bottombar {
  padding: 0 17px 17px;
  border: 0;
  background: transparent;
}

.circuit-button {
  min-height: 52px;
  border: 0;
  border-radius: 15px;
  background: #f4f4f5;
  color: #151719;
  text-transform: none;
  letter-spacing: 0;
  font-size: 14px;
}

.circuit-button.secondary {
  border: 1px solid rgba(255,255,255,.1);
  background: #24272b;
  color: #f4f4f5;
}

.circuit-button.success {
  background: #68df8a;
  color: #102416;
}

.circuit-button.danger {
  background: #efa15c;
  color: #2c1608;
}

.circuit-final {
  min-height: 320px;
  border: 0;
  background: transparent !important;
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

export function CircuitMatrixRuntimeScreen({
  resolved,
  stage,
  helperText,
  submitting,
  onWin,
}: Props) {
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

  const [phase, setPhase] = useState<Phase>('ready')
  const [selected, setSelected] = useState<CellKey[]>([])
  const [errors, setErrors] = useState(0)
  const [wrongKey, setWrongKey] = useState<CellKey | null>(null)
  const [previewIndex, setPreviewIndex] = useState(-1)
  const [continuing, setContinuing] = useState(false)
  const continueLockRef = useRef(false)
  const lastTapAtRef = useRef(0)

  const nextKey = path[selected.length]
  const canTapBoard = phase === 'playing'

  useEffect(() => {
    if (phase !== 'preview') return

    setPreviewIndex(0)

    const timers: number[] = []
    path.forEach((_, index) => {
      timers.push(window.setTimeout(() => setPreviewIndex(index), previewCellMs * index))
    })
    timers.push(
      window.setTimeout(
        () => {
          setPreviewIndex(-1)
          setPhase('playing')
        },
        previewCellMs * path.length + 220
      )
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

  const start = useCallback(() => {
    continueLockRef.current = false
    lastTapAtRef.current = 0
    setContinuing(false)

    if (patternMode === 'random_each_game') {
      setRunSeed(`${seed}:${Date.now()}:${Math.random()}`)
    }

    setPhase('preview')
    setSelected([])
    setErrors(0)
    setWrongKey(null)
    setPreviewIndex(-1)
  }, [patternMode, seed])

  const pressCell = useCallback(
    (key: CellKey) => {
      if (!canTapBoard) return

      const now = window.performance.now()
      if (now - lastTapAtRef.current < 160) return
      lastTapAtRef.current = now

      if (selected.includes(key)) return

      if (key !== nextKey) {
        setWrongKey(key)
        window.setTimeout(() => setWrongKey(null), 280)

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
    [canTapBoard, maxErrors, nextKey, path.length, selected]
  )

  const continueRoute = useCallback(async () => {
    if (phase !== 'success' || submitting || continuing || continueLockRef.current) {
      return
    }

    continueLockRef.current = true
    setContinuing(true)

    try {
      await onWin()
    } catch (error) {
      continueLockRef.current = false
      setContinuing(false)
      throw error
    }
  }, [continuing, onWin, phase, submitting])

  if (fixedPatternInvalid) {
    return (
      <section className="circuit-shell" aria-label="Matriz de circuitos">
        <style>{STYLES}</style>

        <div className="circuit-body">
          <div className="circuit-final failed">
            <div className="circuit-final-inner">
              <div className="circuit-final-icon">!</div>
              <strong>Patrón fijo no disponible</strong>
              <span>
                El patrón guardado está incompleto o contiene saltos. Corrígelo en el administrador.
              </span>
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
    <section className="circuit-shell" aria-label="Matriz de circuitos">
      <style>{STYLES}</style>

      <div className="circuit-body">
        {phase === 'success' ? (
          <div className="circuit-final success">
            <div className="circuit-final-inner">
              <div className="circuit-final-icon">✓</div>
              <strong>Nodo completado</strong>
              <span>La matriz vuelve a conducir energía. Puedes continuar la ruta.</span>
            </div>
          </div>
        ) : phase === 'failed' ? (
          <div className="circuit-final failed">
            <div className="circuit-final-inner">
              <div className="circuit-final-icon">!</div>
              <strong>Matriz bloqueada</strong>
              <span>Has quemado demasiadas celdas. Reinicia y memoriza mejor la secuencia.</span>
            </div>
          </div>
        ) : (
          <>
            <div className="circuit-status">
              <strong>
                {phase === 'preview' ? 'Memoriza' : phase === 'playing' ? 'Tu turno' : 'Preparado'}
              </strong>
              <span>
                {phase === 'preview'
                  ? 'La secuencia se muestra una vez.'
                  : phase === 'playing'
                    ? `Repite el recorrido. Te quedan ${Math.max(0, maxErrors - errors)} intentos.`
                    : `Pulsa iniciar cuando estés listo. Tienes ${maxErrors} intentos.`}
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
                  const isPreview = phase === 'preview' && key === path[previewIndex]
                  const isLast =
                    phase === 'playing' &&
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
                      aria-label={`Celda ${row + 1}, ${col + 1}`}
                    >
                      <span>{active ? '•' : isPreview ? '◆' : ''}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}
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
              {submitting || continuing ? 'Guardando…' : 'Continuar'}
            </button>
          ) : phase === 'failed' ? (
            <button
              type="button"
              className="circuit-button danger"
              onClick={start}
              disabled={submitting}
            >
              Reintentar
            </button>
          ) : phase === 'playing' || phase === 'preview' ? (
            <button
              type="button"
              className="circuit-button secondary"
              onClick={reset}
              disabled={submitting}
            >
              Reiniciar
            </button>
          ) : (
            <button type="button" className="circuit-button" onClick={start} disabled={submitting}>
              Iniciar
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

export default CircuitMatrixRuntimeScreen
