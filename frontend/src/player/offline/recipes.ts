import {
  loadInventorySnapshot,
  saveInventorySnapshot,
  type InventoryItem,
} from './inventory'

export type RecipeInput = {
  item_id: string
  quantity: number
}

export type RecipeOutput = {
  item_id: string
  label: string
  quantity: number
}

export type Recipe = {
  recipe_id: string
  label: string
  inputs: RecipeInput[]
  outputs: RecipeOutput[]
}

// Ejemplo de recetas offline
export const RECIPES: Recipe[] = [
  {
    recipe_id: 'fix_broken_key',
    label: 'Reparar Llave',
    inputs: [
      { item_id: 'llave_rota', quantity: 1 },
      { item_id: 'cinta_aislante', quantity: 1 }
    ],
    outputs: [
      { item_id: 'llave_maestra', label: 'Llave Maestra', quantity: 1 }
    ]
  },
  {
    recipe_id: 'craft_emp_device',
    label: 'Construir Dispositivo EMP',
    inputs: [
      { item_id: 'bateria_litio', quantity: 2 },
      { item_id: 'cables_cobre', quantity: 3 },
      { item_id: 'placa_base', quantity: 1 }
    ],
    outputs: [
      { item_id: 'emp_device', label: 'Carga EMP', quantity: 1 }
    ]
  }
]

export function checkCraftingPossible(user: string, recipe: Recipe): boolean {
  const snapshot = loadInventorySnapshot(user)
  
  for (const input of recipe.inputs) {
    const item = snapshot.items.find(i => i.item_id === input.item_id)
    if (!item || item.quantity < input.quantity || item.state === 'used') {
      return false
    }
  }
  return true
}

export function craftRecipe(user: string, recipeId: string): boolean {
  const recipe = RECIPES.find(r => r.recipe_id === recipeId)
  if (!recipe) return false

  if (!checkCraftingPossible(user, recipe)) {
    return false
  }

  const snapshot = loadInventorySnapshot(user)
  const timestamp = new Date().toISOString()

  // 1. Deducir inputs
  for (const input of recipe.inputs) {
    const item = snapshot.items.find(i => i.item_id === input.item_id)
    if (item) {
      item.quantity -= input.quantity
      if (item.quantity <= 0) {
        item.state = 'used'
      }
      item.updated_at = timestamp
    }
  }

  // 2. Añadir outputs
  for (const output of recipe.outputs) {
    const existing = snapshot.items.find(i => i.item_id === output.item_id)
    if (existing) {
      existing.quantity += output.quantity
      existing.state = 'collected'
      existing.updated_at = timestamp
    } else {
      snapshot.items.unshift({
        item_id: output.item_id,
        label: output.label,
        state: 'collected',
        quantity: output.quantity,
        source: 'system',
        collected_at: timestamp,
        updated_at: timestamp,
      })
    }
  }

  saveInventorySnapshot(snapshot)
  return true
}
