import type { PlayerGamePayload, PlayerStage } from '../../types/player'

/**
 * Las decisiones de "¿cuenta este nodo?", sin nada alrededor.
 *
 * Vivían dentro de `handleSubmitCode`, 341 líneas en mitad de `PlayerApp.tsx`,
 * mezcladas con los avisos, el reloj, la mochila y dos ciclos de red. Es la
 * función que decide si un jugador avanza o se queda parado en el monte, y no
 * tenía una sola prueba porque no había por dónde cogerla.
 *
 * Aquí sólo hay cuentas y textos: ni red, ni React, ni almacén. Lo que decide
 * a quién se le da por bueno un nodo, separado de lo que lo ejecuta.
 */

function comoObjeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {}
}

/**
 * Lo que suma al marcador superar un nodo.
 *
 * Se pinta en el móvil antes de preguntarle nada al servidor. El servidor ya lo
 * tiene anotado cuando contesta, pero volver a preguntárselo es un viaje más y
 * sin cobertura no vuelve: lo que no puede salir en pantalla es 00:00.
 *
 * Nunca resta. Un tiempo negativo —un reloj que se fue hacia atrás al cambiar
 * la hora del móvil, una penalización mal puesta— bajaría el total del jugador.
 */
export function tiempoQueSuma(timeSpentMs?: number, penaltyMs?: number): number {
  return Math.max(0, Math.round(timeSpentMs || 0)) + Math.max(0, Math.round(penaltyMs || 0))
}

/** El total que ya llevaba el jugador, tal y como lo dejó el servidor. */
export function totalPrevio(payload: PlayerGamePayload | null | undefined): number {
  return Number(
    (payload?.live_status as { total_time_ms?: unknown } | undefined)?.total_time_ms || 0
  )
}

export type ObjetoDelNodo = {
  itemId: string
  label: string
  icon: string
  quantity: number
}

/**
 * Qué entrega un nodo coleccionable, y cuántas unidades.
 *
 * Algunos dan más de una (las dos gemas del amuleto). El tope de 99 no es
 * decoración: la cantidad sale del editor y un dedo de más escribiendo pone
 * 1 000 gemas en la mochila de alguien.
 *
 * Ojo con de dónde se lee: aquí se mira el nodo y su `config`, que es lo que
 * hacía `handleSubmitCode`. Lo correcto sería `configDelNodo`, que da prioridad
 * a `minigame.config` — cambiarlo es un arreglo aparte, con su medida sobre la
 * misión real, no un efecto secundario de mover código de sitio.
 */
export function objetoDelNodo(stage: PlayerStage): ObjetoDelNodo {
  const raw = stage as unknown as Record<string, unknown>
  const config = comoObjeto(raw.config)

  const rawQuantity = raw.physical_item_quantity ?? config.physical_item_quantity ?? 1

  return {
    itemId: String(raw.physical_item_id || `item_${stage.id}`),
    label: String(raw.physical_item_label || stage.title || 'Objeto Coleccionable'),
    icon: String(raw.physical_icon || config.physical_icon || raw.icon || '⭐'),
    quantity: Math.max(1, Math.min(99, Number(rawQuantity) || 1)),
  }
}

export type CulpaDelFallo = {
  estado?: number
  /** El servidor ha contestado, y ha contestado mal. */
  culpaDelServidor: boolean
  /** El pase del jugador ya no vale. */
  paseCaducado: boolean
}

/**
 * Un fallo del servidor NO es lo mismo que quedarse sin cobertura.
 *
 * Todo caía junto —un 500, un pase caducado, o el monte sin antena— y el
 * jugador leía siempre "sin conexión". Así se escondió un error de backend
 * durante una partida entera: en el móvil todo iba bien y en el servidor no
 * existía. Un fallo invisible cuesta la ruta.
 *
 * Sin número de estado no se acusa a nadie: un `fetch` que no llega no trae
 * respuesta, y eso sí es el monte.
 */
export function culparDelFallo(error: unknown): CulpaDelFallo {
  const estado = (error as { status?: number } | null)?.status
  const numero = typeof estado === 'number' ? estado : undefined

  return {
    estado: numero,
    culpaDelServidor: numero !== undefined && numero >= 500,
    paseCaducado: numero === 401 || numero === 403,
  }
}

export type Rechazo = {
  /** Debajo de la casilla, se queda hasta el siguiente intento. */
  error: string
  /** El aviso flotante, que pasa. */
  aviso: string
}

