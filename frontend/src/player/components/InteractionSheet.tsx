import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { PlayerStage } from '../../types/player'
import { resolveMinigameDefinition } from '../minigames/registry'
import { MinigameHost } from './MinigameHost'

interface InteractionSheetProps {
  open: boolean
  user: string
  currentStage: PlayerStage | null
  helperText: string
  legacyPlayerHref: string
  submitting: boolean
  errorMessage: string | null
  onClose: () => void
  onSubmitCode: (code: string) => Promise<void>
}

function vibrate(pattern: number | number[]) {
  if (typeof window === 'undefined') return
  if (!('navigator' in window)) return
  if (typeof window.navigator.vibrate !== 'function') return
  window.navigator.vibrate(pattern)
}

export function InteractionSheet({
  open,
  user,
  currentStage,
  helperText,
  legacyPlayerHref,
  submitting,
  errorMessage,
  onClose,
  onSubmitCode,
}: InteractionSheetProps) {
  const [code, setCode] = useState('')
  const [showRecovery, setShowRecovery] = useState(false)
  const [dragOffset, setDragOffset] = useState(0)

  const touchStartYRef = useRef<number | null>(null)
  const touchStartXRef = useRef<number | null>(null)

  const stageId = currentStage?.id ?? null
  const stageType = currentStage?.type ?? null
  const minigameDefinition = stageType
    ? resolveMinigameDefinition(stageType)
    : null
  const hasNativeMinigame = Boolean(minigameDefinition)

  useEffect(() => {
    setCode('')
    setShowRecovery(!hasNativeMinigame)
    setDragOffset(0)
  }, [stageId, hasNativeMinigame])

  useEffect(() => {
    if (open && currentStage) {
      vibrate(10)
    }
  }, [open, stageId])

  if (!open || !currentStage) return null

  const typeLabel = (currentStage.type || 'interaction')
    .replace(/_/g, ' ')
    .toUpperCase()

  const narrative = currentStage.content?.trim() || ''
  const hint = currentStage.messages?.hint?.trim() || ''

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalized = code.trim().toUpperCase()
    if (!normalized || submitting) return
    await onSubmitCode(normalized)
  }

  async function handleNativeWin() {
    vibrate([12, 20, 12])
    await onSubmitCode('OK')
  }

  function handleClose() {
    vibrate(10)
    onClose()
  }

  function handleTouchStart(event: React.TouchEvent<HTMLElement>) {
    if (event.touches.length !== 1) return
    touchStartYRef.current = event.touches[0].clientY
    touchStartXRef.current = event.touches[0].clientX
  }

  function handleTouchMove(event: React.TouchEvent<HTMLElement>) {
    if (touchStartYRef.current === null || touchStartXRef.current === null) return
    const deltaY = event.touches[0].clientY - touchStartYRef.current
    const deltaX = event.touches[0].clientX - touchStartXRef.current

    if (Math.abs(deltaX) > Math.abs(deltaY)) return
    if (deltaY <= 0) {
      setDragOffset(0)
      return
    }

    setDragOffset(Math.min(deltaY, 140))
  }

  function handleTouchEnd() {
    if (dragOffset > 90 && !submitting) {
      vibrate([8, 12, 8])
      onClose()
    }

    setDragOffset(0)
    touchStartYRef.current = null
    touchStartXRef.current = null
  }

  return (
    <>
      <style>{sheetAnimations}</style>

      <div style={overlay}>
        <div style={backdrop} onClick={submitting ? undefined : handleClose} />

        <section
          style={{
            ...sheet,
            transform: `translateY(${dragOffset}px)`,
            transition:
              dragOffset === 0
                ? 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease-out'
                : 'none',
          }}
          aria-modal="true"
          role="dialog"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div style={dragHandleWrap}>
            <div style={dragHandle} />
          </div>

          <div style={headerRow}>
            <div style={headerCopy}>
              <div style={eyebrow}>INTERACTION</div>
              <div style={title}>{currentStage.title}</div>
              <div style={metaRow}>
                <span style={typeBadge}>{typeLabel}</span>
                <span style={metaText}>USER {user}</span>
                {hasNativeMinigame && minigameDefinition ? (
                  <span style={nativeBadge}>{minigameDefinition.label}</span>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              style={closeButton}
              onClick={handleClose}
              disabled={submitting}
            >
              CLOSE
            </button>
          </div>

          {(narrative || hint || helperText) ? (
            <section style={contextCard}>
              <div style={contextLabel}>MISSION CONTEXT</div>
              <div style={contextText}>
                {narrative || helperText || 'No narrative provided for this node.'}
              </div>
              {hint ? <div style={hintText}>Hint: {hint}</div> : null}
            </section>
          ) : null}

          {minigameDefinition ? (
            <MinigameHost
              definition={minigameDefinition}
              stage={currentStage}
              helperText={helperText}
              submitting={submitting}
              onWin={handleNativeWin}
            />
          ) : (
            <section style={bridgeCard}>
              <div style={bridgeLabel}>BRIDGE MODE</div>
              <div style={bridgeText}>
                This interaction still uses the bridge flow. Submit a stage code
                manually or open the legacy runtime for the full interaction.
              </div>
            </section>
          )}

          <section style={recoveryWrap}>
            <button
              type="button"
              style={recoveryToggle}
              onClick={() => {
                vibrate(8)
                setShowRecovery((current) => !current)
              }}
            >
              {showRecovery ? 'HIDE RECOVERY TOOLS' : 'SHOW RECOVERY TOOLS'}
            </button>

            {showRecovery ? (
              <div style={recoveryPanel}>
                <form style={formWrap} onSubmit={handleSubmit}>
                  <label htmlFor="interaction-code" style={inputLabel}>
                    MANUAL FALLBACK CODE
                  </label>

                  <div style={inputRow}>
                    <input
                      id="interaction-code"
                      value={code}
                      onChange={(event) => setCode(event.target.value.toUpperCase())}
                      placeholder="ENTER CODE..."
                      autoComplete="off"
                      spellCheck={false}
                      style={input}
                      disabled={submitting}
                    />

                    <button
                      type="submit"
                      style={submitButton}
                      disabled={submitting || !code.trim()}
                    >
                      {submitting ? 'SUBMITTING...' : 'SUBMIT'}
                    </button>
                  </div>

                  {errorMessage ? <div style={errorText}>{errorMessage}</div> : null}
                </form>

                <div style={footerActions}>
                  <a href={legacyPlayerHref} style={legacyLink}>
                    OPEN LEGACY INTERACTION
                  </a>
                </div>
              </div>
            ) : null}
          </section>
        </section>
      </div>
    </>
  )
}

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 4000,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  padding: 12,
}

