// Prueba el módulo puro hooks/latidoAdaptativo.ts. Entrada: nada. Salida: JSON con las respuestas de cada caso.
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const RAIZ = path.resolve(__dirname, '..', '..')
const ts = require(path.join(RAIZ, 'frontend', 'node_modules', 'typescript'))
const fuente = path.join(RAIZ, 'frontend', 'src', 'player', 'hooks', 'latidoAdaptativo.ts')
const js = ts.transpileModule(fs.readFileSync(fuente, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const m = { exports: {} }
vm.runInNewContext(js, { module: m, exports: m.exports, Math, Number })
const { intervaloDeLatido, crearVigilanteDeQuietud, metros } = m.exports
const e = (o) => intervaloDeLatido({ ahorro: false, sinCobertura: false, quietoMs: 0, distanciaNodoM: 900, ...o })
const v = crearVigilanteDeQuietud()
const P = { lat: 40.4, lon: -3.7 }
const al = (dm) => ({ lat: P.lat + dm / 111320, lon: P.lon })
const traza = []
traza.push(v.ver(null, 0))
traza.push(v.ver(P, 1000)) // primera muestra: 0
traza.push(v.ver(al(4), 31000)) // 4 m en 30 s: parado -> 30 000
traza.push(v.ver(al(8), 61000)) // 8 m desde la referencia: parado -> 60 000
traza.push(v.ver(al(40), 62000)) // se movió 40 m: vuelve a 0
traza.push(v.ver(al(41), 400000)) // parado de nuevo desde 62 000: 338 000
traza.push(v.ver(null, 401000)) // sin posición: 0
console.log(
  JSON.stringify({
    andando: e({}),
    ahorro: e({ ahorro: true }),
    parado1min: e({ quietoMs: 60000 }),
    parado30s: e({ quietoMs: 30000 }),
    parado5min: e({ quietoMs: 300000 }),
    paradoCercaDelNodo: e({ quietoMs: 600000, distanciaNodoM: 120 }),
    paradoSinSaberElNodo: e({ quietoMs: 600000, distanciaNodoM: null }),
    paradoSinCobertura: e({ quietoMs: 600000, sinCobertura: true }),
    paradoConAhorro: e({ quietoMs: 600000, ahorro: true }),
    sinPosicion: e({ quietoMs: 0 }),
    traza,
    cienM: Math.round(metros(P, al(100))),
  })
)
