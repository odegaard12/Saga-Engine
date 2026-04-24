import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type TouchEvent,
} from 'react'
import type { PlayerStage } from '../../types/player'
import { FamilyRuntimeHost, resolveStageMinigame } from '../minigames/core'
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

function getCompactLine(stage: PlayerStage | null) {
  const hint = String(stage?.messages?.hint || '').trim()
  if (hint) return hint

  const text = String(stage?.content || '').trim()
  if (!text) return ''
  if (text.toUpperCase() === 'PUT NODE TEXT HERE') return ''
  return text
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
  const dragEnabledRef = useRef(false)

  const stageId = currentStage?.id ?? null
  const stageType = currentStage?.minigame?.type ?? currentStage?.type ?? null

  const resolvedStageMinigame = resolveStageMinigame(currentStage)
  const resolvedRuntime = resolvedStageMinigame?.resolved ?? null
  const resolvedSourceType = resolvedStageMinigame?.source.type ?? stageType

  const minigameDefinition = resolvedSourceType
    ? resolveMinigameDefinition(resolvedSourceType)
    : null

  const shouldRenderFamilyRuntime = Boolean(
    resolvedRuntime && resolvedRuntime.compatibility === 'native'
  )

  const compactLine = getCompactLine(currentStage)

  useEffect(() => {
    setCode('')
    setShowRecovery(false)
    setDragOffset(0)
  }, [stageId])

  useEffect(() => {
    if (open && currentStage) {
      vibrate(10)
    }
  }, [open, stageId, currentStage])

  if (!open || !currentStage) return null

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

  function handleTouchStart(event: TouchEvent<HTMLElement>) {
    if (!dragEnabledRef.current) return
    if (event.touches.length !== 1) return
    touchStartYRef.current = event.touches[0].clientY
    touchStartXRef.current = event.touches[0].clientX
  }

  function handleTouchMove(event: TouchEvent<HTMLElement>) {
    if (!dragEnabledRef.current) return
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
    if (!dragEnabledRef.current) return

    if (dragOffset > 90 && !submitting) {
      vibrate([8, 12, 8])
      onClose()
    }

    dragEnabledRef.current = false
    setDragOffset(0)
    touchStartYRef.current = null
    touchStartXRef.current = null
  }

  function beginDrag() {
    dragEnabledRef.current = true
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
                ? 'transform 180ms ease, opacity 160ms ease'
                : 'none',
          }}
          aria-modal="true"
          role="dialog"
        >
          <div
            style={dragHandleWrap}
            onTouchStart={(event) => {
              beginDrag()
              handleTouchStart(event)
            }}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div style={dragHandle} />
          </div>

          <div style={headerRow}>
            <div style={headerCopy}>
              <div style={title}>{currentStage.title}</div>

              <div style={subRow}>
                {resolvedRuntime ? (
                  <span style={miniBadge}>{resolvedRuntime.label}</span>
                ) : minigameDefinition ? (
                  <span style={miniBadge}>{minigameDefinition.label}</span>
                ) : null}

                <span style={userText}>{user}</span>
              </div>

              {compactLine ? <div style={compactLineText}>{compactLine}</div> : null}
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

          {shouldRenderFamilyRuntime && resolvedRuntime ? (
            <FamilyRuntimeHost
              resolved={resolvedRuntime}
              stage={currentStage}
              helperText={helperText}
              submitting={submitting}
              onWin={handleNativeWin}
            />
          ) : minigameDefinition ? (
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

          <div style={footerRow}>
            <button
              type="button"
              style={recoveryToggle}
              onClick={() => setShowRecovery((current) => !current)}
            >
              {showRecovery ? 'Hide fallback' : 'Fallback'}
            </button>
          </div>

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

              <a href={legacyPlayerHref} style={legacyLink}>
                Open legacy
              </a>
            </div>
          ) : null}
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
  width: 'min(100%, 840px)',
  maxHeight: 'calc(100vh - 24px)',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  borderRadius: 28,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'linear-gradient(180deg, rgba(2,6,23,.98), rgba(15,23,42,.94))',
  boxShadow: '0 18px 40px rgba(2,6,23,.30)',
  color: '#f8fafc',
  padding: 14,
  display: 'grid',
  gap: 10,
  animation: 'sagaSheetUp 220ms cubic-bezier(0.22, 1, 0.36, 1)',
  willChange: 'transform',
}

const dragHandleWrap: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  paddingTop: 2,
  paddingBottom: 2,
  touchAction: 'none',
}

const dragHandle: CSSProperties = {
  width: 42,
  height: 5,
  borderRadius: 999,
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
  display: 'grid',
  gap: 6,
}

const title: CSSProperties = {
  color: '#f8fafc',
  fontSize: 20,
  fontWeight: 900,
  lineHeight: 1.02,
  letterSpacing: '-0.03em',
}

const subRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 8,
}

const miniBadge: CSSProperties = {
  minHeight: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 12px',
  borderRadius: 999,
  background: 'rgba(22,163,74,.16)',
  border: '1px solid rgba(34,197,94,.20)',
  color: '#dcfce7',
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: '0.08em',
}

const userText: CSSProperties = {
  color: 'rgba(255,255,255,.62)',
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '0.08em',
}

const compactLineText: CSSProperties = {
  color: '#cbd5e1',
  fontSize: 14,
  lineHeight: 1.35,
}

const closeButton: CSSProperties = {
  minHeight: 40,
  padding: '0 16px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(255,255,255,.06)',
  color: '#f8fafc',
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '0.10em',
}

const bridgeCard: CSSProperties = {
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.05)',
  padding: 14,
}

const bridgeText: CSSProperties = {
  color: '#cbd5e1',
  fontSize: 14,
  lineHeight: 1.5,
}

const footerRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-start',
}

const recoveryToggle: CSSProperties = {
  minHeight: 32,
  padding: '0 10px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'transparent',
  color: 'rgba(255,255,255,.66)',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.08em',
}

const recoveryPanel: CSSProperties = {
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,.08)',
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
  minHeight: 44,
  borderRadius: 14,
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

const submitButton: CSSProperties = {
  minHeight: 44,
  minWidth: 62,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 14,
  border: '1px solid rgba(22,163,74,.24)',
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

const legacyLink: CSSProperties = {
  minHeight: 36,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 12px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(255,255,255,.06)',
  color: '#e2e8f0',
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
