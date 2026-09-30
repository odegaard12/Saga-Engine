/**
 * El borrador del cajón de edición frente a lo que hace el mapa.
 *
 * El cajón de un nodo trabaja con una COPIA del nodo (`draft`) y cada cambio
 * devuelve esa copia entera a la vista general. Pero el MAPA también edita el
 * nodo mientras el cajón sigue abierto: arrastrar el pin cambia `lat`/`lon`, y
 * moldear el tramo cambia `route_via`/`route_track`. La copia no se enteraba:
 * el siguiente cambio en el cajón (un título, un radio) devolvía las
 * coordenadas y el moldeado VIEJOS y el nodo saltaba de vuelta a su sitio de
 * antes, sin ningún aviso (informe A6).
 *
 * Reglas: lo que es del mapa se toma siempre de la vista viva, y el parche que
 * escribe la persona manda sobre todo (si teclea unas coordenadas, son las suyas).
 */

export const MAP_OWNED_KEYS = ['lat', 'lon', 'route_via', 'route_track'] as const

type Registro = Record<string, unknown>

function mismaLista(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false

  return a.every((punto, indice) => {
    const otro = b[indice]
    if (punto === otro) return true
    return (
      Array.isArray(punto) &&
      Array.isArray(otro) &&
      punto.length === otro.length &&
      punto.every((valor, i) => valor === otro[i])
    )
  })
}

function mismoValor(a: unknown, b: unknown): boolean {
  return Array.isArray(a) || Array.isArray(b) ? mismaLista(a, b) : a === b
}

/** ¿Llevan el borrador y la vista viva la misma geometría? */
export function sameGeometry(borrador: Registro, viva: Registro): boolean {
  return MAP_OWNED_KEYS.every((clave) => mismoValor(borrador[clave], viva[clave]))
}

/** El borrador con la geometría de la vista viva (copia; no toca el original). */
export function withMapGeometry<T extends Registro>(borrador: T, viva: Registro): T {
  if (sameGeometry(borrador, viva)) return borrador

  const siguiente: Registro = { ...borrador }
  for (const clave of MAP_OWNED_KEYS) {
    if (viva[clave] === undefined) delete siguiente[clave]
    else siguiente[clave] = viva[clave]
  }
  return siguiente as T
}

/**
 * El borrador tras aplicar un parche, partiendo de lo último que hay de verdad:
 * la geometría del mapa, después el parche.
 */
export function applyDraftPatch<T extends Registro>(borrador: T, viva: Registro, parche: Registro): T {
  return { ...withMapGeometry(borrador, viva), ...parche } as T
}
