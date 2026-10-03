import { esErrorDeCuota } from './almacenamiento'
import { fetchConLimite } from './peticiones'
import { recargarCuandoSeaSeguro } from './recargaSegura'

/**
 * Nombre FIJO, el mismo que usa public/sw.js.
 *
 * Llevaba la versión del build dentro, así que cada despliegue estrenaba caché
 * vacía y el service worker tiraba la anterior en el mismo instante. Con red no
 * se nota. Sin red —abrir la aplicación en el aparcamiento el día después de un
 * despliegue— dejaba al jugador sin aplicación: la vieja borrada y la nueva sin
 * llenar. Los ficheros llevan su hash en la URL, así que dos versiones conviven
 * aquí sin pisarse.
 */
const PLAYER_SHELL_CACHE = 'saga-player-shell'

/** La caché de teselas, que va por su cuenta. Igual que en public/sw.js. */
const TILE_CACHE_NAME = 'saga-route-tile-coverage-v3.9.6'

/** La de fotos de campo y avatares. Igual que en public/sw.js. */
const FIELD_PROOF_CACHE_NAME = 'saga-field-proof-assets-v3.9.6'

/**
 * Tira las cachés de SAGA que ya no usa nadie.
 *
 * La limpieza del service worker sólo corre al instalarse uno nuevo, y eso no
 * siempre pasa. Medido en el móvil: quedaban 1161 teselas duplicadas de una
 * versión antigua además de las actuales. En un teléfono justo de espacio el
 * navegador acaba tirando cachés enteras —incluida la buena— y el jugador se
 * queda sin mapa en el monte.
 *
 * ⚠️ Las viejas del shell NO se tocan aquí: de mudarlas se encarga el service
 * worker al activarse, copiando antes de borrar. Borrarlas desde aquí sería
 * volver al fallo de dejar a alguien sin aplicación.
 */
export async function purgeStaleCaches(): Promise<number> {
  if (typeof window === 'undefined' || !('caches' in window)) return 0

  try {
    const nombres = await caches.keys()

    const sobran = nombres.filter((nombre) => {
      if (!nombre.startsWith('saga-')) return false
      if (nombre === PLAYER_SHELL_CACHE) return false
      if (nombre === TILE_CACHE_NAME) return false
      if (nombre === FIELD_PROOF_CACHE_NAME) return false
      // Las del shell con versión las muda el service worker.
      if (nombre.startsWith('saga-player-shell')) return false
      return true
    })

    await Promise.all(sobran.map((nombre) => caches.delete(nombre)))
    return sobran.length
  } catch {
    return 0
  }
}

let registroEnCurso: Promise<ServiceWorkerRegistration | null> | null = null

/**
 * Registra el service worker. Una vez por página, llámese desde donde se llame:
 * cada llamada de más añadía otro escuchador de `controllerchange`.
 */
export async function registerPlayerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!registroEnCurso) {
    registroEnCurso = registrar().then((registro) => {
      // Si no salió (sin worker, sin red al registrar) se puede volver a probar.
      if (!registro) registroEnCurso = null
      return registro
    })
  }
  return registroEnCurso
}

