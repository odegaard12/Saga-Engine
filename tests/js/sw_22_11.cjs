// 22/11 (mejora 8): el service worker (frontend/public/sw.js) entero en un vm de Node, con cachés, red, reloj y
// clientes de mentira. La caché cuenta cuántas veces se recorre (`keys()` y `match` con ignoreSearch): es lo que
// en 6.12.4 dejó el mapa sin teselas al alejar (cada búsqueda recorría ~10 600 teselas guardadas).
// Salida: JSON con los casos; las comprobaciones están en tests/test_sw_22_11.py.
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const RUTA = process.env.SW_RUTA || path.resolve(__dirname, '..', '..', 'frontend', 'public', 'sw.js')
const ORIGEN = 'https://saga.test'
const SHELL = 'saga-player-shell'
const TESELAS = 'saga-route-tile-coverage-v5.55-terrarium'
const FOTOS = 'saga-field-proof-assets-v3.9.6'
const CAMINOS = 'saga-road-graph-v2'

const href = (x) => new URL(typeof x === 'string' ? x : x.url, ORIGEN).href
const sinQuery = (u) => {
  const o = new URL(u)
  return o.origin + o.pathname
}
const ruta = (u) => {
  const o = new URL(u)
  return o.pathname + o.search
}
const peticion = (r, extra = {}) => ({ url: ORIGEN + r, method: 'GET', mode: 'cors', headers: new Headers(), ...extra })
const ok = (cuerpo, tipo = 'text/plain') => new Response(cuerpo, { status: 200, headers: { 'content-type': tipo } })

