import type { PlayerStage } from '../../../types/player'
import type { ResolvedMinigame } from './resolver'
import { BearingHuntRuntimeScreen } from '../families/bearingHunt/RuntimeScreen'
import { CircuitMatrixRuntimeScreen } from '../families/circuitMatrix/RuntimeScreen'
import { SimonRuntimeScreen } from '../families/sequenceCode/SimonRuntimeScreen'
import { PlaceMosaicRuntimeScreen } from '../families/placeMosaic/RuntimeScreen'
import { TiltMazeRuntimeScreen } from '../families/tiltMaze/RuntimeScreen'
import { SparkRadarRuntimeScreen } from '../families/sparkRadar/RuntimeScreen'
import { CheckpointRuntimeScreen } from '../families/signalHunt/CheckpointRuntimeScreen'
import { MotionChallengeRuntimeScreen } from '../families/motionChallenge/RuntimeScreen'
import { AudioChallengeRuntime } from '../families/audioChallenge/AudioChallengeRuntime'
import { TeamRelayRuntimeScreen } from '../families/teamRelay/RuntimeScreen'

export interface FamilyRuntimeHostProps {
  resolved: ResolvedMinigame
  stage: PlayerStage
  helperText: string
  submitting: boolean
  onWin: (penaltyMs?: number) => Promise<void>
  /**
   * Lo llama el juego cuando el jugador pulsa Comenzar.
   *
   * El reloj del nodo arrancaba al abrir la hoja, o sea que la pantalla que
   * explica el reto ya sumaba segundos. Cada juego sabe cuándo empieza de
   * verdad; que lo diga él.
   */
  onComezar?: () => void
  /** Posición que ya conoce la app, para no abrir un segundo GPS. */
  appPosition?: { lat: number; lon: number } | null
}

export function FamilyRuntimeHost({
  resolved,
  stage,
  helperText,
  submitting,
  onWin,
  onComezar,
  appPosition = null,
}: FamilyRuntimeHostProps) {
  if (resolved.family === 'circuit_matrix' && resolved.config.game_id === 'spark_radar') {
    return (
      <SparkRadarRuntimeScreen
        resolved={resolved}
        stage={stage}
        helperText={helperText}
        submitting={submitting}
        onWin={onWin}
        onComezar={onComezar}
      />
    )
  }

  if (resolved.family === 'circuit_matrix' && resolved.config.game_id === 'tilt_maze') {
    return (
      <TiltMazeRuntimeScreen
        resolved={resolved}
        stage={stage}
        helperText={helperText}
        submitting={submitting}
        onWin={onWin}
        onComezar={onComezar}
      />
    )
  }

  if (resolved.family === 'circuit_matrix' && resolved.config.game_id === 'place_mosaic') {
    return (
      <PlaceMosaicRuntimeScreen
        resolved={resolved}
        stage={stage}
        helperText={helperText}
        submitting={submitting}
        onWin={onWin}
        onComezar={onComezar}
      />
    )
  }

  if (resolved.family === 'circuit_matrix' && resolved.config.game_id === 'sequence_code') {
    return (
      <SimonRuntimeScreen
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
        onComezar={onComezar}
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
        // Esta familia llama a onWin con su propio resultado; se descarta para
        // que no acabe interpretado como penalización de tiempo.
        onWin={() => onWin()}
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

  if (resolved.family === 'audio_challenge') {
    return <AudioChallengeRuntime onWin={onWin} />
  }

  if ((resolved.config as any)?.game_id === 'team_relay') {
    return (
      <TeamRelayRuntimeScreen
        resolved={resolved}
        stage={stage}
        helperText={helperText}
        submitting={submitting}
        onWin={onWin}
      />
    )
  }

  // El antiguo minijuego "Signal Hunt" (capturar señal y mantener) se eliminó:
  // todos los nodos de esta familia se comportan como checkpoint de llegada.
  return (
    <CheckpointRuntimeScreen
      resolved={resolved}
      stage={stage}
      helperText={helperText}
      submitting={submitting}
      onWin={onWin}
    />
  )
}

export default FamilyRuntimeHost
