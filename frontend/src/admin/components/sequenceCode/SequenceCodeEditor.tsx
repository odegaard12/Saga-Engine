type Props = {
  config: Record<string, unknown>
  onChange: (values: Record<string, unknown>) => void
}

const STYLES = `
.sce,
.sce * {
  box-sizing: border-box;
}

.sce {
  display: grid;
  gap: 13px;
  width: 100%;
  padding: 15px;
  border: 1px solid rgba(255,255,255,.09);
  border-radius: 18px;
  background: #151719;
  color: #f4f4f5;
}

.sce-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.sce-head h4 {
  margin: 0;
  font-size: 17px;
}

.sce-head p {
  margin: 4px 0 0;
  color: rgba(244,244,245,.62);
  font-size: 12px;
  line-height: 1.35;
}

.sce-status {
  flex: 0 0 auto;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(104,223,138,.1);
  border: 1px solid rgba(104,223,138,.25);
  color: #9cf1b3;
  font-size: 11px;
  font-weight: 900;
}

.sce-status.bad {
  color: #ffc08a;
  border-color: rgba(239,161,92,.3);
  background: rgba(239,161,92,.1);
}

.sce-list {
  display: grid;
  gap: 7px;
}

.sce-row {
  display: grid;
  grid-template-columns: 30px minmax(0,1fr) auto;
  gap: 7px;
  align-items: center;
}

.sce-order {
  display: grid;
  place-items: center;
  width: 30px;
  height: 34px;
  border-radius: 9px;
  background: #26292d;
  color: #9cf1b3;
  font-size: 12px;
  font-weight: 950;
}

.sce-row input,
.sce-settings input,
.sce-settings textarea {
  width: 100%;
  min-height: 36px;
  padding: 7px 9px;
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 10px;
  background: #24272b;
  color: #f4f4f5;
}

.sce-settings textarea {
  min-height: 68px;
  resize: vertical;
}

.sce-actions,
.sce-row-actions {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.sce button {
  min-height: 34px;
  padding: 6px 10px;
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 10px;
  background: #292d31;
  color: #f4f4f5;
  font-weight: 850;
  cursor: pointer;
}

.sce button.primary {
  border-color: transparent;
  background: #68df8a;
  color: #102416;
}

.sce button.danger {
  color: #ffbf9b;
}

.sce button:disabled {
  opacity: .4;
  cursor: default;
}

.sce-settings {
  display: grid;
  grid-template-columns: minmax(150px,.45fr) minmax(240px,1fr);
  gap: 10px;
}

.sce-settings label {
  display: grid;
  gap: 5px;
  color: rgba(244,244,245,.72);
  font-size: 11px;
  font-weight: 850;
}

.sce-help {
  padding: 11px;
  border-radius: 12px;
  background: rgba(104,223,138,.07);
  color: rgba(244,244,245,.68);
  font-size: 11px;
  line-height: 1.4;
}

@media(max-width:720px) {
  .sce-head {
    display: grid;
  }

  .sce-status {
    justify-self: start;
  }

  .sce-row {
    grid-template-columns: 28px minmax(0,1fr);
  }

  .sce-row-actions {
    grid-column: 2;
  }

  .sce-settings {
    grid-template-columns: 1fr;
  }
}
`

function clamp(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
) {
  const parsed = Number(value)

  if (!Number.isFinite(parsed)) return fallback

  return Math.max(
    minimum,
    Math.min(maximum, Math.round(parsed)),
  )
}

function sequenceOf(value: unknown) {
  if (!Array.isArray(value)) {
    return ['ROBLE', 'CAMPANA', 'PUENTE', 'TORRE']
  }

  return value
    .slice(0, 10)
    .map((item) => String(item))
}

function validationMessage(sequence: string[]) {
  const normalized = sequence.map((item) => item.trim())

  if (normalized.length < 3) {
    return 'Añade al menos tres fichas.'
  }

  if (normalized.length > 10) {
    return 'No puede haber más de diez fichas.'
  }

  if (normalized.some((item) => !item)) {
    return 'No puede haber fichas vacías.'
  }

  if (normalized.some((item) => item.length > 32)) {
    return 'Cada ficha puede tener un máximo de 32 caracteres.'
  }

  const unique = new Set(
    normalized.map((item) => item.toLocaleLowerCase()),
  )

  if (unique.size !== normalized.length) {
    return 'Las fichas deben ser diferentes.'
  }

  return ''
}

