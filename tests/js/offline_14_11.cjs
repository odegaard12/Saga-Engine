// Offline 14/11 (prueba empirica con un movil emulado): navegacion cortada, portada sin red, chip, variantes en cache.
// Salida: JSON con los casos. `SW_RUTA` apunta a otro sw.js para comprobar que la prueba falla con el anterior.
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const RAIZ = path.resolve(__dirname, '..', '..')
const ts = require(path.join(RAIZ, 'frontend', 'node_modules', 'typescript'))
const FRONT = path.join(RAIZ, 'frontend')

function cargarTs(rel, extra = {}) {
  const js = ts.transpileModule(fs.readFileSync(path.join(FRONT, 'src', rel), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const m = { exports: {} }
  const base = { module: m, exports: m.exports, Math, Number, Date, String, Boolean, Promise, Error, setTimeout, clearTimeout, URLSearchParams, window: undefined, require: () => ({}) }
  vm.runInNewContext(js, { ...base, ...extra })
  return m.exports
}

// ---------------------------------------------------------------- chip: la ventana larga cubre el mayor reintento (60 s)
function chip() {
  let t = 1_000_000
  const R = cargarTs('player/offline/redEstado.ts', { navigator: { onLine: true }, Date: { now: () => t } })
  R.olvidarEstadoDeRed()
  R.notarFalloDeRed()
  const r = { ventana: R.VENTANA_SIN_RED_LARGA_MS }
  t += 60_000
  r.a60sCorta = R.sinCoberturaAhora() // 45 s: el chip parpadeaba aqui
  r.a60sLarga = R.sinCoberturaAhora(R.VENTANA_SIN_RED_LARGA_MS)
  R.notarFalloDeRed() // el reintento (hasta 60 s) falla otra vez: se renueva
  t += 60_000
  r.reintentoRenueva = R.sinCoberturaAhora(R.VENTANA_SIN_RED_LARGA_MS)
  t += 40_000
  r.pasadaLaVentana = R.sinCoberturaAhora(R.VENTANA_SIN_RED_LARGA_MS) // 100 s sin nada: ya no
  R.notarFalloDeRed()
  R.notarRedOk()
  r.conExito = R.sinCoberturaAhora(R.VENTANA_SIN_RED_LARGA_MS)
  return r
}

// ---------------------------------------------------------------- portada sin red: ¿hay paquete guardado?
async function datosSinRed() {
  const J = cargarTs('shared/jugadorRecordado.ts', { localStorage: {} })
  const r = {}
  r.conPaquete = await J.tieneDatosSinRed('Ana', async () => ({ payload: {} }))
  r.sinPaquete = await J.tieneDatosSinRed('Ana', async () => null)
  r.lanza = await J.tieneDatosSinRed('Ana', async () => {
    throw new Error('IndexedDB no abre')
  })
  const t0 = Date.now()
  r.cuelga = await J.tieneDatosSinRed('Ana', () => new Promise(() => {}), 40)
  r.cuelgaMs = Date.now() - t0
  r.pideElId = await (async () => {
    let pedido = null
    await J.tieneDatosSinRed('Luis', async (id) => ((pedido = id), null))
    return pedido
  })()
  r.decide = {
    sinRedConDatos: J.decidirEntrada('sin-red', true),
    sinRedSinDatos: J.decidirEntrada('sin-red', false),
  }
  return r
}

// ---------------------------------------------------------------- service worker en un vm, con cache y red de mentira
function crearCaches(estado) {
  const almacenes = new Map()
  const url = (x) => new URL(typeof x === 'string' ? x : x.url, 'https://saga.test').href
  const clave = (u, ignoreSearch) => {
    const o = new URL(u)
    return ignoreSearch ? o.origin + o.pathname : o.href
  }
  function almacen(nombre) {
    if (!almacenes.has(nombre)) almacenes.set(nombre, new Map())
    const m = almacenes.get(nombre)
    return {
      async put(req, res) {
        if (estado.llena) throw new Error('QuotaExceededError')
        m.set(new URL(url(req)).href, res)
      },
      async match(req, o = {}) {
        const k = clave(url(req), o.ignoreSearch)
        for (const [u, res] of m) if (clave(u, o.ignoreSearch) === k) return res.clone()
        return undefined
      },
      async keys() {
        return [...m.keys()].map((u) => ({ url: u }))
      },
      async delete(req) {
        return m.delete(new URL(url(req)).href)
      },
    }
  }
  return {
    open: async (n) => almacen(n),
    keys: async () => [...almacenes.keys()],
    async match(req, o) {
      for (const n of almacenes.keys()) {
        const r = await almacen(n).match(req, o)
        if (r) return r
      }
      return undefined
    },
    contenido: (n) => [...(almacenes.get(n) || new Map()).keys()].map((u) => new URL(u).pathname + new URL(u).search),
  }
}

function cuerpoRoto(texto) {
  return new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(texto))
        c.error(new TypeError('network error'))
      },
    }),
    { status: 200, headers: { 'content-type': 'text/html' } }
  )
}
function cuerpoColgado(texto) {
  return new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(texto))
      },
    }),
    { status: 200, headers: { 'content-type': 'text/html' } }
  )
}
const pagina = (marca) => `<html><head><script src="/assets/index-a.js"></script></head><body>${marca}</body></html>`

