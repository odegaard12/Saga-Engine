import { PREFIJO_PARTIDAS } from './minigames/core/partidasGuardadas'
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

/**
 * Dentro de una misma carga de la app el tiempo se mide con `performance.now()`, que no salta (revisión 19/10): la
 * hora del sistema sí, y la corrección automática al recuperar cobertura, en mitad de un nodo, sumaba o restaba ese
 * salto. El instante guardado (hora del sistema) sólo se usa para seguir tras una recarga.
 */
const anclas = new Map<string, number>()

function monotono(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

/**
 * Pero el reloj interno se PARA mientras el móvil duerme (Android con la pantalla apagada): sin esto, bloquear la
 * pantalla congelaba el reloj del nodo, que es justo la trampa que este fichero evita. Al volver a la app se suma lo
 * que pasó fuera según la hora del sistema (sólo si es más, y con tope: un cambio de hora no regala ni quita horas).
 */
const TOPE_FUERA_MS = 12 * 60 * 60 * 1000
let fueraDesde: { pared: number; interno: number } | null = null
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      fueraDesde = { pared: Date.now(), interno: monotono() }
      return
    }
    if (!fueraDesde) return
    const dormido = Math.min(TOPE_FUERA_MS, Date.now() - fueraDesde.pared) - (monotono() - fueraDesde.interno)
    fueraDesde = null
    if (dormido <= 0) return
    for (const [k, ancla] of anclas) anclas.set(k, ancla - dormido)
  })
}

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
/** ¿Ya corre el reloj de este nodo? */
export function nodoAbierto(user: string, stageId: string): boolean {
  return leer(user, stageId) > 0
}

export function abrirNodo(user: string, stageId: string): number {
  const existente = leer(user, stageId)
  if (existente) return existente

  const ahora = Date.now()
  anclas.set(clave(user, stageId), monotono())
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
  const k = clave(user, stageId)
  let ancla = anclas.get(k)
  if (ancla === undefined) {
    // Primera lectura en esta carga (tras recargar): se ancla una vez con la hora del sistema.
    ancla = monotono() - Math.max(0, Date.now() - inicio)
    anclas.set(k, ancla)
  }
  return Math.max(0, monotono() - ancla)
}

/** Se llama al superar el nodo: su reloj ya no hace falta. */
export function cerrarNodo(user: string, stageId: string) {
  anclas.delete(clave(user, stageId))
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(clave(user, stageId))
  } catch {
    // Nada que hacer.
  }
}

const CLAVE_RESET = 'saga:nodo-reset-visto:'

/** La última marca `reset_at` que este móvil ya aplicó (0 = ninguna). */
export function ultimoResetVisto(user: string): number {
  try {
    return Number(window.localStorage.getItem(CLAVE_RESET + user)) || 0
  } catch {
    return 0
  }
}

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
    for (const k of [...anclas.keys()]) if (k.startsWith(prefijo)) anclas.delete(k)
    // Con los relojes, las partidas a medias guardadas por los minijuegos (fallos y penalización).
    const aBorrar = Object.keys(window.localStorage).filter(
      (k) => k.startsWith(prefijo) || k.startsWith(PREFIJO_PARTIDAS)
    )
    aBorrar.forEach((k) => window.localStorage.removeItem(k))
  } catch {
    // Nada que hacer.
  }
}
