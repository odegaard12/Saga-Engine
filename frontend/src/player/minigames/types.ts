import type { ComponentType } from 'react'
import type { PlayerStage } from '../../types/player'

export interface PlayerMinigameProps {
  stage: PlayerStage
  helperText: string
  submitting: boolean
  /**
   * Completa el nodo. `penaltyMs` es tiempo extra que el reto quiere sumar al
   * del nodo: así un juego puede penalizar los fallos en la clasificación, y no
   * sólo dentro de su propio cronómetro.
   */
  onWin: (penaltyMs?: number) => Promise<void>
}

export interface PlayerMinigameDefinition {
  type: string
  label: string
  version: string
  supportsManualFallback: boolean
  component: ComponentType<PlayerMinigameProps>
}
