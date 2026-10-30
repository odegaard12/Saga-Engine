// Partidas de los minijuegos que sobreviven a recargar (30/10), en Node con un localStorage de mentira.
// Imprime un JSON que comprueba tests/test_juegos_antiguos_30_10.py.
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const RAIZ = path.resolve(__dirname, '..', '..')
const FRONT = path.join(RAIZ, 'frontend', 'src')
const ts = require(path.join(RAIZ, 'frontend', 'node_modules', 'typescript'))

function resolver(desde, spec) {
  const base = path.resolve(path.dirname(desde), spec)
  for (const c of [base, base + '.ts', base + '.tsx']) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c
  throw new Error('no resuelve ' + spec)
}
const datos = new Map()
const localStorage = {
  getItem: (k) => (datos.has(k) ? datos.get(k) : null),
  setItem: (k, v) => datos.set(k, String(v)),
  removeItem: (k) => datos.delete(k),
}
// Object.keys(localStorage) en el navegador da las claves guardadas.
const almacen = new Proxy(localStorage, { ownKeys: () => [...datos.keys()], getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) })

// Cada «página» es un contexto nuevo (módulos y memoria desde cero) con el MISMO localStorage: eso es recargar.
function pagina() {
  const sandbox = { console, Date, setTimeout, performance }
  sandbox.window = { localStorage: almacen }
  sandbox.document = { addEventListener() {}, visibilityState: 'visible' }
  sandbox.globalThis = sandbox
  const ctx = vm.createContext(sandbox)
  const cache = new Map()
  function cargar(f) {
    if (cache.has(f)) return cache.get(f).exports
    const mod = { exports: {} }
    cache.set(f, mod)
    const js = ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
    const req = (s) => (s.startsWith('.') ? cargar(resolver(f, s)) : {})
    vm.runInContext('(function (module, exports, require) {' + js + '\n})', ctx)(mod, mod.exports, req)
    return mod.exports
  }
  return (r) => cargar(path.join(FRONT, r))
}

const salida = {}
let m = pagina()
const a = m('player/minigames/core/partidasGuardadas.ts').partidasGuardadas('trampa_palabras')
a.set('7', { siguiente: 2, penalty: 30000, inicio: 123 })
m = pagina() // recargar
const b = m('player/minigames/core/partidasGuardadas.ts').partidasGuardadas('trampa_palabras')
salida.trasRecargar = b.get('7') ?? null
salida.otroJuego = m('player/minigames/core/partidasGuardadas.ts').partidasGuardadas('logica').get('7') ?? null
b.delete('7')
salida.trasBorrar = pagina()('player/minigames/core/partidasGuardadas.ts').partidasGuardadas('trampa_palabras').get('7') ?? null

m = pagina()
m('player/minigames/core/partidasGuardadas.ts').partidasGuardadas('logica').set('mastermind:3', { fallos: 2 })
datos.set('saga:nodo-abierto:ANA:3', '1700000000000')
datos.set('otra:cosa', 'x')
m('player/nodeClock.ts').limpiarRelojes('ANA')
salida.trasReinicio = [...datos.keys()].sort()

console.log(JSON.stringify(salida))
