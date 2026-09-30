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
  /**
   * El ID con el que este jugador está guardado en el servidor. Cambiar `id`
   * lo aparta de su progreso (nivel, tiempos, mochila): el progreso va por ID.
   * Vacío en los jugadores nuevos.
   */
  original_id?: string
}

/** El servidor descarta en silencio lo que pase de 60 fichas. */
export const MAX_PLAYER_PROFILES = 60

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
      original_id: id,
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
        original_id: id,
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
    original_id: player,
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

/** El ID con el que el servidor recibirá a este jugador (recortado, sin vacíos, 120 como mucho). */
export function savedPlayerId(draft: Pick<PlayerDraft, 'id'>, index: number) {
  return normalizePlayerId(draft.id, index).slice(0, 120)
}

/**
 * IDs que salen más de una vez. El servidor se queda con el primero y TIRA los
 * demás sin avisar: dos personas con el mismo ID compartirían partida, y la
 * segunda ficha (con su foto y su nombre) desaparecería al guardar.
 */
export function findDuplicatePlayerIds(drafts: Array<Pick<PlayerDraft, 'id'>>): string[] {
  const vistos = new Set<string>()
  const repetidos = new Set<string>()

  drafts.forEach((draft, index) => {
    const id = savedPlayerId(draft, index)
    if (vistos.has(id)) repetidos.add(id)
    vistos.add(id)
  })

  return Array.from(repetidos)
}

/**
 * IDs que hay guardados en el servidor y que dejarán de existir con este
 * guardado (jugador borrado o con el ID cambiado): su progreso, su mochila y sus
 * tiempos se quedan sin dueño.
 */
export function findOrphanedPlayerIds(
  serverIds: string[],
  drafts: Array<Pick<PlayerDraft, 'id'>>
): string[] {
  const nuevos = new Set(drafts.map((draft, index) => savedPlayerId(draft, index)))
  return serverIds.filter((id) => !nuevos.has(id))
}

/** ¿Ha cambiado el ID de un jugador que ya estaba guardado? */
export function isPlayerIdChanged(draft: PlayerDraft, index: number) {
  return Boolean(draft.original_id) && savedPlayerId(draft, index) !== draft.original_id
}
