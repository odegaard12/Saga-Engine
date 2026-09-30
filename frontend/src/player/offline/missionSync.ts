import type { PlayerGamePayload, PublicConfig } from '../../types/player'
import { fetchPlayerGame } from '../../shared/api'
import { getStoredMissionPack, type MissionPack } from './missionPack'
import { paqueteSirve, revisionDelServidor } from './revisiones'

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
/**
 * Baja el paquete pidiendo las fotos por URL, y las mete dentro antes de
 * guardarlo.
 *
 * Sacar las fotos del JSON es el recorte grande: la del mosaico son 60 KB de
 * los 120 del paquete, y por su propia URL la cachea Cloudflare y la sirve a
 * los quince móviles del aparcadoiro en vez de tirar quince veces de la subida
 * de la Raspberry.
 *
 * Pero el paquete que se GUARDA tiene que seguir llevando la foto dentro. Es lo
 * que hace que el mosaico se pueda jugar en modo avión, y quedarse sin ella es
 * el fallo más caro que ha tenido esto. Así que se baja aparte y se vuelve a
 * meter aquí: por el cable viaja una vez y cacheada, y en IndexedDB queda igual
 * que siempre.
 *
 * Y si una sola foto no se puede bajar, se tira todo el atajo y se vuelve a
 * pedir el paquete con las fotos dentro. Antes un paquete a medias que uno
 * ligero: lo segundo se nota en el arranque, lo primero se nota en el monte.
 */
export async function bajarPaqueteConFotos(user: string): Promise<PlayerGamePayload> {
  const ligero = await fetchPlayerGame(user, { offlinePack: true, fotosPorUrl: true })
  const nodos = ligero.stages || []

  const pendientes = nodos.filter((nodo) => {
    const config = (nodo as any)?.minigame?.config
    return config && config.image_url && !config.image_data_url
  })

  if (!pendientes.length) return ligero

  try {
    await Promise.all(
      pendientes.map(async (nodo) => {
        const config = (nodo as any).minigame.config
        const respuesta = await fetch(config.image_url, { cache: 'force-cache' })
        if (!respuesta.ok) throw new Error(`foto ${respuesta.status}`)
        const blob = await respuesta.blob()
        config.image_data_url = await new Promise<string>((resolve, reject) => {
          const lector = new FileReader()
          lector.onload = () => resolve(String(lector.result))
          lector.onerror = () => reject(lector.error)
          lector.readAsDataURL(blob)
        })
      })
    )
    return ligero
  } catch {
    // Sin una foto no se guarda el paquete: se pide entero, como siempre.
    return fetchPlayerGame(user, { offlinePack: true })
  }
}

/** Lo que devuelve pedir la partida: los datos, con qué revisión y si se bajó el paquete. */
export interface PartidaPedida {
  payload: PlayerGamePayload
  /** Revisión de la misión con la que están estos nodos ('' si el servidor no la da). */
  revision: string
  /** Se bajó el paquete entero (nodos y fotos) en esta llamada. */
  bajoElPaquete: boolean
}

/**
 * Pega los nodos que el móvil ya tiene a la partida ligera que acaba de llegar.
 * Devuelve `null` si lo guardado ya no vale (otra revisión, otro número de nodos).
 */
export function combinarConGuardado(
  ligero: PlayerGamePayload,
  guardado: MissionPack | null | undefined
): PlayerGamePayload | null {
  const revision = revisionDelServidor(ligero)
  if (!paqueteSirve({ pack: guardado, ligero, revision })) return null

  return {
    ...ligero,
    stages: guardado?.payload?.stages || [],
    offline_pack: true,
  }
}

/**
 * Como `pedirPartida`, pero diciendo con qué revisión de la misión quedan los
 * nodos, para poder guardarla con el paquete.
 *
 * `ligero` es la partida ligera si quien llama ya la tiene (la pantalla de carga
 * la pide antes para comprobar): así no se pide dos veces.
 */
export async function pedirPartidaCompleta(
  user: string,
  opciones: { forzarPaquete?: boolean; ligero?: PlayerGamePayload; config?: PublicConfig | null } = {}
): Promise<PartidaPedida> {
  if (opciones.forzarPaquete) {
    const payload = await bajarPaqueteConFotos(user)
    return {
      payload,
      revision: revisionDelServidor(payload, opciones.config) || revisionDelServidor(opciones.ligero, opciones.config),
      bajoElPaquete: true,
    }
  }

  // Sin nada guardado no hay nada que comparar: se baja todo de una vez, sin
  // gastar un viaje extra en preguntarlo.
  const guardado = await getStoredMissionPack(user).catch(() => null)
  const nodosGuardados = guardado?.payload?.stages

  if (!nodosGuardados?.length && !opciones.ligero) {
    const payload = await bajarPaqueteConFotos(user)
    return { payload, revision: revisionDelServidor(payload, opciones.config), bajoElPaquete: true }
  }

  const ligero = opciones.ligero ?? (await fetchPlayerGame(user))
  const revision = revisionDelServidor(ligero, opciones.config)

  // Servidor antiguo, sin huella ni revisión: no se puede saber si lo guardado
  // vale, así que se baja todo. Nunca al revés: quedarse con nodos viejos en
  // silencio es exactamente el fallo que esto viene a evitar.
  const combinado = combinarConGuardado(ligero, guardado)
  if (combinado) return { payload: combinado, revision, bajoElPaquete: false }

  const payload = await bajarPaqueteConFotos(user)
  return {
    payload,
    revision: revisionDelServidor(payload, opciones.config) || revision,
    bajoElPaquete: true,
  }
}

export async function pedirPartida(
  user: string,
  opciones: { forzarPaquete?: boolean } = {}
): Promise<PlayerGamePayload> {
  return (await pedirPartidaCompleta(user, opciones)).payload
}
