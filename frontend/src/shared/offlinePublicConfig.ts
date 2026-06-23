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
