import type { PlayerGpsStatus } from '../../types/player'

/**
 * Las reglas de GPS del juego, sin nada alrededor.
 *
 * Estaban repartidas por `PlayerApp.tsx` como cuentas sueltas entre la interfaz
 * y los ciclos de red. Son las que deciden si un jugador puede abrir un nodo, y
 * en el monte se equivocan de las dos maneras: si son estrictas, alguien que
 * está encima del nodo no puede entrar; si son laxas, se abre desde el coche.
 *
 * Aquí son funciones puras y con pruebas. Antes no tenían ninguna.
 *
 * El dato que manda todo esto: **bajo arbolado la precisión del GPS anda por
 * los 30-80 metros**, medido en el monte. Cualquier regla pensada para una
 * calle de ciudad falla ahí.
 */

/**
 * Precisión máxima que se acepta antes de dar la posición por inservible.
 *
 * Un límite fijo de 45 m descartaba la posición ENTERA en el monte, y el HUD se
 * quedaba sin distancia o congelado en el último valor bueno. Se acepta hasta
 * el radio del nodo, con un suelo de 60 m: si el nodo tiene 50 m de radio y el
 * GPS da 55, esa lectura sigue diciendo algo útil.
 */
export function limiteDePrecision(radioDelNodo: number | null): number {
  return Math.max(60, radioDelNodo ?? 50)
}

export function precisionAceptable(
  precision: number | null,
  radioDelNodo: number | null
): boolean {
  // Sin dato de precisión se acepta: el navegador no siempre lo da, y descartar
  // por no saber deja al jugador sin posición cuando sí la tiene.
  if (precision === null) return true
  return precision <= limiteDePrecision(radioDelNodo)
}

/**
 * Cuánto se le perdona al GPS al comprobar si está dentro del radio.
 *
 * Se descuenta el error de la lectura, con tope de 35 m. Sin descontarlo, con
 * 60 m de error y un nodo de 50 m de radio no se entra nunca aunque se esté
 * encima. Con el tope, tampoco se abre desde doscientos metros.
 */
export function margenQueSePerdona(precision: number | null): number {
  return Math.min(Math.max(precision ?? 0, 0), 35)
}

export type LecturaGps = {
  hayPosicion: boolean
  fresca: boolean
  precision: number | null
  /** Posición puesta a mano en modo de pruebas. Manda sobre todo lo demás. */
  simulada: boolean
}

/**
 * En qué estado está el GPS, para lo que se pinta y para poder abrir un nodo.
 *
 * `stale` y `searching` se distinguen a propósito: una posición vieja sigue
 * siendo una posición y se puede seguir enseñando en el mapa, mientras que una
 * imprecisa es que el chip está buscando. Decirle al jugador «sin GPS» cuando
 * lo que pasa es que está bajo un pinar es mentirle.
 */
export function estadoDelGps(
  lectura: LecturaGps,
  radioDelNodo: number | null
): PlayerGpsStatus {
  if (lectura.simulada) return 'ready'
  if (!lectura.hayPosicion) return 'unavailable'

  const precisa = precisionAceptable(lectura.precision, radioDelNodo)

  if (lectura.fresca && precisa) return 'ready'
  if (!lectura.fresca) return 'stale'
  if (!precisa) return 'searching'

  return 'unavailable'
}

/**
 * ¿Está dentro del nodo?
 *
 * `null` cuando no se puede saber: sin posición, o con un nodo sin coordenadas
 * o sin radio. Devolver `false` ahí sería decir que está fuera, que no es lo
 * mismo y deja al jugador esperando algo que no va a llegar.
 */
export function estaDentro(
  distanciaMetros: number | null,
  radioDelNodo: number | null,
  precision: number | null
): boolean | null {
  if (distanciaMetros === null) return null
  if (radioDelNodo === null || !Number.isFinite(radioDelNodo) || radioDelNodo <= 0) return null

  return distanciaMetros - margenQueSePerdona(precision) <= radioDelNodo
}

/**
 * Una posición vale para ABRIR un nodo si es de esta sesión y reciente.
 *
 * Al arrancar se restaura la última posición guardada (para pintar algo en el
 * mapa mientras llega el GPS), con `capturadaEn = null`. El desbloqueo la usaba
 * igual como último recurso: con la aplicación cerrada encima de un nodo, al
 * reabrirla en casa el nodo se podía abrir con la posición de ayer (auditoría
 * GPS P2). Ahora sólo cuentan las lecturas de esta sesión de menos de
 * `ANTIGUEDAD_MAXIMA_PARA_ABRIR_MS`; la de ayer se sigue pintando, pero no abre.
 */
export const ANTIGUEDAD_MAXIMA_PARA_ABRIR_MS = 3 * 60 * 1000

export function posicionValeParaAbrir(capturadaEn: number | null, ahoraMs: number = Date.now()): boolean {
  if (capturadaEn === null || !Number.isFinite(capturadaEn)) return false
  const edad = ahoraMs - capturadaEn
  return edad >= -5000 && edad <= ANTIGUEDAD_MAXIMA_PARA_ABRIR_MS
}
