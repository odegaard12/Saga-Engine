/**
 * 14/11 (auditoría de antifallos): cuántas veces seguidas ha fallado un trozo de pantalla. Un fallo cuenta como
 * «seguido» si llega a menos de `VENTANA_MS` del anterior; pasado ese tiempo la cuenta vuelve a 1. Lo usa
 * `FronteraLocal` para ofrecer, tras el segundo fallo, borrar las partidas de minijuego guardadas en el móvil.
 */
export const VENTANA_DE_FALLOS_SEGUIDOS_MS = 120_000

export function fallosSeguidos(seguidosHastaAhora: number, ultimoFalloEn: number, ahora: number): number {
  return ultimoFalloEn > 0 && ahora - ultimoFalloEn < VENTANA_DE_FALLOS_SEGUIDOS_MS ? seguidosHastaAhora + 1 : 1
}

/** La confirmación nominal: la palabra escrita tal cual (sin mirar mayúsculas ni espacios de los lados). */
export function palabraConfirmada(escrito: string, palabra: string): boolean {
  return escrito.trim().toLocaleUpperCase('es') === palabra
}
