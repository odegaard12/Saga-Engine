import { CircuitHackGame } from './games/CircuitHackGame'
import { CryptexGame } from './games/CryptexGame'
import { SimonSaysGame } from './games/SimonSaysGame'
import { DigitalTunerGame } from './games/DigitalTunerGame'
import { RadioAzimuthGame } from './games/RadioAzimuthGame'
import { GyroStormGame } from './games/GyroStormGame'
import { SwitchboardGame } from './games/SwitchboardGame'
import { CompassBlowGame } from './games/CompassBlowGame'
import type { PlayerMinigameDefinition } from './types'

const REGISTRY: Record<string, PlayerMinigameDefinition> = {
  circuit_hack: {
    type: 'circuit_hack',
    label: 'Circuit Hack',
    version: 'v1',
    supportsManualFallback: true,
    component: CircuitHackGame,
  },
  cryptex: {
    type: 'cryptex',
    label: 'Cryptex',
    version: 'v1',
    supportsManualFallback: true,
    component: CryptexGame,
  },
  simon_says: {
    type: 'simon_says',
    label: 'Simon Says',
    version: 'v1',
    supportsManualFallback: true,
    component: SimonSaysGame,
  },
  digital_tuner: {
    type: 'digital_tuner',
    label: 'Digital Tuner',
    version: 'v1',
    supportsManualFallback: true,
    component: DigitalTunerGame,
  },
  radio_azimuth: {
    type: 'radio_azimuth',
    label: 'Radio Azimuth',
    version: 'v1',
    supportsManualFallback: true,
    component: RadioAzimuthGame,
  },
  gyro_storm: {
    type: 'gyro_storm',
    label: 'Gyro Storm',
    version: 'v1',
    supportsManualFallback: true,
    component: GyroStormGame,
  },
  switchboard: {
    type: 'switchboard',
    label: 'Switchboard',
    version: 'v1',
    supportsManualFallback: true,
    component: SwitchboardGame,
  },
  compass_blow: {
    type: 'compass_blow',
    label: 'Compass Blow',
    version: 'v1',
    supportsManualFallback: true,
    component: CompassBlowGame,
  },
}

export function resolveMinigameDefinition(
  type?: string | null
): PlayerMinigameDefinition | null {
  const normalized = String(type || '')
    .trim()
    .toLowerCase()

  if (!normalized) return null
  return REGISTRY[normalized] || null
}

export function listRegisteredMinigameTypes(): string[] {
  return Object.keys(REGISTRY)
}
