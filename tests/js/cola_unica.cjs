// 21/11/2026: la cola sin red, una sola y por su puerta (frontend/src/player/offline/cola.ts). Ejecuta los módulos TS
// tal cual (entorno_navegador.cjs, con el cargador común cargarTs.cjs) contra el servidor de mentira
// (servidor_falso.cjs) y vuelca en JSON lo que pasa; lo comprueba tests/test_cola_unica_js.py.
'use strict'

const vm = require('vm')
const { crearEntorno } = require('./entorno_navegador.cjs')
const { ServidorFalso } = require('./servidor_falso.cjs')

/**
 * Un móvil con su servidor. `cortar(n)` decide, para la petición de sincronización n (desde 0), si se pierde la
 * respuesta (el servidor la recibe y la aplica, pero al móvil no le llega nada). El servidor de verdad no aplica dos
 * veces el mismo `client_event_id`; aquí se cuenta lo que aplicaría.
 */
function movil({ cortar = () => false, lento = 0 } = {}) {
  const e = crearEntorno()
  const srv = new ServidorFalso()
  const aplicados = []
  const vistos = new Set()
  let enVuelo = 0
  let maxEnVuelo = 0
  let n = 0
  e.servidor = async (url, init) => {
    if (url.pathname !== '/api/events/sync') return srv.manejar(url, init)
    const esta = n++
    enVuelo += 1
    maxEnVuelo = Math.max(maxEnVuelo, enVuelo)
    try {
      if (lento) await new Promise((r) => setImmediate(r))
      const respuesta = await srv.manejar(url, init)
      if (srv.sincronizacion !== 'cae') {
        for (const ev of JSON.parse(String(init.body)).events) {
          if (!vistos.has(ev.client_event_id)) {
            vistos.add(ev.client_event_id)
            aplicados.push(ev.client_event_id)
          }
        }
      }
      return cortar(esta) ? null : respuesta
    } finally {
      enVuelo -= 1
    }
  }
  // El reloj del módulo, para saltarse la espera tras un fallo (de 3 s a 1 min) sin esperarla.
  vm.runInContext('(() => { const real = Date.now; globalThis.__salto = 0; Date.now = () => real() + globalThis.__salto })()', e.cargar.contexto)
  const pasarTiempo = (ms) => {
    e.sandbox.__salto += ms
  }
  const cola = e.cargar('src/player/offline/cola.ts')
  const cuerpos = () => srv.cuerposDeSync.map((c) => c.events.map((ev) => ev.client_event_id))
  return { e, srv, cola, aplicados, cuerpos, pasarTiempo, maxEnVuelo: () => maxEnVuelo }
}

/* Sin red se guarda; al volver la red sube entero, en el orden en que se encoló, y la cola queda vacía. */
async function sinRedYAlVolver() {
  const m = movil()
  m.srv.sincronizacion = 'cae'
  await m.cola.encolar({ user: 'A', type: 'qr_scanned', payload: { code: 'Q1' }, node_id: '1' })
  await m.cola.encolar({ user: 'A', type: 'node_completed', payload: { code: 'OK' }, node_id: '1' })
  await m.cola.encolar({ user: 'A', type: 'item_collected', payload: { item: 'llave' }, node_id: '2' })
  const sinRed = await m.cola.subir('A')
  const pendientesSinRed = await m.cola.contarPendientes('A')
  const avancesSinRed = await m.cola.contarAvancesPendentes('A')

  m.srv.sincronizacion = 'acepta'
  m.pasarTiempo(120_000)
  const conRed = await m.cola.subir('A')
  const ultimo = m.srv.cuerposDeSync[m.srv.cuerposDeSync.length - 1]
  return {
    sinRed: { status: sinRed.status, pendientes: pendientesSinRed, avances: avancesSinRed },
    conRed: { status: conRed.status, synced: conRed.synced, pendientes: await m.cola.contarPendientes('A') },
    tipos: ultimo.events.map((ev) => ev.type),
    campos: Object.keys(ultimo.events[0]).sort(),
    mismosIds: JSON.stringify(m.cuerpos()[0]) === JSON.stringify(m.cuerpos()[1]),
  }
}

