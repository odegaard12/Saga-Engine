import type { PlayerGpsStatus, PlayerStage } from '../types/player'

export type PrimaryActionTone = 'accent' | 'neutral' | 'warn' | 'success'

export interface StageRuntimeState {
  canEnter: boolean
  reason:
    | 'finished'
    | 'missing_stage'
    | 'ready'
    | 'gps_unavailable'
    | 'distance_unknown'
    | 'out_of_range'
  primaryLabel: string
  primaryTone: PrimaryActionTone
  statusLabel: string
  summary: string
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
      primaryTone: 'success',
      statusLabel: 'Complete',
      summary: 'This route has already been completed.',
    }
  }

  if (!currentStage) {
    return {
      canEnter: false,
      reason: 'missing_stage',
      primaryLabel: 'NO ACTIVE NODE',
      primaryTone: 'neutral',
      statusLabel: 'Waiting',
      summary: 'No active node is available right now.',
    }
  }

  const entry = currentStage.entry ?? {}
  const requireProximity = entry.mode !== 'free' && entry.require_proximity !== false
  const allowDebugBypass = entry.allow_debug_bypass !== false
  const gpsAvailable = gpsState === 'ready' || gpsState === 'stale'

  if (!requireProximity) {
    return {
      canEnter: true,
      reason: 'ready',
      primaryLabel: 'ENTER NODE',
      primaryTone: 'accent',
      statusLabel: 'Ready',
      summary:
        currentStage.messages?.hint ||
        currentStage.content ||
        'This node can be opened immediately.',
    }
  }

  if (debugEnabled && allowDebugBypass) {
    return {
      canEnter: true,
      reason: 'ready',
      primaryLabel: 'ENTER NODE',
      primaryTone: 'accent',
      statusLabel: 'Debug ready',
      summary: 'Debug bypass is active for this node.',
    }
  }

  if (!gpsAvailable) {
    return {
      canEnter: false,
      reason: 'gps_unavailable',
      primaryLabel: 'GPS REQUIRED',
      primaryTone: 'warn',
      statusLabel: 'GPS required',
      summary:
        currentStage.messages?.gps_unavailable ||
        'A reliable GPS fix is required before entering this node.',
    }
  }

  if (distanceMeters === null) {
    return {
      canEnter: false,
      reason: 'distance_unknown',
      primaryLabel: 'LOCATING NODE',
      primaryTone: 'neutral',
      statusLabel: 'Locating',
      summary: 'Waiting for a reliable distance calculation.',
    }
  }

  if (distanceMeters <= currentStage.radius) {
    return {
      canEnter: true,
      reason: 'ready',
      primaryLabel: 'ENTER NODE',
      primaryTone: 'accent',
      statusLabel: 'In range',
      summary:
        currentStage.messages?.hint ||
        currentStage.content ||
        'The node is in range and ready.',
    }
  }

  return {
    canEnter: false,
    reason: 'out_of_range',
    primaryLabel: 'MOVE CLOSER',
    primaryTone: 'neutral',
    statusLabel: 'Locked',
    summary:
      currentStage.messages?.locked ||
      `Move inside the ${currentStage.radius} m interaction radius.`,
  }
}