function arrancar({ escalado = false } = {}) {
  const reloj = { t: 1_800_000_000_000 }
  const cuenta = { keys: {}, recorridos: {}, match: {}, red: [], saltos: 0, reclamado: 0 }
  const sumar = (k, n) => (cuenta[k][n] = (cuenta[k][n] || 0) + 1)
  const estado = { sinRed: false, red: async () => ok('red') }
  const almacenes = new Map()

  function almacen(nombre) {
    if (!almacenes.has(nombre)) almacenes.set(nombre, new Map())
    const m = almacenes.get(nombre)
    const buscar = (req, o = {}) => {
      sumar('match', nombre)
      if (!o.ignoreSearch) return m.get(href(req))
      sumar('recorridos', nombre)
      for (const [u, res] of m) if (sinQuery(u) === sinQuery(href(req))) return res
      return undefined
    }
    return {
      async match(req, o) {
        const res = buscar(req, o)
        return res ? res.clone() : undefined
      },
      async put(req, res) {
        const k = href(req)
        m.delete(k) // como la Cache API: la clave repuesta pasa al final (la más nueva)
        m.set(k, res.clone())
      },
      async add(u) {
        const res = await fetch(peticion(new URL(href(u)).pathname))
        if (!res.ok) throw new TypeError('add: ' + res.status)
        await this.put(u, res)
      },
      async keys() {
        sumar('keys', nombre)
        return [...m.keys()].map((u) => ({ url: u }))
      },
      async delete(req, o = {}) {
        if (o.ignoreSearch) sumar('recorridos', nombre)
        let borrado = false
        for (const u of [...m.keys()]) {
          if (o.ignoreSearch ? sinQuery(u) === sinQuery(href(req)) : u === href(req)) borrado = m.delete(u) || borrado
        }
        return borrado
      },
      _rutas: () => [...m.keys()].map(ruta),
      _mapa: m,
    }
  }
  const abiertos = new Map()
  const abrir = (n) => {
    if (!abiertos.has(n)) abiertos.set(n, almacen(n))
    return abiertos.get(n)
  }
  const caches = {
    open: async (n) => abrir(n),
    keys: async () => [...almacenes.keys()],
    has: async (n) => almacenes.has(n),
    delete: async (n) => {
      abiertos.delete(n)
      return almacenes.delete(n)
    },
    async match(req, o) {
      for (const n of almacenes.keys()) {
        const r = await abrir(n).match(req, o)
        if (r) return r
      }
      return undefined
    },
  }
  async function fetch(req, init = {}) {
    cuenta.red.push(ruta(href(req)))
    if (estado.sinRed) throw new TypeError('Failed to fetch')
    const senal = init.signal
    if (!senal) return estado.red(req)
    // Como el fetch de verdad: abortar corta la espera.
    return Promise.race([
      estado.red(req),
      new Promise((_, rechazar) => senal.addEventListener('abort', () => rechazar(new Error('AbortError')))),
    ])
  }
  class Fecha extends Date {
    static now() {
      return reloj.t
    }
  }
  const oyentes = {}
  const self = {
    location: { origin: ORIGEN },
    navigator: { language: 'es-ES' },
    addEventListener: (tipo, fn) => (oyentes[tipo] = fn),
    skipWaiting: () => {
      cuenta.saltos += 1
    },
    clients: {
      claim: async () => {
        cuenta.reclamado += 1
      },
    },
  }
  const contexto = vm.createContext({
    self, caches, fetch, indexedDB: undefined, console: { log() {}, warn() {}, error() {} },
    URL, Request, Response, Headers, Promise, JSON, Date: Fecha, Set, Map, clearTimeout, AbortController,
    // `escalado`: los topes de 30 s de verdad, en 30 ms.
    setTimeout: escalado ? (fn, ms) => setTimeout(fn, ms > 1000 ? 30 : ms) : setTimeout,
  })
  vm.runInContext(fs.readFileSync(RUTA, 'utf8'), contexto, { filename: 'sw.js' })

  const guardar = (nombre, r, cuerpo = 'copia', tipo) => abrir(nombre).put(peticion(r), ok(cuerpo, tipo))
  async function evento(tipo, datos = {}) {
    let espera = Promise.resolve()
    oyentes[tipo]({ ...datos, waitUntil: (p) => (espera = p) })
    await espera
  }
  async function pedir(r, extra) {
    let respuesta = null
    oyentes.fetch({ request: peticion(r, extra), respondWith: (p) => (respuesta = p), waitUntil() {} })
    if (!respuesta) return { interceptada: false }
    try {
      const res = await respuesta
      return { interceptada: true, estado: res.status, cuerpo: await res.text(), tipo: res.headers.get('content-type') }
    } catch (error) {
      return { interceptada: true, error: String(error && error.message) }
    }
  }
  const limpiar = () => {
    for (const k of ['keys', 'recorridos', 'match']) cuenta[k] = {}
    cuenta.red = []
  }
  return { reloj, cuenta, estado, caches, abrir, guardar, evento, pedir, limpiar, contexto }
}

async function instalacion() {
  const sw = arrancar()
  await sw.guardar(SHELL, '/', 'PORTADA_VIEJA', 'text/html')
  sw.estado.red = async (req) => (href(req).endsWith('/login-fondo.jpg') ? new Response('', { status: 404 }) : ok('nuevo'))
  await sw.evento('install')
  const shell = sw.abrir(SHELL)
  return {
    red: sw.cuenta.red.sort(),
    guardado: shell._rutas().sort(),
    portada: await (await shell.match(peticion('/'))).text(),
    saltos: sw.cuenta.saltos,
  }
}

