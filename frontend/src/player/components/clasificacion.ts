import type { TeamProfileLiveStatus } from '../../types/player'
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
  const valor = Number(ms)
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
export function compararPorNombre(a: TeamProfileLiveStatus, b: TeamProfileLiveStatus): number {
  const porNombre = (a.display_name || a.user || '').localeCompare(b.display_name || b.user || '')
  if (porNombre !== 0) return porNombre
  return String(a.user || '').localeCompare(String(b.user || ''))
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
  return [...players].sort((a, b) => {
    const finA = a.finished ? 1 : 0
    const finB = b.finished ? 1 : 0
    if (finA !== finB) return finB - finA

    if (a.finished && b.finished) {
      const porTiempo = compararTiempos(a.total_time_ms, b.total_time_ms)
      if (porTiempo !== 0) return porTiempo
      const porFin = leerFinDePartida(a) - leerFinDePartida(b)
      if (porFin !== 0) return porFin
    } else {
      const lvlA = a.level || 0
      const lvlB = b.level || 0
      if (lvlA !== lvlB) return lvlB - lvlA
    }

    return compararPorNombre(a, b)
  })
}

/**
 * Hoja de la clasificación (también con partida en marcha): nodo (quien terminó
 * cuenta como el último), luego tiempo total, y por último los desempates que no
 * se mueven: la hora de fin, el nombre y el id. Aquí se leían también `score` y
 * `points`, que el servidor no ha mandado nunca: código muerto, fuera.
 */
export function ordenarClasificacion(players: TeamProfileLiveStatus[]): TeamProfileLiveStatus[] {
  return [...players].sort((a, b) => {
    const lvlA = a.finished ? 999 : a.level || 0
    const lvlB = b.finished ? 999 : b.level || 0
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
