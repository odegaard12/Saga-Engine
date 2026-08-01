import type { AdminRawStage, AdminReactOverviewStage } from './adminApi'
import { withPhysicalStageFields } from './physicalStageFields'
import {
  buildAdminMinigameBlock,
  getAdminFamilyLabel,
  normalizeAdminConfigForFamily,
  type EditableAdminStage,
} from './familyConfigs'

export function stageSaveIdentity(stage: AdminReactOverviewStage) {
  if (typeof stage.id === 'number') return String(stage.id)
  if (typeof stage.id === 'string' && stage.id.trim()) return stage.id.trim()

  const localId = (stage as unknown as { localId?: unknown }).localId
  if (typeof localId === 'string' && localId.trim()) return localId.trim()

  return String(stage.index)
}

export function rawStageIdentity(stage: AdminRawStage, fallbackIndex: number) {
  const rawId = stage.id
  if (typeof rawId === 'number' || typeof rawId === 'string') return String(rawId)
  return String(fallbackIndex)
}

function shouldClearPhysicalStageFields(stage: AdminReactOverviewStage) {
  const record = stage as unknown as Record<string, unknown>
  return (
    record._clear_physical_fields === true ||
    record._physical_node_mode === 'normal' ||
    record.physical_node_kind === null ||
    record.physical_item_kind === null
  )
}

function stripPhysicalStageFields<T extends Record<string, unknown>>(stage: T): T {
  const next = { ...stage }
  for (const key of [
    'physical_node_kind',
    'physical_item_kind',
    'physical_item_id',
    'physical_item_label',
    'physical_qr',
    'qr_payload',
  ]) {
    delete next[key]
  }
  delete next._clear_physical_fields
  delete next._physical_node_mode
  return next
}

export function mergeStageForSave(
  rawStage: AdminRawStage | null,
  stage: AdminReactOverviewStage
): AdminRawStage {
  const messages = stage.messages || {}
  const rawConfig =
    typeof rawStage?.config === 'object' && rawStage?.config !== null
      ? (rawStage.config as Record<string, unknown>)
      : {}
  const localConfig =
    typeof (stage as EditableAdminStage).config === 'object' &&
    (stage as EditableAdminStage).config !== null
      ? ((stage as EditableAdminStage).config as Record<string, unknown>)
      : {}

  const rawMinigame =
    typeof rawStage?.minigame === 'object' && rawStage?.minigame !== null
      ? (rawStage.minigame as Record<string, unknown>)
      : {}

  const rawType =
    typeof rawStage?.type === 'string'
      ? rawStage.type
      : typeof rawMinigame.type === 'string'
        ? rawMinigame.type
        : ''

  const saveType = stage.type || 'motion_challenge'
  const safeRawConfig = rawType === saveType ? rawConfig : {}
  const saveConfig = normalizeAdminConfigForFamily(saveType, {
    ...safeRawConfig,
    ...localConfig,
  })

  const rawBase = shouldClearPhysicalStageFields(stage)
    ? (stripPhysicalStageFields(
        (rawStage || {}) as unknown as Record<string, unknown>
      ) as AdminRawStage)
    : rawStage || {}

  const physicalFields = shouldClearPhysicalStageFields(stage)
    ? {}
    : withPhysicalStageFields(stage, {})

  return {
    ...rawBase,
    ...physicalFields,
    id: typeof stage.id === 'number' ? stage.id : (rawStage?.id ?? stage.index),
    title: stage.title || 'Untitled node',
    type: saveType,
    label: getAdminFamilyLabel(saveType),
    lat: stage.lat ?? null,
    lon: stage.lon ?? null,
    radius: stage.radius ?? 50,
    content: stage.content || '',
    intro_title: stage.intro_title || '',
    intro_body: stage.intro_body || '',
    entry_mode: stage.entry_mode || 'gps',
    require_proximity: Boolean(stage.require_proximity),
    hint: messages.hint || '',
    gps_unavailable_message: messages.gps_unavailable || '',
    locked_message: messages.locked || '',
    config: saveConfig,
    minigame: buildAdminMinigameBlock(saveType, saveConfig),
    answer: rawStage?.answer ?? '',
    rune: rawStage?.rune ?? '',
  }
}

