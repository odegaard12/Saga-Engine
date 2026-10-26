// Lógica pura de la foto en dos pasos (frontend/src/player/offline/fotoEnDosPasos.ts y redEstado.ts), en Node.
// Uso: node tests/js/foto_en_dos_pasos.cjs   (imprime un JSON por stdout; lo lee tests/test_foto_en_dos_pasos.py)
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const RAIZ = path.resolve(__dirname, '..', '..')
const FRONT = path.join(RAIZ, 'frontend', 'src')
const ts = require(path.join(RAIZ, 'frontend', 'node_modules', 'typescript'))

function resolver(desde, spec) {
  const base = path.resolve(path.dirname(desde), spec)
  for (const c of [base, base + '.ts', base + '.tsx']) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c
  throw new Error('no resuelve ' + spec)
}

function entorno(navigator) {
  const sandbox = { console, Blob, atob, URLSearchParams, Uint8Array, Date, Math, Promise, navigator }
  sandbox.window = sandbox
  const contexto = vm.createContext(sandbox)
  const cache = new Map()
  function cargar(fichero) {
    if (cache.has(fichero)) return cache.get(fichero).exports
    const mod = { exports: {} }
    cache.set(fichero, mod)
    const js = ts.transpileModule(fs.readFileSync(fichero, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText
    const req = (s) => (s.startsWith('.') ? cargar(resolver(fichero, s)) : {})
    vm.runInContext('(function (module, exports, require) {' + js + '\n})', contexto)(mod, mod.exports, req)
    return mod.exports
  }
  return (rel) => cargar(path.join(FRONT, rel))
}

;(async () => {
  const salida = {}
  const f = entorno({ onLine: true })('player/offline/fotoEnDosPasos.ts')
  salida.tiempos = [f.tiempoParaSubir(10_000), f.tiempoParaSubir(200_000), f.tiempoParaSubir(250_000), f.tiempoParaSubir(5_000_000)]
  salida.esperas = [0, 1, 3, 10].map((n) => f.esperaTrasFallo(n))
  salida.blob = f.blobDeDataUrl('data:image/jpeg;base64,QUJD')?.size
  salida.blobTipo = f.blobDeDataUrl('data:image/jpeg;base64,QUJD')?.type
  salida.blobMalo = [f.blobDeDataUrl('hola'), f.blobDeDataUrl('data:image/jpeg,QUJD'), f.blobDeDataUrl('data:image/jpeg;base64,@@@')]

  // Sin id de cliente no hay dos pasos; sin canvas (Node) la «ligera» no se puede hacer y va la original tal cual.
  const foto = { user: 'PLAYER 1', image_data_url: 'data:image/jpeg;base64,QUJD', lat: 40.5, lon: -3.5, note: 'árbol y roca', stage_id: '101' }
  salida.sinId = await f.prepararSubidaBinaria(foto)
  const b = await f.prepararSubidaBinaria({ ...foto, client_proof_id: 'photo_1' })
  salida.binaria = { url: b.url, ligera: b.ligera, bytes: b.blob.size, tiempo: b.tiempoMs }

  // Qué red vale para subir las originales.
  const red = (conn) => entorno({ onLine: true, connection: conn })('player/offline/redEstado.ts').redBuenaParaOriginales()
  salida.red = {
    sinApi: entorno({ onLine: true })('player/offline/redEstado.ts').redBuenaParaOriginales(),
    cuatroG: red({ effectiveType: '4g', downlink: 8 }),
    tresG: red({ effectiveType: '3g' }),
    dosG: red({ effectiveType: '2g' }),
    ahorro: red({ effectiveType: '4g', saveData: true }),
    lenta: red({ effectiveType: '4g', downlink: 0.5 }),
  }
  console.log(JSON.stringify(salida))
})().catch((e) => {
  console.error(e && e.stack ? e.stack : String(e))
  process.exit(1)
})
