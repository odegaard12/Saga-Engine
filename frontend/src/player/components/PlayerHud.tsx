import { useState } from 'react'
import type { PlayerStage } from '../../types/player'

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
}

export function PlayerHud({
  currentStage,
  finished,
  distanceMeters,
  inRange,
  debugEnabled,
  legacyPlayerHref,
  legacyLoginHref,
  adminHref,
}: PlayerHudProps) {
  const [expanded, setExpanded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const primaryText = finished
    ? 'MISSION COMPLETE'
    : inRange
    ? 'OBJECTIVE IN RANGE'
    : 'MOVE TO TARGET'

  return (
    <section style={hudWrap}>
      <div style={topRow}>
        <div style={titleBlock}>
          <div style={eyebrow}>MISSION</div>
          <div style={headline}>
            {finished ? 'Mission complete' : currentStage?.title || 'Awaiting node'}
          </div>
        </div>

        <div style={rangePill}>
          <span style={rangeLabel}>RANGE</span>
          <span style={rangeValue}>{inRange ? 'INSIDE' : 'OUTSIDE'}</span>
        </div>
      </div>

      <button style={mainButton} disabled>
        {primaryText}
      </button>

      <div style={bottomControls}>
        <button
          type="button"
          style={secondaryButton}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'HIDE DETAILS' : 'DETAILS'}
        </button>

        <button
          type="button"
          style={secondaryButton}
          onClick={() => setMenuOpen((value) => !value)}
        >
          {menuOpen ? 'CLOSE MENU' : 'MENU'}
        </button>
      </div>

      {expanded ? (
        <div style={detailsGrid}>
          <DetailCard label="DISTANCE" value={distanceMeters === null ? '---' : `${distanceMeters} m`} />
          <DetailCard label="LAT" value={typeof currentStage?.lat === 'number' ? currentStage.lat.toFixed(5) : '---'} />
          <DetailCard label="LON" value={typeof currentStage?.lon === 'number' ? currentStage.lon.toFixed(5) : '---'} />
          <DetailCard label="RADIUS" value={typeof currentStage?.radius === 'number' ? `${currentStage.radius} m` : '---'} />
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
            LOGIN
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

const hudWrap: React.CSSProperties = {
  pointerEvents: 'auto',
  borderRadius: 28,
  border: '1px solid rgba(255,255,255,.12)',
  background:
    'linear-gradient(180deg, rgba(15,23,42,.88), rgba(15,23,42,.74))',
  boxShadow:
    '0 20px 48px rgba(2,6,23,.18), inset 0 1px 0 rgba(255,255,255,.05)',
  backdropFilter: 'blur(18px)',
  padding: 14,
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
  fontSize: 18,
  fontWeight: 900,
  lineHeight: 1.06,
  letterSpacing: '-0.03em',
  marginTop: 6,
  wordBreak: 'break-word',
}

const rangePill: React.CSSProperties = {
  minHeight: 34,
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

const mainButton: React.CSSProperties = {
  width: '100%',
  minHeight: 58,
  borderRadius: 20,
  border: '1px solid rgba(255,255,255,.08)',
  background:
    'linear-gradient(180deg, rgba(15,23,42,1), rgba(10,18,38,1))',
  color: 'rgba(240,249,255,.96)',
  fontSize: 14,
  fontWeight: 900,
  letterSpacing: '0.14em',
  boxShadow:
    '0 10px 24px rgba(2,6,23,.22), inset 0 1px 0 rgba(255,255,255,.04)',
}

const bottomControls: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 10,
}

const secondaryButton: React.CSSProperties = {
  minHeight: 44,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.05)',
  color: '#f8fafc',
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: '0.08em',
  padding: '0 12px',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.03)',
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
  minHeight: 44,
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
