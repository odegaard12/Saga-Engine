import type { MuestraGps } from '../avance/evidencia'
import { queueOfflineEvent } from './missionPack'

/**
 * Las posiciones de un tramo sin cobertura.
 *
 * El latido de 30 s no llega cuando no hay red, así que hasta ahora el
 * servidor -y el Registro de partida- no sabía nada de por dónde había ido el
 * jugador entre dos nodos hechos sin cobertura. Aquí se guardan esas
 * posiciones y se suben en bloque, con su hora original, por la misma cola que
 * los nodos: si la app se cierra no se pierden, y llegan en orden.
 *
 * No hace falta que sea exacto: son un rastro para revisar la partida, no una
 * posición en directo.
 */

const pendientes = new Map<string, MuestraGps[]>()

/** Cuántas muestras se juntan antes de guardarlas en la cola (~2 min y medio). */
const TANDA = 5

export function apuntarPosicionSinRed(user: string, muestra: MuestraGps | null): void {
  if (!user || !muestra) return
  const lista = pendientes.get(user) || []
  lista.push(muestra)
  pendientes.set(user, lista)
  if (lista.length >= TANDA) void volcarRastro(user)
}

/** Pasa lo apuntado a la cola de eventos. Barato si no hay nada. */
export async function volcarRastro(user: string): Promise<void> {
  const lista = pendientes.get(user)
  if (!lista || !lista.length) return
  pendientes.delete(user)

  try {
    await queueOfflineEvent({
      user,
      type: 'position_track',
      source: 'offline_queue',
      payload: { samples: lista, sample_count: lista.length },
    })
  } catch {
    // Si la cola no responde se devuelven las muestras: se reintenta luego.
    pendientes.set(user, [...lista, ...(pendientes.get(user) || [])])
  }
}
