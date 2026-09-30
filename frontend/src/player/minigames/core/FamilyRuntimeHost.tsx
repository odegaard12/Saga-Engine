import { lazy, Suspense } from 'react'
import type { PlayerStage } from '../../../types/player'
import type { ResolvedMinigame } from './resolver'
import { useTextos } from './useTextos'
import { useSinRetoEnPantalla } from '../../hooks/useSinRetoEnPantalla'

/**
 * Cada familia de minijuego va en su propio paquete y se baja al abrir un nodo
 * de ese tipo. Antes iban las trece pantallas dentro del paquete de arranque,
 * y cada jugador se descargaba juegos que quizá no juegue nunca.
 *
 * Sin cobertura siguen estando: la lista de paquetes del jugador
 * (`/player-precache.json`) los incluye y se guardan al preparar el modo offline.
 */
const BearingHuntRuntimeScreen = lazy(() =>
  import('../families/bearingHunt/RuntimeScreen').then((modulo) => ({ default: modulo.BearingHuntRuntimeScreen }))
)
const CircuitMatrixRuntimeScreen = lazy(() =>
  import('../families/circuitMatrix/RuntimeScreen').then((modulo) => ({ default: modulo.CircuitMatrixRuntimeScreen }))
)
const SimonRuntimeScreen = lazy(() =>
  import('../families/sequenceCode/SimonRuntimeScreen').then((modulo) => ({ default: modulo.SimonRuntimeScreen }))
)
const PlaceMosaicRuntimeScreen = lazy(() =>
  import('../families/placeMosaic/RuntimeScreen').then((modulo) => ({ default: modulo.PlaceMosaicRuntimeScreen }))
)
const TiltMazeRuntimeScreen = lazy(() =>
  import('../families/tiltMaze/RuntimeScreen').then((modulo) => ({ default: modulo.TiltMazeRuntimeScreen }))
)
const SparkRadarRuntimeScreen = lazy(() =>
  import('../families/sparkRadar/RuntimeScreen').then((modulo) => ({ default: modulo.SparkRadarRuntimeScreen }))
)
const CheckpointRuntimeScreen = lazy(() =>
  import('../families/signalHunt/CheckpointRuntimeScreen').then((modulo) => ({ default: modulo.CheckpointRuntimeScreen }))
)
const CuentaSenalesRuntimeScreen = lazy(() =>
  import('../families/signalHunt/CuentaSenalesRuntimeScreen').then((modulo) => ({ default: modulo.CuentaSenalesRuntimeScreen }))
)
const MotionChallengeRuntimeScreen = lazy(() =>
  import('../families/motionChallenge/RuntimeScreen').then((modulo) => ({ default: modulo.MotionChallengeRuntimeScreen }))
)
const PulsoHierroRuntimeScreen = lazy(() =>
  import('../families/motionChallenge/PulsoHierroRuntimeScreen').then((modulo) => ({ default: modulo.PulsoHierroRuntimeScreen }))
)
const AudioChallengeRuntime = lazy(() =>
  import('../families/audioChallenge/AudioChallengeRuntime').then((modulo) => ({ default: modulo.AudioChallengeRuntime }))
)
const WordTrapRuntimeScreen = lazy(() =>
  import('../families/wordTrap/RuntimeScreen').then((modulo) => ({ default: modulo.WordTrapRuntimeScreen }))
)
const TeamRelayRuntimeScreen = lazy(() =>
  import('../families/teamRelay/RuntimeScreen').then((modulo) => ({ default: modulo.TeamRelayRuntimeScreen }))
)

export interface FamilyRuntimeHostProps {
  resolved: ResolvedMinigame
  stage: PlayerStage
  helperText: string
  submitting: boolean
  /**
   * El juego se ha ganado: manda el resultado al servidor.
   *
   * Devuelve `true` si el nodo se superó, `false` si NO se aceptó (el juego
   * tiene que soltar su «Avanzando…» y volver a ofrecer «Continuar») y
   * `undefined` si la llamada se ignoró por haber ya un envío en marcha. Los
   * juegos que no miran el resultado reciben una versión que devuelve `void`
   * (ver `FamilyRuntimeHostInterno`); la hoja les ofrece un «Reintentar» aparte.
   */
  onWin: (penaltyMs?: number, tempoDaPartidaMs?: number) => Promise<void | boolean>
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

function FamilyRuntimeHostInterno({
  resolved,
  stage,
  helperText,
  submitting,
  onWin,
  onComezar,
  appPosition = null,
}: FamilyRuntimeHostProps) {
  /**
   * Para los juegos que no miran si el nodo se aceptó: lo mismo que `onWin`
   * pero sin resultado. Un `Promise<boolean>` no cabe donde se espera un
   * `Promise<void>`, y así queda claro quién sabe reaccionar al `false`.
   */
  const onWinSinResultado = async (penaltyMs?: number) => {
    await onWin(penaltyMs)
  }

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
        onWin={onWinSinResultado}
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
        onWin={() => onWinSinResultado()}
      />
    )
  }

  if (resolved.family === 'motion_challenge' && resolved.config.game_id === 'pulso_hierro') {
    return (
      <PulsoHierroRuntimeScreen
        resolved={resolved}
        stage={stage}
        helperText={helperText}
        submitting={submitting}
        onWin={onWinSinResultado}
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
        onWin={onWinSinResultado}
      />
    )
  }

  if (resolved.family === 'audio_challenge') {
    return <AudioChallengeRuntime onWin={onWinSinResultado} />
  }

  if (resolved.family === 'word_trap') {
    return (
      <WordTrapRuntimeScreen
        resolved={resolved}
        stage={stage}
        helperText={helperText}
        submitting={submitting}
        onWin={onWinSinResultado}
      />
    )
  }

  if ((resolved.config as any)?.game_id === 'team_relay') {
    return (
      <TeamRelayRuntimeScreen
        resolved={resolved}
        stage={stage}
        helperText={helperText}
        submitting={submitting}
        onWin={onWinSinResultado}
      />
    )
  }

  if ((resolved.config as any)?.game_id === 'cuenta_senales') {
    return (
      <CuentaSenalesRuntimeScreen
        resolved={resolved}
        stage={stage}
        helperText={helperText}
        submitting={submitting}
        onWin={onWinSinResultado}
        appPosition={appPosition}
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

/** Mientras llega el paquete de la familia. Se ve un instante y sólo con red lenta. */
function CargandoJuego() {
  const t = useTextos()
  // Mientras llega el paquete del juego no hay reto delante: si la red va lenta
  // y el jugador mira otra app esperando, no cuenta como salida.
  useSinRetoEnPantalla(true)

  return (
    <div
      role="status"
      style={{
        display: 'grid',
        placeItems: 'center',
        minHeight: 160,
        color: 'rgba(226,232,240,.72)',
        font: '600 14px/1.4 system-ui, sans-serif',
      }}
    >
      {t.juego.cargando}
    </div>
  )
}

export function FamilyRuntimeHost(props: FamilyRuntimeHostProps) {
  return (
    <Suspense fallback={<CargandoJuego />}>
      <FamilyRuntimeHostInterno {...props} />
    </Suspense>
  )
}

export default FamilyRuntimeHost
