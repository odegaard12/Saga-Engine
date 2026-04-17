import { CircuitHackGame } from './games/CircuitHackGame'
import type { PlayerMinigameDefinition } from './types'

const REGISTRY: Record<string, PlayerMinigameDefinition> = {
  circuit_hack: {
    type: 'circuit_hack',
    label: 'Circuit Hack',
    version: 'v1',
    supportsManualFallback: true,
    component: CircuitHackGame,
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