// Si algo se cuelga (el service worker anterior no tenía tope para el cuerpo), la prueba lo dice en vez de quedarse muda.
const conTope = (p, ms = 3000) => Promise.race([p, new Promise((resolve) => setTimeout(() => resolve('<<TIMEOUT>>'), ms))])

async function sw() {
  const RUTA = process.env.SW_RUTA || path.join(FRONT, 'public', 'sw.js')

  function arrancar(idioma = 'es-ES') {
    const estado = { llena: false, red: async () => new Response(pagina('NUEVA'), { status: 200, headers: { 'content-type': 'text/html' } }) }
    const caches = crearCaches(estado)
    const oyentes = {}
    const self = {
      location: { origin: 'https://saga.test' },
      navigator: { language: idioma },
      addEventListener: (tipo, fn) => (oyentes[tipo] = fn),
      skipWaiting: () => {},
      clients: { claim: async () => undefined },
    }
    const escalado = (fn, ms) => setTimeout(fn, ms > 1000 ? 30 : ms) // los 5 s y 8 s de verdad, en 30 ms
    const contexto = vm.createContext({
      self, caches, fetch: (r, o) => estado.red(r, o), indexedDB: undefined,
      console: { log() {}, warn() {}, error() {} },
      URL, Request, Response, Promise, JSON, Date, Set, Map, setTimeout: escalado, clearTimeout, AbortController, Headers, TextEncoder,
    })
    vm.runInContext(fs.readFileSync(RUTA, 'utf8'), contexto, { filename: 'sw.js' })
    return { estado, caches, oyentes }
  }

  async function navegar(oyentes, ruta) {
    let respuesta = null
    oyentes.fetch({
      request: { url: 'https://saga.test' + ruta, method: 'GET', mode: 'navigate', headers: new Headers() },
      respondWith: (p) => (respuesta = p),
      waitUntil: () => {},
    })
    return respuesta ? await conTope(respuesta) : null
  }
  const guardar = async (caches, ruta, cuerpo) => (await caches.open('saga-player-shell')).put({ url: 'https://saga.test' + ruta }, new Response(cuerpo, { status: 200 }))
  const texto = async (r) => (typeof r === 'string' ? r : r ? await conTope(r.text().catch(() => '<<roto>>')) : null)
  const res = {}

  // 1. Respuesta cortada a la mitad CON copia guardada: tiene que salir la copia, no el cuerpo roto.
  {
    const { estado, caches, oyentes } = arrancar()
    await guardar(caches, '/assets/index-a.js', '//js')
    await guardar(caches, '/player/ANA', pagina('COPIA'))
    estado.red = async () => cuerpoRoto('<html><head><script src="/assets/index-a.js"></script></head><body>NUE')
    const r = await navegar(oyentes, '/player/ANA')
    res.cortadaConCopia = { estado: r && r.status, cuerpo: await texto(r) }
  }
  // 2. Cortada y SIN copia: la pagina mínima con el botón (sin inglés), en castellano y en gallego.
  for (const [nombre, idioma] of [['es', 'es-ES'], ['gl', 'gl-ES']]) {
    const { estado, oyentes } = arrancar(idioma)
    estado.red = async () => cuerpoRoto('<html><body>NUE')
    const r = await navegar(oyentes, '/player/ANA')
    const html = await texto(r)
    res['cortadaSinCopia_' + nombre] = {
      estado: r && r.status,
      tipo: r && r.headers.get('content-type'),
      boton: /<button[^>]*onclick="location\.reload\(\)"/.test(html || ''),
      reintentar: /Reintentar|Tentar de novo/.exec(html || '') && /Reintentar|Tentar de novo/.exec(html)[0],
      ingles: /offline shell|Open SAGA|Prepare offline/i.test(html || ''),
    }
  }
  // 3. Cuerpo que se cuelga (cabeceras llegan, el resto no): con copia, la copia.
  {
    const { estado, caches, oyentes } = arrancar()
    await guardar(caches, '/assets/index-a.js', '//js')
    await guardar(caches, '/player/ANA', pagina('COPIA'))
    estado.red = async () => cuerpoColgado('<html>')
    const r = await navegar(oyentes, '/player/ANA')
    res.colgadaConCopia = await texto(r)
  }
  // 4. El caso normal sigue igual: devuelve la nueva y la guarda.
  {
    const { caches, oyentes } = arrancar()
    await guardar(caches, '/assets/index-a.js', '//js')
    const r = await navegar(oyentes, '/player/ANA')
    res.normal = { estado: r && r.status, cuerpo: (await texto(r) || '').includes('NUEVA'), guardada: caches.contenido('saga-player-shell').includes('/player/ANA') }
  }
  // 5. Un 502 con copia: la copia (ya funcionaba).
  {
    const { estado, caches, oyentes } = arrancar()
    await guardar(caches, '/player/ANA', pagina('COPIA'))
    estado.red = async () => new Response('<html>502</html>', { status: 502 })
    res.e502 = await texto(await navegar(oyentes, '/player/ANA'))
  }
  // 6. Variantes: la copia vieja SIN query y la nueva CON query. Hay que quedarse con una sola, la nueva.
  {
    const { caches, oyentes } = arrancar()
    await guardar(caches, '/assets/index-a.js', '//js')
    await guardar(caches, '/player/ANA', pagina('VIEJA'))
    await navegar(oyentes, '/player/ANA?user=ANA')
    const claves = caches.contenido('saga-player-shell')
    const sin = await caches.match({ url: 'https://saga.test/player/ANA' }, { ignoreSearch: true })
    res.variantes = { claves: claves.filter((c) => c.startsWith('/player/')), sinQuerySirve: (await texto(sin)).includes('NUEVA') }
  }
  // 7. Si la nueva NO se pudo guardar (cuota llena), la vieja se queda.
  {
    const { estado, caches, oyentes } = arrancar()
    await guardar(caches, '/assets/index-a.js', '//js')
    await guardar(caches, '/player/ANA', pagina('VIEJA'))
    estado.llena = true
    const r = await navegar(oyentes, '/player/ANA?user=ANA')
    estado.llena = false
    res.cuotaLlena = { devuelve: (await texto(r) || '').includes('NUEVA'), claves: caches.contenido('saga-player-shell').filter((c) => c.startsWith('/player/')) }
  }
  // 8. Una página de otra ruta no se toca.
  {
    const { caches, oyentes } = arrancar()
    await guardar(caches, '/assets/index-a.js', '//js')
    await guardar(caches, '/player/LUIS', pagina('DE_LUIS'))
    await navegar(oyentes, '/player/ANA?user=ANA')
    res.otraRuta = caches.contenido('saga-player-shell').filter((c) => c.startsWith('/player/')).sort()
  }
  return res
}

;(async () => {
  const salida = { chip: chip(), datosSinRed: await datosSinRed(), sw: await sw() }
  console.log(JSON.stringify(salida))
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
