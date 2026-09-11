import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PlayerStage } from '../../../../types/player'
import type { ResolvedCircuitMatrixMinigame } from '../../core/resolver'
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
  onWin: (penaltyMs?: number, tempoDaPartidaMs?: number) => Promise<void>
  /** El reloj del nodo no corre hasta aquí: lo arranca Comenzar. */
  onComezar?: () => void
}

type Phase = 'ready' | 'playing' | 'success' | 'failed'

const CSS = `
.tilt-shell,.tilt-shell *{box-sizing:border-box}
.tilt-shell{width:100%;border:1px solid rgba(255,255,255,.15);border-radius:var(--theme-radius-panel, 22px);background:rgba(17,19,21,0.4);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 8px 32px rgba(0,0,0,0.3), inset 0 0 20px rgba(var(--theme-done), 0.05);color:#f4f4f5}
.tilt-body{display:grid;gap:13px;padding:15px}
.tilt-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.tilt-head h2{margin:0;font-size:clamp(23px,7vw,31px);line-height:1;font-weight:950;letter-spacing:-.045em;text-shadow:0 2px 10px rgba(0,0,0,0.5)}
.tilt-head p{margin:6px 0 0;color:rgba(244,244,245,.8);font-size:12px;line-height:1.4}
.tilt-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
.tilt-stat{padding:8px;border:1px solid rgba(255,255,255,.1);border-radius:var(--theme-radius-card, 13px);background:rgba(255,255,255,.05);text-align:center;box-shadow:inset 0 2px 10px rgba(0,0,0,0.2)}
.tilt-stat strong{display:block;color:#72df91;font-size:17px;text-shadow:0 0 8px rgba(114,223,145,0.4)}
.tilt-stat span{display:block;margin-top:3px;color:rgba(244,244,245,.6);font-size:8px;font-weight:900;text-transform:uppercase}
.tilt-board-wrap{padding:7px;border:1px solid rgba(255,255,255,.08);border-radius:var(--theme-radius-panel, 20px);background:rgba(0,0,0,0.3);box-shadow:inset 0 4px 15px rgba(0,0,0,0.5)}
.tilt-board{position:relative;display:grid;width:100%;max-width:min(540px,28dvh);margin:auto;overflow:hidden;border:3px solid rgba(var(--theme-done), 0.6);border-radius:var(--theme-radius-card, 14px);background:rgba(10,12,14,0.6);aspect-ratio:1;box-shadow:0 0 15px rgba(var(--theme-done), 0.3), inset 0 0 20px rgba(0,0,0,0.8)}
.tilt-ball-layer{position:absolute;top:0;left:0;display:grid;place-items:center;pointer-events:none;z-index:3;transition:transform 100ms linear;will-change:transform}
@media (prefers-reduced-motion: reduce){.tilt-ball-layer{transition:none}}
.tilt-cell{position:relative;display:grid;place-items:center;min-width:0;min-height:0;border-style:solid;border-color:rgba(var(--theme-done), 0.2);background:transparent;transition:background 0.3s}
.tilt-cell.goal{background:rgba(var(--theme-pin), 0.3);box-shadow:inset 0 0 12px rgba(var(--theme-pin), 0.5)}
.tilt-cell.hole{background:rgba(239,68,68,0.3);box-shadow:inset 0 0 15px rgba(239,68,68,0.8)}
.tilt-cell.item{background:rgba(234,179,8,0.25);box-shadow:inset 0 0 10px rgba(234,179,8,0.5)}
/* La bola NO sigue al tema, a proposito: es una bola, tiene que rodar y leerse
   como una bola. Es informacion (el objeto que mueves), no decoracion, igual
   que los alfileres del mapa en mobile-themes.css. */
.tilt-ball{width:62%;height:62%;border-radius:999px;background:radial-gradient(circle at 35% 30%,#fff 0%,#a7f3d0 15%,rgb(var(--theme-done)) 50%,#14532d 100%);box-shadow:0 0 12px rgba(var(--theme-done), 0.9), inset -2px -2px 6px rgba(0,0,0,0.6);z-index:3}
.tilt-mark{font-size:clamp(10px,2.5vw,18px);font-weight:950;text-shadow:0 0 8px rgba(255,255,255,0.5)}
.tilt-help{min-height:42px;padding:10px 11px;border:1px solid rgba(255,255,255,.1);border-radius:var(--theme-radius-card, 13px);background:rgba(0,0,0,0.3);color:rgba(244,244,245,.8);font-size:11px;line-height:1.45;text-align:center;box-shadow:inset 0 2px 10px rgba(0,0,0,0.2)}
.tilt-actions{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.tilt-actions button,.tilt-primary{min-height:46px;padding:10px;border:1px solid rgba(255,255,255,.15);border-radius:var(--theme-radius-card, 13px);background:rgba(255,255,255,0.05);color:#f4f4f5;font-weight:950;cursor:pointer;transition:all 0.2s cubic-bezier(0.4, 0, 0.2, 1);backdrop-filter:blur(4px)}
.tilt-actions button:active{transform:scale(0.96);background:rgba(255,255,255,0.15)}
.tilt-primary{width:100%;border-color:rgb(var(--theme-done));background:linear-gradient(135deg,rgb(var(--theme-done)),rgb(var(--theme-done)));color:#062311;box-shadow:0 4px 15px rgba(var(--theme-done), 0.3)}
.tilt-primary:active{transform:scale(0.97);filter:brightness(1.1);box-shadow:0 2px 8px rgba(var(--theme-done), 0.4)}
.tilt-pad{display:grid;grid-template-columns:repeat(3,58px);grid-template-rows:repeat(2,52px);justify-content:center;gap:7px}
.tilt-pad button{border:1px solid rgba(255,255,255,.15);border-radius:var(--theme-radius-card, 14px);background:rgba(255,255,255,0.05);color:#fff;font-size:22px;font-weight:950;transition:all 0.15s;backdrop-filter:blur(4px)}
.tilt-pad button:active{transform:scale(0.9);background:rgba(255,255,255,0.2);box-shadow:0 0 15px rgba(255,255,255,0.2)}
.tilt-pad .up{grid-column:2}.tilt-pad .left{grid-column:1}.tilt-pad .down{grid-column:2}.tilt-pad .right{grid-column:3}
.tilt-pad-toggle{width:100%;min-height:44px;padding:10px;border:1px dashed rgba(255,255,255,.25);border-radius:var(--theme-radius-card, 13px);background:rgba(0,0,0,0.2);color:rgba(244,244,245,.8);font-size:12px;font-weight:800;cursor:pointer;transition:all 0.2s}
.tilt-pad-toggle:active{transform:scale(0.98);background:rgba(255,255,255,0.05)}
.tilt-result{display:grid;gap:14px;padding:24px 16px;text-align:center}
.tilt-result-icon{display:grid;width:70px;height:70px;margin:auto;place-items:center;border-radius:var(--theme-radius-pill, 999px);background:rgba(23,50,31,0.8);border:2px solid #72df91;color:#72df91;font-size:32px;box-shadow:0 0 20px rgba(114,223,145,0.4)}
.tilt-result.fail .tilt-result-icon{background:rgba(53,24,29,0.8);border-color:#fda4af;color:#fda4af;box-shadow:0 0 20px rgba(253,164,175,0.4)}
.tilt-result h2{margin:0;font-size:27px;text-shadow:0 2px 10px rgba(0,0,0,0.5)}
.tilt-result p{margin:0;color:rgba(244,244,245,.8);font-size:13px;line-height:1.5}
.tilt-sensor{color:#72df91;font-size:10px;font-weight:900;text-align:center;text-shadow:0 0 5px rgba(114,223,145,0.5)}
@media(max-width:430px){.tilt-body{padding:11px;gap:8px}.tilt-pad{grid-template-columns:repeat(3,54px)}}
/* Medido en el móvil: cabecera 97 + estadísticas 53 + tablero + ayuda 41 +
   sensor 14 + pad 109 + acciones 45, más el botón de código de respaldo. Con el
   tablero grande la suma se pasaba 68 px de la pantalla y lo de abajo quedaba
   fuera. En pantallas de móvil se recorta lo que no se toca. */
@media(max-height:900px){
  .tilt-head p{display:none}
  .tilt-help{display:none}
  .tilt-body{gap:8px;padding:10px}
  .tilt-head h2{font-size:clamp(19px,5.5vw,24px)}
}
@media(max-height:700px){.tilt-board{max-width:min(540px,24dvh)}.tilt-pad{grid-template-rows:repeat(2,46px)}}
@media(max-height:600px){.tilt-board{max-width:min(540px,20dvh)}.tilt-stat{padding:5px}}
`

