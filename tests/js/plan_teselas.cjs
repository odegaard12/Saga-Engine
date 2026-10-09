// El plan de teselas del móvil (planificarTeselas) para unos nodos dados en JSON por la
// entrada estándar. Imprime las teselas de satélite como [z, x, y] en su orden. Lo usa
// tests/test_plan_de_teselas.py para comparar con backend/app/runtime/plan_teselas.py.
'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')

const nodos = JSON.parse(require('fs').readFileSync(0, 'utf8'))
const e = crearEntorno()
const mapa = e.cargar('src/player/offline/mapTileCache.ts')
const plan = mapa.planificarTeselas(nodos)
const salida = plan.urls
  .filter((u) => u.startsWith('/map-tiles/'))
  .map((u) => u.replace('/map-tiles/', '').replace('.png', '').split('/').map(Number))
process.stdout.write(JSON.stringify(salida))
