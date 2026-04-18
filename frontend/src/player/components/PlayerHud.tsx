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

function isPlaceholderStage(stage: PlayerStage | null): boolean {
  if (!stage) return false
  const title = String(stage.title || '').trim().toUpperCase()
  const content = String(stage.content || '').trim().toUpperCase()
  return title === 'NEW NODE' || content === 'PUT NODE TEXT HERE'
}

function getGpsDisplay(gpsState: string): string {
  const value = String(gpsState || 'unknown').toLowerCase()
  if (value === 'ready') return 'LIVE GPS'
  if (value === 'stale') return 'LAST KNOWN'
  if (value === 'searching') return 'SEARCHING'
  if (value === 'error') return 'GPS ERROR'
  return 'UNAVAILABLE'
}

function getDistanceDisplay(
  finished: boolean,
  distanceMeters: number | null,
  inRange: boolean
): string {
  if (finished) return 'ROUTE COMPLETE'
  if (distanceMeters === null) return 'NO LIVE RANGE'
  if (inRange) return `IN RANGE · ${distanceMeters} M`
  return `${distanceMeters} M AWAY`
}

export function PlayerHud({
  currentStage,
  level,
  finished,
  gpsState,
  distanceMeters,
  inRange,
  primaryLabel,
  primaryTone,
  primaryDisabled,
  helperText,
  detailsOpen,
  menuOpen,
  onPrimaryAction,
  onToggleDetails,
  onToggleMenu,
  onCloseMenu,
  onToggleDebug,
  legacyPlayerHref,
  legacyLoginHref,
  adminHref,
  debugEnabled,
  mapNotice,
}: PlayerHudProps) {
  const compact =
    typeof window !== 'undefined' ? window.innerWidth <= 560 : false

  const placeholderStage = isPlaceholderStage(currentStage)
  const distanceDisplay = getDistanceDisplay(finished, distanceMeters, inRange)
  const gpsDisplay = getGpsDisplay(gpsState)

  return (
    <>
      <style>{menuAnimations}</style>

      <section
        style={{
          ...tray,
          width: compact ? '100%' : 'min(100%, 760px)',
          padding: compact ? 10 : 14,
          gap: compact ? 8 : 10,
          borderRadius: compact ? 22 : 24,
        }}
      >
        <div style={missionRow}>
          <div style={missionCopy}>
            <div style={eyebrow}>{finished ? 'MISSION STATUS' : 'MISSION'}</div>
            <div
              style={{
                ...headline,
                fontSize: compact ? 17 : 22,
              }}
            >
              {finished ? 'Mission complete' : currentStage?.title || 'Awaiting node'}
            </div>

            <div style={{ ...metaInline, gap: compact ? 6 : 8, marginTop: compact ? 6 : 8 }}>
              <span style={stageBadge}>
                {finished ? 'DONE' : `STAGE ${level + 1}`}
              </span>

              {placeholderStage && !finished ? (
                <span style={mutedBadge}>DRAFT NODE</span>
              ) : null}

              {debugEnabled && !finished ? (
                <span style={debugBadge}>DEBUG</span>
              ) : null}
            </div>
          </div>
        </div>

        {mapNotice ? <div style={mapNoticeCard}>{mapNotice}</div> : null}

        <div style={{ ...summaryGrid, gap: compact ? 8 : 10 }}>
          <SummaryCard
            label="PROXIMITY"
            value={distanceDisplay}
            emphasis={finished ? 'info' : inRange ? 'good' : 'neutral'}
            compact={compact}
          />
          <SummaryCard
            label="GPS FEED"
            value={gpsDisplay}
            emphasis={gpsState === 'ready' ? 'good' : gpsState === 'stale' ? 'warn' : 'neutral'}
            compact={compact}
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

        <div
          style={{
            ...helperCard,
            fontSize: compact ? 13 : 14,
            padding: compact ? '10px 12px' : '12px 14px',
            ...(finished
              ? helperInfo
              : primaryTone === 'gps'
              ? helperWarn
              : primaryTone === 'ready'
              ? helperGood
              : null),
          }}
        >
          {helperText}
        </div>

        <div style={{ ...actionsRow, gap: compact ? 6 : 8 }}>
          <button
            type="button"
            style={getSecondaryStyle(detailsOpen, compact)}
            onClick={onToggleDetails}
          >
            {detailsOpen ? 'HIDE DETAILS' : 'DETAILS'}
          </button>

          <button
            type="button"
            style={getSecondaryStyle(menuOpen, compact)}
            onClick={onToggleMenu}
          >
            {menuOpen ? 'CLOSE MENU' : 'MENU'}
          </button>
        </div>

        {detailsOpen ? (
          <div style={{ ...detailsGrid, gap: compact ? 8 : 10 }}>
            <DetailCard
              label="DISTANCE"
              value={distanceMeters === null ? 'NO LIVE RANGE' : `${distanceMeters} m`}
              compact={compact}
            />
            <DetailCard
              label="GPS"
              value={String(gpsState || 'unknown').replace(/_/g, ' ').toUpperCase()}
              compact={compact}
            />
            <DetailCard
              label="LAT"
              value={
                typeof currentStage?.lat === 'number'
                  ? currentStage.lat.toFixed(5)
                  : '---'
              }
              compact={compact}
            />
            <DetailCard
              label="RADIUS"
              value={
                typeof currentStage?.radius === 'number'
                  ? `${currentStage.radius} m`
                  : '---'
              }
              compact={compact}
            />
          </div>
        ) : null}
      </section>

      {menuOpen ? (
        <div style={menuOverlay}>
          <div style={menuBackdrop} onClick={onCloseMenu} />

          <aside
            style={{
              ...menuSheet,
              width: compact ? '100%' : 'min(100%, 520px)',
            }}
            aria-modal="true"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div style={menuHeader}>
              <div>
                <div style={menuEyebrow}>FIELD MENU</div>
                <div style={menuTitle}>Mission controls</div>
              </div>

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

            <div style={menuMetaRow}>
              <div style={menuMetaCard}>
                <div style={menuMetaLabel}>NODE</div>
                <div style={menuMetaValue}>
                  {finished ? 'Mission complete' : currentStage?.title || 'Awaiting node'}
                </div>
              </div>

              <div style={menuMetaCard}>
                <div style={menuMetaLabel}>DEBUG</div>
                <div style={menuMetaValue}>{debugEnabled ? 'LOCAL ON' : 'OFF'}</div>
              </div>
            </div>

            <div style={menuSectionLabel}>TEST TOOLS</div>
            <div style={menuLinksGrid}>
              <button
                type="button"
                style={debugEnabled ? debugButtonActive : debugButton}
                onClick={onToggleDebug}
              >
                {debugEnabled ? 'DISABLE LOCAL DEBUG' : 'ENABLE LOCAL DEBUG'}
              </button>
            </div>

            <div style={menuHintCard}>
              <div style={menuHintLabel}>LOCAL TEST MODE</div>
              <div style={menuHintText}>
                This only affects the React test runtime. It does not change the backend
                heartbeat security model or enable public debug remotely.
              </div>
            </div>

            <div style={menuSectionLabel}>ENTRY</div>
            <div style={menuLinksGrid}>
              <a href={legacyLoginHref} style={menuLinkPrimary}>
                MISSION ENTRY
              </a>
            </div>

            <div style={menuSectionLabel}>TOOLS</div>
            <div style={menuLinksGrid}>
              <a href={adminHref} style={menuLink}>
                ADMIN
              </a>
            </div>

            <div style={menuSectionLabel}>FALLBACK</div>
            <div style={menuLinksGrid}>
              <a href={legacyPlayerHref} style={menuLinkMuted}>
                CLASSIC RUNTIME
              </a>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  )
}

function DetailCard({
  label,
  value,
  compact,
}: {
  label: string
  value: string
  compact: boolean
}) {
  return (
    <div style={{ ...detailCard, padding: compact ? '10px 10px 8px' : '12px 12px 10px' }}>
      <div style={{ ...detailLabel, fontSize: compact ? 9 : 10 }}>{label}</div>
      <div style={{ ...detailValue, fontSize: compact ? 13 : 14 }}>{value}</div>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  emphasis,
  compact,
}: {
  label: string
  value: string
  emphasis: 'good' | 'warn' | 'info' | 'neutral'
  compact: boolean
}) {
  return (
    <div
      style={{
        ...summaryCard,
        minHeight: compact ? 78 : 88,
        padding: compact ? '10px 10px 8px' : '12px 12px 10px',
        ...(emphasis === 'good'
          ? summaryGood
          : emphasis === 'warn'
          ? summaryWarn
          : emphasis === 'info'
          ? summaryInfo
          : null),
      }}
    >
      <div style={{ ...summaryLabel, fontSize: compact ? 9 : 10 }}>{label}</div>
      <div style={{ ...summaryValue, fontSize: compact ? 13 : 14 }}>{value}</div>
    </div>
  )
}

function getPrimaryStyle(
  tone: PrimaryActionTone,
  disabled: boolean,
  compact: boolean
): React.CSSProperties {
  const base: React.CSSProperties = {
    width: '100%',
    minHeight: compact ? 48 : 54,
    borderRadius: compact ? 16 : 18,
    fontSize: compact ? 13 : 14,
    fontWeight: 900,
    letterSpacing: '0.10em',
  }

  if (disabled || tone === 'locked') {
    return {
      ...base,
      border: '1px solid rgba(148,163,184,.18)',
      background: 'rgba(226,232,240,.96)',
      color: '#64748b',
    }
  }

  if (tone === 'gps') {
    return {
      ...base,
      border: '1px solid rgba(245,158,11,.24)',
      background: 'rgba(254,243,199,.98)',
      color: '#92400e',
    }
  }

  if (tone === 'done') {
    return {
      ...base,
      border: '1px solid rgba(59,130,246,.16)',
      background: 'rgba(219,234,254,.96)',
      color: '#1e3a8a',
    }
  }

  return {
    ...base,
    border: '1px solid rgba(22,163,74,.18)',
    background: 'linear-gradient(180deg, #16a34a, #15803d)',
    color: '#ffffff',
    boxShadow: '0 10px 24px rgba(22,163,74,.22)',
  }
}

function getSecondaryStyle(active: boolean, compact: boolean): React.CSSProperties {
  return {
    minHeight: compact ? 42 : 46,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: compact ? 14 : 16,
    border: active
      ? '1px solid rgba(59,130,246,.18)'
      : '1px solid rgba(15,23,42,.08)',
    background: active ? 'rgba(219,234,254,.96)' : 'rgba(248,250,252,.96)',
    color: active ? '#1e3a8a' : '#334155',
    fontSize: compact ? 11 : 12,
    fontWeight: 900,
    letterSpacing: '0.08em',
    padding: '0 12px',
  }
}

const tray: React.CSSProperties = {
  pointerEvents: 'auto',
  margin: '0 auto',
  border: '1px solid rgba(15,23,42,.08)',
  background: 'rgba(255,255,255,.92)',
  boxShadow: '0 18px 40px rgba(15,23,42,.08)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  color: '#0f172a',
  display: 'grid',
  animation: 'sagaTrayIn 220ms cubic-bezier(0.22, 1, 0.36, 1)',
}

const missionRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
}

const missionCopy: React.CSSProperties = {
  minWidth: 0,
}

const eyebrow: React.CSSProperties = {
  color: '#047857',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.16em',
}

const headline: React.CSSProperties = {
  marginTop: 4,
  color: '#0f172a',
  fontWeight: 900,
  lineHeight: 1,
  letterSpacing: '-0.03em',
}

const metaInline: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
}

