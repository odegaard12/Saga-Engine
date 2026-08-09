import type { FieldProof } from '../../types/player'

const FIELD_PROOF_STORAGE_PREFIX = 'saga:field-proofs:'
// Mismo nombre que en frontend/public/sw.js: el service worker borra al activarse
// cualquier 'saga-field-proof-assets-*' distinta de la suya, y con ella se irían
// las fotos de ruta descargadas (la del mosaico, por ejemplo).
const FIELD_PROOF_ASSET_CACHE = 'saga-field-proof-assets-v3.9.6'

export type CachedFieldProofsPayload = {
  user: string
  cached_at: string
  proofs: FieldProof[]
}

function storageKey(user: string): string {
  return `${FIELD_PROOF_STORAGE_PREFIX}${String(user || 'anonymous').trim() || 'anonymous'}`
}

function hasLocalStorage(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage
  } catch {
    return false
  }
}

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function sameOriginPath(value?: string): string | null {
  if (!value || typeof window === 'undefined') return null

  try {
    const url = new URL(value, window.location.origin)
    if (url.origin !== window.location.origin) return null
    return `${url.pathname}${url.search}`
  } catch {
    return null
  }
}

export function cacheFieldProofs(user: string, proofs: FieldProof[]): CachedFieldProofsPayload {
  const payload: CachedFieldProofsPayload = {
    user,
    cached_at: new Date().toISOString(),
    proofs: Array.isArray(proofs) ? proofs : [],
  }

  if (hasLocalStorage()) {
    try {
    window.localStorage.setItem(storageKey(user), JSON.stringify(payload))
    } catch (e) { console.warn('Storage quota exceeded', e); }
  }

  return payload
}

export function getCachedFieldProofs(user: string): CachedFieldProofsPayload {
  const fallback: CachedFieldProofsPayload = {
    user,
    cached_at: '',
    proofs: [],
  }

  if (!hasLocalStorage()) return fallback

  const loaded = safeJsonParse<CachedFieldProofsPayload>(
    window.localStorage.getItem(storageKey(user)),
    fallback
  )

  return {
    user,
    cached_at: loaded.cached_at || '',
    proofs: Array.isArray(loaded.proofs) ? loaded.proofs : [],
  }
}

export async function cacheFieldProofAssets(proofs: FieldProof[]): Promise<void> {
  if (typeof window === 'undefined') return
  if (!('caches' in window)) return

  const urls = new Set<string>()

  for (const proof of proofs || []) {
    const thumb = sameOriginPath(proof.thumbnail_url)
    const image = sameOriginPath(proof.image_url)

    if (thumb) urls.add(thumb)
    if (image) urls.add(image)
  }

  if (urls.size === 0) return

  const cache = await caches.open(FIELD_PROOF_ASSET_CACHE)

  await Promise.all(
    Array.from(urls).map(async (url) => {
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
        // Best effort.
      }
    })
  )
}
