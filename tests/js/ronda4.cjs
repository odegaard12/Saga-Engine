// Lógica pura de la ronda 5.49 (pelo, ficha de jugador, avatares juntos, vestuario desbloqueable) ejecutada en
// Node. Vuelca un JSON para tests/test_ronda4_pelo_ficha_juntos.py. Mismo método que logica_jugador.cjs: se
// transpila con el `typescript` de frontend/node_modules y se carga en un contexto de `vm` con un navegador mínimo.
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const RAIZ = path.resolve(__dirname, '..', '..')
const FRONT = path.join(RAIZ, 'frontend', 'src')
const ts = require(path.join(RAIZ, 'frontend', 'node_modules', 'typescript'))

function resolver(desde, spec) {
  const base = path.resolve(path.dirname(desde), spec)
  for (const c of [base, base + '.ts', base + '.tsx', path.join(base, 'index.ts')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c
  }
  throw new Error('no resuelve ' + spec + ' desde ' + desde)
}

const almacen = new Map()
const sandbox = {
  console, Math, JSON, Date, Number, String, Array, Set, Map, Object, Boolean, Error, URL, Promise,
  window: {
    location: { origin: 'https://juego.test', search: '' },
    localStorage: {
      getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
      setItem: (k, v) => almacen.set(k, String(v)),
      removeItem: (k) => almacen.delete(k),
    },
    dispatchEvent: () => true,
    setTimeout, clearTimeout,
  },
  navigator: { onLine: true },
  document: { querySelector: () => null },
  CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail } },
}
sandbox.globalThis = sandbox
const contexto = vm.createContext(sandbox)
const cache = new Map()
function cargar(fichero) {
  if (cache.has(fichero)) return cache.get(fichero).exports
  const mod = { exports: {} }
  cache.set(fichero, mod)
  const js = ts.transpileModule(fs.readFileSync(fichero, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: 'react-jsx' },
  }).outputText
  const req = (s) => (s.endsWith('.css') || !s.startsWith('.') ? {} : cargar(resolver(fichero, s)))
  vm.runInContext('(function (module, exports, require) {' + js + '\n})', contexto)(mod, mod.exports, req)
  return mod.exports
}
const M = (r) => cargar(path.join(FRONT, 'player', r))

const F = M('avatares3d/mixamo/fichaJugador.ts')
const L = M('avatares3d/mixamo/lodAvatares.ts')
const D = M('avatares3d/mixamo/desbloqueosTienda.ts')
const C = M('avatares3d/mixamo/catalogo.ts')
const T = M('offline/teamMapPresence.ts')
const out = {}

// --- ficha ---
const ahora = 1_800_000_000_000
const base = { user: 'u', display_name: 'Ana', level: 3, total_nodes: 6, total_time_ms: (47 * 60 + 12) * 1000 }
out.ficha = {
  vivo: F.datosDeFicha({ ...base, presence: 'live' }, 0, ahora),
  reciente: F.datosDeFicha({ ...base, presence: 'stale', last_seen: ahora / 1000 - 7 * 60 }, 0, ahora),
  sin: F.datosDeFicha({ ...base, presence: 'offline', last_seen: ahora / 1000 - 125 * 60 }, 0, ahora),
  sinUltimaVez: F.datosDeFicha({ ...base, presence: 'offline' }, 0, ahora),
  terminado: F.datosDeFicha({ ...base, finished: true, presence: 'live' }, 0, ahora),
  totalDeMision: F.datosDeFicha({ display_name: 'B', level: 9 }, 5, ahora),
  sinNombre: F.datosDeFicha({}, 0, ahora),
  tiempos: [0, 61_000, 47 * 60_000 + 12_000, 3_725_000].map(F.tiempoLegible),
  textos: ['es', 'gl', 'en'].map((i) => [
    F.textoDeConexion({ tipo: 'vivo' }, i),
    F.textoDeConexion({ tipo: 'reciente', minutos: 7 }, i),
    F.textoDeConexion({ tipo: 'sin', minutos: 130 }, i),
    F.textoDeConexion({ tipo: 'sin', minutos: null }, i),
  ]),
  idiomas: ['es', 'gl', 'en', 'fr', null].map(F.idiomaDeFicha),
  mismasClaves: ['gl', 'en'].every((i) => JSON.stringify(Object.keys(F.TEXTOS_FICHA[i]).sort()) === JSON.stringify(Object.keys(F.TEXTOS_FICHA.es).sort())),
  saludar: F.GESTO_SALUDAR,
}

