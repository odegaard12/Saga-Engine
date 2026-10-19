// Revisión del 19/10/2026: sincronización y consumo de datos con mala cobertura. Ejecuta los módulos TS tal cual
// (entorno_navegador.cjs) y vuelca en JSON lo que hacen; lo comprueba tests/test_sincronizacion_19_10_js.py.
'use strict'

const zlib = require('zlib')
const { crearEntorno } = require('./entorno_navegador.cjs')

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

function json(cuerpo, estado = 200) {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'content-type': 'application/json' } })
}

/** El cuerpo de una petición, descomprimido si viene en gzip. */
async function leerCuerpo(init) {
  const cabeceras = init.headers || {}
  if (cabeceras['Content-Encoding'] === 'gzip') {
    return { gzip: true, datos: JSON.parse(zlib.gunzipSync(Buffer.from(await init.body.arrayBuffer())).toString()) }
  }
  return { gzip: false, datos: JSON.parse(String(init.body)) }
}

function servidorDeCola(recibidos) {
  return async (url, init) => {
    if (url.pathname !== '/api/events/sync') return null
    const { gzip, datos } = await leerCuerpo(init)
    recibidos.push({ gzip, eventos: datos.events.length, mochila: Boolean(datos.inventory_snapshot) })
    return json({
      status: 'ok',
      events: datos.events.map((ev) => ({ client_event_id: ev.client_event_id, status: 'synced' })),
    })
  }
}

const encolar = (mp, user = 'A', type = 'qr_scanned') => mp.queueOfflineEvent({ user, type, payload: { x: 1 } })

/* La cola sube comprimida con gzip si el navegador sabe, y entra igual. */
async function colaComprimida() {
  const e = crearEntorno()
  e.sandbox.CompressionStream = CompressionStream
  // El banco acorta los temporizadores largos a 200 ms; comprimir con la máquina cargada puede pasar de eso y cortar
  // la tanda por tiempo. Aquí se quiere ver la compresión, no el límite: temporizadores de verdad.
  e.sandbox.setTimeout = setTimeout
  const recibidos = []
  e.servidor = servidorDeCola(recibidos)
  const mp = e.cargar('src/player/offline/missionPack.ts')
  for (let i = 0; i < 3; i += 1) await encolar(mp)
  const r = await mp.syncPendingOfflineEvents('A')
  return { recibidos, subidos: r.synced, quedan: await mp.contarPendientes('A') }
}

/* Background Sync sólo sin cobertura o cuando la subida de la página falla, no en cada evento. */
async function syncDeFondo() {
  const e = crearEntorno()
  const registros = []
  e.sandbox.navigator.serviceWorker.ready = Promise.resolve({ sync: { register: async (t) => registros.push(t) } })
  const mp = e.cargar('src/player/offline/missionPack.ts')
  const red = e.cargar('src/player/offline/redEstado.ts')
  await encolar(mp)
  await esperar(20)
  const conRed = registros.length
  red.notarFalloDeRed()
  await encolar(mp)
  await esperar(20)
  const sinRed = registros.length
  red.olvidarEstadoDeRed()
  e.servidor = () => null // la subida no llega
  await mp.syncPendingOfflineEvents('A')
  await esperar(20)
  return { conRed, sinRed, trasFallo: registros.length }
}

/* Con el candado de la cola cogido (el SW subiendo) la página no sube; libre, sí. */
async function candadoDeLaCola() {
  const e = crearEntorno()
  const recibidos = []
  e.servidor = servidorDeCola(recibidos)
  const mp = e.cargar('src/player/offline/missionPack.ts')
  await encolar(mp)
  const pedidos = []
  e.sandbox.navigator.locks = {
    request: (nombre, opciones, fn) => {
      pedidos.push({ nombre, ifAvailable: opciones.ifAvailable })
      return fn(null)
    },
  }
  await mp.syncPendingOfflineEvents('A')
  const ocupado = { subidas: recibidos.length, quedan: await mp.contarPendientes('A') }
  e.sandbox.navigator.locks = { request: (nombre, opciones, fn) => fn({ name: nombre }) }
  await mp.syncPendingOfflineEvents('A')
  return { pedidos, ocupado, libre: { subidas: recibidos.length, quedan: await mp.contarPendientes('A') } }
}

/* Las fotos esperan a que suban los avances, y con «ahorro de datos» no salen. */
async function fotosTrasLosAvances() {
  const e = crearEntorno()
  const fotos = []
  let colaCae = true
  e.servidor = async (url, init) => {
    if (url.pathname === '/api/field-proofs') {
      fotos.push(1)
      return json({ status: 'ok' })
    }
    if (url.pathname === '/api/events/sync' && !colaCae) return servidorDeCola([])(url, init)
    return null
  }
  const mp = e.cargar('src/player/offline/missionPack.ts')
  const lf = e.cargar('src/player/offline/localFirst.ts')
  await encolar(mp, 'A', 'node_completed')
  await lf.saveOfflinePhoto({ user: 'A', image_data_url: 'data:image/jpeg;base64,QUJD', note: '' })
  await lf.flushOfflinePhotos('A')
  const conCola = fotos.length
  colaCae = false
  await mp.syncPendingOfflineEvents('A')
  e.sandbox.navigator.connection = { saveData: true }
  await lf.flushOfflinePhotos('A')
  const ahorro = fotos.length
  e.sandbox.navigator.connection = { effectiveType: '4g' }
  await lf.flushOfflinePhotos('A')
  return { conCola, ahorro, libre: fotos.length }
}

