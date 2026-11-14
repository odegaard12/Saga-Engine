/**
 * Sumar o restar tiempo a un jugador desde el panel: leer lo que escribe el organizador y decirlo con palabras.
 * Puro (sin React) para poder probarlo.
 */

/** Lo máximo que se suma o resta de una vez: el servidor lo acota igual (6 h). */
export const SEGUNDOS_MAXIMOS = 6 * 3600

/**
 * Los segundos que ha escrito el organizador: «45», «-30», «1:30» (1 min 30 s) o «+2:00». Null si no se entiende o es 0.
 * Nunca más de ±6 h.
 */
export function leerSegundos(texto: string): number | null {
  const limpio = String(texto || '')
    .trim()
    .replace(/[−–—]/g, '-')
    .replace(',', '.')
  if (!limpio) return null
  const signo = limpio.startsWith('-') ? -1 : 1
  const sinSigno = limpio.replace(/^[+-]/, '')
  let segundos: number
  const minutosYSegundos = /^(\d{1,4}):([0-5]?\d)$/.exec(sinSigno)
  if (minutosYSegundos) {
    segundos = Number(minutosYSegundos[1]) * 60 + Number(minutosYSegundos[2])
  } else if (/^\d+(\.\d+)?$/.test(sinSigno)) {
    segundos = Math.round(Number(sinSigno))
  } else {
    return null
  }
  if (!Number.isFinite(segundos) || segundos <= 0) return null
  return signo * Math.min(segundos, SEGUNDOS_MAXIMOS)
}

/** «45 s», «1 min», «1 min 30 s», «2 h 5 min». */
export function etiquetaDeSegundos(segundos: number): string {
  const total = Math.max(0, Math.round(Math.abs(segundos)))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const partes: string[] = []
  if (h) partes.push(`${h} h`)
  if (m) partes.push(`${m} min`)
  if (s || partes.length === 0) partes.push(`${s} s`)
  return partes.join(' ')
}

/** «+1 min 30 s» o «−45 s» (con el signo, para el ajuste acumulado). */
export function ajusteConSigno(ms: number): string {
  if (!ms) return '0 s'
  return `${ms > 0 ? '+' : '−'}${etiquetaDeSegundos(ms / 1000)}`
}

/** La pregunta de confirmación antes de tocar el tiempo de alguien. */
export function preguntaDeAjuste(nombre: string, segundos: number, motivo: string): string {
  const verbo = segundos > 0 ? 'Sumar' : 'Restar'
  return (
    `¿${verbo} ${etiquetaDeSegundos(segundos)} al tiempo de ${nombre}?\n\n` +
    'No le cambia el nodo: sigue donde iba. El nuevo total llega a su móvil y a la clasificación en su próxima conexión.' +
    (motivo ? `\nMotivo: ${motivo}` : '')
  )
}
