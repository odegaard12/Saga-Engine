/**
 * Catálogo de recetas de la mesa de trabajo.
 *
 * Vive aquí, sin depender de localStorage ni de nada del jugador, porque el
 * panel de administración también necesita leerlo para avisar de rutas
 * imposibles. Antes el admin llevaba su PROPIA copia escrita a mano: se quedó
 * desfasada, seguía nombrando una receta retirada y no conocía la que está en
 * juego, así que validaba lo que no era y dejaba pasar el error de verdad.
 */

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

export const RECIPES: Recipe[] = [
  // ⭐ Receta de la misión activa del despliegue.
  //
  //    El resto de recetas de esta lista son de demostración y usan objetos
  //    (llave_rota, cinta_aislante, bateria_litio...) que NINGÚN nodo entrega,
  //    así que la mesa de trabajo no servía para nada en esta misión.
  //
  //    ⚠️ Las cantidades tienen que ser alcanzables con la ruta real. Un nodo
  //    coleccionable entrega SIEMPRE 1 unidad, así que pedir 2 de un objeto que
  //    solo da un nodo hace la receta imposible: se llegaba al nodo final con
  //    "te falta 1 gema" y la misión no se podía terminar. Un ingrediente, un
  //    nodo.
  {
    recipe_id: 'forge_seal',
    label: 'Forjar el Sello',
    inputs: [
      { item_id: 'gemas_antiguas', quantity: 1 },
      { item_id: 'fragmento_escudo', quantity: 1 },
      { item_id: 'hilo_plata', quantity: 1 },
    ],
    outputs: [{ item_id: 'sello', label: 'Sello', quantity: 1 }],
  },
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
  // El "Amuleto del Guardián" se retiró a propósito: usaba los MISMOS
  // ingredientes que el Sello (fragmento + hilo), así que quien lo fabricase se
  // quedaba sin piezas para el otro y no podía terminar la misión. Dos recetas
  // compitiendo por los mismos materiales escasos es una trampa, no una
  // elección.
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

/** Receta que fabrica un objeto concreto, si alguna lo hace. */
export function findRecipeForOutput(itemId: string): Recipe | null {
  return RECIPES.find((recipe) => recipe.outputs.some((out) => out.item_id === itemId)) || null
}
