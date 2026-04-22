import type { CSSProperties } from 'react'
import type { PlayerStage } from '../../types/player'
import type { PrimaryActionTone } from '../runtime'

interface PlayerHudProps {
  currentStage: PlayerStage | null
  level: number
  finished: boolean
  gpsState: string
  distanceMeters: number | null
  inRange: boolean
  debugEnabled: boolean
  followPlayer: boolean
  toolsOpen: boolean
  legacyPlayerHref: string
  legacyLoginHref: string
  adminHref: string
  primaryLabel: string
  primaryTone: PrimaryActionTone
  primaryDisabled: boolean
  helperText: string
  detailsOpen: boolean
  onPrimaryAction: () => void
  onToggleDetails: () => void
  onOpenTools: () => void
  onCloseTools: () => void
  onToggleDebug: () => void
}

function getGpsDisplay(gpsState: string): string {
  const value = String(gpsState || 'unknown').toLowerCase()
  if (value === 'ready') return 'GPS LIVE'
  if (value === 'stale') return 'LAST KNOWN'
  if (value === 'searching') return 'SEARCHING'
  if (value === 'error') return 'GPS ERROR'
  return 'NO GPS'
}

function getRangeDisplay(
  finished: boolean,
  distanceMeters: number | null,
  inRange: boolean
): string {
  if (finished) return 'COMPLETE'
  if (distanceMeters === null) return 'NO RANGE'
  if (inRange) return `${distanceMeters}M IN`
  return `${distanceMeters}M AWAY`
}

export function PlayerHud({
  currentStage,
  finished,
  gpsState,
  distanceMeters,
  inRange,
  debugEnabled,
  followPlayer,
  toolsOpen,
  legacyPlayerHref,
  legacyLoginHref,
  adminHref,
  primaryLabel,
  primaryTone,
  primaryDisabled,
  helperText,
  detailsOpen,
  onPrimaryAction,
  onToggleDetails,
  onOpenTools,
  onCloseTools,
  onToggleDebug,
}: PlayerHudProps) {
  const compact =
    typeof window !== 'undefined' ? window.innerWidth <= 560 : false

  const gpsDisplay = getGpsDisplay(gpsState)
  const rangeDisplay = getRangeDisplay(finished, distanceMeters, inRange)

  return (
    <>
      <section
        style={{
          ...card,
          width: compact ? '100%' : 'min(100%, 720px)',
          padding: compact ? 14 : 16,
        }}
      >
        <div style={eyebrow}>MISSION</div>

        <div style={{ ...title, fontSize: compact ? 18 : 22 }}>
          {finished ? 'Mission complete' : currentStage?.title || 'Awaiting node'}
        </div>

        <div style={chipRow}>
          <span style={chip}>{rangeDisplay}</span>
          {followPlayer ? <span style={chipInfo}>FOLLOW</span> : null}
          {debugEnabled ? <span style={chipDebug}>DEBUG</span> : null}
          {!debugEnabled ? <span style={chipMuted}>{gpsDisplay}</span> : null}
        </div>

        <button
          type="button"
          style={getPrimaryStyle(primaryTone, primaryDisabled)}
          disabled={primaryDisabled}
          onClick={onPrimaryAction}
        >
          {primaryLabel}
        </button>

        <div style={helper}>{helperText}</div>

        {detailsOpen ? (
          <div style={detailsCard}>
            <div style={detailRow}>
              <span style={detailLabel}>Node</span>
              <span style={detailValue}>{currentStage?.title || '—'}</span>
            </div>
            <div style={detailRow}>
              <span style={detailLabel}>Radius</span>
              <span style={detailValue}>
                {typeof currentStage?.radius === 'number' ? `${currentStage.radius} m` : '—'}
              </span>
            </div>
            <div style={detailRow}>
              <span style={detailLabel}>GPS</span>
              <span style={detailValue}>{gpsDisplay}</span>
            </div>
            <div style={detailRow}>
              <span style={detailLabel}>Range</span>
              <span style={detailValue}>{rangeDisplay}</span>
            </div>
          </div>
        ) : null}

        <div style={actionRow}>
          <button
            type="button"
            style={detailsOpen ? ghostButtonActive : ghostButton}
            onClick={onToggleDetails}
          >
            {detailsOpen ? 'Hide details' : 'Details'}
          </button>

          <button
            type="button"
            style={toolsOpen ? ghostButtonActive : ghostButton}
            onClick={onOpenTools}
          >
            {toolsOpen ? 'Close tools' : 'Tools'}
          </button>
        </div>
      </section>

      {toolsOpen ? (
        <div style={toolsOverlay}>
          <div style={toolsBackdrop} onClick={onCloseTools} />

          <aside
            style={{
              ...toolsSheet,
              width: compact ? '100%' : 'min(100%, 460px)',
            }}
            aria-modal="true"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div style={toolsHeader}>
              <div style={toolsTitle}>Tools</div>

              <button
                type="button"
                aria-label="Close tools"
                style={closeButton}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onCloseTools()
                }}
              >
                ×
              </button>
            </div>

            <button
              type="button"
              style={debugEnabled ? toolsButtonDangerActive : toolsButton}
              onClick={() => {
                onToggleDebug()
                onCloseTools()
              }}
            >
              {debugEnabled ? 'Disable local debug' : 'Enable local debug'}
            </button>

            <a
              href={adminHref}
              style={toolsLink}
              onClick={onCloseTools}
            >
              Admin
            </a>

            <a
              href={legacyLoginHref}
              style={toolsLink}
              onClick={onCloseTools}
            >
              Mission entry
            </a>

            <a
              href={legacyPlayerHref}
              style={toolsLinkMuted}
              onClick={onCloseTools}
            >
              Classic runtime
            </a>
          </aside>
        </div>
      ) : null}
    </>
  )
}

