const CACHE_NAME = 'saga-player-shell-v300-sequence-code-live-refresh'
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

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  await putCache(request, response)
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
    await putCache(request, response)
    return response
  } catch {
    return (
      (await caches.match(request)) ||
      (await caches.match(DEFAULT_SHELL_URL)) ||
      new Response('SAGA offline shell is not cached yet. Open SAGA online once and press Prepare offline.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    )
  }
}

async function navigationNetworkFirst(request) {
  try {
    const response = await fetchWithTimeout(
      request,
      5000,
    )

    await putCache(request, response)
    return response
  } catch {
    return (
      (await caches.match(request)) ||
      (await caches.match(DEFAULT_SHELL_URL)) ||
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

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('saga-player-shell-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('message', (event) => {
  const data = event.data || {}
  if (data.type !== 'SAGA_CACHE_PLAYER_SHELL') return
  const urls = Array.isArray(data.urls) ? data.urls : []
  event.waitUntil(cacheUrls(urls))
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  if (
    url.hostname === 'server.arcgisonline.com' &&
    url.pathname.includes('/World_Imagery/MapServer/tile/')
  ) {
    event.respondWith(cacheFirst(request))
    return
  }

  if (url.origin !== self.location.origin) return

  if (url.pathname.startsWith('/api/field-proofs/') && request.method === 'GET') {
    event.respondWith(cacheFirst(request))
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
