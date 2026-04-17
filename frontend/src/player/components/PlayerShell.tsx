import type { PlayerGamePayload, PlayerGpsStatus, PlayerStage } from '../../types/player'

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
  const isCompact =
    typeof window !== 'undefined' ? window.innerWidth <= 560 : false

  const mode = payload.session_mode || payload.mode || payload.profile?.mode || 'solo'
  const title = payload.display_name || payload.profile?.display_name || payload.user

  const sessionLine = payload.finished
    ? 'Mission complete'
    : mode === 'team'
    ? 'Connected to team session'
    : 'Live field session'

  return (
    <>
      <style>{shellAnimations}</style>

      <header style={wrap}>
        <div
          style={{
            ...rail,
            width: isCompact ? 'min(100%, 300px)' : 'min(100%, 380px)',
            padding: isCompact ? '12px 14px' : '14px 16px',
          }}
        >
          <div style={eyebrow}>
            {mode === 'team' ? 'TEAM CHANNEL' : 'FIELD OPERATOR'}
          </div>

          <div
            style={{
              ...name,
              fontSize: isCompact ? 15 : 18,
            }}
          >
            {title}
          </div>

          <div style={sessionText}>{sessionLine}</div>
        </div>
      </header>
    </>
  )
}

const wrap: React.CSSProperties = {
  pointerEvents: 'none',
  width: '100%',
  display: 'flex',
  justifyContent: 'center',
}

const rail: React.CSSProperties = {
  margin: '0 auto',
  display: 'grid',
  gap: 6,
  alignItems: 'center',
  borderRadius: 20,
  border: '1px solid rgba(15,23,42,.08)',
  background: 'rgba(255,255,255,.90)',
  boxShadow: '0 12px 28px rgba(15,23,42,.07)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  pointerEvents: 'auto',
  boxSizing: 'border-box',
  animation: 'sagaRailIn 220ms cubic-bezier(0.22, 1, 0.36, 1)',
}

const eyebrow: React.CSSProperties = {
  color: '#047857',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.16em',
}

const name: React.CSSProperties = {
  color: '#0f172a',
  fontWeight: 900,
  lineHeight: 1,
  letterSpacing: '-0.03em',
}

const sessionText: React.CSSProperties = {
  color: '#475569',
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.25,
}

const shellAnimations = `
@keyframes sagaRailIn {
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
