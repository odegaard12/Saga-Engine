import { generateTiltMaze, pasosHastaLaMeta, type GeneratedTiltMaze } from '../../shared/tiltMaze'

/**
 * El laberinto de equilibrio tal como lo juega el móvil (23/11), para la vista previa del panel.
 *
 * Mismas cuentas que `player/minigames/families/tiltMaze/RuntimeScreen.tsx` (tamaño, tope de pasos según el reloj,
 * radio de la luz, reloj con nivel) y mismos valores por defecto que el servidor (`minigames.py`, rama tilt_maze), que
 * es quien rellena lo que falta antes de mandar la config al móvil. Si una de las dos cambia, lo dice
 * tests/test_admin_ajustes_23_11.py.
 */

/** Casillas que el jugador ve de lado: el laberinto (21×21 a 25×25) es mucho más grande que su pantalla. */
export const VISTA_DEL_JUGADOR = 9

/** Semillas de serie: cuentan como «sin semilla» (minigames.py, SEMILLAS_POR_DEFECTO). */
const SEMILLAS_DE_SERIE = new Set(['', 'saga-maze', 'saga-simon'])

function entero(valor: unknown, defecto: number, minimo: number, maximo: number) {
  const n = Number(valor)
  return Math.max(minimo, Math.min(maximo, Number.isFinite(n) ? Math.round(n) : defecto))
}

/** `null`/`undefined`/'' no son un número escrito: vale el valor por defecto (Number(null) es 0). */
function escrito(valor: unknown) {
  return valor === null || valor === undefined || valor === '' ? undefined : valor
}

export type QuienLoJuega = 'todos' | 'todos-otro' | 'cada-jugador' | 'cada-intento'

export type LaberintoDelJugador = {
  filas: number
  columnas: number
  agujeros: number
  llaves: number
  vidas: number
  /** 3 grande, 2 media, 1 pequeña. */
  luz: number
  /** Radio del círculo de luz, en casillas. */
  radioLuz: number
  /** Reloj de la partida, en segundos. */
  tiempoS: number
  /** Pasos de la salida a la meta. */
  pasos: number
  semilla: string
  /**
   * `todos`: este mismo laberinto para todos. `todos-otro`: uno para todos, pero lo sortea el servidor (nivel 2 sin
   * semilla). `cada-jugador`: uno por jugador. `cada-intento`: uno nuevo en cada intento.
   */
  quien: QuienLoJuega
  maze: GeneratedTiltMaze
}

export function laberintoDelJugador(config: Record<string, unknown>): LaberintoDelJugador {
  const lado = String(config.difficulty || '').toLowerCase() === 'hard' ? 25 : 21
  const filas = entero(escrito(config.grid_rows), lado, 5, 25)
  const columnas = entero(escrito(config.grid_cols), lado, 5, 25)
  const agujeros = entero(escrito(config.hole_count), 14, 0, 18)
  const llaves = entero(escrito(config.collectible_count), 2, 0, 6)
  const vidas = entero(escrito(config.lives), 3, 1, 5)
  const luz = entero(escrito(config.fog_radius), 2, 0, 8) || 2
  const reloj = entero(escrito(config.time_limit_s), 150, 20, 180)
  const semillaEscrita = String(config.maze_seed || '').trim()
  const propia = !SEMILLAS_DE_SERIE.has(semillaEscrita.toLowerCase())
  const semilla = propia ? semillaEscrita : 'saga-maze'
  const nivel = Math.trunc(Number(config.nivel))
  const conNivel = config.nivel !== undefined && config.nivel !== null

  // La meta queda a los pasos que caben en el reloj (20 s + 1,3 s por paso).
  const maze = generateTiltMaze({
    rows: filas,
    cols: columnas,
    seed: semilla,
    holeCount: agujeros,
    collectibleCount: llaves,
    maxPasos: Math.max(1, Math.floor((reloj - 20) / 1.3)),
  })
  const pasos = pasosHastaLaMeta(maze)
  const tiempoS = conNivel ? entero(Math.max(reloj, Math.ceil(20 + 1.3 * pasos)), 75, 20, 300) : reloj

  const quien: QuienLoJuega =
    config.pattern_mode === 'random_each_game'
      ? 'cada-intento'
      : propia
        ? 'todos'
        : conNivel && nivel === 2 && config.nivel_a_mano !== true
          ? 'todos-otro'
          : 'cada-jugador'

  return { filas, columnas, agujeros, llaves, vidas, luz, radioLuz: 0.85 * (luz + 1), tiempoS, pasos, semilla, quien, maze }
}

/** «2 min 30 s», «3 min», «45 s». */
export function textoDeTiempo(segundos: number) {
  const min = Math.floor(segundos / 60)
  const s = segundos % 60
  return [min ? `${min} min` : '', s || !min ? `${s} s` : ''].filter(Boolean).join(' ')
}

export function textoDeLuz(luz: number) {
  return luz >= 3 ? 'luz grande' : luz === 2 ? 'luz media' : 'luz pequeña'
}
