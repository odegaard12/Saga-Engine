import type { PlayerStage, StageMinigameRuntime } from '../../../types/player'
import type { ResolvedMinigame, ResolveMinigameInput } from './resolver'
import { resolveMinigame, resolveMinigameOrThrow } from './resolver'

export interface StageMinigameSource {
  type: string | null
  version: string | null
  config: unknown
  label: string | null
}

export interface StageResolvedMinigame {
  source: StageMinigameSource
  resolved: ResolvedMinigame | null
}

function asObject<T>(value: unknown): Partial<T> {
  return value && typeof value === 'object' ? (value as Partial<T>) : {}
}

function normalizeConfigDrivenStageSource(stage: PlayerStage): StageMinigameSource | null {
  const stageConfig = asObject<Record<string, unknown>>(stage.config)
  const runtimeConfig = asObject<Record<string, unknown>>(stage.minigame?.config)
  const config = {
    ...runtimeConfig,
    ...stageConfig,
  }

  const gameId = String(config.game_id || '').trim()

  if (gameId === 'shake_antenna_charge') {
    return {
      type: 'circuit_matrix',
      version: 'v1',
      config: {
        objective: 'path_restore',
        grid_cols: 5,
        grid_rows: 5,
        difficulty: 2,
        game_id: 'logic_circuit',
      },
      label: 'Circuito lógico',
    }
  }

  return null
}

function normalizeRuntimeSource(runtime?: StageMinigameRuntime | null): StageMinigameSource | null {
  if (!runtime) return null

  const type = String(runtime.type || '')
    .trim()
    .toLowerCase()
  if (!type) return null

  return {
    type,
    version: runtime.version ? String(runtime.version) : 'v1',
    config: runtime.config ?? {},
    label: runtime.label ? String(runtime.label) : null,
  }
}

function normalizeCompatibleStageSource(stage: PlayerStage): StageMinigameSource | null {
  const type = String(stage.type || '')
    .trim()
    .toLowerCase()
  if (!type) return null

  return {
    type,
    version: 'v1',
    config: asObject(stage.config),
    label: null,
  }
}

export function getStageMinigameSource(
  stage: PlayerStage | null | undefined
): StageMinigameSource | null {
  if (!stage) return null

  const configDrivenSource = normalizeConfigDrivenStageSource(stage)
  if (configDrivenSource) return configDrivenSource

  const runtimeSource = normalizeRuntimeSource(stage.minigame)
  if (runtimeSource) return runtimeSource

  return normalizeCompatibleStageSource(stage)
}

export function buildResolveMinigameInput(
  stage: PlayerStage | null | undefined
): ResolveMinigameInput | null {
  const source = getStageMinigameSource(stage)
  if (!source) return null

  return {
    type: source.type,
    version: source.version,
    config: source.config,
  }
}

export function resolveStageMinigame(
  stage: PlayerStage | null | undefined
): StageResolvedMinigame | null {
  const source = getStageMinigameSource(stage)
  if (!source) return null

  return {
    source,
    resolved: resolveMinigame({
      type: source.type,
      version: source.version,
      config: source.config,
    }),
  }
}

export function resolveStageMinigameOrThrow(
  stage: PlayerStage | null | undefined
): ResolvedMinigame {
  const input = buildResolveMinigameInput(stage)

  if (!input) {
    throw new Error('Stage has no resolvable minigame source')
  }

  return resolveMinigameOrThrow(input)
}

export function getStageResolvedFamily(stage: PlayerStage | null | undefined): string | null {
  return resolveStageMinigame(stage)?.resolved?.family || null
}

export function getStageResolvedLabel(stage: PlayerStage | null | undefined): string | null {
  const resolved = resolveStageMinigame(stage)
  if (!resolved?.resolved) return resolved?.source.label || null
  return resolved.resolved.label || resolved.source.label || null
}
