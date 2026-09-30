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
 * Pantalla final. Quien ha terminado va siempre por delante de quien sigue
 * jugando: si no, un jugador por el nodo 3 adelantaría al que acabó sólo por
 * llevar menos tiempo acumulado. Entre los que han terminado gana el tiempo
 * total más bajo, y el que no tiene tiempo va detrás de los que sí lo tienen.
 */
export function ordenarPorTiempoTotal(players: TeamProfileLiveStatus[]): TeamProfileLiveStatus[] {
  return [...players].sort((a, b) => {
    const finA = a.finished ? 1 : 0
    const finB = b.finished ? 1 : 0
    if (finA !== finB) return finB - finA

    if (a.finished && b.finished) {
      const porTiempo = compararTiempos(a.total_time_ms, b.total_time_ms)
      if (porTiempo !== 0) return porTiempo
    } else {
      const lvlA = a.level || 0
      const lvlB = b.level || 0
      if (lvlA !== lvlB) return lvlB - lvlA
    }

    return compararPorNombre(a, b)
  })
}

function leerNumero(player: TeamProfileLiveStatus, claves: string[]): number {
  const bruto = player as unknown as Record<string, unknown>
  for (const clave of claves) {
    const valor = bruto[clave]
    if (typeof valor === 'number' && Number.isFinite(valor)) return valor
  }
  return 0
}

/**
 * Hora en que acabó el jugador, si el servidor la manda. Sólo campos que no
 * cambian una vez puestos: `last_seen` y `updated_at` se mueven con cada
 * latido y desempatarían de forma distinta cada vez.
 */
function leerFinDePartida(player: TeamProfileLiveStatus): number {
  const bruto = player as unknown as Record<string, unknown>
  for (const clave of ['finished_at', 'completed_at']) {
    const marca = leerMarcaDeTiempo(bruto[clave])
    if (marca !== null) return marca
  }
  return Number.MAX_SAFE_INTEGER
}

/**
 * Hoja de la clasificación (también con partida en marcha): puntos, luego nodo
 * (quien terminó cuenta como el último), luego tiempo total, y por último los
 * desempates que no se mueven.
 */
export function ordenarClasificacion(players: TeamProfileLiveStatus[]): TeamProfileLiveStatus[] {
  return [...players].sort((a, b) => {
    const puntosA = leerNumero(a, ['score', 'points', 'total_points'])
    const puntosB = leerNumero(b, ['score', 'points', 'total_points'])
    if (puntosA !== puntosB) return puntosB - puntosA

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
