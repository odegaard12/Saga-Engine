import { useEffect, useMemo, useRef, useState } from 'react'
import { WALL_DOWN, WALL_LEFT, WALL_RIGHT, WALL_UP } from '../../../shared/tiltMaze'
import {
  VISTA_DEL_JUGADOR,
  laberintoDelJugador,
  textoDeLuz,
  textoDeTiempo,
  type LaberintoDelJugador,
} from '../../lib/laberintoDelJugador'

type Props = {
  config: Record<string, unknown>
  onChange: (values: Record<string, unknown>) => void
}

/*
 * 23/11: la piel es la del panel (variables --r7-* y --je-*, ver admin-r7-editor.css); antes era una tarjeta clara
 * sobre el panel oscuro. Los colores del tablero (--tilt-*) son los del juego en el móvil (RuntimeScreen.tsx, tema
 * Pizarra): la vista previa enseña lo que se juega.
 */
const CSS = `
.tme,.tme *{box-sizing:border-box}
.tme{display:grid;gap:14px;padding:14px;border:1px solid var(--r7-borde);border-radius:var(--r7-radio);background:var(--je-tarjeta);color:var(--r7-texto)}
.tme-head h4{margin:0;font-size:17px}
.tme-head p{max-width:66ch;margin:4px 0 0;color:var(--r7-texto-3);font-size:13px;line-height:1.45}
.tme-layout{display:grid;grid-template-columns:minmax(290px,1.1fr) minmax(260px,.9fr);gap:14px;align-items:start}
.tme-card{display:grid;gap:12px;min-width:0;padding:14px;border:1px solid var(--r7-borde);border-radius:var(--r7-radio);background:var(--r7-fondo-2)}
.tme-card h5{margin:0;font-size:15px}
.tme-cabeza{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}
.tme-tablero{
  --tilt-oscuro: 3, 6, 13;
  --tilt-luz: rgba(210, 225, 255, 0.07);
  --tilt-suelo: #1c2533;
  --tilt-pared: #e6ebf3;
  --tilt-agujero: #2a0b10;
  --tilt-agujero-borde: #f87171;
  --tilt-llave: #fbbf24;
  --tilt-meta: #7dd3fc;
  --tilt-bola: #34d399;
  display:block;width:100%;max-width:520px;height:auto;margin:auto;border:3px solid var(--r7-borde-fuerte);border-radius:14px;background:var(--r7-fondo)
}
.tme-datos{display:flex;flex-wrap:wrap;gap:6px}
.tme-leyenda{margin:0;color:var(--r7-texto-3);font-size:12.5px;line-height:1.45}
.tme-controls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.tme-controls label,.tme-grupo{display:grid;gap:6px;min-width:0;color:var(--r7-texto-2);font-size:13px;font-weight:700}
.tme-controls input{width:100%;min-height:44px;padding:8px 10px;border:1px solid var(--r7-borde-fuerte);border-radius:var(--r7-radio-chico);background:var(--r7-fondo);color:var(--r7-texto);font:inherit}
.tme-wide{grid-column:1/-1}
.tme-opciones{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.tme-opciones.dos{grid-template-columns:repeat(2,minmax(0,1fr))}
.tme button{min-height:44px;padding:8px 10px;border:1px solid var(--r7-borde-fuerte);border-radius:var(--r7-radio-chico);background:var(--r7-fondo-3);color:var(--r7-texto);font:inherit;font-size:13px;font-weight:800;cursor:pointer}
.tme button:hover{border-color:var(--r7-acento)}
.tme button.active,.tme button[aria-pressed="true"]{border-color:var(--r7-acento);background:var(--r7-acento);color:var(--je-sobre-acento)}
.tme button small{display:block;font-weight:600;opacity:.85}
.tme-note{padding:10px 12px;border:1px solid var(--r7-borde);border-radius:var(--r7-radio-chico);background:var(--je-acento-suave);color:var(--r7-texto-2);font-size:12.5px;line-height:1.45}
.tme-toggle{display:flex!important;grid-column:1/-1!important;align-items:center;gap:10px;min-height:44px}
.tme-toggle input{width:22px!important;min-height:22px!important;accent-color:var(--r7-acento)}
.tme-message{min-height:18px;color:var(--r7-ok);font-size:12.5px;font-weight:700}
@media(max-width:860px){.tme-layout{grid-template-columns:1fr}.tme-tablero{max-width:430px}}
`

function clamp(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value)

  return Math.max(
    minimum,
    Math.min(maximum, Number.isFinite(parsed) ? Math.round(parsed) : fallback)
  )
}

function randomSeed() {
  return ['maze', Date.now().toString(36), Math.random().toString(36).slice(2, 9)].join('-')
}

