/**
 * El número de un campo de texto, o `null` si está vacío o no es un número (nunca 0 «por vacío»): un campo en blanco no
 * debe guardarse como «0 = no caduca / no se compra». Con un número válido lo redondea y lo recorta a [min, max].
 */
export function leerNumero(texto: string, min: number, max: number): number | null {
  if (texto.trim() === '') return null
  const n = Number(texto)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : null
}
