import type { AdminRawStage, AdminReactOverviewProfile, AdminReactOverviewStage } from './adminApi'
import { withPhysicalStageFields } from './physicalStageFields'
import {
  buildAdminMinigameBlock,
  getAdminFamilyLabel,
  normalizeAdminConfigForFamily,
  type EditableAdminStage,
} from './familyConfigs'
import {
  applyEditorFieldsToRaw,
  hydrateStageFromRaw,
  readRawItemRequirement,
  readRawManualCode,
} from './stageFields'

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

  const resultado: Record<string, unknown> = {
    ...rawBase,
    ...physicalFields,
    id: typeof stage.id === 'number' ? stage.id : (rawStage?.id ?? stage.index),
    route_via: Array.isArray(stage.route_via)
      ? stage.route_via
      : ((rawStage?.route_via as Array<[number, number]> | undefined) ?? []),
    route_track: Array.isArray(stage.route_track)
      ? stage.route_track
      : ((rawStage?.route_track as Array<[number, number]> | undefined) ?? []),
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
    answer: rawStage?.answer ?? '',
    rune: rawStage?.rune ?? '',
  }

  // Requisito de mochila y código de emergencia: el editor los cambia en el
  // nodo y antes se perdían aquí (ver stageFields.ts). Se aplican ANTES de
  // construir `minigame`, que lleva una copia de la config.
  applyEditorFieldsToRaw(resultado, rawStage, stage, localConfig)

  resultado.minigame = buildAdminMinigameBlock(
    saveType,
    (resultado.config as Record<string, unknown>) || saveConfig
  )

  return resultado as AdminRawStage
}

/**
 * Completa los nodos del resumen con lo que el resumen no trae (requisito de
 * mochila y código de emergencia), leyéndolo de los nodos guardados. Sin esto,
 * el editor enseñaba «sin requisito» y un código inventado (`SAGA-NN`) en nodos
 * que sí tenían los suyos.
 */
export function hydrateStagesFromRaw<T extends AdminReactOverviewStage>(
  overviewStages: T[],
  rawStages: AdminRawStage[]
): T[] {
  const reclamados = new Set<number>()

  return overviewStages.map((stage, index) => {
    const identidad = stageSaveIdentity(stage)
    let posicion = rawStages.findIndex(
      (candidato, indiceCandidato) =>
        !reclamados.has(indiceCandidato) && rawStageIdentity(candidato, indiceCandidato) === identidad
    )
    if (posicion < 0 && typeof stage.id !== 'number' && typeof stage.id !== 'string') {
      posicion = index < rawStages.length && !reclamados.has(index) ? index : -1
    }
    if (posicion < 0) return stage
    reclamados.add(posicion)

    return hydrateStageFromRaw(stage as unknown as Record<string, unknown>, rawStages[posicion]) as unknown as T
  })
}

/**
 * Tras un guardado que salió bien, los nodos nuevos (`local-...`) pasan a llevar
 * el id numérico con el que se guardaron. Sin esto, si algo fallaba DESPUÉS del
 * guardado (la relectura, la verificación), el panel seguía con el id local y el
 * segundo «Guardar» le asignaba otro id nuevo: el nodo salía DUPLICADO.
 *
 * `guardados` sale de `mergeOverviewIntoRawStages(raw, overview)`, en el mismo
 * orden que `overviewStages`.
 */
export function localIdMap(
  overviewStages: AdminReactOverviewStage[],
  guardados: AdminRawStage[]
): Map<string, string | number> {
  const mapa = new Map<string, string | number>()
  overviewStages.forEach((stage, index) => {
    const guardado = guardados[index]
    if (typeof stage.id !== 'string' || !stage.id.startsWith('local-') || !guardado) return
    const idGuardado = guardado.id
    if (typeof idGuardado === 'number' || typeof idGuardado === 'string') {
      mapa.set(stage.id, idGuardado)
    }
  })
  return mapa
}

/** Cambia los ids `local-...` por los guardados, buscándolos por id (no por posición). */
export function applyLocalIdMap<T extends AdminReactOverviewStage>(
  stages: T[],
  mapa: Map<string, string | number>
): T[] {
  if (mapa.size === 0) return stages
  return stages.map((stage) => {
    const nuevo = typeof stage.id === 'string' ? mapa.get(stage.id) : undefined
    return nuevo === undefined ? stage : { ...stage, id: nuevo as T['id'] }
  })
}

export function remapLocalIds<T extends AdminReactOverviewStage>(
  overviewStages: T[],
  guardados: AdminRawStage[]
): T[] {
  return applyLocalIdMap(overviewStages, localIdMap(overviewStages, guardados))
}

