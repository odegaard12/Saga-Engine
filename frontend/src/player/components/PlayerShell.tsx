import type { CSSProperties } from 'react'
import type { PlayerGamePayload, PlayerGpsStatus, PlayerStage } from '../../types/player'

interface PlayerShellProps {
  payload: PlayerGamePayload
  currentStage: PlayerStage | null
  gpsState: PlayerGpsStatus
  inRange: boolean
  distanceMeters: number | null
  debugEnabled: boolean
  followPlayer: boolean
  hasPlayerPosition: boolean
  loginHref: string
  onToggleDebug: () => void
  onFocusPlayer: () => void
  onFocusNode: () => void
  onToggleFollow: () => void
}

function getGpsLabel(gpsState: PlayerGpsStatus, hasPlayerPosition: boolean) {
  if (hasPlayerPosition && gpsState === 'ready') return 'GPS LIVE'
  if (hasPlayerPosition && gpsState === 'stale') return 'GPS LAST'
  if (gpsState === 'searching') return 'GPS SEARCH'
  if (gpsState === 'error') return 'GPS ERROR'
  return 'GPS OFF'
}

function getRangeLabel(distanceMeters: number | null, inRange: boolean) {
  if (distanceMeters === null) return 'NO RANGE'
  if (inRange) return 'IN RANGE'
  return `${distanceMeters}M`
}

export function PlayerShell({
  payload,
  currentStage,
  gpsState,
  inRange,
  distanceMeters,
  debugEnabled,
  followPlayer,
  hasPlayerPosition,
  loginHref,
  onToggleDebug,
  onFocusPlayer,
  onFocusNode,
  onToggleFollow,
}: PlayerShellProps) {
  const compact =
    typeof window !== 'undefined' ? window.innerWidth <= 560 : false

  const mode = payload.session_mode || payload.mode || payload.profile?.mode || 'solo'
  const title = payload.display_name || payload.profile?.display_name || payload.user
  const gpsLabel = getGpsLabel(gpsState, hasPlayerPosition)
  const rangeLabel = getRangeLabel(distanceMeters, inRange)

  return (
    <>
      <style>{shellAnimations}</style>

      <header style={wrap}>
        <div style={mainRail}>
          <div
            style={{
              ...sessionCard,
              width: compact ? '100%' : 'min(100%, 420px)',
            }}
          >
            <div style={sessionTop}>
              <div style={eyebrow}>FIELD SESSION</div>
              <div style={modePill}>{mode === 'team' ? 'TEAM' : 'SOLO'}</div>
            </div>

            <div style={name}>{title}</div>
            <div style={stageTitle}>{currentStage?.title || 'Awaiting node'}</div>

            <div style={metaRow}>
              <span style={metaPill}>{gpsLabel}</span>
              <span style={metaPill}>{rangeLabel}</span>
              {debugEnabled ? <span style={metaPillActive}>DEBUG TAP</span> : null}
              {followPlayer ? <span style={metaPillFollow}>FOLLOW</span> : null}
            </div>
          </div>

          <div
            style={{
              ...utilityRail,
              width: compact ? '100%' : 'min(100%, 420px)',
            }}
          >
            <a href={loginHref} style={utilityLink}>
              ENTRY
            </a>

            <button
              type="button"
              style={debugEnabled ? utilityButtonActive : utilityButton}
              onClick={onToggleDebug}
            >
              {debugEnabled ? 'DEBUG ON' : 'DEBUG'}
            </button>

            <button type="button" style={utilityButton} onClick={onFocusPlayer}>
              PLAYER
            </button>

            <button type="button" style={utilityButton} onClick={onFocusNode}>
              NODE
            </button>

            <button
              type="button"
              style={followPlayer ? utilityButtonFollow : utilityButton}
              onClick={onToggleFollow}
            >
              {followPlayer ? 'FOLLOW' : 'FREE MAP'}
            </button>
          </div>

          {debugEnabled ? (
            <div style={hintRail}>
              DEBUG TAP MODE ACTIVE · TAP THE MAP TO PLACE LOCAL GPS
            </div>
          ) : null}
        </div>
      </header>
    </>
  )
}

const wrap: CSSProperties = {
  pointerEvents: 'none',
  width: '100%',
  display: 'flex',
  justifyContent: 'center',
}

const mainRail: CSSProperties = {
  width: '100%',
  display: 'grid',
  gap: 8,
}

const sessionCard: CSSProperties = {
  pointerEvents: 'auto',
  margin: '0 auto',
  borderRadius: 22,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'linear-gradient(180deg, rgba(2,6,23,.88), rgba(15,23,42,.72))',
  boxShadow: '0 18px 40px rgba(2,6,23,.20)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  padding: '12px 14px',
  display: 'grid',
  gap: 8,
  color: '#f8fafc',
  animation: 'sagaShellIn 220ms cubic-bezier(0.22, 1, 0.36, 1)',
}

const sessionTop: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
}

const eyebrow: CSSProperties = {
  color: '#6ee7b7',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.16em',
}

const modePill: CSSProperties = {
  minHeight: 24,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 10px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(255,255,255,.06)',
  color: '#f8fafc',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.12em',
}

const name: CSSProperties = {
  color: '#ffffff',
  fontSize: 30,
  fontWeight: 900,
  lineHeight: 0.95,
  letterSpacing: '-0.05em',
}

const stageTitle: CSSProperties = {
  color: '#cbd5e1',
  fontSize: 13,
  fontWeight: 800,
  lineHeight: 1.2,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
}

const metaRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
}

const pillBase: CSSProperties = {
  minHeight: 24,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 10px',
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.12em',
}

const metaPill: CSSProperties = {
  ...pillBase,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.05)',
  color: '#cbd5e1',
}

const metaPillActive: CSSProperties = {
  ...pillBase,
  border: '1px solid rgba(22,163,74,.28)',
  background: 'rgba(22,163,74,.18)',
  color: '#dcfce7',
}

const metaPillFollow: CSSProperties = {
  ...pillBase,
  border: '1px solid rgba(59,130,246,.24)',
  background: 'rgba(37,99,235,.16)',
  color: '#dbeafe',
}

const utilityRail: CSSProperties = {
  pointerEvents: 'auto',
  margin: '0 auto',
  display: 'grid',
  gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
  gap: 8,
}

const utilityButton: CSSProperties = {
  minHeight: 40,
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(2,6,23,.68)',
  color: '#e2e8f0',
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: '0.08em',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
}

const utilityButtonActive: CSSProperties = {
  ...utilityButton,
  border: '1px solid rgba(22,163,74,.28)',
  background: 'rgba(22,163,74,.18)',
  color: '#dcfce7',
}

const utilityButtonFollow: CSSProperties = {
  ...utilityButton,
  border: '1px solid rgba(59,130,246,.24)',
  background: 'rgba(37,99,235,.16)',
  color: '#dbeafe',
}

const utilityLink: CSSProperties = {
  minHeight: 40,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(2,6,23,.68)',
  color: '#f8fafc',
  textDecoration: 'none',
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: '0.08em',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
}

const hintRail: CSSProperties = {
  pointerEvents: 'none',
  margin: '0 auto',
  width: 'min(100%, 420px)',
  minHeight: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 12px',
  borderRadius: 999,
  border: '1px solid rgba(22,163,74,.22)',
  background: 'rgba(22,163,74,.14)',
  color: '#dcfce7',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.10em',
  textAlign: 'center',
}

const shellAnimations = `
@keyframes sagaShellIn {
  from {
    opacity: 0;
    transform: translateY(-8px) scale(.99);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
`
