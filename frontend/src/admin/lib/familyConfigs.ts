import type { AdminReactOverviewStage } from './adminApi'

export type FamilyId = 'signal_hunt' | 'bearing_hunt' | 'circuit_matrix' | 'motion_challenge'

export type EditableAdminStage = AdminReactOverviewStage & {
  config?: Record<string, unknown>
}

export const familyCards: Array<{
  id: FamilyId
  icon: string
  title: string
  detail: string
}> = [
  {
    id: 'motion_challenge',
    icon: '⚡',
    title: 'Motion Challenge',
    detail: 'Movimiento del móvil, agitar, calibrar y retos físicos.',
  },
  {
    id: 'signal_hunt',
    icon: '📡',
    title: 'Signal Hunt',
    detail: 'GPS proximity, signal strength and source capture.',
  },
  {
    id: 'bearing_hunt',
    icon: '🧭',
    title: 'Bearing Hunt',
    detail: 'Compass heading, sector lock and orientation capture.',
  },
  {
    id: 'circuit_matrix',
    icon: '🧩',
    title: 'Circuit Matrix',
    detail: 'Logic grids, route repair and lock-style board puzzles.',
  },
]

export function getAdminFamilyLabel(type: string) {
  if (type === 'motion_challenge') return 'Motion Challenge'
  if (type === 'bearing_hunt') return 'Bearing Hunt'
  if (type === 'circuit_matrix') return 'Matriz de circuitos'
  return 'Signal Hunt'
}

export function getAdminFamilyIcon(type: string) {
  if (type === 'motion_challenge') return '⚡'
  if (type === 'bearing_hunt') return '🧭'
  if (type === 'circuit_matrix') return '🧩'
  return '📡'
}

export function buildAdminMinigameBlock(type: string, config: Record<string, unknown>) {
  return {
    type,
    version: 'v1',
    label: getAdminFamilyLabel(type),
    config,
  }
}

function toAdminConfigNumber(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeCircuitDifficulty(value: unknown) {
  const raw = String(value ?? '').trim().toLowerCase()

  if (
    raw === 'easy' ||
    raw === 'facil' ||
    raw === 'fácil' ||
    raw === '1'
  ) {
    return 'easy'
  }

  if (
    raw === 'hard' ||
    raw === 'dificil' ||
    raw === 'difícil' ||
    raw === '3' ||
    raw === '4' ||
    raw === '5'
  ) {
    return 'hard'
  }

  return 'normal'
}


function normalizeSequenceTokens(value: unknown) {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 10)
}


export function getDefaultAdminConfigForFamily(type: string): Record<string, unknown> {
  if (type === 'motion_challenge') {
    return {
      objective: 'shake_charge',
      game_id: 'shake_antenna_charge',
      difficulty: 'normal',
      duration_mode: 'normal',
      penalty_mode: 'normal',
      allow_touch_fallback: true,
      energy_target: 100,
      time_limit_ms: 35000,
      stabilize_ms: 2000,
      calibration_ms: 1000,
      good_min: 1.2,
      good_max: 3.8,
      overcharge_threshold: 5.4,
      idle_decay: 0.15,
      charge_rate: 2.4,
      stability_min: 35,
      use_vibration: true,
    }
  }

  if (type === 'bearing_hunt') {
    return {
      objective: 'single_lock',
      target_bearing_deg: 270,
      tolerance_deg: 12,
      hold_ms: 1200,
    }
  }

  if (type === 'circuit_matrix') {
    return {
      objective: 'path_restore',
      game_id: 'logic_circuit',
      completion_method: 'puzzle',
      grid_cols: 5,
      grid_rows: 5,
      difficulty: 'normal',
      max_errors: 3,
      preview_cell_ms: 460,
      path_length: 11,
      seed: '',
      pattern_mode: 'random_each_game',
      path_cells: [],
    }
  }

  return {
    objective: 'proximity_lock',
    source_radius_m: 75,
    lock_threshold: 65,
    hold_ms: 1500,
  }
}

