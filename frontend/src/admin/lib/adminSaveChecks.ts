/**
 * Comprobaciones de la misión ANTES de guardarla.
 *
 * `validateRouteDependencies` vivía dentro del componente del panel y solo la
 * ejecutaba UNO de los tres botones de guardar (el de la barra de arriba, el del
 * móvil y el del aviso de «cambios sin guardar» la saltaban: informe A4). Aquí es
 * una función pura y todos los botones pasan por `validateStagesBeforeSave`.
 */
import type { AdminReactOverviewStage } from './adminApi'
import { findRecipeForOutput } from '../../shared/recipeCatalog'

type Registro = Record<string, unknown>

function comoRegistro(valor: unknown): Registro {
  return valor && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Registro) : {}
}

/** El id y la cantidad del objeto que pide un nodo, mire donde mire el editor. */
function requisitoDelNodo(stage: AdminReactOverviewStage): { id: string; cantidad: number } | null {
  const nodo = comoRegistro(stage)
  if (nodo.requires_item === false) return null

  const config = comoRegistro(nodo.config)
  const primero = comoRegistro(
    Array.isArray(comoRegistro(nodo.requirements).items)
      ? (comoRegistro(nodo.requirements).items as unknown[])[0]
      : undefined
  )

  const id = String(
    nodo.required_item_id || config.required_item_id || primero.item_id || primero.required_item_id || ''
  ).trim()
  if (!id) return null

  const cantidad = Math.max(
    1,
    Number(nodo.required_item_quantity || config.required_item_quantity || primero.quantity) || 1
  )
  return { id, cantidad }
}

export function validateRouteDependencies(stages: AdminReactOverviewStage[]): string | null {
  // Cuántas unidades de cada objeto reparte la ruta. Antes se guardaba sólo
  // "qué objetos existen", así que una receta que pedía 2 gemas pasaba la
  // validación aunque un único nodo entregase 1: la misión quedaba imposible
  // de terminar y el fallo sólo aparecía en el último nodo, en el monte.
  const provided = new Map<string, number>()

  function addProvided(itemId: unknown, quantity: unknown) {
    if (typeof itemId !== 'string' || !itemId.trim()) return
    const amount = Number(quantity)
    const safe = Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : 1
    provided.set(itemId, (provided.get(itemId) || 0) + safe)
  }

  for (const stage of stages) {
    const nodo = comoRegistro(stage)
    const config = comoRegistro(nodo.config)

    addProvided(stage.physical_item_id, nodo.physical_item_quantity ?? config.physical_item_quantity)
    addProvided(config.reward_item_id, config.reward_item_quantity)
  }

  for (const stage of stages) {
    const requisito = requisitoDelNodo(stage)
    if (!requisito) continue

    const reqId = requisito.id
    const nodeName = stage.title || 'Nodo'
    const needed = requisito.cantidad

    // ¿Lo reparte algún nodo directamente?
    if ((provided.get(reqId) || 0) >= needed) continue

    // Si no, tiene que poder fabricarse. El catálogo es el mismo que usa la
    // mesa de trabajo del jugador, así que no puede quedarse desfasado.
    const recipe = findRecipeForOutput(reqId)
    if (!recipe) {
      return `El nodo "${nodeName}" requiere el objeto "${reqId}", pero ningún nodo de la misión lo entrega y ninguna receta lo fabrica.`
    }

    const missing = recipe.inputs
      .filter((input) => (provided.get(input.item_id) || 0) < input.quantity)
      .map((input) => {
        const have = provided.get(input.item_id) || 0
        return `${input.item_id} (hacen falta ${input.quantity}, la ruta da ${have})`
      })

    if (missing.length > 0) {
      return `El nodo "${nodeName}" requiere "${recipe.label}", pero la ruta no reparte sus ingredientes: ${missing.join('; ')}.`
    }
  }

  return null
}

/** Preguntas que el servidor necesita como mínimo en el banco de «Trampa de palabras». */
export const MIN_WORD_TRAP_QUESTIONS = 4

/** Cuántas preguntas de un banco están completas: enunciado y al menos dos opciones con texto. */
export function countCompleteWordTrapQuestions(questions: unknown): number {
  if (!Array.isArray(questions)) return 0

  return questions.filter((item) => {
    const pregunta = comoRegistro(item)
    if (!String(pregunta.question || '').trim()) return false
    const opciones = Array.isArray(pregunta.options) ? pregunta.options : []
    return opciones.filter((opcion) => String(opcion || '').trim()).length >= 2
  }).length
}

export type IncompleteWordTrap = { index: number; title: string; complete: number }

/**
 * Nodos de «Trampa de palabras» con menos de 4 preguntas completas. Antes el
 * panel rellenaba el hueco con «Pregunta trampa N: escribe el enunciado» y lo
 * guardaba; el servidor sigue rellenando al servir el juego, así que el aviso
 * tiene que salir aquí, cuando todavía se puede escribir la pregunta.
 */
export function incompleteWordTrapNodes(stages: AdminReactOverviewStage[]): IncompleteWordTrap[] {
  const salida: IncompleteWordTrap[] = []

  stages.forEach((stage, index) => {
    const config = comoRegistro(comoRegistro(stage).config)
    const esTrampa = stage.type === 'word_trap' || config.game_id === 'trampa_palabras'
    if (!esTrampa) return

    const complete = countCompleteWordTrapQuestions(config.questions)
    if (complete < MIN_WORD_TRAP_QUESTIONS) {
      salida.push({ index, title: stage.title || `Nodo ${index + 1}`, complete })
    }
  })

  return salida
}

export function describeIncompleteWordTrap(nodos: IncompleteWordTrap[]): string | null {
  if (nodos.length === 0) return null

  const detalle = nodos
    .slice(0, 4)
    .map((nodo) => `«${nodo.title}» (nodo ${nodo.index + 1}) tiene ${nodo.complete}`)
    .join('; ')

  return (
    `Trampa de palabras necesita al menos ${MIN_WORD_TRAP_QUESTIONS} preguntas completas ` +
    `(enunciado y dos opciones con texto): ${detalle}. ` +
    'Sin ellas los jugadores verían preguntas de relleno.'
  )
}

/** Lo que tiene que pasar antes de mandar nada al servidor. `null` = puede guardarse. */
export function validateStagesBeforeSave(stages: AdminReactOverviewStage[]): string | null {
  return describeIncompleteWordTrap(incompleteWordTrapNodes(stages)) || validateRouteDependencies(stages)
}
