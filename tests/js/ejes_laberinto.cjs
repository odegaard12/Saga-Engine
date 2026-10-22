// El laberinto con la pantalla girada (22/10/2026): ejecuta ejesDePantalla.ts tal cual (transpilado al vuelo) y
// vuelca en JSON hacia dónde va la bola en cada giro. Lo comprueba tests/test_laberinto_en_horizontal.py.
'use strict'

const fs = require('fs')
const path = require('path')
const RAIZ = path.resolve(__dirname, '..', '..')
const ts = require(path.join(RAIZ, 'frontend', 'node_modules', 'typescript'))

const fuente = path.join(RAIZ, 'frontend', 'src', 'player', 'minigames', 'families', 'tiltMaze', 'ejesDePantalla.ts')
const js = ts.transpileModule(fs.readFileSync(fuente, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const modulo = { exports: {} }
new Function('module', 'exports', js)(modulo, modulo.exports)
const { ejesDePantalla } = modulo.exports

// La misma decisión que el laberinto: el eje que más se inclina manda.
function direccion(deltaGamma, deltaBeta, angulo) {
  const { x, y } = ejesDePantalla(deltaGamma, deltaBeta, angulo)
  return Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : y > 0 ? 'down' : 'up'
}

const salida = {}
for (const angulo of [0, 90, 180, 270, -90]) {
  salida[angulo] = {
    gammaMas: direccion(20, 0, angulo),
    gammaMenos: direccion(-20, 0, angulo),
    betaMas: direccion(0, 20, angulo),
    betaMenos: direccion(0, -20, angulo),
  }
}
process.stdout.write(JSON.stringify(salida))
