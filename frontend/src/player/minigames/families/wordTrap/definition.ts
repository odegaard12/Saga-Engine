import type { MinigameDefinitionBase } from '../../core/types'
import type { WordTrapConfig } from '../../core/family-types'

/**
 * "Trampa de palabras" (owner-approved): sexta familia NUEVA de minijuego
 * -no un game_id dentro de una de las 5 de siempre-. Varias rondas de
 * preguntas trampa con 4 opciones casi idénticas (una palabra cambiada, una
 * negación escondida, un número distinto...) y un temporizador corto por
 * pregunta. A diferencia del resto de minijuegos (20-90 s), este tiene que
 * durar más de 1 minuto -por eso son varias rondas, no una sola pregunta-.
 */
export const wordTrapDefinition: MinigameDefinitionBase<'word_trap', WordTrapConfig> = {
  family: 'word_trap',
  version: 'v1',
  label: 'Trampa de palabras',
  tagline: 'Preguntas trampa contrarreloj: casi todas las opciones parecen la correcta.',
  description:
    'Varias rondas seguidas de preguntas con 4 opciones casi idénticas -una palabra cambiada, una negación escondida, un número distinto-. Ni ir demasiado rápido (te comes el truco) ni demasiado lento (se acaba el tiempo).',
  validation_mode: 'client',
  fallback_policy: 'none',
  capabilities: [],
  ui: {
    fullscreen: true,
    briefing_required: true,
    supports_pause: false,
    supports_retry: true,
    supports_manual_fallback: false,
  },
  default_config: {
    objective: 'word_trap',
    game_id: 'trampa_palabras',
    completion_method: 'quiz',
    rounds: [],
    n_rounds: 8,
    time_limit_s: 12,
    penalty_ms: 30000,
  },
}

export default wordTrapDefinition
