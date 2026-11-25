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
 * 8/11 (Óscar, en casa con dos compañeros: «se solapan, puto desastre»): parados, el GPS de los tres baila unos metros
 * a cada latido. Cada baile rehacía el reparto (corona / sitio libre) y cada marcador se DESLIZABA a su sitio nuevo por
 * separado, así que se cruzaban y se tapaban casi siempre (medido: 5-7 de cada 24 muestras con solape; quietos, 0).
 * El ancla de cada uno sólo se mueve cuando el fix se aleja más que el ruido (`umbralDeRuido` de su precisión): quietos
 * se quedan quietos y el reparto no cambia.
 *
 * 11/11: ANDANDO, el ancla sigue cada fix. Antes avanzaba a saltos del ruido (hasta 2 × ruido por detrás: con 8 m de
 * precisión, el muñeco se quedaba clavado ~6 s y luego corría 10 m; «se queda atrás»). Una vez que echa a andar
 * (`avances`), cada fix que avanza ≥ 1 m hacia el mismo lado (±90°) mueve el ancla; el primero que retrocede o no
 * avanza la para, y vuelve a mandar el ruido.
 *
 * 24/11 (medido en el banco de movimiento: andando a 1,3 m/s con ±3 m de ruido, tu muñeco iba a tirones: 5 s clavado y 4 s a
 * 3,2 m/s): un fix suelto que no avanza es ruido y ya no la para; la paran `FALLOS_PARA_PARAR` seguidos. El MISMO fix otra vez
 * (el mapa lo repite con cada fix tuyo) no cuenta para nada.
 */
export const FALLOS_PARA_PARAR = 2
export class Anclas {
  private readonly puntos = new Map<string, Punto>()
  private readonly pendientes = new Map<string, Punto>()
  /** Quien está andando: su último avance (m al este y al norte). */
  private readonly avances = new Map<string, { e: number; n: number }>()
  /** Fixes seguidos andando que no avanzan, y el último fix de cada uno (para no contar dos veces el mismo). */
  private readonly fallos = new Map<string, number>()
  private readonly vistos = new Map<string, Punto>()

  /**
   * El ancla salta al fix si se aleja el doble del ruido (un salto de verdad), o si se aleja más que el ruido DOS
   * fixes seguidos hacia la misma zona (andar). Un fix suelto que se va y vuelve (el baile del GPS parado) no la mueve.
   */
  fijar(clave: string, fix: Punto, precisionM?: number | null): Punto {
    const a = this.puntos.get(clave)
    const visto = this.vistos.get(clave)
    if (a && visto && distanciaM(visto, fix) < 0.05) return a
    this.vistos.set(clave, { lat: fix.lat, lon: fix.lon })
    const u = umbralDeRuido(precisionM)
    const d = a ? distanciaM(a, fix) : Infinity
    const paso = a
      ? { e: (fix.lon - a.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180), n: (fix.lat - a.lat) * 111320 }
      : { e: 0, n: 0 }
    const avance = this.avances.get(clave)
    // Andando: cada fix que sigue hacia el mismo lado mueve el ancla (sin esperar a salir del ruido).
    if (a && avance && d >= 1 && paso.e * avance.e + paso.n * avance.n > 0) {
      this.pendientes.delete(clave)
      this.avances.set(clave, paso)
      this.fallos.delete(clave)
      const nuevo = { lat: fix.lat, lon: fix.lon }
      this.puntos.set(clave, nuevo)
      return nuevo
    }
    if (a && d < u) {
      // Dentro del ruido (y sin avanzar): parado.
      this.pendientes.delete(clave)
      if (d >= 0.05 && avance) {
        const f = (this.fallos.get(clave) ?? 0) + 1
        if (f >= FALLOS_PARA_PARAR) {
          this.avances.delete(clave)
          this.fallos.delete(clave)
        } else this.fallos.set(clave, f)
      }
      return a
    }
    const previo = this.pendientes.get(clave)
    // El MISMO fix otra vez (el mapa vuelve a repartir por zoom o giro, o lo piden dos sitios) no confirma nada.
    const confirma = previo !== undefined && distanciaM(previo, fix) >= 0.05 && distanciaM(previo, fix) < u
    if (a && d < 2 * u && !confirma) {
      this.pendientes.set(clave, { lat: fix.lat, lon: fix.lon })
      return a
    }
    this.pendientes.delete(clave)
    if (a) this.avances.set(clave, paso)
    this.fallos.delete(clave)
    const nuevo = { lat: fix.lat, lon: fix.lon }
    this.puntos.set(clave, nuevo)
    return nuevo
  }