/** El servidor ha dicho que no. Falta un objeto, o el código no es el suyo. */
export function rechazoDelServidor(reason?: string): Rechazo {
  return reason === 'missing_required_item'
    ? {
        error: 'Te falta un objeto requerido. Recógelo antes de continuar.',
        aviso: '¡Necesitas un objeto! Revisa tu mochila.',
      }
    : {
        error: 'Código incorrecto para este nodo.',
        aviso: 'Código no aceptado. Inténtalo de nuevo.',
      }
}

export type RechazoLocal = Rechazo & {
  /**
   * No hay nodo activo donde aplicar el código: se apunta para el organizador,
   * pero no avanza a nadie.
   */
  apuntarCodigo: boolean
}

/**
 * El móvil ha dicho que no, sin servidor delante.
 *
 * El caso de `missing_stage` es el delicado. Se llega cuando el avance falló y
 * la comprobación local dice que no hay nodo activo: el código se apunta para
 * que quede constancia, pero NO avanza a nadie, porque no se sabe cuál sería.
 *
 * El mensaje decía "se sincronizará cuando vuelva la red", que es mentira y de
 * las caras: el jugador se queda tranquilo esperando algo que no va a pasar en
 * vez de volver a intentarlo.
 */
export function rechazoLocal(reason?: string): RechazoLocal {
  if (reason === 'missing_required_item') {
    return {
      error: 'Te falta un objeto requerido. Recógelo antes de continuar.',
      aviso: '¡Necesitas un objeto! Revisa tu mochila.',
      apuntarCodigo: false,
    }
  }

  if (reason === 'invalid_code') {
    return {
      error: 'Código incorrecto para la misión offline descargada.',
      aviso: 'Código no aceptado en modo offline.',
      apuntarCodigo: false,
    }
  }

  return {
    error:
      'No se ha podido registrar el código y no hay nodo activo donde aplicarlo. ' +
      'Vuelve a intentarlo; queda anotado para el organizador.',
    aviso: 'El código no se ha aplicado. Inténtalo otra vez.',
    apuntarCodigo: true,
  }
}

export type AvisoDeAvance = {
  texto: string
  tono: 'warn' | 'success'
}

/**
 * Se dice lo que ha pasado de verdad.
 *
 * El nodo queda superado igual en los tres casos —el móvil manda mientras no
 * haya servidor— pero no es lo mismo estar sin cobertura que tener un servidor
 * caído: lo primero se arregla caminando, lo segundo hay que mirarlo. Antes
 * todo decía "sin conexión".
 */
export function avisoDeAvanceSinServidor(culpa: CulpaDelFallo, finished: boolean): AvisoDeAvance {
  if (finished) {
    // Al terminar la misión el tono no se ensucia: es su momento. Lo del
    // servidor se cuenta, pero sin alarma.
    return {
      texto: culpa.culpaDelServidor
        ? '🏆 Misión completada. El servidor ha fallado: sube en cuanto responda.'
        : '¡Misión completada en modo offline! 🏆 Se sincronizará al recuperar conexión.',
      tono: 'success',
    }
  }

  if (culpa.culpaDelServidor) {
    return {
      texto: '⚡ Nodo superado. El servidor ha fallado: se guarda aquí y sube cuando responda.',
      tono: 'warn',
    }
  }

  return {
    texto: culpa.paseCaducado
      ? '⚡ Nodo superado. Se ha renovado el pase: sube en la próxima sincronización.'
      : '¡Nodo superado sin conexión! ⚡ El progreso se sincronizará pronto.',
    tono: 'success',
  }
}

/**
 * Sin cobertura el marcador también sube.
 *
 * El total sale de `live_status`, y el que trae la partida guardada en el móvil
 * es el último que dio el servidor: sin red no hay servidor, así que se quedaba
 * clavado. Probado en el monte en modo avión: se completaban los nodos y el
 * reloj no se movía, y al volver los datos aparecía de golpe el tiempo bueno.
 *
 * El móvil sabe perfectamente lo que acaba de tardar. Se suma aquí, y cuando
 * vuelva la cobertura el total del servidor lo corrige.
 */
export function conTotalSumado(
  payloadLocal: PlayerGamePayload,
  previo: number,
  sumado: number
): PlayerGamePayload {
  if (sumado <= 0) return payloadLocal

  return {
    ...payloadLocal,
    live_status: {
      ...(payloadLocal.live_status || {}),
      total_time_ms: previo + sumado,
    },
  }
}