async function activacion() {
  const sw = arrancar()
  await sw.guardar(SHELL, '/assets/index-nuevo.js', 'NUEVO')
  await sw.guardar(SHELL, '/assets/avatares/chica.glb', 'GLB')
  await sw.guardar(SHELL, '/', 'PORTADA')
  await sw.guardar('saga-player-shell-v6.1.0', '/assets/index-nuevo.js', 'VIEJO_PISARIA')
  await sw.guardar('saga-player-shell-v6.1.0', '/assets/index-viejo.js', 'VIEJO')
  await sw.guardar('saga-player-shell-previa', '/assets/de-hace-dos.js', 'MUY_VIEJO')
  await sw.guardar('saga-route-tile-coverage-v5.0', '/map-tiles/1/1/1.png', 'T')
  await sw.guardar(TESELAS, '/map-tiles/1/1/1.png', 'T')
  await sw.guardar(TESELAS, '/api/road-graph', '{}')
  await sw.guardar('saga-field-proof-assets-v3.9.5', '/media/nodo/a', 'F')
  await sw.guardar(FOTOS, '/media/nodo/a', 'F')
  await sw.guardar('saga-road-graph-v1', '/api/road-graph', '{}')
  await sw.guardar(CAMINOS, '/api/road-graph', '{}')
  for (let i = 0; i < 2000; i++) await sw.guardar(TESELAS, `/map-tiles/16/${i}/1.png`, 'T')
  sw.limpiar()
  await sw.evento('activate')
  const shell = sw.abrir(SHELL)
  return {
    caches: (await sw.caches.keys()).sort(),
    shell: shell._rutas().sort(),
    noPisaLoNuevo: await (await shell.match(peticion('/assets/index-nuevo.js'))).text(),
    previa: sw.abrir('saga-player-shell-previa')._rutas().sort(),
    teselas: sw.abrir(TESELAS)._rutas().filter((r) => !r.startsWith('/map-tiles/16/')),
    recorridosEnTeselas: sw.cuenta.recorridos[TESELAS] || 0,
    keysEnTeselas: sw.cuenta.keys[TESELAS] || 0,
    reclamado: sw.cuenta.reclamado,
  }
}

async function mensajes() {
  const sw = arrancar()
  await sw.evento('message', { data: { type: 'SAGA_SKIP_WAITING' } })
  await sw.evento('message', { data: { type: 'OTRA_COSA' } })
  await sw.evento('message', {})
  return { saltos: sw.cuenta.saltos }
}

async function shell() {
  const sw = arrancar()
  const r = {}
  await sw.guardar(SHELL, '/assets/index-a.js', 'GUARDADO')
  await sw.guardar(SHELL, '/saga-app-icon-192.png', 'ICONO')
  r.guardado = await sw.pedir('/assets/index-a.js')
  r.guardadoRed = sw.cuenta.red.length
  r.iconoConQuery = await sw.pedir('/saga-app-icon-192.png?v=redondo') // se instaló sin query
  sw.limpiar()
  sw.estado.red = async () => ok('BAJADO', 'text/javascript')
  r.nuevo = await sw.pedir('/assets/index-b.js')
  r.nuevoGuardado = sw.abrir(SHELL)._rutas().includes('/assets/index-b.js')
  sw.estado.red = async () => new Response('caido', { status: 502 })
  r.caido = await sw.pedir('/assets/index-c.js')
  r.caidoGuardado = sw.abrir(SHELL)._rutas().includes('/assets/index-c.js')
  sw.estado.sinRed = true
  r.sinRedNiCopia = await sw.pedir('/assets/index-d.js')
  // Lo de la app no se busca nunca en las cachés de teselas, caminos ni fotos.
  await sw.guardar(TESELAS, '/assets/index-z.js', 'NO_ES_DE_AQUI')
  sw.limpiar()
  r.noMiraTeselas = await sw.pedir('/assets/index-z.js')
  r.matchEnTeselas = sw.cuenta.match[TESELAS] || 0
  r.keysEnTeselas = sw.cuenta.keys[TESELAS] || 0
  return r
}

