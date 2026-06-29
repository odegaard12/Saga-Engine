import {
  useCallback,
  useEffect,
  useMemo,
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

type Phase = 'playing' | 'success' | 'failed'

const STYLES = `
.sequence-shell,
.sequence-shell * {
  box-sizing: border-box;
}

.sequence-shell {
  width: 100%;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,.09);
  border-radius: 22px;
  background:
    radial-gradient(
      circle at 50% -18%,
      rgba(34,197,94,.10),
      transparent 35%
    ),
    #111315;
  color: #f4f4f5;
}

.sequence-body {
  display: grid;
  gap: 14px;
  padding: 17px;
}

.sequence-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.sequence-kicker {
  display: none;
}

.sequence-heading h2 {
  margin: 0;
  color: #f4f4f5;
  font-size: clamp(23px,7vw,30px);
  line-height: 1.02;
  font-weight: 950;
  letter-spacing: -.04em;
}

.sequence-intro {
  max-width: 46ch;
  margin: 6px 0 0;
  color: rgba(244,244,245,.62);
  font-size: 12px;
  line-height: 1.38;
}

.sequence-attempts {
  flex: 0 0 auto;
  min-width: 69px;
  padding: 8px 9px;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 16px;
  background: rgba(255,255,255,.045);
  text-align: right;
}

.sequence-attempts strong {
  display: block;
  color: #72df91;
  font-size: 19px;
  line-height: 1;
}

.sequence-attempts span {
  display: block;
  margin-top: 4px;
  color: rgba(244,244,245,.55);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: .04em;
  text-transform: uppercase;
}

.sequence-card {
  display: grid;
  gap: 10px;
  padding: 11px;
  border: 1px solid rgba(255,255,255,.07);
  border-radius: 18px;
  background: #17191c;
}

.sequence-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 9px;
}

.sequence-section-head b {
  color: #f4f4f5;
  font-size: 12px;
  font-weight: 900;
}

.sequence-section-head span {
  color: rgba(244,244,245,.48);
  font-size: 10px;
  font-weight: 800;
}

.sequence-order-list {
  display: grid;
  grid-template-columns: repeat(2,minmax(0,1fr));
  gap: 8px;
}

.sequence-order-row {
  width: 100%;
  min-width: 0;
  min-height: 55px;
  display: grid;
  grid-template-columns: 25px minmax(0,1fr) auto;
  align-items: center;
  gap: 7px;
  padding: 8px;
  border: 1px dashed rgba(255,255,255,.10);
  border-radius: 13px;
  background: #202327;
  color: rgba(244,244,245,.38);
  text-align: left;
}

button.sequence-order-row {
  border-style: solid;
  border-color: rgba(114,223,145,.40);
  background: #234a30;
  color: #f4f4f5;
  cursor: pointer;
}

.sequence-order-row strong {
  min-width: 0;
  overflow-wrap: anywhere;
  color: inherit;
  font-size: 12px;
  line-height: 1.15;
}

.sequence-order-number {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border-radius: 999px;
  background: rgba(255,255,255,.07);
  color: rgba(244,244,245,.62);
  font-size: 10px;
  font-weight: 950;
}

button.sequence-order-row
.sequence-order-number {
  background: #68df8a;
  color: #102416;
}

.sequence-order-remove {
  font-size: 0;
}

.sequence-order-remove::after {
  content: "×";
  color: rgba(244,244,245,.65);
  font-size: 16px;
  font-weight: 900;
}

.sequence-choice-grid {
  display: grid;
  grid-template-columns: repeat(2,minmax(0,1fr));
  gap: 8px;
}

.sequence-choice {
  min-width: 0;
  min-height: 51px;
  padding: 9px 10px;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 13px;
  background: #24272b;
  color: #f4f4f5;
  font-size: 12px;
  font-weight: 950;
  overflow-wrap: anywhere;
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.035);
}

.sequence-choice:hover,
.sequence-choice:focus-visible {
  border-color: rgba(114,223,145,.55);
  background: #293d30;
  outline: none;
}

.sequence-choice:active {
  background: #234a30;
  transform: scale(.98);
}

.sequence-message {
  min-height: 18px;
  color: #efa15c;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.35;
}

.sequence-hint {
  padding: 10px 11px;
  border: 1px solid rgba(239,161,92,.20);
  border-radius: 13px;
  background: rgba(239,161,92,.09);
  color: rgba(244,244,245,.72);
  font-size: 12px;
  line-height: 1.4;
}

.sequence-hint b {
  color: #ffc08a;
}

.sequence-actions {
  display: grid;
  grid-template-columns: minmax(0,.75fr) minmax(0,1.25fr);
  gap: 8px;
}

.sequence-actions button {
  min-height: 51px;
  padding: 9px 11px;
  border: 1px solid rgba(255,255,255,.10);
  border-radius: 15px;
  background: #24272b;
  color: #f4f4f5;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}

.sequence-actions button.primary {
  border: 0;
  background: #68df8a;
  color: #102416;
}

.sequence-actions button:disabled {
  border-color: rgba(255,255,255,.05);
  background: #292c30;
  color: rgba(244,244,245,.35);
  opacity: 1;
  cursor: default;
}

.sequence-result {
  min-height: 320px;
  display: grid;
  place-items: center;
  padding: 22px 18px;
  text-align: center;
}

.sequence-result-inner {
  width: min(100%,350px);
  display: grid;
  justify-items: center;
  gap: 10px;
}

.sequence-result-icon {
  display: grid;
  width: 74px;
  height: 74px;
  place-items: center;
  border: 1px solid rgba(114,223,145,.35);
  border-radius: 999px;
  background: rgba(34,197,94,.12);
  color: #bbf7d0;
  font-size: 34px;
  font-weight: 950;
}

.sequence-result.failed
.sequence-result-icon {
  border-color: rgba(239,161,92,.35);
  background: rgba(239,161,92,.12);
  color: #fed7aa;
}

.sequence-result-kicker {
  color: #72df91;
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .12em;
  text-transform: uppercase;
}

.sequence-result.failed
.sequence-result-kicker {
  color: #efa15c;
}

.sequence-result strong {
  color: #f4f4f5;
  font-size: 23px;
  letter-spacing: -.025em;
}

.sequence-result p {
  margin: 0;
  color: rgba(244,244,245,.65);
  font-size: 13px;
  line-height: 1.4;
}

.sequence-result button {
  width: min(100%,280px);
  min-height: 51px;
  margin-top: 5px;
  border: 0;
  border-radius: 15px;
  background: #68df8a;
  color: #102416;
  font-size: 13px;
  font-weight: 950;
  cursor: pointer;
}

.sequence-result.failed button {
  background: #efa15c;
  color: #2c1608;
}

.sequence-result button:disabled {
  opacity: .55;
  cursor: default;
}

@media(max-width:360px) {
  .sequence-body {
    padding: 14px;
  }

  .sequence-heading h2 {
    font-size: 22px;
  }

  .sequence-actions {
    grid-template-columns: 1fr;
  }

  .sequence-actions button.primary {
    grid-row: 1;
  }
}
`

function normalizeTokens(value: unknown) {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 10)
}