async function registrar(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined') return null
  if (!('serviceWorker' in navigator)) return null

  const hadController = Boolean(navigator.serviceWorker.controller)

  const reloadKey = `${PLAYER_SHELL_CACHE}:controller-reload`

  if (hadController) {
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        try {
          if (window.sessionStorage.getItem(reloadKey) === '1') {
            return
          }

          try {
            window.sessionStorage.setItem(reloadKey, '1')
          } catch (e) {
            console.warn('Storage quota exceeded', e)
          }
        } catch {
          // Reload still works when sessionStorage is unavailable.
        }

        /**
         * Un worker nuevo tomó el control: la versión nueva se aplica cuando
         * no estorbe.
         *
         * Aquí se recargaba EN EL ACTO. Al desplegar, cada móvil con la
         * aplicación abierta se recargaba a la vez, a mitad de minijuego, con
         * el intento perdido. Ahora se espera a que la aplicación pase a
         * segundo plano y no haya nada abierto; si eso no ocurre, la versión
         * nueva llega en el siguiente arranque, que es lo que pasaría igual.
         * Los ficheros llevan su hash y conviven en la caché, así que la
         * página vieja sigue funcionando mientras tanto.
         */
        recargarCuandoSeaSeguro({ soloOculta: true })
      },
      { once: true }
    )
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    })

    // La comprobación de si hay un worker nuevo pide sw.js a la red: con la
    // cobertura justa puede quedarse colgada, y no puede retener a quien espera a
    // que la aplicación se registre (la descarga de la pantalla de carga).
    await Promise.race([
      registration.update().catch(() => undefined),
      new Promise<void>((resolver) => window.setTimeout(resolver, 4000)),
    ])

    /**
     * Un service worker nuevo puede quedarse ESPERANDO indefinidamente.
     *
     * Aunque el propio worker llama a skipWaiting al instalarse, se ha visto
     * quedarse en 'waiting' con el viejo todavía al mando: el jugador seguía con
     * la versión anterior aunque el servidor ya tuviese otra, y sólo cambiaba
     * cerrando todas las pestañas. Un despliegue el día del evento no llegaría
     * a los móviles que ya tuviesen la app abierta.
     *
     * Aquí se le manda tomar el control, y se repite cuando aparezca uno nuevo.
     */
    const activarSiEspera = () => {
      registration.waiting?.postMessage({ type: 'SAGA_SKIP_WAITING' })
    }

    activarSiEspera()

    registration.addEventListener('updatefound', () => {
      const entrante = registration.installing
      if (!entrante) return
      entrante.addEventListener('statechange', () => {
        if (entrante.state === 'installed') activarSiEspera()
      })
    })

    // Se hace aquí, en cada arranque, y no sólo al instalar un service worker
    // nuevo: es la única forma de que las cachés viejas desaparezcan de verdad.
    void purgeStaleCaches()

    return registration
  } catch {
    // Offline shell is best-effort; mission data remains local.
    return null
  }
}

/**
 * Espera a que haya un service worker activo, pero no para siempre.
 *
 * `serviceWorker.ready` no resuelve nunca si el registro falla (un 404 en
 * sw.js, un contexto no seguro): esperarlo a pelo dejaba colgada la descarga
 * de la aplicación entera.
 */
async function waitForServiceWorkerReady(limiteMs = 5000): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined') return null
  if (!('serviceWorker' in navigator)) return null

  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolver) => window.setTimeout(() => resolver(null), limiteMs)),
    ])
  } catch {
    return null
  }
}

function sameOriginPath(value: string): string | null {
  try {
    const url = new URL(value, window.location.origin)
    if (url.origin !== window.location.origin) return null
    return `${url.pathname}${url.search}`
  } catch {
    return null
  }
}

function collectShellUrls(playerUrl: string): string[] {
  const urls = new Set<string>([
    sameOriginPath(playerUrl) || '/',
    '/manifest.webmanifest',
    // Aquí se precargaban opencv.js (11 MB) y su worker, que era lo más pesado
    // que tenía que bajarse un jugador antes de salir al monte. El lector nuevo
    // va dentro del propio paquete de la aplicación.
  ])

  document.querySelectorAll<HTMLScriptElement>('script[src]').forEach((script) => {
    const path = sameOriginPath(script.src)
    if (path) urls.add(path)
  })

  document.querySelectorAll<HTMLLinkElement>('link[href]').forEach((link) => {
    const rel = String(link.rel || '').toLowerCase()
    if (!['stylesheet', 'icon', 'manifest', 'apple-touch-icon'].includes(rel)) return
    const path = sameOriginPath(link.href)
    if (path) urls.add(path)
  })

  return Array.from(urls)
}

/**
 * Dónde se guarda, dentro de la caché del shell, la última lista de paquetes.
 *
 * Sin red no se puede pedir `/player-precache.json`, pero sí hace falta saber
 * QUÉ paquetes debería haber para comprobar que están todos. Por eso la copia
 * de la última vez que hubo red vive en la propia caché. El service worker no
 * intercepta esa ruta (no es de /assets/ ni es una navegación), así que este
 * duplicado sólo lo lee `verificarPaquetesDelJugador`.
 */
