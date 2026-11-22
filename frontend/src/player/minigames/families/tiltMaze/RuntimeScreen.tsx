import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PlayerStage } from '../../../../types/player'
import type { ResolvedCircuitMatrixMinigame } from '../../core/resolver'
import { useRegenerarAoOcultar } from '../../core/useRegenerarAoOcultar'
import { useTextos } from '../../core/useTextos'
import { useSinRetoEnPantalla } from '../../../hooks/useSinRetoEnPantalla'
import { avisarPeticionDePermisoPropia } from '../../../utils/permissionPromptGuard'
import { anguloDePantalla, ejesDePantalla } from './ejesDePantalla'
import {
  ESPERA_SENSOR_MUDO_MS,
  marcarModoAlternativo,
  penalizacionDelModo,
  puedeUsarModoAlternativo,
  type EstadoDelSensor,
} from '../../core/modoAlternativo'
import {
  generateTiltMaze,
  nextTiltMazeCell,
  pasosHastaLaMeta,
  sonVecinas,
  WALL_DOWN,
  WALL_LEFT,
  WALL_RIGHT,
  WALL_UP,
  type GeneratedTiltMaze,
  type TiltDirection,
} from '../../../../shared/tiltMaze'

type Props = {
  resolved: ResolvedCircuitMatrixMinigame
  stage: PlayerStage
  helperText: string
  submitting: boolean
  /** `false` = el nodo no se aceptó: hay que soltar «Avanzando…» y volver a ofrecer Continuar. */
  onWin: (penaltyMs?: number, tempoDaPartidaMs?: number) => Promise<void | boolean>
  /** El reloj del nodo no corre hasta aquí: lo arranca Comenzar. */
  onComezar?: () => void
}

type Phase = 'ready' | 'playing' | 'success' | 'failed'