// Los tamaños de los niveles del juego (niveles_minijuegos.json: 21, 23 y 25). Antes ofrecía 7, 11 y 13, de cuando el
// laberinto se veía entero; a oscuras es mucho más grande que la pantalla del jugador (9×9).
const TAMANOS = [
  { etiqueta: 'Corto', lado: 21 },
  { etiqueta: 'Medio', lado: 23 },
  { etiqueta: 'Largo', lado: 25 },
]

// `fog_radius`: el radio de la luz alrededor de la bola.
const LUCES = [
  { etiqueta: 'Grande', valor: 3 },
  { etiqueta: 'Media', valor: 2 },
  { etiqueta: 'Pequeña', valor: 1 },
]

const QUIEN: Record<LaberintoDelJugador['quien'], string> = {
  todos: 'Este es el laberinto que jugarán todos.',
  'todos-otro': 'Es un ejemplo: todos jugarán el mismo laberinto, de este tamaño, que el servidor sortea para este nodo.',
  'cada-jugador': 'Es un ejemplo: cada jugador recibe el suyo, de este tamaño. Con «Generar otro laberinto» se fija uno para todos.',
  'cada-intento': 'Es un ejemplo: sale uno distinto en cada intento.',
}

/** Lado del lienzo en píxeles propios: el doble de lo que ocupa, para que las paredes salgan nítidas. */
const LADO_DEL_LIENZO = 1040

/**
 * Pinta el laberinto como el móvil (mismas formas que `pintarLaberinto` del juego). Entero: todas las casillas, con un
 * círculo de puntos que marca hasta dónde llega la luz desde la salida. Como el jugador: la ventana de 9×9 casillas con
 * la bola en el centro y a oscuras salvo el círculo de luz, que es lo que ve al empezar.
 */
function pintar(lienzo: HTMLCanvasElement, lab: LaberintoDelJugador, comoJugador: boolean) {
  const ctx = lienzo.getContext('2d')
  if (!ctx) return
  const css = getComputedStyle(lienzo)
  const v = (nombre: string) => css.getPropertyValue(nombre).trim()
  const oscuro = v('--tilt-oscuro')
  const { maze } = lab
  const columnas = comoJugador ? VISTA_DEL_JUGADOR : maze.cols
  const filas = comoJugador ? VISTA_DEL_JUGADOR : maze.rows
  const c = Math.floor(LADO_DEL_LIENZO / Math.max(columnas, filas))
  const margen = comoJugador ? 0 : Math.ceil(c * 0.08)
  lienzo.width = columnas * c + margen * 2
  lienzo.height = filas * c + margen * 2

  const bolaX = (maze.start % maze.cols) + 0.5
  const bolaY = Math.floor(maze.start / maze.cols) + 0.5
  const ox = comoJugador ? lienzo.width / 2 - bolaX * c : margen
  const oy = comoJugador ? lienzo.height / 2 - bolaY * c : margen

  ctx.fillStyle = `rgb(${oscuro})`
  ctx.fillRect(0, 0, lienzo.width, lienzo.height)
  ctx.fillStyle = v('--tilt-suelo')
  ctx.fillRect(ox, oy, maze.cols * c, maze.rows * c)

  const agujeros = new Set(maze.holes)
  const llaves = new Set(maze.collectibles)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `900 ${Math.round(c * 0.6)}px system-ui, sans-serif`
  ctx.lineWidth = Math.max(1.5, c * 0.06)
  maze.cells.forEach((_, i) => {
    const x = ox + (i % maze.cols) * c + c / 2
    const y = oy + Math.floor(i / maze.cols) * c + c / 2
    if (agujeros.has(i)) {
      ctx.beginPath()
      ctx.arc(x, y, c * 0.32, 0, Math.PI * 2)
      ctx.fillStyle = v('--tilt-agujero')
      ctx.fill()
      ctx.strokeStyle = v('--tilt-agujero-borde')
      ctx.stroke()
    } else if (i === maze.goal) {
      ctx.fillStyle = v('--tilt-meta')
      ctx.fillText('⚑', x, y)
    } else if (llaves.has(i)) {
      const r = c * 0.24
      ctx.beginPath()
      ctx.moveTo(x, y - r)
      ctx.lineTo(x + r, y)
      ctx.lineTo(x, y + r)
      ctx.lineTo(x - r, y)
      ctx.closePath()
      ctx.fillStyle = v('--tilt-llave')
      ctx.fill()
    }
  })

  ctx.beginPath()
  maze.cells.forEach((celda, i) => {
    const x = ox + (i % maze.cols) * c
    const y = oy + Math.floor(i / maze.cols) * c
    if (celda.walls & WALL_UP) {
      ctx.moveTo(x, y)
      ctx.lineTo(x + c, y)
    }
    if (celda.walls & WALL_LEFT) {
      ctx.moveTo(x, y)
      ctx.lineTo(x, y + c)
    }
    if (i % maze.cols === maze.cols - 1 && celda.walls & WALL_RIGHT) {
      ctx.moveTo(x + c, y)
      ctx.lineTo(x + c, y + c)
    }
    if (i >= maze.cells.length - maze.cols && celda.walls & WALL_DOWN) {
      ctx.moveTo(x, y + c)
      ctx.lineTo(x + c, y + c)
    }
  })
  ctx.strokeStyle = v('--tilt-pared')
  ctx.lineWidth = Math.max(2, c * 0.08)
  ctx.lineCap = 'round'
  ctx.stroke()

  const bx = ox + bolaX * c
  const by = oy + bolaY * c
  if (comoJugador) {
    // La oscuridad del juego: un tinte de luz en el centro y opaca a partir del borde del círculo.
    const sombra = ctx.createRadialGradient(bx, by, 0, bx, by, (lab.radioLuz + 0.6) * c)
    sombra.addColorStop(0, v('--tilt-luz'))
    sombra.addColorStop(Math.max(0.05, (lab.radioLuz - 0.6) / (lab.radioLuz + 0.6)), `rgba(${oscuro}, 0)`)
    sombra.addColorStop(1, `rgb(${oscuro})`)
    ctx.fillStyle = sombra
    ctx.fillRect(0, 0, lienzo.width, lienzo.height)
  } else {
    ctx.beginPath()
    ctx.setLineDash([c * 0.18, c * 0.22])
    ctx.arc(bx, by, lab.radioLuz * c, 0, Math.PI * 2)
    ctx.strokeStyle = v('--tilt-meta')
    ctx.lineWidth = Math.max(2, c * 0.07)
    ctx.stroke()
    ctx.setLineDash([])
  }
  ctx.beginPath()
  ctx.arc(bx, by, c * 0.31, 0, Math.PI * 2)
  ctx.fillStyle = v('--tilt-bola')
  ctx.fill()
}

