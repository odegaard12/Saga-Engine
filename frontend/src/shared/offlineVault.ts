import type { PlayerProfile } from '../types/player'

const STORAGE_KEY = 'saga_offline_vault_v1'

export type OfflineVaultPlayer = {
  id: string
  display_name: string
  mode?: string
  ok: boolean
  stage_count: number
  level: number
  finished: boolean
  error?: string
}

export type OfflineVaultSummary = {
  schema_version: 'v1'
  prepared_at: string
  profile_count: number
  ready_count: number
  failed_count: number
  players: OfflineVaultPlayer[]
}

export function emptyOfflineVaultSummary(): OfflineVaultSummary {
  return {
    schema_version: 'v1',
    prepared_at: '',
    profile_count: 0,
    ready_count: 0,
    failed_count: 0,
    players: [],
  }
}

export function makeOfflineVaultPlayer(
  profile: PlayerProfile,
  args: {
    ok: boolean
    stage_count?: number
    level?: number
    finished?: boolean
    error?: string
  }
): OfflineVaultPlayer {
  return {
    id: profile.id,
    display_name: String(profile.display_name || profile.id),
    mode: profile.mode,
    ok: args.ok,
    stage_count: Math.max(0, Number(args.stage_count || 0)),
    level: Math.max(0, Number(args.level || 0)),
    finished: Boolean(args.finished),
    error: args.error,
  }
}

export function saveOfflineVaultSummary(players: OfflineVaultPlayer[]): OfflineVaultSummary {
  const summary: OfflineVaultSummary = {
    schema_version: 'v1',
    prepared_at: new Date().toISOString(),
    profile_count: players.length,
    ready_count: players.filter((player) => player.ok).length,
    failed_count: players.filter((player) => !player.ok).length,
    players,
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(summary))
  } catch {
    // best effort
  }

  return summary
}

export function getOfflineVaultSummary(): OfflineVaultSummary {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyOfflineVaultSummary()

    const parsed = JSON.parse(raw) as OfflineVaultSummary
    if (!parsed || parsed.schema_version !== 'v1') return emptyOfflineVaultSummary()

    return {
      ...emptyOfflineVaultSummary(),
      ...parsed,
      players: Array.isArray(parsed.players) ? parsed.players : [],
    }
  } catch {
    return emptyOfflineVaultSummary()
  }
}

export function formatOfflineVaultAge(summary: OfflineVaultSummary): string {
  if (!summary.prepared_at) return 'Nunca preparado.'

  const ts = Date.parse(summary.prepared_at)
  if (!Number.isFinite(ts)) return summary.prepared_at

  const minutes = Math.max(0, Math.round((Date.now() - ts) / 60000))

  if (minutes < 1) return 'Hace menos de 1 min.'
  if (minutes < 60) return `Hace ${minutes} min.`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `Hace ${hours} h.`

  return `Hace ${Math.round(hours / 24)} días.`
}
