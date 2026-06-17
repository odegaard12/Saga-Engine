const PLAYER_SHELL_CACHE = 'saga-player-shell-v510-offline-gps-hardening'

export async function registerPlayerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined') return null
  if (!('serviceWorker' in navigator)) return null

  const hadController = Boolean(
    navigator.serviceWorker.controller,
  )

  const reloadKey =
    `${PLAYER_SHELL_CACHE}:controller-reload`

  if (hadController) {
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        try {
          if (
            window.sessionStorage.getItem(
              reloadKey,
            ) === '1'
          ) {
            return
          }

          window.sessionStorage.setItem(
            reloadKey,
            '1',
          )
        } catch {
          // Reload still works when sessionStorage is unavailable.
        }

        window.location.reload()
      },
      { once: true },
    )
  }

  try {
    const registration =
      await navigator.serviceWorker.register(
        '/sw.js',
        {
          scope: '/',
          updateViaCache: 'none',
        },
      )

    await registration.update().catch(
      () => undefined,
    )

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

export async function isPlayerShellCached(playerUrl: string): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (!('caches' in window)) return false

  const path = sameOriginPath(playerUrl)
  if (!path) return false

  return Boolean(await caches.match(path))
}
