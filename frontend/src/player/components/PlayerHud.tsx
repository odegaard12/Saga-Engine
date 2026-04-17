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

export function PlayerHud({
  currentStage,
  level,
  finished,
  gpsState,
  distanceMeters,
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
}: PlayerHudProps) {
  const isCompact =
    typeof window !== 'undefined' ? window.innerWidth <= 560 : false

  return (
    <>
      <style>{menuAnimations}</style>

      <section
        style={{
          ...tray,
          width: isCompact ? '100%' : 'min(100%, 760px)',
          padding: isCompact ? 12 : 14,
        }}
      >
        <div style={missionRow}>
          <div style={missionCopy}>
            <div style={eyebrow}>MISSION</div>
            <div
              style={{
                ...headline,
                fontSize: isCompact ? 18 : 22,
              }}
            >
              {finished ? 'Mission complete' : currentStage?.title || 'Awaiting node'}
            </div>
            <div style={subline}>STAGE {level + 1}</div>
          </div>
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

        <div style={actionsRow}>
          <button
            type="button"
            style={getSecondaryStyle(detailsOpen)}
            onClick={onToggleDetails}
          >
            {detailsOpen ? 'HIDE DETAILS' : 'DETAILS'}
          </button>

          <button
            type="button"
            style={getSecondaryStyle(menuOpen)}
            onClick={onToggleMenu}
          >
            {menuOpen ? 'CLOSE MENU' : 'MENU'}
          </button>
        </div>

        {detailsOpen ? (
          <div style={detailsGrid}>
            <DetailCard
              label="DISTANCE"
              value={distanceMeters === null ? '---' : `${distanceMeters} m`}
            />
            <DetailCard
              label="GPS"
              value={String(gpsState || 'unknown').replace(/_/g, ' ').toUpperCase()}
            />
            <DetailCard
              label="LAT"
              value={
                typeof currentStage?.lat === 'number'
                  ? currentStage.lat.toFixed(5)
                  : '---'
              }
            />
            <DetailCard
              label="RADIUS"
              value={
                typeof currentStage?.radius === 'number'
                  ? `${currentStage.radius} m`
                  : '---'
              }
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
              width: isCompact ? '100%' : 'min(100%, 520px)',
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
                  {currentStage?.title || 'Awaiting node'}
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
  disabled: boolean
): React.CSSProperties {
  const base: React.CSSProperties = {
    width: '100%',
    minHeight: 56,
    borderRadius: 18,
    fontSize: 14,
    fontWeight: 900,
    letterSpacing: '0.12em',
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

function getSecondaryStyle(active: boolean): React.CSSProperties {
  return {
    minHeight: 46,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    border: active
      ? '1px solid rgba(59,130,246,.18)'
      : '1px solid rgba(15,23,42,.08)',
    background: active ? 'rgba(219,234,254,.96)' : 'rgba(248,250,252,.96)',
    color: active ? '#1e3a8a' : '#334155',
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: '0.08em',
    padding: '0 12px',
  }
}

const tray: React.CSSProperties = {
  pointerEvents: 'auto',
  margin: '0 auto',
  borderRadius: 24,
  border: '1px solid rgba(15,23,42,.08)',
  background: 'rgba(255,255,255,.92)',
  boxShadow: '0 18px 40px rgba(15,23,42,.08)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  color: '#0f172a',
  display: 'grid',
  gap: 10,
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
  marginTop: 6,
  color: '#0f172a',
  fontWeight: 900,
  lineHeight: 1,
  letterSpacing: '-0.03em',
}

const subline: React.CSSProperties = {
  marginTop: 6,
  color: '#64748b',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.12em',
}

const helper: React.CSSProperties = {
  color: '#475569',
  fontSize: 14,
  lineHeight: 1.45,
  minHeight: 18,
}

const actionsRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 8,
}

const detailsGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 10,
}

const detailCard: React.CSSProperties = {
  borderRadius: 16,
  border: '1px solid rgba(15,23,42,.08)',
  background: 'rgba(248,250,252,.96)',
  padding: '12px 12px 10px',
  minWidth: 0,
}

const detailLabel: React.CSSProperties = {
  color: '#64748b',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.14em',
}

const detailValue: React.CSSProperties = {
  color: '#0f172a',
  fontSize: 14,
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