function clamp(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value)

  return Math.max(
    minimum,
    Math.min(maximum, Number.isFinite(parsed) ? Math.round(parsed) : fallback)
  )
}

function haptic(pattern: number | number[]) {
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
  onComezar,
}: Props) {
  const config = resolved.config

  const rows = clamp(config.grid_rows, 9, 5, 13)

  const cols = clamp(config.grid_cols, 9, 5, 13)

  const initialLives = clamp(config.lives, 3, 1, 5)

  const timeLimit = clamp(config.time_limit_s, 75, 20, 180)

  const threshold = clamp(config.tilt_threshold, 12, 6, 30)

  /**
   * Espera entre pasos.
   *
   * A 360 ms inclinar el móvil daba un paso, pausa, otro paso: parecía que el
   * sensor no respondía. A 150 ms, con la bola deslizando entre casillas, se
   * mantiene la inclinación y la bola rueda de seguido. Sigue habiendo freno
   * para que un temblor no dispare tres pasos.
   */
  const cooldown = clamp(config.step_cooldown_ms, 150, 90, 800)

  const baseSeed = String(config.maze_seed || 'saga-maze')

  const patternMode = config.pattern_mode === 'random_each_game' ? 'random_each_game' : 'fixed'

  const [sessionSeed] = useState(() =>
    patternMode === 'random_each_game'
      ? [baseSeed, Date.now().toString(36), Math.random().toString(36).slice(2)].join('-')
      : baseSeed
  )

  const maze = useMemo(
    () =>
      generateTiltMaze({
        rows,
        cols,
        seed: sessionSeed,
        holeCount: clamp(config.hole_count, 4, 0, 18),
        collectibleCount: clamp(config.collectible_count, 2, 0, 6),
      }),
    [rows, cols, sessionSeed, config.hole_count, config.collectible_count]
  )

  /**
   * Instante en que empieza la partida de verdad.
   *
   * El tiempo del nodo arrancaba al abrir la ficha, así que leer la explicación
   * del mirador contaba como si ya estuvieses moviendo la bola. El reto empieza
   * al pulsar Comezar.
   */
  const comezouRef = useRef(0)

  const [phase, setPhase] = useState<Phase>('ready')

  const [position, setPosition] = useState(maze.start)

  const [lives, setLives] = useState(initialLives)

  const [remaining, setRemaining] = useState(timeLimit)

  const [collected, setCollected] = useState<Set<number>>(() => new Set())

  const [message, setMessage] = useState('')

  const [failure, setFailure] = useState('')

  const [sensorActive, setSensorActive] = useState(false)

  const [sensorText, setSensorText] = useState('Botones táctiles disponibles')

  const [continuing, setContinuing] = useState(false)

  /**
   * Los botones van escondidos y sólo aparecen si se piden.
   *
   * El reto es inclinar el móvil. Con la cruceta siempre a la vista, nadie
   * inclina nada: se juega a toques y el nodo pierde la gracia. Quedan a un
   * botón de distancia para quien no le funcione el sensor.
   */
  const [botonesVisibles, setBotonesVisibles] = useState(false)

  const baselineRef = useRef<{
    beta: number
    gamma: number
  } | null>(null)

  const lastStepRef = useRef(0)
  const continueLockRef = useRef(false)

  const moveRef = useRef<(direction: TiltDirection) => void>(() => undefined)

  const holeSet = useMemo(() => new Set(maze.holes), [maze.holes])

  const itemSet = useMemo(() => new Set(maze.collectibles), [maze.collectibles])

  const allCollected = collected.size >= maze.collectibles.length

  useEffect(() => {
    setPosition(maze.start)
    setLives(initialLives)
    setRemaining(timeLimit)
    setCollected(new Set())
  }, [maze, initialLives, timeLimit])

  const move = useCallback(
    (direction: TiltDirection) => {
      if (phase !== 'playing') {
        return
      }

      const next = nextTiltMazeCell(maze, position, direction)

      if (next === null) {
        haptic(10)
        setMessage('Pared. Busca otra dirección.')
        return
      }

      const nextCollected = new Set(collected)

      if (itemSet.has(next)) {
        nextCollected.add(next)
        setCollected(nextCollected)
        haptic([12, 20, 22])
        setMessage('Objeto recogido.')
      } else {
        setMessage('')
      }

      if (holeSet.has(next)) {
        const nextLives = lives - 1

        haptic([50, 40, 50])
        setLives(nextLives)

        if (nextLives <= 0) {
          setFailure('Has perdido todas las vidas.')
          setPhase('failed')
          return
        }

        setPosition(maze.start)
        setMessage('Caíste en un agujero. Vuelves al inicio.')
        return
      }

      setPosition(next)

      if (next === maze.goal) {
        if (nextCollected.size >= maze.collectibles.length) {
          haptic([20, 35, 80])
          setPhase('success')
          return
        }

        setMessage('La salida está cerrada. Recoge todos los objetos.')
      }
    },
    [phase, maze, position, collected, itemSet, holeSet, lives]
  )

  useEffect(() => {
    moveRef.current = move
  }, [move])

  useEffect(() => {
    if (phase !== 'playing') {
      return
    }

    const timer = window.setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          window.clearInterval(timer)
          setFailure('Se terminó el tiempo.')
          setPhase('failed')
          return 0
        }

        return value - 1
      })
    }, 1000)

    return () => window.clearInterval(timer)
  }, [phase])

  useEffect(() => {
    if (phase !== 'playing' || !sensorActive) {
      return
    }

    const handler = (event: DeviceOrientationEvent) => {
      if (event.beta === null || event.gamma === null) {
        return
      }

      if (!baselineRef.current) {
        baselineRef.current = {
          beta: event.beta,
          gamma: event.gamma,
        }

        setSensorText('Sensor calibrado')
        return
      }

      const now = Date.now()

      if (now - lastStepRef.current < cooldown) {
        return
      }

      const deltaBeta = event.beta - baselineRef.current.beta

      const deltaGamma = event.gamma - baselineRef.current.gamma

      if (Math.max(Math.abs(deltaBeta), Math.abs(deltaGamma)) < threshold) {
        return
      }

      lastStepRef.current = now

      if (Math.abs(deltaGamma) > Math.abs(deltaBeta)) {
        moveRef.current(deltaGamma > 0 ? 'right' : 'left')
      } else {
        moveRef.current(deltaBeta > 0 ? 'down' : 'up')
      }
    }

    window.addEventListener('deviceorientation', handler)

    return () => window.removeEventListener('deviceorientation', handler)
  }, [phase, sensorActive, cooldown, threshold])

  async function enableSensor() {
    if (config.sensor_enabled === false || !('DeviceOrientationEvent' in window)) {
      setSensorActive(false)
      setSensorText('Modo táctil activo')
      return
    }

    try {
      const Orientation = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
        requestPermission?: () => Promise<'granted' | 'denied'>
      }

      if (typeof Orientation.requestPermission === 'function') {
        const permission = await Orientation.requestPermission()

        if (permission !== 'granted') {
          throw new Error('Permiso rechazado')
        }
      }

      baselineRef.current = null
      setSensorActive(true)
      setSensorText('Mantén el móvil cómodo para calibrar')
    } catch {
      setSensorActive(false)
      setSensorText('Sensor no disponible · usa botones')
    }
  }

  function start() {
    setPosition(maze.start)
    setLives(initialLives)
    setRemaining(timeLimit)
    setCollected(new Set())
    setMessage('')
    setFailure('')
    continueLockRef.current = false
    setContinuing(false)
    comezouRef.current = Date.now()
    onComezar?.()
    setPhase('playing')

    // El sensor se activa SIN esperar. Si el permiso de orientación se cuelga o
    // el navegador no responde, el juego tiene que seguir siendo jugable con
    // los botones: antes el arranque quedaba a medias y el laberinto se veía
    // pintado pero inerte, sin que el cronómetro llegase a correr.
    void enableSensor()
  }

  const continueRoute = useCallback(async () => {
    if (phase !== 'success' || submitting || continuing || continueLockRef.current) {
      return
    }

    continueLockRef.current = true
    setContinuing(true)

    try {
      const daPartida = comezouRef.current ? Date.now() - comezouRef.current : undefined
      await onWin(undefined, daPartida)
    } catch (error) {
      continueLockRef.current = false
      setContinuing(false)
      throw error
    }
  }, [phase, submitting, continuing, onWin])

  const title = stage.title || 'Laberinto de equilibrio'

  const instructions =
    String(stage.content || helperText || '').trim() ||
    'Inclina el móvil o usa los botones para alcanzar la salida.'

  if (phase === 'ready') {
    return (
      <section className="tilt-shell saga-glass-panel" data-phase={phase}>
        <style>{CSS}</style>

        <div className="tilt-result">
          <div className="tilt-result-icon">●</div>

          <h2>{title}</h2>

          <p>{instructions}</p>

          <p>Recoge los objetos ◆, evita los agujeros × y llega a la bandera ⚑.</p>

          <button type="button" className="tilt-primary" onClick={() => void start()}>
            Iniciar laberinto
          </button>
        </div>
      </section>
    )
  }

  if (phase === 'success') {
    return (
      <section className="tilt-shell saga-glass-panel" data-phase={phase}>
        <style>{CSS}</style>

        <div className="tilt-result">
          <div className="tilt-result-icon">✓</div>

          <h2>Laberinto superado</h2>

          <p>Has recogido todos los objetos y alcanzado la salida.</p>

          <button
            type="button"
            className="tilt-primary"
            disabled={submitting || continuing}
            onClick={() => void continueRoute()}
          >
            {submitting || continuing ? 'Avanzando…' : 'Continuar al siguiente nodo'}
          </button>
        </div>
      </section>
    )
  }

  if (phase === 'failed') {
    return (
      <section className="tilt-shell saga-glass-panel" data-phase={phase}>
        <style>{CSS}</style>

        <div className="tilt-result fail">
          <div className="tilt-result-icon">!</div>

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
    <section className="tilt-shell" data-phase={phase}>
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
              {collected.size}/{maze.collectibles.length}
            </strong>
            <span>objetos</span>
          </div>
        </div>

        <div className="tilt-board-wrap">
          <div
            className="tilt-board"
            style={{
              gridTemplateColumns: `repeat(${maze.cols},minmax(0,1fr))`,
              gridTemplateRows: `repeat(${maze.rows},minmax(0,1fr))`,
            }}
          >
            {maze.cells.map((cell, index) => {
              const itemVisible = itemSet.has(index) && !collected.has(index)

              return (
                <div
                  key={index}
                  className={[
                    'tilt-cell',
                    index === maze.goal ? 'goal' : '',
                    holeSet.has(index) ? 'hole' : '',
                    itemVisible ? 'item' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{
                    borderTopWidth: cell.walls & WALL_UP ? 2 : 0,
                    borderRightWidth: cell.walls & WALL_RIGHT ? 2 : 0,
                    borderBottomWidth: cell.walls & WALL_DOWN ? 2 : 0,
                    borderLeftWidth: cell.walls & WALL_LEFT ? 2 : 0,
                  }}
                >
                  <span className="tilt-mark">
                    {index === maze.goal
                      ? '⚑'
                      : itemVisible
                        ? '◆'
                        : holeSet.has(index)
                          ? '×'
                          : ''}
                  </span>
                </div>
              )
            })}

            {/**
             * La bola se dibuja UNA vez encima del tablero y se desplaza con
             * transform, no saltando de celda en celda.
             *
             * Antes vivía dentro de la celda: cada paso la desmontaba y la
             * volvía a montar en otro sitio, así que aparecía a tirones. Así
             * rueda de una casilla a la siguiente y, inclinando el móvil, el
             * movimiento se ve continuo.
             */}
            <div
              className="tilt-ball-layer"
              style={{
                width: `${100 / maze.cols}%`,
                height: `${100 / maze.rows}%`,
                transform: `translate(${(position % maze.cols) * 100}%, ${
                  Math.floor(position / maze.cols) * 100
                }%)`,
              }}
            >
              <div className="tilt-ball" />
            </div>
          </div>
        </div>

        <div className="tilt-help">
          {message ||
            (allCollected
              ? 'Todos los objetos recogidos. Busca la salida.'
              : 'Inclina suavemente el móvil o usa los botones.')}
        </div>

        <div className="tilt-sensor">{sensorText}</div>

        {botonesVisibles ? (
          <div className="tilt-pad">
            <button type="button" className="up" aria-label="Arriba" onClick={() => move('up')}>
              ↑
            </button>

            <button
              type="button"
              className="left"
              aria-label="Izquierda"
              onClick={() => move('left')}
            >
              ←
            </button>

            <button type="button" className="down" aria-label="Abajo" onClick={() => move('down')}>
              ↓
            </button>

            <button
              type="button"
              className="right"
              aria-label="Derecha"
              onClick={() => move('right')}
            >
              →
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="tilt-pad-toggle"
            onClick={() => {
              // Al sacar la cruceta se apaga el sensor: con los dos a la vez la
              // bola se movía sola mientras intentabas darle a las flechas.
              setBotonesVisibles(true)
              setSensorActive(false)
              baselineRef.current = null
              setSensorText('Botones activos · sensor apagado')
            }}
          >
            ¿No responde al inclinar? Usar botones
          </button>
        )}

        <div className="tilt-actions">
          <button
            type="button"
            onClick={() => {
              baselineRef.current = null
              setSensorText('Mantén el móvil cómodo para recalibrar')
            }}
          >
            Recalibrar
          </button>

          <button
            type="button"
            onClick={() => {
              setPosition(maze.start)
              setMessage('Bola devuelta al inicio.')
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
