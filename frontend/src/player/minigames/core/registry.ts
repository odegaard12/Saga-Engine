import type { RegisteredMinigame } from './registry-types'

import {
  circuitMatrixController,
  circuitMatrixDefinition,
} from '../families/circuitMatrix/definition'
import {
  bearingHuntController,
  bearingHuntDefinition,
} from '../families/bearingHunt/definition'
import {
  signalHuntController,
  signalHuntDefinition,
} from '../families/signalHunt/definition'

export const MINIGAME_REGISTRY: RegisteredMinigame[] = [
  {
    definition: circuitMatrixDefinition,
    controller: circuitMatrixController,
  },
  {
    definition: bearingHuntDefinition,
    controller: bearingHuntController,
  },
  {
    definition: signalHuntDefinition,
    controller: signalHuntController,
  },
]

export function getRegisteredMinigame(family: string) {
  return MINIGAME_REGISTRY.find((item) => item.definition.family === family) || null
}
