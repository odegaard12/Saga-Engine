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
  mapNotice: string | null
  legacyPlayerHref: string
  legacyLoginHref: string
  adminHref: string
  detailsOpen: boolean
  menuOpen: boolean
  primaryLabel: string
  primaryTone: PrimaryActionTone
  primaryDisabled: boolean
  helperText: string
  onPrimaryAction: () => void
  onToggleDetails: () => void
  onToggleMenu: () => void
  onCloseMenu: () => void
  onToggleDebug: () => void
}

function getGpsDisplay(gpsState: string): string {
  const value = String(gpsState || 'unknown').toLowerCase()
  if (value === 'ready') return 'Live'
  if (value === 'stale') return 'Last known'
  if (value === 'searching') return 'Searching'
  if (value === 'error') return 'Error'
  return 'Unavailable'
}

function getDistanceDisplay(
  finished: boolean,
  distanceMeters: number | null,
  inRange: boolean
): string {
  if (finished) return 'Complete'
  if (distanceMeters === null) return 'No range'
  if (inRange) return `${distanceMeters}m in range`
  return `${distanceMeters}m away`
}

export function PlayerHud({
  currentStage,
  level,
  finished,
  gpsState,
  distanceMeters,
  inRange,
  debugEnabled,
  mapNotice,
  legacyPlayerHref,
  legacyLoginHref,
  adminHref,
  detailsOpen,
  menuOpen,
  primaryLabel,
  primaryTone,
  primaryDisabled,
  helperText,
  onPrimaryAction,
  onToggleDetails,
  onToggleMenu,
  onCloseMenu,
  onToggleDebug,
}: PlayerHudProps) {
  const compact =
    typeof window !== 'undefined' ? window.innerWidth <= 560 : false

  const distanceDisplay = getDistanceDisplay(finished, distanceMeters, inRange)
  const gpsDisplay = getGpsDisplay(gpsState)

  return (
    <>
      <style>{animations}</style>

      <section
        style={{
          ...tray,
          width: compact ? '100%' : 'min(100%, 760px)',
          padding: compact ? 10 : 14,
          gap: compact ? 8 : 10,
        }}
      >
        {finished ? (
          <div style={hero}>
            <div style={eyebrow}>MISSION</div>
            <div style={title}>Mission complete</div>
            <div style={helper}>{helperText}</div>
          </div>
        ) : (
          <div style={hero}>
            <div style={eyebrow}>MISSION</div>
            <div style={title}>{currentStage?.title || 'Awaiting node'}</div>
            <div style={subRow}>
              <span style={pill}>STAGE {level + 1}</span>
              <span style={pill}>{gpsDisplay}</span>
              <span style={pill}>{distanceDisplay}</span>
              {debugEnabled ? <span style={pillActive}>DEBUG</span> : null}
            </div>
          </div>
        )}

        {!finished ? (
          <button
            type="button"
            style={getPrimaryStyle(primaryTone, primaryDisabled, compact)}
            disabled={primaryDisabled}
            onClick={onPrimaryAction}
          >
            {primaryLabel}
          </button>
        ) : (
          <button type="button" style={getPrimaryStyle('done', true, compact)} disabled>
            Mission complete
          </button>
        )}

        <div style={helper}>{helperText}</div>

        <div style={actionRow}>
          <button
            type="button"
            style={getGhostButton(detailsOpen, compact)}
            onClick={onToggleDetails}
          >
            {detailsOpen ? 'Hide details' : 'Details'}
          </button>

          <button
            type="button"
            style={getGhostButton(menuOpen, compact)}
            onClick={onToggleMenu}
          >
            {menuOpen ? 'Close menu' : 'Menu'}
          </button>
        </div>

        {detailsOpen ? (
          <div style={detailGrid}>
            <DetailCard
              label="Distance"
              value={distanceMeters === null ? 'No range' : `${distanceMeters} m`}
            />
            <DetailCard label="GPS" value={gpsDisplay} />
            <DetailCard
              label="Radius"
              value={typeof currentStage?.radius === 'number' ? `${currentStage.radius} m` : '—'}
            />
            <DetailCard
              label="Lat"
              value={typeof currentStage?.lat === 'number' ? currentStage.lat.toFixed(5) : '—'}
            />
          </div>
        ) : null}

        {mapNotice ? <div style={mapNoticeStyle}>{mapNotice}</div> : null}
      </section>

      {menuOpen ? (
        <div style={menuOverlay}>
          <div style={menuBackdrop} onClick={onCloseMenu} />
          <aside
            style={{
              ...menuSheet,
              width: compact ? '100%' : 'min(100%, 460px)',
            }}
            aria-modal="true"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div style={menuHeader}>
              <div style={menuTitle}>Mission menu</div>
              <button
                type="button"
                aria-label="Close menu"
                style={closeButton}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onCloseMenu()
                }}
              >
                ×
              </button>
            </div>

            <button
              type="button"
              style={debugEnabled ? menuButtonActive : menuButton}
              onClick={onToggleDebug}
            >
              {debugEnabled ? 'Disable local debug' : 'Enable local debug'}
            </button>

            <a href={adminHref} style={menuLink}>
              Admin
            </a>

            <a href={legacyLoginHref} style={menuLink}>
              Mission entry
            </a>

            <a href={legacyPlayerHref} style={menuLinkMuted}>
              Classic runtime
            </a>
          </aside>
        </div>
      ) : null}
    </>
  )
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={detailCard}>
      <div style={detailLabel}>{label}</div>
      <div style={detailValue}>{value}</div>
    </div>
  )
}

