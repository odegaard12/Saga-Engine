import type {
  BearingHuntConfig,
  CircuitMatrixConfig,
  SignalHuntConfig,
  MotionChallengeConfig,
} from './family-types'
import type { MinigameFamily, MinigameVersion } from './types'

import { bearingHuntDefinition } from '../families/bearingHunt/definition'
import { circuitMatrixDefinition } from '../families/circuitMatrix/definition'
import { signalHuntDefinition } from '../families/signalHunt/definition'
import { motionChallengeDefinition } from '../families/motionChallenge/definition'

// React player policy: family-native runtimes are the normal path.
// Compatibility helpers may normalize older stage shapes, but the React player resolver only executes family-native runtimes.

export type NativeMinigameType = MinigameFamily
export type MinigameCompatibility = 'native'

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
  label: string
  definition: typeof circuitMatrixDefinition
  config: CircuitMatrixConfig
}

export type ResolvedBearingHuntMinigame = {
  family: 'bearing_hunt'
  type: 'bearing_hunt'
  version: 'v1'
  compatibility: MinigameCompatibility
  label: string
  definition: typeof bearingHuntDefinition
  config: BearingHuntConfig
}

export type ResolvedSignalHuntMinigame = {
  family: 'signal_hunt'
  type: 'signal_hunt'
  version: 'v1'
  compatibility: MinigameCompatibility
  label: string
  definition: typeof signalHuntDefinition
  config: SignalHuntConfig
}

export type ResolvedMotionChallengeMinigame = {
  family: 'motion_challenge'
  type: 'motion_challenge'
  version: 'v1'
  compatibility: MinigameCompatibility
  label: string
  definition: typeof motionChallengeDefinition
  config: MotionChallengeConfig
}

export type ResolvedMinigame =
  | ResolvedCircuitMatrixMinigame
  | ResolvedBearingHuntMinigame
  | ResolvedSignalHuntMinigame
  | ResolvedMotionChallengeMinigame

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
    value === 'signal_hunt' ||
    value === 'motion_challenge'
  )
}

function resolveCircuitMatrixNative(
  input: ResolveMinigameInput
): ResolvedCircuitMatrixMinigame {
  const config: CircuitMatrixConfig = {
    ...circuitMatrixDefinition.default_config,
    ...asObject<CircuitMatrixConfig>(input.config),
  }

  return {
    family: 'circuit_matrix',
    type: 'circuit_matrix',
    version: normalizeVersion(input.version),
    compatibility: 'native',
    label:
      config.game_id === 'sequence_code'
        ? 'Código secuencial'
        : config.game_id === 'place_mosaic'
          ? 'Mosaico del lugar'
          : config.game_id === 'tilt_maze'
            ? 'Laberinto de equilibrio'
            : circuitMatrixDefinition.label,
    definition: circuitMatrixDefinition,
    config,
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
    label: signalHuntDefinition.label,
    definition: signalHuntDefinition,
    config: {
      ...signalHuntDefinition.default_config,
      ...asObject<SignalHuntConfig>(input.config),
    },
  }
}

function resolveMotionChallengeNative(
  input: ResolveMinigameInput
): ResolvedMotionChallengeMinigame {
  return {
    family: 'motion_challenge',
    type: 'motion_challenge',
    version: normalizeVersion(input.version),
    compatibility: 'native',
    label: motionChallengeDefinition.label,
    definition: motionChallengeDefinition,
    config: {
      ...motionChallengeDefinition.default_config,
      ...asObject<MotionChallengeConfig>(input.config),
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

  if (input.type === 'motion_challenge') {
    return resolveMotionChallengeNative(input)
  }

  return resolveSignalHuntNative(input)
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
  return null
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
  return ['signal_hunt', 'bearing_hunt', 'circuit_matrix', 'motion_challenge']
}
