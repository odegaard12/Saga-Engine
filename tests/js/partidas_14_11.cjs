// 14/11 (auditoría de partidas, entrada y antifallos): pruebas de las piezas puras y de api.ts con un `fetch` falso.
// Salida: JSON con los casos. Carga los .ts reales (transpilados) con un `require` que resuelve rutas relativas.
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const RAIZ = path.resolve(__dirname, '..', '..')
const SRC = path.join(RAIZ, 'frontend', 'src')
const ts = require(path.join(RAIZ, 'frontend', 'node_modules', 'typescript'))

function cargarTS(abs, ctx, cache = new Map()) {
  if (cache.has(abs)) return cache.get(abs).exports
  const js = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const m = { exports: {} }
  cache.set(abs, m)
  const req = (spec) => {
    if (!spec.startsWith('.')) throw new Error('módulo no resuelto: ' + spec)
    const p = path.resolve(path.dirname(abs), spec)
    for (const ext of ['.ts', '.tsx', '/index.ts']) if (fs.existsSync(p + ext)) return cargarTS(p + ext, ctx, cache)
    throw new Error('no existe ' + p)
  }
  vm.runInNewContext(js, { module: m, exports: m.exports, require: req, console, ...ctx })
  return m.exports
}
const ruta = (...r) => path.join(SRC, ...r)

// --- almacenes falsos -------------------------------------------------------------------------------------------------
function almacenNormal(inicial = {}) {
  const d = new Map(Object.entries(inicial))
  const metodos = {
    getItem: (k) => (d.has(k) ? d.get(k) : null),
    setItem: (k, v) => d.set(k, String(v)),
    removeItem: (k) => d.delete(k),
    key: (i) => [...d.keys()][i] ?? null,
    get length() {
      return d.size
    },
    _claves: () => [...d.keys()],
  }
  // Como el de verdad: `Object.keys(localStorage)` devuelve las claves guardadas.
  return new Proxy(metodos, {
    ownKeys: () => [...d.keys()],
    getOwnPropertyDescriptor: (t, k) => (d.has(k) ? { enumerable: true, configurable: true, value: d.get(k) } : undefined),
    get: (t, k) => (k in t ? t[k] : d.get(k)),
  })
}
const almacenLleno = () => ({
  getItem: () => null,
  setItem: () => {
    throw new Error('QuotaExceededError')
  },
  removeItem: () => {},
  key: () => null,
  length: 0,
})

// --- 14: el reloj del nodo con el almacenamiento lleno ---------------------------------------------------------------------
function relojDelNodo(localStorage) {
  let ahora = 1000
  const ctx = {
    window: { localStorage },
    document: { visibilityState: 'visible', addEventListener() {} },
    performance: { now: () => ahora },
    Date: class extends Date {
      static now() {
        return 1_700_000_000_000 + ahora
      }
    },
  }
  const n = cargarTS(ruta('player', 'nodeClock.ts'), ctx)
  const r = {}
  r.antes = n.nodoAbierto('ana', 'n1')
  n.abrirNodo('ana', 'n1')
  r.abierto = n.nodoAbierto('ana', 'n1')
  ahora += 5000
  r.tiempo = n.tiempoDelNodo('ana', 'n1')
  r.otroNodo = n.nodoAbierto('ana', 'n2')
  n.cerrarNodo('ana', 'n1')
  r.cerrado = n.nodoAbierto('ana', 'n1')
  n.abrirNodo('ana', 'n1')
  n.limpiarRelojes('ana')
  r.trasLimpiar = n.nodoAbierto('ana', 'n1')
  return r
}
const reloj = { lleno: relojDelNodo(almacenLleno()), normal: relojDelNodo(almacenNormal()) }

