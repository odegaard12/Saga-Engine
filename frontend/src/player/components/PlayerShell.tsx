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
  currentStage,
  gpsState,
  inRange,
  distanceMeters,
}: PlayerShellProps) {
  const isCompact =
    typeof window !== 'undefined' ? window.innerWidth <= 560 : false

  const mode = payload.session_mode || payload.mode || payload.profile?.mode || 'solo'
  const title = payload.display_name || payload.profile?.display_name || payload.user

  const gpsLabel =
    gpsState === 'ready'
      ? 'GPS READY'
      : gpsState === 'stale'
      ? 'GPS LAST KNOWN'
      : gpsState === 'searching'
      ? 'GPS SEARCHING'
      : gpsState === 'error'
      ? 'GPS ERROR'
      : 'GPS UNAVAILABLE'

  const rangeLabel =
    distanceMeters === null
      ? 'RANGE ---'
      : inRange
      ? `RANGE ${distanceMeters}M`
      : `RANGE ${distanceMeters}M OUT`

  return (
    <header style={wrap}>
      <div
        style={{
          ...rail,
          width: isCompact ? 'min(100%, 320px)' : 'min(100%, 760px)',
          gridTemplateColumns: '1fr',
          gap: isCompact ? 8 : 10,
          padding: isCompact ? '10px 12px' : '10px 14px',
        }}
      >
        <div style={identity}>
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

          <div
            style={{
              ...objective,
              fontSize: isCompact ? 12 : 13,
              whiteSpace: 'normal',
              overflow: 'visible',
              textOverflow: 'clip',
            }}
          >
            {currentStage?.title || 'Awaiting node'}
          </div>
        </div>

        <div
          style={{
            ...chips,
            justifyContent: 'flex-start',
          }}
        >
          <span style={stageChip}>
            {payload.finished ? 'DONE' : `STAGE ${payload.level + 1}`}
          </span>
          <span style={getGpsChipStyle(gpsState)}>{gpsLabel}</span>
          <span style={getRangeChipStyle(inRange)}>{rangeLabel}</span>
        </div>
      </div>
    </header>
  )
}

function getGpsChipStyle(gpsState: PlayerGpsStatus): React.CSSProperties {
  if (gpsState === 'ready') {
    return {
      ...chipBase,
      border: '1px solid rgba(22,163,74,.20)',
      background: 'rgba(220,252,231,.95)',
      color: '#166534',
    }
  }

  if (gpsState === 'stale' || gpsState === 'searching') {
    return {
      ...chipBase,
      border: '1px solid rgba(245,158,11,.22)',
      background: 'rgba(254,243,199,.96)',
      color: '#92400e',
    }
  }

  return {
    ...chipBase,
    border: '1px solid rgba(239,68,68,.18)',
    background: 'rgba(254,226,226,.96)',
    color: '#991b1b',
  }
}

function getRangeChipStyle(inRange: boolean): React.CSSProperties {
  if (inRange) {
    return {
      ...chipBase,
      border: '1px solid rgba(22,163,74,.18)',
      background: 'rgba(220,252,231,.95)',
      color: '#166534',
    }
  }

  return {
    ...chipBase,
    border: '1px solid rgba(15,23,42,.08)',
    background: 'rgba(248,250,252,.96)',
    color: '#334155',
  }
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
  alignItems: 'center',
  borderRadius: 20,
  border: '1px solid rgba(15,23,42,.08)',
  background: 'rgba(255,255,255,.90)',
  boxShadow: '0 12px 28px rgba(15,23,42,.07)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  pointerEvents: 'auto',
  boxSizing: 'border-box',
}

const identity: React.CSSProperties = {
  minWidth: 0,
}

const eyebrow: React.CSSProperties = {
  color: '#047857',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.16em',
}

const name: React.CSSProperties = {
  marginTop: 4,
  color: '#0f172a',
  fontWeight: 900,
  lineHeight: 1,
  letterSpacing: '-0.03em',
}

const objective: React.CSSProperties = {
  marginTop: 4,
  color: '#475569',
  fontWeight: 700,
  lineHeight: 1.2,
}

const chips: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
}

const chipBase: React.CSSProperties = {
  minHeight: 30,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 10px',
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.10em',
  whiteSpace: 'nowrap',
  boxSizing: 'border-box',
}

const stageChip: React.CSSProperties = {
  ...chipBase,
  border: '1px solid rgba(59,130,246,.16)',
  background: 'rgba(219,234,254,.96)',
  color: '#1e3a8a',
}
