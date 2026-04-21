import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import type { PlayerStage } from '../../types/player'
import { resolveMinigameDefinition } from '../minigames/registry'
import { MinigameHost } from './MinigameHost'

interface InteractionSheetProps {
  open: boolean
  currentStage: PlayerStage | null
  summaryText: string
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
  currentStage,
  summaryText,
  submitting,
  errorMessage,
  onClose,
  onSubmitCode,
}: InteractionSheetProps) {
  const [code, setCode] = useState('')
  const [showRecovery, setShowRecovery] = useState(false)

  const stageId = currentStage?.id ?? null
  const stageType = currentStage?.minigame?.type ?? currentStage?.type ?? null
  const minigameDefinition = stageType
    ? resolveMinigameDefinition(stageType)
    : null

  useEffect(() => {
    setCode('')
    setShowRecovery(false)
  }, [stageId])

  useEffect(() => {
    if (open && currentStage) {
      vibrate([8, 12, 8])
    }
  }, [open, stageId, currentStage])

  if (!open || !currentStage) return null

  const compact =
    typeof window !== 'undefined' ? window.innerWidth <= 760 : false

  const hasNarrative = isMeaningfulNarrative(currentStage)
  const narrative = hasNarrative ? currentStage.content?.trim() || '' : ''
  const hint = currentStage.messages?.hint?.trim() || ''
  const minigameLabel = currentStage.minigame?.label || minigameDefinition?.label || 'Node workspace'
  const versionLabel = currentStage.minigame?.version || minigameDefinition?.version || 'v1'

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
    if (submitting) return
    vibrate(10)
    onClose()
  }

  return (
    <>
      <style>{workspaceAnimations}</style>

      <div style={overlay}>
        <div style={backdrop} onClick={handleClose} />

        <section style={workspace} aria-modal="true" role="dialog">
          <header style={header}>
            <div style={headerCopy}>
              <div style={eyebrow}>NODE WORKSPACE</div>
              <div style={title}>{currentStage.title}</div>
              <div style={subtitle}>
                {minigameLabel} · {String(versionLabel).toUpperCase()}
              </div>
            </div>

            <button
              type="button"
              style={closeButton}
              onClick={handleClose}
              disabled={submitting}
            >
              ×
            </button>
          </header>

          <div
            style={{
              ...contentGrid,
              gridTemplateColumns: compact ? '1fr' : 'minmax(320px, 380px) minmax(0, 1fr)',
            }}
          >
            <aside style={briefingPanel}>
              <section style={briefCard}>
                <div style={sectionEyebrow}>MISSION BRIEF</div>
                <div style={sectionBody}>{summaryText}</div>
              </section>

              {hasNarrative ? (
                <section style={briefCard}>
                  <div style={sectionEyebrow}>NODE TEXT</div>
                  <div style={sectionBody}>{narrative}</div>
                </section>
              ) : null}

              {hint ? (
                <section style={hintCard}>
                  <div style={sectionEyebrow}>FIELD HINT</div>
                  <div style={sectionBody}>{hint}</div>
                </section>
              ) : null}

              <section style={fallbackWrap}>
                <button
                  type="button"
                  style={fallbackToggle}
                  onClick={() => setShowRecovery((current) => !current)}
                >
                  {showRecovery ? 'HIDE FALLBACK' : 'OPEN FALLBACK'}
                </button>

                {showRecovery ? (
                  <div style={fallbackPanel}>
                    <div style={fallbackCopy}>
                      Manual recovery should be the exception, not the main flow.
                    </div>

                    <form style={formWrap} onSubmit={handleSubmit}>
                      <input
                        id="interaction-code"
                        value={code}
                        onChange={(event) => setCode(event.target.value.toUpperCase())}
                        placeholder="ENTER CODE"
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
                        {submitting ? 'SYNC...' : 'SUBMIT'}
                      </button>
                    </form>

                    {errorMessage ? <div style={errorText}>{errorMessage}</div> : null}
                  </div>
                ) : null}
              </section>
            </aside>

            <main style={playPanel}>
              {minigameDefinition ? (
                <MinigameHost
                  definition={minigameDefinition}
                  stage={currentStage}
                  helperText={summaryText}
                  submitting={submitting}
                  onWin={handleNativeWin}
                />
              ) : (
                <section style={bridgeCard}>
                  <div style={bridgeTitle}>No native interaction is available yet.</div>
                  <div style={bridgeBody}>
                    This node still needs a proper React-native gameplay implementation.
                  </div>
                </section>
              )}
            </main>
          </div>
        </section>
      </div>
    </>
  )
}

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 4000,
}