// --- borrar las partidas guardadas ----------------------------------------------------------------------------------------
const lsBorrar = almacenNormal({
  'saga:partida:trampa_palabras:n1': '{}',
  'saga:partida:mosaico:n2': '{}',
  'saga:nodo-abierto:ana:n1': '123',
  otra: 'x',
})
const pg = cargarTS(ruta('player', 'minigames', 'core', 'partidasGuardadas.ts'), { window: { localStorage: lsBorrar } })
const borradas = pg.borrarPartidasGuardadas()
const borrar = { borradas, quedan: lsBorrar._claves().sort(), sinAlmacen: cargarTS(ruta('player', 'minigames', 'core', 'partidasGuardadas.ts'), { window: { localStorage: almacenLleno() } }).borrarPartidasGuardadas() }

// --- fallos seguidos y confirmación nominal ------------------------------------------------------------------------------------
const fs_ = cargarTS(ruta('shared', 'fallosSeguidos.ts'), {})
const seguidos = {
  primero: fs_.fallosSeguidos(0, 0, 1_000_000),
  segundo: fs_.fallosSeguidos(1, 1_000_000, 1_060_000),
  tercero: fs_.fallosSeguidos(2, 1_060_000, 1_100_000),
  pasadaLaVentana: fs_.fallosSeguidos(2, 1_000_000, 1_000_000 + fs_.VENTANA_DE_FALLOS_SEGUIDOS_MS),
  palabra: ['BORRAR', ' borrar ', 'Borrar', 'borra', '', 'BORRARR'].map((x) => fs_.palabraConfirmada(x, 'BORRAR')),
}

// --- forma de los datos -------------------------------------------------------------------------------------------------------
const fd = cargarTS(ruta('shared', 'formaDeDatos.ts'), {})
const forma = {
  partida: [
    { user: 'ana', level: 0, stages: [] },
    { user: 'ana', level: 3, stages: [{ id: 'a' }], finished: false },
    {},
    [],
    null,
    'x',
    { user: '', level: 1, stages: [] },
    { user: 'ana', level: '1', stages: [] },
    { user: 'ana', level: NaN, stages: [] },
    { user: 'ana', level: 1, stages: {} },
    { user: 'ana', level: 1 },
  ].map((x) => fd.esPartidaValida(x)),
  config: [{}, { site_name: 'SAGA' }, [], null, 'x', 5].map((x) => fd.esConfigValida(x)),
}

// --- estado del chip y del perfil que ya no existe -----------------------------------------------------------------------------
const cache0 = new Map()
const E = cargarTS(ruta('player', 'offline', 'estadoDeCobertura.ts'), {}, cache0)
const chip = {
  perfil: E.estadoDeCobertura(false, 2, false, true),
  perfilYAcceso: E.estadoDeCobertura(false, 2, true, true),
  perfilSinRed: E.estadoDeCobertura(true, 2, false, true),
  acceso: E.estadoDeCobertura(false, 2, true, false),
  textos: [E.TEXTOS_DE_COBERTURA.es.perfilInexistente, E.TEXTOS_DE_COBERTURA.gl.perfilInexistente],
}
{
  const R = cargarTS(ruta('player', 'offline', 'redEstado.ts'), { navigator: { onLine: true } })
  R.olvidarEstadoDeRed()
  const orden = []
  orden.push([R.perfilNoExiste(), R.accesoHaCaducado()])
  R.notarAccesoCaducado()
  R.notarPerfilNoExiste()
  orden.push([R.perfilNoExiste(), R.accesoHaCaducado()]) // el perfil gana y apaga «acceso caducado»
  R.notarRespuesta(200)
  orden.push([R.perfilNoExiste(), R.accesoHaCaducado()]) // un éxito lo desmiente
  chip.estados = orden
}

// --- la ronda de Trampa se pausa con la página oculta --------------------------------------------------------------------------------
const reloj2 = cargarTS(ruta('player', 'minigames', 'families', 'wordTrap', 'relojDeRonda.ts'), {})
const ronda = {
  fuera5s: reloj2.descontarTiempoOculto(1000, 5000, 10000),
  sinSalto: reloj2.descontarTiempoOculto(1000, 5000, 4000),
}

