export async function registerPlayerServiceWorker(): Promise<void> {
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return

  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  } catch {
    // Offline shell is best-effort; mission data is still stored in IndexedDB.
  }
}

export async function cachePlayerShell(playerUrl: string): Promise<void> {
  if (typeof window === 'undefined') return

  await registerPlayerServiceWorker()

  const urls = new Set<string>([
    playerUrl,
    '/manifest.webmanifest',
    '/sw.js',
  ])

  document.querySelectorAll<HTMLScriptElement>('script[src]').forEach((script) => {
    if (script.src && script.src.startsWith(window.location.origin)) {
      urls.add(new URL(script.src).pathname)
    }
  })

  document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach((link) => {
    if (link.href && link.href.startsWith(window.location.origin)) {
      urls.add(new URL(link.href).pathname)
    }
  })

  await Promise.all(
    Array.from(urls).map((url) =>
      fetch(url, {
        method: 'GET',
        cache: 'reload',
      }).catch(() => undefined)
    )
  )
}
