import type { BearingHuntConfig } from '../../core/family-types'
import type { BearingHuntDefinition } from '../../core/registry-types'
import type { MinigamePreflightResult, MinigameRuntimeBindings } from '../../core/types'

export const bearingHuntDefinition: BearingHuntDefinition = {
  family: 'bearing_hunt',
  version: 'v1',
  label: 'Bearing Hunt',
  tagline: 'Find the correct heading',
  description:
    'Compass-style orientation minigame built around heading lock, stable hold and directional reasoning.',

  validation_mode: 'client',
  fallback_policy: 'degraded_mode',

  capabilities: [
    { key: 'touch', requirement: 'required', reason: 'UI interaction and confirmation.' },
    { key: 'device_orientation', requirement: 'required', reason: 'Core heading mechanic.' },
    { key: 'fullscreen', requirement: 'preferred', reason: 'Cleaner field interaction.' },
    { key: 'vibration', requirement: 'optional', reason: 'Heading lock feedback.' },
    { key: 'audio', requirement: 'optional', reason: 'Signal feedback.' },
  ],

  ui: {
    fullscreen: true,
    briefing_required: true,
    supports_pause: true,
    supports_retry: true,
    supports_manual_fallback: false,
  },

  default_config: {
    objective: 'single_lock',
    target_bearing_deg: 90,
    target_sequence_deg: [],
    tolerance_deg: 12,
    hold_ms: 1200,
    phases: 1,
    timeout_ms: null,
    require_stable_orientation: true,
    stability_window_ms: 800,
    feedback_mode: 'mixed',
    noise_level: 1,
    false_targets: [],
    show_numeric_bearing: false,
    show_compass_ring: true,
    allow_recenter: true,
  },
}

function validateBearingHuntConfig(
  config: unknown
): { ok: true; value: BearingHuntConfig } | { ok: false; errors: string[] } {
  const raw = (config && typeof config === 'object' ? config : {}) as Partial<BearingHuntConfig>
  const value: BearingHuntConfig = {
    ...bearingHuntDefinition.default_config,
    ...raw,
  }

  const errors: string[] = []

  if (
    value.target_bearing_deg !== undefined &&
    (typeof value.target_bearing_deg !== 'number' ||
      value.target_bearing_deg < 0 ||
      value.target_bearing_deg >= 360)
  ) {
    errors.push('target_bearing_deg must be a number between 0 and 359.999')
  }

  if (
    !Number.isFinite(value.tolerance_deg) ||
    value.tolerance_deg <= 0 ||
    value.tolerance_deg > 90
  ) {
    errors.push('tolerance_deg must be > 0 and <= 90')
  }

  if (!Number.isInteger(value.hold_ms) || value.hold_ms < 100) {
    errors.push('hold_ms must be an integer >= 100')
  }

  if (
    value.phases !== undefined &&
    (!Number.isInteger(value.phases) || value.phases < 1 || value.phases > 10)
  ) {
    errors.push('phases must be an integer between 1 and 10')
  }

  if (value.timeout_ms !== null && value.timeout_ms !== undefined) {
    if (!Number.isInteger(value.timeout_ms) || value.timeout_ms < 1000) {
      errors.push('timeout_ms must be null or an integer >= 1000')
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  return { ok: true, value }
}

async function runBearingHuntPreflight(
  bindings: MinigameRuntimeBindings<BearingHuntConfig>
): Promise<MinigamePreflightResult> {
  const missing_required: string[] = []
  const missing_preferred: string[] = []
  const messages: string[] = []

  const hasOrientationApi =
    typeof window !== 'undefined' &&
    ('DeviceOrientationEvent' in window || 'ondeviceorientation' in window)

  if (!hasOrientationApi) {
    missing_required.push('device_orientation')
    messages.push('Device orientation is unavailable on this device/browser.')
  }

  return {
    can_start: missing_required.length === 0,
    mode: missing_required.length === 0 ? 'normal' : 'blocked',
    missing_required: missing_required as never[],
    missing_preferred: missing_preferred as never[],
    messages: messages.length > 0 ? messages : ['Bearing hunt ready.'],
  }
}