/** ¿Cambian los ids o su orden entre lo guardado y lo que se va a guardar? */
export function stageIdSequenceChanged(antes: AdminRawStage[], despues: AdminRawStage[]): boolean {
  if (antes.length !== despues.length) return true
  return antes.some(
    (nodo, indice) => rawStageIdentity(nodo, indice) !== rawStageIdentity(despues[indice], indice)
  )
}

export function mergeOverviewIntoRawStages(
  rawStages: AdminRawStage[],
  overviewStages: AdminReactOverviewStage[]
) {
  // Los nodos nuevos (id local-*) reciben un id numérico único, nunca su índice:
  // usar el índice provocaba ids duplicados con nodos existentes y al guardar
  // se mezclaban configuraciones de nodos distintos.
  const usedIds = new Set<number>()
  for (const raw of rawStages) {
    const value = Number(raw.id)
    if (Number.isFinite(value)) usedIds.add(value)
  }
  for (const stage of overviewStages) {
    const value = Number(stage.id)
    if (Number.isFinite(value)) usedIds.add(value)
  }

  let nextFreshId = usedIds.size > 0 ? Math.max(...usedIds) + 1 : 0

  const claimedIdentities = new Set<number>()

  return overviewStages.map((stage, index) => {
    const isLocalNew = typeof stage.id === 'string' && stage.id.startsWith('local-')
    const resolvedId = isLocalNew ? nextFreshId++ : stage.id

    const wantedIdentity = stageSaveIdentity(stage)
    const rawStage = isLocalNew
      ? null
      : rawStages.find((candidate, candidateIndex) => {
          if (rawStageIdentity(candidate, candidateIndex) !== wantedIdentity) return false
          // Evitar que dos nodos con ids duplicados en datos antiguos
          // reutilicen el mismo nodo raw como base.
          if (claimedIdentities.has(candidateIndex)) return false
          claimedIdentities.add(candidateIndex)
          return true
        }) || null

    return mergeStageForSave(rawStage, {
      ...stage,
      index,
      id: resolvedId,
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

export type JugadorDesplazado = {
  id: string
  display_name: string
  level: number
}

/**
 * A quién le cambia el nodo con este guardado, sin migrar nada.
 *
 * El progreso de un jugador se guarda como ÍNDICE en la lista de nodos, no
 * como id del nodo (ver docs/plan-de-mejora.md, 1.2). Borrar un nodo antes de
 * donde va alguien no le baja el nivel: su nivel 5 sigue siendo 5, pero ese
 * puesto en la lista ahora lo ocupa el nodo que antes era el 6. Se salta uno
 * entero y nadie se entera. Y si el nodo que desaparece es justo el último
 * antes del suyo, su nivel deja de existir en la lista nueva y el servidor lo
 * lee como misión terminada.
 *
 * Por eso la comparación es por ÍNDICE, no por id: lo que importa es si el
 * nodo que hay en el puesto `level` sigue siendo el mismo antes y después de
 * guardar, esté donde esté ese nodo en el nuevo orden.
 */
export function jugadoresDesprazadosPolGardado(
  stagesAntes: AdminRawStage[],
  stagesDespois: AdminRawStage[],
  profiles: AdminReactOverviewProfile[]
): JugadorDesplazado[] {
  const desplazados: JugadorDesplazado[] = []

  for (const profile of profiles) {
    if (profile.finished) continue
    const level = typeof profile.level === 'number' ? profile.level : null
    if (level === null || level < 0) continue

    const antes = stagesAntes[level]
    if (!antes) continue // ya iba fuera de rango antes de tocar nada; no es este guardado

    const idAntes = rawStageIdentity(antes, level)
    const despois = stagesDespois[level]
    const idDespois = despois ? rawStageIdentity(despois, level) : null

    if (idDespois !== idAntes) {
      desplazados.push({ id: profile.id, display_name: profile.display_name, level })
    }
  }

  return desplazados
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

    // Lo que antes se perdía sin avisar: el requisito de mochila y el código
    // de emergencia. Se comparan como los lee el servidor, no campo a campo.
    if (
      persistenceJson(readRawItemRequirement(expected)) !==
      persistenceJson(readRawItemRequirement(actual))
    ) {
      errors.push(`requisito de mochila del nodo ${index + 1}`)
    }

    if (readRawManualCode(expected) !== readRawManualCode(actual)) {
      errors.push(`código de emergencia del nodo ${index + 1}`)
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
