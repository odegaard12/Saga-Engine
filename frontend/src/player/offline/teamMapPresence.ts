import type { TeamProfileLiveStatus } from '../../types/player'

export type TeamMapPresenceStatus = 'live' | 'stale' | 'offline'

export type TeamMapMarker = {
  user: string
  display_name: string
  lat: number
  lon: number
  presence: TeamMapPresenceStatus
  gps_status?: string
  source?: string
  is_self?: boolean
  last_seen?: number
  color?: string
  avatar_url?: string
  avatar_ref?: string
  avatar_initials?: string
  /** El personaje de siempre (`character`) y la configuración entera del avatar 3D (`{ character, parts }`). */
  character?: string
  character_chosen?: boolean
  avatar?: unknown
  /**
   * Su progreso, para la ficha que sale al tocarlo en el mapa (nodos hechos y tiempo de la clasificación).
   * Antes se perdían aquí y el popup decía «Nodo 1 · 0:00» de todos.
   */
  level?: number
  finished?: boolean
  total_nodes?: number
  total_time_ms?: number
  members?: string[]
  /** Hacia dónde mira según SU móvil (grados, 0 = norte), si lo mandó hace poco. */
  heading?: number | null
}

function normalizePresence(value: unknown): TeamMapPresenceStatus {
  const raw = String(value || 'offline').toLowerCase()
  if (raw === 'live') return 'live'
  if (raw === 'stale' || raw === 'cached') return 'stale'
  return 'offline'
}

export function profileHasMapPosition(profile: TeamProfileLiveStatus): boolean {
  return typeof profile.lat === 'number' && typeof profile.lon === 'number'
}

export function teamProfilesToMapMarkers(
  profiles: TeamProfileLiveStatus[],
  options: {
    includeSelf?: boolean
    includeOfflineWithPosition?: boolean
  } = {}
): TeamMapMarker[] {
  const includeSelf = options.includeSelf ?? false
  const includeOfflineWithPosition = options.includeOfflineWithPosition ?? true

  return profiles
    .filter((profile) => {
      if (!includeSelf && profile.is_self) return false
      if (!profileHasMapPosition(profile)) return false

      const presence = normalizePresence(profile.presence)
      if (!includeOfflineWithPosition && presence === 'offline') return false

      return true
    })
    .map((profile) => ({
      user: profile.user,
      display_name: profile.display_name || profile.user,
      lat: profile.lat as number,
      lon: profile.lon as number,
      presence: normalizePresence(profile.presence),
      gps_status: profile.gps_status,
      source: profile.source,
      is_self: profile.is_self,
      last_seen: profile.last_seen,
      color: profile.color,
      avatar_url: profile.avatar_url,
      avatar_ref: profile.avatar_ref,
      avatar_initials: profile.avatar_initials,
      character: profile.character,
      character_chosen: profile.character_chosen,
      avatar: profile.avatar,
      level: profile.level,
      finished: profile.finished,
      total_nodes: profile.total_nodes,
      total_time_ms: profile.total_time_ms,
      members: profile.members,
      heading: typeof profile.heading === 'number' && Number.isFinite(profile.heading) ? profile.heading : null,
    }))
}

export function countVisibleTeamMarkers(markers: TeamMapMarker[]): {
  live: number
  stale: number
  offline: number
  total: number
} {
  return markers.reduce(
    (acc, marker) => {
      acc[marker.presence] += 1
      acc.total += 1
      return acc
    },
    { live: 0, stale: 0, offline: 0, total: 0 }
  )
}
