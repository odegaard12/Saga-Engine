import {
  useMemo,
  useState,
  type ChangeEvent,
} from 'react'

type Props = {
  config: Record<string, unknown>
  onChange: (
    values: Record<string, unknown>,
  ) => void
}

const MAX_IMAGE_LENGTH = 520_000

const CSS = `
.pme,
.pme * {
  box-sizing: border-box;
}

.pme {
  display: grid;
  gap: 16px;
  padding: 17px;
  border: 1px solid rgba(15,23,42,.10);
  border-radius: 20px;
  background:
    radial-gradient(
      circle at 100% 0,
      rgba(34,197,94,.11),
      transparent 31%
    ),
    #f8fafc;
  color: #172033;
}

.pme-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.pme-head h4 {
  margin: 0;
  font-size: 20px;
  letter-spacing: -.03em;
}

.pme-head p {
  max-width: 65ch;
  margin: 5px 0 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.45;
}

.pme-status {
  flex: 0 0 auto;
  padding: 7px 10px;
  border-radius: 999px;
  background: #fee2e2;
  color: #991b1b;
  font-size: 11px;
  font-weight: 900;
}

.pme-status.ok {
  background: #dcfce7;
  color: #166534;
}

.pme-status.warn {
  background: #fef3c7;
  color: #92400e;
}

.pme-layout {
  display: grid;
  grid-template-columns:
    minmax(270px,.9fr)
    minmax(310px,1.1fr);
  gap: 15px;
  align-items: start;
}

.pme-card {
  display: grid;
  gap: 12px;
  padding: 13px;
  border: 1px solid #dbe2ea;
  border-radius: 17px;
  background: rgba(255,255,255,.92);
}

.pme-card h5 {
  margin: 0;
  font-size: 14px;
}

.pme-photo,
.pme-board,
.pme-empty {
  width: 100%;
  overflow: hidden;
  border-radius: 15px;
  background: #111315;
  aspect-ratio: 1;
}

.pme-photo img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pme-file-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 10px;
  border: 1px solid #bbf7d0;
  border-radius: 11px;
  background: #f0fdf4;
  color: #166534;
  font-size: 11px;
  font-weight: 850;
}

.pme-file-meta b {
  flex: 0 0 auto;
  color: #14532d;
}

.pme-empty {
  display: grid;
  place-items: center;
  padding: 28px;
  color: rgba(244,244,245,.58);
  font-size: 13px;
  line-height: 1.45;
  text-align: center;
}

.pme-board {
  display: grid;
  gap: 3px;
  padding: 3px;
}

.pme-piece {
  min-width: 0;
  min-height: 0;
  border-radius: 4px;
  background-repeat: no-repeat;
  box-shadow:
    inset 0 0 0 1px
    rgba(255,255,255,.24);
}

.pme-upload {
  min-height: 52px;
  display: grid;
  place-items: center;
  padding: 11px;
  border: 1px dashed #94a3b8;
  border-radius: 13px;
  background: #f1f5f9;
  color: #334155;
  font-size: 12px;
  font-weight: 900;
  text-align: center;
  cursor: pointer;
}

.pme-upload small {
  display: block;
  margin-top: 4px;
  color: #64748b;
  font-weight: 650;
}

.pme-upload input {
  display: none;
}

.pme label {
  display: grid;
  gap: 6px;
  color: #334155;
  font-size: 12px;
  font-weight: 850;
}

.pme input,
.pme select,
.pme textarea {
  width: 100%;
  min-height: 43px;
  padding: 9px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 11px;
  background: #fff;
  color: #172033;
  font: inherit;
  font-weight: 650;
}

.pme textarea {
  min-height: 74px;
  resize: vertical;
}

.pme-grid-controls {
  display: grid;
  grid-template-columns:
    repeat(2,minmax(0,1fr));
  gap: 10px;
}

.pme-wide {
  grid-column: 1 / -1;
}

.pme-sizes {
  display: grid;
  grid-template-columns:
    repeat(3,minmax(0,1fr));
  gap: 7px;
}

.pme button {
  min-height: 41px;
  padding: 8px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 11px;
  background: #fff;
  color: #475569;
  font: inherit;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}

.pme button.active,
.pme button.primary {
  border-color: #166534;
  background: #166534;
  color: #fff;
}

.pme button.danger {
  color: #b91c1c;
}

.pme-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.pme-toggle {
  display: flex !important;
  align-items: center;
  gap: 9px;
  padding: 10px;
  border: 1px solid #dbe2ea;
  border-radius: 12px;
  background: #f8fafc;
}

.pme-toggle input {
  width: 18px;
  min-height: 18px;
  margin: 0;
}

.pme-question {
  display: grid;
  gap: 9px;
  padding-top: 12px;
  border-top: 1px solid #e2e8f0;
}

.pme-answer {
  display: grid;
  grid-template-columns:
    22px minmax(0,1fr) auto;
  gap: 7px;
  align-items: center;
}

.pme-answer input[type="radio"] {
  width: 17px;
  min-height: 17px;
  margin: 0;
}

.pme-note {
  padding: 11px 12px;
  border-left: 3px solid #22c55e;
  border-radius: 5px 12px 12px 5px;
  background: #ecfdf5;
  color: #166534;
  font-size: 12px;
  line-height: 1.45;
}

.pme-message {
  min-height: 18px;
  color: #b45309;
  font-size: 12px;
  font-weight: 850;
}

@media (max-width: 840px) {
  .pme-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 520px) {
  .pme {
    padding: 12px;
  }

  .pme-head {
    display: grid;
  }

  .pme-status {
    justify-self: start;
  }

  .pme-grid-controls {
    grid-template-columns: 1fr;
  }

  .pme-wide {
    grid-column: 1;
  }
}
`

function clampInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(value)

  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.max(
    minimum,
    Math.min(
      maximum,
      Math.round(parsed),
    ),
  )
}

function validImage(value: unknown) {
  const image = String(value || '').trim()

  return (
    image.length <= 600_000 &&
    (
      image.startsWith(
        'data:image/jpeg;base64,',
      ) ||
      image.startsWith(
        'data:image/png;base64,',
      ) ||
      image.startsWith(
        'data:image/webp;base64,',
      )
    )
  )
}

function dataUrlBytes(
  value: string,
) {
  const separator =
    value.indexOf(',')

  if (separator < 0) return 0

  const encoded =
    value.slice(separator + 1)

  const padding =
    encoded.endsWith('==')
      ? 2
      : encoded.endsWith('=')
        ? 1
        : 0

  return Math.max(
    0,
    Math.floor(
      encoded.length * .75,
    ) - padding,
  )
}

function answerChoices(value: unknown) {
  const items = Array.isArray(value)
    ? value
        .map((item) => String(item))
        .slice(0, 4)
    : []

  if (items.length >= 2) {
    return items
  }

  return [
    'Puerta',
    'Escudo',
    'Campana',
  ]
}

function fileDataUrl(
  file: File,
): Promise<string> {
  return new Promise(
    (resolve, reject) => {
      const reader = new FileReader()

      reader.onerror = () =>
        reject(
          new Error(
            'No se pudo leer la imagen.',
          ),
        )

      reader.onload = () =>
        resolve(
          String(reader.result || ''),
        )

      reader.readAsDataURL(file)
    },
  )
}

function loadImage(
  source: string,
): Promise<HTMLImageElement> {
  return new Promise(
    (resolve, reject) => {
      const image = new Image()

      image.onerror = () =>
        reject(
          new Error(
            'No se pudo procesar la imagen.',
          ),
        )

      image.onload = () =>
        resolve(image)

      image.src = source
    },
  )
}

