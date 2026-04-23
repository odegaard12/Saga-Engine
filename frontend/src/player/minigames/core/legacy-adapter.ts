import type {
  BearingHuntConfig,
  CircuitMatrixConfig,
  SignalHuntConfig,
} from './family-types'
import type { MinigameFamily } from './types'

import { bearingHuntDefinition } from '../families/bearingHunt/definition'
import { circuitMatrixDefinition } from '../families/circuitMatrix/definition'
import { signalHuntDefinition } from '../families/signalHunt/definition'

export type LegacyMinigameType =
  | 'circuit_hack'
  | 'switchboard'
  | 'cryptex'
  | 'simon_says'
  | 'radio_azimuth'
  | 'compass_blow'
  | 'gyro_storm'
  | 'digital_tuner'

export type AdaptedLegacyMinigame =
  | {
      family: 'circuit_matrix'
      legacy_type: string
      compatibility: 'legacy_bridge'
      config: CircuitMatrixConfig
    }
  | {
      family: 'bearing_hunt'
      legacy_type: string
      compatibility: 'legacy_bridge'
      config: BearingHuntConfig
    }
  | {
      family: 'signal_hunt'
      legacy_type: string
      compatibility: 'legacy_bridge'
      config: SignalHuntConfig
    }

const LEGACY_FAMILY_MAP: Record<string, MinigameFamily> = {
  circuit_hack: 'circuit_matrix',
  switchboard: 'circuit_matrix',
  cryptex: 'circuit_matrix',
  simon_says: 'circuit_matrix',

  radio_azimuth: 'bearing_hunt',
  compass_blow: 'bearing_hunt',
  gyro_storm: 'bearing_hunt',

  digital_tuner: 'signal_hunt',
}

export function isLegacyMinigameType(value: string): value is LegacyMinigameType {
  return value in LEGACY_FAMILY_MAP
}

export function resolveLegacyFamily(value: string): MinigameFamily | null {
  const key = String(value || '').trim().toLowerCase()
  return LEGACY_FAMILY_MAP[key] || null
}

function asObject<T>(value: unknown): Partial<T> {
  return value && typeof value === 'object' ? (value as Partial<T>) : {}
}

function adaptCircuitMatrixLegacy(
  legacyType: string,
  rawConfig: unknown
): CircuitMatrixConfig {
  const incoming = asObject<CircuitMatrixConfig>(rawConfig)
  const base: CircuitMatrixConfig = {
    ...circuitMatrixDefinition.default_config,
  }

  switch (legacyType) {
    case 'switchboard':
      return {
        ...base,
        ...incoming,
        grid_cols: incoming.grid_cols ?? 4,
        grid_rows: incoming.grid_rows ?? 4,
        difficulty: incoming.difficulty ?? 2,
        allow_rotate: incoming.allow_rotate ?? false,
        allow_toggle: incoming.allow_toggle ?? true,
        allow_swap: incoming.allow_swap ?? false,
      }

    case 'cryptex':
      return {
        ...base,
        ...incoming,
        grid_cols: incoming.grid_cols ?? 3,
        grid_rows: incoming.grid_rows ?? 4,
        difficulty: incoming.difficulty ?? 2,
        allow_rotate: incoming.allow_rotate ?? true,
        allow_toggle: incoming.allow_toggle ?? false,
        allow_swap: incoming.allow_swap ?? false,
      }

    case 'simon_says':
      return {
        ...base,
        ...incoming,
        grid_cols: incoming.grid_cols ?? 3,
        grid_rows: incoming.grid_rows ?? 3,
        difficulty: incoming.difficulty ?? 2,
        allow_rotate: incoming.allow_rotate ?? false,
        allow_toggle: incoming.allow_toggle ?? true,
        allow_swap: incoming.allow_swap ?? false,
      }

    case 'circuit_hack':
    default:
      return {
        ...base,
        ...incoming,
        grid_cols: incoming.grid_cols ?? 5,
        grid_rows: incoming.grid_rows ?? 5,
        difficulty: incoming.difficulty ?? 2,
        allow_rotate: incoming.allow_rotate ?? true,
        allow_toggle: incoming.allow_toggle ?? true,
        allow_swap: incoming.allow_swap ?? false,
      }
  }
}

