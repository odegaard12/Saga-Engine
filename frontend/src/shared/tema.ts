/**
 * Poner el tema del jugador sin llevarse por delante el resto del body.
 *
 * Llegó como `document.body.className = \`theme-${tema}\``, y eso no añade una
 * clase: sustituye todas. El body no es sólo del tema —el escáner de QR pone
 * ahí `saga-qr-scanner-open`, y de esa clase cuelga la regla que esconde la
 * barra de abajo mientras se enfoca la pegatina—, así que al repintar
 * reaparecía la barra ENCIMA del visor y volvía a tragarse los toques.
 *
 * Y estaba en el cuerpo del componente, o sea que corría con cada render:
 * `PlayerApp` se repinta con cada lectura del GPS, que caminando son segundos.
 *
 * Los valores por defecto viven en `:root` dentro de mobile-themes.css, así que
 * quedarse sin clase de tema no rompe nada; simplemente sale el aspecto de
 * siempre.
 */

const PREFIJO = 'theme-'

/**
 * Los temas que existen. Un solo sitio.
 *
 * Había cuatro eligiendo: `VALID_PLAYER_THEMES` en `main.py`, las clases de
 * `mobile-themes.css`, las `<option>` escritas a mano en el panel, y los
 * valores por defecto repartidos. Tres de ellos seguían diciendo `classic`, que
 * dejó de ser un tema válido: una misión sin tema dejaba el selector del panel
 * EN BLANCO, y al guardar el servidor lo convertía en `glass` sin que nadie lo
 * hubiese elegido.
 *
 * Hay una prueba que compara esta lista con la del servidor y con la del CSS.
 * Añadir un tema es tocar los tres, y la prueba avisa si te dejas uno.
 */
export const TEMAS = [
  { id: 'glass', etiqueta: 'Cristal (azul de noche)' },
  { id: 'flame-red', etiqueta: 'Fuego (rojo brasa)' },
] as const

export type IdDeTema = (typeof TEMAS)[number]['id']

/** El que se aplica si la misión no dice otra cosa. */
export const TEMA_POR_DEFECTO: IdDeTema = 'glass'

/** Lo que se pone cuando el móvil aún no sabe de qué misión es. */
const RESPALDO = `${PREFIJO}${TEMA_POR_DEFECTO}`

export function claseDelTema(tema?: string | null): string {
  const limpio = String(tema ?? '')
    .trim()
    .toLowerCase()
    // Va a una clase de CSS: lo que no sea letra, número o guion, fuera.
    .replace(/[^a-z0-9-]/g, '')

  return limpio ? `${PREFIJO}${limpio}` : RESPALDO
}

export function aplicarTema(tema?: string | null): void {
  if (typeof document === 'undefined' || !document.body) return

  const elegida = claseDelTema(tema)
  const body = document.body

  // Sólo se quitan las clases de tema. Las demás son de otros.
  for (const existente of Array.from(body.classList)) {
    if (existente.startsWith(PREFIJO) && existente !== elegida) {
      body.classList.remove(existente)
    }
  }

  body.classList.add(elegida)
}
