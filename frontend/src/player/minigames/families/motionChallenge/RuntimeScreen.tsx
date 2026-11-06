import type { PlayerStage } from '../../../../types/player'
import type { ResolvedMotionChallengeMinigame } from '../../core/resolver'
import { DinamoRuntimeScreen } from './DinamoRuntimeScreen'
import { FarosRuntimeScreen } from '../bearingHunt/FarosRuntimeScreen'

/**
 * El reto de movimiento genérico.
 *
 * 7/11: sólo queda Dinamo. El «ocho» (`figure_eight`) y la «caja fuerte» (`rotary_safe`) no se podían elegir en el
 * panel ni los aceptaba el servidor, y eran ~900 líneas que no jugaba nadie: un nodo viejo que aún los tuviera se
 * juega como Dinamo (ver `motionChallenge/definition.ts`, que normaliza el objetivo a `shake_charge`).
 */
interface Props {
  resolved: ResolvedMotionChallengeMinigame
  stage: PlayerStage
  helperText: string
  submitting: boolean
  /** `penaltyMs`: el minuto del modo táctil, si se jugó así. */
  onWin: (penaltyMs?: number) => Promise<void>
  /** 4/11: el reloj del nodo arranca al empezar a jugar, no al abrir (las reglas no cuentan). */
  onComezar?: () => void
}

export function MotionChallengeRuntimeScreen(props: Props) {
  // Nodos viejos que guardaron «Rumbo doble» como reto de movimiento: también son Faros.
  if ((props.resolved.config as { game_id?: string }).game_id === 'rumbo_doble')
    return <FarosRuntimeScreen {...props} onWin={(r) => props.onWin(Number(r?.penaltyMs) || 0)} />
  return <DinamoRuntimeScreen {...props} />
}

export default MotionChallengeRuntimeScreen
