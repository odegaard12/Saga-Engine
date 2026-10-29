import { TABLA_DE_NIVELES } from './niveles.generado'

/**
 * Niveles 1-5 de los minijuegos (26/10/2026). El servidor decide los parámetros según `nivel` (ver
 * backend/app/runtime/niveles.py) y los manda ya materializados en la config del juego; este módulo es para lo que el
 * cliente necesita saber del nivel (variantes de jugabilidad, textos del panel). El nivel 2 es lo de hoy y es lo que
 * vale si la config no trae `nivel`: las misiones que ya existen no cambian. Mismo nivel para todos los jugadores.
 */
export type Nivel = 1 | 2 | 3 | 4 | 5
export const NIVELES: readonly Nivel[] = [1, 2, 3, 4, 5]
export const NIVEL_POR_DEFECTO: Nivel = 2

/** El nivel de una config: 1..5; sin valor, ilegible o fuera de rango, el de hoy (2) o el tope. */
export function nivelDe(config?: { nivel?: unknown } | null): Nivel {
  const bruto = config?.nivel
  if (bruto === undefined || bruto === null || typeof bruto === 'boolean') return NIVEL_POR_DEFECTO
  const n = Math.trunc(Number(bruto))
  if (!Number.isFinite(n)) return NIVEL_POR_DEFECTO
  return Math.max(1, Math.min(5, n)) as Nivel
}

/** Elige un valor según el nivel de la config: `porNivel(config, {1: a, 2: b, 3: c, 4: d, 5: e})`. */
export function porNivel<T>(config: { nivel?: unknown } | null | undefined, valores: Record<Nivel, T>): T {
  return valores[nivelDe(config)]
}

type Juegos = typeof TABLA_DE_NIVELES.juegos
export type JuegoConNiveles = keyof Juegos

export function tieneNiveles(juego: string): juego is JuegoConNiveles {
  return juego in TABLA_DE_NIVELES.juegos
}

/** Los parámetros que fija un nivel en un juego (para el panel; el servidor es quien los aplica). */
export function parametrosDeNivel(juego: JuegoConNiveles, nivel: Nivel): Record<string, number | boolean> {
  return { ...(TABLA_DE_NIVELES.juegos[juego].niveles[String(nivel) as '1'].params as Record<string, number | boolean>) }
}

/** Descripción corta del nivel en un juego, por ejemplo «13×13 · 16 agujeros · 90 s». */
export function textoDeNivel(juego: JuegoConNiveles, nivel: Nivel): string {
  return TABLA_DE_NIVELES.juegos[juego].niveles[String(nivel) as '1'].texto
}

export function nombreDeNivel(nivel: Nivel): string {
  return TABLA_DE_NIVELES.nombres_de_nivel[String(nivel) as '1']
}

/** Cuánto dura más o menos el juego respecto a hoy (estimación hasta calibrarla con jugadores). */
export function estimacionDeNivel(nivel: Nivel): number {
  return TABLA_DE_NIVELES.estimacion[String(nivel) as '1']
}