// --- juntos: 3D <-> retrato sólo por zoom y tope ---
const cand = (clave, distancia, extra = {}) => ({ clave, esYo: false, distancia, disponible: true, ...extra })
const juntos = Array.from({ length: 15 }, (_, i) => cand('j' + i, i))
out.lod = {
  alta: L.elegirEnTresD([cand('yo', 0, { esYo: true }), ...juntos], 'alta').tresD,
  media: L.elegirEnTresD(juntos, 'media').tresD.length,
  baja: L.elegirEnTresD(juntos, 'baja').tresD.length,
  // dos jugadores en el mismo punto de pantalla: los dos en 3D (antes, el de detrás quedaba en retrato)
  mismoSitio: L.elegirEnTresD([cand('yo', 0, { esYo: true }), cand('detras', 0.1)], 'baja').tresD,
  permite: [[15.9, 60], [16, 60], [19.5, 60], [18, 0]].map(([z, p]) => L.formaQuePermiteTresD(z, p)),
  tamano: [12, 16, 18, 20, 25].map((z) => Math.round(L.tamanoJugador(z) * 1000) / 1000),
  salida: [0, 100, 200, 400].map((ms) => Math.round(L.factorDeSalida(ms) * 1000) / 1000),
}

// --- vestuario desbloqueable ---
const d = D.normalizarDesbloqueos({
  status: 'ok', activos: true, revision: 3, libres: ['ropa:0'], bloqueados: ['item:casco', 'ropa:9', 'hair:7', 'gesto:ge__clapping', 'item:gaita', 'mx:Ch01'],
  mios: ['item:gaita'], nuevos: ['item:gaita'],
  reglas: [{ id: 'r1', cuando: { tipo: 'nodos', n: 3 }, da: ['item:casco'], texto: 'Completa 3 nodos' },
           { id: 'r2', cuando: { tipo: 'km', km: 5 }, da: ['item:casco', 'ropa:9'], texto: 'Camina 5 km' }],
  progreso: { r1: { actual: 1, meta: 3 }, r2: { actual: 4, meta: 5 } },
  pistas: { 'item:casco': 'Se consigue: completa 3 nodos', 'ropa:9': 'Se consigue: camina 5 km' },
  avisos: [{ id: 7, tipo: 'sustitucion', texto: 'La gaita ahora se gana en el nodo 4', claves: ['item:gaita'], creado_ms: 1 }],
})
const aspecto = { mx: 'Ch01', top: 9, pants: 10, hair: 7, items: { cabeza: 'casco', dos: 'gaita' } }
out.desbloqueos = {
  bloqueadas: ['item:casco', 'ropa:9', 'hair:7', 'gesto:ge__clapping', 'item:gaita', 'mx:Ch01', 'ropa:0'].map((k) => D.estaBloqueada(d, k)),
  apagado: D.estaBloqueada({ ...d, activos: false }, 'item:casco'),
  sinDatos: D.estaBloqueada(null, 'item:casco'),
  claves: D.clavesDeAspecto(aspecto),
  aQuitar: D.bloqueadasDeAspecto(aspecto, d),
  aQuitarApagado: D.bloqueadasDeAspecto(aspecto, { ...d, activos: false }),
  progresoCasco: D.progresoDe(d, 'item:casco'),
  progresoSinRegla: D.progresoDe(d, 'hair:7'),
  pista: D.pistaDe(d, 'item:casco'),
  nombres: ['item:casco', 'ropa:9', 'hair:7', 'gesto:ge__clapping', 'mx:Ch01'].map((k) => D.nombreDeClave(k, 'es')),
  nombresGl: ['item:casco', 'ropa:9'].map((k) => D.nombreDeClave(k, 'gl')),
  invalido: [null, 3, {}, { activos: 'si' }].map(D.normalizarDesbloqueos),
  limpia: D.normalizarDesbloqueos({ activos: false, bloqueados: ['x', 3, null] }),
}
// Copia en el móvil: se guarda, se lee y marcar visto la limpia sin esperar a la red.
D.guardarCopia('ana', d)
out.copia = { leida: D.leerCopia('ana').revision, otra: D.leerCopia('nadie') }

// --- aspecto por defecto: sólo del kit libre ---
const defectos = Array.from({ length: 400 }, (_, i) => C.aspectoPorDefecto('jugador-' + i))
out.defecto = {
  ropaLibre: C.ROPA_LIBRE,
  peloLibre: C.PELO_LIBRE,
  todosLibres: defectos.every((a) => C.ROPA_LIBRE.includes(a.top) && C.ROPA_LIBRE.includes(a.pants) && C.PELO_LIBRE.includes(a.hair) && Object.keys(a.items).length === 0),
  variados: new Set(defectos.map((a) => a.top)).size,
}

// --- el progreso llega hasta el mapa (la ficha lo necesita) ---
out.marcadores = T.teamProfilesToMapMarkers([
  { user: 'a', display_name: 'A', lat: 42, lon: -8, presence: 'live', level: 4, finished: false, total_nodes: 6, total_time_ms: 1234, members: ['a', 'b'] },
])

process.stdout.write(JSON.stringify(out))
