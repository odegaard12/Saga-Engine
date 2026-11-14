import type { PlayerGamePayload, PublicConfig } from '../types/player'

/**
 * 14/11 (auditoría de antifallos): la forma MÍNIMA de lo que manda el servidor. Un 200 con otro JSON (un proxy, una
 * versión mezclada, `{}`) se guardaba como paquete, sobrescribía el bueno de IndexedDB (nivel 0, sin nodos) y se pintaba.
 * Con esto, lo que no cuadra se trata como un error de red y no toca lo guardado.
 */
export function esPartidaValida(x: unknown): x is PlayerGamePayload {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return false
  const p = x as Record<string, unknown>
  return (
    typeof p.user === 'string' &&
    p.user.length > 0 &&
    Array.isArray(p.stages) &&
    typeof p.level === 'number' &&
    Number.isFinite(p.level)
  )
}

export function esConfigValida(x: unknown): x is PublicConfig {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}
