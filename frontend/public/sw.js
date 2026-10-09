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
const TILE_CACHE_NAME = 'saga-route-tile-coverage-v5.55-terrarium'
const FIELD_PROOF_ASSET_CACHE = 'saga-field-proof-assets-v3.9.6'
// La red de caminos, aparte de las teselas: cambia cuando se reconstruye en
// el panel (v2: con la clase de cada vía) sin obligar a bajar el mapa entero.
const ROAD_GRAPH_CACHE = 'saga-road-graph-v2'

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

/**
 * `ignoreSearch` es a propósito, y se ha revisado ruta por ruta (05/10):
 *  - los paquetes de /assets/ llevan el hash en el NOMBRE, no en la query;
 *  - los iconos se piden con `?v=redondo` / `?v=182-icono-redondo` y se guardan
 *    sin query al instalar: sin ignoreSearch el icono de la pantalla de carga
 *    salía roto sin cobertura;
 *  - la página del jugador se abre con `?depurar-mapa=1` u otros parámetros y
 *    tiene que casar con la copia guardada de `/player/NOMBRE`.
 * Lo ÚNICO que lleva la versión en la query son las fotos de perfil
 * (`/api/player-avatar/…?v=huella`), y esas buscan CON la query (ver abajo).
 */
const MATCH_OPTIONS = { ignoreSearch: true, ignoreMethod: true, ignoreVary: true };

async function cacheFirst(request) {
  const cached = await caches.match(request, MATCH_OPTIONS)
  if (cached) return cached
  const response = await fetch(request)
  await putCache(request, response)
  return response
}

/**
 * ¿Esta respuesta merece quedarse guardada?
 *
 * Se guardaba lo que fuera con tal de que no fuese un error de red: un 429 del
 * proxy o un 502 de Cloudflare con cuerpo de imagen rota se quedaban como tesela
 * "buena" para siempre (y las respuestas opacas ni se podían mirar). Ahora cada
 * clase de recurso dice qué es una respuesta válida, y lo demás pasa de largo
 * sin guardarse: se vuelve a pedir la próxima vez.
 */
function tipoDe(response) {
  return String(response.headers.get('content-type') || '').toLowerCase()
}

function esTeselaValida(response) {
  // Una imagen, o un binario sin más; nunca la página de error de un proxy.
  return response.ok && (tipoDe(response).startsWith('image/') || tipoDe(response).includes('octet-stream'))
}

function esJsonValido(response) {
  return response.ok && tipoDe(response).includes('json')
}

// Fotos (de campo, de nodo, avatares): un éxito que no sea la página de salida.
function esFotoValida(response) {
  return response.ok && !tipoDe(response).includes('text/html')
}

function esFotoDeCampo(ruta) {
  return /^\/api\/field-proofs\/[^/]+\/(?:thumb|image)$/.test(ruta)
}

async function putCustomCache(cacheName, request, response, esValida) {
  const valida = esValida
    ? Boolean(response) && esValida(response)
    : Boolean(response) && (response.ok || response.type === 'opaque')
  if (!valida) return response
  const cache = await caches.open(cacheName)
  await cache.put(request, response.clone())
  return response
}

/**
 * Primero lo guardado, y si no está, red y guardar (sólo si vale).
 *
 * `opciones.buscar` cambia cómo se busca en la caché: los avatares llevan su
 * versión en `?v=`, y con `ignoreSearch` una foto cambiada nunca se refrescaba
 * porque la vieja seguía casando.
 */
async function customCacheFirst(cacheName, request, opciones) {
  const cache = await caches.open(cacheName)
  const buscar = (opciones && opciones.buscar) || MATCH_OPTIONS
  const cached = await cache.match(request, buscar)
  if (cached) {
    console.log(`[SW] Cache HIT [${cacheName}]:`, request.url)
    return cached
  }
  console.log(`[SW] Cache MISS [${cacheName}]:`, request.url)
  const response = await fetch(request)
  await putCustomCache(cacheName, request, response, opciones && opciones.esValida)
  return response
}

