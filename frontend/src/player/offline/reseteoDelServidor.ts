import { aplicarResetDeRelojes } from '../nodeClock'
import { hydrateInventoryFromServer } from './inventory'
import { borrarColaOffline } from './missionPack'

/**
 * Obedecer a `reset_at`: la marca con la que el servidor dice «esto se rehizo».
 *
 * El móvil manda sobre su propio progreso —tiene que ser así, porque en el monte
 * avanza sin cobertura—, y la ÚNICA señal que le hace ceder es esta marca dentro
 * de la mochila que devuelve el servidor. Antes sólo la ponía el reinicio
 * completo de un jugador. Ahora también la sube el organizador al bajar un
 * jugador de nivel o al vaciarle la mochila (contrato 4), y hace falta que las
 * DOS cosas se apliquen en el móvil, sea cual sea la vía por la que llegue la
 * partida:
 *
 *  - el NIVEL puede bajar (y la cola de nodos hechos sin subir se tira: es de la
 *    partida anterior);
 *  - la MOCHILA local se vacía si es anterior a la marca, y lo que el servidor
 *    dejó se incorpora.
 *
 * Antes cada sitio hacía una parte: el arranque, el refresco de 30 s y el de
 * después de superar un nodo llamaban a cosas distintas, y el refresco de fondo
 * no tocaba la mochila — un «vaciar mochila» del organizador salía "aplicado"
 * y el móvil seguía con todo.
 */

/** La marca de reinicio que trae una partida, o 0 si no hay. */
export function resetAtDeLaPartida(payload: unknown): number {
  const instantanea = (payload as { inventory_snapshot?: unknown } | null | undefined)
    ?.inventory_snapshot
  const marca = Number((instantanea as { reset_at?: unknown } | null | undefined)?.reset_at)
  return Number.isFinite(marca) && marca > 0 ? marca : 0
}

/**
 * Aplica lo que diga `reset_at`. Devuelve `true` sólo la primera vez que el móvil
 * ve un reinicio: es la única vez que el servidor puede mandar un nivel más bajo
 * y tener razón, y quien llama lo necesita para permitirlo.
 */
export async function aplicarResetDelServidor(
  user: string,
  payload: { user?: string; inventory_snapshot?: unknown } | null | undefined
): Promise<boolean> {
  if (!payload) return false

  const quien = payload.user || user
  const huboReset = aplicarResetDeRelojes(quien, resetAtDeLaPartida(payload))

  // Siempre, no sólo con reinicio: además de vaciar la mochila vieja, incorpora
  // los objetos que el organizador entregó a mano desde administración.
  hydrateInventoryFromServer(quien, payload.inventory_snapshot)

  if (huboReset) await borrarColaOffline(user).catch(() => undefined)

  return huboReset
}
