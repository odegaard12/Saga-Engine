export type MotionChallengeObjective =
  | 'shake_charge'
  | 'figure_eight'
  | 'rotary_safe'

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
}

export type CircuitMatrixObjective =
  | 'path_restore'
  | 'power_balance'
  | 'switch_logic'
  | 'signal_route'
  | 'sequence_order'
  | 'image_mosaic'
  | 'balance_maze'

export type BearingHuntObjective =
  | 'single_lock'
  | 'multi_lock'
  | 'sector_scan'
  | 'bearing_sequence'

export type SignalHuntObjective =
  | 'proximity_lock'
  | 'directional_lock'
  | 'hybrid_trace'
  | 'stability_capture'

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
}

export type AnyMinigameConfig =
  | CircuitMatrixConfig
  | BearingHuntConfig
  | SignalHuntConfig
  | MotionChallengeConfig
