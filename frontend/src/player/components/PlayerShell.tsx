import type { PlayerGamePayload, PlayerGpsStatus, PlayerStage } from '../../types/player'

interface PlayerShellProps {
  payload: PlayerGamePayload
  currentStage: PlayerStage | null
  gpsState: PlayerGpsStatus
  inRange: boolean
  distanceMeters: number | null
}

function isPlaceholderStage(stage: PlayerStage | null): boolean {
  if (!stage) return false
  const title = String(stage.title || '').trim().toUpperCase()
  const content = String(stage.content || '').trim().toUpperCase()
  return title === 'NEW NODE' || content === 'PUT NODE TEXT HERE'
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
  const placeholderStage = isPlaceholderStage(currentStage)

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
    payload.finished
      ? 'ROUTE COMPLETE'
      : distanceMeters === null
      ? gpsState === 'stale'
        ? 'RANGE STALE'
        : gpsState === 'searching'
        ? 'RANGE PENDING'
        : 'NO LIVE RANGE'
      : inRange
      ? `RANGE ${distanceMeters}M`
      : `RANGE ${distanceMeters}M OUT`

  return (
    <>
      <style>{shellAnimations}</style>

      <header style={wrap}>
        <div
          style={{
            ...rail,
            width: isCompact ? 'min(100%, 340px)' : 'min(100%, 760px)',
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
              {payload.finished
                ? 'Mission complete'
                : currentStage?.title || 'Awaiting node'}
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
            <span style={getRangeChipStyle(inRange, distanceMeters, payload.finished)}>
              {rangeLabel}
            </span>
            {placeholderStage && !payload.finished ? (
              <span style={draftChip}>DRAFT CONTENT</span>
            ) : null}
          </div>
        </div>
      </header>
    </>
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

function getRangeChipStyle(
  inRange: boolean,
  distanceMeters: number | null,
  finished: boolean
): React.CSSProperties {
  if (finished) {
    return {
      ...chipBase,
      border: '1px solid rgba(59,130,246,.16)',
      background: 'rgba(219,234,254,.96)',
      color: '#1e3a8a',
    }
  }

  if (distanceMeters !== null && inRange) {
    return {
      ...chipBase,
      border: '1px solid rgba(22,163,74,.18)',
      background: 'rgba(220,252,231,.95)',
      color: '#166534',
    }
  }

  if (distanceMeters !== null) {
    return {
      ...chipBase,
      border: '1px solid rgba(245,158,11,.18)',
      background: 'rgba(255,251,235,.96)',
      color: '#92400e',
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
  animation: 'sagaRailIn 220ms cubic-bezier(0.22, 1, 0.36, 1)',
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

const draftChip: React.CSSProperties = {
  ...chipBase,
  border: '1px solid rgba(148,163,184,.16)',
  background: 'rgba(241,245,249,.94)',
  color: '#475569',
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
