// 5/11/2026: un 530/502 de Cloudflare (la Pi no llega) cuenta como «sin cobertura»; un 200/404/500, como red.
// Ejecuta src/player/offline/redEstado.ts tal cual. Lo comprueba tests/test_caida_5_11.py.
'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')

const salida = {}
for (const estado of [200, 404, 500, 502, 530]) {
  const m = crearEntorno().cargar('src/player/offline/redEstado.ts')
  m.notarRespuesta(estado)
  salida[estado] = m.sinCoberturaAhora()
}
process.stdout.write(JSON.stringify(salida))
