// Revisión del 19/10/2026, lado del móvil: caja negra, reloj del nodo, mochila tras un reinicio, tienda y paquete
// en partida. Ejecuta los módulos TS tal cual (entorno_navegador.cjs) y vuelca en JSON lo que hacen; lo comprueba
// tests/test_caja_negra_js.py.
'use strict'

const vm = require('vm')
const { crearEntorno } = require('./entorno_navegador.cjs')

function json(cuerpo, estado = 200) {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'content-type': 'application/json' } })
}

/** Relojes controlables: `pared` adelanta la hora del sistema; `interno` es performance.now(). */
function relojes(e) {
  vm.runInContext('globalThis.__pared = 0; const __n = Date.now; Date.now = () => __n() + globalThis.__pared', e.sandbox)
  e.sandbox.__interno = 1000
  e.sandbox.performance = { now: () => e.sandbox.__interno }
  return {
    pasar(paredMs, internoMs = paredMs) {
      e.sandbox.__pared += paredMs
      e.sandbox.__interno += internoMs
    },
    visibilidad(estado) {
      e.sandbox.document.visibilityState = estado
      for (const [tipo, fn] of e.eventosDeDocumento) if (tipo === 'visibilitychange') fn()
    },
  }
}

const entradas = (e, u) => JSON.parse(e.local.getItem('saga:bitacora:' + u) || '{"entradas":[]}').entradas

/* La caja negra: anota, sube, sólo olvida lo aceptado; cierre inesperado con su caída; hora atrasada fuera. */
async function cajaNegra() {
  const e = crearEntorno()
  const r = relojes(e)
  const recibidos = []
  let aceptar = true
  e.servidor = (url, init) => {
    if (url.pathname !== '/api/bitacora') return null
    if (!aceptar) return json({ detail: 'x' }, 503)
    const cuerpo = JSON.parse(init.body)
    recibidos.push(cuerpo)
    return json({ status: 'ok', aceptadas: cuerpo.entries.length })
  }
  const b = e.cargar('src/player/registro/bitacora.ts')
  b.instalarBitacora('A', '9.9.9')
  b.ponerNodo('n1')
  b.anotar('hoja')
  b.retoEnMarcha(true)
  b.falloDeReto()
  b.retoEnMarcha(false)
  b.falloDeReto() // sin reto en marcha: no cuenta
  aceptar = false
  await b.subir(true)
  const trasFallo = entradas(e, 'A').length
  aceptar = true
  await b.subir(true)
  const enviados = recibidos.length ? recibidos[0].entries.map((x) => x.k) : []
  const quedan = entradas(e, 'A').length

  // Hora atrasada mientras estaba fuera de la app: el interno avanza 10 min, el sistema nada.
  r.visibilidad('hidden')
  r.pasar(0, 10 * 60_000)
  r.visibilidad('visible')
  await b.subir(true)
  const tiposA = recibidos.flatMap((x) => x.entries.map((y) => y.k))

  // Un móvil que sólo durmió (el sistema avanza, el interno no) NO es sospecha.
  const e2 = crearEntorno()
  const r2 = relojes(e2)
  const b2 = e2.cargar('src/player/registro/bitacora.ts')
  b2.instalarBitacora('C')
  r2.visibilidad('hidden')
  r2.pasar(30 * 60_000, 0)
  r2.visibilidad('visible')
  b2.anotar('hoja')
  const tiposC = entradas(e2, 'C').map((x) => x.k)

  // Cierre inesperado: la app murió con un nodo abierto y el último pulso fue hace 90 s.
  e.local.setItem('saga:bitacora-abierta:B', '1')
  e.local.setItem('saga:bitacora-pulso:B', String(Date.now() - 90_000))
  b.instalarBitacora('B')
  const inicioB = entradas(e, 'B').find((x) => x.k === 'inicio')

  return { trasFallo, enviados, quedan, tiposA, tiposC, inicioB: inicioB && inicioB.d }
}

/* El reloj del nodo: no salta con la hora del sistema, pero SÍ cuenta lo que el móvil durmió. */
function relojDelNodo() {
  const e = crearEntorno()
  const r = relojes(e)
  const c = e.cargar('src/player/nodeClock.ts')
  c.abrirNodo('A', '7')
  r.pasar(60_000) // un minuto normal
  const unMinuto = c.tiempoDelNodo('A', '7')
  r.pasar(3_600_000, 0) // la hora del sistema salta una hora con la app a la vista (corrección de red)
  const trasSalto = c.tiempoDelNodo('A', '7')
  r.visibilidad('hidden')
  r.pasar(5 * 60_000, 0) // pantalla bloqueada 5 min: el interno se para
  r.visibilidad('visible')
  const trasDormir = c.tiempoDelNodo('A', '7')
  return { unMinuto, trasSalto, trasDormir, abierto: c.nodoAbierto('A', '7'), otro: c.nodoAbierto('A', '8') }
}

