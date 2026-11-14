// Arranque 14/11: el ORDEN de la descarga de la pantalla de carga (el motor del mapa y lo propio primero), con la lista intacta.
// Imprime un JSON que comprueba tests/test_arranque_14_11.py.
'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')
const { ServidorFalso } = require('./servidor_falso.cjs')

const ANIMS = '/assets/avatares/anims.aaaaaaaa.glb'
const PROPIO = '/assets/avatares/Ch02.bbbbbbbb.glb'
const AGARRE = '/assets/avatares/hold-Ch02.cccccccc.glb'
const LISTA = [
  '/assets/MapSurfaceGL-aaaaaaaa.js',
  '/assets/Mochila-aaaaaaaa.js',
  '/assets/avatares/Ch01.dddddddd.glb',
  AGARRE,
  '/assets/avatares/hold-Ch01.eeeeeeee.glb',
  PROPIO,
  ANIMS,
  '/assets/avatares/cara-Ch01.ffffffff.webp',
  '/assets/cargador-aaaaaaaa.js',
  '/assets/index-aaaaaaaa.js',
  '/assets/maplibre-gl-worker-aaaaaaaa.js',
  '/assets/vendor-maplibre-aaaaaaaa.js',
  '/assets/vendor-react-aaaaaaaa.js',
  '/assets/vendor-three-aaaaaaaa.js',
  '/saga-app-icon-512.png',
  '/apple-touch-icon-precomposed.png',
]

;(async () => {
  const e = crearEntorno()
  const srv = new ServidorFalso()
  srv.archivos = LISTA.filter((r) => r.startsWith('/assets/') || r.endsWith('.png'))
  const iconos = new Set(['/saga-app-icon-512.png', '/apple-touch-icon-precomposed.png'])
  e.servidor = (url, init) => (iconos.has(new URL(url, 'http://x').pathname) ? new Response('png', { status: 200, headers: { 'content-type': 'image/png' } }) : srv.manejar(url, init))
  const pwa = e.cargar('src/player/offline/pwaShell.ts')
  const res = {}

  // Funcion pura: mismo conjunto, grupos en orden, estable dentro de cada grupo
  const ord = pwa.ordenarPendientes(LISTA, [ANIMS, PROPIO, AGARRE])
  res.mismoConjunto = JSON.stringify([...ord].sort()) === JSON.stringify([...LISTA].sort()) && ord.length === LISTA.length
  res.orden = ord
  res.sinPrimeros = pwa.ordenarPendientes(LISTA)
  res.prioridades = Object.fromEntries(LISTA.map((r) => [r, pwa.prioridadDeDescarga(r, new Set([ANIMS, PROPIO, AGARRE]))]))

  // Descarga completa simulada: las peticiones salen en ese orden
  const informe = await pwa.descargarPaquetesDelJugador('/player/TEST', undefined, { primeros: [ANIMS, PROPIO, AGARRE] })
  res.informe = { completo: informe.completo, faltan: informe.faltan, sinEspacio: informe.sinEspacio }
  res.pedidos = e.peticiones.map((p) => p.ruta).filter((r) => r.startsWith('/assets/') || r.endsWith('.png'))
  res.guardados = e.caches.contenido('saga-player-shell').filter((r) => r.startsWith('/assets/') || r.endsWith('.png')).sort()
  console.log(JSON.stringify(res))
})().catch((error) => { console.error(error); process.exit(1) })
