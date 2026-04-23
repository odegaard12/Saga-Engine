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

  const resolvedStageMinigame = resolveStageMinigame(currentStage)
  const resolvedRuntime = resolvedStageMinigame?.resolved ?? null
  const resolvedSourceType = resolvedStageMinigame?.source.type ?? stageType
  const resolvedFamily = resolvedRuntime?.family ?? null
  const legacyBridge = resolvedRuntime?.compatibility === 'legacy_bridge'

  const minigameDefinition = resolvedSourceType
    ? resolveMinigameDefinition(resolvedSourceType)
    : null

  const hasNativeMinigame = Boolean(minigameDefinition)
  const shouldRenderFamilyRuntime = Boolean(
    resolvedRuntime && resolvedRuntime.compatibility === 'native'
  )
  const shouldRenderLegacyBridgeInfo = Boolean(
    resolvedRuntime && resolvedRuntime.compatibility === 'legacy_bridge'
  )

  useEffect(() => {
    setCode('')
    setShowRecovery(
      shouldRenderLegacyBridgeInfo ||
        (!hasNativeMinigame && !shouldRenderFamilyRuntime)
    )
    setDragOffset(0)
  }, [
    stageId,
    hasNativeMinigame,
    shouldRenderFamilyRuntime,
    shouldRenderLegacyBridgeInfo,
  ])

  useEffect(() => {
    if (open && currentStage) {
      vibrate(10)
    }
  }, [open, stageId, currentStage])

  if (!open || !currentStage) return null

  const typeLabel = (resolvedFamily || stageType || 'interaction')
    .replace(/_/g, ' ')
    .toUpperCase()

  const hasNarrative = isMeaningfulNarrative(currentStage)
  const narrative = hasNarrative ? currentStage.content?.trim() || '' : ''
  const hint = currentStage.messages?.hint?.trim() || ''
  const contextValue =
    narrative || helperText || 'No narrative provided for this node.'

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
    if (event.touches.length !== 1) return
    touchStartYRef.current = event.touches[0].clientY
    touchStartXRef.current = event.touches[0].clientX
  }

  function handleTouchMove(event: TouchEvent<HTMLElement>) {
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

                {resolvedRuntime ? (
                  <span style={nativeBadge}>
                    {legacyBridge
                      ? `${resolvedRuntime.label} · BRIDGE`
                      : resolvedRuntime.label}
                  </span>
                ) : hasNativeMinigame && minigameDefinition ? (
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
              <div style={contextText}>{contextValue}</div>
              {hint ? <div style={hintText}>Hint: {hint}</div> : null}
            </section>
          ) : null}

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
          ) : shouldRenderLegacyBridgeInfo && resolvedRuntime ? (
            <section style={bridgeCard}>
              <div style={bridgeLabel}>LEGACY BRIDGE READY</div>
              <div style={bridgeText}>
                {`This stage resolves through the ${resolvedRuntime.family.replace(/_/g, ' ')} family, but still enters through the legacy bridge. Recovery tools stay available until the family runtime replaces that legacy path.`}
              </div>
            </section>
          ) : resolvedRuntime ? (
            <section style={bridgeCard}>
              <div style={bridgeLabel}>RUNTIME FAMILY RESOLVED</div>
              <div style={bridgeText}>
                {`This stage resolves to ${resolvedRuntime.label}, but no mounted runtime host is available for this exact path yet.`}
              </div>
            </section>
          ) : (
            <section style={bridgeCard}>
              <div style={bridgeLabel}>BRIDGE MODE</div>
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
              {showRecovery ? 'HIDE FALLBACK' : 'FALLBACK'}
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
                      onChange={(event) =>
                        setCode(event.target.value.toUpperCase())
                      }
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
  background: 'rgba(2,6,23,.58)',
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  animation: 'sagaFadeIn 160ms ease-out',
}

const sheet: CSSProperties = {
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

const dragHandleWrap: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  paddingTop: 2,
}

const dragHandle: CSSProperties = {
  width: 44,
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
}

const eyebrow: CSSProperties = {
  color: 'rgba(167,243,208,.96)',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.18em',
}

const title: CSSProperties = {
  marginTop: 6,
  color: '#f8fafc',
  fontSize: 24,
  fontWeight: 900,
  lineHeight: 1.05,
  letterSpacing: '-0.03em',
}

const metaRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  marginTop: 10,
}

const chipBase: CSSProperties = {
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

const typeBadge: CSSProperties = {
  ...chipBase,
  background: 'rgba(59,130,246,.16)',
  border: '1px solid rgba(96,165,250,.20)',
  color: '#dbeafe',
}

const metaText: CSSProperties = {
  ...chipBase,
  background: 'rgba(255,255,255,.06)',
  border: '1px solid rgba(255,255,255,.08)',
  color: 'rgba(255,255,255,.78)',
}

const nativeBadge: CSSProperties = {
  ...chipBase,
  background: 'rgba(34,197,94,.16)',
  border: '1px solid rgba(74,222,128,.22)',
  color: '#dcfce7',
}

const closeButton: CSSProperties = {
  minHeight: 38,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 12px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(255,255,255,.06)',
  color: '#f8fafc',
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '0.10em',
}

const contextCard: CSSProperties = {
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.05)',
  padding: 14,
  display: 'grid',
  gap: 8,
}

const contextLabel: CSSProperties = {
  color: 'rgba(255,255,255,.64)',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
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
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.05)',
  padding: 14,
}

const bridgeLabel: CSSProperties = {
  color: 'rgba(255,255,255,.64)',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  marginBottom: 6,
}

const bridgeText: CSSProperties = {
  color: '#cbd5e1',
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
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(255,255,255,.06)',
  color: '#e2e8f0',
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '0.04em',
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

const inputLabel: CSSProperties = {
  color: 'rgba(255,255,255,.64)',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
}

const inputRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: 10,
}

const input: CSSProperties = {
  minHeight: 46,
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
  minHeight: 46,
  minWidth: 64,
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
