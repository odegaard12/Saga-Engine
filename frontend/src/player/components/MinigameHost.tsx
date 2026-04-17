import type { PlayerStage } from '../../types/player'
import type { PlayerMinigameDefinition } from '../minigames/types'

interface MinigameHostProps {
  definition: PlayerMinigameDefinition
  stage: PlayerStage
  helperText: string
  submitting: boolean
  onWin: () => Promise<void>
}

export function MinigameHost({
  definition,
  stage,
  helperText,
  submitting,
  onWin,
}: MinigameHostProps) {
  const Component = definition.component

  return (
    <section style={wrap}>
      <div style={metaRow}>
        <span style={badge}>REACT MODULE</span>
        <span style={metaText}>
          {definition.label} · {definition.version}
        </span>
      </div>

      <Component
        stage={stage}
        helperText={helperText}
        submitting={submitting}
        onWin={onWin}
      />
    </section>
  )
}

const wrap: React.CSSProperties = {
  display: 'grid',
  gap: 10,
}

const metaRow: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
}

const badge: React.CSSProperties = {
  minHeight: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 10px',
  borderRadius: 999,
  background: 'rgba(34,197,94,.14)',
  border: '1px solid rgba(34,197,94,.18)',
  color: '#dcfce7',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.12em',
}

const metaText: React.CSSProperties = {
  minHeight: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 10px',
  borderRadius: 999,
  background: 'rgba(255,255,255,.06)',
  border: '1px solid rgba(255,255,255,.08)',
  color: '#cbd5e1',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.12em',
}
