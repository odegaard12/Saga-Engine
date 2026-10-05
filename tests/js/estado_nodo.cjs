// Estado de cada nodo (ronda 7): lo ejecuta tests/test_admin_ronda7_diseno.py.
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const RAIZ = path.resolve(__dirname, '..', '..')
const FRONT = path.join(RAIZ, 'frontend')
const ts = require(path.join(FRONT, 'node_modules', 'typescript'))
const cache = new Map()

// Lo que ven los módulos como globales del navegador. Se cambia por escenario.
const entorno = {
  fetch: null,
  eventos: [],
}

function resolver(desde, spec) {
  const base = path.resolve(path.dirname(desde), spec)
  for (const c of [base, base + '.ts', base + '.tsx', base + '.json', path.join(base, 'index.ts')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c
  }
  throw new Error('no resuelve ' + spec + ' desde ' + desde)
}

const contexto = vm.createContext({
  console,
  fetch: (...args) => entorno.fetch(...args),
  // El aviso de sesión caducada se lanza en `window`.
  window: {
    dispatchEvent: (evento) => {
      entorno.eventos.push({ tipo: evento.type, detalle: evento.detail })
      return true
    },
  },
  CustomEvent: class {
    constructor(type, init) {
      this.type = type
      this.detail = init && init.detail
    }
  },
})

function cargar(fichero) {
  if (cache.has(fichero)) return cache.get(fichero).exports
  const mod = { exports: {} }
  cache.set(fichero, mod)
  const fuente = fs.readFileSync(fichero, 'utf8')
  if (fichero.endsWith('.json')) {
    mod.exports = JSON.parse(fuente)
    return mod.exports
  }
  const js = ts.transpileModule(fuente, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: 'ES2020', esModuleInterop: true, jsx: 'react-jsx' },
  }).outputText
  // Solo módulos puros: los imports que no son relativos (react...) se
  // sustituyen por un objeto vacío.
  const req = (s) => (s.startsWith('.') ? cargar(resolver(fichero, s)) : {})
  const envoltura = new vm.Script('(function (module, exports, require) {' + js + '\n})', { filename: fichero })
  envoltura.runInContext(contexto)(mod, mod.exports, req)
  return mod.exports
}


const lib = (nombre) => cargar(path.join(FRONT, 'src/admin/lib', nombre))
const estado = lib('estadoNodo.ts')
const plano = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v))

const buenos = (n) => ({ index: n, id: n + 1, title: 'Nodo de prueba ' + (n + 1), lat: 42.6, lon: -8.8, type: 'signal_hunt', config: {} })
const salida = {}

// 1) Un nodo normal está completo.
salida.completo = plano(estado.estadoDeLosNodos([buenos(0)])[0])

// 2) Sin nombre y sin posición: incompleto, con la sección donde se arregla.
salida.incompleto = plano(
  estado.estadoDeLosNodos([{ ...buenos(0), title: '  ', lat: null, lon: null }])[0]
)

// 3) Trampa de palabras con 1 pregunta completa: incompleto, sección «juego».
salida.trampa = plano(
  estado.estadoDeLosNodos([
    { ...buenos(0), type: 'word_trap', config: { game_id: 'trampa_palabras', questions: [{ question: 'a', options: ['x', 'y'] }] } },
  ])[0]
)

// 4) Pide un objeto que nadie entrega: aviso en ESE nodo (el siguiente no se marca).
salida.ruta = plano(
  estado.estadoDeLosNodos([
    buenos(0),
    { ...buenos(1), required_item_id: 'objeto_que_no_existe', requires_item: true },
    buenos(2),
  ]).map((e) => e.nivel)
)

// 5) El estado del nodo en edición usa el borrador, no el listado.
salida.edicion = plano(
  estado.estadoDelNodoEnEdicion({ ...buenos(0), title: '' }, [buenos(0)])
)
console.log(JSON.stringify(salida))
