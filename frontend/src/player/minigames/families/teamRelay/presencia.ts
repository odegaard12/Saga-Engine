/**
 * Cuántos jugadores cuentan para el Relevo de equipo.
 *
 * `required_members` es el total de jugadores que tienen que estar en el punto,
 * CONTANDO a quien juega: 2 = él y un compañero. Antes la pantalla contaba
 * sólo a los demás (`!p.is_self`) y comparaba con ese número, así que con el
 * valor por defecto (2) hacían falta tres personas y el admin decía otra cosa.
 *
 * Quien tiene el reto abierto está en el punto (la hoja sólo se abre allí), así
 * que cuenta siempre como uno.
 */
export const MIEMBROS_POR_DEFECTO = 2

export function miembrosNecesarios(valor: unknown): number {
  const n = Math.round(Number(valor))
  return Number.isFinite(n) && n >= 2 ? Math.min(20, n) : MIEMBROS_POR_DEFECTO
}

export function miembrosPresentes(companerosCerca: number): number {
  return 1 + Math.max(0, Math.round(companerosCerca || 0))
}

export function relevoListo(companerosCerca: number, necesarios: unknown): boolean {
  return miembrosPresentes(companerosCerca) >= miembrosNecesarios(necesarios)
}
