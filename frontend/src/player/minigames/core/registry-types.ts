import type {
  MinigameController,
  MinigameDefinitionBase,
} from './types'

import type {
  BearingHuntConfig,
  CircuitMatrixConfig,
  SignalHuntConfig,
} from './family-types'

export type CircuitMatrixDefinition = MinigameDefinitionBase<
  'circuit_matrix',
  CircuitMatrixConfig
>

export type BearingHuntDefinition = MinigameDefinitionBase<
  'bearing_hunt',
  BearingHuntConfig
>

export type SignalHuntDefinition = MinigameDefinitionBase<
  'signal_hunt',
  SignalHuntConfig
>

export type RegisteredMinigame =
  | {
      definition: CircuitMatrixDefinition
      controller: MinigameController<CircuitMatrixConfig>
    }
  | {
      definition: BearingHuntDefinition
      controller: MinigameController<BearingHuntConfig>
    }
  | {
      definition: SignalHuntDefinition
      controller: MinigameController<SignalHuntConfig>
    }
