export type PlayerMode = 'solo' | 'team'
export type PlayerGpsStatus = 'ready' | 'unavailable' | 'stale' | 'searching' | 'error' | string

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

export interface PlayerLiveStatus {
  user?: string
  display_name?: string
  session_mode?: PlayerMode | string
  members?: string[]
  status?: string
  presence?: string
  last_seen?: number
  gps_status?: PlayerGpsStatus
  lat?: number | null
  lon?: number | null
  source?: string
  debug_enabled?: boolean
}

export interface PlayerGamePayload {
  user: string
  display_name?: string
  mode?: PlayerMode
  session_mode?: PlayerMode
  members?: string[]
  profile?: PlayerProfile
  live_status?: PlayerLiveStatus
  level: number
  finished: boolean
  stages: PlayerStage[]
  current_stage?: PlayerStage | null
}

export interface PublicConfig {
  site_name?: string
  admin_title?: string
  admin_subtitle?: string
  ui_lang?: string
  player_theme?: string
  story_title?: string
  story_text?: string
  prologue_title?: string
  prologue_subtitle?: string
  prologue_body?: string
  map_center?: [number, number]
  map_zoom?: number
  players?: string[]
  player_profiles?: PlayerProfile[]
}
