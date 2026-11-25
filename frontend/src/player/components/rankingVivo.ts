/**
 * Lógica pura de la clasificación en directo (sin React, se prueba en Node: tests/js/ranking_vivo_21.cjs).
 *
 * Una sola cuenta para dos casos: «lo que viste la última vez» (al abrir la hoja) y «el render anterior» (con la
 * hoja abierta). En los dos, `antes` es {usuario: puesto} y se compara con el orden de ahora.
 */
import type { TeamProfileLiveStatus } from '../../types/player'
import { getPlayerAvatarUrl, getPlayerColor } from '../../shared/playerIdentity'

type J = Pick<TeamProfileLiveStatus, 'user'>

/** Cuánto se queda el chip ▲/▼ de un cambio en directo. */
export const MS_CHIP = 6000
/** Tope de un reorden: con más filas que esto no se anima fila a fila (se ve como un salto limpio). */
export const MAX_FILAS_ANIMADAS = 40

export interface Movimiento {
  user: string
  /** Puesto anterior (1 = primero). */
  desde: number
  /** Puesto de ahora. */
  hasta: number
  /** Positivo = ha subido puestos; negativo = ha bajado. */
  delta: number
}

/** Lo que haya en el almacén local, ya limpio: sólo {usuario: puesto entero > 0}. Nunca lanza. */
export function puestosGuardados(bruto: string | null | undefined): Record<string, number> {
  const limpio: Record<string, number> = {}
  try {
    const datos = JSON.parse(bruto || '{}')
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return limpio
    for (const [u, p] of Object.entries(datos as Record<string, unknown>)) {
      const n = Number(p)
      if (Number.isInteger(n) && n > 0) limpio[u] = n
    }
  } catch {
    /* JSON roto: como si no hubiera nada */
  }
  return limpio
}

/** Identidad del ORDEN: cambia sólo si alguien cambia de sitio o entra/sale (no con cada latido). */
export function firmaDeOrden(sorted: J[]): string {
  return sorted.map((j) => j.user).join('|')
}

/**
 * Quién cambia de puesto respecto a `antes`. Quien no estaba antes (entra ahora) no cuenta como movimiento: no
 * hay de dónde deslizarlo. Quien ya no está, tampoco. Con claves repetidas gana la primera aparición.
 */
export function movimientos(
  antes: Record<string, number> | null | undefined,
  sorted: J[]
): Movimiento[] {
  if (!antes) return []
  const visto = new Set<string>()
  const lista: Movimiento[] = []
  sorted.forEach((j, i) => {
    if (visto.has(j.user)) return
    visto.add(j.user)
    const desde = Number(antes[j.user])
    const hasta = i + 1
    if (Number.isInteger(desde) && desde > 0 && desde !== hasta)
      lista.push({ user: j.user, desde, hasta, delta: desde - hasta })
  })
  return lista
}

/** Chips vivos: {usuario: {delta, marca}}. */
export type ChipsVivos = Record<string, { delta: number; marca: number }>

/**
 * Suma los movimientos nuevos a los chips que aún se ven: dos cambios seguidos de un mismo jugador suman (subió 2
 * y bajó 1 = ▲ 1) y, si se anulan, el chip desaparece. Devuelve un objeto NUEVO (sirve para `setState`).
 */
export function sumarChips(vivos: ChipsVivos, movs: Movimiento[], ahora: number): ChipsVivos {
  const nuevos: ChipsVivos = { ...vivos }
  for (const m of movs) {
    const delta = (nuevos[m.user]?.delta || 0) + m.delta
    if (delta === 0) delete nuevos[m.user]
    else nuevos[m.user] = { delta, marca: ahora }
  }
  return nuevos
}

/** Quita los chips con más de `MS_CHIP` ms. Devuelve el MISMO objeto si no caduca ninguno (sin re-render). */
export function caducarChips(vivos: ChipsVivos, ahora: number): ChipsVivos {
  let cambio = false
  const nuevos: ChipsVivos = {}
  for (const [u, c] of Object.entries(vivos)) {
    if (ahora - c.marca >= MS_CHIP) cambio = true
    else nuevos[u] = c
  }
  return cambio ? nuevos : vivos
}

/**
 * Desde dónde arranca la animación de una fila (px): lo que ya llevaba de la animación anterior sin acabar (`actual`)
 * más el salto nuevo. Así un segundo reorden a mitad del primero continúa desde donde se ve la fila, sin tirón.
 */
export function arranqueDeFila(actual: number, desde: number, hasta: number, alto: number): number {
  const px = actual + (desde - hasta) * alto
  return Math.abs(px) < 0.5 ? 0 : Math.round(px * 100) / 100
}

/** Los cambios «desde la última vez» que se ven al abrir: {usuario: delta}, congelados (no se recalculan con cada reorden). */
export function fijosDeApertura(antes: Record<string, number> | null | undefined, sorted: J[]): Record<string, number> {
  const f: Record<string, number> = {}
  for (const m of movimientos(antes, sorted)) f[m.user] = m.delta
  return f
}

/** Quien se mueve en directo deja de llevar su chip de la apertura (ya no es verdad); si no, reaparecería al caducar el vivo. */
export function quitarFijos(fijos: Record<string, number>, movs: Movimiento[]): Record<string, number> {
  if (!movs.some((m) => m.user in fijos)) return fijos
  const f = { ...fijos }
  for (const m of movs) delete f[m.user]
  return f
}

/**
 * Lo que la hoja pinta de cada jugador, en una cadena (24/11). La partida se repinta con cada lectura del GPS y cada
 * latido, y la hoja (montada aunque esté cerrada) repintaba con ella sus quince filas para dibujar lo mismo: si la
 * firma no cambia, la hoja no se repinta. Si se pinta algo nuevo en la hoja, tiene que entrar aquí.
 */
const firmas = new WeakMap<TeamProfileLiveStatus[], string>()

export function firmaDeLaHoja(players: TeamProfileLiveStatus[]): string {
  const hecha = firmas.get(players)
  if (hecha !== undefined) return hecha
  const firma = players
    .map((j) =>
      [
        j.user,
        j.display_name,
        j.presence,
        j.total_time_ms,
        j.level,
        j.finished ? 1 : 0,
        j.terminada_por_panel ? 1 : 0,
        j.finished_at,
        j.total_nodes,
        j.character,
        j.character_chosen ? 1 : 0,
        JSON.stringify(j.avatar ?? null),
        getPlayerColor(j),
        getPlayerAvatarUrl(j),
      ].join('\u0001')
    )
    .join('\u0002')
  firmas.set(players, firma)
  return firma
}

/** Sin claves repetidas (React las necesita únicas): si un usuario sale dos veces, se queda su mejor puesto (el primero). */
export function sinRepetidos<T extends J>(sorted: T[]): T[] {
  const visto = new Set<string>()
  const limpio = sorted.filter((j) => (visto.has(j.user) ? false : (visto.add(j.user), true)))
  return limpio.length === sorted.length ? sorted : limpio
}
