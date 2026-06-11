type DebugCoords = {
  lat: number
  lon: number
  accuracy?: number
  source?: string
}

const INSTALLED_KEY = '__saga_debug_geolocation_shim_installed__'
const LAST_GPS_KEY = 'saga_last_gps_coords'

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function getUserFromLocation(): string {
  if (typeof window === 'undefined') return ''
  const url = new URL(window.location.href)
  const queryUser = url.searchParams.get('user')
  if (queryUser) return queryUser.trim()

  const match = url.pathname.match(/\/player\/([^/?#]+)/)
  return match ? decodeURIComponent(match[1]).trim() : ''
}

function clientDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false

  const url = new URL(window.location.href)
  if (
    url.searchParams.get('debug') === '1' ||
    url.searchParams.get('debug_gps') === '1' ||
    url.searchParams.get('saga_debug_gps') === '1'
  ) {
    return true
  }

  try {
    return (
      window.localStorage.getItem('saga_debug_gps_enabled') === '1' ||
      window.localStorage.getItem('saga_debug_enabled') === '1' ||
      window.localStorage.getItem('saga_debug_gps') === '1'
    )
  } catch {
    return false
  }
}

async function backendDebugTarget(user: string): Promise<DebugCoords | null> {
  if (!user || typeof fetch === 'undefined') return null

  try {
    const response = await fetch(`/api/game/${encodeURIComponent(user)}?fresh=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) return null

    const payload = await response.json()
    const profile = payload?.profile ?? {}
    const debugEnabled = profile?.debug_enabled === true || payload?.debug_enabled === true

    if (!debugEnabled && !clientDebugEnabled()) return null

    const stage = payload?.current_stage ?? (Array.isArray(payload?.stages) ? payload.stages[0] : null)
    const lat = stage?.lat
    const lon = stage?.lon

    if (!isNumber(lat) || !isNumber(lon)) return null

    return {
      lat,
      lon,
      accuracy: 3,
      source: clientDebugEnabled() ? 'debug_url_stage' : 'debug_profile_stage',
    }
  } catch {
    return null
  }
}

function storeLastGps(coords: DebugCoords) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      LAST_GPS_KEY,
      JSON.stringify({
        lat: coords.lat,
        lon: coords.lon,
        accuracy: coords.accuracy ?? 3,
        at: Date.now(),
        source: coords.source ?? 'debug_stage',
      }),
    )
  } catch {
    // ignore localStorage failures
  }
}

function makePosition(coords: DebugCoords): GeolocationPosition {
  const timestamp = Date.now()

  return {
    timestamp,
    coords: {
      latitude: coords.lat,
      longitude: coords.lon,
      accuracy: coords.accuracy ?? 3,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON() {
        return this
      },
    },
    toJSON() {
      return this
    },
  } as GeolocationPosition
}

async function getDebugCoords(): Promise<DebugCoords | null> {
  const user = getUserFromLocation()
  const coords = await backendDebugTarget(user)
  if (!coords) return null
  storeLastGps(coords)
  return coords
}

export function installDebugGeolocationShim() {
  if (typeof window === 'undefined') return
  if (!('navigator' in window)) return

  const anyWindow = window as unknown as Record<string, unknown>
  if (anyWindow[INSTALLED_KEY]) return
  anyWindow[INSTALLED_KEY] = true

  const original = window.navigator.geolocation
  const originalGetCurrentPosition = original?.getCurrentPosition?.bind(original)
  const originalWatchPosition = original?.watchPosition?.bind(original)
  const originalClearWatch = original?.clearWatch?.bind(original)

  const debugWatchTimers = new Map<number, number>()
  let nextWatchId = 900000

  const makeUnavailableError = (message: string) => ({
    code: 2,
    message,
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  }) as GeolocationPositionError

  const shim: Geolocation = {
    getCurrentPosition(success, error, options) {
      getDebugCoords()
        .then((coords) => {
          if (coords) {
            success(makePosition(coords))
            return
          }

          if (originalGetCurrentPosition) {
            originalGetCurrentPosition(success, error, options)
            return
          }

          error?.(makeUnavailableError('SAGA debug GPS: no hay coordenadas debug ni geolocalización real disponible.'))
        })
        .catch(() => {
          if (originalGetCurrentPosition) {
            originalGetCurrentPosition(success, error, options)
            return
          }

          error?.(makeUnavailableError('SAGA debug GPS: fallo al obtener coordenadas debug y no hay geolocalización real.'))
        })
    },

    watchPosition(success, error, options) {
      const watchId = nextWatchId++

      getDebugCoords()
        .then((coords) => {
          if (!coords) {
            if (originalWatchPosition) {
              const realWatchId = originalWatchPosition(success, error, options)
              debugWatchTimers.set(watchId, realWatchId)
              return
            }

            error?.(makeUnavailableError('SAGA debug GPS: no hay coordenadas debug ni geolocalización real disponible.'))
            return
          }

          success(makePosition(coords))

          const timer = window.setInterval(async () => {
            const nextCoords = await getDebugCoords()
            if (nextCoords) success(makePosition(nextCoords))
          }, 1200)

          debugWatchTimers.set(watchId, timer)
        })
        .catch(() => {
          if (originalWatchPosition) {
            const realWatchId = originalWatchPosition(success, error, options)
            debugWatchTimers.set(watchId, realWatchId)
            return
          }

          error?.(makeUnavailableError('SAGA debug GPS: fallo al obtener coordenadas debug y no hay geolocalización real.'))
        })

      return watchId
    },

    clearWatch(id) {
      const stored = debugWatchTimers.get(id)
      if (stored !== undefined) {
        window.clearInterval(stored)
        originalClearWatch?.(stored)
        debugWatchTimers.delete(id)
        return
      }

      originalClearWatch?.(id)
    },
  }

  Object.defineProperty(window.navigator, 'geolocation', {
    configurable: true,
    enumerable: true,
    value: shim,
  })
}