async function edificiosRedPrimero(request) {
  const cache = await caches.open(TILE_CACHE_NAME)
  try {
    const response = await fetchWithTimeout(request, 4000)
    if (esJsonValido(response)) {
      await cache.put(request, response.clone())
      return response
    }
  } catch (error) {
    // Sin red: lo guardado.
  }
  const guardada = await cache.match(request, MATCH_OPTIONS)
  if (guardada) return guardada
  return new Response('{"type":"FeatureCollection","features":[]}', {
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Lo que lleva versión en la URL (`?v=`, el relieve y los edificios del mapa 3D):
 * primero la copia de ESA versión; si no está, la red; y sin red, la de cualquier
 * otra versión.
 *
 * Con `ignoreSearch` un relieve rehecho en el panel no llegaba nunca: la tesela
 * vieja casaba con la URL nueva. Y sin el último paso, el móvil que aún no ha
 * bajado la versión nueva se quedaba sin cobertura con el monte plano teniendo
 * el viejo guardado. Sin nada guardado, `vacio()` si se da (los edificios).
 */
async function versionadoPrimero(cacheName, request, esValida, vacio) {
  const cache = await caches.open(cacheName)
  const exacta = await cache.match(request, { ignoreMethod: true, ignoreVary: true })
  if (exacta) return exacta
  try {
    const response = await fetch(request)
    if (esValida(response)) {
      await cache.put(request, response.clone())
      return response
    }
    if (response.status === 404) return response
  } catch {
    // Sin red: abajo.
  }
  const otraVersion = await cache.match(request, MATCH_OPTIONS)
  if (otraVersion) return otraVersion
  if (vacio) return vacio()
  return new Response('', { status: 504 })
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

/**
 * Instalación MÍNIMA: sólo lo imprescindible para que la aplicación abra.
 *
 * Aquí se bajaban en segundo plano TODOS los paquetes del jugador (mapa,
 * minijuegos, paneles), sin pantalla y sin que nadie lo viera. Esa descarga vive
 * ahora en la pantalla de carga de la aplicación (parte «App»), que enseña el
 * progreso, comprueba el resultado y avisa si algo no cabe. Un worker nuevo,
 * que se instala en plena partida, ya no baja nada por su cuenta.
 */
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
                if (key.startsWith('saga-road-graph-') && key !== ROAD_GRAPH_CACHE) return true
                return false
              })
              .map((key) => caches.delete(key))
          )
        )
      )
      // La red vivía en la caché de teselas hasta la v2: fuera de ahí.
      .then(() =>
        caches
          .open(TILE_CACHE_NAME)
          .then((cache) => cache.delete('/api/road-graph', MATCH_OPTIONS))
          .catch(() => undefined)
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

  // (Antes aquí llegaba `SAGA_CACHE_PLAYER_SHELL`: la app pedía al worker que
  // bajara sus paquetes. Ahora los baja ella misma, con barra de progreso.)
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
          // segun le llegan. Manda `seq` (crece siempre); la hora del movil se
          // corrige al volver la cobertura y no sirve para ordenar.
          .sort(
            (a, b) =>
              (a.seq || 0) - (b.seq || 0) || String(a.created_at).localeCompare(String(b.created_at)),
          )
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

// Igual que en la aplicacion (missionPack.ts): un rechazo definitivo no se
// reintenta jamas, y una tanda no pasa de 50 para no chocar con el tope del
// servidor (400 y la cola atascada para siempre).
const RECHAZOS_DEFINITIVOS = [
  'invalid_completion_code',
  'missing_required_item',
  'mission_already_complete',
  'already_advanced',
]
const TANDA_DE_ENVIO = 50

function aceptado(respuestaDelEvento) {
  if (!respuestaDelEvento) return false
  if (respuestaDelEvento.duplicate === true) return true
  const estado = String(respuestaDelEvento.status || '').toLowerCase()
  if (['pending', 'synced', 'ok', 'applied', 'ignored'].includes(estado)) return true
  const motivo = String(respuestaDelEvento.error || '').toLowerCase()
  return RECHAZOS_DEFINITIVOS.some((rechazo) => motivo.includes(rechazo))
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

    let hayRechazados = false

    for (const [quen, eventos] of porJugador) {
      for (let desde = 0; desde < eventos.length; desde += TANDA_DE_ENVIO) {
        const tanda = eventos.slice(desde, desde + TANDA_DE_ENVIO)

        const response = await fetch('/api/events/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // El endpoint exige pase de jugador; sin cookie son 403.
          credentials: 'include',
          // `client_sent_at_ms`: la hora del móvil al enviar (contrato 7), para que
          // el servidor pueda corregir las horas de los eventos de la cola.
          body: JSON.stringify({
            user: quen,
            events: tanda.map(aFormatoDeEnvio),
            client_sent_at_ms: Date.now(),
          }),
        })

        // Si no lo acepta NO se marca nada: marcarlo antes de tiempo perderia el
        // avance para siempre. Al lanzar, el navegador reintenta el sync solo.
        if (!response.ok) {
          throw new Error('el servidor no acepto la cola: ' + response.status)
        }

        // Un 200 NO quiere decir que todos los eventos entraron: el servidor
        // contesta por cada uno, y uno rechazado por algo pasajero (la mision
        // aun no ha empezado, por ejemplo) hay que dejarlo para otro intento.
        // Antes se marcaba TODO como subido con solo ver el 200.
        const cuerpo = await response.json().catch(() => ({}))
        const respuestas = Array.isArray(cuerpo.events) ? cuerpo.events : []
        const porIdCliente = new Map(
          respuestas.filter((r) => r && r.client_event_id).map((r) => [String(r.client_event_id), r]),
        )

        const subidos = []
        tanda.forEach((evento, indice) => {
          const suya = porIdCliente.get(evento.id) || respuestas[indice]
          if (aceptado(suya)) subidos.push(evento.id)
          else hayRechazados = true
        })

        await marcarSubidos(db, subidos)
      }
    }

    if (hayRechazados) throw new Error('quedan eventos sin aceptar: se reintenta')
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

  /**
   * Teselas de imagen Y de elevación, las dos desde la caché primero.
   *
   * Aquí sólo estaban las de imagen. Sin red, el mapa 3D pedía la
   * elevación (/dem-tiles/), el service worker la dejaba pasar a la red,
   * la red no estaba, y el monte salía PLANO: "sin cobertura era otro
   * mapa, no tenía el mismo desnivel". Las teselas de imagen sí llegaban,
   * lo que lo hacía aún más raro. Es la misma caché en la que la pantalla
   * de carga las guarda.
   */
  // La red de caminos va con las teselas: misma caché, mismo "primero lo
  // guardado", para que la guía redirija por carreteras sin cobertura.
  if (url.pathname === '/api/road-graph') {
    event.respondWith(customCacheFirst(ROAD_GRAPH_CACHE, request, { esValida: esJsonValido }))
    return
  }

  // Los edificios del mapa 3D: red primero (el panel puede volver a preparar la
  // zona) con poco tiempo de espera, y sin red lo guardado con el paquete. Si no
  // hay nada, una colección vacía: el mapa sigue sin casas, sin errores.
  if (url.pathname === '/api/edificios') {
    // Con versión (5.53): primero lo guardado de esa versión, sin pedir red al jugar.
    if (url.searchParams.has('v')) {
      event.respondWith(
        versionadoPrimero(TILE_CACHE_NAME, request, esJsonValido, () =>
          new Response('{"type":"FeatureCollection","features":[]}', {
            headers: { 'Content-Type': 'application/json' },
          })
        )
      )
      return
    }
    event.respondWith(edificiosRedPrimero(request))
    return
  }

  // Satélite de Esri del conmutador de diagnóstico `?mapa=esri`: siempre de la red, nunca a la caché del mapa.
  if (url.pathname.startsWith('/map-tiles/esri/')) return

  if (url.pathname.startsWith('/dem-tiles/') && url.searchParams.has('v')) {
    event.respondWith(versionadoPrimero(TILE_CACHE_NAME, request, esTeselaValida))
    return
  }

  if (
    url.pathname.startsWith('/map-tiles/') ||
    url.pathname.startsWith('/dem-tiles/')
  ) {
    event.respondWith(customCacheFirst(TILE_CACHE_NAME, request, { esValida: esTeselaValida }))
    return
  }

  if (url.origin !== self.location.origin) return

  /**
   * Fotos de campo: SÓLO la miniatura y la foto. Aquí entraba todo
   * `/api/field-proofs/*`, también el zip de `/download` (todas las fotos de la
   * ruta, decenas de megas) que se quedaba guardado en el móvil para siempre.
   * Las fotos borradas o purgadas las quita la app de esta caché al llegar la
   * lista nueva (`olvidarFotosRetiradas`).
   */
  if (esFotoDeCampo(url.pathname)) {
    event.respondWith(customCacheFirst(FIELD_PROOF_ASSET_CACHE, request, { esValida: esFotoValida }))
    return
  }

  /**
   * Fotos de los jugadores.
   *
   * Van por su propio endpoint en vez de dentro de la tabla de equipo, que se
   * pide cada 5 segundos. Se cachean como las fotos de ruta: se bajan una vez y
   * siguen ahí sin cobertura, así que en el monte las caras del equipo se ven
   * igual.
   *
   * La versión de la foto va en `?v=`, así que aquí se busca CON la query: con
   * `ignoreSearch` una foto cambiada desde administración nunca se refrescaba,
   * porque la copia vieja seguía casando con la URL nueva.
   */
  if (url.pathname.startsWith('/api/player-avatar/') && request.method === 'GET') {
    event.respondWith(
      customCacheFirst(FIELD_PROOF_ASSET_CACHE, request, {
        buscar: { ignoreMethod: true, ignoreVary: true },
        esValida: esFotoValida,
      })
    )
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
    event.respondWith(customCacheFirst(FIELD_PROOF_ASSET_CACHE, request, { esValida: esFotoValida }))
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
