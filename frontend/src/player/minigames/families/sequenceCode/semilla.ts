/**
 * La semilla del patrón del Simón para un intento.
 *
 * Antes era «saga-simon» para TODOS los nodos y jugadores, y el móvil además
 * prefería `cfg.seed`: el patrón era el mismo para todo el mundo y siempre, así
 * que bastaba con que uno lo apuntase y lo pasase al grupo.
 *
 * Ahora el servidor manda una semilla por nodo y jugador (`seed`) y dice si la
 * fijó el organizador a propósito (`seed_fixed`). Si no está fijada, cada
 * intento (empezar de cero tras fallar) saca un patrón nuevo: no se puede
 * aprender por ensayo y error ni copiar. Con semilla fijada se respeta tal cual.
 */
const SEMILLAS_DE_SERIE = new Set(['', 'saga-simon', 'saga-maze'])

export function semillaDelIntento(
  cfg: Record<string, unknown>,
  nodo: string | number | undefined,
  intento: number
): string {
  const propia = String(cfg.seed ?? '').trim()
  const fijada = cfg.seed_fixed === true && !SEMILLAS_DE_SERIE.has(propia.toLowerCase())
  if (fijada) return propia

  // Sin semilla del servidor (paquete viejo): al menos distinta por nodo.
  const base = SEMILLAS_DE_SERIE.has(propia.toLowerCase()) ? `nodo-${String(nodo ?? '')}` : propia
  return `${base}:${Math.max(0, Math.round(intento || 0))}`
}
