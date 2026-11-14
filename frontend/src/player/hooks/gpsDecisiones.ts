/**
 * Decisiones del GPS del jugador, sin React ni navegador (para poder probarlas con lecturas sintéticas).
 *
 * 11/11 (auditoría, GPS en zona rural): lejos del nodo se usa la ubicación barata (wifi/antena), que en el monte
 * puede errar más de 250 m. Cada 90 s se pide una lectura de satélite suelta, pero:
 *  - una lectura barata posterior, mucho peor, pisaba a la precisa: la flecha saltaba y el nodo sólo se abría en la
 *    ventana justo después de cada lectura precisa;
 *  - el paso a seguimiento preciso se decidía en el siguiente ciclo de 90 s, con la distancia de ese momento.
 */

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