  /** Olvida a quien ya no está (las claves que no salen en `vivas`). */
  podar(vivas: ReadonlySet<string>): void {
    for (const k of [...this.puntos.keys()]) {
      if (vivas.has(k)) continue
      this.puntos.delete(k)
      this.pendientes.delete(k)
      this.avances.delete(k)
      this.fallos.delete(k)
      this.vistos.delete(k)
    }
  }
}

/**
 * 24/11 (Óscar: «que no se muevan cuando no tienen que moverse»): dónde se DIBUJA tu muñeco, sobre lo que da FiltroGps (que sigue
 * mandando en el juego: tarjeta, brújula, abrir el nodo). Medido en el banco de movimiento: parado con ±8 m de ruido, el muñeco
 * andaba ~50 s de cada 120; andando con ruido, a tirones. Dos piezas, sin crear nada por fotograma (sólo en cada fix):
 *  - un filtro alfa-beta de posición y velocidad (`SUAVE_ALFA`, `SUAVE_BETA`): sin retraso a velocidad constante, ~la mitad de ruido;
 *  - parado con histéresis: quieto se queda en su sitio hasta alejarse 2 × la precisión, o hasta 3 fixes seguidos a más de
 *    `SUAVE_V_ANDAR` y algo de camino (`SUAVE_ARRANQUE` × precisión); andando, 3 fixes seguidos por debajo de `SUAVE_V_PARADO` lo paran.
 * Con precisión <= 2 m (modo prueba) o tras un hueco largo / salto grande, pasa el fix tal cual.
 */
export const SUAVE_ALFA = 0.25
export const SUAVE_BETA = 0.035
export const SUAVE_V_ANDAR = 0.6
export const SUAVE_V_PARADO = 0.3
export const SUAVE_ARRANQUE = 1
export class SuavizadoPropio {
  private ref: Punto | null = null
  private ultimo: Punto | null = null
  private x = 0
  private y = 0
  private vx = 0
  private vy = 0
  private t = 0
  private quieto: { x: number; y: number } | null = null
  private seguidos = 0

  /** La velocidad que lleva de verdad (m/s, la del filtro); 0 parado. El clip del muñeco sale de aquí, no de cómo se desliza. */
  velocidad(): number {
    return this.quieto ? 0 : Math.hypot(this.vx, this.vy)
  }

  private salida(): Punto {
    const r = this.ref as Punto
    const o = this.quieto ?? { x: this.x, y: this.y }
    return { lat: r.lat + o.y / 111320, lon: r.lon + o.x / (111320 * Math.cos((r.lat * Math.PI) / 180)) }
  }