const CSS = `
.tilt-shell,.tilt-shell *{box-sizing:border-box}
.tilt-shell{width:100%;border:1px solid rgba(var(--a-texto-rgb, 255, 255, 255), .15);border-radius:var(--theme-radius-panel, 22px);background:color-mix(in srgb, var(--mg-board) 60%, transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 8px 32px rgba(var(--theme-ink-deep, 0, 0, 0), 0.3), inset 0 0 20px rgba(var(--theme-done), 0.05);color:var(--mg-text)}
.tilt-body{display:grid;gap:13px;padding:15px}
.tilt-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.tilt-head h2{margin:0;font-size:clamp(23px,7vw,31px);line-height:1;font-weight:950;letter-spacing:-.045em;text-shadow:0 2px 10px rgba(var(--theme-ink-deep, 0, 0, 0), 0.5)}
.tilt-head p{margin:6px 0 0;color:rgba(var(--a-texto-rgb, 244, 244, 245), .8);font-size:12px;line-height:1.4}
.tilt-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
.tilt-stat{padding:8px;border:1px solid rgba(var(--a-texto-rgb, 255, 255, 255), .1);border-radius:var(--theme-radius-card, 13px);background:rgba(var(--a-texto-rgb, 255, 255, 255), .05);text-align:center;box-shadow:inset 0 2px 10px rgba(var(--theme-ink-deep, 0, 0, 0), 0.2)}
.tilt-stat strong{display:block;color:var(--mg-good);font-size:17px;text-shadow:0 0 8px color-mix(in srgb, var(--mg-good) 40%, transparent)}
.tilt-stat span{display:block;margin-top:3px;color:rgba(var(--a-texto-rgb, 244, 244, 245), .6);font-size:8px;font-weight:900;text-transform:uppercase}
.tilt-muestra{display:block;width:min(150px,40vw);margin:2px auto 10px}
.tilt-muestra .borde{fill:var(--mg-deep);stroke:rgba(var(--theme-done),.6);stroke-width:3}
.tilt-muestra .pared{fill:none;stroke:var(--mg-text);stroke-width:2.5;stroke-linecap:round}
.tilt-muestra .agujero{fill:color-mix(in srgb, var(--mg-bad) 35%, transparent);stroke:color-mix(in srgb, var(--mg-bad) 90%, transparent);stroke-width:1.5}
.tilt-muestra .objeto{fill:color-mix(in srgb, var(--mg-warn) 85%, transparent)}
.tilt-muestra .bola{fill:var(--mg-text);filter:drop-shadow(0 0 3px rgba(var(--a-texto-rgb, 255, 255, 255), .7))}
.tilt-muestra .meta{fill:rgba(var(--theme-pin),1);font-size:13px}
.tilt-board-wrap{padding:7px;border:1px solid rgba(var(--a-texto-rgb, 255, 255, 255), .08);border-radius:var(--theme-radius-panel, 20px);background:rgba(var(--theme-ink-deep, 0, 0, 0), 0.3);box-shadow:inset 0 4px 15px rgba(var(--theme-ink-deep, 0, 0, 0), 0.5)}
.tilt-board{position:relative;display:block;width:100%;max-width:min(540px,36dvh);margin:auto;overflow:hidden;border:3px solid rgba(var(--theme-done), 0.6);border-radius:var(--theme-radius-card, 14px);background:var(--mg-deep);aspect-ratio:1;box-shadow:0 0 15px rgba(var(--theme-done), 0.3), inset 0 0 20px rgba(var(--theme-ink-deep, 0, 0, 0), 0.8)}
/* 22/11 (diseño A, «la luz sigue a la bola»): el laberinto se pinta en un lienzo, sólo la ventana que se ve, y se
   desplaza bajo la bola, que se queda quieta en el centro. Los colores del lienzo son las variables --tilt-*
   de abajo (paredes claras sobre suelo oscuro en los dos temas: más de 10:1). */
.tilt-lienzo{position:absolute;inset:0;display:block;width:100%;height:100%}
.tilt-board{
  --tilt-oscuro: 3, 6, 13;
  --tilt-luz: rgba(210, 225, 255, 0.07);
  --tilt-suelo: #1c2533;
  --tilt-pared: #e6ebf3;
  --tilt-agujero: #2a0b10;
  --tilt-agujero-borde: #f87171;
  --tilt-llave: #fbbf24;
  --tilt-meta: #7dd3fc;
}
.theme-dia .tilt-board{
  --tilt-oscuro: 20, 12, 6;
  --tilt-luz: rgba(255, 186, 104, 0.16);
  --tilt-suelo: #4a3323;
  --tilt-pared: #f4e7d1;
  --tilt-agujero: #1c0b06;
  --tilt-agujero-borde: #ef8a6a;
  --tilt-llave: #f6c453;
  --tilt-meta: #a3e635;
}
.tilt-ball-layer{position:absolute;top:50%;left:50%;display:grid;place-items:center;pointer-events:none;z-index:3;transform:translate(-50%,-50%)}
/* La bola NO sigue al tema, a proposito: es una bola, tiene que rodar y leerse
   como una bola. Es informacion (el objeto que mueves), no decoracion, igual
   que los alfileres del mapa en mobile-themes.css. */
.tilt-ball{width:62%;height:62%;border-radius:999px;background:radial-gradient(circle at 35% 30%,rgb(var(--theme-done-soft)) 0%,rgb(var(--theme-done)) 50%,color-mix(in srgb, rgb(var(--theme-done)) 45%, rgb(var(--theme-ink-deep, 2, 6, 23))) 100%);box-shadow:0 0 12px rgba(var(--theme-done), 0.9), inset -2px -2px 6px rgba(var(--theme-ink-deep, 0, 0, 0), 0.6);z-index:3}
.tilt-help{min-height:42px;padding:10px 11px;border:1px solid rgba(var(--a-texto-rgb, 255, 255, 255), .1);border-radius:var(--theme-radius-card, 13px);background:rgba(var(--theme-ink-deep, 0, 0, 0), 0.3);color:rgba(var(--a-texto-rgb, 244, 244, 245), .8);font-size:11px;line-height:1.45;text-align:center;box-shadow:inset 0 2px 10px rgba(var(--theme-ink-deep, 0, 0, 0), 0.2)}
.tilt-actions{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.tilt-actions button,.tilt-primary{min-height:46px;padding:10px;border:1px solid rgba(var(--a-texto-rgb, 255, 255, 255), .15);border-radius:var(--theme-radius-card, 13px);background:rgba(var(--a-texto-rgb, 255, 255, 255), 0.05);color:var(--mg-text);font-weight:950;cursor:pointer;transition:background-color 0.2s,border-color 0.2s,transform 0.2s}
.tilt-actions button:active{transform:scale(0.96);background:rgba(var(--a-texto-rgb, 255, 255, 255), 0.15)}
.tilt-primary{width:100%;border-color:var(--theme-primary);background:var(--theme-primary);color:var(--mg-on-primary);box-shadow:0 4px 15px var(--mg-sombra)}
.tilt-primary:active{transform:scale(0.97);filter:brightness(1.1);box-shadow:0 2px 8px rgba(var(--theme-done), 0.4)}
.tilt-pad{display:grid;grid-template-columns:repeat(3,58px);grid-template-rows:repeat(2,52px);justify-content:center;gap:7px}
.tilt-pad button{border:1px solid rgba(var(--a-texto-rgb, 255, 255, 255), .15);border-radius:var(--theme-radius-card, 14px);background:rgba(var(--a-texto-rgb, 255, 255, 255), 0.05);color:var(--mg-text);font-size:22px;font-weight:950;transition:background-color 0.15s,border-color 0.15s,transform 0.15s}
.tilt-pad button:active{transform:scale(0.9);background:rgba(var(--a-texto-rgb, 255, 255, 255), 0.2);box-shadow:0 0 15px rgba(var(--a-texto-rgb, 255, 255, 255), 0.2)}
.tilt-pad .up{grid-column:2}.tilt-pad .left{grid-column:1}.tilt-pad .down{grid-column:2}.tilt-pad .right{grid-column:3}
.tilt-pad-toggle{width:100%;min-height:44px;padding:10px;border:1px dashed rgba(var(--a-texto-rgb, 255, 255, 255), .25);border-radius:var(--theme-radius-card, 13px);background:rgba(var(--theme-ink-deep, 0, 0, 0), 0.2);color:rgba(var(--a-texto-rgb, 244, 244, 245), .8);font-size:12px;font-weight:800;cursor:pointer;transition:background-color 0.2s,border-color 0.2s}
.tilt-pad-toggle:active{transform:scale(0.98);background:rgba(var(--a-texto-rgb, 255, 255, 255), 0.05)}
.tilt-result{display:grid;gap:14px;padding:24px 16px;text-align:center}
.tilt-result-icon{display:grid;width:70px;height:70px;margin:auto;place-items:center;border-radius:var(--theme-radius-pill, 999px);background:var(--mg-good-fondo);border:2px solid var(--mg-good);color:var(--mg-good);font-size:32px;box-shadow:0 0 20px color-mix(in srgb, var(--mg-good) 40%, transparent)}
.tilt-result.fail .tilt-result-icon{background:var(--mg-bad-fondo);border-color:var(--mg-bad);color:var(--mg-bad);box-shadow:0 0 20px color-mix(in srgb, var(--mg-bad) 40%, transparent)}
.tilt-result h2{margin:0;font-size:27px;text-shadow:0 2px 10px rgba(var(--theme-ink-deep, 0, 0, 0), 0.5)}
.tilt-result p{margin:0;color:rgba(var(--a-texto-rgb, 244, 244, 245), .8);font-size:13px;line-height:1.5}
.tilt-sensor{color:var(--mg-good);font-size:10px;font-weight:900;text-align:center;text-shadow:0 0 5px color-mix(in srgb, var(--mg-good) 50%, transparent)}
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
@media(max-height:700px){.tilt-board{max-width:min(540px,30dvh)}.tilt-pad{grid-template-rows:repeat(2,46px)}}
@media(max-height:600px){.tilt-board{max-width:min(540px,26dvh)}.tilt-stat{padding:5px}}
`

