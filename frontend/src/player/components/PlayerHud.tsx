import type { CSSProperties } from 'react'
import type { PlayerStage } from '../../types/player'
import type { PrimaryActionTone } from '../runtime'
import { tokens } from '../ui/tokens'

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
          width: compact ? '100%' : 'min(100%, 720px)',
          padding: compact ? 10 : 14,
          gap: compact ? 8 : 10,
        }}
      >
        {finished ? (
          <>
            <div style={completeHero}>
              <div style={completeLabel}>MISSION</div>
              <div style={completeTitle}>Mission complete</div>
              <div style={completeText}>
                The route is finished. You can review details or open the menu.
              </div>
            </div>

            <div style={metricRow}>
              <MetricPill label="Status" value="Complete" tone="good" />
              <MetricPill label="GPS" value={gpsDisplay} tone="neutral" />
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
            <div style={titleRow}>
              <div style={titleBlock}>
                <div style={eyebrow}>MISSION</div>
                <div style={{ ...title, fontSize: compact ? 18 : 22 }}>
                  {currentStage?.title || 'Awaiting node'}
                </div>
              </div>

              <div style={titleMeta}>
                <span style={stagePill}>{`STAGE ${level + 1}`}</span>
                {debugEnabled ? <span style={debugPill}>DEBUG</span> : null}
              </div>
            </div>

            <div style={metricRow}>
              <MetricPill
                label="Range"
                value={distanceDisplay}
                tone={inRange ? 'good' : 'neutral'}
              />
              <MetricPill
                label="GPS"
                value={gpsDisplay}
                tone={gpsState === 'ready' ? 'good' : gpsState === 'stale' ? 'warn' : 'neutral'}
              />
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

function MetricPill({
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
        ...metricPill,
        ...(tone === 'good'
          ? metricGood
          : tone === 'warn'
          ? metricWarn
          : tone === 'info'
          ? metricInfo
          : null),
      }}
    >
      <div style={metricLabel}>{label}</div>
      <div style={metricValue}>{value}</div>
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
    minHeight: compact ? 48 : 52,
    borderRadius: 16,
    fontSize: compact ? 13 : 14,
    fontWeight: 900,
    letterSpacing: '0.08em',
  }

  if (disabled || tone === 'locked') {
    return {
      ...base,
      border: `1px solid ${tokens.colors.border}`,
      background: '#e2e8f0',
      color: tokens.colors.muted,
    }
  }

  if (tone === 'gps') {
    return {
      ...base,
      border: `1px solid ${tokens.colors.warnLine}`,
      background: tokens.colors.warnSoft,
      color: tokens.colors.warn,
    }
  }

  if (tone === 'done') {
    return {
      ...base,
      border: `1px solid ${tokens.colors.infoLine}`,
      background: tokens.colors.infoSoft,
      color: tokens.colors.info,
    }
  }

  return {
    ...base,
    border: `1px solid ${tokens.colors.brandLine}`,
    background: 'linear-gradient(180deg, #16a34a, #15803d)',
    color: '#ffffff',
    boxShadow: '0 10px 24px rgba(22,163,74,.22)',
    animation: tone === 'ready' ? 'sagaPrimaryPulse 1.8s ease-in-out infinite' : 'none',
  }
}

function getGhostButton(active: boolean, compact: boolean): CSSProperties {
  return {
    minHeight: compact ? 40 : 44,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    border: active ? `1px solid ${tokens.colors.infoLine}` : `1px solid ${tokens.colors.border}`,
    background: active ? tokens.colors.infoSoft : tokens.colors.surfaceSoft,
    color: active ? tokens.colors.info : '#334155',
    fontSize: compact ? 11 : 12,
    fontWeight: 800,
    padding: '0 12px',
  }
}

const tray: CSSProperties = {
  pointerEvents: 'auto',
  margin: '0 auto',
  borderRadius: tokens.radius.panel,
  border: `1px solid ${tokens.colors.border}`,
  background: tokens.colors.surface,
  boxShadow: tokens.shadow.panel,
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  color: tokens.colors.ink,
  display: 'grid',
  animation: 'sagaHudRise 220ms cubic-bezier(0.22, 1, 0.36, 1)',
}

const completeHero: CSSProperties = {
  display: 'grid',
  gap: 6,
}

const completeLabel: CSSProperties = {
  color: tokens.colors.brand,
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.16em',
}

