// Pasa shared/clasificacion_casos.json por la regla del móvil (ordenarClasificacion) y vuelca, por caso, el orden
// que sale (lista de `user`), en la hoja y en la pantalla final. Lo compara tests/test_clasificacion_casos_compartidos.py con el esperado y con Python.
'use strict'

const fs = require('fs')
const path = require('path')
const { crearCargador, RAIZ } = require('./cargarTs.cjs')

const { ordenarClasificacion, ordenarPorTiempoTotal } = crearCargador()('src/player/components/clasificacion.ts')
const { casos } = JSON.parse(fs.readFileSync(path.join(RAIZ, 'shared', 'clasificacion_casos.json'), 'utf8'))

// La pantalla final (ordenarPorTiempoTotal) tiene que dar el mismo orden que la hoja.
const salida = { hoja: {}, final: {} }
for (const caso of casos) {
  salida.hoja[caso.nombre] = ordenarClasificacion(caso.jugadores).map((j) => j.user)
  salida.final[caso.nombre] = ordenarPorTiempoTotal(caso.jugadores).map((j) => j.user)
}
process.stdout.write(JSON.stringify(salida))
