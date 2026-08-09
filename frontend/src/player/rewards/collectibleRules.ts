import type { PlayerStage } from '../../types/player'

export type CollectibleRequirement = {
  item_id: string
  quantity: number
}

export type CollectibleRewardPoint = {
  id: string
  item_id: string
  title: string
  lat: number
  lon: number
  between_stage_ids?: Array<string | number>
  quantity?: number
}

export function getStageRequiredCollectibles(stage: PlayerStage | null): CollectibleRequirement[] {
  const raw = stage?.config?.required_collectibles
  if (!Array.isArray(raw)) return []

  const requirements: CollectibleRequirement[] = []

  for (const item of raw) {
    if (typeof item === 'string') {
      const itemId = item.trim()
      if (itemId) requirements.push({ item_id: itemId, quantity: 1 })
      continue
    }

    if (!item || typeof item !== 'object') continue

    const record = item as Record<string, unknown>
    const itemId = String(record.item_id || record.id || '').trim()
    if (!itemId) continue

    const quantity =
      typeof record.quantity === 'number' && record.quantity > 0 ? Math.floor(record.quantity) : 1

    requirements.push({ item_id: itemId, quantity })
  }

  return requirements
}

export function stageAllowsCollectible(stage: PlayerStage | null, itemId: string): boolean {
  const required = getStageRequiredCollectibles(stage)
  if (required.length === 0) return false
  return required.some((item) => item.item_id === itemId)
}

export function explainCollectibleUse(stage: PlayerStage | null, itemId: string): string {
  if (stageAllowsCollectible(stage, itemId)) {
    return 'Usable en este nodo: corresponde con la actividad marcada.'
  }

  return 'No usable aquí: este objeto solo se puede usar cuando el nodo/actividad lo requiere.'
}

export function midpointRewardId(
  fromStage: PlayerStage,
  toStage: PlayerStage,
  itemId: string
): string {
  return `mid:${String(fromStage.id ?? fromStage.title)}:${String(toStage.id ?? toStage.title)}:${itemId}`
}
