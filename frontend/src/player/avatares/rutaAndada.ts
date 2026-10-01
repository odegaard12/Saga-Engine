/**
 * Lo andado del tramo en juego, para pintarlo distinto de lo que queda.
 *
 * El trazado que llega al nodo actual se parte en el punto del camino más
 * cercano a ti: hacia atrás, lo que ya has recorrido (se pinta como lo
 * hecho); hacia delante, lo que queda (azul, con flechas y pulso).
 *
 * Lógica pura, sin mapa: se ejecuta en Node en las pruebas.
 */

export type Punto = { lat: number; lon: number }

const RAD = Math.PI / 180
const R = 6371000

/** Más lejos del camino que esto, no se te cuenta como «yendo por él». */
export const DISTANCIA_MAXIMA_AL_CAMINO_M = 60

type Plano = { x: number; y: number }

function aPlano(p: Punto, origen: Punto): Plano {
  return {
    x: (p.lon - origen.lon) * RAD * Math.cos(origen.lat * RAD) * R,
    y: (p.lat - origen.lat) * RAD * R,
  }
}

export type Proyeccion = {
  /** Metros del punto al camino (el tramo más cercano). */
  distanciaM: number
  /** Metros recorridos por el camino hasta el punto proyectado. */
  progresoM: number
  /** Largo total del trazado. */
  largoM: number
}

export function proyectarEnTrazado(track: Punto[], yo: Punto): Proyeccion | null {
  if (track.length < 2) return null
  const origen = track[0]
  const p = aPlano(yo, origen)
  let acumulado = 0
  let mejor: Proyeccion | null = null
  let mejorDistancia = Infinity
  for (let i = 1; i < track.length; i += 1) {
    const a = aPlano(track[i - 1], origen)
    const b = aPlano(track[i], origen)
    const dx = b.x - a.x
    const dy = b.y - a.y
    const largo = Math.hypot(dx, dy)
    const t = largo > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (largo * largo))) : 0
    const d = Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t))
    if (d < mejorDistancia) {
      mejorDistancia = d
      mejor = { distanciaM: d, progresoM: acumulado + largo * t, largoM: 0 }
    }
    acumulado += largo
  }
  if (mejor) mejor.largoM = acumulado
  return mejor
}

/** Parte el trazado a `progresoM` metros del principio: lo andado y lo que queda. */
export function cortarTrazado(track: Punto[], progresoM: number): { andado: Punto[]; resto: Punto[] } {
  if (track.length < 2 || progresoM <= 0) return { andado: [], resto: track }
  const origen = track[0]
  let acumulado = 0
  for (let i = 1; i < track.length; i += 1) {
    const a = aPlano(track[i - 1], origen)
    const b = aPlano(track[i], origen)
    const largo = Math.hypot(b.x - a.x, b.y - a.y)
    if (acumulado + largo >= progresoM) {
      const t = largo > 0 ? (progresoM - acumulado) / largo : 0
      const corte: Punto = {
        lat: track[i - 1].lat + (track[i].lat - track[i - 1].lat) * t,
        lon: track[i - 1].lon + (track[i].lon - track[i - 1].lon) * t,
      }
      return {
        andado: [...track.slice(0, i), corte],
        resto: [corte, ...track.slice(i)],
      }
    }
    acumulado += largo
  }
  return { andado: track, resto: [] }
}

/**
 * Cuánto del tramo se da por andado para tu posición. Nunca retrocede
 * (`minimoM` = lo andado hasta ahora): el GPS bailando no des-pinta el
 * camino. `null` si vas por fuera del camino: entonces no se corta nada nuevo.
 * Se redondea a `pasoM` para no rehacer el dibujo a cada metro.
 */
export function progresoAndado(track: Punto[], yo: Punto, minimoM = 0, pasoM = 8): number {
  const proyeccion = proyectarEnTrazado(track, yo)
  if (!proyeccion || proyeccion.distanciaM > DISTANCIA_MAXIMA_AL_CAMINO_M) return minimoM
  const redondeado = Math.floor(proyeccion.progresoM / pasoM) * pasoM
  return Math.max(minimoM, redondeado)
}
