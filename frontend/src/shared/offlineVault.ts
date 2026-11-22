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
