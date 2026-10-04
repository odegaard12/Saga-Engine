import { registrarEvidencia } from '../../avance/evidencia'

/**
 * El modo alternativo (táctil o deslizador) de los juegos de sensores.
 *
 * `shake_charge`, `pulso_hierro` y el rumbo (`bearing_hunt`/`rumbo_doble`) se
 * juegan con el acelerómetro o la brújula. Para un móvil sin sensor tienen un
 * modo táctil, pero se ofrecía siempre, desde el primer momento: tocar un
 * botón 16 veces es mucho más fácil que agitar el móvil con el pulso justo, así
 * que el reto de verdad no lo jugaba nadie.
 *
 * Ahora:
 * - sólo se ofrece si el sensor de verdad no está (o no manda datos) o el
 *   jugador deniega el permiso;
 * - si se usa, cuesta un minuto (`penaltyMs`) y queda en la evidencia
 *   (`modo_alternativo`), y el servidor impone ese minuto aunque el móvil no
 *   lo mande (ver `penalizacion_minima` en main.py).
 */

export const PENALIZACION_MODO_ALTERNATIVO_MS = 60_000

/** Entre dos toques válidos del modo táctil, como mínimo (un dedo apoyado no son 20 pulsos). */
export const INTERVALO_MINIMO_TOQUE_MS = 120

/** Cuánto se espera a que el sensor mande una lectura antes de darlo por mudo. */
export const ESPERA_SENSOR_MUDO_MS = 2_500

export type EstadoDelSensor = 'sin_comprobar' | 'disponible' | 'no_disponible' | 'denegado' | 'mudo'

/** ¿Se puede ofrecer el modo alternativo con este estado del sensor? */
export function puedeUsarModoAlternativo(
  estado: EstadoDelSensor,
  permitidoPorElNodo = true
): boolean {
  if (!permitidoPorElNodo) return false
  return estado === 'no_disponible' || estado === 'denegado' || estado === 'mudo'
}

/** La penalización que se manda al ganar. */
export function penalizacionDelModo(usado: boolean, base = 0): number {
  const previa = Math.max(0, Math.round(base || 0))
  return usado ? previa + PENALIZACION_MODO_ALTERNATIVO_MS : previa
}

/** Deja en la evidencia del nodo que se jugó en modo alternativo, y por qué. */
export function marcarModoAlternativo(
  nodo: string | number | undefined,
  motivo: EstadoDelSensor
): void {
  registrarEvidencia(nodo ?? '', {
    modo_alternativo: true,
    modo_alternativo_motivo: motivo,
    penalizacion_modo_alternativo_ms: PENALIZACION_MODO_ALTERNATIVO_MS,
  })
}

/**
 * Un limitador de toques: devuelve `true` si este toque cuenta.
 *
 * Con el modo táctil cada toque era un pulso: un dedo tamborileando (o un
 * autoclic) llenaba la barra en un par de segundos.
 */
export function crearLimitadorDeToques(intervaloMinimoMs = INTERVALO_MINIMO_TOQUE_MS) {
  let ultimo = -Infinity
  return (ahoraMs: number): boolean => {
    if (ahoraMs - ultimo < intervaloMinimoMs) return false
    ultimo = ahoraMs
    return true
  }
}

/** La penalización que trae el resultado de un juego, si es un número válido. */
export function penalizacionDelResultado(resultado: unknown): number | undefined {
  const valor = (resultado as { penaltyMs?: unknown } | null | undefined)?.penaltyMs
  return typeof valor === 'number' && Number.isFinite(valor) && valor > 0
    ? Math.round(valor)
    : undefined
}