const badgeBase: React.CSSProperties = {
  minHeight: 26,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 10px',
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.12em',
}

const stageBadge: React.CSSProperties = {
  ...badgeBase,
  border: '1px solid rgba(59,130,246,.16)',
  background: 'rgba(219,234,254,.96)',
  color: '#1e3a8a',
}

const mutedBadge: React.CSSProperties = {
  ...badgeBase,
  border: '1px solid rgba(148,163,184,.16)',
  background: 'rgba(241,245,249,.94)',
  color: '#475569',
}

const debugBadge: React.CSSProperties = {
  ...badgeBase,
  border: '1px solid rgba(22,163,74,.20)',
  background: 'rgba(220,252,231,.98)',
  color: '#166534',
}

const mapNoticeCard: React.CSSProperties = {
  borderRadius: 14,
  border: '1px solid rgba(59,130,246,.14)',
  background: 'rgba(239,246,255,.96)',
  color: '#1d4ed8',
  fontSize: 12,
  fontWeight: 800,
  lineHeight: 1.35,
  padding: '10px 12px',
}

const summaryGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
}

const summaryCard: React.CSSProperties = {
  borderRadius: 16,
  border: '1px solid rgba(15,23,42,.08)',
  background: 'rgba(248,250,252,.96)',
  minWidth: 0,
}

