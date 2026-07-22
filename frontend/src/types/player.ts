export type PlayerMode = 'solo' | 'team'
export type PlayerGpsStatus = 'ready' | 'unavailable' | 'stale' | 'searching' | 'error' | string

export interface PlayerProfile {
  id: string
  display_name: string
  mode: PlayerMode
  members?: string[]
  status?: string
  color?: string
  avatar_url?: string
  avatar_initials?: string
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
export interface StageMinigameRuntime {
  type: string
  label?: string
  version?: string
  config?: StageConfig
}

export interface StageMinigameRuntime {
  type: string
  label?: string
  version?: string
  config?: StageConfig
}

export interface PlayerStage {
  id?: number | string
  title: string
  lat: number
  lon: number
  radius: number
  type?: string
  content?: string
  intro_title?: string
  intro_body?: string
  config?: StageConfig
  minigame?: StageMinigameRuntime
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
  color?: string
  avatar_url?: string
  avatar_initials?: string
  level?: number
  finished?: boolean
  total_time_ms?: number
  is_playing?: boolean
}

export interface TeamProfileLiveStatus extends PlayerLiveStatus {
  user: string
  display_name: string
  is_self?: boolean
}

export interface TeamStatusPayload {
  status: 'ok'
  user: string
  profiles: TeamProfileLiveStatus[]
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
  current_stage: PlayerStage | null
  inventory_snapshot?: any
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
  mapbox_token?: string
  mapbox_style?: string
  players?: string[]
  player_profiles?: PlayerProfile[]
}

export interface FieldProof {
  id: string
  user: string
  display_name?: string
  stage_id?: string
  stage_title?: string
  lat: number
  lon: number
  note?: string
  image_url: string
  thumbnail_url?: string
  media_type?: string
  created_at: number
  visibility?: string
  status?: string
}

export interface FieldProofsPayload {
  status: 'ok'
  proofs: FieldProof[]
}

export interface FieldProofUploadResponse {
  status: 'ok'
  proof: FieldProof
}
