import type { MotionChallengeConfig } from '../../core/family-types'
import type { MotionChallengeDefinition } from '../../core/registry-types'
import type { MinigamePreflightResult, MinigameRuntimeBindings } from '../../core/types'

export const motionChallengeDefinition: MotionChallengeDefinition = {
  family: 'motion_challenge',
  version: 'v1',
  label: 'Motion Challenge',
  tagline: 'Physical mobile skill challenge',
  description: 'Sensor-based minigames using device motion, haptics and tactile fallback.',

  validation_mode: 'client',
  fallback_policy: 'degraded_mode',

  capabilities: [
    { key: 'touch', requirement: 'required', reason: 'UI interaction and fallback play.' },
    { key: 'device_motion', requirement: 'preferred', reason: 'Core movement mechanic.' },
    { key: 'vibration', requirement: 'optional', reason: 'Charge and overload feedback.' },
    { key: 'fullscreen', requirement: 'preferred', reason: 'Cleaner physical interaction.' },
  ],

  ui: {
    fullscreen: true,
    briefing_required: true,
    supports_pause: true,
    supports_retry: true,
    supports_manual_fallback: true,
  },

  default_config: {
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
  },
}

function asNumber(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function validateMotionChallengeConfig(
  config: unknown
): { ok: true; value: MotionChallengeConfig } | { ok: false; errors: string[] } {
  const raw = (config && typeof config === 'object' ? config : {}) as Partial<MotionChallengeConfig>
  const merged: MotionChallengeConfig = {
    ...motionChallengeDefinition.default_config,
    ...raw,
  }

  const value: MotionChallengeConfig = {
    ...merged,
    objective:
      merged.objective === 'figure_eight' || merged.objective === 'rotary_safe'
        ? merged.objective
        : 'shake_charge',
    difficulty:
      merged.difficulty === 'easy' || merged.difficulty === 'hard' ? merged.difficulty : 'normal',
    duration_mode:
      merged.duration_mode === 'short' || merged.duration_mode === 'long'
        ? merged.duration_mode
        : 'normal',
    penalty_mode:
      merged.penalty_mode === 'soft' || merged.penalty_mode === 'hard'
        ? merged.penalty_mode
        : 'normal',
    allow_touch_fallback: merged.allow_touch_fallback !== false,
    energy_target: clamp(asNumber(merged.energy_target, 100), 40, 300),
    time_limit_ms: clamp(asNumber(merged.time_limit_ms, 35000), 12000, 120000),
    stabilize_ms: clamp(asNumber(merged.stabilize_ms, 2000), 600, 8000),
    calibration_ms: clamp(asNumber(merged.calibration_ms, 1000), 400, 3000),
    good_min: clamp(asNumber(merged.good_min, 1.2), 0.2, 8),
    good_max: clamp(asNumber(merged.good_max, 3.8), 0.5, 12),
    overcharge_threshold: clamp(asNumber(merged.overcharge_threshold, 5.4), 1, 18),
    idle_decay: clamp(asNumber(merged.idle_decay, 0.15), 0, 5),
    charge_rate: clamp(asNumber(merged.charge_rate, 2.4), 0.2, 12),
    stability_min: clamp(asNumber(merged.stability_min, 35), 0, 100),
    use_vibration: merged.use_vibration !== false,
  }

  const errors: string[] = []
  if ((value.good_min ?? 0) >= (value.good_max ?? 0)) {
    errors.push('good_min must be lower than good_max')
  }

  if ((value.good_max ?? 0) >= (value.overcharge_threshold ?? 0)) {
    errors.push('good_max must be lower than overcharge_threshold')
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value }
}

async function runMotionChallengePreflight(
  bindings: MinigameRuntimeBindings<MotionChallengeConfig>
): Promise<MinigamePreflightResult> {
  const missing_required: string[] = []
  const missing_preferred: string[] = []
  const messages: string[] = []

  const hasMotionApi =
    typeof window !== 'undefined' && ('DeviceMotionEvent' in window || 'ondevicemotion' in window)

  const allowFallback = bindings.config.allow_touch_fallback !== false

  if (!hasMotionApi) {
    if (allowFallback) {
      missing_preferred.push('device_motion')
      messages.push('Sensor de movimiento no disponible. Se usará modo táctil.')
    } else {
      missing_required.push('device_motion')
      messages.push('Sensor de movimiento no disponible.')
    }
  }

  return {
    can_start: missing_required.length === 0,
    mode: missing_required.length === 0 ? (hasMotionApi ? 'normal' : 'fallback') : 'blocked',
    missing_required: missing_required as never[],
    missing_preferred: missing_preferred as never[],
    messages: messages.length > 0 ? messages : ['Reto de movimiento listo.'],
  }
}
