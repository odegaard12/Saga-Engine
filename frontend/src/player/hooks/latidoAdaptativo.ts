/**
 * NO ENGANCHADO todavía en useLatidoYCola.ts (26/10): falta probarlo contra «sin señal» del panel y los avisos ntfy
 * (vigilar_nodos de las Pis) antes de espaciar los latidos. Módulo puro y probado, listo para usar.
 *
 * Cada cuánto late el móvil (26/10, consumo con poca cobertura). Módulo puro: lo prueba tests/js/latido_adaptativo.cjs.
 *
 * Antes era cada 30 s (60 con ahorro de datos) sin mirar nada más: un jugador parado en un bar, lejos de cualquier
 * nodo, mandaba el mismo latido que uno andando. Ahora:
 *
 *  - Andando, o a menos de 250 m del nodo que toca (ahí la posición vale para abrirlo): como siempre.
 *  - Parado (no se ha movido 15 m en 1 min) y lejos del nodo: cada 60 s; parado 5 min: cada 90 s.
 *  - Nunca más de 90 s: el servidor da a alguien por «en vivo» hasta 180 s sin latido, y por «sin conexión» a los 10 min.
 *  - Sin cobertura no se toca (el ciclo de «uno de cada cuatro» ya lo espacia), ni sin posición.
 */
export const LATIDO_BASE_MS = 30_000
export const LATIDO_AHORRO_MS = 60_000
export const LATIDO_QUIETO_MS = 60_000
export const LATIDO_MUY_QUIETO_MS = 90_000
/** Sin moverse más de esto en el tiempo de abajo, está parado. */
export const MOVIMIENTO_M = 15
export const QUIETO_TRAS_MS = 60_000
export const MUY_QUIETO_TRAS_MS = 5 * 60_000
export const CERCA_DEL_NODO_M = 250

export function intervaloDeLatido(e: {
  /** `navigator.connection.saveData` o 2G. */
  ahorro: boolean
  sinCobertura: boolean
  /** Cuánto lleva sin moverse más de `MOVIMIENTO_M`; 0 si no hay posición. */
  quietoMs: number
  /** Distancia al nodo que toca, si se sabe. */
  distanciaNodoM: number | null
}): number {
  const base = e.ahorro ? LATIDO_AHORRO_MS : LATIDO_BASE_MS
  if (e.sinCobertura || !(e.quietoMs > 0)) return base
  if (e.distanciaNodoM !== null && e.distanciaNodoM <= CERCA_DEL_NODO_M) return base
  if (e.quietoMs >= MUY_QUIETO_TRAS_MS) return Math.max(base, LATIDO_MUY_QUIETO_MS)
  if (e.quietoMs >= QUIETO_TRAS_MS) return Math.max(base, LATIDO_QUIETO_MS)
  return base
}

/** Metros entre dos puntos cercanos (equirrectangular: de sobra para 15 m y 250 m). */
export function metros(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = (a.lat - b.lat) * 111_320
  const dLon = (a.lon - b.lon) * 111_320 * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180)
  return Math.hypot(dLat, dLon)
}

/** Lleva la cuenta de cuánto lleva parado, a partir de las posiciones que se le van dando. */
export function crearVigilanteDeQuietud() {
  let ref: { lat: number; lon: number } | null = null
  let desde = 0
  return {
    /** `null` = sin posición (se olvida lo anterior). Devuelve cuánto lleva parado (0 = andando o sin posición). */
    ver(pos: { lat: number; lon: number } | null, ahoraMs: number): number {
      if (!pos) {
        ref = null
        return 0
      }
      if (!ref || metros(ref, pos) > MOVIMIENTO_M) {
        ref = pos
        desde = ahoraMs
        return 0
      }
      return Math.max(0, ahoraMs - desde)
    },
  }
}