async function sinInterceptar() {
  const sw = arrancar()
  const r = {}
  for (const [nombre, ruta_, extra] of [
    ['apiGame', '/api/game?user=x'],
    ['apiSync', '/api/events/sync', { method: 'POST' }],
    ['admin', '/admin/'],
    ['adminReact', '/admin-react/x'],
    ['esri', '/map-tiles/esri/1/1/1.jpg'],
    ['otroOrigen', '/foto.png', { url: 'https://otro.test/foto.png' }],
    // 22/11 (cargas): lo que baja la pantalla de carga lo guarda ella; el worker no lo toca.
    ['descargaDeCarga', '/assets/MapSurfaceGL-aaaaaaaa.js', { headers: new Headers({ 'X-Saga-Carga': '1' }) }],
  ]) {
    r[nombre] = (await sw.pedir(ruta_, extra)).interceptada
  }
  return r
}

async function edificios() {
  const sw = arrancar()
  const r = {}
  sw.estado.red = async () => ok('{"type":"FeatureCollection","features":[1]}', 'application/json')
  r.conRed = await sw.pedir('/api/edificios')
  sw.estado.sinRed = true
  r.sinRedCopia = await sw.pedir('/api/edificios')
  const otro = arrancar()
  otro.estado.sinRed = true
  r.sinRedNada = await otro.pedir('/api/edificios')
  sw.estado.sinRed = false
  sw.estado.red = async () => new Response('<html>502', { status: 502, headers: { 'content-type': 'text/html' } })
  r.caidoCopia = await sw.pedir('/api/edificios')
  return r
}

async function teselas() {
  const sw = arrancar()
  const r = {}
  const cache = sw.abrir(TESELAS)
  for (let i = 0; i < 10600; i++) cache._mapa.set(`${ORIGEN}/map-tiles/16/${i}/1.png`, ok('T' + i, 'image/png'))
  sw.limpiar()
  r.guardada = await sw.pedir('/map-tiles/16/77/1.png')
  r.guardadaRed = sw.cuenta.red.length
  sw.estado.sinRed = true
  const antes = Date.now()
  const faltan = await Promise.all(Array.from({ length: 40 }, (_, i) => sw.pedir(`/map-tiles/17/${i}/2.png`)))
  r.faltanMs = Date.now() - antes
  r.faltanFallan = faltan.every((x) => x.interceptada && x.error)
  r.keys = sw.cuenta.keys[TESELAS] || 0
  r.recorridos = sw.cuenta.recorridos[TESELAS] || 0
  r.matchPorTesela = (sw.cuenta.match[TESELAS] || 0) / 41
  sw.estado.sinRed = false
  sw.estado.red = async () => ok('PNG', 'image/png')
  await sw.pedir('/map-tiles/17/0/2.png')
  sw.estado.red = async () => new Response('PNG', { status: 200, headers: { 'content-type': 'image/png', 'X-Saga-Tesela': 'fuera-de-zona' } })
  await sw.pedir('/map-tiles/17/1/2.png')
  r.buenaGuardada = cache._mapa.has(`${ORIGEN}/map-tiles/17/0/2.png`)
  r.fueraDeZonaGuardada = cache._mapa.has(`${ORIGEN}/map-tiles/17/1/2.png`)
  return r
}

