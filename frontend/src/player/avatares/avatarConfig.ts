import { esPersonaje, type Personaje } from './personajes'

/**
 * El avatar como CONFIGURACIÓN, no como un nombre suelto.
 *
 * `{ character }` a secas es la versión 2D; el personaje 3D, sus colores y sus complementos
 * van dentro de `parts` (`{ mx: 'Ch01', top: 0, ... }`, ver `avatares3d/mixamo/catalogo.ts`):
 * la unicidad compara la forma canónica entera. Módulo puro, para Node.
 * Misma forma canónica que `normalizar_avatar` del servidor.
 */
export type ParteDeAvatar = string | number
export type AvatarConfig = { character: Personaje; parts?: Record<string, ParteDeAvatar> }

export function normalizarAvatar(valor: unknown): AvatarConfig | null {
  if (typeof valor === 'string') valor = { character: valor }
  if (!valor || typeof valor !== 'object') return null
  const v = valor as { character?: unknown; parts?: unknown }
  if (!esPersonaje(v.character)) return null
  const resultado: AvatarConfig = { character: v.character }
  if (v.parts && typeof v.parts === 'object') {
    const limpias: Record<string, ParteDeAvatar> = {}
    for (const clave of Object.keys(v.parts as object).sort()) {
      const parte = (v.parts as Record<string, unknown>)[clave]
      if (typeof parte === 'string' || typeof parte === 'number') limpias[clave] = parte
    }
    if (Object.keys(limpias).length > 0) resultado.parts = limpias
  }
  return resultado
}

/** Una cadena estable por configuración: dos avatares iguales dan la misma. */
export function claveDeAvatar(avatar: unknown): string {
  const canon = normalizarAvatar(avatar)
  if (!canon) return ''
  const partes = canon.parts ? Object.keys(canon.parts).map((k) => `${k}=${String(canon.parts![k])}`) : []
  // Con `mx` (personaje 3D) `character` es sólo el nombre de reserva y no cuenta: igual que en el servidor.
  return [...(canon.parts?.mx === undefined ? [canon.character] : []), ...partes].join('|')
}

/** Lo que devuelve `GET /api/personaje/{user}`. */
export type EstadoDePersonaje = {
  character_chosen: boolean
  avatar: AvatarConfig | null
  taken: { hash?: string; avatar: AvatarConfig }[]
  /** Cuántos de los demás llevan cada personaje 3D (`{ Ch01: 2 }`): sólo informativo. */
  enUso: Record<string, number>
}

/**
 * El recuento por personaje: el que manda el servidor (`en_uso`) o, si es de una versión que aún no
 * lo manda, el que sale de contar lo que llevan los demás (`taken`). Sólo números, nunca nombres.
 */
export function contarEnUso(crudo: unknown, taken: { avatar: AvatarConfig }[]): Record<string, number> {
  const salida: Record<string, number> = {}
  if (crudo && typeof crudo === 'object' && !Array.isArray(crudo)) {
    for (const [mx, n] of Object.entries(crudo as Record<string, unknown>)) {
      if (typeof n === 'number' && Number.isFinite(n) && n > 0) salida[mx] = Math.floor(n)
    }
    return salida
  }
  for (const t of taken) {
    const mx = t.avatar.parts?.mx
    if (typeof mx === 'string') salida[mx] = (salida[mx] ?? 0) + 1
  }
  return salida
}

export function leerEstadoDePersonaje(crudo: unknown): EstadoDePersonaje | null {
  if (!crudo || typeof crudo !== 'object') return null
  const c = crudo as { character_chosen?: unknown; avatar?: unknown; taken?: unknown; en_uso?: unknown }
  const taken = (Array.isArray(c.taken) ? c.taken : [])
    .map((t) => normalizarAvatar((t as { avatar?: unknown } | null)?.avatar))
    .filter((a): a is AvatarConfig => a !== null)
    .map((avatar) => ({ avatar }))
  return {
    character_chosen: c.character_chosen === true,
    avatar: normalizarAvatar(c.avatar),
    taken,
    enUso: contarEnUso(c.en_uso, taken),
  }
}

/** Las claves de lo que ya tienen los demás. */
export function clavesOcupadas(taken: { avatar: unknown }[]): Set<string> {
  return new Set(taken.map((t) => claveDeAvatar(t.avatar)).filter(Boolean))
}

/**
 * ¿Hay que enseñar el selector ANTES de la pantalla de carga?
 *
 * - Ya elegido en este móvil: nunca.
 * - El servidor dice que ya lo eligió: no (y se recuerda en el móvil).
 * - El servidor dice que no: sí.
 * - Sin contestación del servidor (primer acceso sin cobertura): sí, pero el selector
 *   se puede cerrar sin elegir y se entra igual; lo elegido se sincroniza luego.
 */
export function debeMostrarseLaEleccion(args: {
  local: Personaje | null
  servidor: 'elegido' | 'sin-elegir' | 'sin-respuesta'
}): boolean {
  if (args.local) return false
  return args.servidor !== 'elegido'
}
