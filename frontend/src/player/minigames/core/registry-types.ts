import type { MinigameDefinitionBase } from './types'

import type {
  BearingHuntConfig,
  CircuitMatrixConfig,
  SignalHuntConfig,
  MotionChallengeConfig,
} from './family-types'

export type CircuitMatrixDefinition = MinigameDefinitionBase<'circuit_matrix', CircuitMatrixConfig>

export type BearingHuntDefinition = MinigameDefinitionBase<'bearing_hunt', BearingHuntConfig>

export type SignalHuntDefinition = MinigameDefinitionBase<'signal_hunt', SignalHuntConfig>

export type MotionChallengeDefinition = MinigameDefinitionBase<
  'motion_challenge',
  MotionChallengeConfig
>
