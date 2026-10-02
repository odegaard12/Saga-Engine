/**
 * La pantalla de carga entra con fundido UNA vez por sesion.
 *
 * Hay dos pantallas de carga -la neutra («Conectando con la mision…»,
 * `SplashScreen`) y la de las barras (`PantallaDeCarga`)- y el arranque pasa de
 * una a otra. Cada una tenia su propio fundido de entrada (900 ms las dos, con
 * dos `@keyframes` distintos): al pasar de la primera a la segunda la pantalla
 * volvia a nacer desde transparente y se veia un parpadeo antes de la barra.
 * Ahora solo la PRIMERA que se monta se funde (`sagaCapaEntra`, con las
 * fichas de `--saga-dur-larga`); la que la sustituye aparece ya opaca, sobre el
 * mismo fondo, sin corte. La salida hacia el juego es siempre el mismo velo
 * (PlayerApp).
 */
let yaEntro = false

/** true solo la primera vez que se llama en toda la sesion de la pagina. */
export function consumirEntradaSuave(): boolean {
  if (yaEntro) return false
  yaEntro = true
  return true
}

/** Solo para pruebas. */
export function reiniciarEntradaSuave(): void {
  yaEntro = false
}

export const ANIMACION_DE_ENTRADA_DE_PANTALLA =
  'sagaCapaEntra var(--saga-dur-larga) var(--saga-curva-entra) both'
