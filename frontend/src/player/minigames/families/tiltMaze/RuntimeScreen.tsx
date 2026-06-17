import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { PlayerStage } from '../../../../types/player'
import type {
  ResolvedCircuitMatrixMinigame,
} from '../../core/resolver'
import {
  generateTiltMaze,
  nextTiltMazeCell,
  WALL_DOWN,
  WALL_LEFT,
  WALL_RIGHT,
  WALL_UP,
  type TiltDirection,
} from '../../../../shared/tiltMaze'

type Props = {
  resolved: ResolvedCircuitMatrixMinigame
  stage: PlayerStage
  helperText: string
  submitting: boolean
  onWin: () => Promise<void>
}

type Phase =
  | 'ready'
  | 'playing'
  | 'success'
  | 'failed'

const CSS = `
.tilt-shell,.tilt-shell *{box-sizing:border-box}
.tilt-shell{width:100%;overflow:hidden;border:1px solid rgba(255,255,255,.09);border-radius:22px;background:radial-gradient(circle at 50% -12%,rgba(34,197,94,.14),transparent 35%),#111315;color:#f4f4f5}
.tilt-body{display:grid;gap:13px;padding:15px}
.tilt-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.tilt-head h2{margin:0;font-size:clamp(23px,7vw,31px);line-height:1;font-weight:950;letter-spacing:-.045em}
.tilt-head p{margin:6px 0 0;color:rgba(244,244,245,.62);font-size:12px;line-height:1.4}
.tilt-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
.tilt-stat{padding:8px;border:1px solid rgba(255,255,255,.08);border-radius:13px;background:rgba(255,255,255,.045);text-align:center}
.tilt-stat strong{display:block;color:#72df91;font-size:17px}
.tilt-stat span{display:block;margin-top:3px;color:rgba(244,244,245,.48);font-size:8px;font-weight:900;text-transform:uppercase}
.tilt-board-wrap{padding:7px;border:1px solid rgba(255,255,255,.08);border-radius:20px;background:#090a0b}
.tilt-board{display:grid;width:100%;max-width:540px;margin:auto;overflow:hidden;border:4px solid #8d99a8;border-radius:14px;background:#17191c;aspect-ratio:1}
.tilt-cell{position:relative;display:grid;place-items:center;min-width:0;min-height:0;border-style:solid;border-color:#7d8794;background:#17191c}
.tilt-cell.goal{background:#1d315c}
.tilt-cell.hole{background:#35181d}
.tilt-cell.item{background:#403419}
.tilt-ball{width:62%;height:62%;border-radius:999px;background:radial-gradient(circle at 35% 30%,#fff 0 8%,#a7f3d0 15%,#22c55e 58%,#166534 100%);box-shadow:0 4px 12px rgba(34,197,94,.52);z-index:3}
.tilt-mark{font-size:clamp(8px,2.2vw,17px);font-weight:950}
.tilt-help{min-height:42px;padding:10px 11px;border:1px solid rgba(255,255,255,.07);border-radius:13px;background:#17191c;color:rgba(244,244,245,.67);font-size:11px;line-height:1.45;text-align:center}
.tilt-actions{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.tilt-actions button,.tilt-primary{min-height:46px;padding:10px;border:1px solid rgba(255,255,255,.1);border-radius:13px;background:#202327;color:#f4f4f5;font-weight:950;cursor:pointer}
.tilt-primary{width:100%;border-color:#22c55e;background:#22c55e;color:#102016}
.tilt-pad{display:grid;grid-template-columns:repeat(3,58px);grid-template-rows:repeat(2,52px);justify-content:center;gap:7px}
.tilt-pad button{border:1px solid rgba(255,255,255,.1);border-radius:14px;background:#202327;color:#fff;font-size:22px;font-weight:950}
.tilt-pad .up{grid-column:2}.tilt-pad .left{grid-column:1}.tilt-pad .down{grid-column:2}.tilt-pad .right{grid-column:3}
.tilt-result{display:grid;gap:14px;padding:24px 16px;text-align:center}
.tilt-result-icon{display:grid;width:70px;height:70px;margin:auto;place-items:center;border-radius:999px;background:#17321f;color:#72df91;font-size:32px}
.tilt-result.fail .tilt-result-icon{background:#35181d;color:#fda4af}
.tilt-result h2{margin:0;font-size:27px}.tilt-result p{margin:0;color:rgba(244,244,245,.62);font-size:13px;line-height:1.5}
.tilt-sensor{color:#72df91;font-size:10px;font-weight:900;text-align:center}
@media(max-width:430px){.tilt-body{padding:12px}.tilt-pad{grid-template-columns:repeat(3,54px)}}
`

