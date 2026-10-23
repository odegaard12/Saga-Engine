// Auditoría del 23/10/2026, app del jugador: la pantalla de error no deja al jugador sin app ni mapa sin red, y una
// IndexedDB que no contesta al abrir se corta y suelta el candado de la cola. Ejecuta los módulos TS tal cual
// (entorno_navegador.cjs) y vuelca en JSON lo que hacen; lo comprueba tests/test_auditoria_23_10_js.py.
'use strict'

const { crearEntorno } = require('./entorno_navegador.cjs')

const conTope = (promesa, ms) =>
  Promise.race([
    promesa.then(
      () => 'ok',
      () => 'fallo'
    ),
    new Promise((r) => setTimeout(() => r('colgada'), ms)),
  ])

/* 1. «Limpiar caché» sólo toca el armazón; sin red no se ofrece; la pila sólo con ?debug=1. */
async function pantallaDeError() {
  const e = crearEntorno()
  e.conReact = true
  let desregistros = 0
  e.sandbox.navigator.serviceWorker.getRegistrations = async () => [{ unregister: async () => (desregistros += 1) }]
  for (const nombre of ['saga-player-shell', 'saga-player-shell-v9', 'saga-route-tile-coverage-1', 'saga-fotos']) {
    await e.caches.open(nombre)
  }
  e.sandbox.location.href = 'https://saga.test/player/TEST'
  const eb = e.cargar('src/shared/ErrorBoundary.tsx')
  const { renderToStaticMarkup } = require(require.resolve('react-dom/server', {
    paths: [require('./entorno_navegador.cjs').FRONT],
  }))

  await eb.limpiarCacheDelArmazon()
  const quedan = await e.caches.keys()

  const pintar = () => {
    const b = new eb.ErrorBoundary({ surface: 'Prueba', children: null })
    b.state = { hasError: true, message: 'roto', stack: 'Error: roto\n    at secreto.tsx:1' }
    return renderToStaticMarkup(b.render())
  }
  const conRed = pintar()
  e.sandbox.navigator.onLine = false
  const sinRed = pintar()
  const puedeSinRed = eb.puedeLimpiarCache()
  e.sandbox.navigator.onLine = true
  e.sandbox.location.href = 'https://saga.test/player/TEST?debug=1'
  const conDebug = pintar()

  return {
    quedan,
    desregistros,
    puedeSinRed,
    conRedOfreceLimpiar: conRed.includes('Limpiar caché'),
    sinRedOfreceLimpiar: sinRed.includes('Limpiar caché'),
    sinRedOfreceRecargar: sinRed.includes('Recargar'),
    sinRedExplicaCobertura: sinRed.includes('cobertura'),
    pilaSinDebug: conRed.includes('secreto.tsx'),
    pilaConDebug: conDebug.includes('secreto.tsx'),
  }
}

/* 6. Una apertura que no contesta se corta, se reintenta una vez y suelta el candado `sincronizando`. */
async function aperturaColgada() {
  const salida = {}

  // Nunca contesta: la sincronización termina (falla) y la siguiente vuelve a intentarlo, no se queda bloqueada.
  {
    const e = crearEntorno()
    let aperturas = 0
    e.sandbox.indexedDB.open = () => {
      aperturas += 1
      return {}
    }
    const mp = e.cargar('src/player/offline/missionPack.ts')
    salida.primera = await conTope(mp.syncPendingOfflineEvents('A'), 4000)
    salida.aperturasPrimera = aperturas
    salida.segunda = await conTope(mp.syncPendingOfflineEvents('A'), 4000)
    salida.aperturasSegunda = aperturas
  }

  // La primera no contesta y la segunda sí: el reintento salva la escritura, y la base atiende `versionchange`.
  {
    const e = crearEntorno()
    const original = e.sandbox.indexedDB.open.bind(e.sandbox.indexedDB)
    let aperturas = 0
    let base = null
    e.sandbox.indexedDB.open = (...args) => {
      aperturas += 1
      if (aperturas === 1) return {}
      const req = original(...args)
      const exito = () => req.__onsuccess && req.__onsuccess()
      Object.defineProperty(req, 'onsuccess', {
        set(fn) {
          req.__onsuccess = fn
        },
        get() {
          return () => {
            base = req.result
            exito()
          }
        },
      })
      return req
    }
    const mp = e.cargar('src/player/offline/missionPack.ts')
    salida.reintento = await conTope(mp.queueOfflineEvent({ user: 'A', type: 'node_completed', payload: {} }), 4000)
    salida.enCola = await mp.contarPendientes('A')
    salida.atiendeVersionchange = Boolean(base && typeof base.onversionchange === 'function')
  }

  return salida
}

async function main() {
  const salida = {}
  const casos = { pantallaDeError, aperturaColgada }
  for (const [nombre, fn] of Object.entries(casos)) {
    try {
      salida[nombre] = await fn()
    } catch (error) {
      salida[nombre] = { __error: String((error && error.stack) || error) }
    }
  }
  process.stdout.write(JSON.stringify(salida))
  process.exit(0)
}

main()
