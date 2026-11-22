// Estado de cada nodo (ronda 7): lo ejecuta tests/test_admin_ronda7_diseno.py.
const path = require('path')
const vm = require('vm')

const RAIZ = path.resolve(__dirname, '..', '..')
const FRONT = path.join(RAIZ, 'frontend')
const { crearCargador } = require('./cargarTs.cjs')

// Lo que ven los módulos como globales del navegador. Se cambia por escenario.
const entorno = {
  fetch: null,
  eventos: [],
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

const cargar = crearCargador(contexto)


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
