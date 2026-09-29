/**
 * Editor de "Trampa de palabras" (owner-approved).
 *
 * Único game_id de la familia TÉCNICA nueva `word_trap` (presentación admin
 * "Desafío"): varias rondas seguidas de preguntas trampa con 4 opciones
 * casi idénticas y un temporizador corto por pregunta -pensado para durar
 * más de 1 minuto, a diferencia del resto de minijuegos (20-90 s)-.
 *
 * El organizador escribe aquí un BANCO de preguntas (puede ser mayor que
 * las rondas por partida, para que no sea memorizable con una sola
 * partida) y cuántas rondas/segundos por pregunta quiere. El servidor
 * NUNCA manda el banco completo ni el índice correcto en claro a un
 * jugador: recorta a las `n_rounds` rondas que le tocan (barajadas de
 * forma estable) y sustituye la respuesta por su hash salado justo antes
 * de que el payload salga hacia el móvil -ver project_word_trap_for_player
 * en minigames.py-.
 */
type Question = {
  question: string
  options: string[]
  correct_index: number
  explanation: string
}

type Props = {
  config: Record<string, unknown>
  onChange: (values: Record<string, unknown>) => void
}

const MIN_QUESTIONS = 4
const MAX_QUESTIONS = 40
const MIN_ROUNDS = 4
const MAX_ROUNDS = 12
const MIN_TIME_LIMIT_S = 4
const MAX_TIME_LIMIT_S = 30

const CSS = `
.wtp-ed,.wtp-ed *{box-sizing:border-box}
.wtp-ed{display:grid;gap:15px;padding:17px;border:1px solid rgba(15,23,42,.1);border-radius:20px;background:radial-gradient(circle at 100% 0,rgba(167,139,250,.14),transparent 32%),#f8fafc;color:#172033}
.wtp-ed-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}
.wtp-ed-head h4{margin:0;font-size:21px;letter-spacing:-.035em}
.wtp-ed-head p{max-width:66ch;margin:5px 0 0;color:#64748b;font-size:13px;line-height:1.45}
.wtp-ed-badge{padding:7px 10px;border-radius:999px;background:#ede9fe;color:#6d28d9;font-size:11px;font-weight:900;white-space:nowrap}
.wtp-ed-guide{padding:11px;border:1px solid #fde68a;border-radius:13px;background:#fffbeb;color:#92400e;font-size:12px;font-weight:700;line-height:1.45}
.wtp-ed-settings{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.wtp-ed-settings label{display:grid;gap:6px;color:#334155;font-size:12px;font-weight:850}
.wtp-ed-settings input{width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:11px;background:#fff;color:#172033;font:inherit}
.wtp-ed-total{grid-column:1 / -1;font-size:12px;font-weight:800;color:#6d28d9}
.wtp-ed-questions{display:grid;gap:12px}
.wtp-ed-question{display:grid;gap:10px;padding:14px;border:1px solid #dbe2ea;border-radius:14px;background:rgba(255,255,255,.94)}
.wtp-ed-question label{display:grid;gap:6px;color:#334155;font-size:12px;font-weight:850}
.wtp-ed-question input,.wtp-ed-question textarea{width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:11px;background:#fff;color:#172033;font:inherit}
.wtp-ed-question textarea{min-height:44px;resize:vertical}
.wtp-ed-options{display:grid;gap:8px}
.wtp-ed-option{display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:center}
.wtp-ed-option input[type=radio]{width:18px;height:18px}
.wtp-ed-toprow{display:flex;justify-content:space-between;align-items:center}
.wtp-ed-toprow b{font-size:13px;color:#6d28d9}
.wtp-ed-remove{min-height:38px;padding:0 12px;border:1px solid #fecaca;border-radius:11px;background:#fef2f2;color:#b91c1c;font-weight:800;cursor:pointer}
.wtp-ed-remove:disabled{opacity:.4;cursor:not-allowed}
.wtp-ed-add{justify-self:start;padding:9px 14px;border:1px dashed #c4b5fd;border-radius:11px;background:#f5f3ff;color:#6d28d9;font-weight:800;cursor:pointer}
.wtp-ed-add:disabled{opacity:.4;cursor:not-allowed}
.wtp-ed-note{padding:11px;border:1px solid #ddd6fe;border-radius:13px;background:#f5f3ff;color:#6d28d9;font-size:12px;line-height:1.45}
`

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.max(min, Math.min(max, Math.round(num)))
}

function readQuestions(config: Record<string, unknown>): Question[] {
  const raw = Array.isArray(config.questions) ? config.questions : []
  const questions: Question[] = raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .slice(0, MAX_QUESTIONS)
    .map((item) => {
      const rawOptions = Array.isArray(item.options) ? item.options : []
      const options = rawOptions.map((opt) => String(opt ?? '').slice(0, 120))
      while (options.length < 4) options.push('')
      return {
        question: String(item.question ?? '').slice(0, 300),
        options: options.slice(0, 4),
        correct_index: clampInt(item.correct_index, 0, 3, 0),
        explanation: String(item.explanation ?? '').slice(0, 400),
      }
    })

  while (questions.length < MIN_QUESTIONS) {
    questions.push({
      question: '',
      options: ['', '', '', ''],
      correct_index: 0,
      explanation: '',
    })
  }

  return questions
}

