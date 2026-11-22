// «Precalentar mapa para la partida» (panel) contra la descarga de verdad del móvil.
// Un móvil sin nada guardado baja el mapa (prefetchMissionMapTiles) y se apuntan las URL GET de sus lotes; luego se
// piden las del panel (urlsDeLotesDelPlan) en el mismo mundo. Imprime las dos listas: tests/test_precalentar_mapa.py
// comprueba que son la misma, en el mismo orden y byte a byte (Cloudflare guarda por URL).
'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')

const nodos = JSON.parse(require('fs').readFileSync(0, 'utf8'))

async function main() {
  const e = crearEntorno()
  // Un lote con cada ruta pedida y sin datos (22/11: el móvil exige una entrada por ruta): sigue por GET y lo que falta
  // lo pide suelto (404 = no existe).
  const loteSinDatos = (lista) => {
    const partes = [Buffer.from('SAGT'), Buffer.alloc(4)]
    partes[1].writeUInt32LE(lista.length)
    for (const ruta of lista) {
      const r = Buffer.from(ruta)
      const largo = Buffer.alloc(2)
      largo.writeUInt16LE(r.length)
      partes.push(largo, r, Buffer.alloc(2), Buffer.alloc(4))
    }
    return Buffer.concat(partes)
  }
  e.servidor = async (url) =>
    url.pathname.startsWith('/api/teselas/lote/')
      ? new Response(loteSinDatos(String(url.searchParams.get('t') || '').split(',').filter(Boolean)), {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      : new Response('', { status: 404 })
  const mapa = e.cargar('src/player/offline/mapTileCache.ts')
  mapa.fijarVersionDelMapa3d('v3d1', { relieve: '', teselas: 't1' })
  await mapa.prefetchMissionMapTiles(nodos, undefined, { redDeCaminos: false })
  const movil = e.peticiones
    .filter((p) => p.metodo === 'GET' && p.ruta.startsWith('/api/teselas/lote/'))
    .map((p) => p.ruta + p.busqueda)
  const panel = mapa.urlsDeLotesDelPlan(nodos)
  process.stdout.write(JSON.stringify({ movil, panel }))
}

main().catch((error) => {
  process.stderr.write(String((error && error.stack) || error))
  process.exit(1)
})
