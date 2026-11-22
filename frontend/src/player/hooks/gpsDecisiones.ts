/**
 * Decisiones del GPS del jugador, sin React ni navegador (para poder probarlas con lecturas sintéticas).
 *
 * 11/11 (auditoría, GPS en zona rural): lejos del nodo se usa la ubicación barata (wifi/antena), que en el monte
 * puede errar más de 250 m. Cada 90 s se pide una lectura de satélite suelta, pero:
 *  - una lectura barata posterior, mucho peor, pisaba a la precisa: la flecha saltaba y el nodo sólo se abría en la
 *    ventana justo después de cada lectura precisa;
 *  - el paso a seguimiento preciso se decidía en el siguiente ciclo de 90 s, con la distancia de ese momento.
 */

import { Anclas, distanciaM } from '../avatares/movimientoSuave'

/** A esta distancia del nodo (o menos) hace falta el seguimiento de precisión. */
export const DISTANCIA_MODO_PRECISO_M = 250
/** Una lectura con un error declarado mayor que esto no es fiable para decidir que se está cerca. */
export const PRECISION_FIABLE_M = 100
/** Lo que dura la preferencia por la última lectura buena frente a una mucho peor. */
export const VIGENCIA_DE_LA_BUENA_MS = 60_000

/**
 * ¿La lectura nueva es MUCHO peor que la última publicada, y ésta sigue vigente? Entonces no se publica: se queda
 * la buena. «Mucho peor» = poco fiable (> 100 m) y con más del doble de error. Sin precisión declarada en alguna de
 * las dos no se puede comparar: se publica, como siempre.
 */
export function esLecturaMuchoPeor(
  previa: { precision: number | null; t: number } | null,
  precisionNueva: number | null,
  ahora: number
): boolean {
  if (!previa || previa.precision === null || precisionNueva === null) return false
  if (ahora - previa.t >= VIGENCIA_DE_LA_BUENA_MS) return false
  return precisionNueva > PRECISION_FIABLE_M && precisionNueva > 2 * previa.precision
}

/**
 * ¿Hay que pasar YA de seguimiento barato a preciso? Sí cuando una lectura fiable deja al jugador a 250 m o menos
 * del nodo. Sólo desde 'barato' (lejos a propósito): 'por_red' es un fallo del chip y lo reintenta su propio ciclo.
 */
export function debeSubirAPreciso(
  modo: 'preciso' | 'barato' | 'por_red',
  distanciaAlNodoM: number | null,
  precisionM: number | null
): boolean {
  return (
    modo === 'barato' &&
    distanciaAlNodoM !== null &&
    distanciaAlNodoM <= DISTANCIA_MODO_PRECISO_M &&
    precisionM !== null &&
    precisionM <= PRECISION_FIABLE_M
  )
}

/**
 * 22/11 (GPS y minimapa). Más deprisa que esto (m/s, ya descontado el error declarado de las dos lecturas) no va nadie
 * del juego, ni en coche por la general: es un rebote del GPS (wifi de otro sitio, antena lejana con precisión de 20 m).
 */
export const VELOCIDAD_IMPOSIBLE_MS = 50
/** El salto imposible se da por bueno si la lectura siguiente cae así de cerca de él: no rebotó, estabas allí. */
export const CONFIRMA_SALTO_M = 30
/** Una lectura más vieja que la última aceptada, hasta este atraso, es de la caché y llega tarde; más, el reloj cambió. */
export const ATRASO_MAXIMO_MS = 60_000

export type LecturaCruda = { lat: number; lon: number; precision: number | null; t: number }

/** La hora de una lectura: la suya, salvo que venga del futuro (relojes del GPS adelantados en algunos Android). */
export function horaDeLaLectura(timestamp: unknown, ahora: number): number {
  return typeof timestamp === 'number' && Number.isFinite(timestamp) ? Math.min(timestamp, ahora) : ahora
}

/** ¿Ir de `a` a `b` exige ir más deprisa que `VELOCIDAD_IMPOSIBLE_MS`, aun dando por buenos los dos errores? */
export function esSaltoImposible(a: LecturaCruda, b: LecturaCruda): boolean {
  const segundos = Math.max(1, (b.t - a.t) / 1000)
  const metros = distanciaM(a, b) - Math.max(0, a.precision ?? 0) - Math.max(0, b.precision ?? 0)
  return metros > VELOCIDAD_IMPOSIBLE_MS * segundos
}

/**
 * 22/11: lo que se publica de cada lectura del GPS, para TODO lo que la usa (distancia de la tarjeta, mini brújula,
 * guía, «fuera del trazado», abrir el nodo). Antes sólo el muñeco del mapa filtraba el baile (`Anclas`): parado, el
 * GPS movía 3-8 m la distancia, la flecha de la brújula y el arranque de la guía a cada segundo, y en el borde del
 * radio el nodo se abría y se cerraba solo.
 *
 * - Descarta la lectura ATRASADA (el `getCurrentPosition` de caché de cada rearranque llegando tras una del
 *   seguimiento: el punto volvía atrás).
 * - Descarta el SALTO IMPOSIBLE hasta que otra lectura lo confirme (un rebote suelto no abre un nodo ni dice «fuera
 *   del trazado»; si de verdad estás allí, la segunda lo acepta).
 * - Y el baile parado no mueve el punto: `Anclas`, la misma de los muñecos (andando sigue cada lectura).
 */
export class FiltroGps {
  private ultima: LecturaCruda | null = null
  private salto: LecturaCruda | null = null
  private readonly anclas = new Anclas()

  /** El punto a publicar, o null si la lectura se descarta. */
  leer(l: LecturaCruda): { lat: number; lon: number } | null {
    const u = this.ultima
    if (u && l.t < u.t && u.t - l.t <= ATRASO_MAXIMO_MS) return null
    if (u && esSaltoImposible(u, l)) {
      const s = this.salto
      if (!s || distanciaM(s, l) > Math.max(CONFIRMA_SALTO_M, l.precision ?? 0)) {
        this.salto = l
        return null
      }
    }
    this.salto = null
    this.ultima = l
    return this.anclas.fijar('yo', l, l.precision)
  }
}
