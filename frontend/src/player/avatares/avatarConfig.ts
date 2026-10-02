import { esPersonaje, PERSONAJES, personajePorDefecto, type Personaje } from './personajes'

/**
 * El avatar como CONFIGURACIÓN, no como un nombre suelto.
 *
 * Hoy es `{ character }`. Cuando haya piel, pelo, ropa o colores irán dentro de
 * `parts` (`{ skin: '3', hair: 'trenzas' }`) sin cambiar nada de lo de aquí:
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
  return [canon.character, ...partes].join('|')
}

/** Lo que devuelve `GET /api/personaje/{user}`. */
export type EstadoDePersonaje = {
  character_chosen: boolean
  avatar: AvatarConfig | null
  taken: { hash?: string; avatar: AvatarConfig }[]
}

export function leerEstadoDePersonaje(crudo: unknown): EstadoDePersonaje | null {
  if (!crudo || typeof crudo !== 'object') return null
  const c = crudo as { character_chosen?: unknown; avatar?: unknown; taken?: unknown }
  const taken = Array.isArray(c.taken) ? c.taken : []
  return {
    character_chosen: c.character_chosen === true,
    avatar: normalizarAvatar(c.avatar),
    taken: taken
      .map((t) => normalizarAvatar((t as { avatar?: unknown } | null)?.avatar))
      .filter((a): a is AvatarConfig => a !== null)
      .map((avatar) => ({ avatar })),
  }
}

/** Las claves de lo que ya tienen los demás. */
export function clavesOcupadas(taken: { avatar: unknown }[]): Set<string> {
  return new Set(taken.map((t) => claveDeAvatar(t.avatar)).filter(Boolean))
}

export function estaOcupado(avatar: unknown, ocupadas: Set<string>): boolean {
  return ocupadas.has(claveDeAvatar(avatar))
}

/**
 * El primero libre, empezando por `preferido` y siguiendo la lista (el mismo
 * recorrido que el servidor). Si no queda ninguno, null.
 */
export function primerLibre(ocupadas: Set<string>, preferido: Personaje): Personaje | null {
  const inicio = PERSONAJES.indexOf(preferido)
  for (let paso = 0; paso < PERSONAJES.length; paso += 1) {
    const candidato = PERSONAJES[(inicio + paso) % PERSONAJES.length]
    if (!ocupadas.has(claveDeAvatar({ character: candidato }))) return candidato
  }
  return null
}

/** Con qué personaje se abre el selector: el tuyo si lo tienes, y si no el que te toca si está libre, o el siguiente libre. */
export function personajeInicial(usuario: string, actual: Personaje | null, ocupadas: Set<string>): Personaje {
  if (actual && !ocupadas.has(claveDeAvatar({ character: actual }))) return actual
  return primerLibre(ocupadas, actual ?? personajePorDefecto(usuario)) ?? actual ?? personajePorDefecto(usuario)
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
