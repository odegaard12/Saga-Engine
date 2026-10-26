import { desfaseDeLaMuestra, leerMuestraDeReloj } from './relojDelServidor'
import { aplicarResetDeRelojes, ultimoResetVisto } from '../nodeClock'
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
 * Las dos marcas que dicen desde cuándo valen los AVANCES y los eventos de MOCHILA (`progress_reset_at`,
 * `inventory_reset_at`; ver MARCAS_DEL_SERVIDOR en main.py). `reset_at` sube con CUALQUIER cambio del organizador;
 * éstas, sólo con el que las toca: vaciar la mochila no mueve la de avances. Sin ellas (bases de antes de
 * separarlas) vale `reset_at` para todo, como en el servidor (`_marca_de`).
 */
export function marcasDelReinicio(payload: unknown): { progreso: number; mochila: number } {
  const instantanea = ((payload as { inventory_snapshot?: unknown } | null | undefined)?.inventory_snapshot ||
    {}) as Record<string, unknown>
  const general = resetAtDeLaPartida(payload)
  const marca = (clave: string) => {
    if (!(clave in instantanea)) return general
    const valor = Number(instantanea[clave])
    return Number.isFinite(valor) && valor > 0 ? valor : 0
  }
  return { progreso: marca('progress_reset_at'), mochila: marca('inventory_reset_at') }
}

/**
 * Aplica lo que diga `reset_at`. Devuelve `true` sólo la primera vez que el móvil
 * ve un reinicio DE PROGRESO: es la única vez que el servidor puede mandar un
 * nivel más bajo y tener razón, y quien llama lo necesita para permitirlo.
 *
 * 22/10: un «vaciar mochila» del panel también sube `reset_at`, y esto tiraba la
 * cola ENTERA y dejaba bajar el nivel: se perdían los nodos hechos sin red, que
 * el servidor sí habría aceptado (su marca de avances no se movió). Ahora de la
 * cola sólo sale lo anterior a su marca —avances contra la de avances, el resto
 * contra la de mochila— y el nivel sólo baja si se movió la de avances.
 * (`created_at` es la hora del móvil: con el reloj muy atrasado puede tirar un
 * avance hecho justo tras un reinicio de progreso, que es lo que antes pasaba
 * siempre; con uno de mochila, la marca de avances es vieja y no alcanza.)
 */
export async function aplicarResetDelServidor(
  user: string,
  payload: { user?: string; inventory_snapshot?: unknown } | null | undefined
): Promise<boolean> {
  if (!payload) return false

  const quien = payload.user || user
  // Lo visto ANTES de aplicar: la marca de avances es nueva sólo si es posterior al último reinicio ya aplicado.
  const vistoAntes = ultimoResetVisto(quien)
  const huboReset = aplicarResetDeRelojes(quien, resetAtDeLaPartida(payload))

  // Siempre, no sólo con reinicio: además de vaciar la mochila vieja, incorpora
  // los objetos que el organizador entregó a mano desde administración.
  hydrateInventoryFromServer(quien, payload.inventory_snapshot)

  if (!huboReset) return false

  const marcas = marcasDelReinicio(payload)
  // 25/10 (auditoría): `created_at` es la hora del MÓVIL y la marca es del servidor: se corrige con el desfase medido
  // (como hace el servidor). Con el reloj atrasado se tiraban avances legítimos hechos justo después del reinicio.
  const muestra = leerMuestraDeReloj()
  const desfase = muestra ? desfaseDeLaMuestra(muestra) : 0
  await borrarColaOffline(user, (evento) => {
    const creado = Date.parse(evento.created_at) + desfase
    const marca = evento.type === 'node_completed' ? marcas.progreso : marcas.mochila
    // Sin fecha legible no se sabe de qué partida es: como en el servidor, no deshace un reinicio.
    return marca > 0 && !(creado >= marca)
  }).catch(() => undefined)

  // Varios reinicios sin que el móvil se enterase (bajar de nivel y después vaciar la mochila) también bajan.
  return marcas.progreso > vistoAntes
}
