// Lógica pura de la ronda 10: aviso de personajes por descargar y filtros del panel de jugadores.
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const RAIZ = path.resolve(__dirname, '..', '..')
const SRC = path.join(RAIZ, 'frontend', 'src')
const ts = require(path.join(RAIZ, 'frontend', 'node_modules', 'typescript'))
function cargar(rel) {
  const js = ts.transpileModule(fs.readFileSync(path.join(SRC, rel + '.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const m = { exports: {} }
  vm.runInNewContext(
    js,
    { module: m, exports: m.exports, require: () => ({}), Math, Number, String, Array, Set, Map, Boolean, Object, JSON, Date, Promise, Infinity, Error, isFinite: Number.isFinite },
    {}
  )
  return m.exports
}
const A = cargar('player/avatares3d/mixamo/logicaAvisoPersonajes')
const G = cargar('admin/lib/adminRouteGuards')
const out = {}
const e = (x = {}) => A.faseDelAviso({ faltan: 1, bajando: false, enLinea: true, fallo: false, ...x })
out.fases = {
  nada: e({ faltan: 0 }),
  faltan: e({}),
  bajando: e({ bajando: true }),
  sinRed: e({ enLinea: false }),
  fallo: e({ fallo: true }),
  sinRedYFallo: e({ enLinea: false, fallo: true }),
  bajandoSinRed: e({ bajando: true, enLinea: false }),
}
out.botones = Object.fromEntries(['oculto', 'faltan', 'bajando', 'sinRed', 'fallo'].map((f) => [f, A.haceFaltaBoton(f)]))
out.textos = {
  faltan: A.textoDelAviso('faltan'),
  sinRed: A.textoDelAviso('sinRed'),
  bajando: A.textoDelAviso('bajando', { hecho: 2, total: 8 }),
}

async function bajada() {
  const llamadas = []
  let terminado = 0
  const dep = (resultado) => ({
    rutasDe: (mx) => ['/assets/avatares/anims.glb', '/assets/avatares/' + mx + '.glb'],
    descargar: async (rutas, prog) => {
      llamadas.push(rutas)
      prog(rutas.length, rutas.length)
      return resultado
    },
    alTerminar: async () => {
      terminado += 1
    },
  })
  const avances = []
  const ok = await A.bajarPersonajesQueFaltan(['Ch01', 'Ch02', 'Ch01'], dep({ guardadas: 3, fallidas: [], sinEspacio: false }), (h, t) => avances.push([h, t]))
  const mal = await A.bajarPersonajesQueFaltan(['Ch01'], dep({ guardadas: 1, fallidas: ['/assets/avatares/Ch01.glb'], sinEspacio: false }))
  const vacio = await A.bajarPersonajesQueFaltan([], dep({ guardadas: 0, fallidas: [], sinEspacio: false }))
  const sinSitio = await A.bajarPersonajesQueFaltan(['Ch01'], dep({ guardadas: 0, fallidas: [], sinEspacio: true }))
  return { ok, mal, vacio, sinSitio, rutasUnicas: llamadas[0], avances, terminado }
}

const ahora = Date.UTC(2026, 9, 5, 12, 0, 0)
const hace = (min) => Math.floor((ahora - min * 60000) / 1000)
out.inactivo = {
  reciente: G.estaSinActividad(hace(5), false, ahora),
  viejo: G.estaSinActividad(hace(45), false, ahora),
  limite: G.estaSinActividad(hace(30), false, ahora),
  nunca: G.estaSinActividad(null, false, ahora),
  terminadoViejo: G.estaSinActividad(hace(5000), true, ahora),
  iso: G.estaSinActividad(new Date(ahora - 3 * 3600000).toISOString(), false, ahora),
}
out.vacios = Object.fromEntries(['todos', 'solo', 'team', 'vivo', 'fin', 'inactivo'].map((f) => [f, G.textoSinJugadores(f, false)]))
out.conBusqueda = G.textoSinJugadores('fin', true)
bajada().then((b) => {
  out.bajada = b
  process.stdout.write(JSON.stringify(out))
})
