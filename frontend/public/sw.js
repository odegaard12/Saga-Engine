/**
 * Nombre FIJO a propósito.
 *
 * Llevaba la versión dentro, y el servidor se la reescribía en cada
 * despliegue. Eso significaba estrenar caché vacía y tirar la anterior a la
 * vez: quien abriera la aplicación sin cobertura justo después de un
 * despliegue se quedaba sin nada. Los ficheros llevan su hash en la URL, así
 * que dos versiones conviven aquí sin pisarse.
 */
const CACHE_NAME = 'saga-player-shell'
const TILE_CACHE_NAME = 'saga-route-tile-coverage-v3.9.6'
const FIELD_PROOF_ASSET_CACHE = 'saga-field-proof-assets-v3.9.6'

const DEFAULT_SHELL_URL = '/'
const CORE_URLS = [DEFAULT_SHELL_URL, '/manifest.webmanifest', '/sw.js', '/saga-app-icon.svg', '/saga-app-icon-180.png', '/saga-app-icon-192.png', '/saga-app-icon-512.png', '/apple-touch-icon.png', '/apple-touch-icon-precomposed.png', '/saga-header-mark.svg']

function shouldBypass(url) {
  return (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/admin') ||
    url.pathname.startsWith('/admin-react')
  )
}

function isShellAsset(url) {
  return (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/player/') ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/sw.js' ||
    url.pathname === '/service-worker.js' ||
    url.pathname === '/saga-app-icon.svg' ||
    url.pathname === '/apple-touch-icon-precomposed.png' ||
    url.pathname === '/apple-touch-icon.png' ||
    url.pathname === '/saga-app-icon-180.png' ||
    url.pathname === '/saga-app-icon-192.png' ||
    url.pathname === '/saga-app-icon-512.png' ||
    url.pathname === '/saga-header-mark.svg' ||
    url.pathname === '/favicon.ico'
  )
}

async function putCache(request, response) {
  if (!response || (!response.ok && response.type !== 'opaque')) return response
  const cache = await caches.open(CACHE_NAME)
  await cache.put(request, response.clone())
  return response
}

const MATCH_OPTIONS = { ignoreSearch: true, ignoreMethod: true, ignoreVary: true };

async function cacheFirst(request) {
  const cached = await caches.match(request, MATCH_OPTIONS)
  if (cached) return cached
  const response = await fetch(request)
  await putCache(request, response)
  return response
}

async function putCustomCache(cacheName, request, response) {
  if (!response || (!response.ok && response.type !== 'opaque')) return response
  const cache = await caches.open(cacheName)
  await cache.put(request, response.clone())
  return response
}

async function customCacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request, MATCH_OPTIONS)
  if (cached) {
    console.log(`[SW] Cache HIT [${cacheName}]:`, request.url)
    return cached
  }
  console.log(`[SW] Cache MISS [${cacheName}]:`, request.url)
  const response = await fetch(request)
  await putCustomCache(cacheName, request, response)
  return response
}

async function fetchWithTimeout(request, timeoutMs = 2500) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(request, { signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
  }
}

