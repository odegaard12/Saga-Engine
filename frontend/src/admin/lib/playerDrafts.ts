import type { AdminReactOverviewProfile } from './adminApi'
import type { PublicConfig } from '../../types/player'
import { getPlayerInitials, getStablePlayerColor } from '../../shared/playerIdentity'

export type PlayerDraft = {
  id: string
  display_name: string
  mode: 'solo' | 'team'
  members: string
  status: string
  color: string
  avatar_url: string
  avatar_initials: string
}

export function normalizePlayerMode(value?: string | null): 'solo' | 'team' {
  return value === 'team' ? 'team' : 'solo'
}

function buildIdentityDefaults(input: {
  id?: string
  display_name?: string
  color?: string
  avatar_url?: string
  avatar_initials?: string
}) {
  const seed = input.id || input.display_name || 'player'
  const displayName = input.display_name || input.id || 'Player'

  return {
    color: input.color || getStablePlayerColor(seed),
    avatar_url: input.avatar_url || '',
    avatar_initials: input.avatar_initials || getPlayerInitials(displayName),
  }
}

export function buildPlayerDrafts(
  nextProfiles: AdminReactOverviewProfile[],
  sourceConfig: PublicConfig | null
): PlayerDraft[] {
  const configProfiles = Array.isArray(sourceConfig?.player_profiles)
    ? sourceConfig.player_profiles
    : []
  const simplePlayers = Array.isArray(sourceConfig?.players) ? sourceConfig.players : []

  const fromOverview: PlayerDraft[] = nextProfiles.map((profile) => {
    const configProfile = configProfiles.find((item) => item.id === profile.id)
    const members = Array.isArray(configProfile?.members) ? configProfile.members.join(', ') : ''
    const id = profile.id || profile.display_name || 'PLAYER'
    const displayName = profile.display_name || profile.id || 'Player'
    const identity = buildIdentityDefaults({
      id,
      display_name: displayName,
      color: configProfile?.color,
      avatar_url: configProfile?.avatar_url,
      avatar_initials: configProfile?.avatar_initials,
    })

    return {
      id,
      display_name: displayName,
      mode: normalizePlayerMode(profile.mode || configProfile?.mode),
      members,
      status: profile.status || configProfile?.status || 'active',
      ...identity,
    }
  })

  if (fromOverview.length > 0) return fromOverview

  if (configProfiles.length > 0) {
    return configProfiles.map((profile) => {
      const id = profile.id || profile.display_name || 'PLAYER'
      const displayName = profile.display_name || profile.id || 'Player'
      const identity = buildIdentityDefaults({
        id,
        display_name: displayName,
        color: profile.color,
        avatar_url: profile.avatar_url,
        avatar_initials: profile.avatar_initials,
      })

      return {
        id,
        display_name: displayName,
        mode: normalizePlayerMode(profile.mode),
        members: Array.isArray(profile.members) ? profile.members.join(', ') : '',
        status: profile.status || 'active',
        ...identity,
      }
    })
  }

  return simplePlayers.map((player) => ({
    id: player,
    display_name: player,
    mode: 'solo',
    members: '',
    status: 'active',
    color: getStablePlayerColor(player),
    avatar_url: '',
    avatar_initials: getPlayerInitials(player),
  }))
}

export function normalizePlayerId(value: string, fallbackIndex: number) {
  const cleaned = value.trim()
  if (cleaned) return cleaned
  return `PLAYER ${fallbackIndex + 1}`
}
