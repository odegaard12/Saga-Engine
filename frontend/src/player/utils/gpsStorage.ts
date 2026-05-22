import { toFiniteNumber, type LatLon } from './geo'

function gpsReadyStorageKey(user: string): string {
  return `saga:gps-ready:${user}`
}

function gpsLastPositionStorageKey(user: string): string {
  return `saga:gps-last-position:${user}`
}

export function readStoredGpsPosition(user: string): LatLon | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(gpsLastPositionStorageKey(user))
    if (!raw) return null

    const parsed = JSON.parse(raw) as { lat?: unknown; lon?: unknown }
    const lat = toFiniteNumber(parsed.lat)
    const lon = toFiniteNumber(parsed.lon)

    if (lat === null || lon === null) return null

    return { lat, lon }
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

export function rememberGpsPosition(user: string, position: LatLon): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(
      gpsLastPositionStorageKey(user),
      JSON.stringify({ ...position, saved_at: Date.now() })
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
