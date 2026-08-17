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

export async function registerPlayerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
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
          } catch (e) { console.warn('Storage quota exceeded', e); }
        } catch {
          // Reload still works when sessionStorage is unavailable.
        }

        window.location.reload()
      },
      { once: true }
    )
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    })

    await registration.update().catch(() => undefined)

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

async function waitForServiceWorkerReady(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined') return null
  if (!('serviceWorker' in navigator)) return null

  try {
    return await navigator.serviceWorker.ready
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
    '/sw.js',
    '/service-worker.js',
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

async function cacheUrlsDirectly(urls: string[]): Promise<void> {
  if (typeof window === 'undefined') return
  if (!('caches' in window)) return

  const cache = await caches.open(PLAYER_SHELL_CACHE)

  await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetch(url, {
          method: 'GET',
          cache: 'reload',
          credentials: 'same-origin',
        })
        if (response.ok) {
          await cache.put(url, response.clone())
        }
      } catch {
        // Cache preparation is best-effort.
      }
    })
  )
}

export async function cachePlayerShell(playerUrl: string): Promise<void> {
  if (typeof window === 'undefined') return

  await registerPlayerServiceWorker()
  const registration = await waitForServiceWorkerReady()
  const urls = collectShellUrls(playerUrl)

  await cacheUrlsDirectly(urls)

  registration?.active?.postMessage({
    type: 'SAGA_CACHE_PLAYER_SHELL',
    urls,
  })
}