function clampAttempts(value: unknown) {
  const parsed = Number(value)

  if (!Number.isFinite(parsed)) return 3

  return Math.max(
    1,
    Math.min(8, Math.round(parsed)),
  )
}

function shuffleTokens(tokens: string[]) {
  const shuffled = [...tokens]

  for (
    let index = shuffled.length - 1;
    index > 0;
    index -= 1
  ) {
    const target = Math.floor(
      Math.random() * (index + 1),
    )

    const current = shuffled[index]
    shuffled[index] = shuffled[target]
    shuffled[target] = current
  }

  if (
    shuffled.length > 1 &&
    shuffled.every(
      (token, index) =>
        token === tokens[index],
    )
  ) {
    const first = shuffled[0]
    shuffled[0] = shuffled[1]
    shuffled[1] = first
  }

  return shuffled
}

export function SequenceCodeRuntimeScreen({
  resolved,
  stage,
  helperText,
  submitting,
  onWin,
}: Props) {
  const sourceSequence =
    resolved.config.sequence

  const tokens = useMemo(
    () => normalizeTokens(sourceSequence),
    [sourceSequence],
  )

  const tokensKey = tokens.join('\u0001')

  const maxAttempts = clampAttempts(
    resolved.config.max_attempts,
  )

  const hintText = String(
    resolved.config.hint_text ||
      stage.messages?.hint ||
      '',
  ).trim()

  const unique = new Set(
    tokens.map((token) =>
      token.toLocaleLowerCase(),
    ),
  )

  const invalidConfig =
    tokens.length < 3 ||
    unique.size !== tokens.length

  const [phase, setPhase] =
    useState<Phase>('playing')

  const [available, setAvailable] =
    useState<string[]>(() =>
      shuffleTokens(tokens),
    )

  const [answer, setAnswer] =
    useState<string[]>([])

  const [attemptsUsed, setAttemptsUsed] =
    useState(0)

  const [message, setMessage] =
    useState('')

  const [continuing, setContinuing] =
    useState(false)

  const continueLockRef = useRef(false)

  const resetRound = useCallback(
    (resetAttempts: boolean) => {
      setAvailable(shuffleTokens(tokens))
      setAnswer([])
      setMessage('')
      setPhase('playing')
      setContinuing(false)
      continueLockRef.current = false

      if (resetAttempts) {
        setAttemptsUsed(0)
      }
    },
    [tokens, tokensKey],
  )

  useEffect(() => {
    resetRound(true)
  }, [resetRound])

  const chooseToken = (token: string) => {
    if (phase !== 'playing') return

    setAvailable((current) => {
      const index = current.indexOf(token)
      if (index < 0) return current

      const next = [...current]
      next.splice(index, 1)
      return next
    })

    setAnswer((current) => [
      ...current,
      token,
    ])

    setMessage('')
  }

  const returnToken = (
    token: string,
    answerIndex: number,
  ) => {
    if (phase !== 'playing') return

    setAnswer((current) =>
      current.filter(
        (_, index) =>
          index !== answerIndex,
      ),
    )

    setAvailable((current) => [
      ...current,
      token,
    ])

    setMessage('')
  }

  const checkAnswer = () => {
    if (
      phase !== 'playing' ||
      answer.length !== tokens.length
    ) {
      return
    }

    const correct = answer.every(
      (token, index) =>
        token === tokens[index],
    )

    if (correct) {
      setMessage('')
      setPhase('success')
      return
    }

    const nextAttempts = attemptsUsed + 1
    setAttemptsUsed(nextAttempts)

    if (nextAttempts >= maxAttempts) {
      setPhase('failed')
      return
    }

    setMessage(
      'El orden no coincide con la historia. '
        + 'Revisa las pistas y vuelve a intentarlo.',
    )

    setAnswer([])
    setAvailable(shuffleTokens(tokens))
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
        className="sequence-shell"
        aria-label="Código secuencial"
      >
        <style>{STYLES}</style>

        <div className="sequence-result failed">
          <div className="sequence-result-inner">
            <div className="sequence-result-icon">
              !
            </div>

            <span className="sequence-result-kicker">
              Configuración incompleta
            </span>

            <strong>
              Secuencia no disponible
            </strong>

            <p>
              El administrador debe guardar al
              menos tres fichas distintas.
            </p>
          </div>
        </div>
      </section>
    )
  }

  if (phase === 'success') {
    return (
      <section
        className="sequence-shell"
        aria-label="Código secuencial"
      >
        <style>{STYLES}</style>

        <div className="sequence-result success">
          <div className="sequence-result-inner">
            <div className="sequence-result-icon">
              ✓
            </div>

            <span className="sequence-result-kicker">
              Secuencia validada
            </span>

            <strong>
              Ruta reconstruida
            </strong>

            <p>
              Las pistas encajan. Guarda el
              resultado y continúa hacia el
              siguiente nodo de la misión.
            </p>

            <button
              type="button"
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
        className="sequence-shell"
        aria-label="Código secuencial"
      >
        <style>{STYLES}</style>

        <div className="sequence-result failed">
          <div className="sequence-result-inner">
            <div className="sequence-result-icon">
              !
            </div>

            <span className="sequence-result-kicker">
              Intentos agotados
            </span>

            <strong>
              Revisa la historia
            </strong>

            <p>
              Busca qué sucedió primero, qué
              ocurrió después y cuál fue el
              último lugar.
            </p>

            <button
              type="button"
              onClick={() =>
                resetRound(true)
              }
            >
              Intentarlo de nuevo
            </button>
          </div>
        </div>
      </section>
    )
  }

  const attemptsLeft = Math.max(
    0,
    maxAttempts - attemptsUsed,
  )

  const rawDescription = String(
    stage.content ||
      helperText ||
      '',
  ).trim()

  const normalizedDescription =
    rawDescription.toLocaleLowerCase()

  const legacyDescription =
    normalizedDescription.includes(
      'memoriza la secuencia',
    ) ||
    normalizedDescription.includes(
      'memoriza la ruta de energía',
    ) ||
    normalizedDescription.includes(
      'busca el punto marcado',
    )

  const description =
    !rawDescription || legacyDescription
      ? 'Usa la historia de tu tríptico '
        + 'para ordenar las fichas.'
      : rawDescription

  return (
    <section
      className="sequence-shell"
      aria-label="Código secuencial"
    >
      <style>{STYLES}</style>

      <div className="sequence-body">
        <header className="sequence-heading">
          <div>
            <span className="sequence-kicker">
              Reto de historia
            </span>

            <h2>
              Reconstruye el orden
            </h2>

            <p className="sequence-intro">
              {description}
            </p>
          </div>

          <div
            className="sequence-attempts"
            aria-label={
              `${attemptsLeft} intentos restantes`
            }
          >
            <strong>{attemptsLeft}</strong>
            <span>
              {attemptsLeft === 1
                ? 'intento'
                : 'intentos'}
            </span>
          </div>
        </header>

        <section className="sequence-card">
          <div className="sequence-section-head">
            <b>Tu secuencia</b>
            <span>
              {answer.length}/{tokens.length}
            </span>
          </div>

          <div className="sequence-order-list">
            {Array.from(
              { length: tokens.length },
              (_, index) => {
                const token = answer[index]

                if (!token) {
                  return (
                    <div
                      key={`slot-${index}`}
                      className="sequence-order-row"
                    >
                      <span className="sequence-order-number">
                        {index + 1}
                      </span>

                      <span>
                        Selecciona una ficha
                      </span>

                      <span />
                    </div>
                  )
                }

                return (
                  <button
                    key={`slot-${index}`}
                    type="button"
                    className="sequence-order-row"
                    aria-label={
                      `Quitar ${token} de la `
                      + `posición ${index + 1}`
                    }
                    onClick={() =>
                      returnToken(
                        token,
                        index,
                      )
                    }
                  >
                    <span className="sequence-order-number">
                      {index + 1}
                    </span>

                    <strong>{token}</strong>

                    <span className="sequence-order-remove">
                      Quitar
                    </span>
                  </button>
                )
              },
            )}
          </div>
        </section>

        <section className="sequence-card">
          <div className="sequence-section-head">
            <b>Fichas disponibles</b>
            <span>
              Toca para añadir
            </span>
          </div>

          <div className="sequence-choice-grid">
            {available.map((token) => (
              <button
                key={token}
                type="button"
                className="sequence-choice"
                onClick={() =>
                  chooseToken(token)
                }
              >
                {token}
              </button>
            ))}
          </div>
        </section>

        <div
          className="sequence-message"
          aria-live="polite"
        >
          {message}
        </div>

        {attemptsUsed > 0 && hintText ? (
          <div className="sequence-hint">
            <b>Pista:</b> {hintText}
          </div>
        ) : null}

        <div className="sequence-actions">
          <button
            type="button"
            disabled={!answer.length}
            onClick={() =>
              resetRound(false)
            }
          >
            Borrar selección
          </button>

          <button
            type="button"
            className="primary"
            disabled={
              answer.length !== tokens.length
            }
            onClick={checkAnswer}
          >
            Validar secuencia
          </button>
        </div>
      </div>
    </section>
  )
}

export default SequenceCodeRuntimeScreen
