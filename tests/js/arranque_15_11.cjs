// 15/11 (admin con muy poca cobertura): el arranque en una ida y vuelta, la calidad de la red y el sondeo en vivo adaptativo.
// Carga los .ts reales (transpilados) con un `require` que resuelve rutas relativas; `fetch` y el reloj son falsos.
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
    if (spec === 'react') return { useSyncExternalStore: () => [], useEffect() {}, useState: (v) => [v, () => {}] }
    if (!spec.startsWith('.')) throw new Error('módulo no resuelto: ' + spec)
    const p = path.resolve(path.dirname(abs), spec)
    for (const ext of ['.ts', '.tsx', '/index.ts']) if (fs.existsSync(p + ext)) return cargarTS(p + ext, ctx, cache)
    throw new Error('no existe ' + p)
  }
  vm.runInNewContext(js, { module: m, exports: m.exports, require: req, console, ...ctx })
  return m.exports
}

const json = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo, text: async () => JSON.stringify(cuerpo) })
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
const salida = {}

const perfil = (user, extra = {}) => ({ user, level: 1, presence: 'live', lat: 1, lon: 2, last_seen: 1000, ...extra })
const arranqueCompleto = (n = 1, extra = {}) => ({
  status: 'ok',
  server_ts: 5000 + n,
  overview: { status: 'ok', stages_revision: 'r' + n, stages: [{ index: 0, title: 'N0' }], profiles: [{ id: 'A' }], player_profiles: [{ id: 'A' }] },
  stages: { status: 'ok', stages: [{ id: 'n0' }], stages_revision: 'r' + n },
  config: { site_name: 'Misión', server_time_ms: 123 + n },
  huellas: { overview: 'h-ov' + n, stages: 'h-st' + n, config: 'h-cf' + n },
  live: { status: 'ok', server_ts: 5000 + n, profiles: [perfil('A')], etag: 'e' + n },
  ...extra,
})

