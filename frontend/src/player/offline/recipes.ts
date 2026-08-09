import { loadInventorySnapshot, saveInventorySnapshot, type InventoryItem } from './inventory'

// El catalogo vive en shared/recipeCatalog.ts para que el panel de
// administracion pueda validar la ruta sin arrastrar codigo de localStorage.
// Se reexporta para no tocar a quien ya importaba desde aqui.
export { RECIPES, findRecipeForOutput } from '../../shared/recipeCatalog'
export type { Recipe, RecipeInput, RecipeOutput } from '../../shared/recipeCatalog'

import { RECIPES } from '../../shared/recipeCatalog'
import type { Recipe } from '../../shared/recipeCatalog'

export function checkCraftingPossible(user: string, recipe: Recipe): boolean {
  const snapshot = loadInventorySnapshot(user)

  for (const input of recipe.inputs) {
    const item = snapshot.items.find((i) => i.item_id === input.item_id)
    if (!item || item.quantity < input.quantity || item.state === 'used') {
      return false
    }
  }
  return true
}

export function craftRecipe(user: string, recipeId: string): boolean {
  const recipe = RECIPES.find((r) => r.recipe_id === recipeId)
  if (!recipe) return false

  if (!checkCraftingPossible(user, recipe)) {
    return false
  }

  const snapshot = loadInventorySnapshot(user)
  const timestamp = new Date().toISOString()

  // 1. Deducir inputs
  for (const input of recipe.inputs) {
    const item = snapshot.items.find((i) => i.item_id === input.item_id)
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
    const existing = snapshot.items.find((i) => i.item_id === output.item_id)
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