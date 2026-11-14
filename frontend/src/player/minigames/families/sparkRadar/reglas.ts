// Reglas de Caza-Señales sin React (11/11, auditoría): se prueban en tests/js/auditoria_11_11.cjs.

/**
 * Como `readNumber`, pero el 0 VALE (11/11, auditoría): el servidor y el editor admiten «sin señales falsas»
 * (`echo_ratio: 0`) y «sin penalización» (`echo_penalty_s: 0`), y el móvil los cambiaba por 0,28 y 2 s.
 */
export function readNumberOCero(config: unknown, key: string, fallback: number): number {
  const raw = (config as Record<string, unknown>)?.[key]
  if (raw === null || raw === undefined || raw === '') return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

/**
 * Nuevo fin de la partida tras una salida de la app (14/11): el radar corre con el reloj de pared, así que una salida
 * CORTA (una llamada rechazada, un aviso; menos de `minimaMs`, que no cuenta como salida ni reinicia el reto) se comía
 * el tiempo de la partida. Se devuelve el tiempo fuera al final. Una salida larga no se compensa: esa sí cuenta, cobra
 * +30 s y rehace el reto entero.
 */
export function finTrasSalida(finMs: number, desdeMs: number, hastaMs: number, minimaMs: number): number {
  const fuera = hastaMs - desdeMs
  return fuera > 0 && fuera < minimaMs ? finMs + fuera : finMs
}

/** Cuánto se perdona un toque que cae donde una señal REAL acaba de apagarse (ms). */
export const GRACIA_SENAL_APAGADA_MS = 250

/**
 * ¿El toque en (x, y) -en % del radar- cae sobre una señal real apagada hace menos de la gracia? `radioPct` = radio
 * de la chispa en % del radar. 11/11: el intervalo de 100 ms retiraba la señal y el dedo, que ya iba, caía en el
 * radar vacío: contaba como fallo (y sumaba la penalización) por tocar una señal buena un instante tarde.
 */
export function tocaSenalRecienApagada(
  apagadas: readonly { x: number; y: number; t: number }[],
  x: number,
  y: number,
  ahora: number,
  radioPct: number
): boolean {
  return apagadas.some((a) => ahora - a.t <= GRACIA_SENAL_APAGADA_MS && Math.hypot(a.x - x, a.y - y) <= radioPct)
}
