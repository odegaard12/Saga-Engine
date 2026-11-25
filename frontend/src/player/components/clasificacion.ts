import type { PlayerGamePayload, TeamProfileLiveStatus } from '../../types/player'
import { leerMarcaDeTiempo } from '../../shared/fechas'

/**
 * El orden de la clasificación, en un solo sitio y sin React: lo comparten la
 * hoja de la clasificación y la pantalla final, y se prueba en Node
 * (`tests/js/logica_jugador.cjs`).
 *
 * Dos fallos que tenía, y que no pueden volver:
 *
 *  1. **El tiempo 0 ganaba.** `total_time_ms` llega a 0 cuando el servidor no ha
 *     anotado nada (un jugador recién reseteado, un latido sin tiempos, un
 *     avance que no traía el tiempo): «0» quiere decir «no se sabe», no «ha
 *     acabado en cero segundos». Se ordenaba como el mejor tiempo posible y ese
 *     jugador salía primero en la clasificación final.
 *
 *  2. **Los empates parpadeaban.** Se desempataba por `last_seen`, que cambia en
 *     CADA latido de cada móvil: dos jugadores empatados se intercambiaban de
 *     sitio cada pocos segundos, delante de todo el mundo. Se desempata sólo por
 *     lo que no cambia: la hora en que acabó (si se conoce), el nombre y, por
 *     último, el identificador, que es único.
 */

/** El tiempo si es un tiempo de verdad (positivo y finito); 0 = «no se sabe». */
export function tiempoConocido(ms: unknown): number {
  // 21/11: milisegundos enteros, como el servidor (`int` en clave_de_clasificacion).
  const valor = Math.trunc(Number(ms))
  return Number.isFinite(valor) && valor > 0 ? valor : 0
}

/**
 * Compara dos tiempos totales: el que se conoce va antes que el que no; entre
 * dos conocidos, el menor. Dos desconocidos empatan.
 */
export function compararTiempos(a: unknown, b: unknown): number {
  const tiempoA = tiempoConocido(a)
  const tiempoB = tiempoConocido(b)
  if (tiempoA && tiempoB) return tiempoA - tiempoB
  if (tiempoA) return -1
  if (tiempoB) return 1
  return 0
}