/* La mochila que viajó con la cola no vuelve a subir aparte. */
async function mochilaUnaVez() {
  const e = crearEntorno()
  const recibidos = []
  e.servidor = servidorDeCola(recibidos)
  const mp = e.cargar('src/player/offline/missionPack.ts')
  const lf = e.cargar('src/player/offline/localFirst.ts')
  const inv = e.cargar('src/player/offline/inventory.ts')
  inv.entregarUnaVez({ user: 'A', item_id: 'llave', label: 'Llave', quantity: 1, source: 'manual', node_id: '1', grant_id: 'g1' })
  await encolar(mp, 'A', 'node_completed')
  await lf.flushOfflineEvents('A')
  await esperar(50)
  return recibidos
}

function entornoDeAvance(payload, refrescarPartida) {
  const avisos = []
  return {
    avisos,
    entorno: {
      payload,
      currentStage: payload.current_stage,
      esColeccionable: false,
      claveDelNodo: String(payload.current_stage.id),
      candado: { current: false },
      setSubmitting() {},
      setSubmitError() {},
      cerrarHoja() {},
      sumarAlMarcador() {},
      ponerPartidaSinServidor() {},
      refrescarPartida,
      aviso(texto) {
        avisos.push(texto)
      },
      pantalla() {},
    },
  }
}

const partida = () => ({
  user: 'A',
  level: 1,
  stages: [{ id: 1 }, { id: 2 }, { id: 3 }],
  current_stage: { id: 2 },
})

/* Con nodos en cola el avance va directo al móvil: no espera a subir la cola (antes, hasta ~66 s). */
async function avanceConCola() {
  const e = crearEntorno()
  const pedidas = []
  e.servidor = (url) => {
    pedidas.push(url.pathname)
    return new Promise(() => {}) // la barra: ni contesta ni se corta
  }
  const mp = e.cargar('src/player/offline/missionPack.ts')
  const ec = e.cargar('src/player/avance/enviarCodigo.ts')
  await encolar(mp, 'A', 'node_completed')
  const { entorno } = entornoDeAvance(partida(), async () => partida())
  const r = await Promise.race([ec.enviarCodigo(entorno, { code: 'OK', timeSpentMs: 1000 }), esperar(1500).then(() => 'colgado')])
  return { r, avance: pedidas.includes('/api/advance'), enCola: await mp.contarAvancesPendentes('A') }
}

/* El éxito no espera a releer la partida: /api/advance ya dice si terminó. */
async function exitoSinReleer() {
  const e = crearEntorno()
  e.servidor = (url) =>
    url.pathname === '/api/advance' ? json({ status: 'ok', user: 'A', level: 2, finished: false }) : null
  const ec = e.cargar('src/player/avance/enviarCodigo.ts')
  const { entorno, avisos } = entornoDeAvance(partida(), () => new Promise(() => {}))
  const r = await Promise.race([ec.enviarCodigo(entorno, { code: 'OK', timeSpentMs: 1000 }), esperar(1500).then(() => 'colgado')])
  return { r, avisos }
}

/* La caja negra sube tras un latido bueno aunque estuviera esperando por un fallo. */
async function bitacoraTrasLatido() {
  const e = crearEntorno()
  let acepta = false
  const recibidos = []
  e.servidor = (url, init) => {
    if (url.pathname !== '/api/bitacora') return null
    if (!acepta) return null
    const cuerpo = JSON.parse(init.body)
    recibidos.push(cuerpo.entries.length)
    return json({ status: 'ok', aceptadas: cuerpo.entries.length })
  }
  const b = e.cargar('src/player/registro/bitacora.ts')
  b.instalarBitacora('A', '9.9.9')
  await b.subir(true)
  acepta = true
  await b.subir() // en espera tras el fallo: no sale
  const enEspera = recibidos.length
  b.trasLatidoBueno()
  await esperar(50)
  return { enEspera, trasLatido: recibidos.length }
}

async function main() {
  const salida = {}
  const casos = {
    colaComprimida,
    syncDeFondo,
    candadoDeLaCola,
    fotosTrasLosAvances,
    mochilaUnaVez,
    avanceConCola,
    exitoSinReleer,
    bitacoraTrasLatido,
  }
  for (const [nombre, fn] of Object.entries(casos)) {
    try {
      salida[nombre] = await fn()
    } catch (error) {
      salida[nombre] = { __error: String((error && error.stack) || error) }
    }
  }
  process.stdout.write(JSON.stringify(salida))
  process.exit(0)
}

main()
