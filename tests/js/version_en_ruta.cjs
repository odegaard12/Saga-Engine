// 30/10: el vigilante de versión arranca ANTES de que la pantalla del jugador cargue la partida. Con la ruta a medias
// no puede bajar la versión nueva por no saberlo aún. Imprime un JSON que comprueba tests/test_revision_offline_30_10.py.
'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')
const { ServidorFalso } = require('./servidor_falso.cjs')

const pausa = (ms) => new Promise((r) => setTimeout(r, ms))

async function caso(enRuta) {
  const e = crearEntorno()
  const srv = new ServidorFalso()
  srv.versionDeLaApp = '2.0.0' // el servidor va por delante del bundle
  e.servidor = (url, init) => srv.manejar(url, init)
  const guardia = e.cargar('src/shared/versionGuard.ts')
  const seguro = e.cargar('src/player/offline/recargaSegura.ts')
  const vigilando = guardia.vixiarVersion()
  // La pantalla del jugador monta y carga la partida un rato después.
  await pausa(30)
  seguro.registrarEnRuta(() => enRuta)
  seguro.marcarRutaConocida()
  await vigilando
  return e.peticiones.map((p) => p.ruta)
}

;(async () => {
  console.log(JSON.stringify({ enRuta: await caso(true), sinEmpezar: await caso(false) }))
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
