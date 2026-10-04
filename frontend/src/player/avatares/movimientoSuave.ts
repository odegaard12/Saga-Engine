/**
 * Que tú y tus compañeros os DESLICÉIS por el mapa en vez de saltar.
 *
 * El GPS da un punto cada pocos segundos y, pintado tal cual, el muñeco se
 * teletransporta de uno a otro. Aquí se calcula, para cada uno, dónde está
 * ahora mismo entre el punto anterior y el nuevo, y hacia dónde camina.
 *
 * Es lógica pura -sin mapa, sin DOM, sin reloj propio: el tiempo entra por
 * parámetro- para poder ejecutarla en Node en las pruebas.
 */

export type Punto = { lat: number; lon: number }

/** Lo que tarda el deslizamiento mientras no se conoce el ritmo de los fixes (el primero). */
export const DURACION_DESLIZ_MS = 1400
/**
 * El deslizamiento dura lo que tarda en llegar el SIGUIENTE fix (con un 10 % de margen para
 * que un fix tardón no deje al muñeco parado un instante): así el muñeco va a la velocidad a
 * la que se anda de verdad y no a rachas (7 m en 1,4 s eran 5 m/s, y 3,6 s parado después).
 * Acotado: ni menos de 1 s (el GPS de un móvil da uno por segundo) ni más de 8 s.
 */
export const DESLIZ_MIN_MS = 1000
export const DESLIZ_MAX_MS = 8000
export const MARGEN_DE_RITMO = 1.1
/** Una pausa más larga que esto (parado, sin cobertura) no cuenta como ritmo de fixes. */
export const PAUSA_QUE_NO_ES_RITMO_MS = 15000
/** Nadie anda más deprisa que esto (un trote); si el tramo lo pide, tarda lo que haga falta. */
export const VELOCIDAD_MAX_DESLIZ_MS = 3.2
/** Cuánto tarda el rumbo que se pinta (la flecha del suelo) en alcanzar al real: constante de tiempo, ms. */
export const SUAVIZADO_RUMBO_MS = 220
/** A partir de aquí no es andar, es un salto (modo prueba, GPS recuperado): se coloca sin deslizar. */
export const SALTO_SIN_DESLIZAR_M = 150
/** El suelo del ruido del GPS: por debajo de esto, nunca se cambia el rumbo. */
export const RUIDO_MINIMO_M = 2.5
/** El techo: con un GPS malo (±60 m) el rumbo no puede quedarse congelado para siempre. */
export const RUIDO_MAXIMO_M = 25
/** Sin precisión conocida (los compañeros la mandan sin ella) se supone la de un móvil normal. */
export const PRECISION_SUPUESTA_M = 8
/** Cuánto tiempo sigue valiendo un rumbo una vez que dejas de moverte. */
export const RUMBO_VIGENTE_MS = 20000

const RAD = Math.PI / 180

/** Distancia en metros, con la aproximación plana: a estas distancias el error es de milímetros. */
export function distanciaM(a: Punto, b: Punto): number {
  const dLat = (b.lat - a.lat) * RAD
  const dLon = (b.lon - a.lon) * RAD * Math.cos(((a.lat + b.lat) / 2) * RAD)
  return 6371000 * Math.hypot(dLat, dLon)
}

/** Rumbo de a hacia b en grados, de 0 (norte) a 360, en sentido horario. */
export function rumboEntre(a: Punto, b: Punto): number {
  const dLon = (b.lon - a.lon) * RAD * Math.cos(((a.lat + b.lat) / 2) * RAD)
  const dLat = (b.lat - a.lat) * RAD
  const grados = Math.atan2(dLon, dLat) / RAD
  return (grados + 360) % 360
}

/** La diferencia de a a b por el lado corto, de -180 a 180. */
export function diferenciaAngular(a: number, b: number): number {
  return ((((b - a) % 360) + 540) % 360) - 180
}

/** Acerca `previo` a `nuevo` por el lado corto (peso 0 = se queda, 1 = salta). */
export function mezclarRumbo(previo: number, nuevo: number, peso: number): number {
  return (previo + diferenciaAngular(previo, nuevo) * peso + 360) % 360
}

/** El suelo de ruido para un fix con esta precisión. */
export function umbralDeRuido(precisionM?: number | null): number {
  const p = typeof precisionM === 'number' && Number.isFinite(precisionM) && precisionM > 0 ? precisionM : PRECISION_SUPUESTA_M
  return Math.min(RUIDO_MAXIMO_M, Math.max(RUIDO_MINIMO_M, p))
}

function entre(a: Punto, b: Punto, t: number): Punto {
  return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t }
}

/**
 * Un jugador que se desliza de fix en fix y sabe hacia dónde camina.
 *
 * - `poner(fix, ahora, precision)`: llega un punto nuevo.
 * - `posicion(ahora)`: dónde dibujarlo en este instante.
 * - `enMovimiento(ahora)`: si aún está deslizándose (el bucle de dibujo se
 *   apaga cuando nadie lo está).
 * - `rumbo(ahora)`: hacia dónde camina, o null si aún no se sabe o hace rato
 *   que está quieto.
 *
 * El rumbo sale del movimiento entre fixes, pero sólo cuando el
 * desplazamiento acumulado supera la imprecisión del GPS: un móvil quieto
 * baila unos metros y eso no es caminar. El ancla del rumbo NO se mueve con
 * el ruido, así que andar despacio acaba contando igual.
 */