const summaryGood: React.CSSProperties = {
  border: '1px solid rgba(22,163,74,.18)',
  background: 'rgba(220,252,231,.92)',
}

const summaryWarn: React.CSSProperties = {
  border: '1px solid rgba(245,158,11,.18)',
  background: 'rgba(255,251,235,.96)',
}

const summaryInfo: React.CSSProperties = {
  border: '1px solid rgba(59,130,246,.16)',
  background: 'rgba(219,234,254,.96)',
}

const summaryLabel: React.CSSProperties = {
  color: '#64748b',
  fontWeight: 900,
  letterSpacing: '0.14em',
}

const summaryValue: React.CSSProperties = {
  marginTop: 6,
  color: '#0f172a',
  fontWeight: 900,
  lineHeight: 1.15,
}

const helperCard: React.CSSProperties = {
  borderRadius: 16,
  border: '1px solid rgba(15,23,42,.08)',
  background: 'rgba(248,250,252,.96)',
  color: '#475569',
  lineHeight: 1.4,
}

const helperGood: React.CSSProperties = {
  border: '1px solid rgba(22,163,74,.18)',
  background: 'rgba(220,252,231,.92)',
  color: '#166534',
}

const helperWarn: React.CSSProperties = {
  border: '1px solid rgba(245,158,11,.18)',
  background: 'rgba(255,251,235,.96)',
  color: '#92400e',
}

