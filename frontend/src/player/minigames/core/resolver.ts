import type {
  BearingHuntConfig,
  CircuitMatrixConfig,
  SignalHuntConfig,
} from './family-types'
import type { MinigameFamily, MinigameVersion } from './types'

import { bearingHuntDefinition } from '../families/bearingHunt/definition'
import { circuitMatrixDefinition } from '../families/circuitMatrix/definition'
import { signalHuntDefinition } from '../families/signalHunt/definition'

// React player policy: family-native runtimes are the normal path.
// Legacy adapters may remain as migration tooling, but the React player resolver does not execute them.

export type NativeMinigameType = MinigameFamily
export type MinigameCompatibility = 'native' | 'legacy_bridge'

export interface ResolveMinigameInput {
  type?: string | null
  version?: string | null
  config?: unknown
}

export type ResolvedCircuitMatrixMinigame = {
  family: 'circuit_matrix'
  type: 'circuit_matrix'
  version: 'v1'
  compatibility: MinigameCompatibility
  legacy_type: string | null
  label: string
  definition: typeof circuitMatrixDefinition
  config: CircuitMatrixConfig
}

export type ResolvedBearingHuntMinigame = {
  family: 'bearing_hunt'
  type: 'bearing_hunt'
  version: 'v1'
  compatibility: MinigameCompatibility
  legacy_type: string | null
  label: string
  definition: typeof bearingHuntDefinition
  config: BearingHuntConfig
}

export type ResolvedSignalHuntMinigame = {
  family: 'signal_hunt'
  type: 'signal_hunt'
  version: 'v1'
  compatibility: MinigameCompatibility
  legacy_type: string | null
  label: string
  definition: typeof signalHuntDefinition
  config: SignalHuntConfig
}

export type ResolvedMinigame =
  | ResolvedCircuitMatrixMinigame
  | ResolvedBearingHuntMinigame
  | ResolvedSignalHuntMinigame

function asObject<T>(value: unknown): Partial<T> {
  return value && typeof value === 'object' ? (value as Partial<T>) : {}
}

function normalizeVersion(value?: string | null): MinigameVersion {
  return value === 'v1' ? 'v1' : 'v1'
}

export function isNativeMinigameFamily(value: string): value is MinigameFamily {
  return (
    value === 'circuit_matrix' ||
    value === 'bearing_hunt' ||
    value === 'signal_hunt'
  )
}

function resolveCircuitMatrixNative(
  input: ResolveMinigameInput
): ResolvedCircuitMatrixMinigame {
  return {
    family: 'circuit_matrix',
    type: 'circuit_matrix',
    version: normalizeVersion(input.version),
    compatibility: 'native',
    legacy_type: null,
    label: circuitMatrixDefinition.label,
    definition: circuitMatrixDefinition,
    config: {
      ...circuitMatrixDefinition.default_config,
      ...asObject<CircuitMatrixConfig>(input.config),
    },
  }
}

function resolveBearingHuntNative(
  input: ResolveMinigameInput
): ResolvedBearingHuntMinigame {
  return {
    family: 'bearing_hunt',
    type: 'bearing_hunt',
    version: normalizeVersion(input.version),
    compatibility: 'native',
    legacy_type: null,
    label: bearingHuntDefinition.label,
    definition: bearingHuntDefinition,
    config: {
      ...bearingHuntDefinition.default_config,
      ...asObject<BearingHuntConfig>(input.config),
    },
  }
}

function resolveSignalHuntNative(
  input: ResolveMinigameInput
): ResolvedSignalHuntMinigame {
  return {
    family: 'signal_hunt',
    type: 'signal_hunt',
    version: normalizeVersion(input.version),
    compatibility: 'native',
    legacy_type: null,
    label: signalHuntDefinition.label,
    definition: signalHuntDefinition,
    config: {
      ...signalHuntDefinition.default_config,
      ...asObject<SignalHuntConfig>(input.config),
    },
  }
}

function resolveNativeMinigame(
  input: ResolveMinigameInput & { type: MinigameFamily }
): ResolvedMinigame {
  if (input.type === 'circuit_matrix') {
    return resolveCircuitMatrixNative(input)
  }

  if (input.type === 'bearing_hunt') {
    return resolveBearingHuntNative(input)
  }

  return resolveSignalHuntNative(input)
}


function resolveLegacyBridgedMinigame(
  input: ResolveMinigameInput & { type: string }
): ResolvedMinigame | null {
  void input
  return null
}

export function resolveMinigame(input: ResolveMinigameInput): ResolvedMinigame | null {
  const type = String(input.type || '').trim().toLowerCase()
  if (!type) return null

  if (isNativeMinigameFamily(type)) {
    return resolveNativeMinigame({
      ...input,
      type,
    })
  }

  return resolveLegacyBridgedMinigame({
    ...input,
    type,
  })
}

export function resolveMinigameOrThrow(input: ResolveMinigameInput): ResolvedMinigame {
  const resolved = resolveMinigame(input)

  if (!resolved) {
    throw new Error(`Unsupported minigame type: ${String(input.type || 'unknown')}`)
  }

  return resolved
}

export function getResolvedMinigameLabel(input: ResolveMinigameInput): string | null {
  return resolveMinigame(input)?.label || null
}

export function listSupportedRuntimeTypes(): string[] {
  return [
    'circuit_matrix',
    'bearing_hunt',
    'signal_hunt',
    'circuit_hack',
    'switchboard',
    'cryptex',
    'simon_says',
    'radio_azimuth',
    'compass_blow',
    'gyro_storm',
    'digital_tuner',
  ]
}