/* La mochila tras un reinicio: se vacía UNA vez por marca, aunque el reloj del móvil vaya atrasado. */
function mochilaTrasReinicio() {
  const e = crearEntorno()
  const inv = e.cargar('src/player/offline/inventory.ts')
  const reinicio = Date.now()
  const objeto = { item_id: 'llave', label: 'Llave', quantity: 1, state: 'collected', updated_at: new Date().toISOString() }
  const guardar = (haceMs) =>
    e.local.setItem(
      'saga:inventory:A',
      JSON.stringify({ user: 'A', updated_at: new Date(Date.now() - haceMs).toISOString(), items: [objeto] })
    )
  guardar(60_000) // de antes del reinicio
  inv.hydrateInventoryFromServer('A', { reset_at: reinicio, items: [] })
  const trasPrimera = inv.loadInventorySnapshot('A').items.length
  // Recoge algo después del reinicio, pero con el reloj del móvil 10 min atrasado.
  guardar(10 * 60_000)
  inv.hydrateInventoryFromServer('A', { reset_at: reinicio, items: [] })
  const trasSegunda = inv.loadInventorySnapshot('A').items.length
  // Un reinicio NUEVO sí vacía.
  inv.hydrateInventoryFromServer('A', { reset_at: reinicio + 5, items: [] })
  const trasNuevo = inv.loadInventorySnapshot('A').items.length
  return { trasPrimera, trasSegunda, trasNuevo }
}

/* Tienda: una pieza sin ganar (409 «bloqueado») no borra el personaje; «avatar taken» sí lo suelta. */
async function tienda() {
  const e = crearEntorno()
  let respuesta = () => json({ detail: 'bloqueado' }, 409)
  e.servidor = (url) => (url.pathname === '/api/personaje' ? respuesta() : null)
  const p = e.cargar('src/player/avatares/elegirPersonaje.ts')
  e.local.setItem('saga:personaje:A', 'exploradora')
  e.local.setItem('saga:avatar:A', JSON.stringify({ character: 'exploradora', parts: { mx: 'Ch22' } }))
  e.local.setItem('saga:personaje-pendiente:A', '1')
  const okBloqueado = await p.reintentarPendiente('A')
  const sigueLocal = Boolean(p.avatarLocal('A'))
  const pendienteTrasBloqueado = p.hayPendiente('A')
  respuesta = () => json({ detail: 'avatar taken' }, 409)
  e.local.setItem('saga:personaje-pendiente:A', '1')
  await p.reintentarPendiente('A')
  return { okBloqueado, sigueLocal, pendienteTrasBloqueado, trasOcupado: Boolean(p.avatarLocal('A')) }
}

/* En partida, una misión cambiada en el panel NO baja el paquete: sigue con lo guardado y deja la revisión vieja. */
async function paqueteEnPartida() {
  const e = crearEntorno()
  const ms = e.cargar('src/player/offline/missionSync.ts')
  const mp = e.cargar('src/player/offline/missionPack.ts')
  const nodo = (id) => ({ id, title: 'N' + id, lat: 40, lon: -3, minigame: { type: 'x', config: { completo: true } } })
  await mp.saveMissionPack({
    user: 'A',
    config: { site_name: 'x' },
    payload: { user: 'A', level: 1, stages: [nodo(1), nodo(2)], stages_rev: 'H1', mission_revision: 'R1' },
    mission_revision: 'R1',
  })
  e.servidor = (url) => {
    if (url.pathname !== '/api/game/A') return null
    if (url.search.includes('offline_pack')) {
      return json({ user: 'A', level: 1, stages: [nodo(1), nodo(2)], mission_revision: 'R2' })
    }
    return json({ user: 'A', level: 1, stages: [{ id: 1 }, { id: 2 }], stages_rev: 'H2', mission_revision: 'R2' })
  }
  const marca = e.peticiones.length
  const enPartida = await ms.pedirPartidaCompleta('A', { enPartida: true })
  const paquetesEnPartida = e.peticiones.slice(marca).filter((p) => p.busqueda.includes('offline_pack')).length
  const fuera = await ms.pedirPartidaCompleta('A')
  return {
    paquetesEnPartida,
    revisionEnPartida: enPartida.revision,
    cambiada: enPartida.misionCambiada,
    conJuego: Boolean(enPartida.payload.stages[1].minigame),
    bajoFuera: fuera.bajoElPaquete,
  }
}

async function main() {
  const salida = {}
  const casos = { cajaNegra, relojDelNodo, mochilaTrasReinicio, tienda, paqueteEnPartida }
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