function squareImage(
  image: HTMLImageElement,
  side: number,
  mime: 'image/webp' | 'image/jpeg',
  quality: number,
) {
  const canvas =
    document.createElement('canvas')

  canvas.width = side
  canvas.height = side

  const context =
    canvas.getContext('2d')

  if (!context) {
    throw new Error(
      'Canvas no disponible.',
    )
  }

  context.fillStyle = '#111315'
  context.fillRect(0, 0, side, side)

  const scale = Math.max(
    side / image.width,
    side / image.height,
  )

  const width = image.width * scale
  const height = image.height * scale

  context.drawImage(
    image,
    (side - width) / 2,
    (side - height) / 2,
    width,
    height,
  )

  return canvas.toDataURL(
    mime,
    quality,
  )
}

async function compressImage(
  file: File,
) {
  if (
    ![
      'image/jpeg',
      'image/png',
      'image/webp',
    ].includes(file.type)
  ) {
    throw new Error(
      'Usa una fotografía JPG, PNG o WebP.',
    )
  }

  const source =
    await fileDataUrl(file)

  const image =
    await loadImage(source)

  const attempts: Array<[
    number,
    'image/webp' | 'image/jpeg',
    number,
  ]> = [
    [640, 'image/webp', .80],
    [560, 'image/webp', .74],
    [512, 'image/jpeg', .72],
    [448, 'image/jpeg', .66],
  ]

  for (
    const [side, mime, quality]
    of attempts
  ) {
    const output = squareImage(
      image,
      side,
      mime,
      quality,
    )

    const mimeSupported =
      mime !== 'image/webp' ||
      output.startsWith(
        'data:image/webp',
      )

    if (
      mimeSupported &&
      output.length <= MAX_IMAGE_LENGTH
    ) {
      return output
    }
  }

  throw new Error(
    'La imagen sigue siendo demasiado grande.',
  )
}

