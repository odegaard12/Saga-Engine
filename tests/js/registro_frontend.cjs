// Ejecuta los módulos TS del admin que derivan del registro único de
// minijuegos y vuelca en JSON lo que calculan. Lo usa
// tests/test_registro_de_minijuegos.py: no hay runner de JS en el repo, así
// que se transpila al vuelo con el `typescript` de frontend/node_modules.
//
// Uso: node tests/js/registro_frontend.cjs   (imprime un JSON por stdout)
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const RAIZ = path.resolve(__dirname, '..', '..')
const FRONT = path.join(RAIZ, 'frontend')
const ts = require(path.join(FRONT, 'node_modules', 'typescript'))
const cache = new Map()

function resolver(desde, spec) {
  const base = path.resolve(path.dirname(desde), spec)
  for (const c of [base, base + '.ts', base + '.tsx', base + '.json', path.join(base, 'index.ts')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c
  }
  throw new Error('no resuelve ' + spec + ' desde ' + desde)
}

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
  // Sólo se cargan módulos puros: los imports que no son relativos (react...)
  // y los de tipos se sustituyen por un objeto vacío.
  const req = (s) => (s.startsWith('.') ? cargar(resolver(fichero, s)) : {})
  vm.runInNewContext(js, {
    module: mod, exports: mod.exports, require: req, console,
    Object, Array, String, Number, Math, Boolean, JSON, Set, Map,
  })
  return mod.exports
}

const catalogo = cargar(path.join(FRONT, 'src/admin/lib/gameCatalog.ts'))
const familias = cargar(path.join(FRONT, 'src/admin/lib/familyConfigs.ts'))
const presentacion = cargar(path.join(FRONT, 'src/admin/lib/displayFamilies.ts'))
const guiado = cargar(path.join(FRONT, 'src/admin/components/guided-editor/guidedEditorUtils.ts'))
const registro = cargar(path.join(FRONT, 'src/shared/gameRegistry.ts'))

// Campos que TODOS los normalizadores copian tal cual si vienen en la config.
const GENERICAS = new Set(['is_map_collectible', 'game_id', 'game_title', 'completion_method', 'objective'])
const copia = (valor) => JSON.parse(JSON.stringify(valor))
const salida = { juegos: {}, familias: {}, tarjetas: [], tarjetasFamilia: [] }

salida.tarjetas = presentacion.displayFamilyCards
salida.tarjetasFamilia = familias.familyCards
salida.qrPorTipo = guiado.QR_GAME_BY_KIND
salida.ordenCatalogo = catalogo.adminGameCatalog.map((g) => g.id)

for (const id of Object.keys(presentacion.DISPLAY_FAMILY_BY_GAME_ID)) {
  const ficha = catalogo.adminGameCatalog.find((g) => g.id === id) || null
  const reg = registro.getRegistryGame(id)
  const config = copia((ficha && ficha.config) || {})
  const item = {
    ficha,
    familiaPresentacion: presentacion.DISPLAY_FAMILY_BY_GAME_ID[id],
    editorPropio: ficha ? guiado.hasCustomGameEditor(ficha) : null,
    clavesGuiadas: ficha ? guiado.guidedConfigKeysForGame(ficha, config) : null,
  }
  if (ficha) {
    // Lo que el admin guardaría al pulsar «Guardar» con la config por defecto
    // del juego y con esa misma config + una clave que nadie conoce.
    item.guardado = familias.normalizeAdminConfigForFamily(ficha.family, copia(config))
    item.guardadoConDesconocida = familias.normalizeAdminConfigForFamily(ficha.family, { ...copia(config), clave_de_futuro_xyz: 7 })
    item.guardadoDeNuevo = familias.normalizeAdminConfigForFamily(ficha.family, copia(item.guardado))
    // Resto de OTRO juego de la misma familia técnica: el primer config_key
    // que declara otro juego de la familia y no éste.
    const propias = new Set((reg && reg.config_keys) || [])
    let ajena = null
    for (const otro of registro.registryGames) {
      if (otro.id === id || otro.family !== reg.family) continue
      const k = (otro.config_keys || []).find((c) => !propias.has(c) && !GENERICAS.has(c))
      if (k) { ajena = k; break }
    }
    item.claveAjena = ajena
    if (ajena) item.guardadoConAjena = familias.normalizeAdminConfigForFamily(ficha.family, { ...copia(config), [ajena]: 1 })
  }
  salida.juegos[id] = item
}
console.log(JSON.stringify(salida))
