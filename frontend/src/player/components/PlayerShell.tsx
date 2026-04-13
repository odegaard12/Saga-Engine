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
  const mode = payload.mode || payload.profile?.mode || 'solo'
  const members = payload.members || payload.profile?.members || []
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
      ? `IN RANGE · ${distanceMeters} M`
      : `${distanceMeters} M OUT`

  return (
    <header style={shellWrap}>
      <div style={shellCard}>
        <div style={leftZone}>
          <div style={identityLine}>
            <span style={kicker}>{mode === 'team' ? 'TEAM' : 'OPERATOR'}</span>
            <span style={dot}>•</span>
            <span style={mutedSmall}>{mode === 'team' ? `${members.length || 1} LINKED` : 'SOLO SESSION'}</span>
          </div>

          <div style={titleRow}>
            <div style={titleStyle}>{title}</div>
            <div style={objectiveStyle}>
              {payload.finished ? 'MISSION COMPLETE' : currentStage?.title || 'AWAITING NODE'}
            </div>
          </div>
        </div>

        <div style={rightZone}>
          <span style={pillStrong}>{payload.finished ? 'DONE' : `STAGE ${payload.level + 1}`}</span>
          <span style={pillBase}>{gpsLabel}</span>
          <span style={inRange ? pillSuccess : pillBase}>{rangeLabel}</span>
        </div>
      </div>
    </header>
  )
}

const shellWrap: React.CSSProperties = {
  pointerEvents: 'auto',
}

const shellCard: React.CSSProperties = {
  borderRadius: 22,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'linear-gradient(180deg, rgba(15,23,42,.84), rgba(15,23,42,.68))',
  boxShadow: '0 22px 60px rgba(2,6,23,.16)',
  backdropFilter: 'blur(14px)',
  padding: '12px 14px',
  color: '#f8fafc',
  display: 'flex',
  justifyContent: 'space-between',
  gap: 14,
  alignItems: 'center',
  flexWrap: 'wrap',
}

const leftZone: React.CSSProperties = {
  minWidth: 0,
  flex: '1 1 420px',
}

const rightZone: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
  alignItems: 'center',
  flex: '0 1 auto',
}

const identityLine: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minWidth: 0,
}

const kicker: React.CSSProperties = {
  color: 'rgba(167,243,208,.94)',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.18em',
}

const dot: React.CSSProperties = {
  color: 'rgba(148,163,184,.7)',
  fontSize: 12,
}

const mutedSmall: React.CSSProperties = {
  color: 'rgba(148,163,184,.9)',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.14em',
}

const titleRow: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'baseline',
  gap: 10,
  marginTop: 6,
}

const titleStyle: React.CSSProperties = {
  color: '#f8fafc',
  fontSize: 22,
  fontWeight: 900,
  lineHeight: 1,
  letterSpacing: '-0.03em',
}

const objectiveStyle: React.CSSProperties = {
  color: 'rgba(226,232,240,.86)',
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.2,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '52ch',
}

const pillBase: React.CSSProperties = {
  minHeight: 30,
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0 11px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(255,255,255,.06)',
  color: 'rgba(226,232,240,.92)',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
}

const pillStrong: React.CSSProperties = {
  ...pillBase,
  background: 'rgba(59,130,246,.16)',
  border: '1px solid rgba(59,130,246,.26)',
  color: '#dbeafe',
}

const pillSuccess: React.CSSProperties = {
  ...pillBase,
  background: 'rgba(34,197,94,.16)',
  border: '1px solid rgba(34,197,94,.26)',
  color: '#dcfce7',
}
