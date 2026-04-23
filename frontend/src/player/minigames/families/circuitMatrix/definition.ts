import type { CircuitMatrixConfig } from '../../core/family-types'
import type { CircuitMatrixDefinition } from '../../core/registry-types'
import type {
  MinigameController,
  MinigamePreflightResult,
  MinigameRuntimeBindings,
} from '../../core/types'

export const circuitMatrixDefinition: CircuitMatrixDefinition = {
  family: 'circuit_matrix',
  version: 'v1',
  label: 'Circuit Matrix',
  tagline: 'Restore the route',
  description:
    'Logic-heavy circuit restoration minigame for pathing, switching, power balancing and route recovery.',

  validation_mode: 'client',
  fallback_policy: 'manual_code',

  capabilities: [
    { key: 'touch', requirement: 'required', reason: 'Main interaction surface.' },
    { key: 'fullscreen', requirement: 'preferred', reason: 'Improves field readability.' },
    { key: 'vibration', requirement: 'optional', reason: 'Feedback on wrong moves and success.' },
    { key: 'audio', requirement: 'optional', reason: 'Optional feedback layer.' },
  ],

  ui: {
    fullscreen: true,
    briefing_required: true,
    supports_pause: true,
    supports_retry: true,
    supports_manual_fallback: true,
  },

  default_config: {
    objective: 'path_restore',
    grid_cols: 5,
    grid_rows: 5,
    difficulty: 2,
    max_moves: null,
    max_time_ms: null,
    allow_rotate: true,
    allow_toggle: true,
    allow_swap: false,
    start_nodes: [],
    end_nodes: [],
    target_pattern: [],
    blocked_cells: [],
    hint_mode: 'light',
    auto_check: true,
    success_animation: 'restore',
  },
}

function validateCircuitMatrixConfig(
  config: unknown
): { ok: true; value: CircuitMatrixConfig } | { ok: false; errors: string[] } {
  const raw = (config && typeof config === 'object' ? config : {}) as Partial<CircuitMatrixConfig>
  const value: CircuitMatrixConfig = {
    ...circuitMatrixDefinition.default_config,
    ...raw,
  }

  const errors: string[] = []

  if (!Number.isInteger(value.grid_cols) || value.grid_cols < 2 || value.grid_cols > 8) {
    errors.push('grid_cols must be an integer between 2 and 8')
  }

  if (!Number.isInteger(value.grid_rows) || value.grid_rows < 2 || value.grid_rows > 8) {
    errors.push('grid_rows must be an integer between 2 and 8')
  }

  if (
    value.difficulty !== undefined &&
    (!Number.isInteger(value.difficulty) || value.difficulty < 1 || value.difficulty > 5)
  ) {
    errors.push('difficulty must be an integer between 1 and 5')
  }

  if (value.max_moves !== null && value.max_moves !== undefined) {
    if (!Number.isInteger(value.max_moves) || value.max_moves < 1) {
      errors.push('max_moves must be null or an integer >= 1')
    }
  }

  if (value.max_time_ms !== null && value.max_time_ms !== undefined) {
    if (!Number.isInteger(value.max_time_ms) || value.max_time_ms < 1000) {
      errors.push('max_time_ms must be null or an integer >= 1000')
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  return { ok: true, value }
}

async function runCircuitMatrixPreflight(
  bindings: MinigameRuntimeBindings<CircuitMatrixConfig>
): Promise<MinigamePreflightResult> {
  const missing_required: string[] = []
  const missing_preferred: string[] = []

  if (typeof window === 'undefined') {
    missing_required.push('touch')
  }

  return {
    can_start: missing_required.length === 0,
    mode: missing_required.length === 0 ? 'normal' : 'blocked',
    missing_required: missing_required as never[],
    missing_preferred: missing_preferred as never[],
    messages:
      missing_required.length === 0
        ? ['Circuit matrix ready.']
        : ['Touch interaction is required for this minigame.'],
  }
}

export const circuitMatrixController: MinigameController<CircuitMatrixConfig> = {
  validateConfig: validateCircuitMatrixConfig,
  runPreflight: runCircuitMatrixPreflight,
}