const backdrop: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(2,6,23,.58)',
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  animation: 'sagaFadeIn 160ms ease-out',
}

const sheet: React.CSSProperties = {
  position: 'relative',
  width: 'min(100%, 760px)',
  maxHeight: 'calc(100vh - 24px)',
  overflowY: 'auto',
  borderRadius: 28,
  border: '1px solid rgba(255,255,255,.14)',
  background:
    'linear-gradient(180deg, rgba(15,23,42,.96), rgba(15,23,42,.90))',
  boxShadow: '0 30px 70px rgba(2,6,23,.42)',
  color: '#f8fafc',
  padding: 14,
  display: 'grid',
  gap: 14,
  animation: 'sagaSheetUp 220ms cubic-bezier(0.22, 1, 0.36, 1)',
  willChange: 'transform',
}

const dragHandleWrap: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  paddingTop: 2,
}

const dragHandle: React.CSSProperties = {
  width: 44,
  height: 5,
  borderRadius: 999,
  background: 'rgba(255,255,255,.18)',
}

const headerRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
}

const headerCopy: React.CSSProperties = {
  minWidth: 0,
}

const eyebrow: React.CSSProperties = {
  color: 'rgba(167,243,208,.96)',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.18em',
}

const title: React.CSSProperties = {
  marginTop: 6,
  color: '#f8fafc',
  fontSize: 24,
  fontWeight: 900,
  lineHeight: 1.05,
  letterSpacing: '-0.03em',
}

