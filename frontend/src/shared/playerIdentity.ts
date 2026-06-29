import type { PlayerProfile, TeamProfileLiveStatus } from '../types/player'

export const PLAYER_COLOR_PALETTE = [
  '#22c55e',
  '#3b82f6',
  '#f97316',
  '#a855f7',
  '#ef4444',
  '#14b8a6',
  '#eab308',
  '#ec4899',
]

export type PlayerIdentitySource = Partial<PlayerProfile & TeamProfileLiveStatus> & {
  id?: string
  user?: string
  color?: string
  avatar_url?: string
  avatar_initials?: string
}

export function getStablePlayerColor(seed?: string): string {
  const text = String(seed || '').trim()
  if (!text) return PLAYER_COLOR_PALETTE[0]

  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0
  }

  return PLAYER_COLOR_PALETTE[hash % PLAYER_COLOR_PALETTE.length]
}

export function getPlayerInitials(name?: string): string {
  const cleaned = String(name || '').trim()
  if (!cleaned) return '?'

  const parts = cleaned.split(/\s+/).slice(0, 2)
  return parts.map((part) => part[0]?.toUpperCase() || '').join('') || '?'
}

export function getPlayerColor(profile?: PlayerIdentitySource | null): string {
  const explicit = String(profile?.color || '').trim()
  if (/^#[0-9a-fA-F]{6}$/.test(explicit)) return explicit

  return getStablePlayerColor(
    profile?.id ||
      profile?.user ||
      profile?.display_name ||
      profile?.members?.join(',') ||
      'player'
  )
}

export function getPlayerAvatarInitials(profile?: PlayerIdentitySource | null): string {
  const explicit = String(profile?.avatar_initials || '').trim()
  if (explicit) return explicit.slice(0, 3).toUpperCase()

  return getPlayerInitials(profile?.display_name || profile?.user || profile?.id)
}

export function getPlayerAvatarUrl(profile?: PlayerIdentitySource | null): string {
  return String(profile?.avatar_url || '').trim()
}
