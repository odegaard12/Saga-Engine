import type { AdminReactOverviewStage } from '../../shared/api'

export type FamilyId = 'signal_hunt' | 'bearing_hunt' | 'circuit_matrix'

export type EditableAdminStage = AdminReactOverviewStage & {
  config?: Record<string, unknown>
}

export const familyCards: Array<{
  id: FamilyId
  icon: string
  title: string
  detail: string
}> = [
  {
    id: 'signal_hunt',
    icon: '📡',
    title: 'Signal Hunt',
    detail: 'GPS proximity, signal strength and source capture.',
  },
  {
    id: 'bearing_hunt',
    icon: '🧭',
    title: 'Bearing Hunt',
    detail: 'Compass heading, sector lock and orientation capture.',
  },
  {
    id: 'circuit_matrix',
    icon: '🧩',
    title: 'Circuit Matrix',
    detail: 'Logic grids, route repair and lock-style board puzzles.',
  },
]

export function getAdminFamilyLabel(type: string) {
  if (type === 'bearing_hunt') return 'Bearing Hunt'
  if (type === 'circuit_matrix') return 'Circuit Matrix'
  return 'Signal Hunt'
}

export function getAdminFamilyIcon(type: string) {
  if (type === 'bearing_hunt') return '🧭'
  if (type === 'circuit_matrix') return '🧩'
  return '📡'
}

export function buildAdminMinigameBlock(type: string, config: Record<string, unknown>) {
  return {
    type,
    version: 'v1',
    label: getAdminFamilyLabel(type),
    config,
  }
}

function toAdminConfigNumber(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function getDefaultAdminConfigForFamily(type: string): Record<string, unknown> {
  if (type === 'bearing_hunt') {
    return {
      objective: 'single_lock',
      target_bearing_deg: 270,
      tolerance_deg: 12,
      hold_ms: 1200,
    }
  }

  if (type === 'circuit_matrix') {
    return {
      objective: 'path_restore',
      grid_cols: 5,
      grid_rows: 5,
      difficulty: 2,
    }
  }

  return {
    objective: 'proximity_lock',
    source_radius_m: 75,
    lock_threshold: 65,
    hold_ms: 1500,
  }
}

export function normalizeAdminConfigForFamily(
  type: string,
  input: Record<string, unknown>
) {
  const raw = input || {}

  if (type === 'bearing_hunt') {
    const bearing =
      raw.target_bearing_deg !== undefined
        ? raw.target_bearing_deg
        : raw.target_bearing

    return {
      objective: String(raw.objective || 'single_lock'),
      target_bearing_deg: toAdminConfigNumber(bearing, 270),
      tolerance_deg: toAdminConfigNumber(raw.tolerance_deg, 12),
      hold_ms: toAdminConfigNumber(raw.hold_ms, 1200),
    }
  }

  if (type === 'circuit_matrix') {
    return {
      objective: String(raw.objective || 'path_restore'),
      grid_cols: toAdminConfigNumber(raw.grid_cols ?? raw.grid_size, 5),
      grid_rows: toAdminConfigNumber(raw.grid_rows ?? raw.grid_size, 5),
      difficulty: toAdminConfigNumber(raw.difficulty, 2),
    }
  }

  return {
    objective: String(raw.objective || 'proximity_lock'),
    source_radius_m: toAdminConfigNumber(raw.source_radius_m, 75),
    lock_threshold: toAdminConfigNumber(raw.lock_threshold, 65),
    hold_ms: toAdminConfigNumber(raw.hold_ms, 1500),
  }
}
