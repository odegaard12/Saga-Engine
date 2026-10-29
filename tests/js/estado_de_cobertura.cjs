// Prueba la función pura offline/estadoDeCobertura.ts. Salida: JSON con los casos.
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const RAIZ = path.resolve(__dirname, '..', '..')
const ts = require(path.join(RAIZ, 'frontend', 'node_modules', 'typescript'))
const fuente = path.join(RAIZ, 'frontend', 'src', 'player', 'offline', 'estadoDeCobertura.ts')
const js = ts.transpileModule(fs.readFileSync(fuente, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const m = { exports: {} }
vm.runInNewContext(js, { module: m, exports: m.exports, Math, Number })
const { estadoDeCobertura: e, TEXTOS_DE_COBERTURA: T } = m.exports
console.log(JSON.stringify({
  conRedYVacia: e(false, 0),
  sinRedYVacia: e(true, 0),
  sinRedConDos: e(true, 2),
  conRedYTres: e(false, 3),
  basura: e(false, 'x'),
  negativo: e(true, -4),
  textos: { es: [T.es.sinRed, T.es.esperando(1), T.es.esperando(3), T.es.sincronizando(2)], gl: [T.gl.esperando(1), T.gl.esperando(2)], en: [T.en.esperando(1), T.en.esperando(2), T.en.sincronizando(3)] },
}))
