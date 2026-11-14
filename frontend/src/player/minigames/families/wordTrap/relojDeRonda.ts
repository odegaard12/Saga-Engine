/**
 * 14/11 (auditoría de partidas): la ronda se PAUSA con la página oculta. El reloj es de pared (`inicioRef`, guardado
 * para que cerrar la hoja no regale el tiempo entero) y volver de una llamada o de un aviso la hacía caducar: +30 s y
 * una ronda extra, además de la salida de la app que ya cuenta el anti-trampas (doble castigo). Al volver se corre
 * `inicio` lo que se estuvo fuera; la salida en sí la sigue castigando el anti-trampas, que es su sitio.
 */
export function descontarTiempoOculto(inicio: number, ocultoDesde: number, ahora: number): number {
  return inicio + Math.max(0, ahora - ocultoDesde)
}
