import type { AdminReactOverviewStage } from './adminApi'
import { gameRegistry, getRegistryGame, registryGames, type RegistryFamily } from '../../shared/gameRegistry'

// Familias TÉCNICAS: salen de shared/game_registry.json (`families`). Ya no es
// una unión de literales a mano; el test parametrizado
// tests/test_registro_de_minijuegos.py valida los ids.
export type FamilyId = string

export type EditableAdminStage = AdminReactOverviewStage & {
  config?: Record<string, unknown>
}

// Orden de las tarjetas del editor: `family_card_order` del registro.
export const familyCards: Array<{
  id: FamilyId
  icon: string
  title: string
  detail: string
}> = gameRegistry.family_card_order.map((id) => {
  const family = gameRegistry.families.find((item) => item.id === id) as RegistryFamily
  return { id: family.id, icon: family.icon, title: family.label, detail: family.detail }
})

export function getAdminFamilyLabel(type: string) {
  const family = gameRegistry.families.find((item) => item.id === type)
  if (family) return family.admin_label
  const extra = gameRegistry.extra_type_labels[type]
  if (extra) return extra.label
  return 'Checkpoint GPS'
}

export function getAdminFamilyIcon(type: string) {
  const family = gameRegistry.families.find((item) => item.id === type)
  if (family) return family.admin_icon
  const extra = gameRegistry.extra_type_labels[type]
  if (extra) return extra.icon
  return '📍'
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
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()

  if (raw === 'easy' || raw === 'facil' || raw === 'fácil' || raw === '1') {
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
      game_id: 'shake_charge',
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

  if (type === 'audio_challenge') {
    return {
      objective: 'blow_charge',
      game_id: 'audio_challenge',
    }
  }

  if (type === 'word_trap') {
    return {
      objective: 'word_trap',
      game_id: 'trampa_palabras',
      completion_method: 'quiz',
      n_rounds: 8,
      time_limit_s: 12,
      questions: [],
    }
  }

  return {
    objective: 'proximity_lock',
    source_radius_m: 75,
    lock_threshold: 65,
    hold_ms: 1500,
  }
}

// Claves declaradas (config_keys) por juego, para reconocer restos de OTRO
// juego de la misma familia técnica (ver conservarClavesDesconocidas).
const CLAVES_POR_JUEGO = new Map<string, Set<string>>(
  registryGames.map((game) => [game.id, new Set(game.config_keys || [])])
)

/**
 * Qué se hace con las claves de `raw` que el normalizador de la familia no
 * emite. ANTES se tiraban SIEMPRE, en silencio: así se perdieron `targets`
 * (rumbo_doble), `questions` (cuenta_senales), los campos pulso_* y, sin que
 * nadie lo notara, `required_members` (team_relay), clue_text/... (mapa_mudo)
 * y target_hits/... (spark_radar). Ahora se CONSERVAN por defecto
 * (config_policy "keep_unknown" del registro), con una sola excepción: una
 * clave que el registro declara para OTRO juego de la misma familia técnica y
 * no para este es un resto de un cambio de juego y se descarta, como antes.
 * Un juego con "config_policy": "strict" en el registro conserva el
 * comportamiento antiguo (sólo lo que emita el normalizador).
 */
function conservarClavesDesconocidas(
  raw: Record<string, unknown>,
  out: Record<string, any>,
  gameId: string
) {
  const game = getRegistryGame(gameId)
  const policy = game?.config_policy || gameRegistry.config_policy.default
  if (policy === 'strict') return

  const familiares = registryGames.filter(
    (other) => game && other.id !== game.id && other.family === game.family
  )

  for (const [key, value] of Object.entries(raw)) {
    if (key in out || value === undefined) continue
    if (game && !(CLAVES_POR_JUEGO.get(game.id) as Set<string>).has(key)) {
      if (familiares.some((other) => (CLAVES_POR_JUEGO.get(other.id) as Set<string>).has(key))) continue
    }
    out[key] = value
  }
}

export function normalizeAdminConfigForFamily(type: string, input: Record<string, unknown>): Record<string, any> {
  const raw = input || {}
  const out = _normalizeAdminConfigForFamilyRaw(type, raw) as Record<string, any>

  for (const field of ['is_map_collectible', 'game_id', 'game_title', 'completion_method']) {
    if (field in raw) {
      if (field === 'is_map_collectible') {
        out[field] = Boolean(raw[field])
      } else {
        out[field] = String(raw[field]).trim()
      }
    }
  }

  conservarClavesDesconocidas(raw, out, String(out.game_id || raw.game_id || ''))

  return out
}

function _normalizeAdminConfigForFamilyRaw(type: string, input: Record<string, unknown>) {
  const raw = input || {}

  if (type === 'audio_challenge') {
    return {
      objective: String(raw.objective || 'blow_charge'),
      game_id: String(raw.game_id || 'audio_challenge'),
    }
  }

  // "Trampa de palabras" (game_id trampa_palabras, familia word_trap NUEVA):
  // MISMO bug que rumbo_doble/cuenta_senales de abajo -un `return` genérico
  // devuelve SIEMPRE sus propias claves fijas y tira cualquier otra cosa que
  // traiga `raw`-. Como word_trap es una familia TÉCNICA propia (no un
  // game_id compartido dentro de bearing_hunt/signal_hunt), esta rama va
  // arriba del todo, igual que audio_challenge: sin ella, `questions`
  // (el banco completo que escribió el organizador) se perdería aquí, ANTES
  // de llegar al backend, exactamente como le pasó a `targets`/`questions`
  // en v5.38/5.39. El editor dedicado vive en
  // admin/components/trampaPalabras/TrampaPalabrasEditor.tsx.
  if (type === 'word_trap') {
    const rawQuestions = Array.isArray(raw.questions) ? raw.questions : []
    const questions = rawQuestions
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .slice(0, 40)
      .map((item) => {
        const rawOptions = Array.isArray(item.options) ? item.options : []
        const options = rawOptions.map((opt) => String(opt).trim().slice(0, 120)).slice(0, 4)
        while (options.length < 4) options.push(`Opción ${options.length + 1}`)
        return {
          question: String(item.question ?? '').trim().slice(0, 300),
          options,
          correct_index: Math.max(0, Math.min(3, Math.round(toAdminConfigNumber(item.correct_index, 0)))),
          explanation: String(item.explanation ?? '').trim().slice(0, 400),
        }
      })
      .filter((item) => item.question.length > 0)

    // Ya NO se rellena hasta 4 con «Pregunta trampa N: escribe el enunciado»: ese
    // relleno se guardaba y llegaba a los jugadores como preguntas de verdad. Si
    // faltan preguntas, el guardado del panel lo avisa (ver
    // `incompleteWordTrapNodes` en adminSaveChecks.ts) en vez de inventarlas.
    return {
      objective: 'word_trap',
      game_id: 'trampa_palabras',
      completion_method: 'quiz',
      questions,
      n_rounds: Math.max(4, Math.min(12, Math.round(toAdminConfigNumber(raw.n_rounds, 8)))),
      time_limit_s: Math.max(4, Math.min(30, Math.round(toAdminConfigNumber(raw.time_limit_s, 12)))),
    }
  }

  // "Pulso de hierro" (owner-approved, game_id 'pulso_hierro'): MISMO bug
  // que rumbo_doble/cuenta_senales arriba -la rama genérica de
  // motion_challonge, justo debajo, devuelve SIEMPRE sus claves fijas de
  // shake_charge y tiraría los campos pulso_* antes de llegar al backend.
  // Esta rama tiene que ir ANTES de esa.
  if (type === 'motion_challenge' && raw.game_id === 'pulso_hierro') {
    return {
      objective: 'pulso_hierro',
      game_id: 'pulso_hierro',
      difficulty: String(raw.difficulty || 'hard'),
      allow_touch_fallback: raw.allow_touch_fallback !== false,
      pulso_start_length: Math.max(2, Math.min(6, Math.round(toAdminConfigNumber(raw.pulso_start_length, 3)))),
      pulso_target_rounds: Math.max(
        3,
        Math.min(10, Math.round(toAdminConfigNumber(raw.pulso_target_rounds, 6)))
      ),
      pulso_growth_per_round: Math.max(
        0,
        Math.min(3, Math.round(toAdminConfigNumber(raw.pulso_growth_per_round, 1)))
      ),
      pulso_stability_variance_max: Math.max(
        0.2,
        Math.min(3, toAdminConfigNumber(raw.pulso_stability_variance_max, 0.9))
      ),
      pulso_tap_window_ms: Math.max(
        1200,
        Math.min(5000, Math.round(toAdminConfigNumber(raw.pulso_tap_window_ms, 2600)))
      ),
      pulso_pad_count: Math.max(3, Math.min(6, Math.round(toAdminConfigNumber(raw.pulso_pad_count, 4)))),
      use_vibration: raw.use_vibration !== false,
    }
  }

  if (type === 'motion_challenge') {
    return {
      objective: String(raw.objective || 'shake_charge'),
      game_id: String(raw.game_id || 'shake_charge'),
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
    // "Rumbo doble" (game_id rumbo_doble): la rama de objetivo único de
    // abajo devolvía SIEMPRE esas 4 claves fijas, sin importar lo que
    // trajera `raw` -así que `targets` (y show_numeric_bearing/
    // show_compass_ring/allow_recenter) se perdían aquí, ANTES de llegar
    // siquiera al backend: cada edición de la lista de objetivos en
    // RumboDobleEditor.tsx se guardaba, pero al pasar por este
    // normalizador quedaba pisada por los 2 objetivos de relleno por
    // defecto del backend (normalize_minigame_config, que rellena cuando
    // `targets` no llega). Encontrado guardando un nodo real en el banco
    // local, no a ojo: el "Guardado" de la UI parecía correcto pero el
    // nodo persistido no tenía las pistas ni los rumbos que se habían
    // escrito.
    if (raw.game_id === 'rumbo_doble' || raw.objective === 'bearing_sequence') {
      const rawTargets = Array.isArray(raw.targets) ? raw.targets : []
      const targets = rawTargets
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .slice(0, 3)
        .map((item) => ({
          label: String(item.label ?? '').slice(0, 120),
          bearing_deg: ((toAdminConfigNumber(item.bearing_deg, 0) % 360) + 360) % 360,
        }))

      while (targets.length < 2) {
        targets.push({ label: `Objetivo ${targets.length + 1}`, bearing_deg: targets.length === 0 ? 0 : 90 })
      }

      return {
        objective: 'bearing_sequence',
        game_id: 'rumbo_doble',
        targets,
        tolerance_deg: toAdminConfigNumber(raw.tolerance_deg, 12),
        hold_ms: toAdminConfigNumber(raw.hold_ms, 1200),
        show_numeric_bearing: raw.show_numeric_bearing === true,
        show_compass_ring: raw.show_compass_ring !== false,
        allow_recenter: raw.allow_recenter !== false,
      }
    }

    const bearing =
      raw.target_bearing_deg !== undefined ? raw.target_bearing_deg : raw.target_bearing

    return {
      objective: String(raw.objective || 'single_lock'),
      target_bearing_deg: toAdminConfigNumber(bearing, 270),
      tolerance_deg: toAdminConfigNumber(raw.tolerance_deg, 12),
      hold_ms: toAdminConfigNumber(raw.hold_ms, 1200),
    }
  }

  if (
    type === 'circuit_matrix' &&
    (raw.game_id === 'tilt_maze' || raw.objective === 'balance_maze')
  ) {
    const difficulty = normalizeCircuitDifficulty(raw.difficulty)

    const fallbackSize = difficulty === 'easy' ? 7 : difficulty === 'hard' ? 11 : 9

    return {
      objective: 'balance_maze',
      game_id: 'tilt_maze',
      completion_method: 'motion',
      difficulty,
      grid_rows: Math.max(
        5,
        Math.min(13, Math.round(toAdminConfigNumber(raw.grid_rows, fallbackSize)))
      ),
      grid_cols: Math.max(
        5,
        Math.min(13, Math.round(toAdminConfigNumber(raw.grid_cols, fallbackSize)))
      ),
      pattern_mode: raw.pattern_mode === 'random_each_game' ? 'random_each_game' : 'fixed',
      maze_seed:
        String(raw.maze_seed || 'saga-maze')
          .trim()
          .slice(0, 80) || 'saga-maze',
      time_limit_s: Math.max(
        20,
        Math.min(180, Math.round(toAdminConfigNumber(raw.time_limit_s, 75)))
      ),
      lives: Math.max(1, Math.min(5, Math.round(toAdminConfigNumber(raw.lives, 3)))),
      hole_count: Math.max(0, Math.min(18, Math.round(toAdminConfigNumber(raw.hole_count, 4)))),
      collectible_count: Math.max(
        0,
        Math.min(6, Math.round(toAdminConfigNumber(raw.collectible_count, 2)))
      ),
      sensor_enabled: raw.sensor_enabled !== false,
      tilt_threshold: Math.max(
        6,
        Math.min(30, Math.round(toAdminConfigNumber(raw.tilt_threshold, 12)))
      ),
      step_cooldown_ms: Math.max(
        180,
        Math.min(800, Math.round(toAdminConfigNumber(raw.step_cooldown_ms, 360)))
      ),
    }
  }

  if (
    type === 'circuit_matrix' &&
    (raw.game_id === 'place_mosaic' || raw.objective === 'image_mosaic')
  ) {
    const gridSize = Math.max(
      2,
      Math.min(
        4,
        Math.round(toAdminConfigNumber(raw.grid_size ?? raw.grid_cols ?? raw.grid_rows, 3))
      )
    )

    const rawImage = String(raw.image_data_url || '').trim()

    const validImage =
      rawImage.length <= 600000 &&
      (rawImage.startsWith('data:image/jpeg;base64,') ||
        rawImage.startsWith('data:image/png;base64,') ||
        rawImage.startsWith('data:image/webp;base64,'))

    const choices = Array.isArray(raw.final_choices)
      ? raw.final_choices
          .map((item) => String(item).trim().slice(0, 60))
          .filter(Boolean)
          .slice(0, 4)
      : []

    const safeChoices = choices.length >= 2 ? choices : ['Puerta', 'Escudo', 'Campana']

    const correctIndex = Math.max(
      0,
      Math.min(safeChoices.length - 1, Math.round(toAdminConfigNumber(raw.final_correct_index, 0)))
    )

    return {
      objective: 'image_mosaic',
      game_id: 'place_mosaic',
      completion_method: 'puzzle',
      image_data_url: validImage ? rawImage : '',
      image_alt: String(raw.image_alt || '')
        .trim()
        .slice(0, 120),
      grid_size: gridSize,
      grid_cols: gridSize,
      grid_rows: gridSize,
      preview_ms: Math.max(
        0,
        Math.min(6000, Math.round(toAdminConfigNumber(raw.preview_ms, 2500)))
      ),
      max_moves: Math.max(0, Math.min(500, Math.round(toAdminConfigNumber(raw.max_moves, 0)))),
      require_final_question: raw.require_final_question === true,
      final_question: String(raw.final_question || '¿Qué detalle aparece en el lugar real?')
        .trim()
        .slice(0, 180),
      final_choices: safeChoices,
      final_correct_index: correctIndex,
    }
  }

  if (
    type === 'circuit_matrix' &&
    (raw.game_id === 'sequence_code' || raw.objective === 'sequence_order')
  ) {
    const sequence = normalizeSequenceTokens(raw.sequence)

    return {
      objective: 'sequence_order',
      game_id: 'sequence_code',
      completion_method: 'sequence',
      sequence,
      difficulty: normalizeCircuitDifficulty(raw.difficulty),
      max_attempts: Math.max(1, Math.min(8, Math.round(toAdminConfigNumber(raw.max_attempts, 3)))),
      hint_text: String(raw.hint_text || '')
        .trim()
        .slice(0, 240),
      shuffle_choices: true,
    }
  }

  if (type === 'circuit_matrix') {
    const pathCells = Array.isArray(raw.path_cells) ? raw.path_cells.map(String) : []

    const patternMode =
      raw.pattern_mode === 'fixed' || pathCells.length >= 4 ? 'fixed' : 'random_each_game'

    return {
      objective: String(raw.objective || 'path_restore'),
      game_id: String(raw.game_id || 'logic_circuit'),
      completion_method: 'puzzle',
      grid_cols: toAdminConfigNumber(raw.grid_cols ?? raw.grid_size, 5),
      grid_rows: toAdminConfigNumber(raw.grid_rows ?? raw.grid_size, 5),
      difficulty: normalizeCircuitDifficulty(raw.difficulty),
      max_errors: toAdminConfigNumber(raw.max_errors, 3),
      preview_cell_ms: toAdminConfigNumber(raw.preview_cell_ms, 460),
      path_length:
        patternMode === 'fixed' ? pathCells.length : toAdminConfigNumber(raw.path_length, 11),
      seed: String(raw.seed || ''),
      pattern_mode: patternMode,
      path_cells: pathCells,
    }
  }

  // "Cuenta las señales" (game_id cuenta_senales): MISMO bug que rumbo_doble
  // arriba -el `return` de signal_hunt de siempre, justo debajo, devuelve
  // SIEMPRE sus 4 claves fijas y tira cualquier otra cosa que traiga `raw`.
  // Sin esta rama, `questions` (las 2-5 preguntas con su respuesta) se
  // perdería aquí, ANTES de llegar al backend, exactamente como le pasó a
  // `targets` de rumbo_doble (ver ese comentario). El editor dedicado vive
  // en admin/components/cuentaSenales/CuentaSenalesEditor.tsx.
  if (raw.game_id === 'cuenta_senales' || raw.objective === 'count_signals') {
    const rawQuestions = Array.isArray(raw.questions) ? raw.questions : []
    const questions = rawQuestions
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .slice(0, 5)
      .map((item) => ({
        question: String(item.question ?? '').slice(0, 240),
        answer: Math.max(0, Math.min(999, Math.round(toAdminConfigNumber(item.answer, 0)))),
        tolerance: Math.max(0, Math.min(20, Math.round(toAdminConfigNumber(item.tolerance, 0)))),
        hint_image_data_url: String(item.hint_image_data_url || '').trim(),
      }))
      .filter((item) => item.question.length > 0)

    while (questions.length < 2) {
      questions.push({
        question: `Objetivo ${questions.length + 1}: ¿cuántos hay?`,
        answer: 1,
        tolerance: 0,
        hint_image_data_url: '',
      })
    }

    return {
      objective: 'count_signals',
      game_id: 'cuenta_senales',
      completion_method: 'manual_code',
      questions,
    }
  }

  return {
    objective: String(raw.objective || 'proximity_lock'),
    source_radius_m: toAdminConfigNumber(raw.source_radius_m, 75),
    lock_threshold: toAdminConfigNumber(raw.lock_threshold, 65),
    hold_ms: toAdminConfigNumber(raw.hold_ms, 1500),
  }
}
