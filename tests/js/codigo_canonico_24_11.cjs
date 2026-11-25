// 24/11/2026: el código o la respuesta escritos a mano, sin tildes ni espacios, en el móvil (missionPack.ts) igual que
// en el servidor. Recibe por SAGA_CANON un JSON {textos: [...], nodo: {...}, intentos: [...]}; lo comprueba
// tests/test_codigo_con_tildes_y_espacios.py.
'use strict'

const { crearEntorno } = require('./entorno_navegador.cjs')

async function main() {
  const entrada = JSON.parse(process.env.SAGA_CANON || '{}')
  const e = crearEntorno()
  const mp = e.cargar('src/player/offline/missionPack.ts')
  const salida = { canonicos: entrada.textos.map((t) => mp.codigoCanonico(t)), sinRed: {} }
  for (const intento of entrada.intentos) {
    const r = await mp.advanceLocalProgress({
      payload: { user: 'A', level: 0, stages: [entrada.nodo] },
      currentStage: entrada.nodo,
      code: intento,
      aMano: true,
    })
    salida.sinRed[intento] = r.ok
  }
  process.stdout.write(JSON.stringify(salida))
  process.exit(0)
}

main().catch((error) => {
  process.stdout.write(JSON.stringify({ __error: String((error && error.stack) || error) }))
  process.exit(0)
})
