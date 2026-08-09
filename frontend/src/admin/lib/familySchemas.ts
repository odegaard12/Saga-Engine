import type { FamilyId } from './familyConfigs'

export const FAMILY_SCHEMA_VERSION = 'v1'

export type FamilyConfigFieldKind = 'text' | 'number' | 'boolean' | 'select' | 'sequence'

export type FamilyConfigField = {
  key: string
  label: string
  kind: FamilyConfigFieldKind
  required?: boolean
  description?: string
  defaultValue?: string | number | boolean | string[]
  min?: number
  max?: number
  step?: number
  allowedValues?: string[]
}

export type FamilyPreset = {
  id: string
  label: string
  description: string
  config: Record<string, unknown>
}

export type FamilySchemaContract = {
  id: FamilyId
  label: string
  icon: string
  description: string
  defaultPreset: string
  defaultConfig: Record<string, unknown>
  fields: FamilyConfigField[]
  presets: FamilyPreset[]
}

export type FamilyConfigValidationResult = {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export const FAMILY_SCHEMA_CONTRACTS: Record<FamilyId, FamilySchemaContract> = {
  signal_hunt: {
    id: 'signal_hunt',
    label: 'Checkpoint',
    icon: '📍',
    description: 'Proximity and signal-search mechanics for GPS, hot/cold, audio and haptic hunts.',
    defaultPreset: 'proximity_lock',
    defaultConfig: {
      objective: 'proximity_lock',
      source_radius_m: 75,
      lock_threshold: 65,
      hold_ms: 1500,
    },
    fields: [
      {
        key: 'objective',
        label: 'Objective',
        kind: 'select',
        required: true,
        defaultValue: 'proximity_lock',
        allowedValues: ['proximity_lock', 'hot_cold_search', 'signal_lock'],
        description: 'Main signal mechanic used by the node.',
      },
      {
        key: 'source_radius_m',
        label: 'Source radius meters',
        kind: 'number',
        required: true,
        defaultValue: 75,
        min: 1,
        max: 2000,
        step: 1,
        description: 'Distance around the source where signal logic becomes meaningful.',
      },
      {
        key: 'lock_threshold',
        label: 'Lock threshold',
        kind: 'number',
        required: true,
        defaultValue: 65,
        min: 1,
        max: 100,
        step: 1,
        description: 'Signal strength needed to lock or complete the interaction.',
      },
      {
        key: 'hold_ms',
        label: 'Hold milliseconds',
        kind: 'number',
        required: true,
        defaultValue: 1500,
        min: 0,
        max: 30000,
        step: 100,
        description: 'How long the player must keep the signal locked.',
      },
      {
        key: 'hot_cold_enabled',
        label: 'Hot/cold feedback',
        kind: 'boolean',
        defaultValue: false,
        description: 'Enables coarse feedback as the player gets closer or farther away.',
      },
      {
        key: 'audio_cue',
        label: 'Audio cue',
        kind: 'text',
        description: 'Optional cue id for future audio/haptic feedback.',
      },
    ],
    presets: [
      {
        id: 'proximity_lock',
        label: 'Proximity lock',
        description: 'Default GPS proximity lock with a signal threshold and hold time.',
        config: {
          objective: 'proximity_lock',
          source_radius_m: 75,
          lock_threshold: 65,
          hold_ms: 1500,
        },
      },
      {
        id: 'hot_cold_search',
        label: 'Hot/cold search',
        description: 'Search mechanic with coarse hot/cold feedback near the target.',
        config: {
          objective: 'hot_cold_search',
          source_radius_m: 120,
          lock_threshold: 70,
          hold_ms: 1200,
          hot_cold_enabled: true,
        },
      },
      {
        id: 'signal_lock',
        label: 'Signal lock',
        description: 'Stronger signal-lock mechanic for tighter final-node interactions.',
        config: {
          objective: 'signal_lock',
          source_radius_m: 45,
          lock_threshold: 82,
          hold_ms: 2200,
        },
      },
    ],
  },

  bearing_hunt: {
    id: 'bearing_hunt',
    label: 'Bearing Hunt',
    icon: '🧭',
    description: 'Compass, heading and orientation mechanics for directional challenges.',
    defaultPreset: 'single_lock',
    defaultConfig: {
      objective: 'single_lock',
      target_bearing_deg: 270,
      tolerance_deg: 12,
      hold_ms: 1200,
    },
    fields: [
      {
        key: 'objective',
        label: 'Objective',
        kind: 'select',
        required: true,
        defaultValue: 'single_lock',
        allowedValues: ['single_lock', 'sector_scan', 'directional_sequence'],
        description: 'Main orientation mechanic used by the node.',
      },
      {
        key: 'target_bearing_deg',
        label: 'Target bearing degrees',
        kind: 'number',
        required: true,
        defaultValue: 270,
        min: 0,
        max: 359,
        step: 1,
        description: 'Heading the player must face.',
      },
      {
        key: 'tolerance_deg',
        label: 'Tolerance degrees',
        kind: 'number',
        required: true,
        defaultValue: 12,
        min: 1,
        max: 90,
        step: 1,
        description: 'Allowed compass error around the target heading.',
      },
      {
        key: 'hold_ms',
        label: 'Hold milliseconds',
        kind: 'number',
        required: true,
        defaultValue: 1200,
        min: 0,
        max: 30000,
        step: 100,
        description: 'How long the player must keep the heading stable.',
      },
      {
        key: 'sector_count',
        label: 'Sector count',
        kind: 'number',
        defaultValue: 8,
        min: 2,
        max: 36,
        step: 1,
        description: 'Optional number of sectors for scan-style gameplay.',
      },
      {
        key: 'require_motion',
        label: 'Require motion',
        kind: 'boolean',
        defaultValue: false,
        description: 'Future flag for challenges that require movement or device rotation.',
      },
    ],
    presets: [
      {
        id: 'single_lock',
        label: 'Single heading lock',
        description: 'Face one target bearing and hold it stable.',
        config: {
          objective: 'single_lock',
          target_bearing_deg: 270,
          tolerance_deg: 12,
          hold_ms: 1200,
        },
      },
      {
        id: 'sector_scan',
        label: 'Sector scan',
        description: 'Scan sectors and find the correct direction.',
        config: {
          objective: 'sector_scan',
          target_bearing_deg: 180,
          tolerance_deg: 18,
          hold_ms: 900,
          sector_count: 8,
        },
      },
      {
        id: 'directional_sequence',
        label: 'Directional sequence',
        description: 'Future-friendly preset for ordered heading challenges.',
        config: {
          objective: 'directional_sequence',
          target_bearing_deg: 90,
          tolerance_deg: 15,
          hold_ms: 1000,
          sector_count: 12,
        },
      },
    ],
  },

  motion_challenge: {
    id: 'motion_challenge',
    label: 'Motion Challenge',
    icon: '⚡',
    description: 'Movimiento del móvil, agitar, calibrar y retos físicos con fallback táctil.',
    defaultPreset: 'shake_antenna_charge',
    defaultConfig: {
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
    fields: [
      {
        key: 'objective',
        label: 'Objetivo',
        kind: 'select',
        required: true,
        defaultValue: 'shake_charge',
        allowedValues: ['shake_charge'],
        description: 'Mecánica principal del reto de movimiento.',
      },
      {
        key: 'difficulty',
        label: 'Dificultad',
        kind: 'select',
        required: true,
        defaultValue: 'normal',
        allowedValues: ['easy', 'normal', 'hard'],
        description: 'Ajuste general de dificultad.',
      },
      {
        key: 'time_limit_ms',
        label: 'Tiempo límite',
        kind: 'number',
        required: true,
        defaultValue: 35000,
        min: 12000,
        max: 120000,
        step: 1000,
        description: 'Tiempo máximo para cargar la antena.',
      },
      {
        key: 'stabilize_ms',
        label: 'Estabilizar ms',
        kind: 'number',
        required: true,
        defaultValue: 2000,
        min: 600,
        max: 8000,
        step: 100,
        description: 'Tiempo quieto necesario al final.',
      },
      {
        key: 'allow_touch_fallback',
        label: 'Fallback táctil',
        kind: 'boolean',
        defaultValue: true,
        description: 'Permite completar con taps si el sensor no está disponible.',
      },
    ],
    presets: [
      {
        id: 'shake_antenna_charge',
        label: 'Cargar antena',
        description: 'Agitar con ritmo para cargar energía sin sobrecargar.',
        config: {
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
      },
    ],
  },

  circuit_matrix: {
    id: 'circuit_matrix',
    label: 'Circuit Matrix',
    icon: '⚡',
    description: 'Logic, sequence, grid and energy-routing puzzle mechanics.',
    defaultPreset: 'sequence',
    defaultConfig: {
      objective: 'sequence',
      sequence: ['alpha', 'beta', 'gamma'],
      difficulty: 'normal',
      grid_cols: 4,
    },
    fields: [
      {
        key: 'objective',
        label: 'Objective',
        kind: 'select',
        required: true,
        defaultValue: 'sequence',
        allowedValues: ['sequence', 'grid_restore', 'energy_balance'],
        description: 'Main puzzle mechanic used by the node.',
      },
      {
        key: 'sequence',
        label: 'Sequence',
        kind: 'sequence',
        required: true,
        defaultValue: ['alpha', 'beta', 'gamma'],
        description: 'Ordered tokens or switches used by sequence-style puzzles.',
      },
      {
        key: 'difficulty',
        label: 'Difficulty',
        kind: 'select',
        required: true,
        defaultValue: 'normal',
        allowedValues: ['easy', 'normal', 'hard'],
        description: 'Difficulty hint for runtime balancing and UI copy.',
      },
      {
        key: 'grid_cols',
        label: 'Grid columns',
        kind: 'number',
        required: true,
        defaultValue: 3,
        min: 2,
        max: 8,
        step: 1,
        description: 'Grid width for matrix-style puzzles.',
      },
      {
        key: 'energy_budget',
        label: 'Energy budget',
        kind: 'number',
        defaultValue: 100,
        min: 1,
        max: 999,
        step: 1,
        description: 'Optional resource budget for energy balancing variants.',
      },
      {
        key: 'allow_retry',
        label: 'Allow retry',
        kind: 'boolean',
        defaultValue: true,
        description: 'Allows future runtimes to reset a failed puzzle attempt.',
      },
    ],
    presets: [
      {
        id: 'sequence',
        label: 'Sequence puzzle',
        description: 'Simple ordered-token puzzle.',
        config: {
          objective: 'sequence',
          sequence: ['alpha', 'beta', 'gamma'],
          difficulty: 'normal',
          grid_cols: 4,
        },
      },
      {
        id: 'grid_restore',
        label: 'Grid restore',
        description: 'Grid-based path or circuit repair puzzle.',
        config: {
          objective: 'grid_restore',
          sequence: ['north', 'east', 'south'],
          difficulty: 'normal',
          grid_cols: 4,
          allow_retry: true,
        },
      },
      {
        id: 'energy_balance',
        label: 'Energy balance',
        description: 'Resource-balancing variant for future physical or digital puzzle nodes.',
        config: {
          objective: 'energy_balance',
          sequence: ['source', 'relay', 'load'],
          difficulty: 'hard',
          grid_cols: 4,
          energy_budget: 100,
          allow_retry: true,
        },
      },
    ],
  },

  audio_challenge: {
    id: 'audio_challenge',
    label: 'Audio Challenge',
    icon: '🎤',
    description: 'Blow or make noise into the microphone to charge the energy bar.',
    defaultPreset: 'audio_challenge',
    defaultConfig: {
      objective: 'blow_charge',
      game_id: 'audio_challenge',
    },
    fields: [
      {
        key: 'objective',
        label: 'Objective',
        kind: 'select',
        required: true,
        defaultValue: 'blow_charge',
        allowedValues: ['blow_charge'],
        description: 'Main mechanic used by the node.',
      },
    ],
    presets: [
      {
        id: 'audio_challenge',
        label: 'Audio Challenge',
        description: 'Blow or make noise into the microphone to charge the energy bar.',
        config: {
          objective: 'blow_charge',
          game_id: 'audio_challenge',
        },
      },
    ],
  },
}

export const FAMILY_SCHEMA_ORDER: FamilyId[] = [
  'signal_hunt',
  'bearing_hunt',
  'motion_challenge',
  'circuit_matrix',
  'audio_challenge',
]

export function isFamilySchemaId(value: string): value is FamilyId {
  return Object.prototype.hasOwnProperty.call(FAMILY_SCHEMA_CONTRACTS, value)
}

export function getFamilySchema(familyId: string): FamilySchemaContract {
  return isFamilySchemaId(familyId)
    ? FAMILY_SCHEMA_CONTRACTS[familyId]
    : FAMILY_SCHEMA_CONTRACTS.signal_hunt
}

export function getFamilyPreset(familyId: string, presetId: string) {
  const schema = getFamilySchema(familyId)
  return schema.presets.find((preset) => preset.id === presetId)
}

export function getFamilyPresetDefaults(
  familyId: string,
  presetId?: string
): Record<string, unknown> {
  const schema = getFamilySchema(familyId)
  const preset = presetId
    ? getFamilyPreset(schema.id, presetId)
    : getFamilyPreset(schema.id, schema.defaultPreset)

  return {
    ...schema.defaultConfig,
    ...(preset?.config || {}),
  }
}

export function validateFamilyConfig(
  familyId: string,
  config: Record<string, unknown> = {}
): FamilyConfigValidationResult {
  if (!isFamilySchemaId(familyId)) {
    return {
      valid: false,
      errors: [`Unsupported family "${familyId}".`],
      warnings: [],
    }
  }

  const schema = FAMILY_SCHEMA_CONTRACTS[familyId]
  const errors: string[] = []
  const warnings: string[] = []

  for (const field of schema.fields) {
    const value = config[field.key]

    if (field.required && !hasConfigValue(value)) {
      errors.push(`${schema.label}: missing required field "${field.key}".`)
      continue
    }

    if (!hasConfigValue(value)) continue

    if (field.kind === 'number') {
      validateNumberField(schema, field, value, errors)
    }

    if (field.kind === 'select') {
      validateSelectField(schema, field, value, errors)
    }

    if (field.kind === 'sequence') {
      validateSequenceField(schema, field, value, errors)
    }

    if (field.kind === 'boolean' && typeof value !== 'boolean') {
      warnings.push(`${schema.label}: field "${field.key}" should be boolean.`)
    }
  }

  for (const key of Object.keys(config)) {
    if (!schema.fields.some((field) => field.key === key)) {
      warnings.push(`${schema.label}: unknown config field "${key}".`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

function hasConfigValue(value: unknown) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

function readNumericValue(value: unknown) {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim()) return Number(value)
  return Number.NaN
}

function validateNumberField(
  schema: FamilySchemaContract,
  field: FamilyConfigField,
  value: unknown,
  errors: string[]
) {
  const numericValue = readNumericValue(value)

  if (!Number.isFinite(numericValue)) {
    errors.push(`${schema.label}: field "${field.key}" must be numeric.`)
    return
  }

  if (typeof field.min === 'number' && numericValue < field.min) {
    errors.push(`${schema.label}: field "${field.key}" must be >= ${field.min}.`)
  }

  if (typeof field.max === 'number' && numericValue > field.max) {
    errors.push(`${schema.label}: field "${field.key}" must be <= ${field.max}.`)
  }
}

function validateSelectField(
  schema: FamilySchemaContract,
  field: FamilyConfigField,
  value: unknown,
  errors: string[]
) {
  if (typeof value !== 'string') {
    errors.push(`${schema.label}: field "${field.key}" must be text.`)
    return
  }

  if (field.allowedValues && !field.allowedValues.includes(value)) {
    errors.push(
      `${schema.label}: field "${field.key}" must be one of ${field.allowedValues.join(', ')}.`
    )
  }
}

function validateSequenceField(
  schema: FamilySchemaContract,
  field: FamilyConfigField,
  value: unknown,
  errors: string[]
) {
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return
  }

  errors.push(`${schema.label}: field "${field.key}" must be a sequence.`)
}
