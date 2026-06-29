import type { MinigameDefinitionBase } from '../../core/types'
import type { AudioChallengeConfig } from '../../core/family-types'

export const audioChallengeDefinition: MinigameDefinitionBase<
  'audio_challenge',
  AudioChallengeConfig
> = {
  family: 'audio_challenge',
  version: 'v1',
  label: 'Audio Challenge',
  tagline: 'Mic volume based mini-game.',
  description: 'Blow or make noise into the microphone.',
  validation_mode: 'client',
  fallback_policy: 'none',
  capabilities: [
    { key: 'audio', requirement: 'required' },
  ],
  ui: {
    fullscreen: true,
    briefing_required: false,
    supports_pause: false,
    supports_retry: true,
    supports_manual_fallback: false,
  },
  default_config: {
    objective: 'blow_charge',
  },
}