  poner(fix: Punto, ahora: number, precisionM?: number | null): Punto {
    const p = typeof precisionM === 'number' && Number.isFinite(precisionM) && precisionM > 0 ? precisionM : PRECISION_SUPUESTA_M
    const r = this.ref
    if (r && this.ultimo && distanciaM(this.ultimo, fix) < 0.05) return this.salida()
    this.ultimo = { lat: fix.lat, lon: fix.lon }
    const zx = r ? (fix.lon - r.lon) * 111320 * Math.cos((r.lat * Math.PI) / 180) : 0
    const zy = r ? (fix.lat - r.lat) * 111320 : 0
    const dt = (ahora - this.t) / 1000
    if (!r || p <= 2 || dt > PAUSA_QUE_NO_ES_RITMO_MS / 1000 || Math.hypot(zx - this.x, zy - this.y) > SALTO_SIN_DESLIZAR_M) {
      this.ref = { lat: fix.lat, lon: fix.lon }
      this.x = this.y = this.vx = this.vy = 0
      this.quieto = { x: 0, y: 0 }
      this.seguidos = 0
      this.t = ahora
      return { lat: fix.lat, lon: fix.lon }
    }
    if (dt < 0.05) return this.salida()
    this.t = ahora
    this.x += this.vx * dt
    this.y += this.vy * dt
    const ex = zx - this.x
    const ey = zy - this.y
    this.x += SUAVE_ALFA * ex
    this.y += SUAVE_ALFA * ey
    this.vx += (SUAVE_BETA / dt) * ex
    this.vy += (SUAVE_BETA / dt) * ey
    const v = Math.hypot(this.vx, this.vy)
    const u = Math.max(RUIDO_MINIMO_M, p)
    if (this.quieto) {
      const d = Math.hypot(this.x - this.quieto.x, this.y - this.quieto.y)
      this.seguidos = v > SUAVE_V_ANDAR ? this.seguidos + 1 : 0
      if (d > 2 * u || (this.seguidos >= 3 && d > SUAVE_ARRANQUE * u)) {
        this.quieto = null
        this.seguidos = 0
      }
    } else {
      this.seguidos = v < SUAVE_V_PARADO ? this.seguidos + 1 : 0
      if (this.seguidos >= 3) {
        this.quieto = { x: this.x, y: this.y }
        this.seguidos = 0
      }
    }
    return this.salida()
  }
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
/**
 * 24/11 (Óscar: «si alguien se mueve 5 o 10 m, que no se ponga a correr»): `ritmoInicialMs` = el ritmo que se supone mientras
 * no se ha visto ninguno (el de un latido, no el de un GPS: con 1,3 s, quien llevaba quieto más de `pausaRitmoMs` cruzaba su
 * primer tramo a 3,2 m/s). `velocidadMinima` (m/s) = un tramo nunca dura más de lo que tardaría a ese paso (anda despacio en
 * vez de patinar quieto un minuto). El salto sin deslizar (`saltoM`) sólo cuenta si a pie no se llega: desde su fix anterior,
 * más deprisa que `VELOCIDAD_MAX_DESLIZ_MS` en el tiempo que pasó, o tras más de `maxMs` sin señal.
 */
export type DeslizadorOpciones = {
  maxMs?: number
  pausaRitmoMs?: number
  saltoM?: number
  pesoRitmo?: number
  ritmoInicialMs?: number
  velocidadMinima?: number
  /**
   * 24/11 (poca cobertura con muchos jugadores): tras más de `maxMs` sin señal NO se funde (15 a la vez a tirones): se pone al
   * día deslizándose en línea recta, como un tramo normal pero sin pasar de `ALCANCE_MAX_MS` salvo que haga falta ir a más de
   * `VELOCIDAD_MAX_DE_ALCANCE_MS`; si llega otro fix a medias, sigue desde donde va. Sólo se funde lo que a pie no se hace: más
   * deprisa que `VELOCIDAD_MAX_DESLIZ_MS` desde su fix anterior, o más de `SALTO_IMPOSIBLE_M`.
   */
  alcanceTrasPausa?: boolean
}

export const ALCANCE_MAX_MS = 40000
export const VELOCIDAD_MAX_DE_ALCANCE_MS = 5
export const SALTO_IMPOSIBLE_M = 2000
export const RESTO_DE_ALCANCE_M = 30
/** El clip mientras se pone al día: como mucho andar deprisa (nunca correr por ponerse al día; quien corre, corre en el siguiente tramo). */
export const CLIP_MAX_DE_ALCANCE_MS = 2.4

export class Deslizador {
  private desde: Punto | null = null
  private hasta: Punto | null = null
  private t0 = 0
  private anclaRumbo: Punto | null = null
  private rumboActual: number | null = null
  /** Cuándo fue el último salto sin deslizar (teleport de verdad, más de `saltoM`): quien dibuja lo funde en vez de pintarlo de golpe. */
  saltoEn: number | null = null
  private rumboEn = 0
  private dur = DURACION_DESLIZ_MS
  private ritmoMs = DURACION_DESLIZ_MS / MARGEN_DE_RITMO
  private llegoEn: number | null = null
  private readonly maxMs: number
  private readonly pausaRitmoMs: number
  private readonly saltoM: number
  private readonly pesoRitmo: number
  private readonly velocidadMinima: number
  private readonly alcance: boolean
  private alcanzando = false
  /** 24/11: la velocidad de VERDAD del último tramo (m/s: de su fix anterior a este, en lo que tardó): el clip sale de aquí. */
  velocidadReal = 0

