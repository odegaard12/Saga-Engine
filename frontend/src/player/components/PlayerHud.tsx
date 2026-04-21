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
      <style>{hudAnimations}</style>

      <section
        style={{
          ...tray,
          width: compact ? '100%' : 'min(100%, 760px)',
          padding: compact ? 14 : 16,
          gap: compact ? 10 : 12,
        }}
      >
        {finished ? (
          <>
            <div style={heroBlock}>
              <div style={eyebrow}>MISSION</div>
              <div style={heroTitle}>Mission complete</div>
              <div style={heroText}>
                The route is finished. You can review details or open the menu.
              </div>
            </div>

            <div style={chipRow}>
              <MetricChip label="Status" value="Complete" tone="good" />
              <MetricChip label="GPS" value={gpsDisplay} tone="neutral" />
            </div>

            <button
              type="button"
              style={getPrimaryStyle('done', true, compact)}
              disabled
            >
              Mission complete
            </button>
          </>
        ) : (
          <>
            <div style={heroBlock}>
              <div style={eyebrow}>MISSION</div>
              <div style={{ ...heroTitle, fontSize: compact ? 20 : 24 }}>
                {currentStage?.title || 'Awaiting node'}
              </div>

              <div style={chipRow}>
                <MetricChip label="Stage" value={`${level + 1}`} tone="neutral" />
                <MetricChip label="GPS" value={gpsDisplay} tone={gpsState === 'ready' ? 'good' : 'neutral'} />
                <MetricChip label="Range" value={distanceDisplay} tone={inRange ? 'good' : 'neutral'} />
                {debugEnabled ? <MetricChip label="Mode" value="Debug" tone="warn" /> : null}
              </div>
            </div>

            <button
              type="button"
              style={getPrimaryStyle(primaryTone, primaryDisabled, compact)}
              disabled={primaryDisabled}
              onClick={onPrimaryAction}
            >
              {primaryLabel}
            </button>
          </>
        )}

        <div style={helperLine}>{helperText}</div>

        <div style={actionRow}>
          <button
            type="button"
            style={detailsOpen ? glassGhostActive : glassGhost}
            onClick={onToggleDetails}
          >
            {detailsOpen ? 'Hide details' : 'Details'}
          </button>

          <button
            type="button"
            style={menuOpen ? glassGhostActive : glassGhost}
            onClick={onToggleMenu}
          >
            {menuOpen ? 'Close menu' : 'Menu'}
          </button>
        </div>

        {detailsOpen ? (
          <div style={detailGrid}>
            <DetailCard label="Distance" value={distanceMeters === null ? 'No range' : `${distanceMeters} m`} />
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

        {mapNotice ? <div style={hiddenNotice}>{mapNotice}</div> : null}
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
              <div style={menuTitle}>Field menu</div>

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
              style={debugEnabled ? menuButtonDangerActive : menuButton}
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

function MetricChip({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'good' | 'warn' | 'info' | 'neutral'
}) {
  return (
    <div
      style={{
        ...metricChip,
        ...(tone === 'good'
          ? metricGood
          : tone === 'warn'
          ? metricWarn
          : tone === 'info'
          ? metricInfo
          : null),
      }}
    >
      <span style={metricLabel}>{label}</span>
      <span style={metricValue}>{value}</span>
    </div>
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
    minHeight: compact ? 52 : 56,
    borderRadius: 18,
    fontSize: compact ? 13 : 14,
    fontWeight: 900,
    letterSpacing: '0.08em',
  }

  if (disabled || tone === 'locked') {
    return {
      ...base,
      border: '1px solid rgba(255,255,255,.12)',
      background: 'rgba(255,255,255,.10)',
      color: 'rgba(226,232,240,.82)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,.05)',
    }
  }

  if (tone === 'gps') {
    return {
      ...base,
      border: '1px solid rgba(251,191,36,.24)',
      background: 'rgba(217,119,6,.16)',
      color: '#fde68a',
    }
  }

  if (tone === 'done') {
    return {
      ...base,
      border: '1px solid rgba(96,165,250,.24)',
      background: 'rgba(59,130,246,.14)',
      color: '#dbeafe',
    }
  }

  return {
    ...base,
    border: '1px solid rgba(74,222,128,.22)',
    background: 'linear-gradient(180deg, #22c55e, #16a34a)',
    color: '#ffffff',
    boxShadow: '0 14px 28px rgba(22,163,74,.26)',
  }
}

const tray: CSSProperties = {
  pointerEvents: 'auto',
  margin: '0 auto',
  borderRadius: 30,
  border: '1px solid rgba(255,255,255,.14)',
  background:
    'linear-gradient(180deg, rgba(13,23,42,.76), rgba(20,32,58,.64))',
  boxShadow:
    '0 26px 60px rgba(2,6,23,.26), inset 0 1px 0 rgba(255,255,255,.08)',
  backdropFilter: 'blur(20px) saturate(150%)',
  WebkitBackdropFilter: 'blur(20px) saturate(150%)',
  color: '#f8fafc',
  display: 'grid',
  animation: 'sagaHudRise 220ms cubic-bezier(0.22, 1, 0.36, 1)',
}

const heroBlock: CSSProperties = {
  display: 'grid',
  gap: 6,
}

const eyebrow: CSSProperties = {
  color: '#86efac',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.16em',
}

const heroTitle: CSSProperties = {
  color: '#ffffff',
  fontSize: 26,
  fontWeight: 900,
  lineHeight: 0.98,
  letterSpacing: '-0.04em',
}

const heroText: CSSProperties = {
  color: 'rgba(226,232,240,.82)',
  fontSize: 13,
  lineHeight: 1.45,
}

const chipRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  marginTop: 2,
}

const metricChip: CSSProperties = {
  minHeight: 28,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 10px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.08)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.04)',
}

