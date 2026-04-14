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

  const distanceLabel =
    distanceMeters === null
      ? '---'
      : inRange
      ? `${distanceMeters} M`
      : `${distanceMeters} M OUT`

  return (
    <header style={shellWrap}>
      <div style={shellCard}>
        <div style={topLine}>
          <div style={eyebrowRow}>
            <span style={eyebrow}>{mode === 'team' ? 'TEAM' : 'OPERATOR'}</span>
            <span style={eyebrowDot}>•</span>
            <span style={eyebrowMuted}>{mode === 'team' ? `${members.length || 1} LINKED` : 'SOLO SESSION'}</span>
          </div>

          <span style={stageBadge}>{payload.finished ? 'DONE' : `STAGE ${payload.level + 1}`}</span>
        </div>

        <div style={titleRow}>
          <div style={titleStyle}>{title}</div>
          <div style={objectiveStyle}>
            {payload.finished ? 'MISSION COMPLETE' : currentStage?.title || 'AWAITING NODE'}
          </div>
        </div>

        <div style={statusRow}>
          <span style={statusPill}>{gpsLabel}</span>
          <span style={inRange ? statusPillSuccess : statusPill}>{distanceLabel}</span>
        </div>
      </div>
    </header>
  )
}

const shellWrap: React.CSSProperties = {
  pointerEvents: 'auto',
}

const shellCard: React.CSSProperties = {
  borderRadius: 24,
  border: '1px solid rgba(255,255,255,.12)',
  background:
    'linear-gradient(180deg, rgba(15,23,42,.88), rgba(15,23,42,.70))',
  boxShadow:
    '0 20px 48px rgba(2,6,23,.18), inset 0 1px 0 rgba(255,255,255,.06)',
  backdropFilter: 'blur(16px)',
  padding: '12px 14px',
  color: '#f8fafc',
  display: 'grid',
  gap: 10,
}

const topLine: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
}

const eyebrowRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minWidth: 0,
}

const eyebrow: React.CSSProperties = {
  color: 'rgba(167,243,208,.95)',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.18em',
}

const eyebrowDot: React.CSSProperties = {
  color: 'rgba(148,163,184,.65)',
  fontSize: 12,
}

const eyebrowMuted: React.CSSProperties = {
  color: 'rgba(148,163,184,.92)',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.14em',
}

const stageBadge: React.CSSProperties = {
  minHeight: 32,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 12px',
  borderRadius: 999,
  border: '1px solid rgba(96,165,250,.26)',
  background: 'linear-gradient(180deg, rgba(59,130,246,.22), rgba(37,99,235,.14))',
  color: '#dbeafe',
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: '0.06em',
  whiteSpace: 'nowrap',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06)',
}

const titleRow: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'baseline',
  gap: 8,
}

const titleStyle: React.CSSProperties = {
  color: '#f8fafc',
  fontSize: 22,
  fontWeight: 900,
  lineHeight: 1,
  letterSpacing: '-0.03em',
}

const objectiveStyle: React.CSSProperties = {
  color: 'rgba(226,232,240,.84)',
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.2,
  maxWidth: '22ch',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const statusRow: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
}

const statusPill: React.CSSProperties = {
  minHeight: 32,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 12px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.05)',
  color: 'rgba(241,245,249,.94)',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.04)',
}

const statusPillSuccess: React.CSSProperties = {
  ...statusPill,
  background: 'linear-gradient(180deg, rgba(34,197,94,.18), rgba(22,163,74,.12))',
  border: '1px solid rgba(34,197,94,.24)',
  color: '#dcfce7',
}
