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

/** Lo que se pone cuando el móvil aún no sabe de qué misión es. */
const RESPALDO = 'theme-glass'

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
