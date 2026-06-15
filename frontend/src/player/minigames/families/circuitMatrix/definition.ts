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
  label: 'Matriz de circuitos',
  tagline: 'Memoriza y restaura la ruta',
  description:
    'Juego táctil de memoria para restaurar una ruta de energía en una matriz.',

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
    difficulty: 'normal',
    max_errors: 3,
    preview_cell_ms: 460,
    path_length: 11,
    seed: '',
    pattern_mode: 'random_each_game',
    path_cells: [],
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

  const difficulty = value.difficulty

  if (
    difficulty !== undefined &&
    !(
      (typeof difficulty === 'number' &&
        Number.isInteger(difficulty) &&
        difficulty >= 1 &&
        difficulty <= 5) ||
      difficulty === 'easy' ||
      difficulty === 'normal' ||
      difficulty === 'hard'
    )
  ) {
    errors.push(
      'difficulty must be 1-5 or easy/normal/hard',
    )
  }

  if (
    value.max_errors !== undefined &&
    (!Number.isInteger(value.max_errors) ||
      value.max_errors < 1 ||
      value.max_errors > 6)
  ) {
    errors.push('max_errors must be an integer between 1 and 6')
  }

  if (
    value.preview_cell_ms !== undefined &&
    (!Number.isInteger(value.preview_cell_ms) ||
      value.preview_cell_ms < 220 ||
      value.preview_cell_ms > 900)
  ) {
    errors.push('preview_cell_ms must be an integer between 220 and 900')
  }

  if (
    value.path_length !== undefined &&
    (!Number.isInteger(value.path_length) || value.path_length < 4)
  ) {
    errors.push('path_length must be an integer >= 4')
  }

  if (
    value.pattern_mode !== undefined &&
    value.pattern_mode !== 'random_each_game' &&
    value.pattern_mode !== 'fixed'
  ) {
    errors.push(
      'pattern_mode must be random_each_game or fixed'
    )
  }

  if (
    value.path_cells !== undefined &&
    !Array.isArray(value.path_cells)
  ) {
    errors.push('path_cells must be an array')
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
        ? ['Matriz de circuitos preparada.']
        : ['Se necesita interacción táctil para jugar.'],
  }
}

export const circuitMatrixController: MinigameController<CircuitMatrixConfig> = {
  validateConfig: validateCircuitMatrixConfig,
  runPreflight: runCircuitMatrixPreflight,
}
