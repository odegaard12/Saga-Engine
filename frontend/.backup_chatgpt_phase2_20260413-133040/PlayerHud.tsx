import type { PlayerStage } from '../../types/player'

interface PlayerHudProps {
  currentStage: PlayerStage | null
  level: number
  finished: boolean
}

export function PlayerHud({ currentStage, level, finished }: PlayerHudProps) {
  const lat = typeof currentStage?.lat === 'number' ? currentStage.lat.toFixed(5) : '---'
  const lon = typeof currentStage?.lon === 'number' ? currentStage.lon.toFixed(5) : '---'
  const radius = typeof currentStage?.radius === 'number' ? `${currentStage.radius} m` : '---'

  return (
    <section style={hudWrap}>
      <div style={hudHeader}>
        <div>
          <div style={label}>MISSION CONTROL</div>
          <div style={objectiveTitle}>
            {finished ? 'Mission complete' : currentStage?.title || 'Awaiting node'}
          </div>
        </div>

        <div style={stageBadge}>
          {finished ? 'DONE' : `STAGE ${level + 1}`}
        </div>
      </div>

      <div style={statsRow}>
        <div style={statCard}>
          <div style={statLabel}>LAT</div>
          <div style={statValue}>{lat}</div>
        </div>
        <div style={statCard}>
          <div style={statLabel}>LON</div>
          <div style={statValue}>{lon}</div>
        </div>
        <div style={statCard}>
          <div style={statLabel}>RADIUS</div>
          <div style={statValue}>{radius}</div>
        </div>
      </div>

      <div style={actionRow}>
        <button style={mainButton} disabled>
          {finished ? 'MISSION COMPLETE' : 'OBJECTIVE LOCKED'}
        </button>

        <div style={codeStack}>
          <input
            style={codeInput}
            placeholder="ENTER RUNE OR ACCESS CODE"
            disabled
          />
          <button style={enterButton} disabled>
            ENTER
          </button>
        </div>
      </div>

      <div style={footerNote}>
        React player foundation · command surface loaded
      </div>
    </section>
  )
}

const hudWrap: React.CSSProperties = {
  borderRadius: 24,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'linear-gradient(180deg, rgba(15,23,42,.82), rgba(15,23,42,.64))',
  boxShadow: '0 24px 64px rgba(2,6,23,.18)',
  backdropFilter: 'blur(14px)',
  padding: 16,
  color: '#f8fafc',
}

const hudHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 16,
  marginBottom: 14,
}

const label: React.CSSProperties = {
  color: 'rgba(167,243,208,.92)',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
}

const objectiveTitle: React.CSSProperties = {
  color: '#f8fafc',
  fontSize: 24,
  fontWeight: 900,
  lineHeight: 1.02,
  letterSpacing: '-0.03em',
  marginTop: 6,
}

const stageBadge: React.CSSProperties = {
  minHeight: 34,
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0 12px',
  borderRadius: 999,
  border: '1px solid rgba(96,165,250,.24)',
  background: 'rgba(59,130,246,.16)',
  color: '#dbeafe',
  fontSize: 11,
  fontWeight: 800,
  whiteSpace: 'nowrap',
}

const statsRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 10,
  marginBottom: 14,
}

const statCard: React.CSSProperties = {
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.05)',
  padding: '12px 12px 10px',
  minWidth: 0,
}

const statLabel: React.CSSProperties = {
  color: 'rgba(148,163,184,.92)',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.14em',
}

const statValue: React.CSSProperties = {
  color: '#f8fafc',
  fontSize: 15,
  fontWeight: 800,
  marginTop: 6,
  lineHeight: 1.15,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const actionRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
  gap: 12,
  alignItems: 'stretch',
}

const mainButton: React.CSSProperties = {
  width: '100%',
  minHeight: 116,
  borderRadius: 20,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'linear-gradient(180deg, rgba(30,41,59,.96), rgba(15,23,42,.96))',
  color: 'rgba(226,232,240,.88)',
  fontSize: 14,
  fontWeight: 900,
  letterSpacing: '0.18em',
}

const codeStack: React.CSSProperties = {
  display: 'grid',
  gridTemplateRows: '1fr auto',
  gap: 10,
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

const footerNote: React.CSSProperties = {
  marginTop: 12,
  color: 'rgba(148,163,184,.86)',
  fontSize: 12,
  lineHeight: 1.4,
}
