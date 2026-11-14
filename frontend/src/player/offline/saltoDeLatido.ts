/**
 * 15/11: ¿se salta este latido por falta de cobertura? (la posición se apunta en el móvil y sube en bloque al volver)
 *
 * Con 30 % de pérdida, saltar tras UN fallo (la ventana de 45 s de `sinCoberturaAhora`) hacía llegar un latido de cada
 * dos: la frescura media de los compañeros pasaba de 51 s a 70 s por ahorrar 0,8 KB/min. Ahora:
 * - sin interfaz de red (modo avión), uno de cada cuatro, como antes;
 * - con red que falla, sólo desde el segundo fallo SEGUIDO, y entonces un intento por minuto (con la barra muerta la
 *   radio no se despierta cada 30 s; con un fallo suelto no se salta nada).
 */
export const REINTENTO_MIN_MS = 55_000

export function debeSaltarLatido(e: {
  sinInterfaz: boolean
  latidosSinInterfaz: number
  fallosSeguidos: number
  ahora: number
  ultimoIntento: number
}): boolean {
  if (e.sinInterfaz && e.latidosSinInterfaz % 4 !== 0) return true
  return e.fallosSeguidos >= 2 && e.ahora - e.ultimoIntento < REINTENTO_MIN_MS
}