export function buildRawStageFromOverview(
  stage: AdminReactOverviewStage,
  index: number
): AdminRawStage {
  const messages = stage.messages || {}

  const saveType = stage.type || 'motion_challenge'
  const saveConfig = normalizeAdminConfigForFamily(
    saveType,
    typeof (stage as EditableAdminStage).config === 'object' &&
      (stage as EditableAdminStage).config !== null
      ? ((stage as EditableAdminStage).config as Record<string, unknown>)
      : {}
  )

  const physicalFields = shouldClearPhysicalStageFields(stage)
    ? {}
    : withPhysicalStageFields(stage, {})

  return {
    ...physicalFields,
    id: typeof stage.id === 'number' ? stage.id : index,
    title: stage.title || `NODE ${index + 1}`,
    type: saveType,
    label: getAdminFamilyLabel(saveType),
    lat: typeof stage.lat === 'number' ? stage.lat : null,
    lon: typeof stage.lon === 'number' ? stage.lon : null,
    radius: typeof stage.radius === 'number' ? stage.radius : 50,
    content: stage.content || '',
    intro_title: stage.intro_title || '',
    intro_body: stage.intro_body || '',
    entry_mode: stage.entry_mode || 'gps',
    require_proximity: Boolean(stage.require_proximity),
    hint: messages.hint || '',
    gps_unavailable_message: messages.gps_unavailable || '',
    locked_message: messages.locked || '',
    config: saveConfig,
    minigame: buildAdminMinigameBlock(saveType, saveConfig),
    answer: '',
    rune: '',
  }
}

export function buildRawStagesFromOverview(overviewStages: AdminReactOverviewStage[]) {
  return overviewStages.map((stage, index) =>
    withPhysicalStageFields(stage, buildRawStageFromOverview(stage, index))
  )
}

export function mergeOverviewIntoRawStages(
  rawStages: AdminRawStage[],
  overviewStages: AdminReactOverviewStage[]
) {
  return overviewStages.map((stage, index) => {
    const wantedIdentity = stageSaveIdentity(stage)
    const rawStage =
      rawStages.find(
        (candidate, candidateIndex) =>
          rawStageIdentity(candidate, candidateIndex) === wantedIdentity
      ) || null

    return mergeStageForSave(rawStage, {
      ...stage,
      index,
      id: typeof stage.id === 'string' && stage.id.startsWith('local-') ? index : stage.id,
    })
  })
}

function persistenceRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function persistenceStageType(stage: AdminRawStage) {
  const minigame = persistenceRecord(stage.minigame)

  return String(minigame.type || stage.type || '')
}

function persistenceStageConfig(stage: AdminRawStage) {
  const minigame = persistenceRecord(stage.minigame)

  const minigameConfig = persistenceRecord(minigame.config)

  if (Object.keys(minigameConfig).length > 0) {
    return minigameConfig
  }

  return persistenceRecord(stage.config)
}

function stablePersistenceValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stablePersistenceValue)
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>

    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, stablePersistenceValue(record[key])])
    )
  }

  return value ?? null
}

function persistenceJson(value: unknown) {
  return JSON.stringify(stablePersistenceValue(value))
}

export function verifyPersistedStages(
  expectedStages: AdminRawStage[],
  actualStages: AdminRawStage[]
) {
  const errors: string[] = []

  if (expectedStages.length !== actualStages.length) {
    errors.push(
      `número de nodos esperado ` + `${expectedStages.length}, ` + `guardado ${actualStages.length}`
    )
  }

  expectedStages.forEach((expected, index) => {
    const actual = actualStages[index]

    if (!actual) {
      errors.push(`falta el nodo ${index + 1}`)
      return
    }

    const expectedType = persistenceStageType(expected)

    const actualType = persistenceStageType(actual)

    const expectedId = String(expected.id ?? index)

    const actualId = String(actual.id ?? index)

    if (expectedId !== actualId) {
      errors.push(`orden/ID del nodo ${index + 1}: ` + `${expectedId} != ${actualId}`)
    }

    if (String(expected.title || '') !== String(actual.title || '')) {
      errors.push(`título del nodo ${index + 1}`)
    }

    if (expectedType !== actualType) {
      errors.push(`tipo del nodo ${index + 1}: ` + `${expectedType} != ${actualType}`)
    }

    for (const field of ['lat', 'lon', 'radius', 'entry_mode', 'require_proximity']) {
      if (persistenceJson(expected[field]) !== persistenceJson(actual[field])) {
        errors.push(`${field} del nodo ${index + 1}`)
      }
    }

    const expectedConfig = normalizeAdminConfigForFamily(
      expectedType,
      persistenceStageConfig(expected)
    )

    const actualConfig = normalizeAdminConfigForFamily(actualType, persistenceStageConfig(actual))

    if (persistenceJson(expectedConfig) !== persistenceJson(actualConfig)) {
      errors.push(`configuración del nodo ${index + 1}`)
    }
  })

  return errors
}
