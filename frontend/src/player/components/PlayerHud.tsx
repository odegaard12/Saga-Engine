import type { PlayerStage } from '../../types/player'

interface PlayerHudProps {
  currentStage: PlayerStage | null
  level: number
  finished: boolean
}

export function PlayerHud({ currentStage, level, finished }: PlayerHudProps) {
  return (
    <section style={hudWrap}>
      <div style={hudHeader}>
        <div>
          <div style={label}>ACTIVE OBJECTIVE</div>
          <div style={objectiveTitle}>
            {finished ? 'Mission complete' : currentStage?.title || '---'}
          </div>
        </div>

        <div style={distanceBox}>
          {finished ? 'DONE' : '--- m'}
        </div>
      </div>

      <button style={mainButton} disabled>
        {finished ? 'MISSION COMPLETE' : 'SYSTEM LOCKED'}
      </button>

      <div style={inputRow}>
        <input
          style={codeInput}
          placeholder="ENTER CODE..."
          disabled
        />
        <button style={enterButton} disabled>
          ENTER
        </button>
      </div>

      <div style={footerNote}>
        React player foundation loaded · stage {level + 1}
      </div>
    </section>
  )
}

const hudWrap: React.CSSProperties = {
  borderRadius: 24,
  border: '1px solid rgba(15,23,42,.08)',
  background: 'linear-gradient(180deg, rgba(255,255,255,.88), rgba(247,250,246,.94))',
  boxShadow: '0 20px 44px rgba(15,23,42,.08)',
  padding: 18,
}

const hudHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-end',
  gap: 16,
  marginBottom: 16,
}

const label: React.CSSProperties = {
  color: '#047857',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
}

const objectiveTitle: React.CSSProperties = {
  color: '#0f172a',
  fontSize: 22,
  fontWeight: 800,
  lineHeight: 1,
  marginTop: 6,
}

const distanceBox: React.CSSProperties = {
  color: '#0f172a',
  fontSize: 34,
  fontWeight: 800,
  lineHeight: 1,
  whiteSpace: 'nowrap',
}

const mainButton: React.CSSProperties = {
  width: '100%',
  minHeight: 64,
  borderRadius: 18,
  border: '1px solid rgba(148,163,184,.18)',
  background: 'rgba(226,232,240,.96)',
  color: '#475569',
  fontSize: 16,
  fontWeight: 800,
  letterSpacing: '0.14em',
  marginBottom: 14,
}

const inputRow: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
}

const codeInput: React.CSSProperties = {
  flex: 1,
  minHeight: 52,
  minWidth: 220,
  borderRadius: 16,
  border: '1px solid rgba(148,163,184,.18)',
  background: 'rgba(255,255,255,.96)',
  color: '#020617',
  fontSize: 14,
  fontWeight: 700,
  padding: '0 14px',
}

const enterButton: React.CSSProperties = {
  minHeight: 52,
  minWidth: 130,
  borderRadius: 16,
  border: '1px solid rgba(5,150,105,.16)',
  background: 'rgba(209,250,229,.92)',
  color: '#065f46',
  fontSize: 13,
  fontWeight: 800,
  padding: '0 16px',
}

const footerNote: React.CSSProperties = {
  marginTop: 14,
  color: '#64748b',
  fontSize: 12,
}