async function avatares() {
  const sw = arrancar()
  const r = {}
  await sw.guardar(FOTOS, '/api/player-avatar/p1?v=1', 'FOTO_V1', 'image/webp')
  r.mismaVersion = await sw.pedir('/api/player-avatar/p1?v=1')
  r.mismaVersionRed = sw.cuenta.red.length
  sw.estado.red = async () => ok('FOTO_V2', 'image/webp')
  r.otraVersion = await sw.pedir('/api/player-avatar/p1?v=2')
  r.otraVersionGuardada = sw.abrir(FOTOS)._rutas().includes('/api/player-avatar/p1?v=2')
  sw.estado.red = async () => ok('<html>login', 'text/html')
  await sw.pedir('/api/player-avatar/p1?v=3')
  r.htmlGuardado = sw.abrir(FOTOS)._rutas().includes('/api/player-avatar/p1?v=3')
  r.recorridos = sw.cuenta.recorridos[FOTOS] || 0
  r.keys = sw.cuenta.keys[FOTOS] || 0
  await sw.guardar(FOTOS, '/api/field-proofs/f1/thumb?v=ligera', 'LIGERA', 'image/jpeg')
  // Sin red, una versión que no está: la otra versión guardada (la foto se cambió con el móvil sin cobertura).
  sw.estado.sinRed = true
  r.sinRedOtraVersion = await sw.pedir('/api/player-avatar/p1?v=9')
  r.sinRedOtroJugador = await sw.pedir('/api/player-avatar/p2?v=1')
  r.fotoDeCampoSinRed = await sw.pedir('/api/field-proofs/f1/thumb?v=original')
  // Red colgada (una barra): con tope, no se queda pidiendo para siempre.
  const colgada = arrancar({ escalado: true })
  colgada.estado.red = () => new Promise(() => {})
  const t0 = Date.now()
  const resultado = await Promise.race([
    colgada.pedir('/api/player-avatar/p3?v=1'),
    new Promise((resolve) => setTimeout(() => resolve('<<COLGADA>>'), 2000)),
  ])
  r.redColgada = resultado === '<<COLGADA>>' ? resultado : { error: Boolean(resultado.error), ms: Date.now() - t0 }
  return r
}

async function indice() {
  const sw = arrancar()
  const r = {}
  await sw.guardar(SHELL, '/saga-app-icon-180.png', 'ICONO')
  sw.estado.sinRed = true
  sw.limpiar()
  // Diez peticiones a la vez que no están: UNA construcción del índice.
  await Promise.all(Array.from({ length: 10 }, (_, i) => sw.pedir(`/assets/falta-${i}.js`)))
  r.aLaVez = sw.cuenta.keys[SHELL] || 0
  // Más fallos dentro de los 5 min: no se rehace.
  for (let i = 0; i < 5; i++) await sw.pedir(`/assets/falta-otra-${i}.js`)
  r.dentroDe5Min = sw.cuenta.keys[SHELL] || 0
  sw.reloj.t += 5 * 60 * 1000 + 1
  await sw.pedir('/assets/falta-tarde.js')
  await sw.pedir('/assets/falta-tarde-2.js')
  r.pasados5Min = sw.cuenta.keys[SHELL] || 0
  // Lo que se guardó después de construir el índice se encuentra con su dirección exacta.
  await sw.guardar(SHELL, '/assets/nuevo.js', 'NUEVO')
  r.exactaTrasElIndice = await sw.pedir('/assets/nuevo.js')
  // Una copia que se borró después de construir el índice: no rompe, se pide a la red.
  await sw.guardar(SHELL, '/saga-app-icon-192.png', 'ICONO_192')
  sw.reloj.t += 5 * 60 * 1000 + 1
  await sw.pedir('/assets/fuerza-indice.js')
  await sw.abrir(SHELL).delete(peticion('/saga-app-icon-192.png'))
  sw.estado.sinRed = false
  sw.estado.red = async () => ok('ICONO_RED', 'image/png')
  r.borradaTrasElIndice = await sw.pedir('/saga-app-icon-192.png?v=redondo')
  return r
}

// El índice se construyó con `/player/ANA`; luego se guardó `/player/ANA?user=ANA` y se borró la vieja
// (`quitarOtrasVariantes`). Sin red hay que servir la nueva, no la portada.
async function indiceViejo() {
  const sw = arrancar()
  await sw.guardar(SHELL, '/', 'PORTADA', 'text/html')
  await sw.guardar(SHELL, '/player/ANA', 'VIEJA', 'text/html')
  sw.estado.sinRed = true
  const antes = await sw.pedir('/player/ANA?depurar-mapa=1', { mode: 'navigate' })
  await sw.guardar(SHELL, '/player/ANA?user=ANA', 'NUEVA', 'text/html')
  await sw.abrir(SHELL).delete(peticion('/player/ANA'))
  const despues = await sw.pedir('/player/ANA?depurar-mapa=1', { mode: 'navigate' })
  return { antes: antes.cuerpo, despues: despues.cuerpo }
}