export default function SequenceCodeEditor({
  config,
  onChange,
}: Props) {
  const sequence = sequenceOf(config.sequence)

  const maxAttempts = clamp(
    config.max_attempts,
    1,
    8,
    3,
  )

  const hintText = String(
    config.hint_text ?? '',
  )

  const error = validationMessage(sequence)

  const patch = (
    values: Record<string, unknown>,
  ) => {
    onChange({
      game_id: 'sequence_code',
      objective: 'sequence_order',
      completion_method: 'sequence',
      difficulty: 'normal',
      ...values,
    })
  }

  const updateToken = (
    index: number,
    value: string,
  ) => {
    const next = [...sequence]
    next[index] = value

    patch({
      sequence: next,
    })
  }

  const moveToken = (
    index: number,
    direction: -1 | 1,
  ) => {
    const target = index + direction

    if (
      target < 0 ||
      target >= sequence.length
    ) {
      return
    }

    const next = [...sequence]
    const current = next[index]

    next[index] = next[target]
    next[target] = current

    patch({
      sequence: next,
    })
  }

  const removeToken = (index: number) => {
    patch({
      sequence: sequence.filter(
        (_, tokenIndex) => tokenIndex !== index,
      ),
    })
  }

  return (
    <section className="sce">
      <style>{STYLES}</style>

      <div className="sce-head">
        <div>
          <h4>Solución del tríptico</h4>
          <p>
            Escribe las fichas en el orden correcto.
            El jugador las verá barajadas y deberá deducirlo
            consultando su tríptico o material de misión.
          </p>
        </div>

        <span
          className={[
            'sce-status',
            error ? 'bad' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {error || `${sequence.length} fichas · válido`}
        </span>
      </div>

      <div className="sce-list">
        {sequence.map((token, index) => (
          <div
            className="sce-row"
            key={`sequence-token-${index}`}
          >
            <span className="sce-order">
              {index + 1}
            </span>

            <input
              value={token}
              maxLength={32}
              placeholder={`Ficha ${index + 1}`}
              onChange={(event) =>
                updateToken(index, event.target.value)
              }
            />

            <div className="sce-row-actions">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => moveToken(index, -1)}
                aria-label="Subir ficha"
              >
                ↑
              </button>

              <button
                type="button"
                disabled={
                  index === sequence.length - 1
                }
                onClick={() => moveToken(index, 1)}
                aria-label="Bajar ficha"
              >
                ↓
              </button>

              <button
                type="button"
                className="danger"
                disabled={sequence.length <= 3}
                onClick={() => removeToken(index)}
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="sce-actions">
        <button
          type="button"
          className="primary"
          disabled={sequence.length >= 10}
          onClick={() =>
            patch({
              sequence: [
                ...sequence,
                `FICHA ${sequence.length + 1}`,
              ],
            })
          }
        >
          + Añadir ficha
        </button>

        <button
          type="button"
          onClick={() =>
            patch({
              sequence: ['ROBLE', 'CAMPANA', 'PUENTE', 'TORRE'],
            })
          }
        >
          Cargar ejemplo narrativo
        </button>
      </div>

      <div className="sce-settings">
        <label>
          Intentos permitidos
          <input
            type="number"
            min={1}
            max={8}
            value={maxAttempts}
            onChange={(event) =>
              patch({
                max_attempts: clamp(
                  event.target.value,
                  1,
                  8,
                  3,
                ),
              })
            }
          />
        </label>

        <label>
          Pista de ayuda tras el primer error
          <textarea
            value={hintText}
            maxLength={240}
            placeholder="Ejemplo: la campana suena antes de cruzar el puente."
            onChange={(event) =>
              patch({
                hint_text: event.target.value,
              })
            }
          />
        </label>
      </div>

      <div className="sce-help">
        Este reto conecta la historia física con el móvil.
        El tríptico contiene las relaciones entre las pistas;
        la pantalla solamente muestra las fichas barajadas y
        comprueba el orden elegido.
      </div>
    </section>
  )
}
