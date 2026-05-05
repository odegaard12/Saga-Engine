import type { AdminReactOverviewProfile } from './adminApi'
import type { PublicConfig } from '../../types/player'

export type PlayerDraft = {
  id: string
  display_name: string
  mode: 'solo' | 'team'
  members: string
  status: string
}

export function normalizePlayerMode(value?: string | null): 'solo' | 'team' {
  return value === 'team' ? 'team' : 'solo'
}

export function buildPlayerDrafts(
  nextProfiles: AdminReactOverviewProfile[],
  sourceConfig: PublicConfig | null
): PlayerDraft[] {
  const configProfiles = Array.isArray(sourceConfig?.player_profiles)
    ? sourceConfig.player_profiles
    : []
  const simplePlayers = Array.isArray(sourceConfig?.players)
    ? sourceConfig.players
    : []

  const fromOverview = nextProfiles.map((profile) => {
    const configProfile = configProfiles.find((item) => item.id === profile.id)
    const members = Array.isArray(configProfile?.members) ? configProfile.members.join(', ') : ''

    return {
      id: profile.id || profile.display_name || 'PLAYER',
      display_name: profile.display_name || profile.id || 'Player',
      mode: normalizePlayerMode(profile.mode || configProfile?.mode),
      members,
      status: profile.status || configProfile?.status || 'active',
    }
  })

  if (fromOverview.length > 0) return fromOverview

  if (configProfiles.length > 0) {
    return configProfiles.map((profile) => ({
      id: profile.id || profile.display_name || 'PLAYER',
      display_name: profile.display_name || profile.id || 'Player',
      mode: normalizePlayerMode(profile.mode),
      members: Array.isArray(profile.members) ? profile.members.join(', ') : '',
      status: profile.status || 'active',
    }))
  }

  return simplePlayers.map((player) => ({
    id: player,
    display_name: player,
    mode: 'solo',
    members: '',
    status: 'active',
  }))
}

export function normalizePlayerId(value: string, fallbackIndex: number) {
  const cleaned = value.trim()
  if (cleaned) return cleaned
  return `PLAYER ${fallbackIndex + 1}`
}
