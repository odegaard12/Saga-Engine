import type { TeamProfileLiveStatus } from '../../types/player'
import { leerMarcaDeTiempo } from '../../shared/fechas'
import { horaDelServidorAhora, leerMuestraDeReloj } from './relojDelServidor'

export type CachedTeamPresencePayload = {
  user: string
  cached_at: string
  profiles: TeamProfileLiveStatus[]
}

const TEAM_STORAGE_PREFIX = 'saga:team-presence:'
const DEFAULT_MAX_AGE_MS = 15 * 60 * 1000

function nowIso(): string {
  return new Date().toISOString()
}

function hasLocalStorage(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage
  } catch {
    return false
  }
}

function storageKey(user: string): string {
  const normalized = String(user || 'anonymous').trim() || 'anonymous'
  return `${TEAM_STORAGE_PREFIX}${normalized}`
}

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function cacheAgeMs(cachedAt: string): number {
  const timestamp = leerMarcaDeTiempo(cachedAt)
  if (timestamp === null) return Number.POSITIVE_INFINITY
  return Math.max(0, Date.now() - timestamp)
}

function normalizeCachedPresence(
  profile: TeamProfileLiveStatus,
  cacheIsExpired: boolean
): TeamProfileLiveStatus {
  const originalPresence = String(profile.presence || 'offline').toLowerCase()

  let presence = 'offline'
  if (!cacheIsExpired && (originalPresence === 'live' || originalPresence === 'stale')) {
    presence = 'stale'
  }

  return {
    ...profile,
    presence,
    source: profile.source || 'cached_team_presence',
  }
}

export function cacheTeamProfiles(
  user: string,
  profiles: TeamProfileLiveStatus[]
): CachedTeamPresencePayload {
  const payload: CachedTeamPresencePayload = {
    user,
    cached_at: nowIso(),
    profiles: Array.isArray(profiles) ? profiles : [],
  }

  if (hasLocalStorage()) {
    try {
    window.localStorage.setItem(storageKey(user), JSON.stringify(payload))
    } catch (e) { console.warn('Storage quota exceeded', e); }
  }

  return payload
}

export function getCachedTeamProfiles(
  user: string,
  maxAgeMs = DEFAULT_MAX_AGE_MS
): CachedTeamPresencePayload {
  const fallback: CachedTeamPresencePayload = {
    user,
    cached_at: '',
    profiles: [],
  }

  if (!hasLocalStorage()) {
    return fallback
  }

  const loaded = safeJsonParse<CachedTeamPresencePayload>(
    window.localStorage.getItem(storageKey(user)),
    fallback
  )

  const age = cacheAgeMs(loaded.cached_at)
  const cacheIsExpired = age > maxAgeMs

  return {
    user,
    cached_at: loaded.cached_at,
    profiles: Array.isArray(loaded.profiles)
      ? loaded.profiles.map((profile) => normalizeCachedPresence(profile, cacheIsExpired))
      : [],
  }
}

export function clearCachedTeamProfiles(user: string): void {
  if (hasLocalStorage()) {
    window.localStorage.removeItem(storageKey(user))
  }
}

export function hasFreshTeamPresenceCache(user: string, maxAgeMs = DEFAULT_MAX_AGE_MS): boolean {
  const cached = getCachedTeamProfiles(user, maxAgeMs)
  return Boolean(cached.cached_at && cached.profiles.length > 0)
}

export function mergeLiveAndCachedTeamProfiles(
  liveProfiles: TeamProfileLiveStatus[],
  cachedProfiles: TeamProfileLiveStatus[]
): TeamProfileLiveStatus[] {
  const byUser = new Map<string, TeamProfileLiveStatus>()

  for (const profile of cachedProfiles) {
    if (profile.user) {
      byUser.set(profile.user, profile)
    }
  }

  for (const profile of liveProfiles) {
    if (profile.user) {
      byUser.set(profile.user, profile)
    }
  }

  return [...byUser.values()]
}

/**
 * Sin latido en este tiempo, un compañero pasa de «hace N min» a «sin conexión».
 *
 * El servidor sólo distingue «en vivo» (latido en los últimos 3 min) y «stale»
 * (cualquier cosa más vieja): quien cerró la aplicación hace dos horas seguía
 * saliendo como «hace 120 min», en el mapa y en la clasificación, como si
 * estuviese a punto de volver (auditoría T1).
 */
export const SIN_CONEXION_TRAS_MS = 10 * 60 * 1000

export function envejecerPresencia(
  profiles: TeamProfileLiveStatus[],
  ahoraServidorMs: number = horaDelServidorAhora(leerMuestraDeReloj()).ms
): TeamProfileLiveStatus[] {
  return (Array.isArray(profiles) ? profiles : []).map((profile) => {
    if (!profile || profile.is_self) return profile
    const presencia = String(profile.presence || '').toLowerCase()
    if (presencia !== 'stale' && presencia !== 'live') return profile
    const visto = Number(profile.last_seen || 0)
    if (!Number.isFinite(visto) || visto <= 0) return profile
    // `last_seen` va en segundos (hora del servidor).
    if (ahoraServidorMs - visto * 1000 <= SIN_CONEXION_TRAS_MS) return profile
    return { ...profile, presence: 'offline' }
  })
}