async function navegacion() {
  const r = {}
  const pagina = '<html><head><script src="/assets/index-a.js"></script></head><body>COPIA</body></html>'
  {
    const sw = arrancar()
    await sw.guardar(SHELL, '/player/ANA', pagina, 'text/html')
    sw.estado.sinRed = true
    r.conCopia = await sw.pedir('/player/ANA?depurar-mapa=1', { mode: 'navigate' })
  }
  {
    const sw = arrancar()
    await sw.guardar(SHELL, '/', 'PORTADA', 'text/html')
    sw.estado.sinRed = true
    r.soloPortada = await sw.pedir('/player/LUIS', { mode: 'navigate' })
  }
  {
    const sw = arrancar()
    sw.estado.sinRed = true
    r.nada = await sw.pedir('/player/LUIS', { mode: 'navigate' })
  }
  {
    const sw = arrancar()
    await sw.guardar(SHELL, '/player/ANA', pagina, 'text/html')
    sw.estado.red = async () => new Response('<html>Bad gateway', { status: 502, headers: { 'content-type': 'text/html' } })
    r.caido = await sw.pedir('/player/ANA', { mode: 'navigate' })
  }
  // 23/11 («5 s en blanco al abrir»): con copia guardada, una red colgada ya no retiene la página (ESPERA_DE_LA_PAGINA_MS).
  {
    const sw = arrancar()
    await sw.guardar(SHELL, '/', 'PORTADA', 'text/html')
    sw.estado.red = () => new Promise(() => {})
    const t0 = Date.now()
    const x = await sw.pedir('/', { mode: 'navigate' })
    r.colgadaConCopia = { cuerpo: x.cuerpo, ms: Date.now() - t0 }
  }
  {
    const sw = arrancar()
    await sw.guardar(SHELL, '/', 'PORTADA_VIEJA', 'text/html')
    sw.estado.red = async () => new Response('<html>NUEVA', { status: 200, headers: { 'content-type': 'text/html' } })
    r.redRapidaConCopia = (await sw.pedir('/', { mode: 'navigate' })).cuerpo
  }
  {
    const sw = arrancar()
    sw.estado.red = () => new Promise((res) => setTimeout(() => res(new Response('<html>RED', { status: 200, headers: { 'content-type': 'text/html' } })), 1500))
    const t0 = Date.now()
    const x = await sw.pedir('/', { mode: 'navigate' })
    r.sinCopiaLenta = { cuerpo: x.cuerpo, ms: Date.now() - t0 }
  }
  {
    // La red sigue por detrás y deja la página nueva guardada para la próxima apertura.
    const sw = arrancar()
    await sw.guardar(SHELL, '/', 'PORTADA_VIEJA', 'text/html')
    sw.estado.red = () => new Promise((res) => setTimeout(() => res(new Response('<html>NUEVA', { status: 200, headers: { 'content-type': 'text/html' } })), 1500))
    r.lentaConCopia = (await sw.pedir('/', { mode: 'navigate' })).cuerpo
    await new Promise((res) => setTimeout(res, 1000))
    r.guardadaDespues = await (await sw.abrir(SHELL).match(peticion('/'))).text()
  }
  return r
}

;(async () => {
  const salida = {
    instalacion: await instalacion(),
    activacion: await activacion(),
    mensajes: await mensajes(),
    shell: await shell(),
    sinInterceptar: await sinInterceptar(),
    edificios: await edificios(),
    teselas: await teselas(),
    avatares: await avatares(),
    indice: await indice(),
    indiceViejo: await indiceViejo(),
    navegacion: await navegacion(),
  }
  process.stdout.write(JSON.stringify(salida) + '\n', () => process.exit(0))
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
