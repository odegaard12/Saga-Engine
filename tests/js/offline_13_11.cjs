// Pruebas de las piezas puras del arreglo de offline del 13/11. Salida: JSON con los casos.
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const RAIZ = path.resolve(__dirname, '..', '..')
const ts = require(path.join(RAIZ, 'frontend', 'node_modules', 'typescript'))
const cargar = (rel, extra = {}) => {
  const fuente = path.join(RAIZ, 'frontend', 'src', 'player', 'offline', rel)
  const js = ts.transpileModule(fs.readFileSync(fuente, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const m = { exports: {} }
  vm.runInNewContext(js, { module: m, exports: m.exports, Math, Number, Date, String, Boolean, ...extra })
  return m.exports
}

// --- chip de cobertura con el acceso caducado
const { estadoDeCobertura: e, TEXTOS_DE_COBERTURA: T } = cargar('estadoDeCobertura.ts')
const chip = {
  caducadoConRed: e(false, 3, true),
  caducadoSinPendientes: e(false, 0, true),
  caducadoSinRed: e(true, 2, true), // sin red manda «sin cobertura»: no se sabe si caducó
  normal: e(false, 3, false),
  textos: [T.es.accesoCaducado, T.gl.accesoCaducado],
}

// --- redEstado: un 401 apunta «acceso caducado»; un éxito lo borra; un 502 es sin cobertura, no acceso
const R = cargar('redEstado.ts', { navigator: { onLine: true } })
R.olvidarEstadoDeRed()
const acceso = []
acceso.push(R.accesoHaCaducado()) // false
R.notarRespuesta(401)
acceso.push(R.accesoHaCaducado()) // true
R.notarRespuesta(502)
acceso.push(R.accesoHaCaducado()) // true (un 502 no lo desmiente)
R.notarRespuesta(200)
acceso.push(R.accesoHaCaducado()) // false
R.notarRespuesta(403)
acceso.push(R.accesoHaCaducado()) // false: el 403 lo apunta quien sabe que es de sesión
R.notarAccesoCaducado()
acceso.push(R.accesoHaCaducado()) // true
R.notarAccesoValido()
acceso.push(R.accesoHaCaducado()) // false
R.olvidarEstadoDeRed()
const conexion = {}
{
  const mk = (c) => cargar('redEstado.ts', { navigator: { onLine: true, connection: c } }).conDatosMoviles()
  conexion.celular = mk({ type: 'cellular' })
  conexion.ahorro = mk({ saveData: true })
  conexion.wifi = mk({ type: 'wifi' })
  conexion.sinApi = cargar('redEstado.ts', { navigator: { onLine: true } }).conDatosMoviles()
}

// --- marca «bajar al servidor» tras un rechazo por no abrir el nodo
const almacen = new Map()
const localStorage = {
  getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
  setItem: (k, v) => almacen.set(k, String(v)),
  removeItem: (k) => almacen.delete(k),
}
const B = cargar('bajarAlServidor.ts', { localStorage })
const marca = []
marca.push(B.hayQueBajarAlServidor('ana')) // false
B.marcarBajarAlServidor('ana')
marca.push(B.hayQueBajarAlServidor('ana')) // true
marca.push(B.hayQueBajarAlServidor('luis')) // false: por jugador
B.olvidarBajarAlServidor('ana')
marca.push(B.hayQueBajarAlServidor('ana')) // false
const sinAlmacen = cargar('bajarAlServidor.ts', {
  localStorage: {
    getItem() { throw new Error('x') },
    setItem() { throw new Error('x') },
    removeItem() { throw new Error('x') },
  },
})
sinAlmacen.marcarBajarAlServidor('ana')
const motivos = {
  noAbrio: B.esRechazoPorNoAbrir('invalid_completion_code:not_opened'),
  otro: B.esRechazoPorNoAbrir('invalid_completion_code'),
  vacio: B.esRechazoPorNoAbrir(undefined),
  sinAlmacenSinMarca: sinAlmacen.hayQueBajarAlServidor('ana'),
}

console.log(JSON.stringify({ chip, acceso, conexion, marca, motivos }))