function getPrimaryStyle(
  tone: PrimaryActionTone,
  disabled: boolean,
  compact: boolean
): CSSProperties {
  const base: CSSProperties = {
    width: '100%',
    minHeight: compact ? 48 : 52,
    borderRadius: 16,
    fontSize: compact ? 13 : 14,
    fontWeight: 900,
    letterSpacing: '0.08em',
  }

  if (disabled || tone === 'locked') {
    return {
      ...base,
      border: '1px solid rgba(255,255,255,.10)',
      background: 'rgba(148,163,184,.22)',
      color: '#cbd5e1',
    }
  }

  if (tone === 'gps') {
    return {
      ...base,
      border: '1px solid rgba(245,158,11,.24)',
      background: 'rgba(245,158,11,.16)',
      color: '#fde68a',
    }
  }

  if (tone === 'done') {
    return {
      ...base,
      border: '1px solid rgba(59,130,246,.24)',
      background: 'rgba(59,130,246,.16)',
      color: '#dbeafe',
    }
  }

  return {
    ...base,
    border: '1px solid rgba(22,163,74,.24)',
    background: 'linear-gradient(180deg, rgba(22,163,74,.92), rgba(21,128,61,.92))',
    color: '#ffffff',
    boxShadow: '0 10px 24px rgba(22,163,74,.22)',
    animation: 'sagaPrimaryPulse 1.8s ease-in-out infinite',
  }
}

function getGhostButton(active: boolean, compact: boolean): CSSProperties {
  return {
    minHeight: compact ? 40 : 44,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    border: active ? '1px solid rgba(59,130,246,.24)' : '1px solid rgba(255,255,255,.10)',
    background: active ? 'rgba(59,130,246,.14)' : 'rgba(2,6,23,.68)',
    color: active ? '#dbeafe' : '#e2e8f0',
    fontSize: compact ? 11 : 12,
    fontWeight: 800,
    padding: '0 12px',
  }
}

const tray: CSSProperties = {
  pointerEvents: 'auto',
  margin: '0 auto',
  borderRadius: 22,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'linear-gradient(180deg, rgba(2,6,23,.88), rgba(15,23,42,.74))',
  boxShadow: '0 18px 40px rgba(2,6,23,.20)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  color: '#f8fafc',
  display: 'grid',
  animation: 'sagaHudRise 220ms cubic-bezier(0.22, 1, 0.36, 1)',
}

