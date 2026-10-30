// Lógica pura de Interrogatorio, Mastermind y Balanza (frontend/src/player/minigames/families/logica/motor.ts).
// Vuelca un JSON para tests/test_juegos_logica.py.
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const RAIZ = path.resolve(__dirname, '..', '..')
const ts = require(path.join(RAIZ, 'frontend', 'node_modules', 'typescript'))
const abs = path.join(RAIZ, 'frontend', 'src', 'player', 'minigames', 'families', 'logica', 'motor.ts')
const js = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const modulo = { exports: {} }
vm.runInNewContext(js, { module: modulo, exports: modulo.exports, Math, Number, String, Array, Map, Set, Object, JSON })
const m = modulo.exports

const out = { casos: 0, unicos: 0, culpableCuadra: 0, distintos: new Set(), metaUsado: 0, reglas: new Set() }
for (const [n, meta, mixta] of [[3, false, false], [4, false, false], [4, true, false], [5, true, true]]) {
  for (let s = 0; s < 150; s += 1) {
    const c = m.generarCaso(`p-semilla:${n}:${s}`, n, meta, mixta)
    out.casos += 1
    const sol = m.soluciones(c.dichos, c.regla)
    if (sol.length === 1) out.unicos += 1
    if (sol[0] === c.culpable) out.culpableCuadra += 1
    if (c.dichos.some((d) => d.tipo === 'miente' || d.tipo === 'dice_verdad')) out.metaUsado += 1
    out.reglas.add(c.regla)
    out.distintos.add(JSON.stringify(c))
  }
}
const mismo = JSON.stringify(m.generarCaso('x', 4, true, true)) === JSON.stringify(m.generarCaso('x', 4, true, true))
const pistas = [
  m.pistas([0, 1, 2, 3], [0, 1, 2, 3]),
  m.pistas([0, 1, 2, 3], [3, 2, 1, 0]),
  m.pistas([0, 0, 1, 2], [0, 1, 0, 0]),
  m.pistas([5, 4, 3], [0, 1, 2]),
]
const codigos = []
for (let s = 0; s < 200; s += 1) codigos.push(m.generarCodigo('c' + s, 5, 7, false))
const sinRepetir = codigos.every((c) => new Set(c).size === c.length && c.every((x) => x >= 0 && x < 7))
const pesadas = [m.pesar(2, [1, 2], [3, 4]), m.pesar(2, [1, 3], [4, 5]), m.pesar(2, [0, 1], [2, 3]), m.pesar(7, [0], [1])]
const bolas = new Set()
for (let s = 0; s < 200; s += 1) bolas.add(m.bolaPesada('b' + s, 9))
console.log(JSON.stringify({
  casos: out.casos, unicos: out.unicos, culpableCuadra: out.culpableCuadra, distintos: out.distintos.size,
  metaUsado: out.metaUsado, reglas: [...out.reglas].sort(), mismo, pistas, sinRepetir, pesadas,
  bolasDistintas: bolas.size,
  resoluble: [[6, 2], [9, 2], [18, 3], [27, 3], [10, 2]].map(([b, p]) => m.resoluble(b, p)),
}))