/* Dos subidas a la vez son una sola petición; y lo que se encola durante una subida sale en la siguiente, detrás. */
async function dosALaVez() {
  const m = movil({ lento: 1 })
  await m.cola.encolar({ user: 'A', type: 'node_completed', payload: { code: 'OK' }, node_id: '1' })
  await m.cola.encolar({ user: 'A', type: 'node_completed', payload: { code: 'OK' }, node_id: '2' })
  const [r1, r2] = await Promise.all([m.cola.subir('A'), m.cola.subir('A')])
  const aLaVez = { peticiones: m.srv.cuerposDeSync.length, mismoResultado: r1 === r2, synced: r1.synced }

  // Una en marcha, se encola otro y llegan dos llamadas más: van juntas a UNA siguiente, que sale al acabar la primera.
  await m.cola.encolar({ user: 'A', type: 'node_completed', payload: { code: 'OK' }, node_id: '3' })
  const primera = m.cola.subir('A')
  await m.cola.encolar({ user: 'A', type: 'node_completed', payload: { code: 'OK' }, node_id: '4' })
  const segunda = m.cola.subir('A')
  const tercera = m.cola.subir('A')
  const [a, b, c] = await Promise.all([primera, segunda, tercera])
  return {
    aLaVez,
    detras: {
      peticiones: m.srv.cuerposDeSync.length - aLaVez.peticiones,
      segundaYTerceraIguales: b === c,
      primeraDistinta: a !== b,
      nodos: m.srv.cuerposDeSync.slice(aLaVez.peticiones).map((cu) => cu.events.map((ev) => ev.node_id)),
      pendientes: await m.cola.contarPendientes('A'),
    },
    maxEnVuelo: m.maxEnVuelo(),
  }
}

/* Lo que un móvil ya instalado tuviera en la cola vieja de localStorage pasa una vez a la nueva, con su mismo id. */
async function migracion() {
  const m = movil()
  const vieja = {
    user: 'A',
    sync_status: 'error',
    updated_at: '2026-11-01T10:00:00.000Z',
    last_successful_sync_at: '2026-11-01T09:00:00.000Z',
    queued_events: [
      { client_event_id: 'evt_viejo_1', type: 'qr_scanned', user: 'A', node_id: '3', source: 'qr', payload: { code: 'Q3' }, created_at: '2026-11-01T09:30:00.000Z', attempts: 2 },
      { client_event_id: 'evt_viejo_2', type: 'manual_code', user: 'A', node_id: '3', source: 'manual', payload: { code: 'M3' }, created_at: '2026-11-01T09:31:00.000Z', attempts: 0 },
    ],
  }
  m.e.local.setItem('saga:offline:A', JSON.stringify(vieja))

  // Si IndexedDB no deja escribir, no se pierde nada: se queda en la vieja para la próxima.
  m.e.cuota.idbPutFalla = true
  const conFallo = await m.cola.contarPendientes('A')
  const viejaTrasFallo = JSON.parse(m.e.local.getItem('saga:offline:A')).queued_events.length
  m.e.cuota.idbPutFalla = false

  const pendientes = await m.cola.contarPendientes('A')
  const trasMudar = JSON.parse(m.e.local.getItem('saga:offline:A'))
  // Otra vez (otra llamada, otra pestaña de la misma sesión): no se duplica.
  const otraVez = await m.cola.contarPendientes('A')

  const r = await m.cola.subir('A')
  const enviado = m.srv.cuerposDeSync[0].events
  return {
    conFallo,
    viejaTrasFallo,
    pendientes,
    otraVez,
    viejaVacia: trasMudar.queued_events.length,
    restoIntacto: trasMudar.sync_status === 'error' && trasMudar.last_successful_sync_at === vieja.last_successful_sync_at,
    subida: { status: r.status, synced: r.synced, quedan: await m.cola.contarPendientes('A') },
    ids: enviado.map((ev) => ev.client_event_id),
    tipos: enviado.map((ev) => ev.type),
    marcados: enviado.every((ev) => ev.payload.mudado_de_la_cola_vieja === true && ev.payload.client_event_id === ev.client_event_id),
    codigos: enviado.map((ev) => ev.payload.code),
  }
}

/* El servidor aplica la tanda pero la respuesta se pierde: el móvil la reenvía con los mismos ids y no se duplica. */
async function respuestaPerdida() {
  const m = movil({ cortar: (n) => n === 0 })
  await m.cola.encolar({ user: 'A', type: 'node_completed', payload: { code: 'OK' }, node_id: '1' })
  await m.cola.encolar({ user: 'A', type: 'node_completed', payload: { code: 'OK' }, node_id: '2' })
  const perdida = await m.cola.subir('A')
  const pendientesTrasPerder = await m.cola.contarPendientes('A')
  m.pasarTiempo(120_000)
  const reenvio = await m.cola.subir('A')
  // Y una vuelta más con la cola ya vacía no manda nada.
  m.pasarTiempo(120_000)
  await m.cola.subir('A')
  const cuerpos = m.cuerpos()
  return {
    perdida: perdida.status,
    pendientesTrasPerder,
    reenvio: { status: reenvio.status, synced: reenvio.synced },
    peticiones: cuerpos.length,
    mismosIds: cuerpos.length === 2 && JSON.stringify(cuerpos[0]) === JSON.stringify(cuerpos[1]),
    aplicados: m.aplicados.length,
    quedan: await m.cola.contarPendientes('A'),
  }
}

async function main() {
  const salida = {}
  for (const [nombre, fn] of Object.entries({ sinRedYAlVolver, dosALaVez, migracion, respuestaPerdida })) {
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
