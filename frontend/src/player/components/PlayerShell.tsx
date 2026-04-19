import type { CSSProperties } from 'react'
import type { PlayerGamePayload, PlayerGpsStatus, PlayerStage } from '../../types/player'
import { tokens } from '../ui/tokens'

interface PlayerShellProps {
  payload: PlayerGamePayload
  currentStage: PlayerStage | null
  gpsState: PlayerGpsStatus
  inRange: boolean
  distanceMeters: number | null
}

export function PlayerShell({
  payload,
}: PlayerShellProps) {
  const compact =
    typeof window !== 'undefined' ? window.innerWidth <= 560 : false

  const mode = payload.session_mode || payload.mode || payload.profile?.mode || 'solo'
  const title = payload.display_name || payload.profile?.display_name || payload.user

  return (
    <>
      <style>{shellAnimations}</style>

      <header style={wrap}>
        <div
          style={{
            ...rail,
            width: compact ? 'min(100%, 250px)' : 'min(100%, 320px)',
            padding: compact ? '8px 10px' : '10px 12px',
            borderRadius: compact ? 18 : 20,
          }}
        >
          <div style={topRow}>
            <div style={eyebrow}>{mode === 'team' ? 'TEAM' : 'FIELD'}</div>
            <div style={modePill}>{mode === 'team' ? 'TEAM' : 'SOLO'}</div>
          </div>

          <div style={{ ...name, fontSize: compact ? 15 : 18 }}>{title}</div>
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

const rail: CSSProperties = {
  margin: '0 auto',
  display: 'grid',
  gap: 6,
  border: `1px solid ${tokens.colors.border}`,
  background: tokens.colors.surfaceOverlay,
  boxShadow: tokens.shadow.soft,
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  pointerEvents: 'auto',
  boxSizing: 'border-box',
  animation: 'sagaShellIn 220ms cubic-bezier(0.22, 1, 0.36, 1)',
}

const topRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
}

const eyebrow: CSSProperties = {
  color: tokens.colors.brand,
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.16em',
}

const modePill: CSSProperties = {
  minHeight: 22,
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0 8px',
  borderRadius: tokens.radius.pill,
  background: tokens.colors.surfaceSoft,
  border: `1px solid ${tokens.colors.border}`,
  color: '#334155',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.12em',
}

const name: CSSProperties = {
  color: tokens.colors.ink,
  fontWeight: 900,
  lineHeight: 1,
  letterSpacing: '-0.03em',
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