async function networkFirst(request) {
  try {
    const response = await fetchWithTimeout(request)

    if (esCaidaDelServidor(response)) {
      const guardada = await caches.match(request, MATCH_OPTIONS)
      if (guardada) return guardada
      return response
    }

    await putCache(request, response)
    return response
  } catch {
    return (
      (await caches.match(request, MATCH_OPTIONS)) ||
      (await caches.match(DEFAULT_SHELL_URL, MATCH_OPTIONS)) ||
      new Response('SAGA offline shell is not cached yet. Open SAGA online once and press Prepare offline.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    )
  }
}

/**
 * Un 5xx del servidor cuenta como "no hay servidor".
 *
 * Con la Raspberry caída, Cloudflare devuelve su propia página de error 502.
 * Para el service worker eso es una respuesta correcta —la petición no falla—,
 * así que se la pasaba tal cual al jugador: en vez del juego descargado salía
 * "Bad gateway". Justo el caso para el que existe el modo offline.
 */
function esCaidaDelServidor(response) {
  return Boolean(response) && response.status >= 500 && response.status <= 599
}

async function navigationNetworkFirst(request) {
  try {
    const response = await fetchWithTimeout(
      request,
      5000,
    )

    if (esCaidaDelServidor(response)) {
      const guardada =
        (await caches.match(request, MATCH_OPTIONS)) ||
        (await caches.match(DEFAULT_SHELL_URL, MATCH_OPTIONS))
      if (guardada) return guardada
      return response
    }

    await putCache(request, response)
    return response
  } catch {
    return (
      (await caches.match(request, MATCH_OPTIONS)) ||
      (await caches.match(DEFAULT_SHELL_URL, MATCH_OPTIONS)) ||
      new Response(
        'SAGA offline shell is not cached yet.',
        {
          status: 503,
          headers: {
            'Content-Type':
              'text/plain; charset=utf-8',
          },
        },
      )
    )
  }
}

async function cacheUrls(urls) {
  const cache = await caches.open(CACHE_NAME)

  await Promise.all(
    urls.map(async (url) => {
      try {
        const request = new Request(url, { method: 'GET', credentials: 'same-origin' })
        const parsed = new URL(request.url)
        if (parsed.origin !== self.location.origin) return
        if (shouldBypass(parsed)) return

        const response = await fetch(request)
        if (response.ok) {
          await cache.put(request, response.clone())
        }
      } catch {
        // Best-effort cache warmup.
      }
    })
  )
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.all(CORE_URLS.map((url) => cache.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting())
  )
})

/**
 * Al activarse: primero MUDAR, y sólo después tirar la caché vieja.
 *
 * Aquí se borraba de golpe cualquier caché de shell que no fuera la de esta
 * versión. Como el nombre llevaba la versión dentro, cada despliegue estrenaba
 * caché vacía y tiraba la anterior en el mismo instante. Con red no se nota:
 * se vuelve a bajar todo. Sin red —un jugador que abre la aplicación en el
 * aparcamiento el día después de un despliegue— se queda literalmente sin
 * aplicación, con la anterior ya borrada y la nueva sin llenar.
 *
 * Ahora el nombre es fijo. Los ficheros de la aplicación llevan su hash en la
 * URL, así que dos versiones pueden convivir en la misma caché sin pisarse y
 * ya no hace falta vaciarla para estrenar. Lo que quede de las cachés viejas se
 * copia antes de borrarlas, y si la copia falla no se borra nada: es preferible
 * gastar unos megas de más a dejar a alguien sin juego en el monte.
 */
async function mudarCachesViejas() {
  const nombres = await caches.keys()
  const viejas = nombres.filter(
    (n) => n.startsWith('saga-player-shell-v') && n !== CACHE_NAME
  )

  if (!viejas.length) return

  const destino = await caches.open(CACHE_NAME)

  for (const nombre of viejas) {
    try {
      const origen = await caches.open(nombre)
      const claves = await origen.keys()

      for (const peticion of claves) {
        // Lo que ya está no se pisa: lo de la caché nueva es más reciente.
        if (await destino.match(peticion, MATCH_OPTIONS)) continue
        const respuesta = await origen.match(peticion)
        if (respuesta) await destino.put(peticion, respuesta)
      }

      await caches.delete(nombre)
    } catch {
      // Se queda donde está. Ocupa, pero no deja a nadie sin aplicación.
    }
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    mudarCachesViejas()
      .catch(() => undefined)
      .then(() =>
        caches.keys().then((keys) =>
          Promise.all(
            keys
              .filter((key) => {
                // Las teselas y las fotos siguen su propio ciclo: cuestan mucho
                // de descargar y no cambian entre versiones.
                if (key.startsWith('saga-route-tile-coverage-') && key !== TILE_CACHE_NAME) return true
                if (key.startsWith('saga-field-proof-assets-') && key !== FIELD_PROOF_ASSET_CACHE) return true
                return false
              })
              .map((key) => caches.delete(key))
          )
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('message', (event) => {
  const data = event.data || {}

  // La app pide tomar el control cuando detecta que hay un worker esperando.
  // El skipWaiting del install no siempre basta: se ha visto quedarse en
  // 'waiting' con el viejo al mando, y el jugador seguía con la versión antigua.
  if (data.type === 'SAGA_SKIP_WAITING') {
    self.skipWaiting()
    return
  }

  if (data.type !== 'SAGA_CACHE_PLAYER_SHELL') return
  const urls = Array.isArray(data.urls) ? data.urls : []
  event.waitUntil(cacheUrls(urls))
})

/* ------------------------------------------------------------------ *
 * El ultimo eslabon: vaciar la cola con la aplicacion CERRADA.
 *
 * Con la pantalla apagada y la pagina viva la cola ya sube sola (4.9.10).
 * Pero si Android CONGELA la pestania -la aplicacion en segundo plano un rato
 * largo- ahi no corre nada: ni el ciclo de 30 s ni ningun temporizador. El
 * jugador acaba la ruta, guarda el movil, y su ultimo nodo puede no llegar
 * nunca. Background Sync es lo unico que despierta al service worker cuando
 * vuelve la red aunque la pagina no este abierta.
 *
 * POR QUE ES SEGURO TENER DOS CAMINOS HACIA /api/events/sync: porque el
 * servidor aguanta que le llegue lo mismo dos veces o lo de una partida ya
 * borrada, y las dos cosas estan verificadas contra produccion:
 *
 *     client_event_id      duplicados -> se contestan como duplicados
 *     stale_before_reset   anterior a un reinicio -> se ignora
 *
 * Sin esos dos candados esto seria una forma nueva de contar dos veces.
 *
 * ALCANCE: Background Sync es de Chromium (Chrome y Edge en Android). En iOS no
 * existe. Cubre a la mayoria, no a todos, y por eso el ciclo de 30 s de la
 * aplicacion se queda donde esta: esto se SUMA, no sustituye.
 * ------------------------------------------------------------------ */

const ETIQUETA_COLA = 'saga-cola-offline'
const BASE_OFFLINE = 'saga-engine-offline-v1'
const ALMACEN_COLA = 'event_queue'

function abrirBaseOffline() {
  return new Promise((resolve, reject) => {
    // Sin numero de version a proposito: si se abre con uno mas alto se
    // dispararia una migracion desde aqui, y quien crea el esquema es la
    // aplicacion, no el service worker.
    const peticion = indexedDB.open(BASE_OFFLINE)
    peticion.onsuccess = () => resolve(peticion.result)
    peticion.onerror = () => reject(peticion.error)
  })
}

function leerPendientes(db) {
  return new Promise((resolve) => {
    if (!db.objectStoreNames.contains(ALMACEN_COLA)) {
      resolve([])
      return
    }
    const peticion = db.transaction(ALMACEN_COLA).objectStore(ALMACEN_COLA).getAll()
    peticion.onsuccess = () => {
      const filas = peticion.result || []
      resolve(
        filas
          .filter((fila) => fila && fila.status !== 'synced')
          // El orden ES el progreso del jugador: el servidor aplica los avances
          // segun le llegan.
          .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      )
    }
    peticion.onerror = () => resolve([])
  })
}

function marcarSubidos(db, ids) {
  return new Promise((resolve) => {
    if (!ids.length || !db.objectStoreNames.contains(ALMACEN_COLA)) {
      resolve()
      return
    }
    const tx = db.transaction(ALMACEN_COLA, 'readwrite')
    const almacen = tx.objectStore(ALMACEN_COLA)
    ids.forEach((id) => {
      const lectura = almacen.get(id)
      lectura.onsuccess = () => {
        const fila = lectura.result
        if (fila) almacen.put({ ...fila, status: 'synced' })
      }
    })
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

function aFormatoDeEnvio(evento) {
  return {
    client_event_id: evento.id,
    type: evento.type,
    source: evento.source || 'offline_queue',
    team_id: evento.team_id,
    node_id: evento.node_id,
    payload: {
      ...(evento.payload || {}),
      local_event_id: evento.id,
      // Esta fecha es la que deja al servidor distinguir un avance de la
      // partida de ahora de uno de una partida ya reiniciada. Sin ella, el
      // candado del reinicio no puede hacer su trabajo.
      local_created_at: evento.created_at,
      retry_count: evento.retry_count,
      // Para poder ver en el registro del servidor que vino por aqui.
      via: 'background_sync',
    },
  }
}

async function vaciarColaEnSegundoPlano() {
  const db = await abrirBaseOffline()
  try {
    const pendientes = await leerPendientes(db)
    if (!pendientes.length) return

    // Cada jugador, su peticion: el endpoint recibe un `user` y este movil
    // podria tener cola de mas de uno si se cambio de jugador.
    const porJugador = new Map()
    pendientes.forEach((evento) => {
      const quen = evento.user
      if (!quen) return
      if (!porJugador.has(quen)) porJugador.set(quen, [])
      porJugador.get(quen).push(evento)
    })

    for (const [quen, eventos] of porJugador) {
      const response = await fetch('/api/events/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // El endpoint exige pase de jugador; sin cookie son 403.
        credentials: 'include',
        body: JSON.stringify({ user: quen, events: eventos.map(aFormatoDeEnvio) }),
      })

      // Si no lo acepta NO se marca nada: marcarlo antes de tiempo perderia el
      // avance para siempre. Al lanzar, el navegador reintenta el sync solo.
      if (!response.ok) {
        throw new Error('el servidor no acepto la cola: ' + response.status)
      }

      await marcarSubidos(db, eventos.map((evento) => evento.id))
    }
  } finally {
    db.close()
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag !== ETIQUETA_COLA) return
  event.waitUntil(vaciarColaEnSegundoPlano())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Map tiles are now served via a same-origin proxy (/map-tiles/...)
  if (url.pathname.startsWith('/map-tiles/')) {
    event.respondWith(customCacheFirst(TILE_CACHE_NAME, request))
    return
  }

  if (url.origin !== self.location.origin) return

  if (url.pathname.startsWith('/api/field-proofs/') && request.method === 'GET') {
    event.respondWith(customCacheFirst(FIELD_PROOF_ASSET_CACHE, request))
    return
  }

  /**
   * Fotos de los jugadores.
   *
   * Van por su propio endpoint en vez de dentro de la tabla de equipo, que se
   * pide cada 5 segundos. Se cachean como las fotos de ruta: se bajan una vez y
   * siguen ahí sin cobertura, así que en el monte las caras del equipo se ven
   * igual. La URL trae el hash de la imagen, así que cambiar una foto desde
   * administración genera otra URL y se baja sola.
   */
  if (url.pathname.startsWith('/api/player-avatar/') && request.method === 'GET') {
    event.respondWith(customCacheFirst(FIELD_PROOF_ASSET_CACHE, request))
    return
  }

  /**
   * La foto de un nodo.
   *
   * Mismo trato que los avatares: la URL trae la huella del contenido, asi que
   * se puede guardar y no caduca nunca; si la foto cambia, cambia la URL y se
   * baja sola. Esto es lo que permite que el mosaico del nodo final se juegue
   * sin cobertura ahora que la foto no viaja dentro del JSON de la partida.
   */
  if (url.pathname.startsWith('/media/nodo/')) {
    event.respondWith(customCacheFirst(FIELD_PROOF_ASSET_CACHE, request))
    return
  }

  if (shouldBypass(url)) return

  if (request.mode === 'navigate') {
    event.respondWith(navigationNetworkFirst(request))
    return
  }

  if (isShellAsset(url)) {
    event.respondWith(cacheFirst(request))
  }
})
