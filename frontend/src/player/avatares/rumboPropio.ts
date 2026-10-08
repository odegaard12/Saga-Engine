/**
 * Hacia dónde mira TU muñeco, para mandarlo en el latido: así los demás te ven orientado como tu
 * teléfono (el rumbo sale de tus fixes de GPS, que llegan cada segundo, y no de los latidos, que
 * llegan cada cinco y darían un rumbo tardío y a saltos).
 *
 * El mapa lo apunta en cada dibujo (`anotarRumboPropio`); el latido lo lee (`rumboParaLatido`).
 * Lógica pura: el tiempo entra por parámetro para poder probarlo en Node.
 */

/** Un rumbo apuntado hace más de esto ya no vale (te has parado o el mapa no se dibuja). */
export const RUMBO_PROPIO_CADUCA_MS = 15000

let ultimo: { grados: number; en: number } | null = null

export function anotarRumboPropio(grados: number | null, ahoraMs: number): void {
  if (grados === null || !Number.isFinite(grados)) return
  ultimo = { grados: ((grados % 360) + 360) % 360, en: ahoraMs }
}

/** Grados (0 = norte, horario, redondeados) o `undefined` si no hay uno reciente. */
export function rumboParaLatido(ahoraMs: number): number | undefined {
  if (!ultimo || ahoraMs - ultimo.en > RUMBO_PROPIO_CADUCA_MS) return undefined
  return Math.round(ultimo.grados) % 360
}

/** Sólo para las pruebas. */
export function olvidarRumboPropio(): void {
  ultimo = null
}
