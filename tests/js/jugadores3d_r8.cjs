// Lógica pura del caso «compañero que no eligió personaje se veía como retrato en el mapa»: aspecto por defecto,
// reparto por calidad (tú no gastas plaza) y motivos del diagnóstico `?depurar-mapa`. Vuelca un JSON a
// tests/test_jugadores_3d_sin_elegir.py.
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
    if (!n.startsWith('.')) throw new Error('import no permitido en un módulo puro: ' + n)
    return cargar(path.relative(SRC, path.resolve(path.dirname(abs), n)).split(path.sep).join('/'))
  }
  vm.runInNewContext(js, { module: modulo, exports: modulo.exports, require: requerir,
    Math, Number, String, Array, Set, Map, Boolean, Object, JSON, Infinity, Error, isFinite: Number.isFinite }, {})
  cache[abs] = modulo.exports
  return modulo.exports
}
const C = cargar('avatares3d/mixamo/catalogo')
const L = cargar('avatares3d/mixamo/lodAvatares')
const D = cargar('avatares3d/mixamo/diagnosticoMapa')
const out = {}

// 1. El caso real: personaje antiguo, sin elegir, con foto.
const ficha = { user: 'Jugador01', display_name: 'Jugador01', character: 'exploradora', character_chosen: false,
  avatar: { character: 'exploradora' }, avatar_ref: 'foto-sintetica' }
const a = C.aspectoDe(ficha)
out.sinElegir = { mx: a.mx, defecto: C.aspectoPorDefecto('Jugador01').mx, valido: C.MX_IDS.includes(a.mx) }
out.sinElegirEstable = C.claveDeAspecto(C.aspectoDe(ficha)) === C.claveDeAspecto(C.aspectoDe({ ...ficha, character: 'raposo' }))

// 2. Reparto con calidad baja a z18: tú + 5 compañeros; el sin elegir está entre los 3 más cercanos.
const cand = (clave, distancia, extra = {}) => ({ clave, esYo: false, distancia, disponible: true, ...extra })
const lista = [cand('yo', 300, { esYo: true }), cand('Jugador01', 40), cand('Jugador02', 10), cand('Jugador03', 80), cand('Jugador04', 20), cand('Jugador05', 90)]
const sel = L.elegirEnTresD(lista, 'baja')
out.baja = { tresD: sel.tresD, porTope: sel.porTope, tope: L.TOPE_DE_AVATARES.baja }
// Tú no gastas plaza aunque estés lejísimos del centro.
out.yoNoGastaPlaza = L.elegirEnTresD([cand('yo', 9999, { esYo: true }), cand('A', 1), cand('B', 2), cand('C', 3), cand('D', 4)], 'baja').tresD
// Sin tu modelo: la plaza queda libre y los demás siguen entrando.
out.yoSinModelo = L.elegirEnTresD([cand('yo', 0, { esYo: true, disponible: false }), cand('A', 1), cand('B', 2), cand('C', 3), cand('D', 4)], 'baja').tresD
// Quien no tiene modelo no gasta plaza.
out.sinModeloNoGasta = L.elegirEnTresD([cand('A', 1, { disponible: false }), cand('B', 2), cand('C', 3), cand('D', 4), cand('E', 5)], 'baja').tresD
// Histéresis: quien ya va en 3D no se cae por una ventaja pequeña de otro.
out.histeresis = L.elegirEnTresD([cand('A', 10), cand('B', 11), cand('C', 12), cand('D', 11.5), cand('E', 12.4, { yaEnTresD: true })], 'baja').tresD
// El más cercano al centro siempre entra, con cualquier calidad.
out.siempreElMasCercano = ['baja', 'media', 'alta'].map((q) => L.elegirEnTresD([cand('lejos', 500), cand('cerca', 1)], q).tresD[0])

// 3. Motivos del diagnóstico.
const base = { tienePosicion: true, presencia: 'live', agrupado: false, zoomAlto: true, inclinado: true, dentroDePantalla: true,
  modelo: 'listo', elegido: true, cotaConocida: true }
const m = (c) => D.motivoDeRetrato({ ...base, ...c })
out.motivos = {
  tresD: m({}), sinPosicion: m({ tienePosicion: false }), antigua: m({ presencia: 'offline' }), agrupado: m({ agrupado: true }),
  zoomBajo: m({ zoomAlto: false }), plano: m({ inclinado: false }), fuera: m({ dentroDePantalla: false }),
  noEsta: m({ modelo: 'no_esta' }), fallo: m({ modelo: 'fallo' }), cargando: m({ modelo: 'cargando' }),
  tope: m({ elegido: false }), sinCota: m({ cotaConocida: false }), stale: m({ presencia: 'recent' }),
}
out.textosCompletos = Object.keys(D.TEXTO_DE_MOTIVO).every((k) => D.TEXTO_DE_MOTIVO[k].length > 3)
out.texto = D.textoDeDiagnostico(
  [{ nombre: 'Tú', elegido: null, aspecto: 'Ch23', tresD: true, motivo: null, esYo: true },
   { nombre: 'Jugador03', elegido: false, aspecto: 'Ch08', tresD: false, motivo: 'tope_de_calidad' }],
  { calidad: 'baja', tope: 3, fps: 41.6, zoom: 18, inclinacion: 60 })
console.log(JSON.stringify(out))