function adaptBearingHuntLegacy(
  legacyType: string,
  rawConfig: unknown
): BearingHuntConfig {
  const incoming = asObject<BearingHuntConfig>(rawConfig)
  const base: BearingHuntConfig = {
    ...bearingHuntDefinition.default_config,
  }

  switch (legacyType) {
    case 'compass_blow':
      return {
        ...base,
        ...incoming,
        tolerance_deg: incoming.tolerance_deg ?? 16,
        hold_ms: incoming.hold_ms ?? 900,
        phases: incoming.phases ?? 3,
        require_stable_orientation: incoming.require_stable_orientation ?? true,
        show_compass_ring: incoming.show_compass_ring ?? true,
        allow_recenter: incoming.allow_recenter ?? true,
      }

    case 'gyro_storm':
      return {
        ...base,
        ...incoming,
        tolerance_deg: incoming.tolerance_deg ?? 14,
        hold_ms: incoming.hold_ms ?? 1200,
        phases: incoming.phases ?? 2,
        require_stable_orientation: incoming.require_stable_orientation ?? true,
        show_compass_ring: incoming.show_compass_ring ?? true,
        allow_recenter: incoming.allow_recenter ?? true,
      }

    case 'radio_azimuth':
    default:
      return {
        ...base,
        ...incoming,
        tolerance_deg: incoming.tolerance_deg ?? 12,
        hold_ms: incoming.hold_ms ?? 1100,
        phases: incoming.phases ?? 1,
        require_stable_orientation: incoming.require_stable_orientation ?? true,
        show_compass_ring: incoming.show_compass_ring ?? true,
        allow_recenter: incoming.allow_recenter ?? true,
      }
  }
}

function adaptSignalHuntLegacy(
  legacyType: string,
  rawConfig: unknown
): SignalHuntConfig {
  const incoming = asObject<SignalHuntConfig>(rawConfig)
  const base: SignalHuntConfig = {
    ...signalHuntDefinition.default_config,
  }

  switch (legacyType) {
    case 'digital_tuner':
    default:
      return {
        ...base,
        ...incoming,
        source_radius_m: incoming.source_radius_m ?? 20,
        lock_threshold: incoming.lock_threshold ?? 85,
        hold_ms: incoming.hold_ms ?? 1400,
        update_rate_ms: incoming.update_rate_ms ?? 400,
        use_audio: incoming.use_audio ?? true,
        use_vibration: incoming.use_vibration ?? true,
        use_direction_hint: incoming.use_direction_hint ?? false,
      }
  }
}

export function adaptLegacyMinigame(
  type: string,
  rawConfig: unknown
): AdaptedLegacyMinigame | null {
  const legacyType = String(type || '').trim().toLowerCase()
  const family = resolveLegacyFamily(legacyType)

  if (!family) return null

  if (family === 'circuit_matrix') {
    return {
      family,
      legacy_type: legacyType,
      compatibility: 'legacy_bridge',
      config: adaptCircuitMatrixLegacy(legacyType, rawConfig),
    }
  }

  if (family === 'bearing_hunt') {
    return {
      family,
      legacy_type: legacyType,
      compatibility: 'legacy_bridge',
      config: adaptBearingHuntLegacy(legacyType, rawConfig),
    }
  }

  return {
    family: 'signal_hunt',
    legacy_type: legacyType,
    compatibility: 'legacy_bridge',
    config: adaptSignalHuntLegacy(legacyType, rawConfig),
  }
}

export function getSupportedLegacyTypes(): LegacyMinigameType[] {
  return Object.keys(LEGACY_FAMILY_MAP) as LegacyMinigameType[]
}
