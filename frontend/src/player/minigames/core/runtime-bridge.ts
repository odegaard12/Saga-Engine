import type { PlayerStage, StageMinigameRuntime } from '../../../types/player'
import type { ResolvedMinigame } from './resolver'
import { resolveMinigame } from './resolver'
import { nivelDe, parametrosDeNivel } from './nivel'

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

  // 15/11: «Pulso de hierro» se fusionó con Simón (Eco rítmico). El servidor ya lo sirve así (minigames.alias_de_juego);
  // esto cubre misiones guardadas en la caché del móvil. Con nivel manda la tabla de `sequence_code`; si no, se traducen
  // rondas y fichas. Los nodos guardados no se tocan.
  if (gameId === 'pulso_hierro') {
    const delNivel =
      config.nivel != null && !config.nivel_a_mano ? parametrosDeNivel('sequence_code', nivelDe(config)) : {}
    return {
      type: 'circuit_matrix',
      version: 'v1',
      config: {
        ...config,
        objective: 'sequence_order',
        game_id: 'sequence_code',
        completion_method: 'sequence',
        levels: config.levels ?? config.pulso_target_rounds,
        pad_count: config.pad_count ?? config.pulso_pad_count,
        ...delNivel,
      },
      label: 'Eco rítmico',
    }
  }

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
