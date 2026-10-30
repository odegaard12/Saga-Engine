/**
 * Faros (30/10/2026, sustituye la mecánica de «Rumbo doble»). Lógica pura, sin React: se prueba en Node
 * (tests/js/dinamo_faros.cjs).
 *
 * Girando sobre uno mismo hay que encender los faros UNO A UNO (en el orden de la semilla) con pistas de frío/caliente
 * que se debilitan con cada faro encendido; las luces rojas son barcos señuelo que no hay que iluminar. El ángulo es RELATIVO a donde
 * se empezó (giroscopio, o la orientación del móvil restando la inicial), no el norte: no falla con metal cerca y va
 * igual en todos los móviles. Los faros salen de la semilla del jugador: distintos para cada uno, misma dificultad.
 */

export type Temperatura = 'ardiendo' | 'caliente' | 'templado' | 'frio'

function hash32(texto: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** mulberry32: aleatorio determinista a partir de la semilla. */
function aleatorio(semilla: string): () => number {
  let a = hash32(semilla)
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function normalizar(grados: number): number {
  return ((grados % 360) + 360) % 360
}

/** Diferencia con signo más corta de `a` a `b`, en (-180, 180]. */
export function delta(a: number, b: number): number {
  const d = normalizar(b - a)
  return d > 180 ? d - 360 : d
}

/**
 * `n` faros (2-6) repartidos alrededor, separados al menos 360/(n+1)°, y ninguno a menos de 40° del frente
 * (si no, el primero se encontraría sin girar).
 */
export function generarFaros(semilla: string, n: number): number[] {
  const total = Math.max(2, Math.min(6, Math.round(n)))
  const rnd = aleatorio(semilla)
  const minimo = 360 / (total + 1)
  for (let intento = 0; intento < 200; intento += 1) {
    const faros: number[] = []
    for (let i = 0; i < 400 && faros.length < total; i += 1) {
      const a = Math.round(rnd() * 360) % 360
      if (Math.abs(delta(0, a)) < 40) continue
      if (faros.every((f) => Math.abs(delta(f, a)) >= minimo)) faros.push(a)
    }
    if (faros.length === total) return faros
  }
  // Reparto fijo de reserva entre 40° y 320° (si el azar no encaja, sobre todo con 6).
  return Array.from({ length: total }, (_, i) => Math.round(40 + (i * 280) / (total - 1)))
}

/**
 * Pista según lo lejos que apunta el haz del faro buscado. `debil` (0-1, la parte de faros ya encendidos) encoge las
 * bandas: con el último faro sólo se nota «caliente» muy cerca y casi todo el mar sale frío.
 */
export function temperatura(distancia: number, tolerancia: number, debil = 0): Temperatura {
  const d = Math.abs(distancia)
  const k = Math.max(0, Math.min(1, debil))
  if (d <= tolerancia) return 'ardiendo'
  if (d <= tolerancia + 20 * (1 - 0.75 * k)) return 'caliente'
  if (d <= 75 - 55 * k) return 'templado'
  return 'frio'
}

/** `n` barcos señuelo, a `margen`° o más de cada faro y entre sí (para que no tapen un faro). */
export function generarSenuelos(
  semilla: string,
  faros: number[],
  n: number,
  margen = 22
): number[] {
  const rnd = aleatorio(`${semilla}:barcos`)
  const fuera: number[] = []
  for (let i = 0; i < 400 && fuera.length < Math.max(0, Math.min(4, Math.round(n))); i += 1) {
    const a = Math.round(rnd() * 360) % 360
    if ([...faros, ...fuera].every((f) => Math.abs(delta(f, a)) >= margen)) fuera.push(a)
  }
  return fuera
}

/** El faro sin encontrar más cercano al rumbo actual: índice y distancia con signo. */
export function masCercano(
  rumbo: number,
  faros: number[],
  encontrados: boolean[]
): { indice: number; distancia: number } {
  let indice = -1
  let distancia = 999
  faros.forEach((f, i) => {
    if (encontrados[i]) return
    const d = delta(rumbo, f)
    if (Math.abs(d) < Math.abs(distancia)) {
      indice = i
      distancia = d
    }
  })
  return { indice, distancia }
}

/**
 * Velocidad de giro alrededor del eje VERTICAL (°/s), en cualquier postura del móvil: el giro del giroscopio
 * (rotationRate: alpha = eje z, beta = eje x, gamma = eje y, en el marco del móvil) proyectado sobre la gravedad.
 */
export function giroVertical(
  rot: { alpha?: number | null; beta?: number | null; gamma?: number | null },
  g: { x?: number | null; y?: number | null; z?: number | null }
): number | null {
  const gx = Number(g.x)
  const gy = Number(g.y)
  const gz = Number(g.z)
  const norma = Math.sqrt(gx * gx + gy * gy + gz * gz)
  if (!Number.isFinite(norma) || norma < 3) return null
  const wx = Number(rot.beta) || 0
  const wy = Number(rot.gamma) || 0
  const wz = Number(rot.alpha) || 0
  return (wx * gx + wy * gy + wz * gz) / norma
}