const metricGood: CSSProperties = {
  background: 'rgba(34,197,94,.16)',
  border: '1px solid rgba(74,222,128,.18)',
}

const metricWarn: CSSProperties = {
  background: 'rgba(245,158,11,.16)',
  border: '1px solid rgba(251,191,36,.18)',
}

const metricInfo: CSSProperties = {
  background: 'rgba(59,130,246,.16)',
  border: '1px solid rgba(96,165,250,.18)',
}

const metricLabel: CSSProperties = {
  color: 'rgba(226,232,240,.74)',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.10em',
}

const metricValue: CSSProperties = {
  color: '#ffffff',
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: '0.02em',
}

const helperLine: CSSProperties = {
  color: 'rgba(226,232,240,.78)',
  fontSize: 13,
  lineHeight: 1.45,
}

const actionRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 10,
}

const glassGhost: CSSProperties = {
  minHeight: 42,
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(2,6,23,.30)',
  color: '#f8fafc',
  fontSize: 12,
  fontWeight: 800,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.04)',
}

const glassGhostActive: CSSProperties = {
  ...glassGhost,
  background: 'rgba(59,130,246,.16)',
  border: '1px solid rgba(96,165,250,.18)',
  color: '#dbeafe',
}

const detailGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 10,
}

const detailCard: CSSProperties = {
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(255,255,255,.06)',
  padding: '12px 12px',
  minWidth: 0,
}

const detailLabel: CSSProperties = {
  color: 'rgba(226,232,240,.70)',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.14em',
}

const detailValue: CSSProperties = {
  color: '#ffffff',
  fontSize: 13,
  fontWeight: 800,
  marginTop: 6,
  lineHeight: 1.15,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const hiddenNotice: CSSProperties = {
  display: 'none',
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
  background: 'rgba(2,6,23,.34)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  animation: 'sagaFadeIn 160ms ease-out',
}

const menuSheet: CSSProperties = {
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
  animation: 'sagaSheetUp 220ms cubic-bezier(0.22, 1, 0.36, 1)',
  pointerEvents: 'auto',
  color: '#f8fafc',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
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

const menuButton: CSSProperties = {
  minHeight: 46,
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.08)',
  color: '#f8fafc',
  fontSize: 12,
  fontWeight: 900,
}

const menuButtonDangerActive: CSSProperties = {
  ...menuButton,
  background: 'rgba(220,38,38,.18)',
  border: '1px solid rgba(248,113,113,.22)',
  color: '#fee2e2',
}

const menuLink: CSSProperties = {
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

const menuLinkMuted: CSSProperties = {
  ...menuLink,
  color: 'rgba(226,232,240,.82)',
}

const hudAnimations = `
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
`
