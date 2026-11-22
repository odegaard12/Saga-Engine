/**
 * Motor del Eco rítmico (30/10), sin React: genera la ronda y juzga cada golpe.
 *
 * Una ronda son `largo` golpes; cada golpe es una ficha y su duración (1 = punto, corto; 2 = raya, largo). Desde el
 * 22/11 («B mejorada») el largo se toca DEJANDO el dedo en la ficha: se juzga lo que dura cada golpe, no el hueco
 * entre golpes, así que el último también puede ser raya.
 */
export type Ronda = { fichas: number[]; pulsos: number[] }

function generador(semilla: string) {
  let hash = 2166136261
  for (let i = 0; i < semilla.length; i++) {
    hash ^= semilla.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  let estado = hash >>> 0
  return () => {
    estado = (Math.imul(estado, 1664525) + 1013904223) >>> 0
    return estado / 4294967296
  }
}

export function generarRonda(
  semilla: string,
  largo: number,
  fichas: number,
  largasPct: number
): Ronda {
  const azar = generador(semilla)
  const out: Ronda = { fichas: [], pulsos: [] }
  for (let i = 0; i < largo; i++) {
    let ficha = Math.floor(azar() * fichas)
    // Nunca tres iguales seguidas: con el ritmo encima se vuelve ilegible.
    if (i >= 2 && ficha === out.fichas[i - 1] && ficha === out.fichas[i - 2])
      ficha = (ficha + 1) % fichas
    out.fichas.push(ficha)
    out.pulsos.push(azar() * 100 < largasPct ? 2 : 1)
  }
  // Con notas largas pedidas, que cada ronda tenga al menos una: si no, el ritmo no cuenta.
  if (largasPct > 0 && largo >= 3 && !out.pulsos.includes(2))
    out.pulsos[Math.floor(largo / 2)] = 2
  return out
}

/**
 * Tiempos de una ronda, todos sacados de su pulso (`step_ms`, que baja 20 ms por ronda):
 * - `luzCorta`/`luzLarga`: cuánto se enciende un punto / una raya al escucharla, y `hueco` el silencio de detrás.
 * - `umbral`: lo que hay que dejar el dedo para que cuente como raya (lo que tarda en cerrarse el aro). Entre 300 y
 *   560 ms: un toque normal dura 80-200 ms incluso en un móvil lento, así que nadie hace una raya sin querer, y
 *   mantener medio segundo no cansa. La raya de la escucha dura al menos 1,5 umbrales: se ve claramente más larga.
 */
export function tiemposDeRonda(pulsoMs: number) {
  const umbral = Math.round(Math.max(300, Math.min(560, pulsoMs * 0.6)))
  return {
    // El punto nunca se enciende más de 0,6 umbrales: quien lo imite con el dedo no llega a raya.
    luzCorta: Math.round(Math.max(160, Math.min(umbral * 0.6, pulsoMs * 0.4))),
    luzLarga: Math.round(Math.max(pulsoMs * 1.2, umbral * 1.5)),
    hueco: Math.round(pulsoMs * 0.6),
    umbral,
  }
}

/** Margen al soltar justo cuando el aro se cierra: el aro pintado puede ir un fotograma o dos por detrás del reloj. */
export const GRACIA_MS = 40

/** ¿Ese golpe fue raya? `ms` = desde que bajó el dedo hasta que lo levantó. */
export function esRaya(ms: number, umbral: number): boolean {
  return ms >= umbral - GRACIA_MS
}

export type Golpe = { ficha: number; raya: boolean; ok: boolean; fallo: null | 'ficha' | 'ritmo' }

/** Juzga el golpe `i` de la ronda: ficha y duración. Un golpe malo dice por qué (la ficha manda sobre la duración). */
export function juzgarGolpe(ronda: Ronda, i: number, ficha: number, ms: number, umbral: number): Golpe {
  const raya = esRaya(ms, umbral)
  const fallo = ficha !== ronda.fichas[i] ? 'ficha' : raya !== (ronda.pulsos[i] === 2) ? 'ritmo' : null
  return { ficha, raya, ok: !fallo, fallo }
}
