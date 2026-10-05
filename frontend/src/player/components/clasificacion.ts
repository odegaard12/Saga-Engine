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
