// 6.11.2 (B1 y B2 del ensayo de caos): ejecuta el TS del móvil. B1: cada evento de la cola lleva el desfase servidor-móvil
// de cuando se creó, sólo con una hora del servidor reciente y coherente. B2: el avance en línea gasta el objeto en la mochila.
'use strict'
const fs = require('fs')
const path = require('path')
const { crearEntorno, FRONT } = require('./entorno_navegador.cjs')

const H = 3600e3
const CLAVE = 'saga:reloj-del-servidor'

async function sello(muestra) {
  const e = crearEntorno()
  if (muestra) e.sandbox.localStorage.setItem(CLAVE, JSON.stringify(muestra(Date.now())))
  const mp = e.cargar('src/player/offline/missionPack.ts')
  await mp.queueOfflineEvent({ user: 'A', type: 'node_completed', payload: { code: 'OK' }, node_id: 1 })
  const [evento] = await mp.getQueuedOfflineEvents('A')
  return evento.payload.clock_offset_at_creation_ms ?? null
}

async function main() {
  const salida = {}
  try {
    salida.sinMuestra = await sello(null)
    salida.movilAtrasado2h = await sello((t) => ({ serverTimeMs: t + 2 * H, recibidoEnMs: t - 1000 }))
    salida.movilAdelantado2h = await sello((t) => ({ serverTimeMs: t - 2 * H, recibidoEnMs: t - 1000 }))
    salida.muestraVieja = await sello((t) => ({ serverTimeMs: t + 2 * H, recibidoEnMs: t - 2 * H }))
    salida.muestraDelFuturo = await sello((t) => ({ serverTimeMs: t + 2 * H, recibidoEnMs: t + 2 * H }))
    const fuente = fs.readFileSync(path.join(FRONT, 'src/player/avance/enviarCodigo.ts'), 'utf8')
    salida.avanceEnLineaGastaElObjeto = /requisito\?\.consume\) markInventoryItemUsed\(payload\.user, requisito\.itemId, requisito\.quantity\)\s*\n\s*anotar\('avance_ok'/.test(fuente)
  } catch (error) {
    salida.__error = String((error && error.stack) || error)
  }
  process.stdout.write(JSON.stringify(salida))
  process.exit(0)
}
main()