const CLAVE_LISTA_DE_PAQUETES = '/player-precache.json'

/**
 * Todos los paquetes del jugador, según la lista que escribe el build.
 *
 * `collectShellUrls` sólo ve lo que está en el HTML (el paquete de arranque).
 * Lo que se carga con import() —el mapa, cada minijuego, los paneles— no
 * aparece ahí, y sin esto sólo quedaba guardado si el jugador ya lo había
 * abierto con cobertura: un minijuego que aún no había tocado no cargaba sin
 * red. La lista sale del propio build (`/player-precache.json`) e incluye todo
 * lo que puede pedir el móvil del jugador, y nada del panel de administración.
 *
 * Con red se pide la lista de ahora (y se guarda una copia). Sin red se usa la
 * copia de la última vez. `null` = no hay lista de ninguna clase (servidor
 * viejo, desarrollo): quien llama decide qué hacer, y no debe bloquear al jugador.
 */
async function leerListaDePaquetes(): Promise<string[] | null> {
  if (typeof window === 'undefined') return null

  const aRutas = (cuerpo: unknown): string[] | null => {
    const files = (cuerpo as { files?: unknown } | null)?.files
    if (!Array.isArray(files)) return null
    return files
      .filter((f): f is string => typeof f === 'string')
      .map((f) => sameOriginPath(f))
      .filter((f): f is string => Boolean(f && f.startsWith('/assets/')))
  }

  try {
    const respuesta = await fetchConLimite(
      '/player-precache.json',
      { cache: 'no-store', credentials: 'same-origin' },
      6000
    )
    if (respuesta.ok) {
      const texto = await respuesta.text()
      const rutas = aRutas(JSON.parse(texto))
      if (rutas) {
        try {
          const cache = await caches.open(PLAYER_SHELL_CACHE)
          await cache.put(
            CLAVE_LISTA_DE_PAQUETES,
            new Response(texto, { headers: { 'Content-Type': 'application/json' } }),
          )
        } catch {
          // Sin la copia, sin red no se podrá verificar; el resto sigue igual.
        }
        return rutas
      }
    }
  } catch {
    // Sin red: se prueba con la copia guardada.
  }

  try {
    if (!('caches' in window)) return null
    const cache = await caches.open(PLAYER_SHELL_CACHE)
    const guardada = await cache.match(CLAVE_LISTA_DE_PAQUETES)
    if (!guardada) return null
    return aRutas(await guardada.json())
  } catch {
    return null
  }
}

export async function pedirPaquetesDelJugador(): Promise<string[]> {
  return (await leerListaDePaquetes()) ?? []
}

/** Resultado de comprobar qué paquetes del jugador están de verdad en el móvil. */
export interface InformeDePaquetes {
  /** Cuántos debería haber: la página, el manifiesto y todos los paquetes de la lista. */
  total: number
  guardados: number
  /** Rutas que faltan (vacío = todo guardado). */
  faltan: string[]
  /** Todo lo necesario está guardado. `true` también si no hay lista que comprobar. */
  completo: boolean
  /** No había lista (servidor viejo o desarrollo): no se pudo comprobar nada. */
  sinLista: boolean
}

function rutasEsperadas(playerUrl: string, lista: string[]): string[] {
  return Array.from(
    new Set(['/', sameOriginPath(playerUrl) || '/', '/manifest.webmanifest', ...lista]),
  )
}

/**
 * ¿Están en la caché TODOS los paquetes que puede pedir el jugador?
 *
 * Es lo que decide si el panel «Prepararse antes de saír» puede decir que está
 * listo: no basta con que la misión y el mapa estén guardados si al abrir un
 * minijuego el paquete de su familia sigue sin bajar. Comprueba uno a uno con
 * `cache.match`, no se fía de que la descarga «haya terminado».
 */
