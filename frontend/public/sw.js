const CACHE_NAME = 'saga-player-shell-v172-field-refactor-1'
const DEFAULT_PLAYER_URL = '/player/PLAYER%201'
const CORE_URLS = [DEFAULT_PLAYER_URL, '/manifest.webmanifest', '/sw.js']

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
    url.pathname === '/saga-app-icon.svg'
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

async function networkFirst(request) {
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
  if (url.origin !== self.location.origin) return
  if (shouldBypass(url)) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
    return
  }

  if (isShellAsset(url)) {
    event.respondWith(cacheFirst(request))
  }
})
