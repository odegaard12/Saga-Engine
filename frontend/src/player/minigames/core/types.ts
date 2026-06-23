export type MinigameFamily =
  | 'circuit_matrix'
  | 'bearing_hunt'
  | 'signal_hunt'
  | 'motion_challenge'

export type MinigameVersion = 'v1'

export type CapabilityKey =
  | 'touch'
  | 'fullscreen'
  | 'geolocation'
  | 'device_orientation'
  | 'device_motion'
  | 'vibration'
  | 'audio'
  | 'wake_lock'

export type CapabilityRequirement =
  | 'required'
  | 'preferred'
  | 'optional'
  | 'forbidden'

export type ValidationMode = 'client' | 'server' | 'hybrid'

export type MinigameRuntimeState =
  | 'idle'
  | 'preflight'
  | 'permissions'
  | 'briefing'
  | 'calibrating'
  | 'active'
  | 'paused'
  | 'fallback'
  | 'success'
  | 'failed'
  | 'error'

export type MinigameRunMode =
  | 'normal'
  | 'degraded'
  | 'fallback'
  | 'blocked'

export type MinigameResult = 'success' | 'failed'

export type FallbackPolicy =
  | 'none'
  | 'manual_code'
  | 'alternate_minigame'
  | 'degraded_mode'

export interface CapabilitySpec {
  key: CapabilityKey
  requirement: CapabilityRequirement
  reason?: string
}

export interface MinigameUiSpec {
  fullscreen: boolean
  briefing_required: boolean
  supports_pause: boolean
  supports_retry: boolean
  supports_manual_fallback: boolean
}

export interface MinigameDefinitionBase<
  TFamily extends MinigameFamily,
  TConfig extends Record<string, unknown>,
> {
  family: TFamily
  version: MinigameVersion
  label: string
  tagline: string
  description: string

  validation_mode: ValidationMode
  fallback_policy: FallbackPolicy

  capabilities: CapabilitySpec[]
  ui: MinigameUiSpec

  default_config: TConfig
}

export interface MinigamePreflightResult {
  can_start: boolean
  mode: MinigameRunMode

  missing_required: CapabilityKey[]
  missing_preferred: CapabilityKey[]

  messages: string[]
}

export interface MinigameSessionContext {
  stageId?: string | number
  playerId: string
  startedAt: number

  isSecureContext: boolean
  userAgent?: string
}

export interface MinigameCompletionPayload {
  family: MinigameFamily
  version: MinigameVersion

  result: MinigameResult
  mode: MinigameRunMode

  elapsed_ms: number
  attempts: number
  score?: number

  telemetry?: Record<string, unknown>
}

export interface MinigameRuntimeBindings<TConfig extends Record<string, unknown>> {
  definition: MinigameDefinitionBase<MinigameFamily, TConfig>
  config: TConfig
  session: MinigameSessionContext
}

export interface MinigameController<TConfig extends Record<string, unknown>> {
  runPreflight: (
    bindings: MinigameRuntimeBindings<TConfig>
  ) => Promise<MinigamePreflightResult>
  validateConfig: (
    config: unknown
  ) => { ok: true; value: TConfig } | { ok: false; errors: string[] }
}