/** Casillas que caben de lado en el tablero: el laberinto (21×21 a 25×25) es de 5 a 8 veces lo que se ve. */
const VISTA = 9

/** Lo que tarda el tablero en correrse una casilla bajo la bola (lo que tardaba antes la bola). */
const PASO_MS = 100

type Paleta = {
  oscuro: string
  oscuroTransparente: string
  luz: string
  suelo: string
  pared: string
  agujero: string
  agujeroBorde: string
  llave: string
  meta: string
}

/**
 * Los colores del lienzo salen de las variables `--tilt-*` del tablero (ver CSS: Pizarra y los temas oscuros; Día con
 * el tablero marrón oscuro y la luz cálida). Se leen al pintar un paso, no en cada fotograma.
 */
function leerPaleta(tablero: Element): Paleta {
  const css = getComputedStyle(tablero)
  const v = (nombre: string) => css.getPropertyValue(nombre).trim()
  const oscuro = v('--tilt-oscuro')
  return {
    oscuro: `rgb(${oscuro})`,
    oscuroTransparente: `rgba(${oscuro}, 0)`,
    luz: v('--tilt-luz'),
    suelo: v('--tilt-suelo'),
    pared: v('--tilt-pared'),
    agujero: v('--tilt-agujero'),
    agujeroBorde: v('--tilt-agujero-borde'),
    llave: v('--tilt-llave'),
    meta: v('--tilt-meta'),
  }
}

type Escena = {
  maze: GeneratedTiltMaze
  agujeros: Set<number>
  llaves: Set<number>
  recogidas: Set<number>
  /** Casilla de la llave que toca recoger (lleva borde); -1 si no queda ninguna. */
  siguiente: number
  /** Radio de la luz, en casillas. */
  radio: number
}

/**
 * Pinta la ventana que se ve con `cam` (en casillas) en el centro, y de ella sólo lo que alcanza la luz. Lo que la luz
 * deja atrás vuelve a quedar a oscuras: no hay memoria ni minimapa. Llaves y meta, sin brillo: sólo se ven dentro del
 * círculo.
 */
