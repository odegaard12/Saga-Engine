import type { SignalHuntConfig } from '../../core/family-types'
import type { SignalHuntDefinition } from '../../core/registry-types'
import type { MinigamePreflightResult, MinigameRuntimeBindings } from '../../core/types'

export const signalHuntDefinition: SignalHuntDefinition = {
  family: 'signal_hunt',
  version: 'v1',
  label: 'Signal Hunt',
  tagline: 'Track the hidden source',
  description:
    'Search minigame driven by proximity, signal strength curves, optional audio/haptics and geographic lock.',

  validation_mode: 'hybrid',
  fallback_policy: 'degraded_mode',

  capabilities: [
    { key: 'touch', requirement: 'required', reason: 'Core interaction and confirmation.' },
    { key: 'geolocation', requirement: 'required', reason: 'Core proximity mechanic.' },
    { key: 'fullscreen', requirement: 'preferred', reason: 'Cleaner field interaction.' },
    { key: 'vibration', requirement: 'preferred', reason: 'Signal intensity feedback.' },
    { key: 'audio', requirement: 'optional', reason: 'Optional signal layer.' },
    { key: 'wake_lock', requirement: 'optional', reason: 'Useful in field sessions.' },
  ],

  ui: {
    fullscreen: true,
    briefing_required: true,
    supports_pause: true,
    supports_retry: true,
    supports_manual_fallback: false,
  },

  default_config: {
    objective: 'proximity_lock',
    source_radius_m: 20,
    lock_threshold: 85,
    hold_ms: 1500,
    max_signal: 100,
    noise_floor: 4,
    jitter: 1,
    decay_curve: 'smooth',
    timeout_ms: null,
    update_rate_ms: 500,
    use_audio: false,
    use_vibration: true,
    use_direction_hint: false,
    false_peaks: [],
    dead_zones: [],
  },
}

function validateSignalHuntConfig(
  config: unknown
): { ok: true; value: SignalHuntConfig } | { ok: false; errors: string[] } {
  const raw = (config && typeof config === 'object' ? config : {}) as Partial<SignalHuntConfig>
  const value: SignalHuntConfig = {
    ...signalHuntDefinition.default_config,
    ...raw,
  }

  const errors: string[] = []

  if (
    value.source_radius_m !== undefined &&
    (!Number.isFinite(value.source_radius_m) || value.source_radius_m <= 0)
  ) {
    errors.push('source_radius_m must be > 0')
  }

  if (
    !Number.isFinite(value.lock_threshold) ||
    value.lock_threshold < 1 ||
    value.lock_threshold > 100
  ) {
    errors.push('lock_threshold must be between 1 and 100')
  }

  if (!Number.isInteger(value.hold_ms) || value.hold_ms < 100) {
    errors.push('hold_ms must be an integer >= 100')
  }

  if (value.update_rate_ms !== undefined) {
    if (!Number.isInteger(value.update_rate_ms) || value.update_rate_ms < 100) {
      errors.push('update_rate_ms must be an integer >= 100')
    }
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

async function runSignalHuntPreflight(
  bindings: MinigameRuntimeBindings<SignalHuntConfig>
): Promise<MinigamePreflightResult> {
  const missing_required: string[] = []
  const missing_preferred: string[] = []
  const messages: string[] = []

  const hasGeo = typeof navigator !== 'undefined' && 'geolocation' in navigator
  const hasVibration = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'

  if (!hasGeo) {
    missing_required.push('geolocation')
    messages.push('Geolocation is unavailable on this device/browser.')
  }

  if (!hasVibration) {
    missing_preferred.push('vibration')
    messages.push('Vibration is unavailable. Signal Hunt will run without haptics.')
  }

  return {
    can_start: missing_required.length === 0,
    mode:
      missing_required.length > 0
        ? 'blocked'
        : missing_preferred.length > 0
          ? 'degraded'
          : 'normal',
    missing_required: missing_required as never[],
    missing_preferred: missing_preferred as never[],
    messages: messages.length > 0 ? messages : ['Signal hunt ready.'],
  }
}
