import type { PlayerProfile, PublicConfig } from '../types/player'

const STORAGE_KEY = 'saga_offline_public_config_v1'

function safeProfile(id: string): PlayerProfile {
  return {
    id,
    display_name: id,
    mode: 'solo',
    members: [id],
    status: 'active',
  }
}

export function buildFallbackPublicConfig(user = 'PLAYER 1'): PublicConfig {
  return {
    site_name: 'SAGA',
    story_text: 'Elige jugador para continuar.',
    players: [user],
    player_profiles: [safeProfile(user)],
  }
}

export function cachePublicConfig(config: PublicConfig): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        cached_at: new Date().toISOString(),
        config,
      })
    )
  } catch {
    // Best effort.
  }
}

export function getCachedPublicConfig(): PublicConfig | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { config?: PublicConfig }
    return parsed.config || null
  } catch {
    return null
  }
}

/**
 * Cuánto vale una configuración guardada antes de volver a pedirla.
 *
 * La configuración de una misión —títulos, prólogo, centro del mapa, lista de
 * jugadores— no cambia mientras se camina: la cambias tú desde administración,
 * y eso pasa antes de salir, no a mitad de ruta. Se pedía cada 30 segundos
 * igualmente, o sea 120 peticiones por hora y por móvil para recibir siempre lo
 * mismo.
 */
const VIGENCIA_MS = 5 * 60 * 1000

/**
 * La configuración, sin pedirla si la que hay sigue fresca.
 *
 * Cinco minutos es de sobra para que un cambio hecho en administración llegue a
 * los móviles durante una ruta, y quita el 90 % de las peticiones.
 */
export async function pedirConfigConCache(
  pedir: () => Promise<PublicConfig>
): Promise<PublicConfig> {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as { cached_at?: string; config?: PublicConfig }
        const edad = Date.now() - new Date(parsed.cached_at || 0).getTime()

        if (parsed.config && Number.isFinite(edad) && edad >= 0 && edad < VIGENCIA_MS) {
          return parsed.config
        }
      }
    } catch {
      // Si no se puede leer, se pide y ya.
    }
  }

  const config = await pedir()
  cachePublicConfig(config)
  return config
}
