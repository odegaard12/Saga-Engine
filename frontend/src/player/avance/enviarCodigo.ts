import { advancePlayer } from '../../shared/api'
import type { PlayerGamePayload, PlayerStage } from '../../types/player'
import { cerrarNodo } from '../nodeClock'
import { collectInventoryItem } from '../offline/inventory'
import { flushOfflineEvents, syncInventoryToServer } from '../offline/localFirst'
import { advanceLocalProgress, syncPendingOfflineEvents } from '../offline/missionPack'
import { queueManualCode } from '../offline/physicalEvents'
import { readStageItemRequirement } from '../rewards/stageItemRequirement'
import { haptics, sounds } from '../utils/haptics'
import {
  avisoDeAvanceSinServidor,
  conTotalSumado,
  culparDelFallo,
  objetoDelNodo,
  rechazoDelServidor,
  rechazoLocal,
  tiempoQueSuma,
  totalPrevio,
} from './decisiones'

/**
 * Dar un nodo por superado. La operación más delicada del juego.
 *
 * Puede llegar desde cuatro sitios —un minijuego que se gana, un QR leído, el
 * código de rescate escrito a mano, y un punto de control que se completa
 * solo—, y tiene que acabar bien con servidor, sin servidor, y con un servidor
 * que contesta mal, que no son lo mismo.
 *
 * Todo lo que toca React se pasa en `entorno`: así esto se lee entero de una
 * vez, y `PlayerApp` sólo pone los cables.
 */

/** Lo que esta operación necesita del componente, y nada más. */
export interface EntornoDeAvance {
  payload: PlayerGamePayload
  currentStage: PlayerStage | null
  /** El nodo entrega un objeto al tocarlo en el mapa, sin reto. */
  esColeccionable: boolean
  /** La misma clave que usa la hoja de interacción: `stage.id`. */
  claveDelNodo: string
  /**
   * Candado de reentrada.
   *
   * Un `ref`, no estado: React actualiza el estado de forma asíncrona y no
   * frena dos llamadas dentro del mismo tick. Con 'OK' —que lo acepta
   * cualquier nodo— eso completaba varios nodos seguidos.
   */
  candado: { current: boolean }
  setSubmitting(valor: boolean): void
  setSubmitError(mensaje: string | null): void
  /** Cerrar la hoja del reto: el nodo ya está hecho. */
  cerrarHoja(): void
  /** Subir el marcador ya, sin esperar al servidor. */
  sumarAlMarcador(ms: number): void
  /** Pintar una partida que ha avanzado sólo en el móvil. */
  ponerPartidaSinServidor(payload: PlayerGamePayload): void
  refrescarPartida(): Promise<PlayerGamePayload>
  aviso(mensaje: string, tono: 'info' | 'warn' | 'success'): void
  pantalla(estado: 'node' | 'finish'): void
}

export interface CodigoEnviado {
  code: string
  timeSpentMs?: number
  penaltyMs?: number
  /** Escrito a mano en una casilla de respaldo. */
  aMano?: boolean
}

/** Cuánto se espera a que el envío anterior suelte el candado. */
const ESPERA_MAXIMA_MS = 4000
const REINTENTO_MS = 120

/** Lo que tarda el servidor en dejar anotado el tiempo del nodo. */
const SEGUNDO_REPASO_MS = 1500

