import { lazy, Suspense, type CSSProperties } from 'react'
import type { PlayerStage } from '../../../types/player'
import type { ResolvedMinigame } from './resolver'
import { useTextos } from './useTextos'
import { useSinRetoEnPantalla } from '../../hooks/useSinRetoEnPantalla'
import { penalizacionDelResultado } from './modoAlternativo'

/**
 * Cada familia de minijuego va en su propio paquete y se baja al abrir un nodo
 * de ese tipo. Antes iban las trece pantallas dentro del paquete de arranque,
 * y cada jugador se descargaba juegos que quizá no juegue nunca.
 *
 * Sin cobertura siguen estando: la lista de paquetes del jugador
 * (`/player-precache.json`) los incluye y se guardan al preparar el modo offline.
 */
const cargarBearingHuntRuntimeScreen = () =>
  import('../families/bearingHunt/RuntimeScreen').then((modulo) => ({ default: modulo.BearingHuntRuntimeScreen }))
const BearingHuntRuntimeScreen = lazy(cargarBearingHuntRuntimeScreen)
const cargarCircuitMatrixRuntimeScreen = () =>
  import('../families/circuitMatrix/RuntimeScreen').then((modulo) => ({ default: modulo.CircuitMatrixRuntimeScreen }))
const CircuitMatrixRuntimeScreen = lazy(cargarCircuitMatrixRuntimeScreen)
const cargarSimonRuntimeScreen = () =>
  import('../families/sequenceCode/SimonRuntimeScreen').then((modulo) => ({ default: modulo.SimonRuntimeScreen }))
const SimonRuntimeScreen = lazy(cargarSimonRuntimeScreen)
const cargarPlaceMosaicRuntimeScreen = () =>
  import('../families/placeMosaic/RuntimeScreen').then((modulo) => ({ default: modulo.PlaceMosaicRuntimeScreen }))
const PlaceMosaicRuntimeScreen = lazy(cargarPlaceMosaicRuntimeScreen)
const cargarTiltMazeRuntimeScreen = () =>
  import('../families/tiltMaze/RuntimeScreen').then((modulo) => ({ default: modulo.TiltMazeRuntimeScreen }))
const TiltMazeRuntimeScreen = lazy(cargarTiltMazeRuntimeScreen)
const cargarSparkRadarRuntimeScreen = () =>
  import('../families/sparkRadar/RuntimeScreen').then((modulo) => ({ default: modulo.SparkRadarRuntimeScreen }))
const SparkRadarRuntimeScreen = lazy(cargarSparkRadarRuntimeScreen)
const cargarCheckpointRuntimeScreen = () =>
  import('../families/signalHunt/CheckpointRuntimeScreen').then((modulo) => ({ default: modulo.CheckpointRuntimeScreen }))
const CheckpointRuntimeScreen = lazy(cargarCheckpointRuntimeScreen)
const cargarCuentaSenalesRuntimeScreen = () =>
  import('../families/signalHunt/CuentaSenalesRuntimeScreen').then((modulo) => ({ default: modulo.CuentaSenalesRuntimeScreen }))
const CuentaSenalesRuntimeScreen = lazy(cargarCuentaSenalesRuntimeScreen)
const cargarMotionChallengeRuntimeScreen = () =>
  import('../families/motionChallenge/RuntimeScreen').then((modulo) => ({ default: modulo.MotionChallengeRuntimeScreen }))
const MotionChallengeRuntimeScreen = lazy(cargarMotionChallengeRuntimeScreen)
const cargarPulsoHierroRuntimeScreen = () =>
  import('../families/motionChallenge/PulsoHierroRuntimeScreen').then((modulo) => ({ default: modulo.PulsoHierroRuntimeScreen }))
const PulsoHierroRuntimeScreen = lazy(cargarPulsoHierroRuntimeScreen)
const cargarAudioChallengeRuntime = () =>
  import('../families/audioChallenge/AudioChallengeRuntime').then((modulo) => ({ default: modulo.AudioChallengeRuntime }))
const AudioChallengeRuntime = lazy(cargarAudioChallengeRuntime)
const cargarWordTrapRuntimeScreen = () =>
  import('../families/wordTrap/RuntimeScreen').then((modulo) => ({ default: modulo.WordTrapRuntimeScreen }))
const WordTrapRuntimeScreen = lazy(cargarWordTrapRuntimeScreen)
const cargarTeamRelayRuntimeScreen = () =>
  import('../families/teamRelay/RuntimeScreen').then((modulo) => ({ default: modulo.TeamRelayRuntimeScreen }))
