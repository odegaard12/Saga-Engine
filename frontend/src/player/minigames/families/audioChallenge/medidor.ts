/**
 * El medidor del desafío de audio: cuánto tiempo SEGUIDO hay ruido de verdad.
 *
 * Antes cada fotograma por encima de un 80 fijo sumaba un 2 % a la barra y cada
 * uno por debajo restaba un 1 %: medía fotogramas, no tiempo (un móvil a 120 Hz
 * llenaba la barra en la mitad que uno a 60 Hz) y una racha de viento suelta,
 * a golpes, la iba llenando sola. Ahora se mide con el reloj
 * (`performance.now()`): hay que estar por encima del umbral un tiempo
 * sostenido. Un hueco corto (una respiración, menos de `TOLERANCIA_HUECO_MS`) no
 * rompe la racha; uno más largo la empieza de cero.
 */

export const UMBRAL_POR_DEFECTO = 95
export const SOSTENIDO_POR_DEFECTO_MS = 2_500
export const TOLERANCIA_HUECO_MS = 150

export type ConfigDelMedidor = { umbral: number; sostenidoMs: number }

function numero(valor: unknown, defecto: number, minimo: number, maximo: number): number {
  const n = Number(valor)
  if (!Number.isFinite(n)) return defecto
  return Math.min(maximo, Math.max(minimo, Math.round(n)))
}

/** La configuración del nodo (la que manda el servidor), con sus topes. */
export function leerConfigDelMedidor(
  config: Record<string, unknown> | null | undefined
): ConfigDelMedidor {
  const cfg = config || {}
  return {
    umbral: numero(cfg.volume_threshold, UMBRAL_POR_DEFECTO, 40, 220),
    sostenidoMs: numero(cfg.sustain_ms, SOSTENIDO_POR_DEFECTO_MS, 1000, 10000),
  }
}

export type LecturaDelMedidor = {
  /** 0-100: lo que lleva de la racha actual. */
  progreso: number
  superado: boolean
}

export function crearMedidorSostenido({ umbral, sostenidoMs }: ConfigDelMedidor) {
  let inicioRacha: number | null = null
  let ultimoPorEncima: number | null = null

  return {
    /** `nivel`: volumen medio (0-255) de esta lectura; `ahoraMs`: performance.now(). */
    muestra(nivel: number, ahoraMs: number): LecturaDelMedidor {
      if (nivel > umbral) {
        if (inicioRacha === null) inicioRacha = ahoraMs
        ultimoPorEncima = ahoraMs
      } else if (ultimoPorEncima === null || ahoraMs - ultimoPorEncima > TOLERANCIA_HUECO_MS) {
        inicioRacha = null
        ultimoPorEncima = null
      }

      const llevado = inicioRacha === null ? 0 : ahoraMs - inicioRacha
      const progreso = Math.max(0, Math.min(100, (llevado / sostenidoMs) * 100))
      return { progreso, superado: llevado >= sostenidoMs }
    },
  }
}
