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
    | 'missing_item'
  primaryLabel: string
  primaryTone: PrimaryActionTone
  helperText: string
}

/** Objeto que falta para poder abrir el nodo, ya calculado por la app. */
export interface StageItemGateInfo {
  label: string
  missing: number
  quantity: number
}

export function deriveStageRuntime(args: {
  currentStage: PlayerStage | null
  finished: boolean
  distanceMeters: number | null
  gpsState: PlayerGpsStatus
  debugEnabled: boolean
  itemGate?: StageItemGateInfo | null
}): StageRuntimeState {
  const { currentStage, finished, distanceMeters, gpsState, debugEnabled, itemGate } = args

  if (finished) {
    return {
      canEnter: false,
      reason: 'finished',
      primaryLabel: 'MISIÓN COMPLETA',
      primaryTone: 'done',
      helperText: 'Xa completaches todos os nodos da travesía.',
    }
  }

  if (!currentStage) {
    return {
      canEnter: false,
      reason: 'missing_stage',
      primaryLabel: 'AGARDANDO NODO',
      primaryTone: 'locked',
      helperText: 'Non hai ningún nodo activo agora mesmo.',
    }
  }

  // El objeto exigido se comprueba ANTES que el GPS y que la distancia. Antes
  // sólo se miraba al enviar la respuesta: el nodo final se abría, se jugaba
  // entero y el rechazo llegaba al final. Además así se puede ir forjando por
  // el camino, que es una acción que no depende de dónde estés.
  if (itemGate) {
    const pieza = itemGate.label || 'un obxecto'
    return {
      canEnter: false,
      reason: 'missing_item',
      primaryLabel: 'FALTA UN OBXECTO',
      primaryTone: 'locked',
      helperText:
        currentStage.messages?.locked ||
        `Precisas ${pieza} para abrir este nodo. Fórxao na Mochila › Mesa de traballo.`,
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

  // Si ya se conoce la distancia es porque HAY posición. Antes se exigía
  // gpsState === 'ready' y el botón decía "GPS necesario" mientras el HUD, justo
  // debajo, decía "Ya puedes abrir este nodo". Se contradecían en pantalla.
  const gpsAvailable = gpsState === 'ready' || debugEnabled || distanceMeters !== null

  if (explicitFreeEntry) {
    return {
      canEnter: true,
      reason: 'free_entry',
      primaryLabel: 'ABRIR NODO',
      primaryTone: 'ready',
      helperText: currentStage.messages?.hint || currentStage.content || 'Nodo dispoñible.',
    }
  }

  if (!gpsAvailable) {
    return {
      canEnter: false,
      reason: 'gps_unavailable',
      primaryLabel: debugEnabled ? 'TOCA O MAPA' : 'GPS NECESARIO',
      primaryTone: 'gps',
      helperText: debugEnabled
        ? 'Toca o mapa para colocar unha posición simulada.'
        : currentStage.messages?.gps_unavailable || 'Sen sinal GPS para este nodo.',
    }
  }

  if (distanceMeters === null) {
    return {
      canEnter: false,
      reason: 'distance_unknown',
      primaryLabel: 'LOCALIZANDO...',
      primaryTone: 'gps',
      helperText: 'Agardando unha posición fiable.',
    }
  }

  if (distanceMeters <= currentStage.radius) {
    return {
      canEnter: true,
      reason: 'within_radius',
      primaryLabel: 'ABRIR NODO',
      primaryTone: 'ready',
      helperText: currentStage.messages?.hint || currentStage.content || 'Estás dentro do radio.',
    }
  }

  return {
    canEnter: false,
    reason: 'out_of_range',
    primaryLabel: 'ACHÉGATE MÁIS',
    primaryTone: 'warn',
    helperText:
      currentStage.messages?.locked ||
      `Acércate al radio de ${currentStage.radius} m para abrir este nodo.`,
  }
}
