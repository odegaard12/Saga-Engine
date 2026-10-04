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
function requisitoDelNodo(
  stage: AdminReactOverviewStage
): { id: string; cantidad: number; gasta: boolean } | null {
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
  const gasta = [nodo.consume_required_item, config.required_item_consume, primero.consume].some(
    (valor) => valor === true || String(valor || '').toLowerCase() === 'true'
  )
  return { id, cantidad, gasta }
}

function unidades(valor: unknown): number {
  const numero = Number(valor)
  return Number.isFinite(numero) && numero > 0 ? Math.floor(numero) : 1
}

/**
 * Lo que entrega un nodo al superarlo: su coleccionable y el premio del
 * minijuego. Un coleccionable de mapa lleva el mismo id en `reward_item_id`
 * (lo pone el editor): es UNA entrega, no dos. Contarla doble hacía pasar una
 * ruta que en el monte no daba las unidades que pedía el nodo siguiente.
 */
function entregasDelNodo(stage: AdminReactOverviewStage): Array<{ id: string; cantidad: number }> {
  const nodo = comoRegistro(stage)
  const config = comoRegistro(nodo.config)
  const salida: Array<{ id: string; cantidad: number }> = []

  const fisico = String(stage.physical_item_id || config.physical_item_id || '').trim()
  if (fisico) {
    salida.push({ id: fisico, cantidad: unidades(nodo.physical_item_quantity ?? config.physical_item_quantity) })
  }

  const premio = String(config.reward_item_id || '').trim()
  const esColeccionable =
    nodo.is_map_collectible === true || config.is_map_collectible === true || config.game_id === 'qr_collectible'
  if (premio && premio !== fisico && !esColeccionable) {
    salida.push({ id: premio, cantidad: unidades(config.reward_item_quantity) })
  }
  return salida
}

/**
 * ¿Se puede terminar la ruta con los objetos que reparte, EN ORDEN?
 *
 * Antes se sumaba lo que daba TODA la misión y se comprobaba cada requisito
 * contra ese total: un nodo que pedía la llave pasaba aunque la llave la diese
 * un nodo POSTERIOR. Los nodos se juegan en orden, así que esa ruta era
 * imposible y el fallo sólo aparecía en el monte. Ahora se recorre en orden:
 * cada nodo sólo cuenta con lo que han entregado los anteriores (menos lo ya
 * gastado por un requisito que consume), y fabricar en la mesa de trabajo
 * gasta sus ingredientes.
 */
export function validateRouteDependencies(stages: AdminReactOverviewStage[]): string | null {
  // Cuántas unidades lleva el jugador al llegar a cada nodo.
  const lleva = new Map<string, number>()
  const sumar = (id: string, cantidad: number) => lleva.set(id, (lleva.get(id) || 0) + cantidad)

  // Qué nodo entrega cada objeto, para decir "lo da un nodo que va después".
  const quienLoDa = new Map<string, number>()
  stages.forEach((stage, index) => {
    for (const entrega of entregasDelNodo(stage)) {
      if (!quienLoDa.has(entrega.id)) quienLoDa.set(entrega.id, index)
    }
  })

  for (let index = 0; index < stages.length; index += 1) {
    const stage = stages[index]
    const requisito = requisitoDelNodo(stage)

    if (requisito) {
      const reqId = requisito.id
      const nodeName = stage.title || `Nodo ${index + 1}`
      const needed = requisito.cantidad
      const tiene = lleva.get(reqId) || 0

      if (tiene < needed) {
        // Si no, tiene que poder fabricarse. El catálogo es el mismo que usa la
        // mesa de trabajo del jugador, así que no puede quedarse desfasado.
        const recipe = findRecipeForOutput(reqId)
        const despues = quienLoDa.get(reqId)

        if (!recipe) {
          if (despues !== undefined && despues >= index) {
            const otro = stages[despues]?.title || `Nodo ${despues + 1}`
            return `El nodo "${nodeName}" requiere el objeto "${reqId}", pero sólo lo entrega "${otro}", que va después (o es el mismo nodo). Nadie puede llegar con él.`
          }
          if (despues !== undefined) {
            return `El nodo "${nodeName}" requiere ${needed} de "${reqId}", pero los nodos anteriores sólo dan ${tiene}.`
          }
          return `El nodo "${nodeName}" requiere el objeto "${reqId}", pero ningún nodo de la misión lo entrega y ninguna receta lo fabrica.`
        }

        // Cuántas veces hay que fabricar para llegar a lo que pide.
        const porVez = recipe.outputs.find((salida) => salida.item_id === reqId)?.quantity || 1
        const veces = Math.ceil((needed - tiene) / porVez)

        const missing = recipe.inputs
          .filter((input) => (lleva.get(input.item_id) || 0) < input.quantity * veces)
          .map((input) => {
            const have = lleva.get(input.item_id) || 0
            return `${input.item_id} (hacen falta ${input.quantity * veces}, los nodos anteriores dan ${have})`
          })

        if (missing.length > 0) {
          return `El nodo "${nodeName}" requiere "${recipe.label}", pero los nodos anteriores no reparten sus ingredientes: ${missing.join('; ')}.`
        }

        for (const input of recipe.inputs) sumar(input.item_id, -input.quantity * veces)
        for (const salida of recipe.outputs) sumar(salida.item_id, salida.quantity * veces)
      }

      if (requisito.gasta) sumar(reqId, -needed)
    }

    for (const entrega of entregasDelNodo(stage)) sumar(entrega.id, entrega.cantidad)
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
