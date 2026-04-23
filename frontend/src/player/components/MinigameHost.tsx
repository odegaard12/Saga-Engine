import type { CSSProperties } from 'react'
import type { PlayerStage } from '../../types/player'
import type { PlayerMinigameDefinition } from '../minigames/types'
import { tokens } from '../ui/tokens'

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
  const componentStage = stage.minigame?.config
    ? {
        ...stage,
        type: stage.minigame.type || stage.type,
        config: stage.minigame.config,
      }
    : stage

  return (
    <section style={wrap}>
      <div style={labelPill}>{definition.label}</div>

      <Component
        stage={componentStage}
        helperText={helperText}
        submitting={submitting}
        onWin={onWin}
      />
    </section>
  )
}

const wrap: CSSProperties = {
  display: 'grid',
  gap: 10,
}

const labelPill: CSSProperties = {
  minHeight: 26,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 'fit-content',
  padding: '0 10px',
  borderRadius: tokens.radius.pill,
  background: tokens.colors.slateSoft,
  border: `1px solid ${tokens.colors.slateLine}`,
  color: tokens.colors.slateMuted,
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.12em',
}
