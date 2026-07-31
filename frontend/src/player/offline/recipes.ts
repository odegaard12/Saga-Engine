import { loadInventorySnapshot, saveInventorySnapshot, type InventoryItem } from './inventory'

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

// Recetas del motor de crafteo (Tecnología, Medieval, Místico)
export const RECIPES: Recipe[] = [
  // 🔑 Medieval / Básico
  {
    recipe_id: 'fix_broken_key',
    label: 'Reparar Llave Maestra',
    inputs: [
      { item_id: 'llave_rota', quantity: 1 },
      { item_id: 'cinta_aislante', quantity: 1 },
    ],
    outputs: [{ item_id: 'llave_maestra', label: 'Llave Maestra', quantity: 1 }],
  },
  // ⚡ Tecnología 1
  {
    recipe_id: 'craft_emp_device',
    label: 'Construir Dispositivo EMP',
    inputs: [
      { item_id: 'bateria_litio', quantity: 2 },
      { item_id: 'cables_cobre', quantity: 3 },
      { item_id: 'placa_base', quantity: 1 },
    ],
    outputs: [{ item_id: 'emp_device', label: 'Carga EMP', quantity: 1 }],
  },
  // 🚀 Tecnología 2
  {
    recipe_id: 'quantum_decoder',
    label: 'Decodificador Cuántico',
    inputs: [
      { item_id: 'chip_encriptado', quantity: 1 },
      { item_id: 'antena_frecuencia', quantity: 1 },
      { item_id: 'bateria_litio', quantity: 1 },
    ],
    outputs: [{ item_id: 'decodificador_cuantico', label: 'Decodificador Cuántico', quantity: 1 }],
  },
  // 🔬 Tecnología 3
  {
    recipe_id: 'biometric_scanner',
    label: 'Escáner Biométrico',
    inputs: [
      { item_id: 'sensor_optico', quantity: 1 },
      { item_id: 'placa_base', quantity: 1 },
      { item_id: 'cristal_enfoque', quantity: 1 },
    ],
    outputs: [{ item_id: 'escaner_biometrico', label: 'Escáner Biométrico', quantity: 1 }],
  },
  // 🛡️ Medieval 1
  {
    recipe_id: 'guardian_amulet',
    label: 'Amuleto del Guardián',
    inputs: [
      { item_id: 'fragmento_escudo', quantity: 1 },
      { item_id: 'hilo_plata', quantity: 1 },
    ],
    outputs: [{ item_id: 'amuleto_guardian', label: 'Amuleto del Guardián', quantity: 1 }],
  },
  // 🧪 Medieval 2
  {
    recipe_id: 'alchemy_elixir',
    label: 'Elixir de Alquimia',
    inputs: [
      { item_id: 'hierbas_curativas', quantity: 2 },
      { item_id: 'frasco_cristal', quantity: 1 },
      { item_id: 'agua_purificada', quantity: 1 },
    ],
    outputs: [{ item_id: 'elixir_alquimia', label: 'Elixir de Alquimia', quantity: 1 }],
  },
  // 🛡️ Medieval 3
  {
    recipe_id: 'runic_shield',
    label: 'Escudo Rúnico',
    inputs: [
      { item_id: 'placa_hierro', quantity: 2 },
      { item_id: 'runa_proteccion', quantity: 1 },
      { item_id: 'hilo_plata', quantity: 1 },
    ],
    outputs: [{ item_id: 'escudo_runico', label: 'Escudo Rúnico', quantity: 1 }],
  },
  // 🔮 Místico 1
  {
    recipe_id: 'fire_orb',
    label: 'Orbe de Fuego Arcano',
    inputs: [
      { item_id: 'esfera_cristal', quantity: 1 },
      { item_id: 'esencia_ignea', quantity: 2 },
      { item_id: 'polvo_estelar', quantity: 1 },
    ],
    outputs: [{ item_id: 'orbe_fuego', label: 'Orbe de Fuego Arcano', quantity: 1 }],
  },
  // 🔮 Místico 2
  {
    recipe_id: 'sacred_relic',
    label: 'Reliquia Sagrada',
    inputs: [
      { item_id: 'fragmento_reliquia', quantity: 2 },
      { item_id: 'esencia_sagrada', quantity: 1 },
      { item_id: 'pergamino_antiguo', quantity: 1 },
    ],
    outputs: [{ item_id: 'reliquia_sagrada', label: 'Reliquia Sagrada', quantity: 1 }],
  },
  // 🔮 Místico 3
  {
    recipe_id: 'vision_amulet',
    label: 'Amuleto de Visión Suprema',
    inputs: [
      { item_id: 'ojo_mistico', quantity: 1 },
      { item_id: 'gemas_antiguas', quantity: 1 },
      { item_id: 'polvo_estelar', quantity: 1 },
    ],
    outputs: [{ item_id: 'amuleto_vision', label: 'Amuleto de Visión Suprema', quantity: 1 }],
  },
]

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
