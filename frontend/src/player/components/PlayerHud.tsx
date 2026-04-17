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
}

export function PlayerHud({
  currentStage,
  level,
  finished,
  gpsState,
  distanceMeters,
  inRange,
  debugEnabled,
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
}: PlayerHudProps) {
  const rangeText = finished ? 'DONE' : inRange ? 'INSIDE' : 'OUTSIDE'

  return (
    <section style={hudWrap}>
      <div style={topRow}>
        <div style={titleBlock}>
          <div style={eyebrow}>MISSION</div>
          <div style={headline}>
            {finished ? 'Mission complete' : currentStage?.title || 'Awaiting node'}
          </div>
          <div style={subline}>STAGE {level + 1}</div>
        </div>

        <div style={rangePill}>
          <span style={rangeLabel}>RANGE</span>
          <span style={rangeValue}>{rangeText}</span>
        </div>
      </div>

      <button
        type="button"
        style={getMainButtonStyle(primaryTone, primaryDisabled)}
        disabled={primaryDisabled}
        onClick={onPrimaryAction}
      >
        {primaryLabel}
      </button>

      <div style={helperCopy}>{helperText}</div>

      <div style={bottomControls}>
        <button
          type="button"
          style={getSecondaryButtonStyle(detailsOpen)}
          onClick={onToggleDetails}
        >
          {detailsOpen ? 'HIDE DETAILS' : 'DETAILS'}
        </button>

        <button
          type="button"
          style={getSecondaryButtonStyle(menuOpen)}
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

      {menuOpen ? (
        <div style={menuPanel}>
          <div style={menuInfoCard}>
            <div style={menuInfoLabel}>DEBUG</div>
            <div style={menuInfoValue}>{debugEnabled ? 'ON' : 'OFF'}</div>
          </div>

          <a href={legacyPlayerHref} style={menuLink}>
            LEGACY PLAYER
          </a>

          <a href={legacyLoginHref} style={menuLink}>
            MISSION ENTRY
          </a>

          <a href={adminHref} style={menuLink}>
            ADMIN
          </a>
        </div>
      ) : null}
    </section>
  )
}

function DetailCard({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div style={detailCard}>
      <div style={detailLabel}>{label}</div>
      <div style={detailValue}>{value}</div>
    </div>
  )
}

function getMainButtonStyle(
  tone: PrimaryActionTone,
  disabled: boolean
): React.CSSProperties {
  const base: React.CSSProperties = {
    width: '100%',
    minHeight: 52,
    borderRadius: 18,
    fontSize: 14,
    fontWeight: 900,
    letterSpacing: '0.12em',
    boxShadow:
      '0 10px 24px rgba(2,6,23,.22), inset 0 1px 0 rgba(255,255,255,.04)',
  }

  if (disabled || tone === 'locked') {
    return {
      ...base,
      border: '1px solid rgba(148,163,184,.18)',
      background:
        'linear-gradient(180deg, rgba(51,65,85,.90), rgba(30,41,59,.92))',
      color: '#cbd5e1',
    }
  }

  if (tone === 'gps') {
    return {
      ...base,
      border: '1px solid rgba(245,158,11,.22)',
      background:
        'linear-gradient(180deg, rgba(245,158,11,.18), rgba(180,83,9,.14))',
      color: '#fde68a',
    }
  }

  if (tone === 'done') {
    return {
      ...base,
      border: '1px solid rgba(96,165,250,.18)',
      background:
        'linear-gradient(180deg, rgba(59,130,246,.18), rgba(37,99,235,.14))',
      color: '#dbeafe',
    }
  }

  return {
    ...base,
    border: '1px solid rgba(34,197,94,.24)',
    background:
      'linear-gradient(180deg, rgba(34,197,94,.26), rgba(22,163,74,.18))',
    color: '#dcfce7',
  }
}

function getSecondaryButtonStyle(active: boolean): React.CSSProperties {
  return {
    minHeight: 42,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    border: active
      ? '1px solid rgba(96,165,250,.24)'
      : '1px solid rgba(255,255,255,.08)',
    background: active ? 'rgba(59,130,246,.12)' : 'rgba(255,255,255,.05)',
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: '0.08em',
    padding: '0 12px',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,.03)',
  }
}

const hudWrap: React.CSSProperties = {
  pointerEvents: 'auto',
  width: 'min(100%, 960px)',
  margin: '0 auto',
  borderRadius: 24,
  border: '1px solid rgba(255,255,255,.12)',
  background:
    'linear-gradient(180deg, rgba(15,23,42,.88), rgba(15,23,42,.74))',
  boxShadow:
    '0 20px 48px rgba(2,6,23,.18), inset 0 1px 0 rgba(255,255,255,.05)',
  backdropFilter: 'blur(18px)',
  padding: 12,
  color: '#f8fafc',
  display: 'grid',
  gap: 10,
}

const topRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
}

const titleBlock: React.CSSProperties = {
  minWidth: 0,
  flex: '1 1 auto',
}

const eyebrow: React.CSSProperties = {
  color: 'rgba(167,243,208,.92)',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.18em',
}

const headline: React.CSSProperties = {
  color: '#f8fafc',
  fontSize: 16,
  fontWeight: 900,
  lineHeight: 1.08,
  letterSpacing: '-0.03em',
  marginTop: 6,
  wordBreak: 'break-word',
}

const subline: React.CSSProperties = {
  color: 'rgba(148,163,184,.92)',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.12em',
  marginTop: 6,
}

const rangePill: React.CSSProperties = {
  minHeight: 32,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 12px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.05)',
  whiteSpace: 'nowrap',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.04)',
}

const rangeLabel: React.CSSProperties = {
  color: 'rgba(148,163,184,.92)',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.14em',
}

const rangeValue: React.CSSProperties = {
  color: '#f8fafc',
  fontSize: 13,
  fontWeight: 800,
}

const helperCopy: React.CSSProperties = {
  color: '#cbd5e1',
  fontSize: 13,
  lineHeight: 1.45,
  minHeight: 18,
}

const bottomControls: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 10,
}

const detailsGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 10,
}

const detailCard: React.CSSProperties = {
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.05)',
  padding: '12px 12px 10px',
  minWidth: 0,
}

const detailLabel: React.CSSProperties = {
  color: 'rgba(148,163,184,.92)',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.14em',
}

const detailValue: React.CSSProperties = {
  color: '#f8fafc',
  fontSize: 14,
  fontWeight: 800,
  marginTop: 6,
  lineHeight: 1.15,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const menuPanel: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 8,
}

const menuInfoCard: React.CSSProperties = {
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.04)',
  padding: 10,
}

const menuInfoLabel: React.CSSProperties = {
  color: 'rgba(148,163,184,.92)',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.14em',
}

const menuInfoValue: React.CSSProperties = {
  color: '#f8fafc',
  fontSize: 13,
  fontWeight: 800,
  marginTop: 6,
  wordBreak: 'break-word',
}

const menuLink: React.CSSProperties = {
  minHeight: 42,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 12px',
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.05)',
  color: '#f8fafc',
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: '0.08em',
  textDecoration: 'none',
}