function pintarLaberinto(
  ctx: CanvasRenderingContext2D,
  ancho: number,
  cam: { x: number; y: number },
  e: Escena,
  sombra: CanvasGradient,
  p: Paleta
) {
  const { maze } = e
  const c = ancho / VISTA
  const ox = ancho / 2 - cam.x * c
  const oy = ancho / 2 - cam.y * c
  const alcance = e.radio + 1.5
  const c0 = Math.max(0, Math.floor(cam.x - alcance))
  const c1 = Math.min(maze.cols - 1, Math.floor(cam.x + alcance))
  const f0 = Math.max(0, Math.floor(cam.y - alcance))
  const f1 = Math.min(maze.rows - 1, Math.floor(cam.y + alcance))

  ctx.fillStyle = p.oscuro
  ctx.fillRect(0, 0, ancho, ancho)
  ctx.fillStyle = p.suelo
  ctx.fillRect(ox + c0 * c, oy + f0 * c, (c1 - c0 + 1) * c, (f1 - f0 + 1) * c)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `900 ${Math.round(c * 0.6)}px system-ui, sans-serif`
  ctx.lineWidth = Math.max(1.5, c * 0.06)
  for (let f = f0; f <= f1; f += 1) {
    for (let col = c0; col <= c1; col += 1) {
      const i = f * maze.cols + col
      const x = ox + col * c + c / 2
      const y = oy + f * c + c / 2
      if (e.agujeros.has(i)) {
        ctx.beginPath()
        ctx.arc(x, y, c * 0.32, 0, Math.PI * 2)
        ctx.fillStyle = p.agujero
        ctx.fill()
        ctx.strokeStyle = p.agujeroBorde
        ctx.stroke()
      } else if (i === maze.goal) {
        ctx.fillStyle = p.meta
        ctx.fillText('⚑', x, y)
      } else if (e.llaves.has(i) && !e.recogidas.has(i)) {
        const r = c * 0.24
        ctx.beginPath()
        ctx.moveTo(x, y - r)
        ctx.lineTo(x + r, y)
        ctx.lineTo(x, y + r)
        ctx.lineTo(x - r, y)
        ctx.closePath()
        ctx.fillStyle = p.llave
        ctx.fill()
        if (i === e.siguiente) {
          ctx.strokeStyle = p.llave
          ctx.strokeRect(x - c * 0.4, y - c * 0.4, c * 0.8, c * 0.8)
        }
      }
    }
  }

  // Paredes: arriba e izquierda de cada casilla, y abajo/derecha en el borde del laberinto. Un solo trazo.
  ctx.beginPath()
  for (let f = f0; f <= f1; f += 1) {
    for (let col = c0; col <= c1; col += 1) {
      const muros = maze.cells[f * maze.cols + col].walls
      const x = ox + col * c
      const y = oy + f * c
      if (muros & WALL_UP) {
        ctx.moveTo(x, y)
        ctx.lineTo(x + c, y)
      }
      if (muros & WALL_LEFT) {
        ctx.moveTo(x, y)
        ctx.lineTo(x, y + c)
      }
      if (col === maze.cols - 1 && muros & WALL_RIGHT) {
        ctx.moveTo(x + c, y)
        ctx.lineTo(x + c, y + c)
      }
      if (f === maze.rows - 1 && muros & WALL_DOWN) {
        ctx.moveTo(x, y + c)
        ctx.lineTo(x + c, y + c)
      }
    }
  }
  ctx.strokeStyle = p.pared
  ctx.lineWidth = Math.max(2, c * 0.08)
  ctx.lineCap = 'round'
  ctx.stroke()

  // La oscuridad: un tinte de luz en el centro y opaca a partir del borde del círculo.
  ctx.fillStyle = sombra
  ctx.fillRect(0, 0, ancho, ancho)
}

