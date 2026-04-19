import { CircuitHackGame } from './games/CircuitHackGame'
import { CryptexGame } from './games/CryptexGame'
import { SimonSaysGame } from './games/SimonSaysGame'
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
