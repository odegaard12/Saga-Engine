import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import type { PlayerStage } from '../../types/player'
import { resolveMinigameDefinition } from '../minigames/registry'
import { MinigameHost } from './MinigameHost'
import { tokens } from '../ui/tokens'

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

function isMeaningfulNarrative(stage: PlayerStage | null) {
  const text = String(stage?.content || '').trim().toUpperCase()
  if (!text) return false
  if (text === 'PUT NODE TEXT HERE') return false
  return true
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
  const stageType = currentStage?.minigame?.type ?? currentStage?.type ?? null
  const minigameDefinition = stageType
    ? resolveMinigameDefinition(stageType)
    : null

  useEffect(() => {
    setCode('')
    setShowRecovery(false)
    setDragOffset(0)
  }, [stageId])

  useEffect(() => {
    if (open && currentStage) {
      vibrate(10)
    }
  }, [open, stageId])

  if (!open || !currentStage) return null

  const hasNarrative = isMeaningfulNarrative(currentStage)
  const narrative = hasNarrative ? currentStage.content?.trim() || '' : ''
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
                ? `transform ${tokens.motion.smooth}, opacity ${tokens.motion.fast}`
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
              <div style={title}>{currentStage.title}</div>
            </div>

            <button
              type="button"
              style={closeButton}
              onClick={handleClose}
              disabled={submitting}
            >
              ×
            </button>
          </div>

          {hasNarrative ? (
            <section style={contextCard}>
              <div style={contextText}>{narrative}</div>
              {hint ? <div style={hintText}>{hint}</div> : null}
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
              <div style={bridgeText}>
                {helperText || 'This node still uses the legacy interaction flow.'}
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
              {showRecovery ? 'Hide fallback' : 'Fallback'}
            </button>

            {showRecovery ? (
              <div style={recoveryPanel}>
                <form style={formWrap} onSubmit={handleSubmit}>
                  <div style={inputRow}>
                    <input
                      id="interaction-code"
                      value={code}
                      onChange={(event) => setCode(event.target.value.toUpperCase())}
                      placeholder="CODE"
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
                      {submitting ? '...' : 'OK'}
                    </button>
                  </div>

                  {errorMessage ? <div style={errorText}>{errorMessage}</div> : null}
                </form>

                <div style={footerActions}>
                  <a href={legacyPlayerHref} style={legacyLink}>
                    Open legacy
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

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 4000,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  padding: 12,
}

const backdrop: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(2,6,23,.56)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  animation: 'sagaFadeIn 160ms ease-out',
}

const sheet: CSSProperties = {
  position: 'relative',
  width: 'min(100%, 720px)',
  maxHeight: 'calc(100vh - 24px)',
  overflowY: 'auto',
  borderRadius: 28,
  border: `1px solid ${tokens.colors.slateLine}`,
  background: 'linear-gradient(180deg, rgba(15,23,42,.96), rgba(15,23,42,.92))',
  boxShadow: tokens.shadow.sheet,
  color: '#f8fafc',
  padding: 14,
  display: 'grid',
  gap: 14,
  animation: 'sagaSheetUp 220ms cubic-bezier(0.22, 1, 0.36, 1)',
  willChange: 'transform',
}

const dragHandleWrap: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  paddingTop: 2,
}

const dragHandle: CSSProperties = {
  width: 42,
  height: 5,
  borderRadius: tokens.radius.pill,
  background: 'rgba(255,255,255,.18)',
}

const headerRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
}

const headerCopy: CSSProperties = {
  minWidth: 0,
}

const title: CSSProperties = {
  color: '#f8fafc',
  fontSize: 24,
  fontWeight: 900,
  lineHeight: 1.05,
  letterSpacing: '-0.03em',
}

const closeButton: CSSProperties = {
  width: 38,
  height: 38,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: tokens.radius.pill,
  border: `1px solid ${tokens.colors.slateLine}`,
  background: tokens.colors.slateSoft,
  color: '#f8fafc',
  fontSize: 22,
  fontWeight: 800,
  lineHeight: 1,
}

const contextCard: CSSProperties = {
  borderRadius: 18,
  border: `1px solid ${tokens.colors.slateLine}`,
  background: tokens.colors.slateSoft,
  padding: 14,
  display: 'grid',
  gap: 8,
}

const contextText: CSSProperties = {
  color: '#e2e8f0',
  fontSize: 14,
  lineHeight: 1.55,
  whiteSpace: 'pre-wrap',
}

const hintText: CSSProperties = {
  color: '#fde68a',
  fontSize: 13,
  lineHeight: 1.45,
}

const bridgeCard: CSSProperties = {
  borderRadius: 18,
  border: `1px solid ${tokens.colors.slateLine}`,
  background: tokens.colors.slateSoft,
  padding: 14,
}

const bridgeText: CSSProperties = {
  color: tokens.colors.slateMuted,
  fontSize: 14,
  lineHeight: 1.5,
}

const recoveryWrap: CSSProperties = {
  display: 'grid',
  gap: 10,
}

const recoveryToggle: CSSProperties = {
  minHeight: 42,
  borderRadius: 14,
  border: `1px solid ${tokens.colors.slateLine}`,
  background: tokens.colors.slateSoft,
  color: tokens.colors.slateMuted,
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '0.04em',
}

const recoveryPanel: CSSProperties = {
  borderRadius: 16,
  border: `1px solid ${tokens.colors.slateLine}`,
  background: 'rgba(255,255,255,.03)',
  padding: 12,
  display: 'grid',
  gap: 10,
}

const formWrap: CSSProperties = {
  display: 'grid',
  gap: 8,
}

const inputRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: 10,
}

const input: CSSProperties = {
  minHeight: 46,
  borderRadius: 14,
  border: `1px solid ${tokens.colors.slateLine}`,
  background: 'rgba(2,6,23,.50)',
  color: '#f8fafc',
  fontSize: 14,
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  padding: '0 14px',
  outline: 'none',
}

const submitButton: CSSProperties = {
  minHeight: 46,
  minWidth: 64,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 14,
  border: `1px solid ${tokens.colors.brandLine}`,
  background: 'linear-gradient(180deg, rgba(34,197,94,.24), rgba(22,163,74,.18))',
  color: '#dcfce7',
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: '0.10em',
  padding: '0 16px',
}

const errorText: CSSProperties = {
  color: '#fecaca',
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.4,
}

const footerActions: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  alignItems: 'center',
}

const legacyLink: CSSProperties = {
  minHeight: 38,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 12px',
  borderRadius: tokens.radius.pill,
  border: `1px solid ${tokens.colors.slateLine}`,
  background: tokens.colors.slateSoft,
  color: tokens.colors.slateMuted,
  fontSize: 12,
  fontWeight: 800,
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
