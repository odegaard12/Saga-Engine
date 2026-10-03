/**
 * Los diez valores de `character` que conoce el servidor.
 *
 * Con los avatares 3D (`avatares3d/mixamo/`) ya no hay figuras dibujadas: `character` es el
 * nombre de reserva que se guarda con cada personaje 3D (`MX_LEGACY`) y el único dato que
 * tienen los jugadores de la versión 2D, que pasan a un personaje 3D con `MX_DE_LEGACY`. Módulo
 * puro, para Node.
 *
 * La lista es la MISMA que en backend/app/runtime/personajes.py (`PERSONAJES`). Si se toca una,
 * se toca la otra.
 */

export const PERSONAJES = [
  'explorador',
  'exploradora',
  'vikingo',
  'vikinga',
  'peregrino',
  'bruxa',
  'marinheira',
  'gaiteiro',
  'can',
  'raposo',
] as const

export type Personaje = (typeof PERSONAJES)[number]

export function esPersonaje(valor: unknown): valor is Personaje {
  return typeof valor === 'string' && (PERSONAJES as readonly string[]).includes(valor)
}
