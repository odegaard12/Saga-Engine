import {
  useMemo,
  useState,
} from 'react'
import {
  generateTiltMaze,
  WALL_DOWN,
  WALL_LEFT,
  WALL_RIGHT,
  WALL_UP,
} from '../../../shared/tiltMaze'

type Props = {
  config: Record<string, unknown>
  onChange: (
    values: Record<string, unknown>,
  ) => void
}

const CSS = `
.tme,.tme *{box-sizing:border-box}
.tme{display:grid;gap:15px;padding:17px;border:1px solid rgba(15,23,42,.1);border-radius:20px;background:radial-gradient(circle at 100% 0,rgba(34,197,94,.12),transparent 32%),#f8fafc;color:#172033}
.tme-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}
.tme-head h4{margin:0;font-size:21px;letter-spacing:-.035em}
.tme-head p{max-width:66ch;margin:5px 0 0;color:#64748b;font-size:13px;line-height:1.45}
.tme-badge{padding:7px 10px;border-radius:999px;background:#dcfce7;color:#166534;font-size:11px;font-weight:900;white-space:nowrap}
.tme-layout{display:grid;grid-template-columns:minmax(290px,1.1fr) minmax(260px,.9fr);gap:14px}
.tme-card{display:grid;gap:12px;padding:13px;border:1px solid #dbe2ea;border-radius:17px;background:rgba(255,255,255,.94)}
.tme-card h5{margin:0;font-size:14px}
.tme-board{display:grid;width:100%;max-width:520px;margin:auto;background:#111315;border:6px solid #111315;border-radius:18px;overflow:hidden;aspect-ratio:1}
.tme-cell{display:grid;place-items:center;min-width:0;min-height:0;border-style:solid;border-color:#94a3b8;background:#1a1d20;color:#fff;font-size:clamp(7px,1.2vw,13px)}
.tme-cell.start{background:#17321f}
.tme-cell.goal{background:#25375d}
.tme-cell.hole{background:#35191d}
.tme-cell.item{background:#40351a}
.tme-controls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}
.tme-controls label{display:grid;gap:6px;color:#334155;font-size:12px;font-weight:850}
.tme-controls select,.tme-controls input{width:100%;min-height:42px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:11px;background:#fff;color:#172033;font:inherit}
.tme-wide{grid-column:1/-1}
.tme-modes,.tme-sizes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.tme-sizes{grid-template-columns:repeat(3,minmax(0,1fr))}
.tme button{min-height:42px;padding:9px 10px;border:1px solid #cbd5e1;border-radius:11px;background:#fff;color:#334155;font-weight:900;cursor:pointer}
.tme button.active,.tme button.primary{border-color:#16a34a;background:#16a34a;color:#fff}
.tme-note{padding:11px;border:1px solid #bbf7d0;border-radius:13px;background:#f0fdf4;color:#166534;font-size:12px;line-height:1.45}
.tme-toggle{display:flex!important;grid-column:1/-1!important;align-items:center;gap:9px}
.tme-toggle input{width:18px!important;min-height:18px!important}
.tme-message{min-height:18px;color:#166534;font-size:12px;font-weight:800}
@media(max-width:860px){.tme-layout{grid-template-columns:1fr}.tme-board{max-width:430px}}
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

function randomSeed() {
  return [
    'maze',
    Date.now().toString(36),
    Math.random()
      .toString(36)
      .slice(2, 9),
  ].join('-')
}

const SIZE_OPTIONS = [
  {
    label: 'Corto',
    rows: 7,
    cols: 7,
    difficulty: 'easy',
  },
  {
    label: 'Medio',
    rows: 9,
    cols: 9,
    difficulty: 'normal',
  },
  {
    label: 'Largo',
    rows: 11,
    cols: 11,
    difficulty: 'hard',
  },
]

export default function TiltMazeEditor({
  config,
  onChange,
}: Props) {
  const [message, setMessage] =
    useState('')

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

  const seed = String(
    config.maze_seed ||
    'saga-maze',
  )

  const mode =
    config.pattern_mode ===
    'random_each_game'
      ? 'random_each_game'
      : 'fixed'

  const holes = clamp(
    config.hole_count,
    4,
    0,
    18,
  )

  const collectibles = clamp(
    config.collectible_count,
    2,
    0,
    6,
  )

  const lives = clamp(
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

  const maze = useMemo(
    () =>
      generateTiltMaze({
        rows,
        cols,
        seed,
        holeCount: holes,
        collectibleCount:
          collectibles,
      }),
    [
      rows,
      cols,
      seed,
      holes,
      collectibles,
    ],
  )

  const holeSet =
    new Set(maze.holes)

  const itemSet =
    new Set(maze.collectibles)

  function patch(
    values: Record<string, unknown>,
  ) {
    onChange({
      objective: 'balance_maze',
      game_id: 'tilt_maze',
      completion_method: 'motion',
      ...values,
    })
  }

  return (
    <section
      className="tme"
      aria-label="Editor de Laberinto de equilibrio"
    >
      <style>{CSS}</style>

      <header className="tme-head">
        <div>
          <h4>
            Laberinto de equilibrio
          </h4>

          <p>
            El laberinto se genera
            automáticamente. No es necesario
            dibujar paredes manualmente.
          </p>
        </div>

        <span className="tme-badge">
          Listo para guardar
        </span>
      </header>

      <div className="tme-layout">
        <article className="tme-card">
          <h5>Vista previa</h5>

          <div
            className="tme-board"
            style={{
              gridTemplateColumns:
                `repeat(${cols},minmax(0,1fr))`,
              gridTemplateRows:
                `repeat(${rows},minmax(0,1fr))`,
            }}
          >
            {maze.cells.map(
              (cell, index) => {
                const className = [
                  'tme-cell',
                  index === maze.start
                    ? 'start'
                    : '',
                  index === maze.goal
                    ? 'goal'
                    : '',
                  holeSet.has(index)
                    ? 'hole'
                    : '',
                  itemSet.has(index)
                    ? 'item'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')

                return (
                  <div
                    key={index}
                    className={className}
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
                    {index === maze.start
                      ? '●'
                      : index === maze.goal
                        ? '⚑'
                        : itemSet.has(index)
                          ? '◆'
                          : holeSet.has(index)
                            ? '×'
                            : ''}
                  </div>
                )
              },
            )}
          </div>

          <div className="tme-note">
            ● inicio · ⚑ meta · ◆ objeto
            obligatorio · × agujero
          </div>

          <button
            type="button"
            className="primary"
            onClick={() => {
              patch({
                maze_seed: randomSeed(),
                pattern_mode: 'fixed',
              })

              setMessage(
                'Nuevo laberinto generado y fijado.',
              )
            }}
          >
            Generar otro laberinto
          </button>
        </article>

        <article className="tme-card">
          <h5>Ajustes del reto</h5>

          <div className="tme-controls">
            <label className="tme-wide">
              Tamaño
              <div className="tme-sizes">
                {SIZE_OPTIONS.map(
                  (option) => (
                    <button
                      key={option.label}
                      type="button"
                      className={
                        rows ===
                          option.rows &&
                        cols ===
                          option.cols
                          ? 'active'
                          : ''
                      }
                      onClick={() =>
                        patch({
                          grid_rows:
                            option.rows,
                          grid_cols:
                            option.cols,
                          difficulty:
                            option.difficulty,
                        })
                      }
                    >
                      {option.label}
                      <br />
                      {option.cols}×
                      {option.rows}
                    </button>
                  ),
                )}
              </div>
            </label>

            <label className="tme-wide">
              Variación
              <div className="tme-modes">
                <button
                  type="button"
                  className={
                    mode === 'fixed'
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    patch({
                      pattern_mode:
                        'fixed',
                    })
                  }
                >
                  Fijo para todos
                </button>

                <button
                  type="button"
                  className={
                    mode ===
                    'random_each_game'
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    patch({
                      pattern_mode:
                        'random_each_game',
                    })
                  }
                >
                  Nuevo por partida
                </button>
              </div>
            </label>

            <label>
              Tiempo
              <input
                type="number"
                min={20}
                max={180}
                value={timeLimit}
                onChange={(event) =>
                  patch({
                    time_limit_s:
                      clamp(
                        event.target.value,
                        75,
                        20,
                        180,
                      ),
                  })
                }
              />
            </label>

            <label>
              Vidas
              <input
                type="number"
                min={1}
                max={5}
                value={lives}
                onChange={(event) =>
                  patch({
                    lives: clamp(
                      event.target.value,
                      3,
                      1,
                      5,
                    ),
                  })
                }
              />
            </label>

            <label>
              Agujeros
              <input
                type="number"
                min={0}
                max={18}
                value={holes}
                onChange={(event) =>
                  patch({
                    hole_count:
                      clamp(
                        event.target.value,
                        4,
                        0,
                        18,
                      ),
                  })
                }
              />
            </label>

            <label>
              Objetos
              <input
                type="number"
                min={0}
                max={6}
                value={collectibles}
                onChange={(event) =>
                  patch({
                    collectible_count:
                      clamp(
                        event.target.value,
                        2,
                        0,
                        6,
                      ),
                  })
                }
              />
            </label>

            <label className="tme-toggle">
              <input
                type="checkbox"
                checked={
                  config.sensor_enabled !==
                  false
                }
                onChange={(event) =>
                  patch({
                    sensor_enabled:
                      event.target.checked,
                  })
                }
              />

              Usar inclinación del móvil
            </label>
          </div>

          <div className="tme-note">
            Los botones táctiles siempre
            estarán disponibles como respaldo.
            El generador garantiza una ruta
            válida entre inicio y meta.
          </div>

          <div className="tme-message">
            {message}
          </div>
        </article>
      </div>
    </section>
  )
}
