// r16: gestos quitados y su sustituto en el móvil (catálogo y desbloqueos). Vuelca un JSON para
// tests/test_r16_personajes.py.
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const RAIZ = path.resolve(__dirname, '..', '..')
const SRC = path.join(RAIZ, 'frontend', 'src', 'player')
const ts = require(path.join(RAIZ, 'frontend', 'node_modules', 'typescript'))

const cache = {}
function cargar(ruta) {
  const abs = path.join(SRC, ruta + '.ts')
  if (cache[abs]) return cache[abs]
  const js = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const modulo = { exports: {} }
  const requerir = (n) => {
    if (!n.startsWith('.')) throw new Error('import no permitido: ' + n)
    return cargar(path.relative(SRC, path.resolve(path.dirname(abs), n)).split(path.sep).join('/'))
  }
  vm.runInNewContext(js, {
    module: modulo, exports: modulo.exports, require: requerir,
    Math, Number, String, Array, Set, Map, Boolean, Object, JSON, Infinity, Error, isFinite: Number.isFinite,
  })
  cache[abs] = modulo.exports
  return modulo.exports
}

const C = cargar('avatares3d/mixamo/catalogo')
const D = cargar('avatares3d/mixamo/desbloqueosTienda')
const viejos = Object.keys(C.GESTOS_RETIRADOS)
const copiaVieja = D.normalizarDesbloqueos({
  activos: true,
  libres: ['gesto:ge__weight_shift', 'gesto:ge__salute'],
  bloqueados: ['gesto:ge__relieved_sigh', 'gesto:ge__clapping'],
  mios: ['gesto:ge__look_away_gesture', 'gesto:ge__dismissing_gesture', 'item:casco'],
  nuevos: ['gesto:ge__acknowledging'],
})
console.log(JSON.stringify({
  gestos: C.GESTOS.map((g) => g.clip),
  retirados: C.GESTOS_RETIRADOS,
  vigente: Object.fromEntries([...viejos, 'ge__salute', 'ge__inventado', 42].map((k) => [String(k), C.gestoVigente(k)])),
  copiaVieja,
  nombreViejo: D.nombreDeClave('gesto:ge__relieved_sigh', 'es'),
  bloqueadoSustituto: D.estaBloqueada(copiaVieja, 'gesto:ge__dismissing_gesture'),
}))