const TeamRelayRuntimeScreen = lazy(cargarTeamRelayRuntimeScreen)

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
        // Esta familia llama a onWin con su propio resultado: de él sólo se
        // toma `penaltyMs` (el minuto del deslizador sin brújula).
        onWin={(resultado) => onWinSinResultado(penalizacionDelResultado(resultado))}
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
    return <AudioChallengeRuntime config={resolved.config} onWin={onWinSinResultado} />
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

/**
 * Mientras llega el paquete de la familia: un esqueleto, no un texto.
 *
 * Con el paquete ya guardado (segunda vez que se abre un juego de la familia,
 * o tras precargarlo) el juego llega antes de que se pinte nada, y el cartel
 * «Cargando juego…» salia UN fotograma y se iba: un destello que hacia que
 * abrir un juego pareciera lento justo cuando era instantaneo. El esqueleto
 * nace transparente y solo se hace visible pasados 160 ms (`.saga-esqueleto`
 * en mobile-themes.css): si el juego llega antes, nadie lo ve nunca.
 *
 * Reserva alto para que, al llegar el juego, la hoja no pegue un salto. El
 * texto sigue ahi para lectores de pantalla, escondido a la vista.
 */
function CargandoJuego() {
  const t = useTextos()
  // Mientras llega el paquete del juego no hay reto delante: si la red va lenta
  // y el jugador mira otra app esperando, no cuenta como salida.
  useSinRetoEnPantalla(true)

  return (
    <div
      role="status"
      className="saga-esqueleto"
      data-saga-anim="esqueleto-juego"
      style={{ display: 'grid', gap: 12, minHeight: 320, padding: 16, alignContent: 'start' }}
    >
      <span style={soloLectoresDePantalla}>{t.juego.cargando}</span>
      <div className="saga-esqueleto-bloque" style={{ height: 26, width: '58%' }} />
      <div className="saga-esqueleto-bloque" style={{ height: 14, width: '90%' }} />
      <div className="saga-esqueleto-bloque" style={{ height: 14, width: '74%' }} />
      <div className="saga-esqueleto-bloque" style={{ height: 150, marginTop: 8 }} />
      <div className="saga-esqueleto-bloque" style={{ height: 48, marginTop: 4 }} />
    </div>
  )
}

const soloLectoresDePantalla: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
}

/**
 * Baja por adelantado el paquete del juego de este nodo.
 *
 * Abrir un nodo montaba el juego y SOLO ENTONCES pedia su paquete: con la red
 * lenta la hoja se abria y se quedaba en esqueleto. La hoja de interaccion
 * llama a esto en cuanto conoce el nodo actual (en un rato libre), asi que al
 * abrirla el paquete ya esta y el juego entra sin esperar. Sigue el mismo
 * reparto que `FamilyRuntimeHostInterno`; si se desincronizasen, lo unico que
 * pasa es que se baja otro paquete de mas, nunca uno de menos.
 */
export function precargarJuego(resolved: ResolvedMinigame | null | undefined): void {
  if (!resolved) return
  const juego = (resolved.config as { game_id?: string } | undefined)?.game_id
  const cargas: Array<() => Promise<unknown>> = []
  if (resolved.family === 'circuit_matrix') {
    if (juego === 'spark_radar') cargas.push(cargarSparkRadarRuntimeScreen)
    else if (juego === 'tilt_maze') cargas.push(cargarTiltMazeRuntimeScreen)
    else if (juego === 'place_mosaic') cargas.push(cargarPlaceMosaicRuntimeScreen)
    else if (juego === 'sequence_code') cargas.push(cargarSimonRuntimeScreen)
    else cargas.push(cargarCircuitMatrixRuntimeScreen)
  } else if (resolved.family === 'bearing_hunt') cargas.push(cargarBearingHuntRuntimeScreen)
  else if (resolved.family === 'motion_challenge')
    cargas.push(juego === 'pulso_hierro' ? cargarPulsoHierroRuntimeScreen : cargarMotionChallengeRuntimeScreen)
  else if (resolved.family === 'audio_challenge') cargas.push(cargarAudioChallengeRuntime)
  else if (resolved.family === 'word_trap') cargas.push(cargarWordTrapRuntimeScreen)
  else if (juego === 'team_relay') cargas.push(cargarTeamRelayRuntimeScreen)
  else if (juego === 'cuenta_senales') cargas.push(cargarCuentaSenalesRuntimeScreen)
  else cargas.push(cargarCheckpointRuntimeScreen)
  cargas.forEach((cargar) => void cargar().catch(() => undefined))
}

export function FamilyRuntimeHost(props: FamilyRuntimeHostProps) {
  return (
    <Suspense fallback={<CargandoJuego />}>
      <FamilyRuntimeHostInterno {...props} />
    </Suspense>
  )
}

export default FamilyRuntimeHost
