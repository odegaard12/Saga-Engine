// r16: gestos quitados y su sustituto en el móvil (catálogo y desbloqueos). Vuelca un JSON para
// tests/test_r16_personajes.py.
const path = require('path')
const RAIZ = path.resolve(__dirname, '..', '..')
const SRC = path.join(RAIZ, 'frontend', 'src', 'player')
const { crearCargador } = require('./cargarTs.cjs')

const externo = (n) => {
  throw new Error('import no permitido en un módulo puro: ' + n)
}
const cargarDe = crearCargador({ Math, Number, String, Array, Set, Map, Boolean, Object, JSON, Infinity, Error, isFinite: Number.isFinite }, { externo })
const cargar = (ruta) => cargarDe(path.join(SRC, ruta + '.ts'))

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
