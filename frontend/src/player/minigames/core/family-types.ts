export type MotionChallengeObjective = 'shake_charge' | 'figure_eight' | 'rotary_safe' | 'pulso_hierro'

export type MotionChallengeConfig = {
  objective: MotionChallengeObjective
  game_id?: string
  difficulty?: 'easy' | 'normal' | 'hard'
  duration_mode?: 'short' | 'normal' | 'long'
  penalty_mode?: 'soft' | 'normal' | 'hard'
  allow_touch_fallback?: boolean
  energy_target?: number
  time_limit_ms?: number
  stabilize_ms?: number
  calibration_ms?: number
  good_min?: number
  good_max?: number
  overcharge_threshold?: number
  idle_decay?: number
  charge_rate?: number
  stability_min?: number
  use_vibration?: boolean
  // "Pulso de hierro" (game_id 'pulso_hierro'): dos manos a la vez, dos
  // streams de entrada independientes -motionChallenge invertido (quietud,
  // no sacudida) más una secuencia Simón Dice que crece por ronda-. Todo
  // admin-configurable, cero editor propio (ver
  // guidedEditorUtils.ts/guidedConfigKeysForGame): son números planos, no
  // hace falta un componente dedicado como RumboDobleEditor.tsx. Ver
  // PulsoHierroRuntimeScreen.tsx y _suelo_pulso_hierro en anti_cheat.py.
  pulso_start_length?: number
  pulso_target_rounds?: number
  pulso_growth_per_round?: number
  pulso_stability_variance_max?: number
  pulso_tap_window_ms?: number
  pulso_pad_count?: number
}

export type CircuitMatrixObjective =
  | 'path_restore'
  | 'power_balance'
  | 'switch_logic'
  | 'signal_route'
  | 'sequence_order'
  | 'image_mosaic'
  | 'balance_maze'

export type BearingHuntObjective = 'single_lock' | 'multi_lock' | 'sector_scan' | 'bearing_sequence'

export type SignalHuntObjective =
  'proximity_lock' | 'directional_lock' | 'hybrid_trace' | 'stability_capture'

export type CircuitMatrixConfig = {
  objective: CircuitMatrixObjective
  game_id?: string
  completion_method?: 'puzzle' | 'sequence' | 'motion'
  sequence?: string[]
  max_attempts?: number
  hint_text?: string
  shuffle_choices?: boolean

  image_data_url?: string
  image_alt?: string
  grid_size?: number
  preview_ms?: number
  require_final_question?: boolean
  final_question?: string
  final_choices?: string[]
  final_correct_index?: number

  maze_seed?: string
  time_limit_s?: number
  lives?: number
  hole_count?: number
  collectible_count?: number
  sensor_enabled?: boolean
  tilt_threshold?: number
  step_cooldown_ms?: number

  grid_cols: number
  grid_rows: number
  seed?: string
  difficulty?: 1 | 2 | 3 | 4 | 5 | 'easy' | 'normal' | 'hard'
  max_moves?: number | null
  max_time_ms?: number | null
  allow_rotate?: boolean
  allow_toggle?: boolean
  allow_swap?: boolean
  start_nodes?: string[]
  end_nodes?: string[]
  target_pattern?: string[]
  blocked_cells?: string[]
  hint_mode?: 'none' | 'light' | 'guided'
  auto_check?: boolean
  success_animation?: 'pulse' | 'restore' | 'flash'

  max_errors?: number
  preview_cell_ms?: number
  path_length?: number
  pattern_mode?: 'random_each_game' | 'fixed'
  path_cells?: string[]
}

export type BearingHuntConfig = {
  objective: BearingHuntObjective
  target_bearing_deg?: number
  target_sequence_deg?: number[]
  sector_start_deg?: number
  sector_end_deg?: number
  tolerance_deg: number
  hold_ms: number
  phases?: number
  timeout_ms?: number | null
  require_stable_orientation?: boolean
  stability_window_ms?: number
  feedback_mode?: 'visual' | 'haptic' | 'audio' | 'mixed'
  noise_level?: 0 | 1 | 2 | 3
  false_targets?: number[]
  show_numeric_bearing?: boolean
  show_compass_ring?: boolean
  allow_recenter?: boolean
  // "Rumbo doble" (game_id 'rumbo_doble'): 2-3 objetivos reales, uno tras
  // otro, cada uno con su propia etiqueta que escribe el organizador (p.ej.
  // "la torre de la iglesia") y su propio rumbo. Perder el lock de uno solo
  // resetea SU hold, no la secuencia entera (ver RuntimeScreen.tsx). Cuando
  // este campo trae 2+ objetivos, el runtime pasa a modo secuencia y
  // target_bearing_deg/tolerance_deg de arriba dejan de usarse para el
  // rumbo (tolerance_deg/hold_ms sí se reutilizan tal cual).
  targets?: Array<{ label: string; bearing_deg: number }>
}

