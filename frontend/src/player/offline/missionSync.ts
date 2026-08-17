import type { PlayerGamePayload } from '../../types/player'
import { fetchPlayerGame } from '../../shared/api'
import { getStoredMissionPack } from './missionPack'

/**
 * Pedir la partida sin bajarse la misión entera cada vez.
 *
 * Para jugar sin cobertura el móvil necesita los nodos ENTEROS: el minijuego,
 * su configuración, la foto del mosaico del nodo final y el código que acepta.
 * Eso son unos 200 KB. El estado del jugador —en qué nodo va, cuánto tiempo
 * lleva, qué hay en la mochila— son 28 KB, y es lo único que cambia mientras se
 * juega.
 *
 * El refresco pedía las dos cosas juntas cada treinta segundos, al volver a la
 * aplicación y al recuperar la red. En el monte, con una barra de cobertura y
 * tres horas de ruta, eso es la misma foto bajándose decenas de veces: cada
 * refresco tardaba, y con la red justa se quedaba a medias.
 *
 * Ahora se pide lo ligero y se compara la huella del contenido. Si es la misma
 * que la del paquete guardado, se le pegan los nodos que ya están en el móvil.
 * Si cambió —has tocado algo en administración— se baja todo otra vez.
 */
export async function pedirPartida(
  user: string,
  opciones: { forzarPaquete?: boolean } = {}
): Promise<PlayerGamePayload> {
  if (opciones.forzarPaquete) {
    return fetchPlayerGame(user, { offlinePack: true })
  }

  // Sin nada guardado no hay nada que comparar: se baja todo de una vez, sin
  // gastar un viaje extra en preguntarlo.
  const guardado = await getStoredMissionPack(user).catch(() => null)
  const nodosGuardados = guardado?.payload?.stages
  const huellaGuardada = guardado?.payload?.stages_rev

  if (!huellaGuardada || !nodosGuardados?.length) {
    return fetchPlayerGame(user, { offlinePack: true })
  }

  const ligero = await fetchPlayerGame(user)

  // Servidor antiguo, sin huella: no se puede saber si lo guardado vale, así
  // que se baja todo. Nunca al revés: quedarse con nodos viejos en silencio es
  // exactamente el fallo que esto viene a evitar.
  if (!ligero.stages_rev) {
    return fetchPlayerGame(user, { offlinePack: true })
  }

  const sirve =
    huellaGuardada === ligero.stages_rev &&
    nodosGuardados.length === (ligero.stages?.length || 0)

  if (!sirve) {
    return fetchPlayerGame(user, { offlinePack: true })
  }

  return {
    ...ligero,
    stages: nodosGuardados,
    offline_pack: true,
  }
}
