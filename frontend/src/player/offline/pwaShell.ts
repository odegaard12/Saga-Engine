const PLAYER_SHELL_CACHE = 'saga-player-shell-v1.2.0-rpg-viewfinder'

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

export type OfflineMapTileResult = {
  requested: number
  cached: number
  failed: number
}


type OfflineMapStage = {
  lat?: unknown
  lon?: unknown
}


function tileX(
  lon: number,
  zoom: number,
): number {
  const count = 2 ** zoom

  return Math.floor(
    ((lon + 180) / 360) * count
  )
}


function tileY(
  lat: number,
  zoom: number,
): number {
  const safeLat = Math.max(
    -85.0511,
    Math.min(85.0511, lat),
  )

  const radians =
    (safeLat * Math.PI) / 180

  const count = 2 ** zoom

  return Math.floor(
    (
      1 -
      Math.log(
        Math.tan(radians) +
        1 / Math.cos(radians),
      ) / Math.PI
    ) / 2 * count,
  )
}


function collectMissionTileUrls(
  stages: OfflineMapStage[],
): string[] {
  const urls = new Set<string>()

  for (const stage of stages) {
    const lat = Number(stage?.lat)
    const lon = Number(stage?.lon)

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon)
    ) {
      continue
    }

    for (
      const zoom of [15, 16, 17, 18]
    ) {
      const count = 2 ** zoom
      const centerX = tileX(lon, zoom)
      const centerY = tileY(lat, zoom)

      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          const x =
            ((centerX + dx) % count + count) %
            count

          const y = Math.max(
            0,
            Math.min(
              count - 1,
              centerY + dy,
            ),
          )

          urls.add(
            'https://server.arcgisonline.com/' +
            'ArcGIS/rest/services/' +
            'World_Imagery/MapServer/tile/' +
            `${zoom}/${y}/${x}`,
          )
        }
      }
    }
  }

  return Array.from(urls).slice(0, 240)
}


export async function cacheMissionMapTiles(
  stages: OfflineMapStage[],
): Promise<OfflineMapTileResult> {
  if (
    typeof window === 'undefined' ||
    !('caches' in window)
  ) {
    return {
      requested: 0,
      cached: 0,
      failed: 0,
    }
  }

  const urls =
    collectMissionTileUrls(stages)

  const cache =
    await caches.open(PLAYER_SHELL_CACHE)

  let cursor = 0
  let cached = 0
  let failed = 0

  async function worker() {
    while (cursor < urls.length) {
      const index = cursor
      cursor += 1

      const url = urls[index]

      try {
        const request = new Request(url, {
          method: 'GET',
          mode: 'no-cors',
          credentials: 'omit',
          cache: 'reload',
        })

        const response =
          await fetch(request)

        if (
          response.ok ||
          response.type === 'opaque'
        ) {
          await cache.put(
            request,
            response.clone(),
          )

          cached += 1
        } else {
          failed += 1
        }
      } catch {
        failed += 1
      }
    }
  }

  const workers = Math.min(
    6,
    Math.max(1, urls.length),
  )

  await Promise.all(
    Array.from(
      { length: workers },
      () => worker(),
    ),
  )

  return {
    requested: urls.length,
    cached,
    failed,
  }
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