const hero: CSSProperties = {
  display: 'grid',
  gap: 6,
}

const eyebrow: CSSProperties = {
  color: '#6ee7b7',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.16em',
}

const title: CSSProperties = {
  color: '#ffffff',
  fontSize: 24,
  fontWeight: 900,
  lineHeight: 0.98,
  letterSpacing: '-0.04em',
}

const subRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
}

const pill: CSSProperties = {
  minHeight: 24,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 10px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.05)',
  color: '#cbd5e1',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.12em',
}

const pillActive: CSSProperties = {
  ...pill,
  border: '1px solid rgba(22,163,74,.24)',
  background: 'rgba(22,163,74,.16)',
  color: '#dcfce7',
}

const helper: CSSProperties = {
  color: '#cbd5e1',
  fontSize: 13,
  lineHeight: 1.4,
}

const actionRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 8,
}

const detailGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 8,
}

const detailCard: CSSProperties = {
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.05)',
  padding: '10px 12px',
  minWidth: 0,
}

const detailLabel: CSSProperties = {
  color: '#94a3b8',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.14em',
}

const detailValue: CSSProperties = {
  color: '#f8fafc',
  fontSize: 13,
  fontWeight: 800,
  marginTop: 6,
  lineHeight: 1.15,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const mapNoticeStyle: CSSProperties = {
  color: '#fde68a',
  fontSize: 12,
  lineHeight: 1.35,
}

const menuOverlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 4000,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  padding: 12,
  pointerEvents: 'auto',
}

const menuBackdrop: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(15,23,42,.34)',
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
  animation: 'sagaFadeIn 160ms ease-out',
}

const menuSheet: CSSProperties = {
  position: 'relative',
  zIndex: 2,
  borderRadius: 24,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(2,6,23,.96)',
  boxShadow: '0 18px 40px rgba(2,6,23,.24)',
  padding: '16px 16px calc(16px + env(safe-area-inset-bottom, 0px))',
  display: 'grid',
  gap: 12,
  animation: 'sagaSheetUp 220ms cubic-bezier(0.22, 1, 0.36, 1)',
  pointerEvents: 'auto',
}

const menuHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
}

const menuTitle: CSSProperties = {
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
  border: '1px solid rgba(239,68,68,.24)',
  background: 'rgba(239,68,68,.14)',
  color: '#fecaca',
  fontSize: 22,
  fontWeight: 900,
  lineHeight: 1,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const menuButton: CSSProperties = {
  minHeight: 46,
  borderRadius: 16,
  border: '1px solid rgba(245,158,11,.24)',
  background: 'rgba(245,158,11,.14)',
  color: '#fde68a',
  fontSize: 12,
  fontWeight: 900,
}

const menuButtonActive: CSSProperties = {
  minHeight: 46,
  borderRadius: 16,
  border: '1px solid rgba(22,163,74,.24)',
  background: 'rgba(22,163,74,.16)',
  color: '#dcfce7',
  fontSize: 12,
  fontWeight: 900,
}

const menuLink: CSSProperties = {
  minHeight: 46,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(255,255,255,.05)',
  color: '#f8fafc',
  fontSize: 12,
  fontWeight: 800,
  textDecoration: 'none',
}

const menuLinkMuted: CSSProperties = {
  ...menuLink,
  color: '#cbd5e1',
}

const animations = `
@keyframes sagaFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes sagaHudRise {
  from {
    opacity: 0;
    transform: translateY(10px) scale(.992);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
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

@keyframes sagaPrimaryPulse {
  0% {
    box-shadow: 0 10px 24px rgba(22,163,74,.18);
    transform: scale(1);
  }
  50% {
    box-shadow: 0 14px 30px rgba(22,163,74,.28);
    transform: scale(1.01);
  }
  100% {
    box-shadow: 0 10px 24px rgba(22,163,74,.18);
    transform: scale(1);
  }
}
`