/** El desempate final, estable: nombre y, si aún empatan, el identificador. */
// 25/10 (auditoría): por código, como `str` en el servidor (clave_de_clasificacion). Con localeCompare, mayúsculas y
// acentos ordenaban distinto en el móvil y en el panel.
// 21/11: por PUNTO de código (como `str` en Python), no por unidad UTF-16: con emojis o símbolos fuera del plano
// básico el orden coincidía mal con el servidor.
const porCodigo = (x: string, y: string) => {
  const a = Array.from(x)
  const b = Array.from(y)
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const d = (a[i].codePointAt(0) ?? 0) - (b[i].codePointAt(0) ?? 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return a.length === b.length ? 0 : a.length < b.length ? -1 : 1
}

export function compararPorNombre(a: TeamProfileLiveStatus, b: TeamProfileLiveStatus): number {
  const porNombre = porCodigo(String(a.display_name || a.user || ''), String(b.display_name || b.user || ''))
  if (porNombre !== 0) return porNombre
  return porCodigo(String(a.user || ''), String(b.user || ''))
}

/**
 * Hora en que acabó el jugador (`finished_at`, la manda el servidor en el estado
 * vivo: ms desde la época). Sólo lo que no cambia una vez puesto: `last_seen` y
 * `updated_at` se mueven con cada latido y desempatarían de forma distinta cada vez.
 */
function leerFinDePartida(player: TeamProfileLiveStatus): number {
  const marca = leerMarcaDeTiempo(player.finished_at)
  return marca !== null ? marca : Number.MAX_SAFE_INTEGER
}

/**
 * Pantalla final. Quien ha terminado va siempre por delante de quien sigue
 * jugando: si no, un jugador por el nodo 3 adelantaría al que acabó sólo por
 * llevar menos tiempo acumulado. Entre los que han terminado gana el tiempo
 * total más bajo (lo calcula el servidor), el que no tiene tiempo va detrás de
 * los que sí lo tienen, y a igual tiempo gana quien acabó antes.
 */
export function ordenarPorTiempoTotal(players: TeamProfileLiveStatus[]): TeamProfileLiveStatus[] {
  // 25/10 (auditoría): el MISMO orden que la hoja y el servidor. Antes, a los que seguían jugando sólo los ordenaba
  // por nodo y nombre (sin tiempo) y la pantalla final podía dar otro puesto que la clasificación.
  return ordenarClasificacion(players)
}

/**
 * Hoja de la clasificación (también con partida en marcha): nodo (quien terminó
 * cuenta como el último), luego tiempo total, y por último los desempates que no
 * se mueven: la hora de fin, el nombre y el id. Aquí se leían también `score` y
 * `points`, que el servidor no ha mandado nunca: código muerto, fuera.
 */
export function ordenarClasificacion(players: TeamProfileLiveStatus[]): TeamProfileLiveStatus[] {
  return [...players].sort((a, b) => {
    // Terminados delante; quien acabó porque el organizador lo dio por terminado, tras quien acabó jugando (15/11, M1).
    const grupoA = a.finished ? (a.terminada_por_panel ? 1 : 2) : 0
    const grupoB = b.finished ? (b.terminada_por_panel ? 1 : 2) : 0
    if (grupoA !== grupoB) return grupoB - grupoA
    // 21/11 (decisión de Óscar: la regla del servidor): también entre terminados, más nodos delante (si se añadió un
    // nodo a la ruta, quien la hizo con ese nodo va antes que quien acabó sin él).
    const lvlA = Number(a.level) || 0
    const lvlB = Number(b.level) || 0
    if (lvlA !== lvlB) return lvlB - lvlA

    const porTiempo = compararTiempos(a.total_time_ms, b.total_time_ms)
    if (porTiempo !== 0) return porTiempo

    const finA = leerFinDePartida(a)
    const finB = leerFinDePartida(b)
    if (finA !== finB) return finA - finB

    return compararPorNombre(a, b)
  })
}

/** Nadie le ha visto mover ficha: ni nodo hecho ni tiempo. «Nodo 0 · 0m 00s» no decía nada (16/10). */
export function sinEmpezar(j: { level?: number; total_time_ms?: number; finished?: boolean }): boolean {
  return !j.finished && !(Number(j.level) > 0) && !((j.total_time_ms || 0) > 0)
}

/** Los nodos de la misión: los que dice el servidor (el mayor que llegue; nunca menos de 1). */
export function totalDeNodos(players: TeamProfileLiveStatus[]): number {
  return Math.max(1, ...players.map((j) => Number(j.total_nodes) || 0))
}

/**
 * Nodos hechos (quien ha terminado, todos). Es lo que pintan los tramos de cada fila.
 *
 * 24/10: la barra de antes comparaba tu tiempo con el del PRIMERO aunque fuerais por nodos distintos: el que iba
 * por el nodo 1 con poco tiempo salía con la barra casi llena. Ahora la fila dice cuántos nodos lleva, no un tiempo.
 */
export function nodosHechos(j: TeamProfileLiveStatus, total: number): number {
  if (j.finished) return total
  return Math.max(0, Math.min(total, Number(j.level) || 0))
}

/** Lo que te separa del de delante: un tiempo, unos nodos o un empate. `null` si no hay nada que decir. */
export type Distancia = { tipo: 'tiempo'; ms: number } | { tipo: 'nodos'; n: number } | { tipo: 'empate' } | null

/**
 * Sólo se restan tiempos si los dos van por el MISMO nodo (o los dos han terminado): restar el tiempo de quien va
 * un nodo por delante no dice nada. Si no, se cuenta en nodos («1 nodo detrás»).
 */
export function distanciaAlDeDelante(
  delante: TeamProfileLiveStatus | undefined,
  yo: TeamProfileLiveStatus,
  total: number
): Distancia {
  if (!delante || sinEmpezar(yo)) return null
  const nd = nodosHechos(delante, total)
  const ny = nodosHechos(yo, total)
  if (nd !== ny) return nd > ny ? { tipo: 'nodos', n: nd - ny } : null
  const td = tiempoConocido(delante.total_time_ms)
  const ty = tiempoConocido(yo.total_time_ms)
  if (!td || !ty) return null
  return ty > td ? { tipo: 'tiempo', ms: ty - td } : { tipo: 'empate' }
}

/**
 * Tu fila de la clasificación (sacada de PlayerApp el 24/11 para probarla). El propio jugador no viene en la lista de
 * «otros», así que se añade a mano: su nivel sale del payload, que es más fresco que el latido; del latido, lo que el
 * payload no trae (su personaje, los nodos). El tiempo, el del servidor si va por el mismo nodo y estado (su total:
 * max(declarado, observado)); si no, el del móvil, que suma lo que acaba de tardar aunque no haya cobertura: sin red
 * tu fila sigue al día y, al volver, el del servidor lo corrige. Si no, cada uno podía verse por delante del otro.
 */
export function tuFila(
  yo: TeamProfileLiveStatus | undefined,
  payload: Pick<PlayerGamePayload, 'user' | 'display_name' | 'level' | 'finished' | 'live_status' | 'profile' | 'stages'>
): TeamProfileLiveStatus {
  return {
    ...yo,
    total_nodes: yo?.total_nodes ?? payload.stages?.length,
    user: payload.user,
    display_name: payload.display_name || payload.user,
    presence: 'live',
    total_time_ms:
      yo && yo.level === payload.level && Boolean(yo.finished) === Boolean(payload.finished) && typeof yo.total_time_ms === 'number'
        ? yo.total_time_ms
        : payload.live_status?.total_time_ms,
    level: payload.level,
    finished: payload.finished,
    avatar_url: payload.profile?.avatar_url,
    avatar_ref: payload.profile?.avatar_ref,
    color: payload.profile?.color,
  }
}

/** Puestos de cada uno (1 = primero), para guardarlos y comparar la próxima vez. */
export function puestosDe(sorted: TeamProfileLiveStatus[]): Record<string, number> {
  const puestos: Record<string, number> = {}
  sorted.forEach((j, i) => {
    puestos[j.user] = i + 1
  })
  return puestos
}

/** Puestos ganados (positivo) o perdidos (negativo) desde la última vez que miraste; 0 si no se sabe. */
export function puestosGanados(
  antes: Record<string, number>,
  sorted: TeamProfileLiveStatus[],
  user: string | undefined
): number {
  const viejo = user ? Number(antes[user]) : 0
  const ahora = sorted.findIndex((j) => j.user === user) + 1
  return viejo > 0 && ahora > 0 ? viejo - ahora : 0
}
