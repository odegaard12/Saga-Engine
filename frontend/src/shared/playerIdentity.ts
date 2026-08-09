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
  '#06b6d4',
  '#84cc16',
  '#6366f1',
  '#b45309',
]

export type PlayerIdentitySource = Partial<PlayerProfile & TeamProfileLiveStatus> & {
  id?: string
  user?: string
  color?: string
  avatar_url?: string
  avatar_ref?: string
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
    profile?.id || profile?.user || profile?.display_name || profile?.members?.join(',') || 'player'
  )
}

export function getPlayerAvatarInitials(profile?: PlayerIdentitySource | null): string {
  const explicit = String(profile?.avatar_initials || '').trim()
  if (explicit) return explicit.slice(0, 3).toUpperCase()

  return getPlayerInitials(profile?.display_name || profile?.user || profile?.id)
}

/**
 * Foto del jugador, venga incrustada o por referencia.
 *
 * El servidor ya no manda la imagen en base64 dentro de la tabla de equipo —esa
 * respuesta se pide cada 5 segundos y era 87% foto repetida—: manda la URL de
 * /api/player-avatar, que el navegador y el service worker cachean. Se acepta
 * cualquiera de las dos para no romper una caché offline hecha con la anterior.
 */
export function getPlayerAvatarUrl(profile?: PlayerIdentitySource | null): string {
  const incrustada = String(profile?.avatar_url || '').trim()
  if (incrustada) return incrustada
  return String(profile?.avatar_ref || '').trim()
}