/** El degradado de la oscuridad: se crea al cambiar el tamaño, la luz o el tema, no en cada fotograma. */
function crearSombra(ctx: CanvasRenderingContext2D, ancho: number, radio: number, p: Paleta) {
  const c = ancho / VISTA
  const g = ctx.createRadialGradient(ancho / 2, ancho / 2, 0, ancho / 2, ancho / 2, (radio + 0.6) * c)
  g.addColorStop(0, p.luz)
  g.addColorStop(Math.max(0.05, (radio - 0.6) / (radio + 0.6)), p.oscuroTransparente)
  g.addColorStop(1, p.oscuro)
  return g
}

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
  const textos = useTextos()
  const t = textos.tilt
  const juego = textos.juego
  const config = resolved.config

  // 22/11: hasta 25×25 (los niveles van de 21 a 25); se ven VISTA×VISTA casillas alrededor de la bola.
  const rows = clamp(config.grid_rows, 9, 5, 25)

  const cols = clamp(config.grid_cols, 9, 5, 25)

  // 22/11: `fog_radius` es ahora el radio de la luz alrededor de la bola (3 grande, 2 media, 1 pequeña). Sin él (misiones
  // sin nivel), luz media. Siempre a oscuras: llaves y meta sólo se ven dentro de la luz.
  const luz = clamp(config.fog_radius, 2, 0, 8) || 2
  const radioLuz = 0.85 * (luz + 1)

  const initialLives = clamp(config.lives, 3, 1, 5)

  // 22/11: en todos los laberintos la meta queda a los pasos que caben en el reloj (20 s + 1,3 s por paso), así que el
  // reloj es el de la tabla: 3 min, 2 min 30 s, 2 min. El reloj proporcional (abajo) sigue sólo para las configs con
  // `nivel`, y con el tope ya no lo alarga.
  const configConNivel = config as { nivel?: unknown }
  const conNivel = configConNivel.nivel !== undefined && configConNivel.nivel !== null
  const topePasos = Math.max(1, Math.floor((clamp(config.time_limit_s, 75, 20, 180) - 20) / 1.3))

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
        maxPasos: topePasos,
      }),
    [rows, cols, sessionSeed, config.hole_count, config.collectible_count, topePasos]
  )

  /**
   * Reloj de la partida (15/11): `time_limit_s` de la tabla es el SUELO; con `nivel` el límite es
   * max(suelo, 20 + 1,3 × pasos de la solución), así que un laberinto grande (15×15, 17×17) da el tiempo que pide
   * recorrerlo. Antes, 70-80 s para 140+ pasos era un bloqueo de hecho. Un fallo (agujero sin vidas, reloj) cuesta
   * repetir, no penaliza: el tiempo del nodo ya es el coste, por eso aquí no hay penalización por fallo (0 s).
   */
  const timeLimit = conNivel
    ? clamp(Math.max(Number(config.time_limit_s) || 0, Math.ceil(20 + 1.3 * pasosHastaLaMeta(maze))), 75, 20, 300)
    : clamp(config.time_limit_s, 75, 20, 180)

  /**
   * El tiempo de la partida NO se lleva aquí.
   *
   * Lo cuenta el reloj del nodo (`nodeClock`), que arranca en el primer
   * «Iniciar» (`onComezar`) y no se reinicia: leer la explicación no cuenta, y
   * fallar y reintentar sí. Aquí se llevaba un `comezouRef` que se ponía a cero
   * en CADA intento y se mandaba como tiempo de la partida: quien fallaba cuatro
   * veces se clasificaba con el tiempo del último intento, un tercio de lo que
   * había tardado de verdad. Ahora se manda el del nodo entero.
   */

  const [phase, setPhase] = useState<Phase>('ready')

  const [position, setPosition] = useState(maze.start)

  const [lives, setLives] = useState(initialLives)

  const [remaining, setRemaining] = useState(timeLimit)

  const [collected, setCollected] = useState<Set<number>>(() => new Set())

  const [message, setMessage] = useState('')

  const [failure, setFailure] = useState('')

  const [sensorActive, setSensorActive] = useState(false)

  const [sensorText, setSensorText] = useState(t.sensorInicial)

  /**
   * Antitrampas: salir a media partida para planear la ruta con calma (en
   * papel, en otra pantalla) fuera del apuro de estar tocando el móvil.
   *
   * El laberinto no tiene un `setSessionSeed` -se fija una sola vez al
   * montar el componente, ver `sessionSeed` arriba-, así que aquí no se
   * regenera el trazado: se trata como perder todas las vidas de golpe,
   * igual que caer en el último agujero. Perder el intento entero es el
   * coste de salir, sea cual sea el motivo -capturar el mapa o cualquier
   * otro-.
   *
   * Sólo si el jugador se fue de verdad: el laberinto se juega INCLINANDO el
   * móvil, sin tocarlo, y con el autobloqueo puesto la pantalla se apagaba a
   * los 30 s y el intento se daba por perdido sin que nadie se hubiera ido a
   * ninguna parte (ver `useRegenerarAoOcultar` y `hooks/salidasDeLaApp.ts`).
   */
  useRegenerarAoOcultar(phase === 'playing', () => {
    setFailure(t.salioAMediaPartida)
    setPhase('failed')
  })

  // En reglas, resultado o fallo no hay laberinto que memorizar: salir no cuenta.
  useSinRetoEnPantalla(phase !== 'playing')

  const [continuing, setContinuing] = useState(false)

  /**
   * Los botones van escondidos y sólo aparecen si se piden.
   *
   * El reto es inclinar el móvil. Con la cruceta siempre a la vista, nadie
   * inclina nada: se juega a toques y el nodo pierde la gracia. Quedan a un
   * botón de distancia para quien no le funcione el sensor.
   */
  const [botonesVisibles, setBotonesVisibles] = useState(false)

  /**
   * Revisión 19/10: la cruceta salía gratis y a un toque, así que el laberinto
   * se jugaba a botones sin inclinar nada. Ahora va como el resto de juegos de
   * sensor (core/modoAlternativo.ts): sólo se ofrece si el sensor no está, no
   * manda datos o se deniega, y usarla cuesta el minuto del modo alternativo.
   * Si el organizador apagó el sensor (`sensor_enabled: false`) los botones
   * son el juego y no cuestan nada.
   */
  const sensorApagadoPorElNodo = config.sensor_enabled === false
  const [estadoSensor, setEstadoSensor] = useState<EstadoDelSensor>('sin_comprobar')
  const ofrecerBotones = sensorApagadoPorElNodo || puedeUsarModoAlternativo(estadoSensor)
  const lecturasRef = useRef(0)

  const baselineRef = useRef<{
    beta: number
    gamma: number
  } | null>(null)

  const lastStepRef = useRef(0)
  const continueLockRef = useRef(false)

  const moveRef = useRef<(direction: TiltDirection) => void>(() => undefined)

  const holeSet = useMemo(() => new Set(maze.holes), [maze.holes])

  // 11/11: al caer en un agujero (o reiniciar) la bola vuelve al inicio de un salto; con la transición de 100 ms
  // se la veía deslizarse a través de las paredes. Sólo se anima el paso a una casilla vecina.
  const posicionAnteriorRef = useRef(position)
  const esSalto = !sonVecinas(posicionAnteriorRef.current, position, maze.cols)
  useEffect(() => {
    posicionAnteriorRef.current = position
  }, [position])

  const itemSet = useMemo(() => new Set(maze.collectibles), [maze.collectibles])

  const allCollected = collected.size >= maze.collectibles.length

  // Las llaves se recogen en orden (el de la ruta, ver generateTiltMaze): la que toca lleva un borde.
  const siguienteLlave = maze.collectibles[collected.size] ?? -1

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
        setMessage(t.pared)
        return
      }

      const nextCollected = new Set(collected)

      if (next === siguienteLlave) {
        nextCollected.add(next)
        setCollected(nextCollected)
        haptic([12, 20, 22])
        setMessage(t.objetoRecogido)
      } else if (itemSet.has(next) && !collected.has(next)) {
        setMessage(t.llaveFueraDeOrden)
      } else {
        setMessage('')
      }

      if (holeSet.has(next)) {
        const nextLives = lives - 1

        haptic([50, 40, 50])
        setLives(nextLives)

        if (nextLives <= 0) {
          setFailure(t.sinVidas)
          setPhase('failed')
          return
        }

        setPosition(maze.start)
        setMessage(t.cayoEnAgujero)
        return
      }

      setPosition(next)

      if (next === maze.goal) {
        if (nextCollected.size >= maze.collectibles.length) {
          haptic([20, 35, 80])
          setPhase('success')
          return
        }

        setMessage(t.salidaCerrada)
      }
    },
    [phase, maze, position, collected, siguienteLlave, itemSet, holeSet, lives, t]
  )

  useEffect(() => {
    moveRef.current = move
  }, [move])

  const lienzoRef = useRef<HTMLCanvasElement>(null)
  // Centro de la vista, en casillas: va hacia la bola en PASO_MS (de golpe al saltar o con movimiento reducido).
  const camaraRef = useRef({ x: (maze.start % maze.cols) + 0.5, y: Math.floor(maze.start / maze.cols) + 0.5 })
  const sombraRef = useRef<{ clave: string; g: CanvasGradient } | null>(null)
  const [anchoLienzo, setAnchoLienzo] = useState(0)

  useEffect(() => {
    const lienzo = lienzoRef.current
    if (phase !== 'playing' || !lienzo) return
    const medir = () => {
      const ancho = Math.round(lienzo.clientWidth * Math.min(2, window.devicePixelRatio || 1))
      if (ancho > 0 && lienzo.width !== ancho) {
        lienzo.width = ancho
        lienzo.height = ancho
      }
      setAnchoLienzo(ancho)
    }
    medir()
    if (typeof ResizeObserver === 'undefined') return
    const vigia = new ResizeObserver(medir)
    vigia.observe(lienzo)
    return () => vigia.disconnect()
  }, [phase])

  useEffect(() => {
    const lienzo = lienzoRef.current
    const ctx = lienzo?.getContext('2d')
    if (phase !== 'playing' || !lienzo || !ctx || anchoLienzo <= 0) return
    const paleta = leerPaleta(lienzo)
    const clave = `${anchoLienzo}:${radioLuz}:${paleta.oscuro}:${paleta.luz}`
    if (sombraRef.current?.clave !== clave) {
      sombraRef.current = { clave, g: crearSombra(ctx, anchoLienzo, radioLuz, paleta) }
    }
    const sombra = sombraRef.current.g
    const escena: Escena = {
      maze,
      agujeros: holeSet,
      llaves: itemSet,
      recogidas: collected,
      siguiente: siguienteLlave,
      radio: radioLuz,
    }
    const cam = camaraRef.current
    const desdeX = cam.x
    const desdeY = cam.y
    const haciaX = (position % maze.cols) + 0.5
    const haciaY = Math.floor(position / maze.cols) + 0.5
    const deGolpe = esSalto || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
    const inicio = performance.now()
    let raf = 0
    const fotograma = (ahora: number) => {
      const k = deGolpe ? 1 : Math.max(0, Math.min(1, (ahora - inicio) / PASO_MS))
      cam.x = desdeX + (haciaX - desdeX) * k
      cam.y = desdeY + (haciaY - desdeY) * k
      pintarLaberinto(ctx, anchoLienzo, cam, escena, sombra, paleta)
      if (k < 1) raf = requestAnimationFrame(fotograma)
    }
    fotograma(inicio)
    return () => cancelAnimationFrame(raf)
  }, [phase, anchoLienzo, radioLuz, maze, holeSet, itemSet, collected, siguienteLlave, position, esSalto])

  useEffect(() => {
    if (phase !== 'playing') {
      return
    }

    const timer = window.setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          window.clearInterval(timer)
          setFailure(t.seTerminoElTiempo)
          setPhase('failed')
          return 0
        }

        return value - 1
      })
    }, 1000)

    return () => window.clearInterval(timer)
  }, [phase, t])

  useEffect(() => {
    if (phase !== 'playing' || !sensorActive) {
      return
    }

    const handler = (event: DeviceOrientationEvent) => {
      if (event.beta === null || event.gamma === null) {
        return
      }

      lecturasRef.current += 1

      if (!baselineRef.current) {
        baselineRef.current = {
          beta: event.beta,
          gamma: event.gamma,
        }

        setSensorText(t.sensorCalibrado)
        return
      }

      const now = Date.now()

      if (now - lastStepRef.current < cooldown) {
        return
      }

      // beta/gamma van en ejes del aparato: con la pantalla en horizontal hay
      // que girarlos o las direcciones salen cambiadas (ver ejesDePantalla).
      const { x: deltaGamma, y: deltaBeta } = ejesDePantalla(
        event.gamma - baselineRef.current.gamma,
        event.beta - baselineRef.current.beta,
        anguloDePantalla()
      )

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

    // Al girar la pantalla la postura de reposo es otra: se recalibra con la
    // siguiente lectura en vez de leer el giro entero como una inclinación.
    const alGirar = () => {
      baselineRef.current = null
    }

    window.addEventListener('deviceorientation', handler)
    window.addEventListener('orientationchange', alGirar)
    window.screen?.orientation?.addEventListener?.('change', alGirar)

    return () => {
      window.removeEventListener('deviceorientation', handler)
      window.removeEventListener('orientationchange', alGirar)
      window.screen?.orientation?.removeEventListener?.('change', alGirar)
    }
  }, [phase, sensorActive, cooldown, threshold, t])

  // Permiso concedido pero el sensor no manda nada (un portátil, por ejemplo):
  // se da por mudo y sólo entonces se ofrece la cruceta.
  useEffect(() => {
    if (phase !== 'playing' || !sensorActive) return
    const id = window.setTimeout(() => {
      if (lecturasRef.current === 0) setEstadoSensor('mudo')
    }, ESPERA_SENSOR_MUDO_MS)
    return () => window.clearTimeout(id)
  }, [phase, sensorActive])

  async function enableSensor() {
    if (config.sensor_enabled === false || !('DeviceOrientationEvent' in window)) {
      setSensorActive(false)
      setSensorText(t.modoTactil)
      if (config.sensor_enabled !== false) setEstadoSensor('no_disponible')
      return
    }

    try {
      const Orientation = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
        requestPermission?: () => Promise<'granted' | 'denied'>
      }

      if (typeof Orientation.requestPermission === 'function') {
        // El aviso de permiso del sistema (iOS) quita el foco a la página. Sin
        // avisar antes, el anti-trampas lo leía como «se fue a otra app»: +30 s y
        // el laberinto reiniciado justo al empezar.
        avisarPeticionDePermisoPropia()
        const permission = await Orientation.requestPermission()

        if (permission !== 'granted') {
          throw new Error('Permiso rechazado')
        }
      }

      baselineRef.current = null
      lecturasRef.current = 0
      setEstadoSensor('disponible')
      setSensorActive(true)
      setSensorText(t.calibrar)
    } catch (error) {
      setSensorActive(false)
      setSensorText(t.sensorNoDisponible)
      setEstadoSensor(
        error instanceof Error && error.message === 'Permiso rechazado' ? 'denegado' : 'no_disponible'
      )
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
    onComezar?.()
    setPhase('playing')

    // El sensor se activa SIN esperar. Si el permiso de orientación se cuelga o
    // el navegador no responde, el juego tiene que seguir siendo jugable con
    // los botones: antes el arranque quedaba a medias y el laberinto se veía
    // pintado pero inerte, sin que el cronómetro llegase a correr.
    // Con la cruceta ya sacada no se vuelve a encender (revisión 19/10): la bola
    // se movía sola mientras se usaban las flechas.
    if (!botonesVisibles) void enableSensor()
  }

  const continueRoute = useCallback(async () => {
    if (phase !== 'success' || submitting || continuing || continueLockRef.current) {
      return
    }

    continueLockRef.current = true
    setContinuing(true)

    try {
      // Sin tiempo propio: la hoja usa el reloj del nodo, que cuenta desde el
      // primer «Iniciar» y por todos los intentos (ver arriba).
      // Con la cruceta (modo alternativo) cuesta el minuto y queda en la evidencia. 15/11: aquí se queda en 60 s a
      // propósito (no los 25 s de Faros/Pulso): con botones cada toque es un paso y se cruza MÁS rápido que
      // inclinando, así que bajarlo regalaría ventaja a quien deniegue el permiso del sensor.
      const conBotones = botonesVisibles && !sensorApagadoPorElNodo
      if (conBotones) marcarModoAlternativo(stage.id, estadoSensor)
      const superado = await (conBotones ? onWin(penalizacionDelModo(true)) : onWin())

      // El nodo no se aceptó (sin cobertura y sin poder guardar en el móvil, o
      // un rechazo del servidor): se suelta «Avanzando…» y el botón vuelve a
      // estar disponible. Antes se quedaba pegado para siempre. `undefined`
      // = había otro envío en marcha; ese ya acabará solo.
      if (superado === false) {
        continueLockRef.current = false
        setContinuing(false)
      }
    } catch (error) {
      continueLockRef.current = false
      setContinuing(false)
      throw error
    }
  }, [phase, submitting, continuing, onWin, botonesVisibles, sensorApagadoPorElNodo, stage.id, estadoSensor])

  const title = stage.title || t.titulo

  const instructions = String(stage.content || helperText || '').trim() || t.instrucciones

  if (phase === 'ready') {
    return (
      <section className="tilt-shell saga-glass-panel" data-phase={phase}>
        <style>{CSS}</style>

        <div className="tilt-result">
          <h2>{title}</h2>

          {/**
           * 31/10: miniatura del tablero en vez de pantalla de texto. Es un
           * laberinto de muestra, NO el de la partida: el reloj del nodo ya
           * corre, pero enseñar el trazado real dejaría planear la ruta (y
           * saltarse la niebla) antes de inclinar nada.
           */}
          <svg className="tilt-muestra" viewBox="0 0 100 100" role="img" aria-label={t.leyenda}>
            <rect className="borde" x="3" y="3" width="94" height="94" rx="6" />
            <path className="pared" d="M22 3V41M41 22V60H22M60 3V41H79M3 79H41V97M60 60V97M60 60H97M79 41V60" />
            <circle className="agujero" cx="31" cy="69" r="6" />
            <path className="objeto" d="M50 26l6 6-6 6-6-6z" />
            <circle className="bola" cx="12" cy="12" r="6" />
            <text className="meta" x="88" y="92" textAnchor="middle">⚑</text>
          </svg>

          <p>{instructions}</p>

          <button type="button" className="tilt-primary" onClick={() => void start()}>
            {t.iniciar}
          </button>

          {/* 7/11: lo que cuesta jugar sin sensor (+1 min) lo dice sólo el botón «Usar botones». */}
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

          <h2>{t.superado}</h2>

          <p>{t.superadoDetalle}</p>

          <button
            type="button"
            className="tilt-primary"
            disabled={submitting || continuing}
            onClick={() => void continueRoute()}
          >
            {submitting || continuing ? juego.avanzando : juego.continuarSiguienteNodo}
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

          <h2>{t.intentoTerminado}</h2>

          <p>{failure}</p>

          <button
            type="button"
            className="tilt-primary"
            onClick={() => {
              setPhase('ready')
              setMessage('')
            }}
          >
            {t.volverAIntentarlo}
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
            <span>{t.segundos}</span>
          </div>

          <div className="tilt-stat">
            <strong>{lives}</strong>
            <span>{t.vidas}</span>
          </div>

          <div className="tilt-stat">
            <strong>
              {collected.size}/{maze.collectibles.length}
            </strong>
            <span>{t.llaves}</span>
          </div>
        </div>

        <div className="tilt-board-wrap">
          <div className="tilt-board">
            {/**
             * 22/11 (diseño A): el laberinto se pinta en el lienzo, a oscuras salvo el círculo de luz, y se corre bajo
             * la bola. La bola se queda quieta en el centro: es la cámara la que la sigue.
             */}
            <canvas ref={lienzoRef} className="tilt-lienzo" aria-hidden="true" />
            <div className="tilt-ball-layer" style={{ width: `${100 / VISTA}%`, height: `${100 / VISTA}%` }}>
              <div className="tilt-ball" />
            </div>
          </div>
        </div>

        <div className="tilt-help">
          {message || (allCollected ? t.todasLasLlaves : t.inclinaSuavemente)}
        </div>

        <div className="tilt-sensor">{sensorText}</div>

        {botonesVisibles ? (
          <div className="tilt-pad">
            <button type="button" className="up" aria-label={t.arriba} onClick={() => move('up')}>
              ↑
            </button>

            <button
              type="button"
              className="left"
              aria-label={t.izquierda}
              onClick={() => move('left')}
            >
              ←
            </button>

            <button type="button" className="down" aria-label={t.abajo} onClick={() => move('down')}>
              ↓
            </button>

            <button
              type="button"
              className="right"
              aria-label={t.derecha}
              onClick={() => move('right')}
            >
              →
            </button>
          </div>
        ) : (
          /* 20/11 (QA): el botón tiene su hueco desde el principio y sólo aparece (fundido) cuando hace falta: llegaba a los
             2,5 s del sensor mudo y la hoja crecía de golpe. */
          <button
            type="button"
            className="tilt-pad-toggle"
            disabled={!ofrecerBotones}
            aria-hidden={!ofrecerBotones}
            tabIndex={ofrecerBotones ? undefined : -1}
            style={{
              opacity: ofrecerBotones ? 1 : 0,
              visibility: ofrecerBotones ? 'visible' : 'hidden',
              transition: 'opacity var(--saga-dur-media) var(--saga-curva-entra), visibility var(--saga-dur-media)',
            }}
            onClick={() => {
              // Al sacar la cruceta se apaga el sensor: con los dos a la vez la
              // bola se movía sola mientras intentabas darle a las flechas.
              setBotonesVisibles(true)
              setSensorActive(false)
              baselineRef.current = null
              setSensorText(t.botonesActivos)
            }}
          >
            {t.usarBotones}
          </button>
        )}

        <div className="tilt-actions">
          <button
            type="button"
            onClick={() => {
              baselineRef.current = null
              setSensorText(t.recalibrar)
            }}
          >
            {t.recalibrarBoton}
          </button>

          <button
            type="button"
            onClick={() => {
              setPosition(maze.start)
              setMessage(t.bolaAlInicio)
            }}
          >
            {t.volverAlInicio}
          </button>
        </div>
      </div>
    </section>
  )
}

export default TiltMazeRuntimeScreen
