// Lógica pura de la ronda 5.47 (halo, tamaño, fotos en el mapa 2D, recuento de personajes, teclado de iPhone)
// ejecutada en Node. Vuelca un JSON para tests/test_ronda2_mapa_tienda_iphone.py.
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
    if (n === 'react') return { useEffect: () => undefined }
    if (!n.startsWith('.')) throw new Error('import no permitido en un módulo puro: ' + n)
    const destino = path.resolve(path.dirname(abs), n)
    if (n.endsWith('.json')) return { default: JSON.parse(fs.readFileSync(destino, 'utf8')) }
    return cargar(path.relative(SRC, destino).split(path.sep).join('/'))
  }
  vm.runInNewContext(js, {
    module: modulo, exports: modulo.exports, require: requerir,
    Math, Number, String, Array, Set, Map, Boolean, Object, JSON, Infinity, Error, URL, Date, isFinite: Number.isFinite,
    window: { location: { origin: 'https://juego.test' } },
    HTMLElement: class {}, HTMLInputElement: class {}, HTMLTextAreaElement: class {}, HTMLSelectElement: class {},
  })
  cache[abs] = modulo.exports
  return modulo.exports
}

const R = cargar('avatares/retratoDeMapa')
const F = cargar('offline/fieldProofCache')
const AC = cargar('avatares/avatarConfig')
const T = cargar('utils/vistaTrasTeclado')
const A = cargar('avatares3d/mixamo/areaVisible')
const L = cargar('avatares3d/mixamo/lodAvatares')
const out = {}

// --- fotos en el mapa 2D ---
{
  const url = '/api/player-avatar/Ana%20L?v=abc123'
  const id = R.idDeRetratoConFoto(url, 'Ch22', '#3B82F6')
  out.fotos = {
    validas: [url, '/api/player-avatar/x'].map(R.urlDeFotoValida),
    invalidas: ['https://evil.test/api/player-avatar/x', '//evil.test/a', '/media/nodo/a/b.jpg', 'data:image/png;base64,AAAA', '', null, undefined, 42, '/api/player-avatar//x'].map(R.urlDeFotoValida),
    id,
    leido: R.leerIdDeFoto(id),
    mismoIdParaLoMismo: R.idDeRetratoConFoto(url, 'Ch22', '#3b82f6') === id,
    otraFotoOtroId: R.idDeRetratoConFoto('/api/player-avatar/Ana%20L?v=zzz', 'Ch22', '#3b82f6') !== id,
    otroPersonajeOtroId: R.idDeRetratoConFoto(url, 'Ch01', '#3b82f6') !== id,
    desconocido: R.leerIdDeFoto('pf-00000000-3b82f6'),
    noEsFoto: [R.leerIdDeFoto('pj-Ch01-3b82f6'), R.leerIdDeFoto('pf-xyz-3b82f6')],
    retratoNormalSigueIgual: R.leerIdDeRetrato('pj-Ch01-3b82f6'),
  }
}

// --- las caras del grupo que baja la pantalla de carga ---
out.caras = {
  urls: F.urlsDeCarasDelGrupo([
    { avatar_ref: '/api/player-avatar/A?v=1' },
    { avatar_ref: '/api/player-avatar/A?v=1' },
    { avatar_ref: 'https://juego.test/api/player-avatar/B?v=2' },
    { avatar_ref: 'https://otro.test/api/player-avatar/C?v=3' },
    { avatar_url: '/media/nodo/a/b.jpg' },
    { avatar_url: 'data:image/png;base64,AAAA' },
    {},
    null,
  ]),
  vacio: [F.urlsDeCarasDelGrupo(null), F.urlsDeCarasDelGrupo(undefined), F.urlsDeCarasDelGrupo([])],
}

// --- recuento de personajes en uso ---
{
  const taken = [{ avatar: { character: 'peregrino', parts: { mx: 'Ch01' } } }, { avatar: { character: 'peregrino', parts: { mx: 'Ch01', top: 3 } } }, { avatar: { character: 'can' } }]
  out.enUso = {
    delServidor: AC.contarEnUso({ Ch01: 2, Ch22: 1, Ch99: 0, Ch02: -3, Ch03: 'x' }, taken),
    sinServidor: AC.contarEnUso(undefined, taken),
    raro: [AC.contarEnUso('no', []), AC.contarEnUso([1, 2], [])],
    estado: AC.leerEstadoDePersonaje({ character_chosen: false, avatar: null, taken: [{ avatar: { character: 'peregrino', parts: { mx: 'Ch01' } } }], en_uso: { Ch01: 1 } }).enUso,
    estadoSinCampo: AC.leerEstadoDePersonaje({ character_chosen: false, avatar: null, taken: [{ avatar: { character: 'peregrino', parts: { mx: 'Ch01' } } }] }).enUso,
  }
}

// --- teclado y pantalla desplazada (iPhone) ---
{
  const vv = (height, offsetTop = 0, pageTop = 0) => ({ height, offsetTop, pageTop })
  const H = 844
  out.teclado = {
    cerrado: T.tecladoAbierto(vv(844), H),
    barras: T.tecladoAbierto(vv(740), H),
    abierto: T.tecladoAbierto(vv(540), H),
    sinMedida: [T.tecladoAbierto(null, H), T.tecladoAbierto(undefined, H), T.tecladoAbierto(vv(Number.NaN), H)],
    desplazadaPorOffset: T.estaDesplazada(vv(844, 120), 0, 0),
    desplazadaPorScroll: T.estaDesplazada(vv(844), 0, 80),
    enSuSitio: T.estaDesplazada(vv(844), 0, 0),
    // Cerrar el teclado: ya no hay campo, el área vuelve a ser la entera pero iOS la deja corrida → reponer.
    reponeTrasCerrar: T.hayQueReponer({ escribiendo: false, medida: vv(844, 120), alturaVentana: H, scrollX: 0, scrollY: 0 }),
    // Con el teclado abierto o mientras se escribe NO se toca nada (iOS necesita ese desplazamiento).
    noRepone: [
      T.hayQueReponer({ escribiendo: true, medida: vv(540, 120), alturaVentana: H, scrollX: 0, scrollY: 0 }),
      T.hayQueReponer({ escribiendo: false, medida: vv(540, 120), alturaVentana: H, scrollX: 0, scrollY: 0 }),
      T.hayQueReponer({ escribiendo: false, medida: vv(844, 0), alturaVentana: H, scrollX: 0, scrollY: 0 }),
    ],
    reponeScrollSuelto: T.hayQueReponer({ escribiendo: false, medida: vv(844), alturaVentana: H, scrollX: 0, scrollY: 200 }),
    fueraDeUnCampo: T.esCampoDeTexto(null),
    // La hoja de la tienda NO se mide con el área del teclado.
    areaConTeclado: A.variablesDeArea({ height: 540, offsetTop: 120 }, 844),
    areaSinTeclado: A.variablesDeArea({ height: 800, offsetTop: 0 }, 844),
  }
}

// --- tamaño de los avatares ---
out.tamano = Object.fromEntries([16, 17, 18, 19, 20, 21].map((z) => [z, Math.round(L.alturaEnPantallaPx(z, 42.6) * 10) / 10]))

process.stdout.write(JSON.stringify(out))
