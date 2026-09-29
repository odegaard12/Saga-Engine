/**
 * La evidencia de una partida: lo que el móvil aporta al completar un nodo
 * para que el servidor pueda volver a comprobarlo.
 *
 * El móvil sigue validando en local -sin cobertura es la única comprobación
 * que hay-, pero antes mandaba «OK» y ya está, y el servidor se lo creía. Ahora
 * el nodo completado lleva además CÓMO se ganó: las respuestas dadas, las
 * rondas con su opción y su tiempo, las últimas posiciones de GPS, el texto
 * del QR leído. El servidor lo revisa contra la configuración real (ver
 * backend/app/runtime/evidencia.py) y anota lo que no cuadre; nunca bloquea.
 *
 * Los juegos no tocan la firma de `onWin`: dejan su parte aquí con
 * `registrarEvidencia(nodo, {...})` justo antes de ganar, y `enviarCodigo` la
 * recoge con `construirEvidencia`. Lo que viaja está acotado a propósito.
 */

export const VERSION_DE_EVIDENCIA = 1

export type MuestraGps = {
  /** Milisegundos desde 1970, reloj del móvil. */
  t: number
  lat: number
  lon: number
  /** Precisión del fix en metros, si se conoce. */
  acc?: number
  /** `manual` = modo prueba. Nunca se esconde: el servidor sólo lo anota. */
  src: 'real' | 'manual'
}

type PosicionActual = { lat: number; lon: number; acc?: number; src: 'real' | 'manual' } | null

let proveedor: (() => PosicionActual) | null = null
const muestras: MuestraGps[] = []

/** Entre dos muestras seguidas, como mínimo esto, salvo que se pida a la fuerza. */
const SEPARACION_MINIMA_MS = 4_000
const MAXIMO_EN_MEMORIA = 24
const VENTANA_RECIENTE_MS = 15 * 60_000
const MUESTRAS_EN_LA_EVIDENCIA = 6

/** PlayerApp dice cómo leer la posición actual; este módulo no toca React. */
export function registrarProveedorDePosicion(lector: (() => PosicionActual) | null): void {
  proveedor = lector
}

/** Apunta la posición de ahora en el buffer. Devuelve la muestra, o null si no hay. */
export function anotarMuestraGps(forzar = false): MuestraGps | null {
  let actual: PosicionActual = null
  try {
    actual = proveedor ? proveedor() : null
  } catch {
    actual = null
  }
  if (!actual || !Number.isFinite(actual.lat) || !Number.isFinite(actual.lon)) return null

  const ahora = Date.now()
  const ultima = muestras[muestras.length - 1]
  if (!forzar && ultima && ahora - ultima.t < SEPARACION_MINIMA_MS) return ultima

  const muestra: MuestraGps = {
    t: ahora,
    lat: Math.round(actual.lat * 1e6) / 1e6,
    lon: Math.round(actual.lon * 1e6) / 1e6,
    src: actual.src,
  }
  if (typeof actual.acc === 'number' && Number.isFinite(actual.acc) && actual.acc >= 0) {
    muestra.acc = Math.round(actual.acc)
  }

  muestras.push(muestra)
  if (muestras.length > MAXIMO_EN_MEMORIA) muestras.splice(0, muestras.length - MAXIMO_EN_MEMORIA)
  return muestra
}

export function muestrasRecientes(
  cuantas = MUESTRAS_EN_LA_EVIDENCIA,
  ventanaMs = VENTANA_RECIENTE_MS
): MuestraGps[] {
  const limite = Date.now() - ventanaMs
  return muestras.filter((m) => m.t >= limite).slice(-cuantas)
}

// ---------------------------------------------------------------------------
// Lo que deja cada juego
// ---------------------------------------------------------------------------

const parciales = new Map<string, Record<string, unknown>>()

/** Un juego deja aquí su parte de la evidencia, justo antes de ganar. */
export function registrarEvidencia(nodo: string | number, parte: Record<string, unknown>): void {
  const clave = String(nodo)
  parciales.set(clave, { ...(parciales.get(clave) || {}), ...parte })
}

export function olvidarEvidencia(nodo: string | number): void {
  parciales.delete(String(nodo))
}

export type OpcionesDeEvidencia = {
  nodo: string | number
  code: string
  /** Escrito a mano en la casilla de respaldo: no es una partida jugada. */
  aMano?: boolean
}

/**
 * Arma la evidencia del nodo que se va a completar.
 *
 * Nunca lanza y nunca es obligatoria: si algo falla, el nodo se completa igual
 * sin ella y el servidor lo anota como «sin evidencia».
 */
export function construirEvidencia({ nodo, code, aMano }: OpcionesDeEvidencia): Record<string, unknown> {
  try {
    const codigo = String(code || '').trim()
    const via = aMano ? 'manual_code' : codigo.toUpperCase() === 'OK' ? 'juego' : 'qr'

    // La posición de justo ahora, siempre: es la que hizo llegar al nodo.
    anotarMuestraGps(true)

    const evidencia: Record<string, unknown> = {
      v: VERSION_DE_EVIDENCIA,
      via,
      ...(parciales.get(String(nodo)) || {}),
    }

    if (via === 'qr') evidencia.qr = { raw: codigo.slice(0, 120) }

    const gps = muestrasRecientes()
    if (gps.length) evidencia.gps = gps

    return evidencia
  } catch {
    return { v: VERSION_DE_EVIDENCIA }
  }
}

/** Sólo para pruebas. */
export function olvidarTodoLoDeEvidencia(): void {
  muestras.length = 0
  parciales.clear()
  proveedor = null
}
