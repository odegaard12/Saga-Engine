// 23/11/2026: la vista previa del laberinto del panel enseña el laberinto que se juega (mismo generador, mismas cuentas
// que el móvil y mismos valores por defecto que el servidor). Lo comprueba tests/test_admin_ajustes_23_11.py.
'use strict'
const { crearCargador } = require('./cargarTs.cjs')

const cargar = crearCargador({ Math, Date })
const lib = cargar('src/admin/lib/laberintoDelJugador.ts')
const tm = cargar('src/shared/tiltMaze.ts')
const niveles = cargar('src/player/minigames/core/nivel.ts')

const out = { vista: lib.VISTA_DEL_JUGADOR, niveles: [] }
for (const n of [1, 2, 3, 4, 5]) {
  const params = niveles.parametrosDeNivel('tilt_maze', n)
  const config = { ...params, nivel: n, nivel_a_mano: false, maze_seed: 'prueba-' + n, pattern_mode: 'fixed' }
  const lab = lib.laberintoDelJugador(config)
  // Lo que hace el móvil (RuntimeScreen.tsx), escrito aparte: tope de pasos por el reloj y reloj con nivel.
  const tope = Math.max(1, Math.floor((params.time_limit_s - 20) / 1.3))
  const esperado = tm.generateTiltMaze({
    rows: params.grid_rows, cols: params.grid_cols, seed: 'prueba-' + n,
    holeCount: params.hole_count, collectibleCount: params.collectible_count, maxPasos: tope,
  })
  const pasos = tm.pasosHastaLaMeta(esperado)
  out.niveles.push({
    n, params,
    filas: lab.filas, columnas: lab.columnas, llaves: lab.llaves, vidas: lab.vidas, agujeros: lab.agujeros, luz: lab.luz,
    radioLuz: lab.radioLuz, tiempoS: lab.tiempoS, pasos: lab.pasos, quien: lab.quien,
    mismoLaberinto: JSON.stringify(lab.maze) === JSON.stringify(esperado),
    tiempoEsperado: Math.max(20, Math.min(300, Math.max(params.time_limit_s, Math.ceil(20 + 1.3 * pasos)))),
    casillas: lab.maze.cells.length, tope,
  })
}

// Sin nada escrito: los valores por defecto del servidor (minigames.py), no los de un editor viejo.
const vacio = lib.laberintoDelJugador({})
out.vacio = { filas: vacio.filas, columnas: vacio.columnas, llaves: vacio.llaves, vidas: vacio.vidas, agujeros: vacio.agujeros, luz: vacio.luz, tiempoS: vacio.tiempoS, quien: vacio.quien }
out.dificil = lib.laberintoDelJugador({ difficulty: 'hard' }).filas
out.nulos = lib.laberintoDelJugador({ grid_rows: null, grid_cols: '', lives: null, hole_count: null }).filas
out.quien = {
  semillaPropia: lib.laberintoDelJugador({ maze_seed: 'maze-abc' }).quien,
  deSerie: lib.laberintoDelJugador({ maze_seed: 'saga-maze' }).quien,
  nivel2: lib.laberintoDelJugador({ nivel: 2, nivel_a_mano: false }).quien,
  nivel2AMano: lib.laberintoDelJugador({ nivel: 2, nivel_a_mano: true }).quien,
  nivel4: lib.laberintoDelJugador({ nivel: 4 }).quien,
  cadaIntento: lib.laberintoDelJugador({ maze_seed: 'maze-abc', pattern_mode: 'random_each_game' }).quien,
}
out.textos = [lib.textoDeTiempo(180), lib.textoDeTiempo(150), lib.textoDeTiempo(45), lib.textoDeLuz(3), lib.textoDeLuz(2), lib.textoDeLuz(1)]
console.log(JSON.stringify(out))
