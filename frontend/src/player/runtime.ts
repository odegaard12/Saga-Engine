import type { PlayerGpsStatus, PlayerStage } from '../types/player'
import { getLocale, type Locale } from '../i18n'
import { textosDePantallasDe } from './components/textosDePantallas'

/**
 * Cuánto se espera a una posición antes de abrir el nodo igual.
 *
 * Cuarenta y cinco segundos es de sobra para un arranque en frío del chip GPS
 * al aire libre. Si a esas alturas no hay posición, o no la va a haber, o va a
 * tardar tanto que da igual.
 */
export const ESPERA_MAXIMA_DE_GPS_MS = 45_000

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
    | 'gps_rendido'
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
  /**
   * Milisegundos esperando una posición en este nodo, si es que se espera.
   *
   * En el monte la precisión suele ser de 30 a 80 metros y a veces no llega
   * ninguna posición: bajo cubierta de pinar, en una vaguada, con el móvil
   * frío. Sin esto el nodo se quedaba en "LOCALIZANDO..." para siempre y no
   * había forma de entrar. Es un candidato claro a lo de "el el monte no me
   * dejaba entrar".
   */
  esperandoGpsMs?: number | null
  /**
   * Llegada comprobada por otro medio que el círculo del nodo.
   *
   * «Mapa mudo» no enseña su punto: el círculo que tiene el móvil es difuso y
   * de 150 m o más, así que «estar dentro del radio» completaba el nodo a
   * 250 m del sitio. Ahí la llegada se comprueba contra las celdas que manda
   * el servidor (ver utils/mapaMudo.ts) y se pasa aquí el resultado. `null` =
   * nodo normal, manda la distancia.
   */
  llegada?: boolean | null
  /** El idioma del botón y de la ayuda (sin él, el de ahora). */
  locale?: Locale
}): StageRuntimeState {
  const {
    currentStage,
    finished,
    distanceMeters,
    gpsState,
    debugEnabled,
    itemGate,
    esperandoGpsMs,
    llegada = null,
    locale = getLocale(),
  } = args
  const tx = textosDePantallasDe(locale).hud

  if (finished) {
    return {
      canEnter: false,
      reason: 'finished',
      primaryLabel: tx.misionCompleta,
      primaryTone: 'done',
      helperText: tx.todoHecho,
    }
  }

  if (!currentStage) {
    return {
      canEnter: false,
      reason: 'missing_stage',
      primaryLabel: tx.esperandoNodo,
      primaryTone: 'locked',
      helperText: tx.sinNodoActivo,
    }
  }

  // El objeto exigido se comprueba ANTES que el GPS y que la distancia. Antes
  // sólo se miraba al enviar la respuesta: el nodo final se abría, se jugaba
  // entero y el rechazo llegaba al final. Además así se puede ir forjando por
  // el camino, que es una acción que no depende de dónde estés.
  if (itemGate) {
    const pieza = itemGate.label || tx.unObjeto
    return {
      canEnter: false,
      reason: 'missing_item',
      primaryLabel: tx.faltaObjeto,
      primaryTone: 'locked',
      helperText: currentStage.messages?.locked || tx.necesitasPieza(pieza),
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
      primaryLabel: tx.abrirNodo,
      primaryTone: 'ready',
      helperText: currentStage.messages?.hint || currentStage.content || tx.nodoDisponible,
    }
  }

  /**
   * El rescate se mira ANTES que «GPS no disponible».
   *
   * Estaba dentro de `distanceMeters === null`, que sólo se alcanza con el GPS
   * disponible: con el GPS denegado, apagado o sin señal ninguna (justo el caso
   * para el que existe) se quedaba en «GPS necesario» para siempre y el rescate
   * no saltaba nunca. Pasado el tiempo de espera, se abre igual.
   */
  if (
    distanceMeters === null &&
    typeof esperandoGpsMs === 'number' &&
    esperandoGpsMs >= ESPERA_MAXIMA_DE_GPS_MS
  ) {
    return {
      canEnter: true,
      reason: 'gps_rendido',
      primaryLabel: tx.abrirNodo,
      primaryTone: 'warn',
      helperText: tx.gpsRendido,
    }
  }

  if (!gpsAvailable) {
    return {
      canEnter: false,
      reason: 'gps_unavailable',
      primaryLabel: debugEnabled ? tx.tocaElMapa : tx.gpsNecesario,
      primaryTone: 'gps',
      helperText: debugEnabled
        ? tx.tocaParaSimular
        : currentStage.messages?.gps_unavailable || tx.sinSenalEnNodo,
    }
  }

  if (distanceMeters === null) {
    // Pasado el tiempo razonable ya se abrió arriba (rescate «gps_rendido»): el
    // GPS es la puerta del nodo, pero la prueba de verdad es el reto de dentro.
    return {
      canEnter: false,
      reason: 'distance_unknown',
      primaryLabel: tx.localizando,
      primaryTone: 'gps',
      helperText: tx.esperandoPosicion,
    }
  }

  if (llegada === null ? distanceMeters <= currentStage.radius : llegada) {
    return {
      canEnter: true,
      reason: 'within_radius',
      primaryLabel: tx.abrirNodo,
      primaryTone: 'ready',
      helperText: currentStage.messages?.hint || currentStage.content || tx.dentroDelRadio,
    }
  }

  if (llegada === false) {
    // Mapa mudo: no se dice cuánto falta ni hacia dónde, sólo que aún no es.
    return {
      canEnter: false,
      reason: 'out_of_range',
      primaryLabel: tx.sigueBuscando,
      primaryTone: 'warn',
      helperText: tx.noEsElSitio,
    }
  }

  return {
    canEnter: false,
    reason: 'out_of_range',
    primaryLabel: tx.acercateMas,
    primaryTone: 'warn',
    helperText: currentStage.messages?.locked || tx.acercateAlRadio(currentStage.radius),
  }
}
