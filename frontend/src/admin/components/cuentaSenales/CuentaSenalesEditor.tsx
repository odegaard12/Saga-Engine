/**
 * Editor de "Cuenta las señales" (owner-approved).
 *
 * game_id dentro de la familia signal_hunt (ver
 * frontend/src/player/minigames/families/signalHunt/CuentaSenalesRuntimeScreen.tsx):
 * el jugador tiene que estar en el punto real (entry_mode gps,
 * require_proximity true, igual que un checkpoint) y contar algo que ve
 * desde ahí -bancos, ventanas, farolas...- y teclear el número.
 *
 * El servidor NUNCA manda la lista completa ni la respuesta en claro a un
 * jugador: aquí, en admin, sí se edita en claro (es el organizador quien
 * cuenta primero, al recorrer la ruta) porque esta pantalla solo la ve
 * quien organiza. `project_cuenta_senales_for_player` (minigames.py) es
 * quien recorta a UNA pregunta por jugador y sustituye la respuesta por su
 * hash justo antes de que el payload salga hacia el móvil.
 */

type Question = {
  question: string
  answer: number
  tolerance: number
  hint_image_data_url: string
}

type Props = {
  config: Record<string, unknown>
  onChange: (values: Record<string, unknown>) => void
}

const MIN_QUESTIONS = 2
const MAX_QUESTIONS = 5

