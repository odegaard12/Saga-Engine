const CACHE_NAME = 'saga-player-shell-v170-stable-3'
const DEFAULT_PLAYER_URL = '/player/PLAYER%201'
const CORE_URLS = [DEFAULT_PLAYER_URL, '/manifest.webmanifest']

function shouldBypass(url) {
  return (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/admin') ||
    url.pathname.startsWith('/admin-react')
  )
}

async function putCache(request, response) {
  if (!response || !response.ok) return response
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

async function navigationResponse(request) {
  try {
    const response = await fetch(request)
    await putCache(request, response)
    return response
  } catch {
    return (
      (await caches.match(request)) ||
      (await caches.match(DEFAULT_PLAYER_URL)) ||
      new Response('SAGA player shell is not cached yet. Open the player online and download the mission first.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    )
  }
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

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (shouldBypass(url)) return

  if (request.mode === 'navigate') {
    event.respondWith(navigationResponse(request))
    return
  }

  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/sw.js' ||
    url.pathname === '/service-worker.js'
  ) {
    event.respondWith(cacheFirst(request))
  }
})
