import type { PlayerStage } from '../../types/player'
import { loadInventorySnapshot } from '../offline/inventory'
import { configDelNodo } from '../configDelNodo'

/**
 * Objeto que un nodo exige llevar encima para poder abrirse.
 *
 * Vivía suelto dentro de missionPack.ts y sólo se consultaba al ENVIAR la
 * respuesta, así que el nodo final se abría igualmente y el jugador se
 * encontraba el rechazo después de jugar. Al compartirlo, el botón de abrir y
 * la validación del envío leen exactamente lo mismo y no pueden discrepar.
 */
export type StageItemRequirement = {
  itemId: string
  label: string
  quantity: number
  consume: boolean
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

/**
 * La configuración del nodo, la de verdad.
 *
 * Aquí se leía sólo `config`, y la que manda es `minigame.config`. Un nodo con
 * el objeto exigido puesto desde el editor podía no exigirlo al validar, o al
 * revés: el botón de abrir y la comprobación del envío miraban campos
 * distintos del mismo nodo.
 */
function readStageConfig(stage: PlayerStage | null): Record<string, unknown> {
  return configDelNodo(stage)
}

export function readStageItemRequirement(stage: PlayerStage | null): StageItemRequirement | null {
  if (!stage) return null

  const raw = asRecord(stage)
  const requirements = asRecord(raw.requirements)
  const items = Array.isArray(requirements.items) ? requirements.items : []
  const first = asRecord(items[0])
  const config = readStageConfig(stage)

  const itemId = String(
    first.item_id || first.required_item_id || config.required_item_id || ''
  ).trim()
  const label = String(
    first.label || first.required_item_label || config.required_item_label || itemId
  ).trim()

  const quantityRaw =
    first.quantity || first.required_item_quantity || config.required_item_quantity || 1
  const quantity = Number.isFinite(Number(quantityRaw))
    ? Math.max(1, Math.floor(Number(quantityRaw)))
    : 1

  const consumeRaw = first.consume ?? first.required_item_consume ?? config.required_item_consume
  const consume = consumeRaw === true || String(consumeRaw || '').toLowerCase() === 'true'

  if (!itemId) return null
  return { itemId, label, quantity, consume }
}

export function countOwnedItems(user: string, itemId: string): number {
  return loadInventorySnapshot(user)
    .items.filter((item) => item.item_id === itemId && item.state !== 'used')
    .reduce((total, item) => total + Math.max(0, item.quantity || 0), 0)
}

export type StageItemGate = {
  requirement: StageItemRequirement
  owned: number
  missing: number
}

/**
 * Devuelve null si el nodo no exige nada o si ya se cumple. Si falta algo,
 * devuelve cuánto falta para poder decirlo en pantalla.
 */
export function checkStageItemGate(user: string, stage: PlayerStage | null): StageItemGate | null {
  const requirement = readStageItemRequirement(stage)
  if (!requirement) return null

  const owned = countOwnedItems(user, requirement.itemId)
  if (owned >= requirement.quantity) return null

  return { requirement, owned, missing: requirement.quantity - owned }
}