export type SignalHuntConfig = {
  objective: SignalHuntObjective
  source_lat?: number
  source_lon?: number
  source_radius_m?: number
  lock_radius_m?: number
  lock_threshold: number
  hold_ms: number
  easy_checkpoint?: boolean
  max_signal?: number
  noise_floor?: number
  jitter?: number
  decay_curve?: 'linear' | 'smooth' | 'steep'
  timeout_ms?: number | null
  update_rate_ms?: number
  use_audio?: boolean
  use_vibration?: boolean
  use_direction_hint?: boolean
  false_peaks?: Array<{
    lat: number
    lon: number
    strength: number
  }>
  dead_zones?: Array<{
    lat: number
    lon: number
    radius_m: number
  }>
  /**
   * Solo lo usa team_relay (un game_id dentro de esta familia, no un campo
   * de signal_hunt de verdad). Cuántos compañeros -aparte de quien juega-
   * hacen falta en el punto para desbloquear. Antes estaba fijo en 2 dentro
   * de TeamRelayRuntimeScreen; con grupos de más de 3-4 jugadores, "solo
   * dos" no siempre tiene sentido -mejor que lo decida quien monta la
   * misión, nodo a nodo.
   */
  required_members?: number
  /**
   * "Cuenta las señales" (owner-approved, game_id 'cuenta_senales'): otro
   * game_id dentro de esta familia, igual que team_relay/mapa_mudo arriba.
   * El jugador SOLO recibe su pregunta asignada (una de las 2-5 que
   * escribió el organizador) con la respuesta ya hasheada -nunca la lista
   * completa ni la respuesta en claro-. Ver
   * project_cuenta_senales_for_player en minigames.py (servidor) y
   * CuentaSenalesRuntimeScreen.tsx (cliente, calcula el mismo hash con
   * Web Crypto para comprobar sin red).
   */
  question?: string
  hint_image_data_url?: string
  /**
   * Un hash por cada valor aceptable (respuesta ± tolerancia): comparar
   * por igualdad exacta contra un hash no admite rango, así que la
   * tolerancia se aplica hasheando cada entero válido, no restando sobre
   * el hash. Ver project_cuenta_senales_for_player en minigames.py.
   */
  answer_hashes?: string[]
  salt?: string
  max_attempts?: number
  penalty_ms?: number
}

export type AudioChallengeObjective = 'blow_charge'

export type AudioChallengeConfig = {
  objective: AudioChallengeObjective
  game_id?: string
}

/**
 * "Trampa de palabras" (owner-approved, game_id 'trampa_palabras', familia
 * NUEVA 'word_trap'). El jugador SOLO recibe las `n_rounds` rondas que le
 * tocan (barajadas de forma estable a partir de player_id+node_id), cada
 * una con sus 4 opciones y la respuesta correcta ya sustituida por su hash
 * salado -nunca `correct_index` en claro-. Ver project_word_trap_for_player
 * en minigames.py (servidor) y WordTrapRuntimeScreen.tsx (cliente, calcula
 * el mismo hash con Web Crypto para comprobar sin red).
 */
export type WordTrapRound = {
  question: string
  options: string[]
  salt: string
  answer_hash: string
  /**
   * Explicación CIFRADA con la opción correcta como clave: sólo se abre tras
   * contestar (ver wordTrap/explicacion.ts). Nunca viaja en claro.
   */
  explanation_enc?: string
  /** Sólo un servidor antiguo la manda en claro. */
  explanation?: string
}

/** Una pregunta del BANCO tal y como la edita el organizador (admin, en
 * claro): nunca viaja así hacia el jugador -ver WordTrapRound arriba-. */
export type WordTrapBankQuestion = {
  question: string
  options: string[]
  correct_index: number
  explanation?: string
}

export type WordTrapConfig = {
  objective: 'word_trap'
  game_id?: string
  completion_method?: 'quiz'
  /** Rondas ya proyectadas para ESTE jugador (payload real del móvil). */
  rounds?: WordTrapRound[]
  /**
   * Rondas de repuesto: cada fallo o pregunta sin contestar suma la siguiente,
   * hasta agotarlas. Así no se acaba en menos de un minuto fallando.
   */
  extra_rounds?: WordTrapRound[]
  /** Banco completo en claro: solo lo usa el editor de admin. */
  questions?: WordTrapBankQuestion[]
  n_rounds?: number
  time_limit_s?: number
  penalty_ms?: number
}

export type AnyMinigameConfig =
  | CircuitMatrixConfig
  | BearingHuntConfig
  | SignalHuntConfig
  | MotionChallengeConfig
  | AudioChallengeConfig
  | WordTrapConfig
