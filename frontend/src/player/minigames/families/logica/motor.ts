/**
 * Lógica pura de los juegos de lógica (30/10/2026): Interrogatorio, Mastermind y Balanza.
 *
 * Todo sale de una semilla por nodo+jugador+intento (la manda el servidor, ver project_seeds_for_player): el MISMO
 * tamaño de problema para todos los jugadores del nodo (lo fija el nivel) y un caso distinto para cada uno, así que no
 * hay respuesta que pasar ni banco de preguntas que memorizar. Sin red: no hace falta nada más que esto.
 */

/** Generador determinista (mulberry32) a partir de un texto. */
export function azar(semilla: string): () => number {
  let h = 2166136261
  for (let i = 0; i < semilla.length; i += 1) {
    h ^= semilla.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  let a = h || 1
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function entero(r: () => number, n: number): number {
  return Math.floor(r() * n)
}

function barajar<T>(r: () => number, lista: T[]): T[] {
  const copia = lista.slice()
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = entero(r, i + 1)
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia
}

// ------------------------------------------------------------------ Interrogatorio

/** Lo que dice cada sospechoso. `sobre` es el índice del sospechoso del que habla. */
export type Dicho =
  | { tipo: 'tiene'; sobre: number }
  | { tipo: 'no_tiene'; sobre: number }
  | { tipo: 'miente'; sobre: number }
  | { tipo: 'dice_verdad'; sobre: number }

/** «Sólo uno dice la verdad» o «sólo uno miente». */
export type Regla = 'una_verdad' | 'una_mentira'

export type Caso = { nombres: string[]; dichos: Dicho[]; regla: Regla; culpable: number }

/** Los nombres de los personajes de la app (ya están en el repositorio). */
export const NOMBRES = [
  'Xoán',
  'Antía',
  'Brais',
  'Uxía',
  'Iria',
  'Martiño',
  'Carme',
  'Breixo',
  'Pelayo',
  'Noa',
]

/** ¿Es verdad lo que dice `i` si la llave la tiene `culpable`? Los «miente / dice la verdad» hablan de un dicho simple. */
export function esVerdad(dichos: Dicho[], i: number, culpable: number): boolean {
  const d = dichos[i]
  if (d.tipo === 'tiene') return culpable === d.sobre
  if (d.tipo === 'no_tiene') return culpable !== d.sobre
  const otro = esVerdad(dichos, d.sobre, culpable)
  return d.tipo === 'miente' ? !otro : otro
}

/** Quiénes podrían tener la llave cumpliendo la regla. Un caso bueno tiene exactamente uno. */
export function soluciones(dichos: Dicho[], regla: Regla): number[] {
  const n = dichos.length
  const out: number[] = []
  for (let k = 0; k < n; k += 1) {
    let verdades = 0
    for (let i = 0; i < n; i += 1) if (esVerdad(dichos, i, k)) verdades += 1
    if (regla === 'una_verdad' ? verdades === 1 : verdades === n - 1) out.push(k)
  }
  return out
}

/**
 * Un caso con solución ÚNICA (se comprueba al generarlo). `meta` permite «X miente / X dice la verdad» (siempre sobre
 * alguien que habla de la llave, para que no haya bucles); `mixta` alterna la regla entre casos.
 */
export function generarCaso(
  semilla: string,
  sospechosos: number,
  meta: boolean,
  mixta: boolean
): Caso {
  const r = azar(semilla)
  const n = Math.max(3, Math.min(5, Math.round(sospechosos)))
  for (let intento = 0; intento < 2000; intento += 1) {
    const nombres = barajar(r, NOMBRES).slice(0, n)
    const regla: Regla = mixta && r() < 0.5 ? 'una_mentira' : 'una_verdad'
    const dichos: Dicho[] = []
    const simples: number[] = []
    for (let i = 0; i < n; i += 1) {
      if (meta && i > 0 && simples.length && r() < 0.4) {
        const sobre = simples[entero(r, simples.length)]
        dichos.push({ tipo: r() < 0.65 ? 'miente' : 'dice_verdad', sobre })
      } else {
        dichos.push({ tipo: r() < 0.5 ? 'tiene' : 'no_tiene', sobre: entero(r, n) })
        simples.push(i)
      }
    }
    const sol = soluciones(dichos, regla)
    if (sol.length !== 1) continue
    // Que el dicho meta no hable de sí mismo, y que se mezcle quién habla primero.
    if (dichos.some((d, i) => (d.tipo === 'miente' || d.tipo === 'dice_verdad') && d.sobre === i))
      continue
    return { nombres, dichos, regla, culpable: sol[0] }
  }
  // ponytail: en la práctica sale en pocas vueltas; de reserva, un caso fijo resoluble.
  return {
    nombres: NOMBRES.slice(0, 3),
    dichos: [
      { tipo: 'tiene', sobre: 1 },
      { tipo: 'no_tiene', sobre: 1 },
      { tipo: 'tiene', sobre: 0 },
    ],
    regla: 'una_verdad',
    culpable: 2,
  }
}

// ------------------------------------------------------------------ Mastermind

export function generarCodigo(
  semilla: string,
  largo: number,
  simbolos: number,
  repetir: boolean
): number[] {
  const r = azar(semilla)
  if (repetir || largo > simbolos) return Array.from({ length: largo }, () => entero(r, simbolos))
  return barajar(
    r,
    Array.from({ length: simbolos }, (_, i) => i)
  ).slice(0, largo)
}

/** Bien colocados (`exactas`) y que están pero en otro sitio (`casi`). */
export function pistas(secreto: number[], intento: number[]): { exactas: number; casi: number } {
  let exactas = 0
  const restoS = new Map<number, number>()
  const restoI = new Map<number, number>()
  secreto.forEach((s, i) => {
    if (intento[i] === s) exactas += 1
    else {
      restoS.set(s, (restoS.get(s) || 0) + 1)
      restoI.set(intento[i], (restoI.get(intento[i]) || 0) + 1)
    }
  })
  let casi = 0
  restoI.forEach((veces, simbolo) => {
    casi += Math.min(veces, restoS.get(simbolo) || 0)
  })
  return { exactas, casi }
}

// ------------------------------------------------------------------ Balanza

export function bolaPesada(semilla: string, bolas: number): number {
  return entero(azar(semilla), Math.max(2, bolas))
}

/** −1 pesa más la izquierda, 1 la derecha, 0 equilibrio. */
export function pesar(pesada: number, izquierda: number[], derecha: number[]): -1 | 0 | 1 {
  const a = izquierda.length + (izquierda.includes(pesada) ? 1 : 0)
  const b = derecha.length + (derecha.includes(pesada) ? 1 : 0)
  return a === b ? 0 : a > b ? -1 : 1
}

/** ¿Se puede encontrar siempre con estas pesadas? (bolas ≤ 3^pesadas). Para el panel y las pruebas. */
export function resoluble(bolas: number, pesadas: number): boolean {
  return bolas <= 3 ** pesadas
}