;(async () => {
  // 1. resolverArranque: lo recibido se recuerda; la segunda vez «sin cambios» se rellena con lo de antes.
  {
    const A = cargarTS(path.join(SRC, 'admin', 'lib', 'arranque.ts'), {})
    const antes = A.huellasConocidas()
    const primera = A.resolverArranque(arranqueCompleto(1))
    const huellas = A.huellasConocidas()
    const segunda = A.resolverArranque({
      status: 'ok', overview: { sin_cambios: true }, stages: { sin_cambios: true }, config: { sin_cambios: true },
      huellas: { overview: 'h-ov1', stages: 'h-st1', config: 'h-cf1' }, live: { status: 'ok', profiles: [perfil('A', { level: 2 })], etag: 'e2' },
    })
    // La memoria es una COPIA: lo que haga quien llama con lo recibido no la estropea.
    primera.vista.profiles.push({ id: 'ZZ' })
    const tercera = A.resolverArranque({ status: 'ok', overview: { sin_cambios: true }, stages: { sin_cambios: true }, config: { sin_cambios: true }, huellas })
    salida.recuerda = {
      antes, huellas, primeraOk: !!primera && primera.vista.status === 'ok' && primera.guardados.stages.length === 1 && primera.publica.site_name === 'Misión',
      vivoPrimera: primera.vivo.etag,
      segundaIgual: JSON.stringify(segunda.vista.stages) === JSON.stringify(primera.vista.stages) && segunda.publica.site_name === 'Misión',
      segundaVivoNivel: segunda.vivo.profiles[0].level,
      memoriaIntacta: tercera.vista.profiles.length === 1,
    }
    A.olvidarArranque()
    salida.olvida = {
      huellas: A.huellasConocidas() === undefined,
      // «Sin cambios» de algo que NO tenemos no sirve: hay que pedirlo por el camino de siempre.
      sinCambiosSinMemoria: A.resolverArranque({ status: 'ok', overview: { sin_cambios: true }, stages: { sin_cambios: true }, config: { sin_cambios: true } }),
      noEsOk: [A.resolverArranque(null), A.resolverArranque({ status: 'fail' }), A.resolverArranque({ status: 'password_change_required' })],
      sinNodos: A.resolverArranque({ status: 'ok', overview: { status: 'ok' }, stages: { status: 'ok' } }),
      sinVivo: (() => { const r = A.resolverArranque({ ...arranqueCompleto(3), live: { status: 'fail' } }); return r && r.vivo })(),
    }
  }

  // 2. Calidad de la red: con `navigator.connection` y, sin él (Safari), con lo que ya se bajó.
  {
    const R = cargarTS(path.join(SRC, 'admin', 'lib', 'calidadDeRed.ts'), {})
    salida.red = {
      conexion: [
        R.calidadPorConexion({ effectiveType: '4g', rtt: 50 }), R.calidadPorConexion({ effectiveType: '3g' }), R.calidadPorConexion({ effectiveType: '2g' }),
        R.calidadPorConexion({ effectiveType: '4g', saveData: true }), R.calidadPorConexion({ effectiveType: '4g', rtt: 1500 }), R.calidadPorConexion({}), R.calidadPorConexion(undefined),
      ],
      recursos: [
        R.calidadPorRecursos([]),
        R.calidadPorRecursos([{ transferSize: 150_000, responseStart: 0, responseEnd: 20_000 }]), // 60 kbit/s
        R.calidadPorRecursos([{ transferSize: 150_000, responseStart: 0, responseEnd: 1_000 }]), // 1,2 Mbit/s
        R.calidadPorRecursos([{ transferSize: 150_000, responseStart: 0, responseEnd: 100 }]), // 12 Mbit/s
        R.calidadPorRecursos([{ transferSize: 0, responseStart: 0, responseEnd: 0 }, { transferSize: 5000, responseStart: 0, responseEnd: 900 }]), // caché / pequeños: no cuentan
      ],
      sinNada: cargarTS(path.join(SRC, 'admin', 'lib', 'calidadDeRed.ts'), { navigator: {}, performance: {} }).calidadDeRed(),
      porNavegador: cargarTS(path.join(SRC, 'admin', 'lib', 'calidadDeRed.ts'), { navigator: { connection: { effectiveType: '2g' } } }).calidadDeRed(),
    }
  }

  // 3. El sondeo en vivo: intervalos por red, «sin cambios», sembrado desde la entrada y antigüedad de la señal.
  function montarVivo({ respuestas = [], visible = true, red = {} } = {}) {
    const llamadas = []
    let i = 0
    const ctx = {
      fetch: async (url, init) => {
        llamadas.push({ url, cuerpo: JSON.parse(init.body) })
        const r = respuestas[i++] ?? respuestas[respuestas.length - 1]
        return json(200, r)
      },
      document: { visibilityState: visible ? 'visible' : 'hidden', addEventListener() {} },
      navigator: { connection: red },
      performance: { getEntriesByType: () => [] },
      setTimeout, clearTimeout, Date,
    }
    const mod = cargarTS(path.join(SRC, 'admin', 'lib', 'estadoEnVivo.ts'), ctx)
    return { mod, llamadas }
  }
  {
    const { mod } = montarVivo()
    salida.intervalos = {
      buena: mod.intervaloBase(0, 'buena'), media: mod.intervaloBase(0, 'media'), mala: mod.intervaloBase(0, 'mala'),
      // Nunca más deprisa que 4 veces lo que tardó la última respuesta (tope 2 min).
      lenta: mod.intervaloBase(20_000, 'buena'), muyLenta: mod.intervaloBase(60_000, 'buena'),
      trasFallos: [0, 1, 2, 5].map((f) => mod.esperaTrasFallos(f)), trasFallosMala: [0, 1, 2].map((f) => mod.esperaTrasFallos(f, 45_000)),
    }
    salida.antiguedad = {
      s: mod.antiguedadDeLaSenalS(960, 1000), ms: mod.antiguedadDeLaSenalS(1_700_000_000_000, 1_700_000_040), nunca: mod.antiguedadDeLaSenalS(0, 1000), sinHora: mod.antiguedadDeLaSenalS(960, null), futuro: mod.antiguedadDeLaSenalS(1005, 1000),
      textos: [5, 40, 100, 600, 7300, null].map((x) => mod.textoDeAntiguedad(x)), umbral: mod.SEGUNDOS_POSICION_VIEJA,
    }
  }
  {
    const lleno = { status: 'ok', server_ts: 100, profiles: [perfil('A'), perfil('B')], etag: 'E1' }
    const igual = { status: 'sin_cambios', server_ts: 115, etag: 'E1' }
    const nuevo = { status: 'ok', server_ts: 130, profiles: [perfil('A', { level: 3 }), perfil('B')], etag: 'E2' }
    const { mod, llamadas } = montarVivo({ respuestas: [lleno, igual, nuevo] })
    const vistos = []
    const dejar = mod.suscribirEstadoEnVivo((e) => vistos.push({ n: e.perfiles ? e.perfiles.length : null, ts: e.serverTs, nivelA: e.perfiles ? e.perfiles[0].level : null, fallos: e.fallos }))
    await esperar(30)
    mod.refrescarEstadoEnVivo(); await esperar(30)
    mod.refrescarEstadoEnVivo(); await esperar(30)
    dejar()
    salida.sondeo = {
      cuerpos: llamadas.map((l) => l.cuerpo), vistos,
      urls: [...new Set(llamadas.map((l) => l.url))],
    }
  }
  {
    // Sembrado desde la entrada: al abrir la lista no se pide otra vez enseguida; sí se manda la huella al pedir.
    const { mod, llamadas } = montarVivo({ respuestas: [{ status: 'sin_cambios', server_ts: 9, etag: 'S1' }] })
    mod.sembrarEstadoEnVivo({ status: 'ok', server_ts: 5, profiles: [perfil('A')], etag: 'S1' }, Date.now())
    const dejar = mod.suscribirEstadoEnVivo(() => {})
    await esperar(30)
    const trasSuscribir = llamadas.length
    mod.refrescarEstadoEnVivo(); await esperar(30)
    dejar()
    salida.sembrado = { peticionesAlSuscribir: trasSuscribir, cuerpoDespues: llamadas.map((l) => l.cuerpo) }
    // Una respuesta que no sirve no siembra nada.
    const v = montarVivo({ respuestas: [{ status: 'ok', server_ts: 1, profiles: [], etag: 'Z' }] })
    v.mod.sembrarEstadoEnVivo({ status: 'fail' }, Date.now()); v.mod.sembrarEstadoEnVivo(null, Date.now()); v.mod.sembrarEstadoEnVivo({ status: 'ok' }, Date.now())
    const dv = v.mod.suscribirEstadoEnVivo(() => {}); await esperar(30); dv()
    salida.sembradoMalo = { peticiones: v.llamadas.length }
  }
  {
    // Pestaña oculta: no se sondea; un fallo de red deja lo último bueno y sube el contador.
    const oculto = montarVivo({ respuestas: [{ status: 'ok', server_ts: 1, profiles: [perfil('A')], etag: 'Q' }], visible: false })
    const d1 = oculto.mod.suscribirEstadoEnVivo(() => {}); await esperar(30); d1()
    const ctxFallo = { fetch: async () => { throw new TypeError('Failed to fetch') }, document: { visibilityState: 'visible', addEventListener() {} }, navigator: {}, performance: { getEntriesByType: () => [] }, setTimeout, clearTimeout, Date }
    const f = cargarTS(path.join(SRC, 'admin', 'lib', 'estadoEnVivo.ts'), ctxFallo)
    const vistos = []
    const d2 = f.suscribirEstadoEnVivo((e) => vistos.push({ perfiles: e.perfiles, fallos: e.fallos })); await esperar(30)
    f.refrescarEstadoEnVivo(); await esperar(30); d2()
    salida.oculta = { peticiones: oculto.llamadas.length }
    salida.fallo = vistos.map((v) => ({ perfiles: v.perfiles, fallos: v.fallos }))
  }

  console.log(JSON.stringify(salida))
  process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })
