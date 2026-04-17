import type { ComponentType } from 'react'
import type { PlayerStage } from '../../types/player'

export interface PlayerMinigameProps {
  stage: PlayerStage
  helperText: string
  submitting: boolean
  onWin: () => Promise<void>
}

export interface PlayerMinigameDefinition {
  type: string
  label: string
  version: string
  supportsManualFallback: boolean
  component: ComponentType<PlayerMinigameProps>
}
