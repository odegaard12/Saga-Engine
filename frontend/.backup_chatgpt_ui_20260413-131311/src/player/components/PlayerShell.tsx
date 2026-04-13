import type { PlayerGamePayload, PlayerStage } from '../../types/player'

interface PlayerShellProps {
  payload: PlayerGamePayload
  currentStage: PlayerStage | null
}

export function PlayerShell({ payload, currentStage }: PlayerShellProps) {
  const mode = payload.mode || payload.profile?.mode || 'solo'
  const members = payload.members || payload.profile?.members || []
  const title = payload.display_name || payload.profile?.display_name || payload.user

  return (
    <section style={shellWrap}>
      <div style={shellCard}>
        <div style={shellTopRow}>
          <div>
            <div style={kicker}>
              {mode === 'team' ? 'TEAM CHANNEL' : 'FIELD OPERATOR'}
            </div>
            <div style={titleStyle}>{title}</div>
            <div style={subStyle}>
              {mode === 'team'
                ? `${members.length || 1} members linked`
                : 'Linked to live field objective'}
            </div>
          </div>

          <div style={progressPill}>
            {payload.finished ? 'Mission complete' : `Stage ${payload.level + 1}`}
          </div>
        </div>

        <div style={pillRow}>
          <span style={pillBase}>{mode === 'team' ? `Team · ${members.length || 1}` : 'Operator'}</span>
          <span style={pillBase}>GPS Unknown</span>
          <span style={pillBase}>
            {payload.finished
              ? 'Mission complete'
              : currentStage?.title
              ? `Objective · ${currentStage.title}`
              : 'Awaiting node'}
          </span>
        </div>
      </div>
    </section>
  )
}

const shellWrap: React.CSSProperties = {
  marginBottom: 16,
}

const shellCard: React.CSSProperties = {
  borderRadius: 20,
  border: '1px solid rgba(15,23,42,.08)',
  background: 'linear-gradient(180deg, rgba(255,255,255,.88), rgba(247,250,246,.94))',
  boxShadow: '0 18px 40px rgba(15,23,42,.08)',
  padding: '14px 16px',
}

const shellTopRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'flex-start',
}

const kicker: React.CSSProperties = {
  color: '#065f46',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
}

const titleStyle: React.CSSProperties = {
  color: '#0f172a',
  fontSize: 22,
  fontWeight: 800,
  lineHeight: 1,
  marginTop: 6,
}

const subStyle: React.CSSProperties = {
  color: '#475569',
  fontSize: 13,
  lineHeight: 1.35,
  marginTop: 6,
  maxWidth: '28ch',
}

const progressPill: React.CSSProperties = {
  minHeight: 38,
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0 14px',
  borderRadius: 999,
  border: '1px solid rgba(59,130,246,.16)',
  background: 'rgba(219,234,254,.88)',
  color: '#1e3a8a',
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: 'nowrap',
}

const pillRow: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  marginTop: 12,
}

const pillBase: React.CSSProperties = {
  minHeight: 28,
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0 10px',
  borderRadius: 999,
  border: '1px solid rgba(15,23,42,.08)',
  background: 'rgba(248,250,252,.96)',
  color: '#334155',
  fontSize: 11,
  fontWeight: 700,
}