const CSS = `
.csn,.csn *{box-sizing:border-box}
.csn{display:grid;gap:15px;padding:17px;border:1px solid rgba(15,23,42,.1);border-radius:20px;background:radial-gradient(circle at 100% 0,rgba(56,189,248,.14),transparent 32%),#f8fafc;color:#172033}
.csn-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}
.csn-head h4{margin:0;font-size:21px;letter-spacing:-.035em}
.csn-head p{max-width:66ch;margin:5px 0 0;color:#64748b;font-size:13px;line-height:1.45}
.csn-badge{padding:7px 10px;border-radius:999px;background:#e0f2fe;color:#0369a1;font-size:11px;font-weight:900;white-space:nowrap}
.csn-guide{padding:11px;border:1px solid #fde68a;border-radius:13px;background:#fffbeb;color:#92400e;font-size:12px;font-weight:700;line-height:1.45}
.csn-questions{display:grid;gap:12px}
.csn-question{display:grid;gap:10px;padding:14px;border:1px solid #dbe2ea;border-radius:14px;background:rgba(255,255,255,.94)}
.csn-question label{display:grid;gap:6px;color:#334155;font-size:12px;font-weight:850}
.csn-question input,.csn-question textarea{width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:11px;background:#fff;color:#172033;font:inherit}
.csn-question textarea{min-height:44px;resize:vertical}
.csn-row{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px}
.csn-toprow{display:flex;justify-content:space-between;align-items:center}
.csn-toprow b{font-size:13px;color:#0369a1}
.csn-remove{min-height:38px;padding:0 12px;border:1px solid #fecaca;border-radius:11px;background:#fef2f2;color:#b91c1c;font-weight:800;cursor:pointer}
.csn-remove:disabled{opacity:.4;cursor:not-allowed}
.csn-add{justify-self:start;padding:9px 14px;border:1px dashed #7dd3fc;border-radius:11px;background:#f0f9ff;color:#0369a1;font-weight:800;cursor:pointer}
.csn-add:disabled{opacity:.4;cursor:not-allowed}
.csn-preview{max-width:140px;margin-top:6px;border-radius:8px}
.csn-note{padding:11px;border:1px solid #bae6fd;border-radius:13px;background:#f0f9ff;color:#0369a1;font-size:12px;line-height:1.45}
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
    .map((item) => ({
      question: String(item.question ?? '').slice(0, 240),
      answer: clampInt(item.answer, 0, 999, 0),
      tolerance: clampInt(item.tolerance, 0, 20, 0),
      hint_image_data_url: String(item.hint_image_data_url ?? ''),
    }))

  while (questions.length < MIN_QUESTIONS) {
    questions.push({
      question: '',
      answer: 0,
      tolerance: 0,
      hint_image_data_url: '',
    })
  }

  return questions
}

export function CuentaSenalesEditor({ config, onChange }: Props) {
  const questions = readQuestions(config)

  const updateQuestions = (next: Question[]) => onChange({ questions: next })

  const updateQuestion = (index: number, patch: Partial<Question>) => {
    const next = questions.map((question, i) => (i === index ? { ...question, ...patch } : question))
    updateQuestions(next)
  }

  const addQuestion = () => {
    if (questions.length >= MAX_QUESTIONS) return
    updateQuestions([...questions, { question: '', answer: 0, tolerance: 0, hint_image_data_url: '' }])
  }

  const removeQuestion = (index: number) => {
    if (questions.length <= MIN_QUESTIONS) return
    updateQuestions(questions.filter((_, i) => i !== index))
  }

  const handlePhoto = (index: number, file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => updateQuestion(index, { hint_image_data_url: String(reader.result || '') })
    reader.readAsDataURL(file)
  }

  return (
    <div className="csn">
      <style>{CSS}</style>

      <div className="csn-head">
        <div>
          <h4>🔢 Cuenta las señales</h4>
          <p>
            El jugador tiene que estar en el punto real para ver la pregunta (llega igual que a un
            checkpoint) y contar algo que se ve desde ahí: bancos, ventanas, farolas... Escribe entre
            2 y 5 preguntas; cada jugador recibe SOLO una, siempre la misma, para que no se puedan
            pasar la respuesta entre ellos.
          </p>
        </div>
        <span className="csn-badge">Llegar y escanear</span>
      </div>

      <div className="csn-guide">
        📏 Escríbelas recorriendo la ruta: cuenta tú primero lo que ve el jugador desde el nodo.
      </div>

      <div className="csn-questions">
        {questions.map((question, index) => (
          <div className="csn-question" key={index}>
            <div className="csn-toprow">
              <b>Pregunta {index + 1}</b>
              <button
                type="button"
                className="csn-remove"
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
                maxLength={240}
                placeholder="p.ej. ¿Cuántos bancos hay alrededor del cruceiro?"
                onChange={(event) => updateQuestion(index, { question: event.target.value })}
              />
            </label>

            <div className="csn-row">
              <label>
                <span>Respuesta correcta</span>
                <input
                  type="number"
                  min={0}
                  max={999}
                  value={question.answer}
                  onChange={(event) => updateQuestion(index, { answer: clampInt(event.target.value, 0, 999, 0) })}
                />
              </label>
              <label>
                <span>Tolerancia ±</span>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={question.tolerance}
                  onChange={(event) =>
                    updateQuestion(index, { tolerance: clampInt(event.target.value, 0, 20, 0) })
                  }
                />
              </label>
              <label>
                <span>Foto de pista (opcional)</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => handlePhoto(index, event.target.files?.[0])}
                />
              </label>
            </div>

            {question.hint_image_data_url ? (
              <img className="csn-preview" src={question.hint_image_data_url} alt={`Pista de la pregunta ${index + 1}`} />
            ) : null}
          </div>
        ))}

        <button type="button" className="csn-add" disabled={questions.length >= MAX_QUESTIONS} onClick={addQuestion}>
          + Añadir pregunta {questions.length >= MAX_QUESTIONS ? '(máximo 5)' : ''}
        </button>
      </div>

      <div className="csn-note">
        2-5 preguntas, mínimo 2. La respuesta nunca se guarda en claro en el móvil del jugador: el
        servidor sustituye la respuesta por un hash antes de enviarla, y cada jugador recibe solo su
        pregunta asignada.
      </div>
    </div>
  )
}

export default CuentaSenalesEditor
