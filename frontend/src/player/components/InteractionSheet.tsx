import { useState, type FormEvent } from 'react'
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

  if (!open || !currentStage) return null

  const typeLabel = (currentStage.type || 'interaction')
    .replace(/_/g, ' ')
    .toUpperCase()

  const narrative = currentStage.content?.trim() || helperText
  const hint = currentStage.messages?.hint?.trim() || ''
  const minigameDefinition = resolveMinigameDefinition(currentStage.type)
  const hasNativeMinigame = Boolean(minigameDefinition)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalized = code.trim().toUpperCase()
    if (!normalized || submitting) return
    await onSubmitCode(normalized)
  }

  async function handleNativeWin() {
    await onSubmitCode('OK')
  }

  return (
    <div style={overlay}>
      <div style={backdrop} onClick={submitting ? undefined : onClose} />

      <section style={sheet} aria-modal="true" role="dialog">
        <div style={headerRow}>
          <div style={headerCopy}>
            <div style={eyebrow}>INTERACTION</div>
            <div style={title}>{currentStage.title}</div>
            <div style={metaRow}>
              <span style={typeBadge}>{typeLabel}</span>
              <span style={metaText}>USER {user}</span>
            </div>
          </div>

          <button
            type="button"
            style={closeButton}
            onClick={onClose}
            disabled={submitting}
          >
            CLOSE
          </button>
        </div>

        <div style={contentStack}>
          {narrative ? (
            <section style={card}>
              <div style={cardLabel}>MISSION CONTEXT</div>
              <div style={cardText}>{narrative}</div>
            </section>
          ) : null}

          {hint ? (
            <section style={card}>
              <div style={cardLabel}>HINT</div>
              <div style={cardText}>{hint}</div>
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
            <section style={card}>
              <div style={cardLabel}>CURRENT BRIDGE MODE</div>
              <div style={cardText}>
                React already controls the player shell and submission flow. Until
                this interaction gets a native React module, you can submit a
                manual stage code here or open the legacy player for the full
                interaction.
              </div>
            </section>
          )}
        </div>

        <form style={formWrap} onSubmit={handleSubmit}>
          <label htmlFor="interaction-code" style={inputLabel}>
            {hasNativeMinigame ? 'MANUAL FALLBACK CODE' : 'ENTER STAGE CODE'}
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
          {hasNativeMinigame && minigameDefinition ? (
            <div style={footerNote}>
              Native module active: {minigameDefinition.label}
            </div>
          ) : null}

          <a href={legacyPlayerHref} style={legacyLink}>
            OPEN LEGACY INTERACTION
          </a>
        </div>
      </section>
    </div>
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
  background: 'rgba(2,6,23,.56)',
  backdropFilter: 'blur(6px)',
}

const sheet: React.CSSProperties = {
  position: 'relative',
  width: 'min(100%, 760px)',
  maxHeight: 'calc(100vh - 24px)',
  overflowY: 'auto',
  borderRadius: 28,
  border: '1px solid rgba(255,255,255,.14)',
  background:
    'linear-gradient(180deg, rgba(15,23,42,.94), rgba(15,23,42,.88))',
  boxShadow: '0 30px 70px rgba(2,6,23,.42)',
  color: '#f8fafc',
  padding: 18,
  display: 'grid',
  gap: 16,
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

const typeBadge: React.CSSProperties = {
  minHeight: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 10px',
  borderRadius: 999,
  background: 'rgba(59,130,246,.16)',
  border: '1px solid rgba(96,165,250,.20)',
  color: '#dbeafe',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.12em',
}

const metaText: React.CSSProperties = {
  minHeight: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 10px',
  borderRadius: 999,
  background: 'rgba(255,255,255,.06)',
  border: '1px solid rgba(255,255,255,.08)',
  color: '#cbd5e1',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.12em',
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

const contentStack: React.CSSProperties = {
  display: 'grid',
  gap: 12,
}

const card: React.CSSProperties = {
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.05)',
  padding: 14,
}

const cardLabel: React.CSSProperties = {
  color: 'rgba(148,163,184,.92)',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.16em',
}

const cardText: React.CSSProperties = {
  marginTop: 8,
  color: '#e2e8f0',
  fontSize: 14,
  lineHeight: 1.55,
  whiteSpace: 'pre-wrap',
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

const footerNote: React.CSSProperties = {
  minHeight: 44,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 14px',
  borderRadius: 14,
  border: '1px solid rgba(34,197,94,.18)',
  background: 'rgba(34,197,94,.10)',
  color: '#dcfce7',
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: '0.08em',
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
