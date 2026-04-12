export type PlayerMode = 'solo' | 'team'

export interface PlayerProfile {
  id: string
  display_name: string
  mode: PlayerMode
  members?: string[]
  status?: string
}

export interface StageLocation {
  lat: number
  lon: number
  radius: number
}

export interface StageEntryRules {
  mode?: 'gps' | 'free'
  require_proximity?: boolean
  allow_debug_bypass?: boolean
  allow_manual_fallback_without_gps?: boolean
}

export interface StageMessages {
  hint?: string
  gps_unavailable?: string
  locked?: string
  [key: string]: string | undefined
}

export interface StageConfig {
  [key: string]: unknown
}

export interface PlayerStage {
  id?: number | string
  title: string
  lat: number
  lon: number
  radius: number
  type?: string
  content?: string
  config?: StageConfig
  entry?: StageEntryRules
  messages?: StageMessages
}

export interface PlayerGamePayload {
  user: string
  display_name?: string
  mode?: PlayerMode
  members?: string[]
  profile?: PlayerProfile
  level: number
  finished: boolean
  stages: PlayerStage[]
  current_stage?: PlayerStage | null
}
