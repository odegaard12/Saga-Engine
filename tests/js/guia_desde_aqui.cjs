// Guía por caminos desde donde estás (5/11): la ruta de antes se corta en tu punto. Imprime JSON para
// tests/test_guiado_5_11.py.
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const RAIZ = path.resolve(__dirname, '..', '..')
const ts = require(path.join(RAIZ, 'frontend', 'node_modules', 'typescript'))
const fuente = fs.readFileSync(path.join(RAIZ, 'frontend', 'src', 'player', 'avatares', 'rutaAndada.ts'), 'utf8')
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const mod = { exports: {} }
vm.runInNewContext('(function (module, exports) {' + js + '\n})', { Math })(mod, mod.exports)
const { guiaDesdeAqui } = mod.exports
// Una ruta recta hacia el sur de 300 m en [lon, lat], cada 50 m (≈0,00045° de latitud).
const ruta = Array.from({ length: 7 }, (_, i) => [-3.69, 40.413 - i * 0.00045])
const m = (a, b) => Math.hypot((a[1] - b.lat) * 111320, (a[0] - b.lon) * 111320 * Math.cos(b.lat * Math.PI / 180))
const enLaRuta = { lat: 40.413 - 2.5 * 0.00045, lon: -3.69 }
const apartado = { lat: 40.413 - 2.5 * 0.00045, lon: -3.69 + 0.0015 } // ~127 m al este
const a = guiaDesdeAqui(ruta, enLaRuta)
const b = guiaDesdeAqui(ruta, apartado)
console.log(JSON.stringify({
  enLaRuta: { primeroM: Math.round(m(a[0], enLaRuta)), puntos: a.length, ultimoIgual: a[a.length - 1][1] === ruta[6][1] },
  apartado: { igual: JSON.stringify(b) === JSON.stringify(ruta) },
  corta: { vacia: guiaDesdeAqui([], enLaRuta).length, uno: guiaDesdeAqui([ruta[0]], enLaRuta).length },
}))
