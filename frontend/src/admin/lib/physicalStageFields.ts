import type { AdminReactOverviewStage } from './adminApi'

export const physicalStageFieldNames = [
  'physical_node_kind',
  'physical_item_kind',
  'physical_item_id',
  'physical_item_label',
  'physical_qr',
  'qr_payload',
] as const

export function withPhysicalStageFields<T extends Record<string, unknown>>(
  source: AdminReactOverviewStage,
  target: T
): T {
  const sourceRecord = source as unknown as Record<string, unknown>
  const next = { ...target } as Record<string, unknown>

  for (const field of physicalStageFieldNames) {
    if (field in sourceRecord) {
      next[field] = sourceRecord[field]
    }
  }

  return next as T
}
