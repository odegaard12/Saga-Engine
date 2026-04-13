import type { PlayerGamePayload, PlayerStage } from '../../types/player'

interface PlayerShellProps {
  payload: PlayerGamePayload
  currentStage: PlayerStage | null
}

export function PlayerShell({ payload, currentStage }: PlayerShellProps) {
  const mode = payload.mode || payload.profile?.mode || 'solo'
  const members = payload.members || payload.profile?.members || []
  const title = payload.display_name || payload.profile?.display_name || payload.user
  const objective = payload.finished
    ? 'Mission complete'
    : currentStage?.title || 'Awaiting node'

  return (
    <section style={shellWrap}>
      <div style={shellCard}>
        <div style={shellTopRow}>
          <div style={identityBlock}>
            <div style={kicker}>
              {mode === 'team' ? 'TEAM CHANNEL' : 'FIELD OPERATOR'}
            </div>
            <div style={titleStyle}>{title}</div>
            <div style={subStyle}>
              {mode === 'team'
                ? `${members.length || 1} members linked to current field run`
                : 'Linked to live field objective'}
            </div>
          </div>

          <div style={stageBox}>
            <div style={stageLabel}>STAGE</div>
            <div style={stageValue}>{payload.finished ? 'DONE' : payload.level + 1}</div>
          </div>
        </div>

        <div style={signalRow}>
          <span style={pillStrong}>{mode === 'team' ? `TEAM · ${members.length || 1}` : 'SOLO OPERATOR'}</span>
          <span style={pillBase}>GPS · UNKNOWN</span>
          <span style={pillWide}>OBJECTIVE · {objective}</span>
        </div>
      </div>
    </section>
  )
}

const shellWrap: React.CSSProperties = {
  marginBottom: 10,
}

const shellCard: React.CSSProperties = {
  borderRadius: 24,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'linear-gradient(180deg, rgba(15,23,42,.82), rgba(15,23,42,.64))',
  boxShadow: '0 24px 64px rgba(2,6,23,.18)',
  backdropFilter: 'blur(14px)',
  padding: '16px 16px 14px',
  color: '#f8fafc',
}

const shellTopRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 14,
}

const identityBlock: React.CSSProperties = {
  minWidth: 0,
  flex: 1,
}

const kicker: React.CSSProperties = {
  color: 'rgba(167,243,208,.92)',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
}

const titleStyle: React.CSSProperties = {
  color: '#f8fafc',
  fontSize: 28,
  fontWeight: 900,
  lineHeight: 1,
  marginTop: 6,
  letterSpacing: '-0.03em',
}

const subStyle: React.CSSProperties = {
  color: 'rgba(226,232,240,.82)',
  fontSize: 13,
  lineHeight: 1.4,
  marginTop: 8,
  maxWidth: '40ch',
}

const stageBox: React.CSSProperties = {
  minWidth: 86,
  padding: '10px 12px',
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.06)',
  textAlign: 'right',
  flexShrink: 0,
}

const stageLabel: React.CSSProperties = {
  color: 'rgba(148,163,184,.92)',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.16em',
}

const stageValue: React.CSSProperties = {
  color: '#f8fafc',
  fontSize: 26,
  fontWeight: 900,
  lineHeight: 1,
  marginTop: 4,
}

const signalRow: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  marginTop: 14,
}

const pillBase: React.CSSProperties = {
  minHeight: 30,
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0 11px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(255,255,255,.06)',
  color: 'rgba(226,232,240,.9)',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.04em',
}

const pillStrong: React.CSSProperties = {
  ...pillBase,
  background: 'rgba(16,185,129,.16)',
  border: '1px solid rgba(16,185,129,.22)',
  color: '#d1fae5',
}

const pillWide: React.CSSProperties = {
  ...pillBase,
  maxWidth: '100%',
}
