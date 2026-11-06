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
  // 6/11: los tres temas completos (tokens --s-* en mobile-themes.css). «ria» es Pizarra: el id no cambia, así las
  // misiones guardadas con él se ven igual.
  { id: 'ria', etiqueta: 'Pizarra (gris azulado)' },
  { id: 'dia', etiqueta: 'Día (claro, para pleno sol)' },
  { id: 'solpor', etiqueta: 'Solpor (atardecer na ría)' },
  // Los de antes siguen valiendo para no cambiarle el aspecto a una misión que ya los tenga.
  { id: 'glass', etiqueta: 'Cristal (antiguo)' },
  { id: 'flame-red', etiqueta: 'Fuego (antiguo)' },
  { id: 'sage-green', etiqueta: 'Musgo (antiguo)' },
] as const

export type IdDeTema = (typeof TEMAS)[number]['id']

/** El que se aplica si la misión no dice otra cosa. */
export const TEMA_POR_DEFECTO: IdDeTema = 'ria'

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

/** 6/11: el jugador puede elegir uno de los tres temas en Herramientas; se queda en su móvil. */
export const TEMAS_DEL_JUGADOR = ['ria', 'dia', 'solpor'] as const
const CLAVE_TEMA_JUGADOR = 'saga-tema-jugador'
let temaDeLaMision: string | null | undefined = null

export function temaDelJugador(): string | null {
  try {
    const guardado = window.localStorage.getItem(CLAVE_TEMA_JUGADOR)
    return guardado && (TEMAS_DEL_JUGADOR as readonly string[]).includes(guardado) ? guardado : null
  } catch {
    return null
  }
}

/** Guarda (o quita, con null) el tema del jugador y lo pone al momento. Sin elección manda el de la misión. */
export function elegirTemaDelJugador(tema: string | null): void {
  try {
    if (tema) window.localStorage.setItem(CLAVE_TEMA_JUGADOR, tema)
    else window.localStorage.removeItem(CLAVE_TEMA_JUGADOR)
  } catch {
    // Sin almacenamiento (modo privado): vale para esta sesión.
  }
  ponerClase(tema || temaDeLaMision)
}

export function aplicarTema(tema?: string | null): void {
  temaDeLaMision = tema
  ponerClase(temaDelJugador() || tema)
}

function ponerClase(tema?: string | null): void {
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
