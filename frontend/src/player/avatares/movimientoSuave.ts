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

/** Lo que tarda el deslizamiento: lo mismo que la cámara que te sigue (1 400 ms, lineal). */
export const DURACION_DESLIZ_MS = 1400
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

  poner(fix: Punto, ahora: number, precisionM?: number | null): void {
    if (!this.hasta || !this.desde) {
      this.desde = this.hasta = { ...fix }
      this.t0 = ahora
      this.anclaRumbo = { ...fix }
      return
    }
    const aqui = this.posicion(ahora) as Punto
    if (distanciaM(aqui, fix) > SALTO_SIN_DESLIZAR_M) {
      this.desde = this.hasta = { ...fix }
      this.t0 = ahora
      this.anclaRumbo = { ...fix }
      this.rumboActual = null
      return
    }
    // El mismo punto otra vez (el latido repite): no reinicia el deslizamiento.
    if (distanciaM(this.hasta, fix) < 0.05) return
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
    const t = Math.min(1, Math.max(0, (ahora - this.t0) / DURACION_DESLIZ_MS))
    return t >= 1 ? { ...this.hasta } : entre(this.desde, this.hasta, t)
  }

  enMovimiento(ahora: number): boolean {
    return this.hasta !== null && this.desde !== this.hasta && ahora - this.t0 < DURACION_DESLIZ_MS
  }

  rumbo(ahora: number): number | null {
    if (this.rumboActual === null) return null
    return ahora - this.rumboEn > RUMBO_VIGENTE_MS ? null : this.rumboActual
  }
}

/** Cada cuánto como mucho se vuelve a dibujar mientras algo se desliza (ms): ~15 por segundo. */
export const INTERVALO_DIBUJO_MS = 66
