import type { PlayerGpsStatus, PlayerStage } from '../types/player'

export type PlayerPanel = 'details' | 'menu' | null
export type PrimaryActionTone = 'ready' | 'gps' | 'locked' | 'warn' | 'done'

export interface StageRuntimeState {
  canEnter: boolean
  reason:
    | 'finished'
    | 'missing_stage'
    | 'free_entry'
    | 'within_radius'
    | 'out_of_range'
    | 'gps_unavailable'
    | 'distance_unknown'
  primaryLabel: string
  primaryTone: PrimaryActionTone
  helperText: string
}

export function deriveStageRuntime(args: {
  currentStage: PlayerStage | null
  finished: boolean
  distanceMeters: number | null
  gpsState: PlayerGpsStatus
  debugEnabled: boolean
}): StageRuntimeState {
  const { currentStage, finished, distanceMeters, gpsState, debugEnabled } = args

  if (finished) {
    return {
      canEnter: false,
      reason: 'finished',
      primaryLabel: 'MISSION COMPLETE',
      primaryTone: 'done',
      helperText: 'This session has already completed all stages.',
    }
  }

  if (!currentStage) {
    return {
      canEnter: false,
      reason: 'missing_stage',
      primaryLabel: 'AWAITING NODE',
      primaryTone: 'locked',
      helperText: 'No active stage is available right now.',
    }
  }

  const entry = currentStage.entry ?? {}
  const mappedStage =
    typeof currentStage.lat === 'number' &&
    typeof currentStage.lon === 'number' &&
    typeof currentStage.radius === 'number' &&
    currentStage.radius > 0

  const explicitFreeEntry =
    entry.mode === 'free' && entry.require_proximity === false && !mappedStage

  const gpsAvailable = gpsState === 'ready' || debugEnabled

  if (explicitFreeEntry) {
    return {
      canEnter: true,
      reason: 'free_entry',
      primaryLabel: 'OPEN INTERACTION',
      primaryTone: 'ready',
      helperText: currentStage.messages?.hint || currentStage.content || 'Interaction available.',
    }
  }

  if (!gpsAvailable) {
    return {
      canEnter: false,
      reason: 'gps_unavailable',
      primaryLabel: debugEnabled ? 'SET DEBUG GPS' : 'GPS REQUIRED',
      primaryTone: 'gps',
      helperText: debugEnabled
        ? 'Tap the map to place a simulated GPS position.'
        : currentStage.messages?.gps_unavailable || 'GPS is unavailable for this stage.',
    }
  }

  if (distanceMeters === null) {
    return {
      canEnter: false,
      reason: 'distance_unknown',
      primaryLabel: 'LOCATING TARGET',
      primaryTone: 'gps',
      helperText: 'Waiting for a reliable position fix.',
    }
  }

  if (distanceMeters <= currentStage.radius) {
    return {
      canEnter: true,
      reason: 'within_radius',
      primaryLabel: 'OPEN INTERACTION',
      primaryTone: 'ready',
      helperText: currentStage.messages?.hint || currentStage.content || 'Target in range.',
    }
  }

  return {
    canEnter: false,
    reason: 'out_of_range',
    primaryLabel: 'ACÉRCATE MÁS',
    primaryTone: 'warn',
    helperText:
      currentStage.messages?.locked ||
      `Acércate al radio de ${currentStage.radius} m para abrir este nodo.`,
  }
}