export async function verificarPaquetesDelJugador(playerUrl = '/'): Promise<InformeDePaquetes> {
  const vacio: InformeDePaquetes = { total: 0, guardados: 0, faltan: [], completo: true, sinLista: true }
  if (typeof window === 'undefined' || !('caches' in window)) return vacio

  const lista = await leerListaDePaquetes()
  if (!lista) return vacio

  try {
    const cache = await caches.open(PLAYER_SHELL_CACHE)
    const esperados = rutasEsperadas(playerUrl, lista)
    const faltan: string[] = []
    for (const ruta of esperados) {
      if (!(await cache.match(ruta, { ignoreSearch: true }))) faltan.push(ruta)
    }
    return {
      total: esperados.length,
      guardados: esperados.length - faltan.length,
      faltan,
      completo: faltan.length === 0,
      sinLista: false,
    }
  } catch {
    return { ...vacio, sinLista: false, completo: false }
  }
}

/**
 * ¿La respuesta es lo que dice su nombre?
 *
 * Un servidor con salida a `index.html` para cualquier ruta contesta 200 con
 * HTML a un `/assets/x.js` que no existe. Guardar eso como si fuera el paquete
 * deja la aplicación rota hasta vaciar el navegador, y el 200 lo hacía pasar
 * por bueno. Es el fallo que se caza aquí; el tipo exacto de cada fichero no
 * importa (varía según el servidor) mientras no sea una página.
 */
export function contentTypeCuadra(ruta: string, tipo: string | null | undefined): boolean {
  const t = String(tipo || '').toLowerCase()
  const limpia = ruta.split('?')[0]

  // La página del jugador TIENE que ser HTML.
  if (limpia === '/' || limpia.startsWith('/player/') || limpia.endsWith('.html')) {
    return t.includes('text/html')
  }

  // Todo lo demás (paquetes, hojas de estilo, fuentes, imágenes...) puede llegar
  // con el tipo que ponga cada servidor —`text/javascript`, `application/javascript`,
  // `text/plain` en algunas máquinas—, pero NUNCA puede ser la página de salida.
  return !t.includes('text/html')
}

/** Dónde están los modelos y retratos de los avatares 3D (ver avatares3d/mixamo/rutas.ts). */
const RUTA_DE_AVATARES = '/assets/avatares/'

/** Cuántas descargas a la vez: con cobertura justa, 40 en paralelo se ahogan entre sí. */
const DESCARGAS_A_LA_VEZ = 4

export interface ProgresoDeApp {
  hecho: number
  total: number
  detalle: string
}

export interface InformeDeDescarga extends InformeDePaquetes {
  /** El navegador dijo que no cabía más. */
  sinEspacio: boolean
}

const pausa = (ms: number) => new Promise<void>((resolver) => window.setTimeout(resolver, ms))

/**
 * Baja los paquetes del jugador que faltan, ENSEÑANDO el progreso, y comprueba
 * el resultado contra la caché.
 *
 * Es la parte «App» de la pantalla de carga. Se bajaba en segundo plano (al
 * instalarse el service worker y en cada arranque), sin pantalla y sin
 * avisar; ahora sólo se baja aquí, con la barra a la vista, y sólo lo que falta:
 * los ficheros de /assets/ llevan su hash en el nombre, así que uno guardado es
 * idéntico y no se vuelve a pedir.
 *
 * Los que fallan se reintentan (con cobertura justa alguna petición se pierde),
 * y un fallo de cuota se cuenta en el informe en vez de tragarse: no se dice
 * «listo» con la descarga a medias.
 */
