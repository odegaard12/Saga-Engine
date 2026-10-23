/**
 * Qué PIN enseña el panel tras cada acción (revisión 23/10/2026).
 *
 * Los PIN se ven UNA vez. Antes, cada respuesta sustituía a lo que había en pantalla: con un doble toque en
 * «Generar PIN para los que faltan», la segunda respuesta llegaba vacía («todos tienen ya su PIN») y borraba los
 * que acababa de dar la primera. Ya no se podían volver a ver y había que rehacerlos todos.
 *
 * - generar: se añaden los nuevos a los que ya se ven (un PIN rehecho sustituye al suyo); si no llega ninguno,
 *   se queda lo que había.
 * - quitar: los PIN dejan de valer, así que se dejan de enseñar.
 */
export function pinesAEnsenar(
  actuales: Record<string, string>,
  accion: string,
  recibidos: Record<string, string> | undefined
): Record<string, string> {
  if (accion === 'quitar') return {}
  if (accion !== 'generar' || !recibidos || !Object.keys(recibidos).length) return actuales
  return { ...actuales, ...recibidos }
}
