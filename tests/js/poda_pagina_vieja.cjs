// 01/11: la poda de paquetes viejos no puede borrar los trozos que aún usa la página en marcha. Imprime un JSON que
// comprueba tests/test_revision_offline_30_10.py.
'use strict'
const { crearEntorno, ORIGEN } = require('./entorno_navegador.cjs')

async function caso(paginaEs) {
  const e = crearEntorno()
  const shell = e.cargar('src/player/offline/pwaShell.ts')
  const cache = await e.caches.open('saga-player-shell')
  const pon = (ruta) => cache.put(ruta, new Response('x', { headers: { 'content-type': 'application/javascript' } }))
  for (const r of ['/assets/index-vieja.js', '/assets/Mapa-viejo.js', '/assets/Ranking-viejo.js', '/assets/index-nueva.js', '/assets/Mapa-nuevo.js']) await pon(r)
  e.sandbox.document.querySelectorAll = (sel) => (sel.startsWith('script') ? [{ src: `${ORIGEN}/assets/index-${paginaEs}.js` }] : [])
  await shell.podarPaquetesViejos(cache, ['/assets/index-nueva.js', '/assets/Mapa-nuevo.js'])
  return e.caches.contenido('saga-player-shell').sort()
}

;(async () => {
  console.log(JSON.stringify({ paginaVieja: await caso('vieja'), paginaNueva: await caso('nueva') }))
})().catch((error) => { console.error(error); process.exit(1) })