function clamp(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(value)

  return Math.max(
    minimum,
    Math.min(
      maximum,
      Number.isFinite(parsed)
        ? Math.round(parsed)
        : fallback,
    ),
  )
}

function haptic(
  pattern: number | number[],
) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // Optional capability.
  }
}

export function TiltMazeRuntimeScreen({
  resolved,
  stage,
  helperText,
  submitting,
  onWin,
}: Props) {
  const config = resolved.config

  const rows = clamp(
    config.grid_rows,
    9,
    5,
    13,
  )

  const cols = clamp(
    config.grid_cols,
    9,
    5,
    13,
  )

  const initialLives = clamp(
    config.lives,
    3,
    1,
    5,
  )

  const timeLimit = clamp(
    config.time_limit_s,
    75,
    20,
    180,
  )

  const threshold = clamp(
    config.tilt_threshold,
    12,
    6,
    30,
  )

  const cooldown = clamp(
    config.step_cooldown_ms,
    360,
    180,
    800,
  )

  const baseSeed = String(
    config.maze_seed ||
    'saga-maze',
  )

  const patternMode =
    config.pattern_mode ===
    'random_each_game'
      ? 'random_each_game'
      : 'fixed'

  const [sessionSeed] =
    useState(() =>
      patternMode ===
      'random_each_game'
        ? [
            baseSeed,
            Date.now().toString(36),
            Math.random()
              .toString(36)
              .slice(2),
          ].join('-')
        : baseSeed,
    )

  const maze = useMemo(
    () =>
      generateTiltMaze({
        rows,
        cols,
        seed: sessionSeed,
        holeCount: clamp(
          config.hole_count,
          4,
          0,
          18,
        ),
        collectibleCount:
          clamp(
            config.collectible_count,
            2,
            0,
            6,
          ),
      }),
    [
      rows,
      cols,
      sessionSeed,
      config.hole_count,
      config.collectible_count,
    ],
  )

  const [phase, setPhase] =
    useState<Phase>('ready')

  const [position, setPosition] =
    useState(maze.start)

  const [lives, setLives] =
    useState(initialLives)

  const [remaining, setRemaining] =
    useState(timeLimit)

  const [collected, setCollected] =
    useState<Set<number>>(
      () => new Set(),
    )

  const [message, setMessage] =
    useState('')

  const [failure, setFailure] =
    useState('')

  const [sensorActive, setSensorActive] =
    useState(false)

  const [sensorText, setSensorText] =
    useState(
      'Botones táctiles disponibles',
    )

  const [continuing, setContinuing] =
    useState(false)

  const baselineRef =
    useRef<{
      beta: number
      gamma: number
    } | null>(null)

  const lastStepRef = useRef(0)
  const continueLockRef =
    useRef(false)

  const moveRef =
    useRef<
      (direction: TiltDirection) =>
        void
    >(() => undefined)

  const holeSet =
    useMemo(
      () => new Set(maze.holes),
      [maze.holes],
    )

  const itemSet =
    useMemo(
      () =>
        new Set(maze.collectibles),
      [maze.collectibles],
    )

  const allCollected =
    collected.size >=
    maze.collectibles.length

  useEffect(() => {
    setPosition(maze.start)
    setLives(initialLives)
    setRemaining(timeLimit)
    setCollected(new Set())
  }, [
    maze,
    initialLives,
    timeLimit,
  ])

  const move = useCallback(
    (direction: TiltDirection) => {
      if (phase !== 'playing') {
        return
      }

      const next =
        nextTiltMazeCell(
          maze,
          position,
          direction,
        )

      if (next === null) {
        haptic(10)
        setMessage(
          'Pared. Busca otra dirección.',
        )
        return
      }

      const nextCollected =
        new Set(collected)

      if (itemSet.has(next)) {
        nextCollected.add(next)
        setCollected(nextCollected)
        haptic([12, 20, 22])
        setMessage(
          'Objeto recogido.',
        )
      } else {
        setMessage('')
      }

      if (holeSet.has(next)) {
        const nextLives = lives - 1

        haptic([50, 40, 50])
        setLives(nextLives)

        if (nextLives <= 0) {
          setFailure(
            'Has perdido todas las vidas.',
          )
          setPhase('failed')
          return
        }

        setPosition(maze.start)
        setMessage(
          'Caíste en un agujero. Vuelves al inicio.',
        )
        return
      }

      setPosition(next)

      if (next === maze.goal) {
        if (
          nextCollected.size >=
          maze.collectibles.length
        ) {
          haptic([20, 35, 80])
          setPhase('success')
          return
        }

        setMessage(
          'La salida está cerrada. Recoge todos los objetos.',
        )
      }
    },
    [
      phase,
      maze,
      position,
      collected,
      itemSet,
      holeSet,
      lives,
    ],
  )

  useEffect(() => {
    moveRef.current = move
  }, [move])

  useEffect(() => {
    if (phase !== 'playing') {
      return
    }

    const timer =
      window.setInterval(() => {
        setRemaining((value) => {
          if (value <= 1) {
            window.clearInterval(timer)
            setFailure(
              'Se terminó el tiempo.',
            )
            setPhase('failed')
            return 0
          }

          return value - 1
        })
      }, 1000)

    return () =>
      window.clearInterval(timer)
  }, [phase])

  useEffect(() => {
    if (
      phase !== 'playing' ||
      !sensorActive
    ) {
      return
    }

    const handler = (
      event: DeviceOrientationEvent,
    ) => {
      if (
        event.beta === null ||
        event.gamma === null
      ) {
        return
      }

      if (!baselineRef.current) {
        baselineRef.current = {
          beta: event.beta,
          gamma: event.gamma,
        }

        setSensorText(
          'Sensor calibrado',
        )
        return
      }

      const now = Date.now()

      if (
        now - lastStepRef.current <
        cooldown
      ) {
        return
      }

      const deltaBeta =
        event.beta -
        baselineRef.current.beta

      const deltaGamma =
        event.gamma -
        baselineRef.current.gamma

      if (
        Math.max(
          Math.abs(deltaBeta),
          Math.abs(deltaGamma),
        ) < threshold
      ) {
        return
      }

      lastStepRef.current = now

      if (
        Math.abs(deltaGamma) >
        Math.abs(deltaBeta)
      ) {
        moveRef.current(
          deltaGamma > 0
            ? 'right'
            : 'left',
        )
      } else {
        moveRef.current(
          deltaBeta > 0
            ? 'down'
            : 'up',
        )
      }
    }

    window.addEventListener(
      'deviceorientation',
      handler,
    )

    return () =>
      window.removeEventListener(
        'deviceorientation',
        handler,
      )
  }, [
    phase,
    sensorActive,
    cooldown,
    threshold,
  ])

  async function enableSensor() {
    if (
      config.sensor_enabled === false ||
      !(
        'DeviceOrientationEvent'
        in window
      )
    ) {
      setSensorActive(false)
      setSensorText(
        'Modo táctil activo',
      )
      return
    }

    try {
      const Orientation =
        window.DeviceOrientationEvent as
          typeof DeviceOrientationEvent & {
            requestPermission?: () =>
              Promise<
                'granted' |
                'denied'
              >
          }

      if (
        typeof Orientation
          .requestPermission ===
        'function'
      ) {
        const permission =
          await Orientation
            .requestPermission()

        if (permission !== 'granted') {
          throw new Error(
            'Permiso rechazado',
          )
        }
      }

      baselineRef.current = null
      setSensorActive(true)
      setSensorText(
        'Mantén el móvil cómodo para calibrar',
      )
    } catch {
      setSensorActive(false)
      setSensorText(
        'Sensor no disponible · usa botones',
      )
    }
  }

  async function start() {
    setPosition(maze.start)
    setLives(initialLives)
    setRemaining(timeLimit)
    setCollected(new Set())
    setMessage('')
    setFailure('')
    continueLockRef.current = false
    setContinuing(false)
    setPhase('playing')

    await enableSensor()
  }

  const continueRoute =
    useCallback(async () => {
      if (
        phase !== 'success' ||
        submitting ||
        continuing ||
        continueLockRef.current
      ) {
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
    }, [
      phase,
      submitting,
      continuing,
      onWin,
    ])

  const title =
    stage.title ||
    'Laberinto de equilibrio'

  const instructions =
    String(
      stage.content ||
      helperText ||
      '',
    ).trim() ||
    'Inclina el móvil o usa los botones para alcanzar la salida.'

  if (phase === 'ready') {
    return (
      <section className="tilt-shell">
        <style>{CSS}</style>

        <div className="tilt-result">
          <div className="tilt-result-icon">
            ●
          </div>

          <h2>{title}</h2>

          <p>{instructions}</p>

          <p>
            Recoge los objetos ◆, evita los
            agujeros × y llega a la bandera ⚑.
          </p>

          <button
            type="button"
            className="tilt-primary"
            onClick={() =>
              void start()
            }
          >
            Iniciar laberinto
          </button>
        </div>
      </section>
    )
  }

  if (phase === 'success') {
    return (
      <section className="tilt-shell">
        <style>{CSS}</style>

        <div className="tilt-result">
          <div className="tilt-result-icon">
            ✓
          </div>

          <h2>Laberinto superado</h2>

          <p>
            Has recogido todos los objetos
            y alcanzado la salida.
          </p>

          <button
            type="button"
            className="tilt-primary"
            disabled={
              submitting ||
              continuing
            }
            onClick={() =>
              void continueRoute()
            }
          >
            {submitting || continuing
              ? 'Avanzando…'
              : 'Continuar al siguiente nodo'}
          </button>
        </div>
      </section>
    )
  }

  if (phase === 'failed') {
    return (
      <section className="tilt-shell">
        <style>{CSS}</style>

        <div className="tilt-result fail">
          <div className="tilt-result-icon">
            !
          </div>

          <h2>Intento terminado</h2>

          <p>{failure}</p>

          <button
            type="button"
            className="tilt-primary"
            onClick={() => {
              setPhase('ready')
              setMessage('')
            }}
          >
            Volver a intentarlo
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="tilt-shell">
      <style>{CSS}</style>

      <div className="tilt-body">
        <header className="tilt-head">
          <div>
            <h2>{title}</h2>
            <p>{instructions}</p>
          </div>
        </header>

        <div className="tilt-stats">
          <div className="tilt-stat">
            <strong>{remaining}</strong>
            <span>segundos</span>
          </div>

          <div className="tilt-stat">
            <strong>{lives}</strong>
            <span>vidas</span>
          </div>

          <div className="tilt-stat">
            <strong>
              {collected.size}/
              {maze.collectibles.length}
            </strong>
            <span>objetos</span>
          </div>
        </div>

        <div className="tilt-board-wrap">
          <div
            className="tilt-board"
            style={{
              gridTemplateColumns:
                `repeat(${maze.cols},minmax(0,1fr))`,
              gridTemplateRows:
                `repeat(${maze.rows},minmax(0,1fr))`,
            }}
          >
            {maze.cells.map(
              (cell, index) => {
                const itemVisible =
                  itemSet.has(index) &&
                  !collected.has(index)

                return (
                  <div
                    key={index}
                    className={[
                      'tilt-cell',
                      index === maze.goal
                        ? 'goal'
                        : '',
                      holeSet.has(index)
                        ? 'hole'
                        : '',
                      itemVisible
                        ? 'item'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{
                      borderTopWidth:
                        cell.walls &
                        WALL_UP
                          ? 2
                          : 0,
                      borderRightWidth:
                        cell.walls &
                        WALL_RIGHT
                          ? 2
                          : 0,
                      borderBottomWidth:
                        cell.walls &
                        WALL_DOWN
                          ? 2
                          : 0,
                      borderLeftWidth:
                        cell.walls &
                        WALL_LEFT
                          ? 2
                          : 0,
                    }}
                  >
                    {index === position ? (
                      <div className="tilt-ball" />
                    ) : (
                      <span className="tilt-mark">
                        {index === maze.goal
                          ? '⚑'
                          : itemVisible
                            ? '◆'
                            : holeSet.has(index)
                              ? '×'
                              : ''}
                      </span>
                    )}
                  </div>
                )
              },
            )}
          </div>
        </div>

        <div className="tilt-help">
          {message ||
            (
              allCollected
                ? 'Todos los objetos recogidos. Busca la salida.'
                : 'Inclina suavemente el móvil o usa los botones.'
            )}
        </div>

        <div className="tilt-sensor">
          {sensorText}
        </div>

        <div className="tilt-pad">
          <button
            type="button"
            className="up"
            aria-label="Arriba"
            onClick={() =>
              move('up')
            }
          >
            ↑
          </button>

          <button
            type="button"
            className="left"
            aria-label="Izquierda"
            onClick={() =>
              move('left')
            }
          >
            ←
          </button>

          <button
            type="button"
            className="down"
            aria-label="Abajo"
            onClick={() =>
              move('down')
            }
          >
            ↓
          </button>

          <button
            type="button"
            className="right"
            aria-label="Derecha"
            onClick={() =>
              move('right')
            }
          >
            →
          </button>
        </div>

        <div className="tilt-actions">
          <button
            type="button"
            onClick={() => {
              baselineRef.current = null
              setSensorText(
                'Mantén el móvil cómodo para recalibrar',
              )
            }}
          >
            Recalibrar
          </button>

          <button
            type="button"
            onClick={() => {
              setPosition(maze.start)
              setMessage(
                'Bola devuelta al inicio.',
              )
            }}
          >
            Volver al inicio
          </button>
        </div>
      </div>
    </section>
  )
}

export default TiltMazeRuntimeScreen
