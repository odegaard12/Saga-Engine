import type { PublicConfig } from '../../types/player'
import { fetchPublicConfig } from '../../shared/api'
import {
  buildFallbackPublicConfig,
  cachePublicConfig,
  getCachedPublicConfig,
  pedirConfigConCache,
} from '../../shared/offlinePublicConfig'
import { esConfigDeRespaldo } from './revisiones'
import { registrarHoraDelServidor } from './relojDelServidor'

/**
 * La configuración de la misión, sin pisar nunca la buena con la de respaldo.
 *
 * Si `/api/config` no contestaba a tiempo (7 s) se fabricaba una configuración
 * pelada, se ponía en pantalla y se GUARDABA encima del paquete: sin fecha de
 * inicio, sin prólogo, sin tema, sin idioma. La cortina de «aún no toca»
 * desaparecía antes de hora. Aquí, si no llega la de verdad, se sigue con la
 * última buena (la del paquete guardado o la copia del navegador) y se dice que
 * no es fresca; sólo si no hay ninguna se usa la de respaldo, y esa no se guarda.
 */

export interface ConfigObtenida {
  config: PublicConfig
  /** Llegó ahora del servidor (no es una copia guardada ni el respaldo). */
  fresca: boolean
  /** Hora del móvil (ms) a la que llegó; la de la copia si no es fresca. */
  recibidaEn: number | null
  /** Es la de respaldo: no se guarda. */
  esRespaldo: boolean
}

/**
 * Pide la configuración al servidor y apunta la hora que trae. Es lo único que
 * llama a `/api/config` desde la pantalla del jugador, para que TODA hora del
 * servidor que llegue quede registrada con el instante en que se recibió.
 */
export async function pedirConfigYApuntarLaHora(): Promise<PublicConfig> {
  const config = await fetchPublicConfig()
  registrarHoraDelServidor(config.server_time_ms, Date.now())
  cachePublicConfig(config)
  return config
}

/**
 * Con red: la de ahora. Sin ella: la última buena que haya, sin inventar nada.
 */
export async function obtenerConfigDeLaMision(args: {
  user: string
  /** La que trae el paquete guardado de este jugador, si hay. */
  guardada?: PublicConfig | null
  /** Recibida a las (hora del móvil) — la del paquete. */
  guardadaRecibidaEn?: number | null
}): Promise<ConfigObtenida> {
  try {
    const config = await pedirConfigYApuntarLaHora()
    return { config, fresca: true, recibidaEn: Date.now(), esRespaldo: false }
  } catch {
    if (!esConfigDeRespaldo(args.guardada)) {
      return {
        config: args.guardada as PublicConfig,
        fresca: false,
        recibidaEn: args.guardadaRecibidaEn ?? null,
        esRespaldo: false,
      }
    }

    const copia = getCachedPublicConfig()
    if (!esConfigDeRespaldo(copia)) {
      return { config: copia as PublicConfig, fresca: false, recibidaEn: null, esRespaldo: false }
    }

    return {
      config: buildFallbackPublicConfig(args.user),
      fresca: false,
      recibidaEn: null,
      esRespaldo: true,
    }
  }
}

/**
 * El refresco de fondo (cada 30 s): la configuración de hace menos de cinco
 * minutos vale, y si hay que pedirla se apunta la hora. Si falla, la que hay.
 */
export async function refrescarConfigDeLaMision(
  actual: PublicConfig | null | undefined,
  user: string
): Promise<PublicConfig> {
  try {
    return await pedirConfigConCache(pedirConfigYApuntarLaHora)
  } catch {
    if (!esConfigDeRespaldo(actual)) return actual as PublicConfig
    const copia = getCachedPublicConfig()
    if (!esConfigDeRespaldo(copia)) return copia as PublicConfig
    return buildFallbackPublicConfig(user)
  }
}
