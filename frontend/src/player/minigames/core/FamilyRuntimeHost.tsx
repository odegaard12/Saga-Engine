import type { PlayerStage } from '../../../types/player'
import type { ResolvedMinigame } from './resolver'
import { BearingHuntRuntimeScreen } from '../families/bearingHunt/RuntimeScreen'
import { CircuitMatrixRuntimeScreen } from '../families/circuitMatrix/RuntimeScreen'
import { SequenceCodeRuntimeScreen } from '../families/sequenceCode/RuntimeScreen'
import { PlaceMosaicRuntimeScreen } from '../families/placeMosaic/RuntimeScreen'
import { TiltMazeRuntimeScreen } from '../families/tiltMaze/RuntimeScreen'
import { SignalHuntRuntimeScreen } from '../families/signalHunt/RuntimeScreen'
import { MotionChallengeRuntimeScreen } from '../families/motionChallenge/RuntimeScreen'

export interface FamilyRuntimeHostProps {
  resolved: ResolvedMinigame
  stage: PlayerStage
  helperText: string
  submitting: boolean
  onWin: () => Promise<void>
}

export function FamilyRuntimeHost({
  resolved,
  stage,
  helperText,
  submitting,
  onWin,
}: FamilyRuntimeHostProps) {
  if (
    resolved.family === 'circuit_matrix' &&
    resolved.config.game_id === 'tilt_maze'
  ) {
    return (
      <TiltMazeRuntimeScreen
        resolved={resolved}
        stage={stage}
        helperText={helperText}
        submitting={submitting}
        onWin={onWin}
      />
    )
  }

  if (
    resolved.family === 'circuit_matrix' &&
    resolved.config.game_id === 'place_mosaic'
  ) {
    return (
      <PlaceMosaicRuntimeScreen
        resolved={resolved}
        stage={stage}
        helperText={helperText}
        submitting={submitting}
        onWin={onWin}
      />
    )
  }

  if (
    resolved.family === 'circuit_matrix' &&
    resolved.config.game_id === 'sequence_code'
  ) {
    return (
      <SequenceCodeRuntimeScreen
        resolved={resolved}
        stage={stage}
        helperText={helperText}
        submitting={submitting}
        onWin={onWin}
      />
    )
  }

  if (resolved.family === 'circuit_matrix') {
    return (
      <CircuitMatrixRuntimeScreen
        resolved={resolved}
        stage={stage}
        helperText={helperText}
        submitting={submitting}
        onWin={onWin}
      />
    )
  }

  if (resolved.family === 'bearing_hunt') {
    return (
      <BearingHuntRuntimeScreen
        resolved={resolved}
        stage={stage}
        helperText={helperText}
        submitting={submitting}
        onWin={onWin}
      />
    )
  }

  if (resolved.family === 'motion_challenge') {
    return (
      <MotionChallengeRuntimeScreen
        resolved={resolved}
        stage={stage}
        helperText={helperText}
        submitting={submitting}
        onWin={onWin}
      />
    )
  }

  return (
    <SignalHuntRuntimeScreen
      resolved={resolved}
      stage={stage}
      helperText={helperText}
      submitting={submitting}
      onWin={onWin}
    />
  )
}

export default FamilyRuntimeHost
