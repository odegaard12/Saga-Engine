// 06/11: la comprobación final tras actualizar no puede decir «Falta por bajar: app N» con todo bajado. El service
// worker sirve la página VIEJA mientras la carga baja la versión nueva y guarda su lista. Imprime un JSON que comprueba
// tests/test_resumen_tras_actualizar_6_11.py.
'use strict'
const { crearEntorno, ORIGEN } = require('./entorno_navegador.cjs')

const NUEVA = ['/assets/index-nueva.js', '/assets/Mapa-nuevo.js']

async function caso({ paginaEs, guardadaEs, nuevaGuardada = true }) {
  const e = crearEntorno()
  const shell = e.cargar('src/player/offline/pwaShell.ts')
  const cache = await e.caches.open('saga-player-shell')
  const pon = (ruta, tipo = 'application/javascript') => cache.put(ruta, new Response('x', { headers: { 'content-type': tipo } }))
  // La página guardada (la que se abrirá la próxima vez): la carga la guarda la última, con sus paquetes ya dentro.
  for (const r of ['/', '/player/SIM_01']) await cache.put(r, new Response(`<script type="module" src="/assets/index-${guardadaEs}.js"></script>`, { headers: { 'content-type': 'text/html' } }))
  await pon('/manifest.webmanifest', 'application/manifest+json')
  for (const r of ['/assets/index-vieja.js', '/assets/Mapa-viejo.js']) await pon(r)
  if (nuevaGuardada) for (const r of NUEVA) await pon(r)
  // La copia de la lista que guardó la carga hace un momento: la de la versión NUEVA.
  await cache.put('/player-precache.json', new Response(JSON.stringify({ files: NUEVA }), { headers: { 'content-type': 'application/json' } }))
  e.sandbox.document.querySelectorAll = (sel) => (sel.startsWith('script') ? [{ src: `${ORIGEN}/assets/index-${paginaEs}.js` }] : [])
  e.servidor = null // sin red: la comprobación final no pide nada (soloCopia)
  const r = await shell.verificarPaquetesDelJugador('/player/SIM_01', { soloCopia: true })
  return r.faltan
}

;(async () => {
  console.log(
    JSON.stringify({
      // Óscar: corre la vieja; la nueva bajada entera y guardada su página.
      paginaViejaConTodoBajado: await caso({ paginaEs: 'vieja', guardadaEs: 'nueva' }),
      // La nueva sin bajar: la página guardada sigue siendo la vieja.
      nuevaSinBajar: await caso({ paginaEs: 'vieja', guardadaEs: 'vieja', nuevaGuardada: false }),
      // Guarda del 01/11: el service worker guardó un HTML de otra versión y la copia de la lista es de antes.
      htmlDeOtraVersion: await caso({ paginaEs: 'otra', guardadaEs: 'otra' }),
      paginaNueva: await caso({ paginaEs: 'nueva', guardadaEs: 'nueva' }),
    })
  )
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