  /**
   * 23/11: `opciones` para quien llega con el latido de otro móvil (compañeros): el deslizamiento dura el INTERVALO
   * observado entre sus fixes (hasta `maxMs`), un poco por detrás pero sin carreras (Óscar: «mejor un retraso suave que
   * ponerse al día»); sólo un salto de más de `saltoM` se coloca sin deslizar.
   */
  constructor(opciones: DeslizadorOpciones = {}) {
    this.maxMs = opciones.maxMs ?? DESLIZ_MAX_MS
    this.pausaRitmoMs = opciones.pausaRitmoMs ?? PAUSA_QUE_NO_ES_RITMO_MS
    this.saltoM = opciones.saltoM ?? SALTO_SIN_DESLIZAR_M
    this.pesoRitmo = opciones.pesoRitmo ?? 0.5
    this.velocidadMinima = opciones.velocidadMinima ?? 0
    if (opciones.ritmoInicialMs) this.ritmoMs = opciones.ritmoInicialMs
    this.alcance = opciones.alcanceTrasPausa ?? false
  }

  /** 24/11: la velocidad para el clip mientras se pone al día tras un corte (su paso de verdad, acotado), o null si no. */
  velocidadDeClip(ahora: number): number | null {
    if (!this.alcanzando || !this.enMovimiento(ahora) || !this.desde || !this.hasta) return null
    return Math.min(CLIP_MAX_DE_ALCANCE_MS, distanciaM(this.desde, this.hasta) / Math.max(1, this.dur / 1000))
  }

  /** Lo que dura el deslizamiento en curso (la cámara que te sigue usa el mismo tiempo). */
  duracionMs(): number {
    return this.dur
  }

