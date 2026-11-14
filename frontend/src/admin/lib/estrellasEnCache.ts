/**
 * Lo último que el panel sabe de las estrellas y piezas de cada jugador, para enseñarlo en la ficha SIN pedir nada
 * nuevo al abrirla: solo lo que ya cargó el panel «Desbloqueables» o la hoja «Dar…» (15/11).
 */
import type { DesbloqueablesResponse } from './adminApi'

let ultimo: DesbloqueablesResponse | null = null

export function recordarDesbloqueables(datos: DesbloqueablesResponse | null) {
  ultimo = datos
}

export function desbloqueablesRecordados(): DesbloqueablesResponse | null {
  return ultimo
}

/** El saldo de estrellas de un jugador, o null si el panel aún no lo ha cargado. */
export function saldoDeEstrellas(jugador: string): number | null {
  const fila = ultimo?.jugadores.find((j) => j.user === jugador)
  return fila?.estrellas ? fila.estrellas.saldo : null
}