function getPrimaryStyle(tone: PrimaryActionTone, disabled: boolean): CSSProperties {
  if (disabled || tone === 'locked') {
    return {
      ...primaryBase,
      background: 'rgba(148,163,184,.22)',
      border: '1px solid rgba(255,255,255,.12)',
      color: 'rgba(255,255,255,.72)',
    }
  }

  if (tone === 'gps') {
    return {
      ...primaryBase,
      background: 'rgba(59,130,246,.18)',
      border: '1px solid rgba(96,165,250,.26)',
      color: '#dbeafe',
    }
  }

  if (tone === 'done') {
    return {
      ...primaryBase,
      background: 'rgba(168,85,247,.18)',
      border: '1px solid rgba(196,181,253,.24)',
      color: '#f3e8ff',
    }
  }

  if (tone === 'warn') {
    return {
      ...primaryBase,
      background: 'rgba(127,29,29,.22)',
      border: '1px solid rgba(248,113,113,.28)',
      color: '#fee2e2',
      boxShadow: '0 10px 24px rgba(127,29,29,.12)',
    }
  }

  return {
    ...primaryBase,
    background: 'linear-gradient(180deg, #22c55e, #16a34a)',
    border: '1px solid rgba(34,197,94,.22)',
    color: '#ffffff',
    boxShadow: '0 14px 30px rgba(34,197,94,.24)',
  }
}

const card: CSSProperties = {
  pointerEvents: 'auto',
  margin: '0 auto',
  display: 'grid',
  gap: 12,
  borderRadius: 28,
  background:
    'linear-gradient(180deg, rgba(100,116,139,.46), rgba(71,85,105,.34))',
  border: '1px solid rgba(255,255,255,.22)',
  boxShadow: '0 22px 60px rgba(15,23,42,.18)',
  backdropFilter: 'blur(24px) saturate(1.12)',
  WebkitBackdropFilter: 'blur(24px) saturate(1.12)',
}

const eyebrow: CSSProperties = {
  color: '#bbf7d0',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
}

const title: CSSProperties = {
  color: '#ffffff',
  fontWeight: 900,
  lineHeight: 1,
  letterSpacing: '-0.03em',
}

const chipRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
}

const chipBase: CSSProperties = {
  minHeight: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 10px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.12)',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const chip: CSSProperties = {
  ...chipBase,
  background: 'rgba(34,197,94,.12)',
  color: '#ecfdf5',
}

const chipMuted: CSSProperties = {
  ...chipBase,
  background: 'rgba(255,255,255,.10)',
  color: 'rgba(255,255,255,.88)',
}

const chipDebug: CSSProperties = {
  ...chipBase,
  background: 'rgba(127,29,29,.24)',
  border: '1px solid rgba(248,113,113,.28)',
  color: '#fecaca',
}

const chipInfo: CSSProperties = {
  ...chipBase,
  background: 'rgba(59,130,246,.18)',
  border: '1px solid rgba(96,165,250,.24)',
  color: '#dbeafe',
}

const primaryBase: CSSProperties = {
  width: '100%',
  minHeight: 48,
  borderRadius: 16,
  fontSize: 14,
  fontWeight: 900,
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
}

const helper: CSSProperties = {
  color: 'rgba(255,255,255,.82)',
  fontSize: 13,
  lineHeight: 1.45,
}

const detailsCard: CSSProperties = {
  display: 'grid',
  gap: 8,
  borderRadius: 18,
  padding: 12,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(255,255,255,.08)',
}

const detailRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
}

const detailLabel: CSSProperties = {
  color: 'rgba(255,255,255,.68)',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
}

const detailValue: CSSProperties = {
  color: '#ffffff',
  fontSize: 12,
  fontWeight: 800,
  textAlign: 'right',
}

const actionRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 10,
}

const ghostButton: CSSProperties = {
  minHeight: 42,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(15,23,42,.32)',
  color: '#ffffff',
  fontSize: 12,
  fontWeight: 800,
}

const ghostButtonActive: CSSProperties = {
  ...ghostButton,
  background: 'rgba(59,130,246,.16)',
  border: '1px solid rgba(96,165,250,.18)',
  color: '#dbeafe',
}

const toolsOverlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 4000,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  padding: 12,
  pointerEvents: 'auto',
}

const toolsBackdrop: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(2,6,23,.34)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
}

const toolsSheet: CSSProperties = {
  position: 'relative',
  zIndex: 2,
  borderRadius: 28,
  border: '1px solid rgba(255,255,255,.14)',
  background:
    'linear-gradient(180deg, rgba(13,23,42,.86), rgba(20,32,58,.78))',
  boxShadow:
    '0 26px 60px rgba(2,6,23,.32), inset 0 1px 0 rgba(255,255,255,.08)',
  padding: '16px 16px calc(16px + env(safe-area-inset-bottom, 0px))',
  display: 'grid',
  gap: 12,
  pointerEvents: 'auto',
  color: '#f8fafc',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
}

const toolsHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
}

const toolsTitle: CSSProperties = {
  color: '#ffffff',
  fontSize: 22,
  fontWeight: 900,
  lineHeight: 1,
  letterSpacing: '-0.03em',
}

const closeButton: CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.14)',
  background: 'rgba(255,255,255,.08)',
  color: '#f8fafc',
  fontSize: 22,
  fontWeight: 900,
  lineHeight: 1,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const toolsButton: CSSProperties = {
  minHeight: 46,
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.08)',
  color: '#f8fafc',
  fontSize: 12,
  fontWeight: 900,
}

const toolsButtonDangerActive: CSSProperties = {
  ...toolsButton,
  background: 'rgba(220,38,38,.18)',
  border: '1px solid rgba(248,113,113,.22)',
  color: '#fee2e2',
}

const toolsLink: CSSProperties = {
  minHeight: 46,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.08)',
  color: '#ffffff',
  fontSize: 12,
  fontWeight: 800,
  textDecoration: 'none',
}

const toolsLinkMuted: CSSProperties = {
  ...toolsLink,
  color: 'rgba(226,232,240,.82)',
}