export class Deslizador {
  private desde: Punto | null = null
  private hasta: Punto | null = null
  private t0 = 0
  private anclaRumbo: Punto | null = null
  private rumboActual: number | null = null
  private rumboEn = 0
  private dur = DURACION_DESLIZ_MS
  private ritmoMs = DURACION_DESLIZ_MS / MARGEN_DE_RITMO
  private llegoEn: number | null = null
  private rumboPintado: number | null = null
  private rumboPintadoEn = 0

  /** Lo que dura el deslizamiento en curso (la cámara que te sigue usa el mismo tiempo). */
  duracionMs(): number {
    return this.dur
  }

  /** Cuánto tarda el siguiente fix según el ritmo de los anteriores (ms). */
  private anotarLlegada(ahora: number): void {
    if (this.llegoEn !== null) {
      const intervalo = ahora - this.llegoEn
      if (intervalo > 0 && intervalo <= PAUSA_QUE_NO_ES_RITMO_MS) {
        const util = Math.min(DESLIZ_MAX_MS, Math.max(DESLIZ_MIN_MS, intervalo))
        this.ritmoMs += (util - this.ritmoMs) * 0.5
      }
    }
    this.llegoEn = ahora
  }

  poner(fix: Punto, ahora: number, precisionM?: number | null): void {
    if (!this.hasta || !this.desde) {
      this.desde = this.hasta = { ...fix }
      this.t0 = ahora
      this.anclaRumbo = { ...fix }
      this.llegoEn = ahora
      return
    }
    const aqui = this.posicion(ahora) as Punto
    if (distanciaM(aqui, fix) > SALTO_SIN_DESLIZAR_M) {
      this.desde = this.hasta = { ...fix }
      this.t0 = ahora
      this.anclaRumbo = { ...fix }
      this.rumboActual = null
      this.llegoEn = ahora
      return
    }
    // El mismo punto otra vez (el latido repite, o la pantalla se redibuja con los mismos datos): no reinicia el
    // deslizamiento NI cuenta como ritmo de fixes (si no, los compañeros parecerían mandar un fix por segundo).
    if (distanciaM(this.hasta, fix) < 0.05) return
    this.anotarLlegada(ahora)
    this.dur = duracionDeTramo(distanciaM(aqui, fix), this.ritmoMs)
    this.desde = aqui
    this.hasta = { ...fix }
    this.t0 = ahora

    const ancla = this.anclaRumbo as Punto
    if (distanciaM(ancla, fix) >= umbralDeRuido(precisionM)) {
      const nuevo = rumboEntre(ancla, fix)
      this.rumboActual = this.rumboActual === null ? nuevo : mezclarRumbo(this.rumboActual, nuevo, 0.6)
      this.rumboEn = ahora
      this.anclaRumbo = { ...fix }
    }
  }

  posicion(ahora: number): Punto | null {
    if (!this.desde || !this.hasta) return null
    const t = Math.min(1, Math.max(0, (ahora - this.t0) / this.dur))
    return t >= 1 ? { ...this.hasta } : entre(this.desde, this.hasta, t)
  }

  enMovimiento(ahora: number): boolean {
    return this.hasta !== null && this.desde !== this.hasta && ahora - this.t0 < this.dur
  }

  rumbo(ahora: number): number | null {
    if (this.rumboActual === null) return null
    return ahora - this.rumboEn > RUMBO_VIGENTE_MS ? null : this.rumboActual
  }

  /**
   * El rumbo para PINTAR (la flecha del suelo): se acerca al real por el lado corto en vez de
   * saltar a él cuando cambia. Llamar en cada dibujo; el tiempo entre llamadas fija cuánto avanza.
   */
  rumboSuave(ahora: number): number | null {
    const meta = this.rumbo(ahora)
    if (meta === null) {
      this.rumboPintado = null
      return null
    }
    if (this.rumboPintado === null) {
      this.rumboPintado = meta
    } else {
      const dt = Math.max(0, ahora - this.rumboPintadoEn)
      this.rumboPintado = mezclarRumbo(this.rumboPintado, meta, 1 - Math.exp(-dt / SUAVIZADO_RUMBO_MS))
    }
    this.rumboPintadoEn = ahora
    return this.rumboPintado
  }
}

/** Cuánto debe durar un tramo de `distancia` metros cuando los fixes llegan cada `ritmoMs`. */
export function duracionDeTramo(distancia: number, ritmoMs: number): number {
  const porRitmo = Math.min(DESLIZ_MAX_MS, Math.max(DESLIZ_MIN_MS, ritmoMs * MARGEN_DE_RITMO))
  const porVelocidad = (distancia / VELOCIDAD_MAX_DESLIZ_MS) * 1000
  return Math.min(DESLIZ_MAX_MS, Math.max(porRitmo, porVelocidad))
}

/** Cada cuánto como mucho se vuelve a dibujar mientras algo se desliza (ms): ~15 por segundo. */
export const INTERVALO_DIBUJO_MS = 66

/**
 * Cada cuánto se redibuja según el zoom: a z18 un paso de andar (1,4 m/s) son ~14 px/s, y a 15
 * dibujos por segundo el icono avanza a saltos de ~1 px mientras la cámara que lo sigue va
 * fina a 60: se nota como un temblor. Más cerca, más dibujos (menos de ~0,6 px por paso).
 */
export function intervaloDeDibujoMs(zoom: number): number {
  if (!Number.isFinite(zoom)) return INTERVALO_DIBUJO_MS
  if (zoom >= 18) return 33
  if (zoom >= 16.5) return 50
  return INTERVALO_DIBUJO_MS
}
