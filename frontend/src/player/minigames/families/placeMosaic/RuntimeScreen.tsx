import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { PlayerStage } from '../../../../types/player'
import type {
  ResolvedCircuitMatrixMinigame,
} from '../../core/resolver'

interface Props {
  resolved: ResolvedCircuitMatrixMinigame
  stage: PlayerStage
  helperText: string
  submitting: boolean
  onWin: () => Promise<void>
}

type Phase =
  | 'preview'
  | 'playing'
  | 'question'
  | 'success'
  | 'failed'

const STYLES = `
.mosaic-shell,
.mosaic-shell * {
  box-sizing: border-box;
}

.mosaic-shell {
  width: 100%;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,.09);
  border-radius: 22px;
  background:
    radial-gradient(
      circle at 50% -15%,
      rgba(34,197,94,.12),
      transparent 35%
    ),
    #111315;
  color: #f4f4f5;
}

.mosaic-body {
  display: grid;
  gap: 14px;
  padding: 16px;
}

.mosaic-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.mosaic-head h2 {
  margin: 0;
  color: #f4f4f5;
  font-size: clamp(23px,7vw,30px);
  line-height: 1.02;
  font-weight: 950;
  letter-spacing: -.04em;
}

.mosaic-head p {
  max-width: 48ch;
  margin: 6px 0 0;
  color: rgba(244,244,245,.62);
  font-size: 12px;
  line-height: 1.42;
}

.mosaic-counter {
  flex: 0 0 auto;
  min-width: 72px;
  padding: 8px 9px;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 15px;
  background: rgba(255,255,255,.045);
  text-align: right;
}

.mosaic-counter strong {
  display: block;
  color: #72df91;
  font-size: 19px;
  line-height: 1;
}

.mosaic-counter span {
  display: block;
  margin-top: 4px;
  color: rgba(244,244,245,.52);
  font-size: 9px;
  font-weight: 900;
  text-transform: uppercase;
}

.mosaic-card {
  display: grid;
  gap: 10px;
  padding: 11px;
  border: 1px solid rgba(255,255,255,.07);
  border-radius: 18px;
  background: #17191c;
}

.mosaic-board {
  display: grid;
  gap: 3px;
  width: 100%;
  padding: 3px;
  border-radius: 17px;
  background: #0b0c0d;
  aspect-ratio: 1;
}

.mosaic-tile {
  min-width: 0;
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background-color: #202327;
  background-repeat: no-repeat;
  cursor: pointer;
  box-shadow:
    inset 0 0 0 1px
    rgba(255,255,255,.18);
  transition:
    transform .12s ease,
    box-shadow .12s ease;
}

.mosaic-tile:active {
  transform: scale(.97);
}

.mosaic-tile.selected {
  position: relative;
  z-index: 2;
  transform: scale(.965);
  box-shadow:
    0 0 0 3px #72df91,
    0 0 25px rgba(114,223,145,.48);
}

.mosaic-tile.swapping {
  position: relative;
  z-index: 3;
  animation:
    mosaic-swap-pulse .16s ease
    both;
}

@keyframes mosaic-swap-pulse {
  0% {
    transform: scale(1);
    filter: brightness(1);
  }

  48% {
    transform: scale(.91);
    filter: brightness(1.32);
  }

  100% {
    transform: scale(1);
    filter: brightness(1);
  }
}

.mosaic-help {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: rgba(244,244,245,.55);
  font-size: 11px;
  line-height: 1.35;
}

.mosaic-help b {
  color: #72df91;
}

.mosaic-progress {
  display: grid;
  gap: 7px;
  padding-top: 2px;
}

.mosaic-progress-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: rgba(244,244,245,.48);
  font-size: 10px;
  font-weight: 850;
}

.mosaic-progress-head b {
  color: rgba(244,244,245,.82);
}

.mosaic-progress-track {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255,255,255,.08);
}

.mosaic-progress-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background:
    linear-gradient(
      90deg,
      #3fbf68,
      #72df91
    );
  transition: width .28s ease;
}

.mosaic-actions {
  display: grid;
  grid-template-columns:
    repeat(2,minmax(0,1fr));
  gap: 9px;
}

.mosaic-shell button {
  min-height: 45px;
  padding: 10px 12px;
  border: 1px solid rgba(255,255,255,.11);
  border-radius: 13px;
  background: #202327;
  color: #f4f4f5;
  font: inherit;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}

.mosaic-shell button.primary {
  border-color: #72df91;
  background: #72df91;
  color: #102016;
}

.mosaic-shell button:disabled {
  opacity: .45;
  cursor: not-allowed;
}

.mosaic-preview {
  position: relative;
  overflow: hidden;
  border-radius: 18px;
  background: #0b0c0d;
  aspect-ratio: 1;
}

.mosaic-preview img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.mosaic-preview-overlay {
  position: absolute;
  inset: auto 10px 10px;
  display: grid;
  gap: 7px;
  padding: 10px 12px;
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 12px;
  background: rgba(8,9,10,.82);
  backdrop-filter: blur(9px);
  color: #f4f4f5;
  font-size: 12px;
  font-weight: 850;
}

.mosaic-preview-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.mosaic-preview-meta b {
  color: #72df91;
  font-size: 11px;
  letter-spacing: .02em;
  text-transform: uppercase;
}

.mosaic-preview-meta span {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 1px solid rgba(114,223,145,.34);
  border-radius: 999px;
  background: rgba(114,223,145,.11);
  color: #bbf7d0;
  font-size: 12px;
  font-weight: 950;
}

.mosaic-preview-progress {
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255,255,255,.12);
}

.mosaic-preview-progress i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #72df91;
  transition: width .1s linear;
}

.mosaic-question {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 18px;
  background: #17191c;
}

.mosaic-question h3 {
  margin: 0;
  color: #f4f4f5;
  font-size: 20px;
  line-height: 1.15;
}

.mosaic-question p {
  margin: 0;
  color: rgba(244,244,245,.58);
  font-size: 12px;
  line-height: 1.42;
}

.mosaic-choices {
  display: grid;
  gap: 8px;
}

.mosaic-choice {
  display: grid;
  grid-template-columns:
    29px minmax(0,1fr);
  align-items: center;
  gap: 9px;
  text-align: left;
}

.mosaic-choice-index {
  display: grid;
  width: 27px;
  height: 27px;
  place-items: center;
  border-radius: 999px;
  background: rgba(255,255,255,.07);
  color: rgba(244,244,245,.68);
  font-size: 10px;
  font-weight: 950;
}

.mosaic-choice.active
.mosaic-choice-index {
  background: #72df91;
  color: #102016;
}

.mosaic-choice.active {
  border-color: #72df91;
  background: #234a30;
}

.mosaic-message {
  min-height: 18px;
  color: #f59e0b;
  font-size: 12px;
  font-weight: 850;
}

.mosaic-result {
  min-height: 390px;
  display: grid;
  place-items: center;
  padding: 24px;
}

.mosaic-result-inner {
  width: min(100%,410px);
  display: grid;
  justify-items: center;
  gap: 12px;
  text-align: center;
}

.mosaic-result-icon {
  width: 66px;
  height: 66px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: rgba(114,223,145,.15);
  color: #72df91;
  font-size: 31px;
  font-weight: 950;
}

.mosaic-result.failed
.mosaic-result-icon {
  background: rgba(245,158,11,.13);
  color: #f59e0b;
}

.mosaic-result strong {
  color: #f4f4f5;
  font-size: 25px;
  line-height: 1.08;
}

.mosaic-result p {
  max-width: 36ch;
  margin: 0;
  color: rgba(244,244,245,.60);
  font-size: 13px;
  line-height: 1.48;
}

.mosaic-result button {
  width: min(100%,290px);
}

.mosaic-result.success {
  position: relative;
  overflow: hidden;
}

.mosaic-result.success::before {
  content: "";
  position: absolute;
  inset: -45%;
  pointer-events: none;
  background:
    conic-gradient(
      from 0deg,
      transparent,
      rgba(114,223,145,.15),
      transparent 22%,
      transparent 55%,
      rgba(114,223,145,.10),
      transparent 78%
    );
  animation:
    mosaic-success-glow
    1.4s ease-out
    both;
}

.mosaic-result.success
.mosaic-result-inner {
  position: relative;
  z-index: 1;
}

@keyframes mosaic-success-glow {
  from {
    opacity: 0;
    transform: scale(.72) rotate(-18deg);
  }

  45% {
    opacity: 1;
  }

  to {
    opacity: 0;
    transform: scale(1.18) rotate(28deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .mosaic-tile,
  .mosaic-progress-track i,
  .mosaic-preview-progress i {
    transition: none;
  }

  .mosaic-tile.swapping,
  .mosaic-result.success::before {
    animation: none;
  }
}

@media (max-width: 460px) {
  .mosaic-body {
    padding: 13px;
  }

  .mosaic-actions {
    grid-template-columns: 1fr;
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

function choicesOf(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) =>
          String(item).trim(),
        )
        .filter(Boolean)
        .slice(0, 4)
    : []
}

function shuffledOrder(count: number) {
  const minimumMisplaced =
    count <= 4
      ? Math.min(3, count)
      : Math.ceil(count * .62)

  for (
    let attempt = 0;
    attempt < 18;
    attempt += 1
  ) {
    const values = Array.from(
      { length: count },
      (_, index) => index,
    )

    for (
      let index = values.length - 1;
      index > 0;
      index -= 1
    ) {
      const swapIndex =
        Math.floor(
          Math.random() * (index + 1),
        )

      ;[
        values[index],
        values[swapIndex],
      ] = [
        values[swapIndex],
        values[index],
      ]
    }

    const misplaced =
      values.reduce(
        (
          total,
          value,
          index,
        ) =>
          total +
          (
            value === index
              ? 0
              : 1
          ),
        0,
      )

    if (
      misplaced >= minimumMisplaced
    ) {
      return values
    }
  }

  return Array.from(
    { length: count },
    (_, index) =>
      (index + 1) % count,
  )
}

function solvedOrder(order: number[]) {
  return order.every(
    (value, index) =>
      value === index,
  )
}

function haptic(
  pattern: number | number[],
) {
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.vibrate === 'function'
  ) {
    navigator.vibrate(pattern)
  }
}

export function PlaceMosaicRuntimeScreen({
  resolved,
  stage,
  helperText,
  submitting,
  onWin,
}: Props) {
  const config = resolved.config

  const imageData = String(
    config.image_data_url || '',
  )

  const gridSize = clampInteger(
    config.grid_size ??
      config.grid_cols,
    3,
    2,
    4,
  )

  const totalPieces =
    gridSize * gridSize

  const previewMs = clampInteger(
    config.preview_ms,
    2500,
    0,
    6000,
  )

  const maxMoves = clampInteger(
    config.max_moves,
    0,
    0,
    500,
  )

  const requireQuestion =
    config.require_final_question === true

  const finalQuestion = String(
    config.final_question || '',
  ).trim()

  const finalChoices =
    choicesOf(config.final_choices)

  const correctIndex = clampInteger(
    config.final_correct_index,
    0,
    0,
    Math.max(
      0,
      finalChoices.length - 1,
    ),
  )

  const invalidConfig =
    !validImage(imageData) ||
    (
      requireQuestion &&
      (
        finalQuestion.length < 3 ||
        finalChoices.length < 2
      )
    )

  const [order, setOrder] =
    useState<number[]>(
      () =>
        shuffledOrder(totalPieces),
    )

  const [selected, setSelected] =
    useState<number | null>(null)

  const [moves, setMoves] =
    useState(0)

  const [phase, setPhase] =
    useState<Phase>(
      previewMs > 0
        ? 'preview'
        : 'playing',
    )

  const [answerIndex, setAnswerIndex] =
    useState<number | null>(null)

  const [message, setMessage] =
    useState('')

  const [continuing, setContinuing] =
    useState(false)

  const [previewKind, setPreviewKind] =
    useState<'intro' | 'peek'>('intro')

  const [
    previewRemainingMs,
    setPreviewRemainingMs,
  ] = useState(previewMs)

  const [swapPositions, setSwapPositions] =
    useState<number[]>([])

  const [swapping, setSwapping] =
    useState(false)

  const [celebrating, setCelebrating] =
    useState(false)

  const continueLockRef =
    useRef(false)

  const swapTimerRef =
    useRef<number | null>(null)

  const activePreviewDuration =
    previewKind === 'peek'
      ? 1400
      : previewMs

  const previewSeconds =
    Math.max(
      1,
      Math.ceil(
        previewRemainingMs / 1000,
      ),
    )

  const previewProgress =
    activePreviewDuration > 0
      ? Math.max(
          0,
          Math.min(
            100,
            (
              previewRemainingMs /
              activePreviewDuration
            ) * 100,
          ),
        )
      : 0

  const reset = useCallback(
    (showPreview = true) => {
      if (
        swapTimerRef.current !== null
      ) {
        window.clearTimeout(
          swapTimerRef.current,
        )

        swapTimerRef.current = null
      }

      setOrder(
        shuffledOrder(totalPieces),
      )
      setSelected(null)
      setMoves(0)
      setAnswerIndex(null)
      setMessage('')
      setSwapPositions([])
      setSwapping(false)
      setCelebrating(false)
      setPreviewKind('intro')
      setPreviewRemainingMs(previewMs)
      setPhase(
        showPreview && previewMs > 0
          ? 'preview'
          : 'playing',
      )
    },
    [
      previewMs,
      totalPieces,
    ],
  )

  useEffect(() => {
    reset(true)
  }, [
    imageData,
    gridSize,
    reset,
  ])

  useEffect(
    () =>
      () => {
        if (
          swapTimerRef.current !== null
        ) {
          window.clearTimeout(
            swapTimerRef.current,
          )
        }
      },
    [],
  )

  useEffect(() => {
    if (phase !== 'preview') return

    const duration =
      previewKind === 'peek'
        ? 1400
        : previewMs

    if (duration <= 0) {
      setPhase('playing')
      return
    }

    setPreviewRemainingMs(duration)

    const startedAt =
      performance.now()

    const interval =
      window.setInterval(
        () => {
          const elapsed =
            performance.now() -
            startedAt

          setPreviewRemainingMs(
            Math.max(
              0,
              duration - elapsed,
            ),
          )
        },
        100,
      )

    const timer =
      window.setTimeout(
        () => {
          setPreviewRemainingMs(0)
          setPhase('playing')
        },
        duration,
      )

    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timer)
    }
  }, [
    phase,
    previewKind,
    previewMs,
  ])

  function enterSuccess() {
    haptic([20, 35, 75])
    setCelebrating(true)
    setMessage('')
    setPhase('success')
  }

  function pressTile(position: number) {
    if (
      phase !== 'playing' ||
      swapping
    ) {
      return
    }

    if (selected === null) {
      haptic(12)
      setSelected(position)
      setMessage(
        'Pieza seleccionada. Toca otra para intercambiarlas.',
      )
      return
    }

    if (selected === position) {
      haptic(8)
      setSelected(null)
      setMessage('')
      return
    }

    const firstPosition = selected

    setSwapping(true)
    setSwapPositions([
      firstPosition,
      position,
    ])
    setMessage('')
    haptic([10, 22, 10])

    swapTimerRef.current =
      window.setTimeout(
        () => {
          const nextOrder = [...order]

          ;[
            nextOrder[firstPosition],
            nextOrder[position],
          ] = [
            nextOrder[position],
            nextOrder[firstPosition],
          ]

          const nextMoves =
            moves + 1

          setOrder(nextOrder)
          setMoves(nextMoves)
          setSelected(null)
          setSwapPositions([])
          setSwapping(false)
          swapTimerRef.current = null

          if (
            solvedOrder(nextOrder)
          ) {
            if (requireQuestion) {
              haptic([18, 28, 18])
              setPhase('question')
            } else {
              enterSuccess()
            }

            return
          }

          if (
            maxMoves > 0 &&
            nextMoves >= maxMoves
          ) {
            haptic([45, 55, 45])
            setPhase('failed')
          }
        },
        150,
      )
  }

  function checkQuestion() {
    if (
      phase !== 'question' ||
      answerIndex === null
    ) {
      return
    }

    if (
      answerIndex === correctIndex
    ) {
      enterSuccess()
      return
    }

    haptic([38, 45, 38])
    setAnswerIndex(null)
    setMessage(
      'No coincide. Observa el lugar real y prueba otra respuesta.',
    )
  }

  const continueRoute =
    useCallback(async () => {
      if (
        phase !== 'success' ||
        submitting ||
        continuing ||
        continueLockRef.current
      ) {
        return
      }

      continueLockRef.current = true
      setContinuing(true)

      try {
        await onWin()
      } catch (error) {
        continueLockRef.current = false
        setContinuing(false)
        throw error
      }
    }, [
      continuing,
      onWin,
      phase,
      submitting,
    ])

  if (invalidConfig) {
    return (
      <section
        className="mosaic-shell"
        aria-label="Mosaico del lugar"
      >
        <style>{STYLES}</style>

        <div className="mosaic-result failed">
          <div className="mosaic-result-inner">
            <div className="mosaic-result-icon">
              !
            </div>

            <strong>
              Mosaico no configurado
            </strong>

            <p>
              El administrador debe subir una
              fotografía válida y revisar la
              pregunta final.
            </p>
          </div>
        </div>
      </section>
    )
  }

  if (phase === 'preview') {
    return (
      <section
        className="mosaic-shell"
        aria-label="Vista previa del mosaico"
      >
        <style>{STYLES}</style>

        <div className="mosaic-body">
          <header className="mosaic-head">
            <div>
              <h2>Observa el lugar</h2>

              <p>
                Memoriza la fotografía antes
                de que se convierta en piezas.
              </p>
            </div>
          </header>

          <div className="mosaic-preview">
            <img
              src={imageData}
              alt={String(
                config.image_alt ||
                'Fotografía del lugar',
              )}
            />

            <div className="mosaic-preview-overlay">
              <div className="mosaic-preview-meta">
                <b>
                  {previewKind === 'peek'
                    ? 'Referencia rápida'
                    : 'Memoriza'}
                </b>

                <span>{previewSeconds}</span>
              </div>

              <div>
                {previewKind === 'peek'
                  ? 'Comprueba un detalle antes de volver al mosaico.'
                  : 'Mira las formas, los colores y los detalles principales.'}
              </div>

              <div className="mosaic-preview-progress">
                <i
                  style={{
                    width:
                      `${previewProgress}%`,
                  }}
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            className="primary"
            onClick={() => {
              setPreviewRemainingMs(0)
              setPhase('playing')
            }}
          >
            {previewKind === 'peek'
              ? 'Volver al mosaico'
              : 'Empezar ahora'}
          </button>
        </div>
      </section>
    )
  }

  if (phase === 'success') {
    return (
      <section
        className="mosaic-shell"
        aria-label="Mosaico completado"
      >
        <style>{STYLES}</style>

        <div
          className={[
            'mosaic-result',
            'success',
            celebrating
              ? 'celebrating'
              : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div className="mosaic-result-inner">
            <div className="mosaic-result-icon">
              ✓
            </div>

            <strong>
              Lugar reconstruido
            </strong>

            <p>
              Has completado el mosaico y
              reconocido correctamente el
              punto de la ruta.
            </p>

            <button
              type="button"
              className="primary"
              disabled={
                submitting ||
                continuing
              }
              onClick={() =>
                void continueRoute()
              }
            >
              {submitting || continuing
                ? 'Avanzando…'
                : 'Continuar al siguiente nodo'}
            </button>
          </div>
        </div>
      </section>
    )
  }

  if (phase === 'failed') {
    return (
      <section
        className="mosaic-shell"
        aria-label="Mosaico no completado"
      >
        <style>{STYLES}</style>

        <div className="mosaic-result failed">
          <div className="mosaic-result-inner">
            <div className="mosaic-result-icon">
              !
            </div>

            <strong>
              Sin movimientos
            </strong>

            <p>
              Se agotó el límite configurado.
              Observa de nuevo el lugar y
              vuelve a intentarlo.
            </p>

            <button
              type="button"
              onClick={() => reset(true)}
            >
              Intentarlo de nuevo
            </button>
          </div>
        </div>
      </section>
    )
  }

  if (phase === 'question') {
    return (
      <section
        className="mosaic-shell"
        aria-label="Pregunta final del mosaico"
      >
        <style>{STYLES}</style>

        <div className="mosaic-body">
          <header className="mosaic-head">
            <div>
              <h2>Comprueba el lugar</h2>

              <p>
                El mosaico está completo.
                Mira ahora el elemento real.
              </p>
            </div>
          </header>

          <section className="mosaic-question">
            <h3>{finalQuestion}</h3>

            <p>
              Selecciona la respuesta que
              puedas comprobar en el punto
              donde estás.
            </p>

            <div className="mosaic-choices">
              {finalChoices.map(
                (choice, index) => (
                  <button
                    key={`${choice}-${index}`}
                    type="button"
                    className={[
                      'mosaic-choice',
                      answerIndex === index
                        ? 'active'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => {
                      setAnswerIndex(index)
                      setMessage('')
                    }}
                  >
                    <span className="mosaic-choice-index">
                      {index + 1}
                    </span>

                    <span>{choice}</span>
                  </button>
                ),
              )}
            </div>

            <div
              className="mosaic-message"
              aria-live="polite"
            >
              {message}
            </div>

            <button
              type="button"
              className="primary"
              disabled={
                answerIndex === null
              }
              onClick={checkQuestion}
            >
              Comprobar respuesta
            </button>
          </section>
        </div>
      </section>
    )
  }

  const rawDescription = String(
    stage.content ||
    helperText ||
    '',
  ).trim()

  const description =
    rawDescription ||
    'Reconstruye la fotografía observando el lugar real.'

  const movesLeft =
    maxMoves > 0
      ? Math.max(
          0,
          maxMoves - moves,
        )
      : null

  const correctPieces =
    order.reduce(
      (
        total,
        originalPiece,
        position,
      ) =>
        total +
        (
          originalPiece === position
            ? 1
            : 0
        ),
      0,
    )

  const completionPercent =
    Math.round(
      (
        correctPieces /
        totalPieces
      ) * 100,
    )

  return (
    <section
      className="mosaic-shell"
      aria-label="Mosaico del lugar"
    >
      <style>{STYLES}</style>

      <div className="mosaic-body">
        <header className="mosaic-head">
          <div>
            <h2>Reconstruye el lugar</h2>

            <p>{description}</p>
          </div>

          <div className="mosaic-counter">
            <strong>
              {movesLeft === null
                ? moves
                : movesLeft}
            </strong>

            <span>
              {movesLeft === null
                ? 'movimientos'
                : 'restantes'}
            </span>
          </div>
        </header>

        <section className="mosaic-card">
          <div
            className="mosaic-board"
            style={{
              gridTemplateColumns:
                `repeat(${gridSize}, minmax(0, 1fr))`,
            }}
          >
            {order.map(
              (
                originalPiece,
                position,
              ) => {
                const row =
                  Math.floor(
                    originalPiece /
                    gridSize,
                  )

                const col =
                  originalPiece %
                  gridSize

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
                  <button
                    key={`position-${position}`}
                    type="button"
                    className={[
                      'mosaic-tile',
                      selected === position
                        ? 'selected'
                        : '',
                      swapPositions.includes(
                        position,
                      )
                        ? 'swapping'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-label={
                      selected === position
                        ? `Pieza ${position + 1} seleccionada`
                        : `Seleccionar pieza ${position + 1}`
                    }
                    style={{
                      backgroundImage:
                        `url("${imageData}")`,
                      backgroundSize:
                        `${gridSize * 100}% ${gridSize * 100}%`,
                      backgroundPosition:
                        `${x}% ${y}%`,
                    }}
                    disabled={swapping}
                    onClick={() =>
                      pressTile(position)
                    }
                  />
                )
              },
            )}
          </div>

          <div className="mosaic-help">
            <span>
              <b>
                {selected === null
                  ? 'Toca una pieza'
                  : 'Ahora toca otra'}
              </b>
              {' '}
              {selected === null
                ? 'para seleccionarla.'
                : 'para intercambiarlas.'}
            </span>

            <span>
              {gridSize} × {gridSize}
            </span>
          </div>

          <div
            className="mosaic-progress"
            aria-label={
              `${correctPieces} de ${totalPieces} piezas bien colocadas`
            }
          >
            <div className="mosaic-progress-head">
              <span>
                Piezas bien colocadas
              </span>

              <b>
                {correctPieces}/{totalPieces}
              </b>
            </div>

            <div className="mosaic-progress-track">
              <i
                style={{
                  width:
                    `${completionPercent}%`,
                }}
              />
            </div>
          </div>
        </section>

        <div
          className="mosaic-message"
          aria-live="polite"
        >
          {message}
        </div>

        <div className="mosaic-actions">
          <button
            type="button"
            onClick={() => reset(false)}
          >
            Mezclar de nuevo
          </button>

          <button
            type="button"
            onClick={() => {
              setSelected(null)
              setMessage('')
              setPreviewKind('peek')
              setPreviewRemainingMs(1400)
              setPhase('preview')
            }}
          >
            Ver referencia · 1,4 s
          </button>
        </div>
      </div>
    </section>
  )
}

export default PlaceMosaicRuntimeScreen