const completeTitle: CSSProperties = {
  color: tokens.colors.ink,
  fontSize: 28,
  fontWeight: 900,
  lineHeight: 0.98,
  letterSpacing: '-0.04em',
}

const completeText: CSSProperties = {
  color: tokens.colors.soft,
  fontSize: 13,
  lineHeight: 1.4,
}

const titleRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
}

const titleBlock: CSSProperties = {
  minWidth: 0,
}

const eyebrow: CSSProperties = {
  color: tokens.colors.brand,
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.16em',
}

const title: CSSProperties = {
  marginTop: 4,
  color: tokens.colors.ink,
  fontWeight: 900,
  lineHeight: 1,
  letterSpacing: '-0.03em',
}

const titleMeta: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  justifyContent: 'flex-end',
}

const pillBase: CSSProperties = {
  minHeight: 24,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 8px',
  borderRadius: tokens.radius.pill,
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.12em',
}

const stagePill: CSSProperties = {
  ...pillBase,
  border: `1px solid ${tokens.colors.infoLine}`,
  background: tokens.colors.infoSoft,
  color: tokens.colors.info,
}

const debugPill: CSSProperties = {
  ...pillBase,
  border: `1px solid ${tokens.colors.brandLine}`,
  background: tokens.colors.brandSoft,
  color: tokens.colors.brand,
}

const metricRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 8,
}

const metricPill: CSSProperties = {
  borderRadius: 16,
  border: `1px solid ${tokens.colors.border}`,
  background: tokens.colors.surfaceSoft,
  minHeight: 72,
  padding: '10px 12px',
}

const metricGood: CSSProperties = {
  border: `1px solid ${tokens.colors.brandLine}`,
  background: tokens.colors.brandSoft,
}

const metricWarn: CSSProperties = {
  border: `1px solid ${tokens.colors.warnLine}`,
  background: tokens.colors.warnSoft,
}

const metricInfo: CSSProperties = {
  border: `1px solid ${tokens.colors.infoLine}`,
  background: tokens.colors.infoSoft,
}

const metricLabel: CSSProperties = {
  color: tokens.colors.muted,
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.14em',
}

const metricValue: CSSProperties = {
  marginTop: 6,
  color: tokens.colors.ink,
  fontSize: 14,
  fontWeight: 900,
  lineHeight: 1.15,
}

const helperLine: CSSProperties = {
  color: tokens.colors.soft,
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
  border: `1px solid ${tokens.colors.border}`,
  background: tokens.colors.surfaceSoft,
  padding: '10px 12px',
  minWidth: 0,
}

const detailLabel: CSSProperties = {
  color: tokens.colors.muted,
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.14em',
}

const detailValue: CSSProperties = {
  color: tokens.colors.ink,
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
  background: 'rgba(15,23,42,.34)',
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
  animation: 'sagaFadeIn 160ms ease-out',
}

const menuSheet: CSSProperties = {
  position: 'relative',
  zIndex: 2,
  borderRadius: 24,
  border: `1px solid ${tokens.colors.border}`,
  background: 'rgba(255,255,255,.98)',
  boxShadow: tokens.shadow.sheet,
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
  color: tokens.colors.ink,
  fontSize: 22,
  fontWeight: 900,
  lineHeight: 1,
  letterSpacing: '-0.03em',
}

const closeButton: CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: tokens.radius.pill,
  border: `1px solid ${tokens.colors.dangerLine}`,
  background: tokens.colors.dangerSoft,
  color: tokens.colors.danger,
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
  border: `1px solid ${tokens.colors.warnLine}`,
  background: tokens.colors.warnSoft,
  color: tokens.colors.warn,
  fontSize: 12,
  fontWeight: 900,
}

const menuButtonActive: CSSProperties = {
  minHeight: 46,
  borderRadius: 16,
  border: `1px solid ${tokens.colors.brandLine}`,
  background: tokens.colors.brandSoft,
  color: tokens.colors.brand,
  fontSize: 12,
  fontWeight: 900,
}

const menuLink: CSSProperties = {
  minHeight: 46,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 16,
  border: `1px solid ${tokens.colors.border}`,
  background: tokens.colors.surfaceSoft,
  color: tokens.colors.ink,
  fontSize: 12,
  fontWeight: 800,
  textDecoration: 'none',
}

const menuLinkMuted: CSSProperties = {
  ...menuLink,
  color: tokens.colors.soft,
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
