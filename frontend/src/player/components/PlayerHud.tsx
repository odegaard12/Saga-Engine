import type { PlayerGpsStatus, PlayerStage } from '../../types/player'

interface PlayerHudProps {
  currentStage: PlayerStage | null
  level: number
  finished: boolean
  gpsState: PlayerGpsStatus
  distanceMeters: number | null
  inRange: boolean
}

export function PlayerHud({
  currentStage,
  level,
  finished,
  gpsState,
  distanceMeters,
  inRange,
}: PlayerHudProps) {
  const gpsLabel =
    gpsState === 'ready'
      ? 'READY'
      : gpsState === 'stale'
      ? 'LAST KNOWN'
      : gpsState === 'searching'
      ? 'SEARCHING'
      : gpsState === 'error'
      ? 'ERROR'
      : 'UNAVAILABLE'

  const primaryText = finished
    ? 'MISSION COMPLETE'
    : inRange
    ? 'OBJECTIVE IN RANGE'
    : 'MOVE TO TARGET'

  return (
    <section style={hudWrap}>
      <div style={hudTop}>
        <div>
          <div style={eyebrow}>OBJECTIVE DOCK</div>
          <div style={headline}>
            {finished ? 'Mission complete' : currentStage?.title || 'Awaiting node'}
          </div>
        </div>

        <div style={stageBadge}>{finished ? 'DONE' : `S${level + 1}`}</div>
      </div>

      <div style={metricsRow}>
        <MetricPill label="DIST" value={distanceMeters === null ? '---' : `${distanceMeters} m`} highlight={inRange} />
        <MetricPill label="GPS" value={gpsLabel} />
        <MetricPill label="RANGE" value={inRange ? 'INSIDE' : 'OUTSIDE'} highlight={inRange} />
        <MetricPill label="LAT" value={typeof currentStage?.lat === 'number' ? currentStage.lat.toFixed(5) : '---'} />
        <MetricPill label="LON" value={typeof currentStage?.lon === 'number' ? currentStage.lon.toFixed(5) : '---'} />
        <MetricPill label="RAD" value={typeof currentStage?.radius === 'number' ? `${currentStage.radius} m` : '---'} />
      </div>

      <div style={actionRow}>
        <button style={mainButton} disabled>
          {primaryText}
        </button>

        <input
          style={codeInput}
          placeholder="ENTER RUNE OR ACCESS CODE"
          disabled
        />

        <button style={enterButton} disabled>
          ENTER
        </button>
      </div>
    </section>
  )
}

function MetricPill({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div style={highlight ? metricPillHighlight : metricPill}>
      <span style={metricLabel}>{label}</span>
      <span style={metricValue}>{value}</span>
    </div>
  )
}

const hudWrap: React.CSSProperties = {
  pointerEvents: 'auto',
  borderRadius: 24,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'linear-gradient(180deg, rgba(15,23,42,.84), rgba(15,23,42,.68))',
  boxShadow: '0 22px 60px rgba(2,6,23,.16)',
  backdropFilter: 'blur(14px)',
  padding: 14,
  color: '#f8fafc',
  display: 'grid',
  gap: 12,
}

const hudTop: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
}

const eyebrow: React.CSSProperties = {
  color: 'rgba(167,243,208,.92)',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.18em',
}

const headline: React.CSSProperties = {
  color: '#f8fafc',
  fontSize: 22,
  fontWeight: 900,
  lineHeight: 1.04,
  letterSpacing: '-0.03em',
  marginTop: 6,
}

const stageBadge: React.CSSProperties = {
  minHeight: 32,
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0 12px',
  borderRadius: 999,
  border: '1px solid rgba(59,130,246,.24)',
  background: 'rgba(59,130,246,.16)',
  color: '#dbeafe',
  fontSize: 11,
  fontWeight: 900,
  whiteSpace: 'nowrap',
}

const metricsRow: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
}

const metricPill: React.CSSProperties = {
  minHeight: 34,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 12px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.05)',
}

const metricPillHighlight: React.CSSProperties = {
  ...metricPill,
  background: 'rgba(34,197,94,.12)',
  border: '1px solid rgba(34,197,94,.24)',
}

const metricLabel: React.CSSProperties = {
  color: 'rgba(148,163,184,.92)',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.14em',
}

const metricValue: React.CSSProperties = {
  color: '#f8fafc',
  fontSize: 13,
  fontWeight: 800,
}

const actionRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(220px, 1.1fr) minmax(0, 1fr) 132px',
  gap: 10,
}

const mainButton: React.CSSProperties = {
  width: '100%',
  minHeight: 52,
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'linear-gradient(180deg, rgba(30,41,59,.98), rgba(15,23,42,.98))',
  color: 'rgba(240,249,255,.92)',
  fontSize: 14,
  fontWeight: 900,
  letterSpacing: '0.14em',
}

const codeInput: React.CSSProperties = {
  width: '100%',
  minHeight: 52,
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(255,255,255,.05)',
  color: '#e2e8f0',
  fontSize: 13,
  fontWeight: 700,
  padding: '0 14px',
}

const enterButton: React.CSSProperties = {
  minHeight: 52,
  width: '100%',
  borderRadius: 16,
  border: '1px solid rgba(16,185,129,.24)',
  background: 'rgba(16,185,129,.14)',
  color: '#d1fae5',
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: '0.1em',
  padding: '0 16px',
}
