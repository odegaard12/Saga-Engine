/**
 * Lectura de fechas que no se rinde con Safari.
 *
 * El servidor manda las marcas de tiempo con `datetime.isoformat()`, o sea con
 * SEIS decimales de segundo: `2026-08-06T12:00:00.123456+00:00`. El estándar de
 * JavaScript sólo obliga a entender tres, y Safari ha devuelto NaN con más de
 * una versión. Chrome se lo traga, así que un fallo así sólo aparecería en los
 * iPhone y en mitad del monte.
 *
 * Y NaN no es inofensivo: la clasificación manda al final al que no se puede
 * leer, y la mochila da por vieja una marca que no entiende.
 */
export function leerMarcaDeTiempo(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isFinite(valor) && valor > 0) return valor

  if (typeof valor !== 'string') return null

  const texto = valor.trim()
  if (!texto) return null

  const directo = Date.parse(texto)
  if (Number.isFinite(directo)) return directo

  // Decimales de más: se dejan en tres, que es lo que manda el estándar.
  const recortado = texto.replace(/(\.\d{3})\d+/, '$1')
  const conTres = Date.parse(recortado)
  if (Number.isFinite(conTres)) return conTres

  // Formato con espacio en vez de T (`2026-08-06 12:00:00`), que Safari
  // tampoco acepta.
  const conT = Date.parse(recortado.replace(' ', 'T'))
  if (Number.isFinite(conT)) return conT

  return null
}
