/**
 * Estado de cada nodo para la barra de nodos y el editor (ronda 7).
 *
 * Es sólo INFORMACIÓN para el organizador: no bloquea nada ni cambia lo que se
 * guarda. Usa los mismos criterios que `adminSaveChecks` (el aviso de ruta
 * imposible y el mínimo de preguntas de «Trampa de palabras»).
 *
 *  - `incompleto`: falta algo sin lo que el nodo no funciona (sin nombre, sin
 *    posición en el mapa, QR sin código, trampa con pocas preguntas).
 *  - `aviso`: funciona, pero la ruta tiene un problema (pide un objeto que nadie
 *    entrega antes).
 *  - `ok`: nada que decir.
 */
import type { AdminReactOverviewStage } from './adminApi'
import {
  MIN_WORD_TRAP_QUESTIONS,
  countCompleteWordTrapQuestions,
  validateRouteDependencies,
} from './adminSaveChecks'

export type NivelNodo = 'ok' | 'aviso' | 'incompleto'

/** Secciones del editor de nodo a las que puede apuntar un aviso. */
export type SeccionEditor = 'identidad' | 'donde' | 'juego' | 'historia' | 'recompensas' | 'avanzado'

export type Problema = { texto: string; seccion: SeccionEditor }

export type EstadoNodo = {
  nivel: NivelNodo
  /** Frases cortas y accionables, la más grave primero. */
  motivos: string[]
  /** Los mismos avisos, con la sección del editor donde se arreglan. */
  problemas: Problema[]
}

type Registro = Record<string, unknown>

function registro(valor: unknown): Registro {
  return valor && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Registro) : {}
}

/** Problemas propios del nodo, sin mirar el resto de la ruta. */
export function problemasDelNodo(stage: AdminReactOverviewStage): Problema[] {
  const nodo = registro(stage)
  const config = registro(nodo.config)
  const problemas: Problema[] = []

  if (!String(nodo.title ?? '').replace(/^\d+\.\s*/, '').trim()) {
    problemas.push({ texto: 'Ponle un nombre al nodo', seccion: 'identidad' })
  }
  if (typeof nodo.lat !== 'number' || typeof nodo.lon !== 'number') {
    problemas.push({ texto: 'Colócalo en el mapa: no tiene posición', seccion: 'donde' })
  }
  const esTrampa = nodo.type === 'word_trap' || config.game_id === 'trampa_palabras'
  if (esTrampa) {
    const completas = countCompleteWordTrapQuestions(config.questions)
    if (completas < MIN_WORD_TRAP_QUESTIONS) {
      problemas.push({
        texto: `Faltan preguntas: ${completas} de ${MIN_WORD_TRAP_QUESTIONS} completas`,
        seccion: 'juego',
      })
    }
  }
  return problemas
}

/** Estado de todos los nodos, en el orden de la ruta. */
export function estadoDeLosNodos(stages: AdminReactOverviewStage[]): EstadoNodo[] {
  return stages.map((stage, indice) => {
    const problemas = problemasDelNodo(stage)
    if (problemas.length) {
      return { nivel: 'incompleto' as const, motivos: problemas.map((p) => p.texto), problemas }
    }
    // La ruta se rompe en ESTE nodo si hasta aquí falla y hasta el anterior no.
    const hasta = validateRouteDependencies(stages.slice(0, indice + 1))
    const antes = indice > 0 ? validateRouteDependencies(stages.slice(0, indice)) : null
    if (hasta && !antes) {
      return {
        nivel: 'aviso' as const,
        motivos: [hasta],
        problemas: [{ texto: hasta, seccion: 'donde' as const }],
      }
    }
    return { nivel: 'ok' as const, motivos: [], problemas: [] }
  })
}

export const ETIQUETA_NIVEL: Record<NivelNodo, string> = {
  ok: 'Completo',
  aviso: 'Con aviso',
  incompleto: 'Incompleto',
}

/**
 * Estado del nodo que se está editando: sus problemas propios (del borrador) y,
 * si no hay, el aviso de ruta imposible que le toca según la lista de nodos.
 */
export function estadoDelNodoEnEdicion(
  stage: AdminReactOverviewStage,
  stages: AdminReactOverviewStage[]
): EstadoNodo {
  const propios = problemasDelNodo(stage)
  if (propios.length) {
    return { nivel: 'incompleto', motivos: propios.map((p) => p.texto), problemas: propios }
  }
  const posicion = stages.findIndex((otro) => otro.index === stage.index)
  const delListado = posicion >= 0 ? estadoDeLosNodos(stages)[posicion] : undefined
  return delListado && delListado.nivel === 'aviso'
    ? delListado
    : { nivel: 'ok', motivos: [], problemas: [] }
}
