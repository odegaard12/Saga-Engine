// 24/11/2026: recibos de los avances aceptados y su reposición tras un salto de la VIP (missionPack.ts). Ejecuta el
// módulo TS tal cual contra el servidor de mentira y vuelca en JSON lo que pasa; lo comprueba
// tests/test_recibos_tras_salto_de_vip.py.
'use strict'

const vm = require('vm')
const { crearEntorno } = require('./entorno_navegador.cjs')
const { ServidorFalso } = require('./servidor_falso.cjs')

async function saltoDeVip() {
  const e = crearEntorno()
  const srv = new ServidorFalso()
  e.servidor = (url, init) => srv.manejar(url, init)
  vm.runInContext('(() => { const real = Date.now; globalThis.__salto = 0; Date.now = () => real() + globalThis.__salto })()', e.cargar.contexto)
  const pasar = (ms) => {
    e.sandbox.__salto += ms
  }
  const mp = e.cargar('src/player/offline/missionPack.ts')
  const avance = (nivel) => ({
    user: 'A',
    type: 'node_completed',
    node_id: String(101 + nivel),
    payload: { code: 'OK', level_before: nivel, level_after: nivel + 1 },
  })

  // En la titular: dos nodos sin cobertura que suben y se aplican, y uno en línea (su recibo lo guarda enviarCodigo).
  await mp.queueOfflineEvent(avance(0))
  await mp.queueOfflineEvent(avance(1))
  await mp.syncPendingOfflineEvents('A')
  const enLinea = {
    id: 'A:recibo:1:abc',
    type: 'node_completed',
    node_id: '103',
    created_at: '2026-11-24T10:00:00.000Z',
    payload: { code: 'OK', level_before: 2, level_after: 3 },
  }
  mp.guardarRecibo('A', enLinea)
  mp.guardarRecibo('A', enLinea) // dos veces el mismo: uno

  // Salto: la .103 tiene la réplica con el jugador en el nodo 1. El siguiente avance llega «por delante».
  srv.sincronizacion = (evento) =>
    evento.payload.level_before >= 3 ? { status: 'failed', error: 'behind', server_level: 1 } : { status: 'synced' }
  await mp.queueOfflineEvent(avance(3))
  pasar(120_000)
  const primera = await mp.syncPendingOfflineEvents('A')
  const enCola = (await mp.getQueuedOfflineEvents('A')).map((ev) => [ev.payload.level_before, ev.id, ev.created_at])
  // Cada recibo se repone una vez: otro «voy por detrás» desde el mismo nivel no los vuelve a meter.
  const otraVez = await mp.reponerRecibos('A', 1)

  // La vuelta siguiente: suben los repuestos (desde el nodo 1) con el que estaba atascado, y el servidor los acepta.
  srv.sincronizacion = () => ({ status: 'synced' })
  pasar(120_000)
  const segunda = await mp.syncPendingOfflineEvents('A')
  const ultimo = srv.cuerposDeSync[srv.cuerposDeSync.length - 1]

  return {
    primera: { synced: primera.synced, failed: primera.failed },
    enCola,
    idOriginalDelNodo1: srv.cuerposDeSync[0].events[1].client_event_id,
    segunda: { synced: segunda.synced, failed: segunda.failed },
    subidos: ultimo.events.map((ev) => [ev.payload.level_before, ev.payload.local_created_at === enLinea.created_at]),
    pendientes: (await mp.getQueuedOfflineEvents('A')).length,
    otraVez,
    trasOlvidar: (mp.olvidarRecibos('A'), e.local.getItem('saga:recibos:A')),
  }
}

async function main() {
  const salida = {}
  for (const [nombre, fn] of Object.entries({ saltoDeVip })) {
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