export default function PlaceMosaicEditor({
  config,
  onChange,
}: Props) {
  const [message, setMessage] =
    useState('')

  const imageData = String(
    config.image_data_url || '',
  )

  const hasImage =
    validImage(imageData)

  const imageKilobytes =
    hasImage
      ? Math.max(
          1,
          Math.round(
            dataUrlBytes(imageData) /
            1024,
          ),
        )
      : 0

  const gridSize = clampInteger(
    config.grid_size,
    3,
    2,
    4,
  )

  const configuredPreviewMs = clampInteger(
    config.preview_ms,
    5000,
    0,
    6000,
  )

  const previewMs =
    configuredPreviewMs <= 0
      ? 0
      : configuredPreviewMs <= 2500
        ? 5000
        : Math.max(
            4000,
            configuredPreviewMs,
          )

  const maxMoves = clampInteger(
    config.max_moves,
    0,
    0,
    500,
  )

  const requireQuestion =
    config.require_final_question === true

  const choices = useMemo(
    () => answerChoices(
      config.final_choices,
    ),
    [config.final_choices],
  )

  const correctIndex = clampInteger(
    config.final_correct_index,
    0,
    0,
    choices.length - 1,
  )

  const question = String(
    config.final_question || '',
  )

  const questionValid =
    !requireQuestion ||
    (
      question.trim().length >= 3 &&
      choices.length >= 2 &&
      choices.every(
        (item) =>
          item.trim().length > 0,
      )
    )

  const configReady =
    hasImage && questionValid

  const statusText =
    !hasImage
      ? 'Falta la fotografía'
      : !questionValid
        ? 'Revisa la pregunta'
        : 'Listo para guardar'

  async function handleImage(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const input = event.currentTarget
    const file = input.files?.[0]

    if (!file) return

    setMessage(
      'Preparando la fotografía…',
    )

    try {
      const nextImage =
        await compressImage(file)

      onChange({
        objective: 'image_mosaic',
        game_id: 'place_mosaic',
        completion_method: 'puzzle',
        image_data_url: nextImage,
        image_alt:
          String(
            config.image_alt ||
            file.name.replace(
              /\.[^.]+$/,
              '',
            ),
          ).slice(0, 120),
        grid_size: gridSize,
        grid_cols: gridSize,
        grid_rows: gridSize,
      })

      setMessage(
        'Fotografía preparada. Guarda el nodo.',
      )
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo preparar la imagen.',
      )
    } finally {
      input.value = ''
    }
  }

  function updateChoices(
    next: string[],
    nextCorrect = correctIndex,
  ) {
    const normalized =
      next.slice(0, 4)

    onChange({
      final_choices: normalized,
      final_correct_index:
        Math.max(
          0,
          Math.min(
            normalized.length - 1,
            nextCorrect,
          ),
        ),
    })
  }

  return (
    <section
      className="pme"
      aria-label="Editor de Mosaico del lugar"
    >
      <style>{CSS}</style>

      <header className="pme-head">
        <div>
          <h4>Mosaico del lugar</h4>

          <p>
            Sube una fotografía del punto real.
            Se recorta, comprime y guarda dentro
            de la misión para jugar sin conexión.
          </p>
        </div>

        <span
          className={[
            'pme-status',
            configReady
              ? 'ok'
              : hasImage
                ? 'warn'
                : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {statusText}
        </span>
      </header>

      <div className="pme-layout">
        <article className="pme-card">
          <h5>Fotografía del lugar</h5>

          {hasImage ? (
            <div className="pme-photo">
              <img
                src={imageData}
                alt={String(
                  config.image_alt ||
                  'Fotografía del reto',
                )}
              />
            </div>
          ) : (
            <div className="pme-empty">
              Usa una fotografía clara del
              molino, estatua, fachada,
              grabado o detalle que el jugador
              pueda observar en el lugar real.
            </div>
          )}

          {hasImage ? (
            <div className="pme-file-meta">
              <span>
                ✓ Lista para modo offline
              </span>

              <b>{imageKilobytes} KB</b>
            </div>
          ) : null}

          <label className="pme-upload">
            {hasImage
              ? 'Cambiar fotografía'
              : 'Subir fotografía'}

            <small>
              JPG, PNG o WebP. Se comprime
              automáticamente.
            </small>

            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) =>
                void handleImage(event)
              }
            />
          </label>

          {hasImage ? (
            <button
              type="button"
              className="danger"
              onClick={() => {
                onChange({
                  image_data_url: '',
                })

                setMessage(
                  'Fotografía eliminada.',
                )
              }}
            >
              Quitar fotografía
            </button>
          ) : null}

          <label>
            Descripción de la imagen
            <input
              value={String(
                config.image_alt || '',
              )}
              maxLength={120}
              placeholder="Ejemplo: Fachada del molino"
              onChange={(event) =>
                onChange({
                  image_alt:
                    event.target.value,
                })
              }
            />
          </label>
        </article>

        <article className="pme-card">
          <h5>Vista previa del mosaico</h5>

          {hasImage ? (
            <div
              className="pme-board"
              style={{
                gridTemplateColumns:
                  `repeat(${gridSize}, minmax(0, 1fr))`,
              }}
            >
              {Array.from(
                {
                  length:
                    gridSize * gridSize,
                },
                (_, index) => {
                  const row =
                    Math.floor(
                      index / gridSize,
                    )

                  const col =
                    index % gridSize

                  const x =
                    gridSize <= 1
                      ? 0
                      : (
                          col /
                          (gridSize - 1)
                        ) * 100

                  const y =
                    gridSize <= 1
                      ? 0
                      : (
                          row /
                          (gridSize - 1)
                        ) * 100

                  return (
                    <div
                      key={index}
                      className="pme-piece"
                      style={{
                        backgroundImage:
                          `url("${imageData}")`,
                        backgroundSize:
                          `${gridSize * 100}% ${gridSize * 100}%`,
                        backgroundPosition:
                          `${x}% ${y}%`,
                      }}
                    />
                  )
                },
              )}
            </div>
          ) : (
            <div className="pme-empty">
              La cuadrícula aparecerá
              al subir una fotografía.
            </div>
          )}

          <div className="pme-grid-controls">
            <label className="pme-wide">
              Tamaño del tablero

              <div className="pme-sizes">
                {[2, 3, 4].map(
                  (size) => (
                    <button
                      key={size}
                      type="button"
                      className={
                        gridSize === size
                          ? 'active'
                          : ''
                      }
                      onClick={() =>
                        onChange({
                          grid_size: size,
                          grid_cols: size,
                          grid_rows: size,
                        })
                      }
                    >
                      {size} × {size}
                    </button>
                  ),
                )}
              </div>
            </label>

            <label>
              Tiempo para observar la imagen
              <select
                value={previewMs}
                onChange={(event) =>
                  onChange({
                    preview_ms:
                      Number(
                        event.target.value,
                      ),
                  })
                }
              >
                <option value={0}>
                  No mostrar
                </option>

                <option value={4000}>
                  4 segundos
                </option>

                <option value={5000}>
                  5 segundos · recomendado
                </option>

                <option value={6000}>
                  6 segundos
                </option>
              </select>

              <small>
                La imagen inicial nunca durará
                menos de cuatro segundos.
              </small>
            </label>

            <label>
              Límite de movimientos
              <input
                type="number"
                min={0}
                max={500}
                value={maxMoves}
                onChange={(event) =>
                  onChange({
                    max_moves:
                      clampInteger(
                        event.target.value,
                        0,
                        0,
                        500,
                      ),
                  })
                }
              />

              <small>
                0 significa sin límite.
              </small>
            </label>
          </div>

          <label className="pme-toggle">
            <input
              type="checkbox"
              checked={requireQuestion}
              onChange={(event) =>
                onChange({
                  require_final_question:
                    event.target.checked,
                  final_question:
                    question ||
                    '¿Qué detalle aparece en el lugar real?',
                  final_choices: choices,
                  final_correct_index:
                    correctIndex,
                })
              }
            />

            Añadir una pregunta final
            sobre el lugar real
          </label>

          {requireQuestion ? (
            <div className="pme-question">
              <label>
                Pregunta final
                <textarea
                  value={question}
                  maxLength={180}
                  placeholder="¿Qué símbolo aparece sobre la puerta?"
                  onChange={(event) =>
                    onChange({
                      final_question:
                        event.target.value,
                    })
                  }
                />
              </label>

              <strong>
                Marca la respuesta correcta
              </strong>

              {choices.map(
                (choice, index) => (
                  <div
                    className="pme-answer"
                    key={`mosaic-answer-${index}`}
                  >
                    <input
                      type="radio"
                      name="mosaic-correct-answer"
                      checked={
                        correctIndex === index
                      }
                      aria-label={
                        `Respuesta correcta ${index + 1}`
                      }
                      onChange={() =>
                        onChange({
                          final_correct_index:
                            index,
                        })
                      }
                    />

                    <input
                      value={choice}
                      maxLength={60}
                      placeholder={
                        `Respuesta ${index + 1}`
                      }
                      onChange={(event) => {
                        const next = [
                          ...choices,
                        ]

                        next[index] =
                          event.target.value

                        updateChoices(next)
                      }}
                    />

                    <button
                      type="button"
                      className="danger"
                      disabled={
                        choices.length <= 2
                      }
                      onClick={() => {
                        const next =
                          choices.filter(
                            (_, itemIndex) =>
                              itemIndex !== index,
                          )

                        const nextCorrect =
                          correctIndex === index
                            ? 0
                            : correctIndex > index
                              ? correctIndex - 1
                              : correctIndex

                        updateChoices(
                          next,
                          nextCorrect,
                        )
                      }}
                    >
                      Quitar
                    </button>
                  </div>
                ),
              )}

              <div className="pme-actions">
                <button
                  type="button"
                  disabled={
                    choices.length >= 4
                  }
                  onClick={() =>
                    updateChoices([
                      ...choices,
                      `Opción ${choices.length + 1}`,
                    ])
                  }
                >
                  Añadir respuesta
                </button>
              </div>
            </div>
          ) : null}

          <div
            className="pme-message"
            aria-live="polite"
          >
            {message}
          </div>
        </article>
      </div>

      <div className="pme-note">
        En el móvil se mezclan las piezas.
        El jugador toca dos piezas para
        intercambiarlas. Cuando reconstruye
        la fotografía, completa la pregunta
        final si está activada.
      </div>
    </section>
  )
}
