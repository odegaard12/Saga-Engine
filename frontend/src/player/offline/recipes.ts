import { loadInventorySnapshot, saveInventorySnapshot, type InventoryItem } from './inventory'
import { queuePhysicalEvent } from './physicalEvents'

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
  anotarFabricacion(user, recipe)
  return true
}

/**
 * Lo fabricado también va a la cola, como gasto y recogida.
 *
 * La mesa de trabajo ocurría entera en el móvil: el servidor seguía contando
 * los ingredientes por sus eventos de recogida (para él no se habían gastado) y,
 * con la caché del navegador borrada, se los devolvía al móvil: ingredientes
 * resucitados y una pieza forjada que sólo existía en la copia. Cada línea va
 * con su `grant_id`, así que repetida cuenta una vez.
 */
function anotarFabricacion(user: string, recipe: Recipe): void {
  const lote = `craft:${recipe.recipe_id}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const lineas = [
    ...recipe.inputs.map((input) => ({ ...input, accion: 'used' as const, label: '' })),
    ...recipe.outputs.map((output) => ({ ...output, accion: 'collected' as const })),
  ]
  for (const linea of lineas) {
    try {
      void Promise.resolve(
        queuePhysicalEvent({
          user,
          source: 'manual',
          physical_id: linea.item_id,
          payload: {
            inventory_item_id: linea.item_id,
            ...(linea.label ? { inventory_label: linea.label } : {}),
            inventory_action: linea.accion,
            inventory_quantity: linea.quantity,
            grant_id: `${lote}:${linea.accion === 'used' ? 'in' : 'out'}:${linea.item_id}`,
            crafted_recipe: recipe.recipe_id,
          },
        })
      ).catch(() => undefined)
    } catch {
      // Sin cola (sin usuario): la copia de la mochila sigue llevándolo.
    }
  }
}