export function TrampaPalabrasEditor({ config, onChange }: Props) {
  const questions = readQuestions(config)
  const nRounds = clampInt(config.n_rounds, MIN_ROUNDS, MAX_ROUNDS, 8)
  const timeLimitS = clampInt(config.time_limit_s, MIN_TIME_LIMIT_S, MAX_TIME_LIMIT_S, 12)
  const totalSeconds = nRounds * timeLimitS

  const updateQuestions = (next: Question[]) => onChange({ questions: next })

  const updateQuestion = (index: number, patch: Partial<Question>) => {
    const next = questions.map((question, i) => (i === index ? { ...question, ...patch } : question))
    updateQuestions(next)
  }

  const updateOption = (index: number, optionIndex: number, value: string) => {
    const next = questions.map((question, i) => {
      if (i !== index) return question
      const options = question.options.slice()
      options[optionIndex] = value
      return { ...question, options }
    })
    updateQuestions(next)
  }

  const addQuestion = () => {
    if (questions.length >= MAX_QUESTIONS) return
    updateQuestions([
      ...questions,
      { question: '', options: ['', '', '', ''], correct_index: 0, explanation: '' },
    ])
  }

  const removeQuestion = (index: number) => {
    if (questions.length <= MIN_QUESTIONS) return
    updateQuestions(questions.filter((_, i) => i !== index))
  }

  return (
    <div className="wtp-ed">
      <style>{CSS}</style>

      <div className="wtp-ed-head">
        <div>
          <h4>🧠 Trampa de palabras</h4>
          <p>
            Escribe un banco de preguntas trampa: cada una con 4 opciones casi idénticas y solo una
            correcta. Cada partida usa solo {nRounds} de las {questions.length} preguntas del banco -si
            escribes más de las que se juegan por partida, no es memorizable con una sola partida-.
          </p>
        </div>
        <span className="wtp-ed-badge">Desafío</span>
      </div>

      <div className="wtp-ed-guide">
        ✏️ Escribe preguntas con truco: una opción casi igual a la correcta, una negación escondida, un
        número cambiado.
      </div>

      <div className="wtp-ed-settings">
        <label>
          <span>Rondas por partida (4-8)</span>
          <input
            type="number"
            min={MIN_ROUNDS}
            max={MAX_ROUNDS}
            value={nRounds}
            onChange={(event) =>
              onChange({ n_rounds: clampInt(event.target.value, MIN_ROUNDS, MAX_ROUNDS, 8) })
            }
          />
        </label>
        <label>
          <span>Segundos por pregunta (4-30)</span>
          <input
            type="number"
            min={MIN_TIME_LIMIT_S}
            max={MAX_TIME_LIMIT_S}
            value={timeLimitS}
            onChange={(event) =>
              onChange({ time_limit_s: clampInt(event.target.value, MIN_TIME_LIMIT_S, MAX_TIME_LIMIT_S, 12) })
            }
          />
        </label>
        <div className="wtp-ed-total">
          ⏱️ Duración mínima aproximada: {nRounds} rondas × {timeLimitS}s = {totalSeconds}s (
          {Math.round((totalSeconds / 60) * 10) / 10} min)
        </div>
      </div>

      <div className="wtp-ed-questions">
        {questions.map((question, index) => (
          <div className="wtp-ed-question" key={index}>
            <div className="wtp-ed-toprow">
              <b>Pregunta {index + 1}</b>
              <button
                type="button"
                className="wtp-ed-remove"
                disabled={questions.length <= MIN_QUESTIONS}
                onClick={() => removeQuestion(index)}
              >
                Quitar
              </button>
            </div>

            <label>
              <span>Texto de la pregunta</span>
              <textarea
                value={question.question}
                maxLength={300}
                placeholder="p.ej. ¿Cuál de estas NO es una forma de decir que algo es imposible?"
                onChange={(event) => updateQuestion(index, { question: event.target.value })}
              />
            </label>

            <div className="wtp-ed-options">
              {question.options.map((option, optionIndex) => (
                <div className="wtp-ed-option" key={optionIndex}>
                  <input
                    type="radio"
                    name={`wtp-correct-${index}`}
                    checked={question.correct_index === optionIndex}
                    onChange={() => updateQuestion(index, { correct_index: optionIndex })}
                    title="Marca la opción correcta"
                  />
                  <input
                    type="text"
                    maxLength={120}
                    value={option}
                    placeholder={`Opción ${optionIndex + 1}`}
                    onChange={(event) => updateOption(index, optionIndex, event.target.value)}
                  />
                </div>
              ))}
            </div>

            <label>
              <span>Explicación (opcional, se muestra tras responder)</span>
              <textarea
                value={question.explanation}
                maxLength={400}
                placeholder="p.ej. Pan comido significa fácil, no imposible."
                onChange={(event) => updateQuestion(index, { explanation: event.target.value })}
              />
            </label>
          </div>
        ))}

        <button type="button" className="wtp-ed-add" disabled={questions.length >= MAX_QUESTIONS} onClick={addQuestion}>
          + Añadir pregunta {questions.length >= MAX_QUESTIONS ? '(máximo 40)' : ''}
        </button>
      </div>

      <div className="wtp-ed-note">
        Mínimo 4 preguntas en el banco. La opción correcta nunca se guarda en claro en el móvil del
        jugador: el servidor sustituye la respuesta por un hash antes de enviarla, y cada jugador recibe
        solo las rondas que le tocan (nunca el banco completo).
      </div>
    </div>
  )
}

export default TrampaPalabrasEditor