const helperInfo: React.CSSProperties = {
  border: '1px solid rgba(59,130,246,.16)',
  background: 'rgba(219,234,254,.96)',
  color: '#1e3a8a',
}

const actionsRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
}

const detailsGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
}

const detailCard: React.CSSProperties = {
  borderRadius: 16,
  border: '1px solid rgba(15,23,42,.08)',
  background: 'rgba(248,250,252,.96)',
  minWidth: 0,
}

const detailLabel: React.CSSProperties = {
  color: '#64748b',
  fontWeight: 800,
  letterSpacing: '0.14em',
}

const detailValue: React.CSSProperties = {
  color: '#0f172a',
  fontWeight: 800,
  marginTop: 6,
  lineHeight: 1.15,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const menuOverlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 4000,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  padding: 12,
  pointerEvents: 'auto',
}

const menuBackdrop: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(15,23,42,.34)',
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
  animation: 'sagaFadeIn 160ms ease-out',
}

const menuSheet: React.CSSProperties = {
  position: 'relative',
  zIndex: 2,
  borderRadius: 24,
  border: '1px solid rgba(15,23,42,.08)',
  background: 'rgba(255,255,255,.98)',
  boxShadow: '0 28px 60px rgba(15,23,42,.18)',
  padding: '16px 16px calc(16px + env(safe-area-inset-bottom, 0px))',
  display: 'grid',
  gap: 14,
  animation: 'sagaSheetUp 220ms cubic-bezier(0.22, 1, 0.36, 1)',
  pointerEvents: 'auto',
}

const menuHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
}

const menuEyebrow: React.CSSProperties = {
  color: '#047857',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.16em',
}

const menuTitle: React.CSSProperties = {
  marginTop: 6,
  color: '#0f172a',
  fontSize: 22,
  fontWeight: 900,
  lineHeight: 1,
  letterSpacing: '-0.03em',
}

const closeButton: React.CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 999,
  border: '1px solid rgba(239,68,68,.18)',
  background: 'rgba(239,68,68,.14)',
  color: '#b91c1c',
  fontSize: 24,
  fontWeight: 900,
  lineHeight: 1,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 10px 24px rgba(239,68,68,.14)',
  cursor: 'pointer',
  pointerEvents: 'auto',
}

const menuMetaRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 10,
}

const menuMetaCard: React.CSSProperties = {
  borderRadius: 16,
  border: '1px solid rgba(15,23,42,.08)',
  background: 'rgba(248,250,252,.96)',
  padding: 12,
}

const menuMetaLabel: React.CSSProperties = {
  color: '#64748b',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.14em',
}

const menuMetaValue: React.CSSProperties = {
  marginTop: 6,
  color: '#0f172a',
  fontSize: 14,
  fontWeight: 800,
  lineHeight: 1.2,
  wordBreak: 'break-word',
}

const menuSectionLabel: React.CSSProperties = {
  color: '#64748b',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.16em',
}

const menuLinksGrid: React.CSSProperties = {
  display: 'grid',
  gap: 10,
}

const menuLinkBase: React.CSSProperties = {
  minHeight: 48,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 14px',
  borderRadius: 16,
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: '0.08em',
  textDecoration: 'none',
}

const menuLinkPrimary: React.CSSProperties = {
  ...menuLinkBase,
  border: '1px solid rgba(59,130,246,.16)',
  background: 'rgba(219,234,254,.96)',
  color: '#1e3a8a',
}

const menuLink: React.CSSProperties = {
  ...menuLinkBase,
  border: '1px solid rgba(15,23,42,.08)',
  background: 'rgba(248,250,252,.96)',
  color: '#0f172a',
}

const menuLinkMuted: React.CSSProperties = {
  ...menuLinkBase,
  border: '1px solid rgba(148,163,184,.16)',
  background: 'rgba(241,245,249,.94)',
  color: '#475569',
}

const debugButton: React.CSSProperties = {
  ...menuLinkBase,
  border: '1px solid rgba(245,158,11,.18)',
  background: 'rgba(254,243,199,.98)',
  color: '#92400e',
  cursor: 'pointer',
}

const debugButtonActive: React.CSSProperties = {
  ...menuLinkBase,
  border: '1px solid rgba(22,163,74,.20)',
  background: 'rgba(220,252,231,.98)',
  color: '#166534',
  cursor: 'pointer',
}

const menuHintCard: React.CSSProperties = {
  borderRadius: 16,
  border: '1px solid rgba(15,23,42,.08)',
  background: 'rgba(248,250,252,.96)',
  padding: 12,
}

const menuHintLabel: React.CSSProperties = {
  color: '#64748b',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.14em',
}

const menuHintText: React.CSSProperties = {
  marginTop: 8,
  color: '#475569',
  fontSize: 13,
  lineHeight: 1.45,
}

const menuAnimations = `
@keyframes sagaFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes sagaTrayIn {
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
