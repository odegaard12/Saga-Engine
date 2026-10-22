/**
 * Pasa la inclinación del móvil (beta/gamma, que van en los ejes del APARATO)
 * a los ejes de la PANTALLA tal como la ve el jugador.
 *
 * Con el móvil en vertical coinciden. Con la pantalla girada a horizontal no:
 * inclinar a la derecha movía la bola hacia arriba o hacia abajo, y el
 * laberinto parecía roto. `angulo` es `screen.orientation.angle` (0, 90, 180,
 * 270) o el viejo `window.orientation` de iOS (0, 90, -90, 180).
 *
 * Devuelve `x` positivo = derecha, `y` positivo = abajo.
 */
export function ejesDePantalla(
  deltaGamma: number,
  deltaBeta: number,
  angulo: number
): { x: number; y: number } {
  const giro = ((Math.round(angulo) % 360) + 360) % 360
  if (giro === 90) return { x: deltaBeta, y: -deltaGamma }
  if (giro === 180) return { x: -deltaGamma, y: -deltaBeta }
  if (giro === 270) return { x: -deltaBeta, y: deltaGamma }
  return { x: deltaGamma, y: deltaBeta }
}

/** El giro de la pantalla ahora mismo, en grados (0 si el navegador no lo dice). */
export function anguloDePantalla(): number {
  if (typeof window === 'undefined') return 0
  const moderno = window.screen?.orientation?.angle
  if (typeof moderno === 'number') return moderno
  const viejo = (window as unknown as { orientation?: number }).orientation
  return typeof viejo === 'number' ? viejo : 0
}