export async function enviarCodigo(
  entorno: EntornoDeAvance,
  { code, timeSpentMs, penaltyMs, aMano }: CodigoEnviado
): Promise<boolean> {
  const { payload, currentStage, candado } = entorno

  /**
   * Si está ocupado se espera un poco en vez de descartar: el envío que lo
   * tiene cogido dura décimas de segundo y descartar era perder la lectura.
   */
  if (candado.current) {
    const hasta = Date.now() + ESPERA_MAXIMA_MS
    while (candado.current && Date.now() < hasta) {
      await new Promise((resolve) => setTimeout(resolve, REINTENTO_MS))
    }
    if (candado.current) return false
  }

  candado.current = true

  try {
    entorno.setSubmitting(true)
    entorno.setSubmitError(null)

    if (entorno.esColeccionable && currentStage && code === 'OK') {
      const objeto = objetoDelNodo(currentStage)

      collectInventoryItem({
        user: payload.user,
        item_id: objeto.itemId,
        label: objeto.label,
        quantity: objeto.quantity,
        source: 'manual',
        node_id: String(currentStage.id),
        metadata: {
          physical_icon: objeto.icon,
          node_title: currentStage.title || '',
          node_id: String(currentStage.id),
        },
        queue_event: true,
      })

      sounds.collect()
      haptics.collect()
      entorno.aviso(`⭐ ¡Recogido: ${objeto.label}!`, 'success')
    }

    /**
     * La mochila es local: fabricar en la mesa de trabajo no llega al servidor
     * hasta la siguiente sincronización de fondo. El servidor validaba el nodo
     * con un inventario viejo, respondía "missing_required_item" y la partida
     * sólo avanzaba en el móvil: la clasificación y el panel de administración
     * se quedaban en el nodo anterior. Se empuja el inventario justo antes de
     * validar.
     */
    if (readStageItemRequirement(currentStage)) {
      // Forzada: el servidor va a validar CON esta mochila, así que aquí no
      // vale el atajo de "no ha cambiado desde la última vez".
      await syncInventoryToServer(payload.user, fetch, { forzar: true }).catch(() => undefined)
    }

    const result = await advancePlayer(
      payload.user,
      code,
      timeSpentMs,
      penaltyMs,
      aMano,
      payload.level,
      // Si el servidor dice que va por detrás, se le suben los nodos que le
      // faltan y se reintenta. Los avances primero, en orden.
      async () => {
        await syncPendingOfflineEvents(payload.user).catch(() => undefined)
        await flushOfflineEvents(payload.user).catch(() => undefined)
      }
    )

    /**
     * Sigue por detrás después de subirle la cola.
     *
     * Ni ha avanzado ni va a avanzar hasta que se ponga al día, y darlo por
     * bueno es perder el nodo: eso es lo que pasaba antes, porque el servidor
     * contestaba «ok» en este caso y aquí sólo se miraba `status`. Se lanza
     * para caer abajo, guardarlo en local y no bloquear al jugador.
     */
    if (result.status === 'behind') {
      throw new Error(
        `el servidor va por el nodo ${result.server_level ?? result.level ?? '?'} y el móvil por el ${payload.level}`
      )
    }

    if (result.status !== 'ok') {
      const rechazo = rechazoDelServidor(result.reason)
      entorno.setSubmitError(rechazo.error)
      entorno.aviso(rechazo.aviso, 'warn')
      return false
    }

    // Nodo superado: su reloj ya no hace falta y no debe arrastrarse.
    cerrarNodo(payload.user, entorno.claveDelNodo)
    entorno.cerrarHoja()

    /**
     * El marcador sube AQUÍ, antes de esperar a nadie.
     *
     * El servidor ya ha anotado el tiempo —cuando contesta al avance, ya está
     * en disco—, y volver a preguntárselo devuelve el número bueno. Pero eso es
     * un viaje más, y sin cobertura no vuelve. Se suma aquí para que el jugador
     * vea su tiempo en el momento de superar el nodo, pase lo que pase con la
     * red.
     *
     * Lo de abajo lo corrige un instante después con el total del servidor, que
     * es el que manda. Si sale un número de más durante esa décima de segundo,
     * se corrige solo; lo que no puede salir es 00:00.
     */
    const sumado = tiempoQueSuma(timeSpentMs, penaltyMs)
    if (sumado > 0) entorno.sumarAlMarcador(sumado)

    const nextPayload = await entorno.refrescarPartida()

    /**
     * Un segundo repaso, un instante después.
     *
     * Esta primera lectura se pide en el mismo momento en que el servidor está
     * anotando el tiempo del nodo recién superado: llegaba el total de ANTES, o
     * sea 00:00 en el primer nodo, y no se corregía hasta el refresco de los
     * treinta segundos. Por eso al salir del modo de pruebas —que fuerza una
     * lectura— aparecía de golpe el 00:29 que llevaba ahí todo el rato.
     */
    window.setTimeout(() => {
      void entorno.refrescarPartida().catch(() => undefined)
    }, SEGUNDO_REPASO_MS)

    entorno.pantalla(nextPayload.finished ? 'finish' : 'node')
    sounds.success()
    haptics.success()
    entorno.aviso(
      nextPayload.finished ? '¡Misión completada! 🏆' : '¡Nodo superado! ⚡',
      'success'
    )

    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown submit error'
    const culpa = culparDelFallo(error)

    if (culpa.culpaDelServidor || culpa.paseCaducado) {
      console.error('[SAGA] el servidor rechazó el avance', { estado: culpa.estado, message })
    }

    try {
      const localResult = await advanceLocalProgress({
        payload,
        currentStage,
        code,
        timeSpentMs,
        aMano,
      })

      if (localResult.ok) {
        // Superado sin conexión: el reloj de este nodo también se cierra.
        cerrarNodo(payload.user, entorno.claveDelNodo)
        entorno.cerrarHoja()

        const payloadLocal = conTotalSumado(
          localResult.payload,
          // El total de antes sale de la partida que había en pantalla, no de
          // la que acaba de calcular el móvil: ésa trae el último que dio el
          // servidor y volvería a contar lo mismo.
          totalPrevio(payload),
          tiempoQueSuma(timeSpentMs, penaltyMs)
        )

        entorno.ponerPartidaSinServidor(payloadLocal)

        const finished = Boolean(payloadLocal.finished)
        const aviso = avisoDeAvanceSinServidor(culpa, finished)

        entorno.pantalla(finished ? 'finish' : 'node')
        entorno.aviso(aviso.texto, aviso.tono)

        return true
      }

      const rechazo = rechazoLocal(localResult.reason)

      if (rechazo.apuntarCodigo) {
        await queueManualCode({
          user: payload.user,
          node_id: currentStage?.id ? String(currentStage.id) : undefined,
          code,
          payload: {
            stage_title: currentStage?.title || '',
            reason: 'advance_sync_failed',
          },
        }).catch(() => undefined)
      }

      entorno.setSubmitError(rechazo.error)
      entorno.aviso(rechazo.aviso, 'warn')
      return false
    } catch {
      entorno.setSubmitError(message)
      entorno.aviso('Error al enviar. Comprueba tu conexión.', 'warn')
      return false
    }
  } finally {
    entorno.setSubmitting(false)
    candado.current = false
  }
}