export default function TiltMazeEditor({ config, onChange }: Props) {
  const [message, setMessage] = useState('')
  const [comoJugador, setComoJugador] = useState(false)
  const lienzo = useRef<HTMLCanvasElement>(null)

  // Lo que se ve aquí es lo que se juega: mismo generador, mismas cuentas y mismos valores por defecto que el móvil.
  const lab = useMemo(
    () => laberintoDelJugador(config),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sólo las claves que cambian el laberinto
    [
      config.grid_rows,
      config.grid_cols,
      config.difficulty,
      config.hole_count,
      config.collectible_count,
      config.lives,
      config.fog_radius,
      config.time_limit_s,
      config.maze_seed,
      config.pattern_mode,
      config.nivel,
      config.nivel_a_mano,
    ]
  )

  useEffect(() => {
    if (lienzo.current) pintar(lienzo.current, lab, comoJugador)
  }, [lab, comoJugador])

  const mode = config.pattern_mode === 'random_each_game' ? 'random_each_game' : 'fixed'
  const reloj = clamp(config.time_limit_s ?? 150, 150, 20, 180)

  function patch(values: Record<string, unknown>) {
    onChange({
      objective: 'balance_maze',
      game_id: 'tilt_maze',
      completion_method: 'motion',
      ...values,
    })
  }

  return (
    <section className="tme" aria-label="Editor de Laberinto de equilibrio">
      <style>{CSS}</style>

      <header className="tme-head">
        <h4>Laberinto de equilibrio</h4>

        <p>
          El laberinto se genera solo, no hay que dibujar paredes. El jugador lo recorre a oscuras: sólo ve el círculo
          de luz alrededor de la bola.
        </p>
      </header>

      <div className="tme-layout">
        <article className="tme-card">
          <div className="tme-cabeza">
            <h5>Vista previa</h5>

            <button type="button" aria-pressed={comoJugador} onClick={() => setComoJugador((valor) => !valor)}>
              Ver como el jugador
            </button>
          </div>

          <canvas
            ref={lienzo}
            className="tme-tablero"
            role="img"
            aria-label={
              comoJugador
                ? `Vista del jugador al empezar: ${VISTA_DEL_JUGADOR} por ${VISTA_DEL_JUGADOR} casillas a oscuras, con ${textoDeLuz(lab.luz)}`
                : `Laberinto entero de ${lab.columnas} por ${lab.filas} casillas`
            }
          />

          <div className="tme-datos" aria-label="Lo que se juega">
            <span className="r7-chip">
              {lab.columnas}×{lab.filas}
            </span>
            <span className="r7-chip">{lab.llaves === 1 ? '1 llave' : `${lab.llaves} llaves`}</span>
            <span className="r7-chip">{lab.vidas === 1 ? '1 vida' : `${lab.vidas} vidas`}</span>
            <span className="r7-chip">{lab.agujeros} agujeros</span>
            <span className="r7-chip">{textoDeTiempo(lab.tiempoS)}</span>
            <span className="r7-chip">{textoDeLuz(lab.luz)}</span>
            <span className="r7-chip suave">{lab.pasos} pasos hasta la meta</span>
          </div>

          <p className="tme-leyenda">
            {QUIEN[lab.quien]} Bola verde: salida · ⚑ meta · rombo: llave · círculo rojo: agujero
            {comoJugador
              ? `. El jugador ve ${VISTA_DEL_JUGADOR}×${VISTA_DEL_JUGADOR} casillas de las ${lab.columnas}×${lab.filas}.`
              : ' · círculo de puntos: hasta dónde llega la luz.'}
          </p>

          <button
            type="button"
            onClick={() => {
              patch({
                maze_seed: randomSeed(),
                pattern_mode: 'fixed',
              })

              setMessage('Nuevo laberinto generado y fijado para todos.')
            }}
          >
            Generar otro laberinto
          </button>
        </article>

        <article className="tme-card">
          <h5>Ajustes del reto</h5>

          <div className="tme-controls">
            <div className="tme-grupo tme-wide" role="group" aria-label="Tamaño">
              Tamaño
              <div className="tme-opciones">
                {TAMANOS.map((opcion) => (
                  <button
                    key={opcion.lado}
                    type="button"
                    className={lab.filas === opcion.lado && lab.columnas === opcion.lado ? 'active' : ''}
                    onClick={() => patch({ grid_rows: opcion.lado, grid_cols: opcion.lado })}
                  >
                    {opcion.etiqueta}
                    <small>
                      {opcion.lado}×{opcion.lado}
                    </small>
                  </button>
                ))}
              </div>
            </div>

            <div className="tme-grupo tme-wide" role="group" aria-label="Luz del jugador">
              Luz del jugador
              <div className="tme-opciones">
                {LUCES.map((opcion) => (
                  <button
                    key={opcion.valor}
                    type="button"
                    className={lab.luz === opcion.valor ? 'active' : ''}
                    onClick={() => patch({ fog_radius: opcion.valor })}
                  >
                    {opcion.etiqueta}
                  </button>
                ))}
              </div>
            </div>

            <div className="tme-grupo tme-wide" role="group" aria-label="Variación">
              Variación
              <div className="tme-opciones dos">
                <button
                  type="button"
                  className={mode === 'fixed' ? 'active' : ''}
                  onClick={() =>
                    patch({
                      pattern_mode: 'fixed',
                    })
                  }
                >
                  El mismo en cada intento
                </button>

                <button
                  type="button"
                  className={mode === 'random_each_game' ? 'active' : ''}
                  onClick={() =>
                    patch({
                      pattern_mode: 'random_each_game',
                    })
                  }
                >
                  Nuevo en cada intento
                </button>
              </div>
            </div>

            <label>
              Tiempo (segundos)
              <input
                type="number"
                min={20}
                max={180}
                value={reloj}
                onChange={(event) =>
                  patch({
                    time_limit_s: clamp(event.target.value, 150, 20, 180),
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
                value={lab.vidas}
                onChange={(event) =>
                  patch({
                    lives: clamp(event.target.value, 3, 1, 5),
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
                value={lab.agujeros}
                onChange={(event) =>
                  patch({
                    hole_count: clamp(event.target.value, 14, 0, 18),
                  })
                }
              />
            </label>

            <label>
              Llaves
              <input
                type="number"
                min={0}
                max={6}
                value={lab.llaves}
                onChange={(event) =>
                  patch({
                    collectible_count: clamp(event.target.value, 2, 0, 6),
                  })
                }
              />
            </label>

            <label className="tme-toggle">
              <input
                type="checkbox"
                checked={config.sensor_enabled !== false}
                onChange={(event) =>
                  patch({
                    sensor_enabled: event.target.checked,
                  })
                }
              />
              Usar inclinación del móvil
            </label>
          </div>

          <div className="tme-note">
            Los botones táctiles siempre están disponibles como respaldo. La meta queda a los pasos que caben en el
            reloj, y con un nivel elegido el reloj nunca baja de lo que pide el recorrido.
          </div>

          <div className="tme-message" role="status">
            {message}
          </div>
        </article>
      </div>
    </section>
  )
}
