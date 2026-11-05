// Distancia al camino más cercano de la red (5/11), a lo largo de los tramos y no sólo a los cruces. JSON para
// tests/test_guiado_5_11.py.
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const RAIZ = path.resolve(__dirname, '..', '..')
const ts = require(path.join(RAIZ, 'frontend', 'node_modules', 'typescript'))
const fuente = fs.readFileSync(path.join(RAIZ, 'frontend', 'src', 'player', 'routing', 'roadGraph.ts'), 'utf8')
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const mod = { exports: {} }
vm.runInNewContext('(function (module, exports, require) {' + js + '\n})', { Math, Map, Set, Number, Infinity, JSON, fetch: undefined })(mod, mod.exports, () => ({}))
const { indexarGrafo, distanciaALaRedM } = mod.exports
// Una pista recta de 1 km este-oeste con sólo dos cruces, en los extremos.
const g = indexarGrafo({ nodos: [[40.41, -3.70], [40.41, -3.6882]], tramos: [[0, 1, 1000, [], 7]] })
const enLaPista = distanciaALaRedM(g, { lat: 40.41, lon: -3.6941 }) // a mitad de la pista, a ~500 m de cada cruce
const a30 = distanciaALaRedM(g, { lat: 40.41027, lon: -3.6941 }) // ~30 m al norte
const lejos = distanciaALaRedM(g, { lat: 40.43, lon: -3.6941 }, 1500) // ~2,2 km
console.log(JSON.stringify({ enLaPista: Math.round(enLaPista), a30: Math.round(a30), lejos: lejos === Infinity }))