const metaRow: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  marginTop: 10,
}

const chipBase: React.CSSProperties = {
  minHeight: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 10px',
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.12em',
}

const typeBadge: React.CSSProperties = {
  ...chipBase,
  background: 'rgba(59,130,246,.16)',
  border: '1px solid rgba(96,165,250,.20)',
  color: '#dbeafe',
}

const metaText: React.CSSProperties = {
  ...chipBase,
  background: 'rgba(255,255,255,.06)',
  border: '1px solid rgba(255,255,255,.08)',
  color: '#cbd5e1',
}

const nativeBadge: React.CSSProperties = {
  ...chipBase,
  background: 'rgba(34,197,94,.12)',
  border: '1px solid rgba(34,197,94,.18)',
  color: '#dcfce7',
}

const closeButton: React.CSSProperties = {
  minHeight: 38,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 14px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(255,255,255,.06)',
  color: '#f8fafc',
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: '0.10em',
}

const contextCard: React.CSSProperties = {
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.05)',
  padding: 14,
  display: 'grid',
  gap: 8,
}

const contextLabel: React.CSSProperties = {
  color: 'rgba(148,163,184,.92)',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.16em',
}

const contextText: React.CSSProperties = {
  color: '#e2e8f0',
  fontSize: 14,
  lineHeight: 1.55,
  whiteSpace: 'pre-wrap',
}

const hintText: React.CSSProperties = {
  color: '#fde68a',
  fontSize: 13,
  lineHeight: 1.45,
}

const bridgeCard: React.CSSProperties = {
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.05)',
  padding: 14,
  display: 'grid',
  gap: 8,
}

const bridgeLabel: React.CSSProperties = {
  color: 'rgba(148,163,184,.92)',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.16em',
}

const bridgeText: React.CSSProperties = {
  color: '#e2e8f0',
  fontSize: 14,
  lineHeight: 1.55,
}

const recoveryWrap: React.CSSProperties = {
  display: 'grid',
  gap: 10,
}

const recoveryToggle: React.CSSProperties = {
  minHeight: 46,
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.05)',
  color: '#cbd5e1',
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: '0.10em',
}

const recoveryPanel: React.CSSProperties = {
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.04)',
  padding: 14,
  display: 'grid',
  gap: 12,
}

const formWrap: React.CSSProperties = {
  display: 'grid',
  gap: 8,
}

const inputLabel: React.CSSProperties = {
  color: 'rgba(148,163,184,.92)',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.16em',
}

const inputRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: 10,
}

const input: React.CSSProperties = {
  minHeight: 52,
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(2,6,23,.50)',
  color: '#f8fafc',
  fontSize: 14,
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  padding: '0 14px',
  outline: 'none',
}

const submitButton: React.CSSProperties = {
  minHeight: 52,
  minWidth: 140,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 16,
  border: '1px solid rgba(34,197,94,.26)',
  background:
    'linear-gradient(180deg, rgba(34,197,94,.24), rgba(22,163,74,.18))',
  color: '#dcfce7',
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: '0.10em',
  padding: '0 16px',
}

const errorText: React.CSSProperties = {
  color: '#fecaca',
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.4,
}

const footerActions: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  alignItems: 'center',
}

const legacyLink: React.CSSProperties = {
  minHeight: 44,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 14px',
  borderRadius: 14,
  border: '1px solid rgba(96,165,250,.18)',
  background: 'rgba(59,130,246,.10)',
  color: '#dbeafe',
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: '0.08em',
  textDecoration: 'none',
}

const sheetAnimations = `
@keyframes sagaFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes sagaSheetUp {
  from {
    opacity: 0;
    transform: translateY(18px) scale(.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
`
