/**
 * La hora del servidor, para la cuenta atrás de "aún no toca".
 *
 * La cortina de inicio (`MissionLockScreen`) cuenta hasta `mission_launch_at`
 * contra el reloj del SERVIDOR, no contra el del móvil: cambiar la hora del
 * teléfono no adelanta nada. Para eso guarda la diferencia entre los dos relojes
 * en el momento en que llegó `server_time_ms`.
 *
 * Fallaba de dos maneras, las dos por calcular esa diferencia con la hora
 * del MOMENTO DE PINTAR y no con la de cuando llegó el dato:
 *
 *  - Sin cobertura se reabría con la configuración de días antes. El
 *    `server_time_ms` era de hace tres días, la diferencia salía de tres días, y
 *    la cuenta atrás iba atrasada otro tanto: a las 12:05 de una salida a las
 *    12:00 seguía diciendo «2d 23h».
 *  - Se calculaba UNA vez. Una configuración más fresca (con cobertura, o al
 *    volver la red) no cambiaba nada hasta matar la app.
 *
 * Aquí la hora llega con el instante (del móvil) en que se recibió; una muestra
 * más nueva sustituye a la anterior, y una muestra vieja no se usa: con la
 * cobertura perdida un buen rato es mejor el reloj del móvil, que el sistema
 * corrige solo, que un dato que envejece.
 */

const CLAVE = 'saga:reloj-del-servidor'

/** Cuánto vale una muestra de la hora del servidor antes de fiarse del móvil. */
export const VIGENCIA_DE_LA_HORA_MS = 30 * 60 * 1000

export interface MuestraDeReloj {
  /** `server_time_ms` tal y como lo dio el servidor. */
  serverTimeMs: number
  /** Qué hora era en el MÓVIL cuando llegó. */
  recibidoEnMs: number
}

function almacen(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

/** Una hora de servidor con sentido: un milisegundo de época real, no un 0. */
export function esHoraDeServidorValida(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor) && valor > 1_000_000_000_000
}

export function leerMuestraDeReloj(): MuestraDeReloj | null {
  try {
    const bruto = almacen()?.getItem(CLAVE)
    if (!bruto) return null
    const dato = JSON.parse(bruto) as Partial<MuestraDeReloj>
    if (!esHoraDeServidorValida(dato.serverTimeMs)) return null
    if (typeof dato.recibidoEnMs !== 'number' || !Number.isFinite(dato.recibidoEnMs)) return null
    return { serverTimeMs: dato.serverTimeMs, recibidoEnMs: dato.recibidoEnMs }
  } catch {
    return null
  }
}

/**
 * Apunta una hora del servidor recién recibida.
 *
 * Sólo sustituye a la guardada si es MÁS NUEVA. La hora manda el servidor: si la
 * que llega no es posterior a la que ya hay, es una respuesta atrasada —una
 * configuración guardada, sobre todo— y no puede pisar a una fresca.
 */
export function registrarHoraDelServidor(
  serverTimeMs: unknown,
  recibidoEnMs: number = Date.now()
): MuestraDeReloj | null {
  const actual = leerMuestraDeReloj()
  if (!esHoraDeServidorValida(serverTimeMs)) return actual

  if (actual && serverTimeMs <= actual.serverTimeMs) return actual

  const muestra: MuestraDeReloj = { serverTimeMs, recibidoEnMs }
  try {
    almacen()?.setItem(CLAVE, JSON.stringify(muestra))
  } catch {
    // Sin almacén se queda en la vuelta actual: la cortina vuelve a leer del móvil.
  }
  return muestra
}

/** Diferencia servidor − móvil medida en el momento de recibir la hora. */
export function desfaseDeLaMuestra(muestra: MuestraDeReloj): number {
  return muestra.serverTimeMs - muestra.recibidoEnMs
}

export interface HoraDelServidor {
  ms: number
  /** De dónde sale: la muestra reciente del servidor o el reloj del móvil. */
  fuente: 'servidor' | 'movil'
}

/**
 * Qué hora es en el servidor ahora mismo.
 *
 * Con una muestra reciente, la hora del móvil corregida con la diferencia de
 * entonces. Sin muestra, con una vieja, o si el móvil cambió de hora desde que
 * llegó (edad negativa), el reloj del móvil tal cual.
 */
export function horaDelServidorAhora(
  muestra: MuestraDeReloj | null,
  ahoraMovilMs: number = Date.now(),
  vigenciaMs: number = VIGENCIA_DE_LA_HORA_MS
): HoraDelServidor {
  if (!muestra) return { ms: ahoraMovilMs, fuente: 'movil' }

  const edad = ahoraMovilMs - muestra.recibidoEnMs
  if (edad < 0 || edad > vigenciaMs) return { ms: ahoraMovilMs, fuente: 'movil' }

  return { ms: ahoraMovilMs + desfaseDeLaMuestra(muestra), fuente: 'servidor' }
}