  /** Cuánto tarda el siguiente fix según el ritmo de los anteriores (ms). */
  private anotarLlegada(ahora: number): void {
    if (this.llegoEn !== null) {
      const intervalo = ahora - this.llegoEn
      if (intervalo > 0 && intervalo <= this.pausaRitmoMs) {
        const util = Math.min(this.maxMs, Math.max(DESLIZ_MIN_MS, intervalo))
        this.ritmoMs += (util - this.ritmoMs) * this.pesoRitmo
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
    const salto = distanciaM(aqui, fix)
    const pasaron = this.llegoEn === null ? Infinity : ahora - this.llegoEn
    const tramo = distanciaM(this.hasta, fix)
    const imposible = tramo / Math.max(1e-3, pasaron / 1000) > VELOCIDAD_MAX_DESLIZ_MS
    if (salto > this.saltoM && (imposible || (this.alcance ? salto > SALTO_IMPOSIBLE_M : pasaron > this.maxMs))) {
      this.desde = this.hasta = { ...fix }
      this.t0 = ahora
      this.anclaRumbo = { ...fix }
      this.rumboActual = null
      this.llegoEn = ahora
      this.saltoEn = ahora
      this.alcanzando = false
      this.velocidadReal = 0
      return
    }
    // El mismo punto otra vez (el latido repite, o la pantalla se redibuja con los mismos datos): no reinicia el
    // deslizamiento NI cuenta como ritmo de fixes (si no, los compañeros parecerían mandar un fix por segundo).
    if (tramo < 0.05) return
    this.velocidadReal = Number.isFinite(pasaron) ? tramo / Math.max(1, pasaron / 1000) : 0
    // Sigue poniéndose al día mientras le quede de verdad (más de `RESTO_DE_ALCANCE_M` de lo que traía); si no, tramo normal.
    this.alcanzando = this.alcance && (pasaron > this.maxMs || (this.alcanzando && distanciaM(aqui, this.hasta) > RESTO_DE_ALCANCE_M))
    this.anotarLlegada(ahora)
    this.dur = duracionDeTramo(salto, this.ritmoMs, this.maxMs, this.velocidadMinima)
    if (this.alcanzando) this.dur = Math.min(this.dur, Math.max(ALCANCE_MAX_MS, (salto / VELOCIDAD_MAX_DE_ALCANCE_MS) * 1000))
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
}

/** Cuánto debe durar un tramo de `distancia` metros cuando los fixes llegan cada `ritmoMs` (y nunca más lento que `vMin` m/s). */
export function duracionDeTramo(distancia: number, ritmoMs: number, maxMs = DESLIZ_MAX_MS, vMin = 0): number {
  let porRitmo = Math.min(maxMs, Math.max(DESLIZ_MIN_MS, ritmoMs * MARGEN_DE_RITMO))
  if (vMin > 0) porRitmo = Math.min(porRitmo, Math.max(DESLIZ_MIN_MS, (distancia / vMin) * 1000))
  const porVelocidad = (distancia / VELOCIDAD_MAX_DESLIZ_MS) * 1000
  return Math.min(maxMs, Math.max(porRitmo, porVelocidad))
}

/** Lo más deprisa que se mueve alguien a pie, para saber cuánto avanza su icono entre dos dibujos (m/s). */
export const VELOCIDAD_MAX_A_PIE_MS = 2.5
/** Lo máximo que puede saltar el icono entre dos dibujos: menos de un píxel no se ve a trozos. */
export const PASO_MAXIMO_PX = 1
/** Cada cuánto como mucho se vuelve a dibujar mientras algo se desliza (ms): ~15 por segundo, a zoom cerca. */
export const INTERVALO_DIBUJO_MS = 66
/** Y como poco: con el mapa lejos un jugador casi no se mueve en pantalla. */
export const INTERVALO_DIBUJO_MAX_MS = 250

/**
 * Cada cuánto se redibuja el icono de quien se desliza, según el zoom (26/10, consumo).
 *
 * Revisión 19/10 de batería: de 30 a 15 dibujos por segundo, fijos. Pero cada `setData` repinta el mapa entero, y a
 * z17 (el zoom de siempre) 15 por segundo mueven el icono 0,2 píxeles por dibujo: no se ve. Ahora el intervalo es el
 * que deja el salto en un píxel, yendo a 2,5 m/s (más deprisa que nadie andando): a z17 unos 175 ms (6 por segundo),
 * a z18 unos 90 ms, a z19 o más los 66 de siempre, y nunca más de 250. El cuerpo 3D no depende de esto: la capa
 * de avatares lo coloca con la posición de cada fotograma.
 *
 * `lat` por defecto 42°: la mitad de la escala del mapa mundial cambia con el coseno de la latitud, y para el
 * resultado (un intervalo en ms redondeado) da igual entre 40° y 44°.
 */
export function intervaloDeDibujoMs(zoom: number, lat = 42): number {
  if (!Number.isFinite(zoom)) return INTERVALO_DIBUJO_MS
  const pxPorMetro = (512 * 2 ** zoom) / (40_075_016.686 * Math.cos((lat * Math.PI) / 180))
  const ms = (PASO_MAXIMO_PX / (pxPorMetro * VELOCIDAD_MAX_A_PIE_MS)) * 1000
  return Math.round(Math.min(INTERVALO_DIBUJO_MAX_MS, Math.max(INTERVALO_DIBUJO_MS, ms)))
}
