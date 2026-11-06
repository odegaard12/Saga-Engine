// 5/11/2026 («se va la luz en casa»): con la ruta guardada, abrir la app no espera los 15 s de un servidor colgado.
// Ejecuta conLimiteDeTiempo de src/player/offline/cargaCompleta.ts tal cual. Lo comprueba tests/test_caida_5_11.py.
'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')

async function main() {
  const m = crearEntorno().cargar('src/player/offline/cargaCompleta.ts')
  const colgada = new Promise(() => {})
  const t0 = Date.now()
  let error = null
  try {
    await m.conLimiteDeTiempo(colgada, 150)
  } catch (e) {
    error = { nombre: e && e.name, ms: Date.now() - t0 }
  }
  const rapida = await m.conLimiteDeTiempo(Promise.resolve('ok'), 150)
  let rechazo = null
  try {
    await m.conLimiteDeTiempo(Promise.reject(new Error('HTTP 530')), 150)
  } catch (e) {
    rechazo = e.message
  }
  process.stdout.write(JSON.stringify({ error, rapida, rechazo, espera: m.ESPERA_CON_RUTA_GUARDADA_MS }))
}
main().catch((e) => {
  process.stdout.write(JSON.stringify({ __error: String(e && e.stack) }))
})
