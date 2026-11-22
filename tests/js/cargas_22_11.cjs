// Cargas 22/11: cómo pide la pantalla de carga los ficheros de la app (caché HTTP en la primera ronda, cabecera que el
// service worker deja pasar). Imprime un JSON que comprueba tests/test_cargas_22_11.py.
'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')
const { ServidorFalso } = require('./servidor_falso.cjs')

;(async () => {
  const e = crearEntorno()
  const srv = new ServidorFalso()
  srv.archivos = ['/assets/index-aaaaaaaa.js', '/assets/avatares/Ch01.dddddddd.glb']
  const vistos = []
  e.servidor = (url, init) => {
    const h = new Headers((init && init.headers) || {})
    vistos.push({ ruta: url.pathname, cache: init && init.cache, carga: h.get('X-Saga-Carga') })
    return srv.manejar(url, init)
  }
  const pwa = e.cargar('src/player/offline/pwaShell.ts')
  const res = {
    modos: {
      asset0: pwa.modoDeCache('/assets/index-aaaaaaaa.js', 0),
      asset1: pwa.modoDeCache('/assets/index-aaaaaaaa.js', 1),
      pagina0: pwa.modoDeCache('/player/TEST', 0),
      raiz0: pwa.modoDeCache('/', 0),
    },
  }
  const informe = await pwa.descargarPaquetesDelJugador('/player/TEST')
  res.completo = informe.completo
  res.vistos = vistos.filter((v) => v.ruta !== '/player-precache.json')

  // Pantalla apagada o sin red: no se puede bajar; la espera acaba al volver (o al cancelar).
  const pet = e.cargar('src/player/offline/peticiones.ts')
  const sb = e.sandbox
  res.sePuede = { visible: pet.noSePuedeBajarAhora() }
  sb.document.visibilityState = 'hidden'
  res.sePuede.oculta = pet.noSePuedeBajarAhora()
  let fin = false
  const espera = pet.esperarAQueSePuedaBajar(() => false, 5).then(() => (fin = true))
  await new Promise((r) => setTimeout(r, 40))
  res.sePuede.esperaConOculta = !fin
  sb.document.visibilityState = 'visible'
  sb.navigator.onLine = false
  res.sePuede.sinRed = pet.noSePuedeBajarAhora()
  await new Promise((r) => setTimeout(r, 40))
  res.sePuede.esperaSinRed = !fin
  sb.navigator.onLine = true
  await espera
  res.sePuede.terminaAlVolver = fin
  res.sePuede.cancelada = await Promise.race([
    (async () => {
      sb.navigator.onLine = false
      await pet.esperarAQueSePuedaBajar(() => true, 5)
      sb.navigator.onLine = true
      return true
    })(),
    new Promise((r) => setTimeout(() => r(false), 500)),
  ])
  console.log(JSON.stringify(res))
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
