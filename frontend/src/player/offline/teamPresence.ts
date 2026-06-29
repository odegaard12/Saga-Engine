import type { TeamProfileLiveStatus } from '../../types/player'

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
  const timestamp = Date.parse(cachedAt)
  if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY
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
    window.localStorage.setItem(storageKey(user), JSON.stringify(payload))
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