export function normalizeAdminConfigForFamily(
  type: string,
  input: Record<string, unknown>
) {
  const raw = input || {}

  if (type === 'motion_challenge') {
    return {
      objective: String(raw.objective || 'shake_charge'),
      game_id: String(raw.game_id || 'shake_antenna_charge'),
      difficulty: String(raw.difficulty || 'normal'),
      duration_mode: String(raw.duration_mode || 'normal'),
      penalty_mode: String(raw.penalty_mode || 'normal'),
      allow_touch_fallback: raw.allow_touch_fallback !== false,
      energy_target: toAdminConfigNumber(raw.energy_target, 100),
      time_limit_ms: toAdminConfigNumber(raw.time_limit_ms, 35000),
      stabilize_ms: toAdminConfigNumber(raw.stabilize_ms, 2000),
      calibration_ms: toAdminConfigNumber(raw.calibration_ms, 1000),
      good_min: toAdminConfigNumber(raw.good_min, 1.2),
      good_max: toAdminConfigNumber(raw.good_max, 3.8),
      overcharge_threshold: toAdminConfigNumber(raw.overcharge_threshold, 5.4),
      idle_decay: toAdminConfigNumber(raw.idle_decay, 0.15),
      charge_rate: toAdminConfigNumber(raw.charge_rate, 2.4),
      stability_min: toAdminConfigNumber(raw.stability_min, 35),
      use_vibration: raw.use_vibration !== false,
    }
  }

  if (type === 'bearing_hunt') {
    const bearing =
      raw.target_bearing_deg !== undefined
        ? raw.target_bearing_deg
        : raw.target_bearing

    return {
      objective: String(raw.objective || 'single_lock'),
      target_bearing_deg: toAdminConfigNumber(bearing, 270),
      tolerance_deg: toAdminConfigNumber(raw.tolerance_deg, 12),
      hold_ms: toAdminConfigNumber(raw.hold_ms, 1200),
    }
  }

  if (
    type === 'circuit_matrix' &&
    (
      raw.game_id === 'tilt_maze' ||
      raw.objective === 'balance_maze'
    )
  ) {
    const difficulty =
      normalizeCircuitDifficulty(
        raw.difficulty,
      )

    const fallbackSize =
      difficulty === 'easy'
        ? 7
        : difficulty === 'hard'
          ? 11
          : 9

    return {
      objective: 'balance_maze',
      game_id: 'tilt_maze',
      completion_method: 'motion',
      difficulty,
      grid_rows: Math.max(
        5,
        Math.min(
          13,
          Math.round(
            toAdminConfigNumber(
              raw.grid_rows,
              fallbackSize,
            ),
          ),
        ),
      ),
      grid_cols: Math.max(
        5,
        Math.min(
          13,
          Math.round(
            toAdminConfigNumber(
              raw.grid_cols,
              fallbackSize,
            ),
          ),
        ),
      ),
      pattern_mode:
        raw.pattern_mode ===
        'random_each_game'
          ? 'random_each_game'
          : 'fixed',
      maze_seed:
        String(
          raw.maze_seed ||
          'saga-maze',
        ).trim().slice(0, 80) ||
        'saga-maze',
      time_limit_s: Math.max(
        20,
        Math.min(
          180,
          Math.round(
            toAdminConfigNumber(
              raw.time_limit_s,
              75,
            ),
          ),
        ),
      ),
      lives: Math.max(
        1,
        Math.min(
          5,
          Math.round(
            toAdminConfigNumber(
              raw.lives,
              3,
            ),
          ),
        ),
      ),
      hole_count: Math.max(
        0,
        Math.min(
          18,
          Math.round(
            toAdminConfigNumber(
              raw.hole_count,
              4,
            ),
          ),
        ),
      ),
      collectible_count: Math.max(
        0,
        Math.min(
          6,
          Math.round(
            toAdminConfigNumber(
              raw.collectible_count,
              2,
            ),
          ),
        ),
      ),
      sensor_enabled:
        raw.sensor_enabled !== false,
      tilt_threshold: Math.max(
        6,
        Math.min(
          30,
          Math.round(
            toAdminConfigNumber(
              raw.tilt_threshold,
              12,
            ),
          ),
        ),
      ),
      step_cooldown_ms: Math.max(
        180,
        Math.min(
          800,
          Math.round(
            toAdminConfigNumber(
              raw.step_cooldown_ms,
              360,
            ),
          ),
        ),
      ),
    }
  }

  if (
    type === 'circuit_matrix' &&
    (
      raw.game_id === 'place_mosaic' ||
      raw.objective === 'image_mosaic'
    )
  ) {
    const gridSize = Math.max(
      2,
      Math.min(
        4,
        Math.round(
          toAdminConfigNumber(
            raw.grid_size ??
              raw.grid_cols ??
              raw.grid_rows,
            3,
          ),
        ),
      ),
    )

    const rawImage = String(
      raw.image_data_url || '',
    ).trim()

    const validImage =
      rawImage.length <= 600000 &&
      (
        rawImage.startsWith(
          'data:image/jpeg;base64,',
        ) ||
        rawImage.startsWith(
          'data:image/png;base64,',
        ) ||
        rawImage.startsWith(
          'data:image/webp;base64,',
        )
      )

    const choices = Array.isArray(
      raw.final_choices,
    )
      ? raw.final_choices
          .map((item) =>
            String(item).trim().slice(0, 60),
          )
          .filter(Boolean)
          .slice(0, 4)
      : []

    const safeChoices =
      choices.length >= 2
        ? choices
        : [
            'Puerta',
            'Escudo',
            'Campana',
          ]

    const correctIndex = Math.max(
      0,
      Math.min(
        safeChoices.length - 1,
        Math.round(
          toAdminConfigNumber(
            raw.final_correct_index,
            0,
          ),
        ),
      ),
    )

    return {
      objective: 'image_mosaic',
      game_id: 'place_mosaic',
      completion_method: 'puzzle',
      image_data_url:
        validImage
          ? rawImage
          : '',
      image_alt: String(
        raw.image_alt || '',
      ).trim().slice(0, 120),
      grid_size: gridSize,
      grid_cols: gridSize,
      grid_rows: gridSize,
      preview_ms: Math.max(
        0,
        Math.min(
          6000,
          Math.round(
            toAdminConfigNumber(
              raw.preview_ms,
              2500,
            ),
          ),
        ),
      ),
      max_moves: Math.max(
        0,
        Math.min(
          500,
          Math.round(
            toAdminConfigNumber(
              raw.max_moves,
              0,
            ),
          ),
        ),
      ),
      require_final_question:
        raw.require_final_question === true,
      final_question: String(
        raw.final_question ||
        '¿Qué detalle aparece en el lugar real?',
      ).trim().slice(0, 180),
      final_choices: safeChoices,
      final_correct_index:
        correctIndex,
    }
  }

  if (
    type === 'circuit_matrix' &&
    (
      raw.game_id === 'sequence_code' ||
      raw.objective === 'sequence_order'
    )
  ) {
    const sequence = normalizeSequenceTokens(
      raw.sequence,
    )

    return {
      objective: 'sequence_order',
      game_id: 'sequence_code',
      completion_method: 'sequence',
      sequence,
      difficulty: normalizeCircuitDifficulty(
        raw.difficulty,
      ),
      max_attempts: Math.max(
        1,
        Math.min(
          8,
          Math.round(
            toAdminConfigNumber(
              raw.max_attempts,
              3,
            ),
          ),
        ),
      ),
      hint_text: String(
        raw.hint_text || '',
      ).trim().slice(0, 240),
      shuffle_choices: true,
    }
  }

  if (type === 'circuit_matrix') {
    const pathCells = Array.isArray(raw.path_cells)
      ? raw.path_cells.map(String)
      : []

    const patternMode =
      raw.pattern_mode === 'fixed' ||
      pathCells.length >= 4
        ? 'fixed'
        : 'random_each_game'

    return {
      objective: String(raw.objective || 'path_restore'),
      game_id: String(raw.game_id || 'logic_circuit'),
      completion_method: 'puzzle',
      grid_cols: toAdminConfigNumber(
        raw.grid_cols ?? raw.grid_size,
        5,
      ),
      grid_rows: toAdminConfigNumber(
        raw.grid_rows ?? raw.grid_size,
        5,
      ),
      difficulty: normalizeCircuitDifficulty(
        raw.difficulty,
      ),
      max_errors: toAdminConfigNumber(
        raw.max_errors,
        3,
      ),
      preview_cell_ms: toAdminConfigNumber(
        raw.preview_cell_ms,
        460,
      ),
      path_length:
        patternMode === 'fixed'
          ? pathCells.length
          : toAdminConfigNumber(
              raw.path_length,
              11,
            ),
      seed: String(raw.seed || ''),
      pattern_mode: patternMode,
      path_cells: pathCells,
    }
  }

  return {
    objective: String(raw.objective || 'proximity_lock'),
    source_radius_m: toAdminConfigNumber(raw.source_radius_m, 75),
    lock_threshold: toAdminConfigNumber(raw.lock_threshold, 65),
    hold_ms: toAdminConfigNumber(raw.hold_ms, 1500),
  }
}