// --- api.ts con un fetch falso -------------------------------------------------------------------------------------------------------
async function pruebaFetchPlayerGame({ status, cuerpo, pinsEnCache, sinRedirigir }) {
  const reemplazos = []
  const cfgCache = pinsEnCache ? JSON.stringify({ config: { player_pins_required: true } }) : null
  const holder = {
    fn: async () => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo, headers: { get: () => null } }),
  }
  const win = {
    setTimeout,
    clearTimeout,
    localStorage: { getItem: () => cfgCache, setItem() {}, removeItem() {} },
    location: { pathname: '/player/ana', replace: (u) => reemplazos.push(u) },
  }
  const cache = new Map()
  const ctx = { window: win, fetch: (...a) => holder.fn(...a), AbortController, URLSearchParams, navigator: { onLine: true }, encodeURIComponent, Date }
  const api = cargarTS(ruta('shared', 'api.ts'), ctx, cache)
  const R = cargarTS(ruta('player', 'offline', 'redEstado.ts'), ctx, cache)
  let error = null
  let resultado = null
  try {
    resultado = await api.fetchPlayerGame('ana', sinRedirigir ? { sinRedirigir: true } : {})
  } catch (e) {
    error = { status: e.status ?? null, detail: e.detail ?? null, sinStatus: typeof e.status !== 'number', redDeFallo: R.esFalloDeRed(e) }
  }
  return { reemplazos, error, perfilNoExiste: R.perfilNoExiste(), ok: resultado ? resultado.user : null }
}

async function pruebaFetchPublicConfig(cuerpo) {
  const win = { setTimeout, clearTimeout, localStorage: { getItem: () => null, setItem() {} }, location: { pathname: '/', replace() {} } }
  const ctx = { window: win, fetch: async () => ({ ok: true, status: 200, json: async () => cuerpo }), AbortController, URLSearchParams, navigator: { onLine: true }, Date }
  const api = cargarTS(ruta('shared', 'api.ts'), ctx)
  try {
    const c = await api.fetchPublicConfig()
    return { ok: true, c }
  } catch (e) {
    return { ok: false, msg: String(e.message) }
  }
}

;(async () => {
  const buena = { user: 'ana', level: 2, stages: [] }
  const api = {
    sesionSinCache: await pruebaFetchPlayerGame({ status: 403, cuerpo: { detail: 'player session required' }, pinsEnCache: false }),
    sesionConCache: await pruebaFetchPlayerGame({ status: 403, cuerpo: { detail: 'player session required' }, pinsEnCache: true }),
    sesionSinRedirigir: await pruebaFetchPlayerGame({ status: 403, cuerpo: { detail: 'player session required' }, sinRedirigir: true }),
    desconocido: await pruebaFetchPlayerGame({ status: 403, cuerpo: { detail: 'unknown player' }, pinsEnCache: true }),
    sinMotivoConCache: await pruebaFetchPlayerGame({ status: 403, cuerpo: {}, pinsEnCache: true }),
    sinMotivoSinCache: await pruebaFetchPlayerGame({ status: 403, cuerpo: {}, pinsEnCache: false }),
    cuerpoVacio: await pruebaFetchPlayerGame({ status: 200, cuerpo: {} }),
    cuerpoLista: await pruebaFetchPlayerGame({ status: 200, cuerpo: [] }),
    cuerpoBueno: await pruebaFetchPlayerGame({ status: 200, cuerpo: buena }),
    configVacia: await pruebaFetchPublicConfig(null),
    configLista: await pruebaFetchPublicConfig([]),
    configBuena: await pruebaFetchPublicConfig({ site_name: 'SAGA' }),
  }
  process.stdout.write(JSON.stringify({ reloj, borrar, seguidos, forma, chip, ronda, api }))
})()