export async function descargarPaquetesDelJugador(
  playerUrl: string,
  alProgreso?: (progreso: ProgresoDeApp) => void,
  opciones: { cancelado?: () => boolean; intentos?: number } = {}
): Promise<InformeDeDescarga> {
  const sinNada: InformeDeDescarga = {
    total: 0,
    guardados: 0,
    faltan: [],
    completo: true,
    sinLista: true,
    sinEspacio: false,
  }
  if (typeof window === 'undefined' || !('caches' in window)) return sinNada

  const cancelado = opciones.cancelado ?? (() => false)
  const intentos = Math.max(1, opciones.intentos ?? 3)

  await registerPlayerServiceWorker()
  await waitForServiceWorkerReady()

  const lista = await leerListaDePaquetes()
  const esperados = lista ? rutasEsperadas(playerUrl, lista) : collectShellUrls(playerUrl)
  const cache = await caches.open(PLAYER_SHELL_CACHE)

  const quedanPorGuardar = async (): Promise<string[]> => {
    const faltan: string[] = []
    for (const ruta of esperados) {
      if (!(await cache.match(ruta, { ignoreSearch: true }))) faltan.push(ruta)
    }
    return faltan
  }

  // Los modelos de los avatares 3D viajan con la parte «App»: se cuentan aparte en el detalle.
  const esDeAvatar = (ruta: string) => ruta.startsWith(RUTA_DE_AVATARES)
  const totalAvatares = esperados.filter(esDeAvatar).length
  let avataresFaltan = totalAvatares

  const avisar = (faltan: number) => {
    const hecho = esperados.length - faltan
    const avatares = totalAvatares > 0 ? ` · avatares ${totalAvatares - avataresFaltan} de ${totalAvatares}` : ''
    alProgreso?.({
      hecho,
      total: esperados.length,
      detalle: `${hecho} de ${esperados.length} archivos de la aplicación${avatares}`,
    })
  }

  // Los avatares son OPCIONALES: si el servidor no los tiene (404) o no llegan, la app sigue con el
  // retrato 2D y no se bloquea la carga ni se reintenta en balde.
  const ausentes = new Set<string>()
  const pendientesDe = (lista: string[]) => lista.filter((r) => !ausentes.has(r))

  let sinEspacio = false
  let faltan = await quedanPorGuardar()
  avataresFaltan = faltan.filter(esDeAvatar).length
  avisar(faltan.length)

  for (let ronda = 0; ronda < intentos && pendientesDe(faltan).length > 0 && !sinEspacio && !cancelado(); ronda += 1) {
    if (ronda > 0) await pausa(800 * ronda)

    const pendientes = pendientesDe(faltan)
    let restantes = faltan.length
    const trabajador = async () => {
      for (let ruta = pendientes.shift(); ruta !== undefined; ruta = pendientes.shift()) {
        if (sinEspacio || cancelado()) return
        try {
          const respuesta = await fetchConLimite(
            ruta,
            { method: 'GET', cache: 'reload', credentials: 'same-origin' },
            // Un modelo de avatar pesa hasta 1,8 MB: con cobertura justa 20 s no bastan.
            esDeAvatar(ruta) ? 90000 : 20000
          )
          if (respuesta.ok && contentTypeCuadra(ruta, respuesta.headers.get('content-type'))) {
            await cache.put(ruta, respuesta.clone())
            restantes -= 1
            if (esDeAvatar(ruta)) avataresFaltan -= 1
            avisar(restantes)
          } else if (esDeAvatar(ruta) && respuesta.status === 404) {
            ausentes.add(ruta)
          }
        } catch (error) {
          if (esErrorDeCuota(error)) sinEspacio = true
          // Cualquier otro fallo: se reintenta en la ronda siguiente.
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(DESCARGAS_A_LA_VEZ, pendientes.length) }, trabajador)
    )

    faltan = await quedanPorGuardar()
    avataresFaltan = faltan.filter(esDeAvatar).length
    avisar(faltan.length)
  }

  // Lo que falta de verdad: los avatares no cuentan (son opcionales, ver arriba).
  const obligatorios = faltan.filter((r) => !esDeAvatar(r))
  return {
    total: esperados.length,
    guardados: esperados.length - faltan.length,
    faltan: obligatorios,
    // Sin lista no hay con qué comparar: no se bloquea al jugador por eso.
    completo: obligatorios.length === 0 || !lista,
    sinLista: !lista,
    sinEspacio,
  }
}

/**
 * Guarda los paquetes y REINTENTA los que fallen, hasta comprobar que están.
 * Igual que `descargarPaquetesDelJugador`, sin barra de progreso.
 */
export async function asegurarPaquetesDelJugador(playerUrl: string, intentos = 3): Promise<InformeDePaquetes> {
  return descargarPaquetesDelJugador(playerUrl, undefined, { intentos })
}
