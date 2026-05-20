export type SagaGpsCoords = {
  lat: number
  lon: number
  accuracy?: number
  at?: number
}

let prewarmPromise: Promise<SagaGpsCoords | null> | null = null
let prewarmedCoords: SagaGpsCoords | null = null
let prewarmedAt = 0

const STALE_MS = 30000
const LAST_GPS_KEY = 'saga_last_gps_coords'

function saveCoords(coords: SagaGpsCoords) {
  const next = { ...coords, at: Date.now() }
  prewarmedCoords = next
  prewarmedAt = Date.now()

  try {
    localStorage.setItem('saga_gps_granted', '1')
    localStorage.setItem(LAST_GPS_KEY, JSON.stringify(next))
  } catch { /* ignore */ }
}

function readCachedGps(maxAgeMs = 10 * 60 * 1000): SagaGpsCoords | null {
  if (prewarmedCoords && Date.now() - (prewarmedCoords.at || 0) <= maxAgeMs) {
    return prewarmedCoords
  }

  try {
    const raw = localStorage.getItem(LAST_GPS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (
      typeof parsed?.lat === 'number' &&
      typeof parsed?.lon === 'number' &&
      typeof parsed?.at === 'number' &&
      Date.now() - parsed.at <= maxAgeMs
    ) {
      return {
        lat: parsed.lat,
        lon: parsed.lon,
        accuracy: typeof parsed.accuracy === 'number' ? parsed.accuracy : undefined,
        at: parsed.at,
      }
    }
  } catch { /* ignore */ }

  return null
}

export function getCachedGpsCoords(maxAgeMs = 10 * 60 * 1000): SagaGpsCoords | null {
  return readCachedGps(maxAgeMs)
}

function requestPosition(options: PositionOptions): Promise<SagaGpsCoords | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          at: Date.now(),
        }
        saveCoords(coords)
        resolve(coords)
      },
      () => resolve(null),
      options
    )
  })
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let settled = false
    const timer = window.setTimeout(() => {
      if (settled) return
      settled = true
      resolve(fallback)
    }, ms)

    promise.then((value) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      resolve(value)
    }).catch(() => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      resolve(fallback)
    })
  })
}

export function prewarmGps(): void {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return
  if (prewarmPromise && Date.now() - prewarmedAt < STALE_MS) return

  prewarmedAt = Date.now()

  // Prewarm real: alta precisión, sin maximumAge viejo.
  prewarmPromise = requestPosition({
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 0,
  })

  void prewarmPromise
}

// Para iniciar cinemática queremos GPS fresco.
// No devolvemos cache vieja si el navegador no responde.
export async function getPrewarmedGps(): Promise<SagaGpsCoords | null> {
  const fresh = prewarmPromise
    ? await withTimeout(prewarmPromise, 15000, null)
    : await withTimeout(
        requestPosition({
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        }),
        15500,
        null
      )

  if (fresh) return fresh

  // Si un jugador acaba de obtener GPS bueno, reutilizarlo para otros jugadores
  // del mismo dispositivo. Evita que Odi vaya bien y Nati/Zaira se queden en error.
  const recent = readCachedGps(2 * 60 * 1000)
  if (
    recent &&
    (typeof recent.accuracy !== 'number' || recent.accuracy <= 2500)
  ) {
    return recent
  }

  return null
}