const backdrop: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(2,6,23,.78)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  animation: 'sagaFadeIn 160ms ease-out',
}

const workspace: CSSProperties = {
  position: 'relative',
  zIndex: 2,
  width: '100%',
  height: '100dvh',
  maxHeight: '100dvh',
  overflow: 'auto',
  padding:
    'max(16px, env(safe-area-inset-top, 0px)) 16px max(16px, env(safe-area-inset-bottom, 0px))',
  background:
    'radial-gradient(circle at top, rgba(22,163,74,.14), transparent 30%), linear-gradient(180deg, #020617 0%, #07111c 100%)',
  color: '#f8fafc',
  display: 'grid',
  gap: 16,
}

const header: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
}

const headerCopy: CSSProperties = {
  minWidth: 0,
}

const eyebrow: CSSProperties = {
  color: '#86efac',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.18em',
}

const title: CSSProperties = {
  marginTop: 6,
  color: '#ffffff',
  fontSize: 30,
  fontWeight: 900,
  lineHeight: 0.96,
  letterSpacing: '-0.04em',
}

const subtitle: CSSProperties = {
  marginTop: 8,
  color: '#94a3b8',
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
}

const closeButton: CSSProperties = {
  width: 42,
  height: 42,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.06)',
  color: '#f8fafc',
  fontSize: 24,
  fontWeight: 900,
  lineHeight: 1,
}

const contentGrid: CSSProperties = {
  display: 'grid',
  gap: 16,
  alignItems: 'start',
}

const briefingPanel: CSSProperties = {
  display: 'grid',
  gap: 12,
  alignSelf: 'start',
}

const playPanel: CSSProperties = {
  minWidth: 0,
  display: 'grid',
  gap: 12,
  alignSelf: 'start',
}

const briefCard: CSSProperties = {
  borderRadius: 20,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(15,23,42,.62)',
  padding: 14,
  display: 'grid',
  gap: 8,
}

const hintCard: CSSProperties = {
  borderRadius: 20,
  border: '1px solid rgba(245,158,11,.14)',
  background: 'rgba(120,53,15,.24)',
  padding: 14,
  display: 'grid',
  gap: 8,
}

const sectionEyebrow: CSSProperties = {
  color: '#cbd5e1',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.16em',
}

const sectionBody: CSSProperties = {
  color: '#e2e8f0',
  fontSize: 14,
  lineHeight: 1.55,
  whiteSpace: 'pre-wrap',
}

const fallbackWrap: CSSProperties = {
  display: 'grid',
  gap: 10,
}

const fallbackToggle: CSSProperties = {
  minHeight: 44,
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(255,255,255,.05)',
  color: '#e2e8f0',
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: '0.10em',
}

const fallbackPanel: CSSProperties = {
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(15,23,42,.52)',
  padding: 12,
  display: 'grid',
  gap: 10,
}

const fallbackCopy: CSSProperties = {
  color: '#94a3b8',
  fontSize: 13,
  lineHeight: 1.45,
}

const formWrap: CSSProperties = {
  display: 'grid',
  gap: 10,
}

const input: CSSProperties = {
  minHeight: 48,
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(2,6,23,.62)',
  color: '#f8fafc',
  fontSize: 14,
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  padding: '0 14px',
  outline: 'none',
}

const submitButton: CSSProperties = {
  minHeight: 48,
  borderRadius: 16,
  border: '1px solid rgba(34,197,94,.24)',
  background: 'linear-gradient(180deg, rgba(34,197,94,.24), rgba(22,163,74,.16))',
  color: '#dcfce7',
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: '0.10em',
}

const errorText: CSSProperties = {
  color: '#fecaca',
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.4,
}

const bridgeCard: CSSProperties = {
  borderRadius: 24,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(15,23,42,.62)',
  padding: 18,
  display: 'grid',
  gap: 10,
}

const bridgeTitle: CSSProperties = {
  color: '#ffffff',
  fontSize: 20,
  fontWeight: 900,
  lineHeight: 1.05,
}

const bridgeBody: CSSProperties = {
  color: '#cbd5e1',
  fontSize: 14,
  lineHeight: 1.5,
}

const workspaceAnimations = `
@keyframes sagaFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
`
