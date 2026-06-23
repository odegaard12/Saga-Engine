import { toFiniteNumber, type LatLon } from './geo'

export type StoredGpsPosition = LatLon & {
  accuracy?: number
  saved_at?: number
  captured_at?: number
}

function gpsReadyStorageKey(user: string): string {
  return `saga:gps-ready:${user}`
}

function gpsLastPositionStorageKey(user: string): string {
  return `saga:gps-last-position:${user}`
}

export function readStoredGpsPosition(user: string): StoredGpsPosition | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(gpsLastPositionStorageKey(user))
    if (!raw) return null

    const parsed = JSON.parse(raw) as {
      lat?: unknown
      lon?: unknown
      accuracy?: unknown
      saved_at?: unknown
      captured_at?: unknown
    }

    const lat = toFiniteNumber(parsed.lat)
    const lon = toFiniteNumber(parsed.lon)
    const accuracy = toFiniteNumber(parsed.accuracy)
    const savedAt = toFiniteNumber(parsed.saved_at)
    const capturedAt = toFiniteNumber(parsed.captured_at)

    if (lat === null || lon === null) return null

    return {
      lat,
      lon,
      ...(accuracy !== null && accuracy >= 0
        ? { accuracy }
        : {}),
      ...(savedAt !== null
        ? { saved_at: savedAt }
        : {}),
      ...(capturedAt !== null
        ? { captured_at: capturedAt }
        : {}),
    }
  } catch {
    return null
  }
}

export function rememberGpsReady(user: string): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(gpsReadyStorageKey(user), '1')
  } catch {
    // Ignore private mode/storage errors.
  }
}

export function rememberGpsPosition(
  user: string,
  position: LatLon,
  metadata: {
    accuracy?: number
    capturedAt?: number
  } = {}
): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(
      gpsLastPositionStorageKey(user),
      JSON.stringify({
        ...position,
        accuracy:
          typeof metadata.accuracy === 'number' &&
          Number.isFinite(metadata.accuracy)
            ? Math.max(0, metadata.accuracy)
            : undefined,
        captured_at:
          typeof metadata.capturedAt === 'number' &&
          Number.isFinite(metadata.capturedAt)
            ? metadata.capturedAt
            : Date.now(),
        saved_at: Date.now(),
      })
    )
  } catch {
    // Ignore private mode/storage errors.
  }
}

export function hasRememberedGpsReady(user: string): boolean {
  if (typeof window === 'undefined') return false

  try {
    return window.localStorage.getItem(gpsReadyStorageKey(user)) === '1'
  } catch {
    return false
  }
}
