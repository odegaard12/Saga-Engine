import { limparRelojesQr } from './qrClock'

/**
 * Cronómetro de cada nodo, anclado al momento en que se abrió por primera vez.
 *
 * Antes lo llevaba la hoja de interacción en su propio estado y se ponía a cero
 * al cerrarla: cerrar el nodo y volver a abrirlo devolvía el contador atrás, así
 * que se podía parar el reloj a voluntad —mirar el reto, cerrar, pensarlo con
 * calma y volver a entrar— y sólo contaba el último intento. Eso es trampa.
 *
 * Ahora el instante de apertura vive en localStorage por jugador y nodo. El
 * tiempo se calcula siempre como "ahora menos ese instante", así que aguanta que
 * se cierre la hoja, que se cambie de pantalla y que se recargue la app.
 */

const PREFIJO = 'saga:nodo-abierto:'

function clave(user: string, stageId: string) {
  return `${PREFIJO}${user}:${stageId}`
}

function leer(user: string, stageId: string): number {
  if (typeof window === 'undefined') return 0
  try {
    const valor = Number(window.localStorage.getItem(clave(user, stageId)))
    return Number.isFinite(valor) && valor > 0 ? valor : 0
  } catch {
    return 0
  }
}

/**
 * Marca que el nodo está abierto y devuelve el instante en que se abrió.
 * Si ya estaba marcado, respeta el original: el reloj no se reinicia.
 */
export function abrirNodo(user: string, stageId: string): number {
  const existente = leer(user, stageId)
  if (existente) return existente

  const ahora = Date.now()
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(clave(user, stageId), String(ahora))
    } catch {
      // Si no hay almacenamiento, el cronómetro se comporta como antes.
    }
  }
  return ahora
}

/** Milisegundos desde que se abrió el nodo. 0 si todavía no se abrió. */
export function tiempoDelNodo(user: string, stageId: string): number {
  const inicio = leer(user, stageId)
  if (!inicio) return 0
  return Math.max(0, Date.now() - inicio)
}

/** Se llama al superar el nodo: su reloj ya no hace falta. */
export function cerrarNodo(user: string, stageId: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(clave(user, stageId))
  } catch {
    // Nada que hacer.
  }
}

const CLAVE_RESET = 'saga:nodo-reset-visto:'

/**
 * Aplica el reset que venga del panel de administración.
 *
 * Sin esto un jugador reseteado volvía al nodo 1 con el reloj de la partida
 * anterior todavía corriendo, y empezaba con minutos acumulados.
 *
 * Devuelve `true` sólo la primera vez que ve cada reset. Quien llama lo
 * necesita: un reset es la única vez que el servidor puede mandar un nivel MÁS
 * BAJO y tener razón, así que ese momento hay que distinguirlo de una respuesta
 * vieja o de un progreso sin sincronizar.
 */
export function aplicarResetDeRelojes(user: string, resetAt: number): boolean {
  if (typeof window === 'undefined') return false
  if (!resetAt || !Number.isFinite(resetAt)) return false

  try {
    const visto = Number(window.localStorage.getItem(CLAVE_RESET + user)) || 0
    if (resetAt <= visto) return false

    limpiarRelojes(user)
    // Los nodos de pegatina llevan su propio reloj, y tambien tiene que irse:
    // si no, un jugador reseteado vuelve al nodo 1 arrastrando los minutos que
    // llevaba buscando una pegatina en la partida anterior.
    limparRelojesQr(user)
    window.localStorage.setItem(CLAVE_RESET + user, String(resetAt))
    return true
  } catch {
    // Nada que hacer.
    return false
  }
}

/** Borra los relojes de todos los nodos: al resetear la partida. */
export function limpiarRelojes(user: string) {
  if (typeof window === 'undefined') return
  try {
    const prefijo = `${PREFIJO}${user}:`
    const aBorrar = Object.keys(window.localStorage).filter((k) => k.startsWith(prefijo))
    aBorrar.forEach((k) => window.localStorage.removeItem(k))
  } catch {
    // Nada que hacer.
  }
}
