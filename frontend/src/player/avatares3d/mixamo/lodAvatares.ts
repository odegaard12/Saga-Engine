/**
 * Cuántos avatares 3D se pintan, cuáles y con cuánto detalle. Lógica pura (sin
 * three.js, sin mapa, sin reloj propio) para poder probarla en Node.
 *
 * El presupuesto sale de lo que cuesta un avatar: ~45 000 triángulos con piel
 * (esqueleto de 65 huesos) y texturas de 512; los objetos de mano llevan sus clips de
 * agarre horneados, así que no cuestan más que el cuerpo. Un móvil de hace tres
 * o cuatro años no aguanta una docena a 30 por segundo, y con 14 jugadores
 * juntos la cuenta se dispara. Por eso:
 *
 *  - Hay un TOPE de avatares 3D por nivel de calidad; el resto se queda como la
 *    retrato redondo (el mapa ya sabe pintarlos, abrirlos en corro y agruparlos).
 *  - Siempre cuenta primero el tuyo, y luego los más cercanos al centro de la
 *    pantalla (los que se ven grandes y a los que se mira).
 *  - Si el móvil no llega al ritmo, la calidad BAJA sola, y no vuelve a subir.
 */

export type Calidad = 'baja' | 'media' | 'alta'
export const CALIDADES: readonly Calidad[] = ['baja', 'media', 'alta']

/** Por debajo de este zoom manda el retrato redondo (y la agrupación en manchas). */
export const ZOOM_MINIMO_AVATARES = 16
/** Con el mapa casi cenital un cuerpo de pie sólo enseñaría la coronilla: retrato. */
export const INCLINACION_MINIMA_GRADOS = 20

export const TOPE_DE_AVATARES: Record<Calidad, number> = { baja: 3, media: 6, alta: 10 }
/** Cada cuántos fotogramas se anima el que NO es de los primeros del orden. */
export const CADA_N_FOTOGRAMAS_LEJANOS: Record<Calidad, number> = { baja: 3, media: 2, alta: 1 }
/** Milisegundos entre fotogramas que se pide al mapa mientras hay avatares. */
export const MS_ENTRE_FOTOGRAMAS: Record<Calidad, number> = { baja: 50, media: 40, alta: 33 }

export type EntornoDelMovil = {
  memoriaGB?: number | null
  nucleos?: number | null
  /** devicePixelRatio. */
  densidad?: number | null
  /** Ancho de pantalla en píxeles CSS. */
  ancho?: number | null
}

/**
 * La calidad de partida según lo que dice el móvil. Los datos son aproximados
 * (Safari no da la memoria, Chrome la redondea hacia abajo), así que es sólo el
 * punto de partida: el medidor de fotogramas manda después.
 */
export function calidadInicial(e: EntornoDelMovil): Calidad {
  const mem = typeof e.memoriaGB === 'number' && e.memoriaGB > 0 ? e.memoriaGB : null
  const nuc = typeof e.nucleos === 'number' && e.nucleos > 0 ? e.nucleos : null
  if ((mem !== null && mem <= 3) || (nuc !== null && nuc <= 4)) return 'baja'
  if ((mem !== null && mem <= 4) || (nuc !== null && nuc <= 6)) return 'media'
  if (mem === null && nuc === null) return 'media'
  return 'alta'
}

export function calidadMasBaja(c: Calidad): Calidad {
  return c === 'alta' ? 'media' : 'baja'
}

export function formaQuePermiteTresD(zoom: number, inclinacionGrados: number): boolean {
  return zoom >= ZOOM_MINIMO_AVATARES && inclinacionGrados >= INCLINACION_MINIMA_GRADOS
}

export type CandidatoLod = {
  clave: string
  esYo: boolean
  /** Distancia (en la unidad que sea, pero la misma para todos) al centro de la pantalla. */
  distancia: number
  /** El modelo de su personaje ya está en memoria o se puede cargar. */
  disponible: boolean
  /** Dónde cae en pantalla (px CSS), si se quiere evitar que dos cuerpos se pisen. */
  pantalla?: { x: number; y: number }
}

/** Cuánto se pisan dos avatares en pantalla para que el de menos prioridad se quede en retrato. */
export type SolapeEnPantalla = {
  /** Semieje horizontal y vertical (px) de la zona que ocupa un cuerpo. */
  rx: number
  ry: number
  /** Los que ya van en 3D: para ellos el listón es algo más bajo (no parpadear al cruzarse dos). */
  yaEnTresD?: ReadonlySet<string>
}

export type Seleccion = {
  /** Los que se pintan en 3D, en orden de prioridad. */
  tresD: string[]
}

/**
 * Quién va en 3D. Tú el primero (si tu modelo no está disponible, la plaza se
 * deja libre); después los de menor distancia al centro. Los que no tienen el
 * modelo disponible no ocupan plaza: siguen con su retrato redondo.
 *
 * Con `solape`, quien caería ENCIMA de un cuerpo que ya va en 3D (quince jugadores en el
 * mismo sitio serían una maraña de brazos) se queda en retrato —el mapa los abre en corro
 * alrededor, ver `desplazamientoDeHueco`— y la plaza pasa al siguiente. Tú nunca cedes.
 */
export function elegirEnTresD(
  candidatos: readonly CandidatoLod[],
  calidad: Calidad,
  solape?: SolapeEnPantalla
): Seleccion {
  const tope = TOPE_DE_AVATARES[calidad]
  const sinSolape: CandidatoLod[] = []
  const quedan = candidatos
    .filter((c) => c.disponible)
    .slice()
    .sort((a, b) =>
      a.esYo === b.esYo
        ? a.distancia - b.distancia || (a.clave < b.clave ? -1 : 1)
        : a.esYo
          ? -1
          : 1
    )
  for (const c of quedan) {
    if (sinSolape.length >= tope) break
    if (solape && c.pantalla && !c.esYo) {
      const f = solape.yaEnTresD?.has(c.clave) ? 0.8 : 1
      const pisa = sinSolape.some(
        (o) =>
          o.pantalla &&
          ((o.pantalla.x - (c.pantalla as { x: number }).x) / (solape.rx * f)) ** 2 +
            ((o.pantalla.y - (c.pantalla as { y: number }).y) / (solape.ry * f)) ** 2 <
            1
      )
      if (pisa) continue
    }
    sinSolape.push(c)
  }
  return { tresD: sinSolape.map((c) => c.clave) }
}

export type MuestraDePosicion = { t: number; x: number; y: number }

/**
 * Quien se mueve menos que esto en la ventana (metros netos) está parado: ruido del GPS. Para
 * ECHAR A ANDAR hace falta más (`RUIDO_PARADO_M`); una vez andando basta con `RUIDO_SIGUE_M`:
 * sin esa histéresis, un teléfono quieto que baila 2-3 m con el ruido del GPS echaba a andar
 * y paraba cada pocos segundos.
 */
export const RUIDO_PARADO_M = 2.2
export const RUIDO_SIGUE_M = 0.8
export const VENTANA_VELOCIDAD_MS = 2500
/** Si en este último tramo no avanzó ni ~0,1 m/s ya ha parado: el muñeco no anda en el sitio. */
export const TRAMO_DE_PARADA_MS = 700
export const AVANCE_MINIMO_PARADA_M = 0.08

/**
 * Velocidad (m/s) a partir del DESPLAZAMIENTO NETO en los últimos segundos, no de
 * la velocidad instantánea. Los muñecos se deslizan a ritmo constante entre dos fixes (ver
 * `Deslizador`), así que es suave; la ventana sigue ahí para que el ruido del GPS (que baila
 * unos metros sin avanzar en neto) no eche a andar a nadie. `enMarcha` (¿andaba ya?) baja el
 * listón para seguir andando. Y cuando el último tramo ya no avanza, es 0 al instante en
 * vez de seguir «andando en el sitio» lo que quede de ventana.
 */
export function velocidadPorVentana(
  muestras: readonly MuestraDePosicion[],
  ahora: number,
  ventanaMs = VENTANA_VELOCIDAD_MS,
  enMarcha = false
): number {
  if (muestras.length < 2) return 0
  const ultima = muestras[muestras.length - 1]
  let primera = ultima
  for (let i = muestras.length - 1; i >= 0; i -= 1) {
    if (ahora - muestras[i].t > ventanaMs) break
    primera = muestras[i]
  }
  const dt = (ultima.t - primera.t) / 1000
  if (dt < 0.3) return 0
  const neto = Math.hypot(ultima.x - primera.x, ultima.y - primera.y)
  if (neto < (enMarcha ? RUIDO_SIGUE_M : RUIDO_PARADO_M)) return 0
  // ¿Sigue avanzando ahora mismo?
  let reciente = ultima
  for (let i = muestras.length - 1; i >= 0; i -= 1) {
    if (ultima.t - muestras[i].t > TRAMO_DE_PARADA_MS) break
    reciente = muestras[i]
  }
  if (ultima.t - reciente.t > 0.3 * TRAMO_DE_PARADA_MS) {
    const avance = Math.hypot(ultima.x - reciente.x, ultima.y - reciente.y)
    if (avance < AVANCE_MINIMO_PARADA_M) return 0
  }
  return Math.min(7, neto / dt)
}

/**
 * La velocidad con la que se ANIMA el paso, no la real. El muñeco se dibuja varias veces más
 * grande que una persona (`escalaVisual` = su tamaño en el mapa / 1,75 m): a velocidad real
 * sus pies recorrerían un paso entero mientras el mapa lo mueve unos píxeles (patinaje, o
 * «moonwalk»). Cuanto más grande se dibuja, más despacio se mueve el ciclo del paso; con
 * `escalaVisual` 1 (el tamaño de verdad) es la velocidad real, así que ahí no hay
 * patinaje. Un suelo mantiene el paso legible (no se queda en cámara lenta ni en el sitio).
 */
export function velocidadDePaso(v: number, escalaVisual: number): number {
  if (!(v > 0.05)) return 0
  const k = Math.max(1, Number.isFinite(escalaVisual) ? escalaVisual : 1)
  return Math.max(Math.min(v, VELOCIDAD_MIN_PASO), v / k ** 0.5)
}
/**
 * Lo más lento que se anima el paso de quien anda. 5.48: con los muñecos más grandes, 0,9 hacía que los pies
 * fueran 3-7 veces más deprisa que el suelo; con 0,6 (y el motor decidiendo andar/quieto por la velocidad REAL,
 * no por la del paso) el paso es más pausado y patina la mitad.
 */
export const VELOCIDAD_MIN_PASO = 0.6

/** Añade una muestra (cada ≥100 ms) y tira las que ya no caben en la ventana. */
export function anadirMuestra(
  muestras: MuestraDePosicion[],
  m: MuestraDePosicion,
  ventanaMs = VENTANA_VELOCIDAD_MS
): void {
  const ult = muestras[muestras.length - 1]
  if (ult && m.t - ult.t < 100) return
  muestras.push(m)
  while (muestras.length > 2 && m.t - muestras[0].t > ventanaMs * 2) muestras.shift()
}

/** Cuánto dura que un avatar recién aparecido crezca hasta su tamaño (ms) y desde qué fracción arranca. */
export const ENTRADA_MS = 220
export const ENTRADA_DESDE = 0.72
/** Fracción del tamaño final a los `msDesdeQueAparece` ms: sube con suavidad de 0,72 a 1. */
export function factorDeEntrada(msDesdeQueAparece: number): number {
  if (!(msDesdeQueAparece > 0)) return ENTRADA_DESDE
  const t = Math.min(1, msDesdeQueAparece / ENTRADA_MS)
  return ENTRADA_DESDE + (1 - ENTRADA_DESDE) * t * t * (3 - 2 * t)
}

/** Un avatar a la vista: dónde apoya los pies y dónde tiene la coronilla en pantalla (px CSS). */
export type SitioEnPantalla = { clave: string; esYo: boolean; x: number; pies: number; cabeza: number }

/** Lo mínimo que mide la zona tocable de un avatar (px): un dedo no acierta a menos. */
export const TOCABLE_MIN_ANCHO_PX = 44
export const TOCABLE_MIN_ALTO_PX = 52

/**
 * A quién se toca en (x, y): el cuerpo entero con un margen hasta los mínimos de un dedo. Si caen varios,
 * tú primero y, entre los demás, el que apoya más abajo en pantalla (el más cercano a la cámara, el que tapa).
 */
export function elegirTocado(sitios: readonly SitioEnPantalla[], x: number, y: number): string | null {
  let mejor: SitioEnPantalla | null = null
  for (const s of sitios) {
    if (![s.x, s.pies, s.cabeza].every(Number.isFinite)) continue
    const alto = Math.max(TOCABLE_MIN_ALTO_PX, s.pies - s.cabeza)
    const ancho = Math.max(TOCABLE_MIN_ANCHO_PX, 0.5 * (s.pies - s.cabeza))
    if (Math.abs(x - s.x) > ancho / 2 || y > s.pies + 10 || y < s.pies - alto) continue
    if (!mejor || (s.esYo && !mejor.esYo) || (s.esYo === mejor.esYo && s.pies > mejor.pies)) mejor = s
  }
  return mejor ? mejor.clave : null
}

/** Estatura real del modelo, en metros. */
export const ESTATURA_REAL_M = 1.75
/** Metros por píxel CSS a zoom 0 en el ecuador (mundo de 512 px, como MapLibre). */
export const METROS_POR_PX_Z0 = 78271.517

export function metrosPorPixel(zoom: number, latitud: number): number {
  return (METROS_POR_PX_Z0 * Math.cos((latitud * Math.PI) / 180)) / 2 ** zoom
}

/**
 * Alto en pantalla (px CSS) del avatar a zoom 16 y cuánto crece por nivel de zoom (x2^0,17).
 * 5.48: bastante más grandes (en el iPhone seguían viéndose pequeños): 80 px a z16, ~90 a z17, ~101 a z18,
 * ~113 a z19 y ~126 a z20, entre 64 y 136 px. Con el mapa inclinado el cuerpo se ve algo más bajo (~0,88): a
 * z18-z19 un jugador mide lo que un nodo (~92 px) o algo más.
 */
export const ALTO_AVATAR_Z16_PX = 80
export const CRECE_AVATAR_POR_ZOOM = 0.17
export const ALTO_AVATAR_MIN_PX = 64
export const ALTO_AVATAR_MAX_PX = 136

/**
 * Alto del avatar en PANTALLA (px CSS) según el zoom: 80 px a z16 y crece despacio al acercarse (~101 a z18, ~126
 * a z20), sin pasar de 136 px ni bajar de 64. Con el zoom tan cerca que su tamaño REAL (1,75 m) ya es mayor, pasa a
 * ser ese tamaño real: así de cerquísima se ve del tamaño de verdad frente a calles y casas, sin salto. Es el mismo
 * número para el 3D y para el retrato redondo (`TAMANO_JUGADOR` en el mapa sigue esta curva).
 */
export function alturaEnPantallaPx(zoom: number, latitud = 42.6): number {
  const objetivo = ALTO_AVATAR_Z16_PX * 2 ** (CRECE_AVATAR_POR_ZOOM * (zoom - 16))
  const comodo = Math.min(ALTO_AVATAR_MAX_PX, Math.max(ALTO_AVATAR_MIN_PX, objetivo))
  const real = ESTATURA_REAL_M / metrosPorPixel(zoom, latitud)
  return Math.max(comodo, real)
}

/**
 * Tamaño del avatar en el mundo según el zoom, en metros virtuales de altura (lo que se le
 * da al grupo three.js): el alto en pantalla de `alturaEnPantallaPx` por los metros que
 * mide un píxel a esa latitud. Nunca por debajo de su tamaño real.
 */
export function alturaVirtualM(zoom: number, latitud = 42.6): number {
  return Math.max(ESTATURA_REAL_M, alturaEnPantallaPx(zoom, latitud) * metrosPorPixel(zoom, latitud))
}

/**
 * Vigila el ritmo de los fotogramas y baja la calidad si no llega.
 *
 * `muestra(dtMs, ahora, esperaMs)` se llama con el tiempo entre dos fotogramas pintados y
 * con la espera que se pidió al mapa entre uno y otro (33-80 ms según la calidad y si
 * alguien anda): lo que cuenta es el EXCESO sobre esa espera, es decir, cuánto tardó de más
 * en pintar. Con el mapa quieto el ritmo es el pedido por nosotros, y medirlo contra el
 * ritmo «ideal» bajaba la calidad sin motivo. Si en una ventana de 2,5 s el exceso medio
 * pasa del límite, devuelve la calidad inferior (una vez; luego espera a medir de nuevo).
 * Nunca sube.
 */
export const EXCESO_MAXIMO_MS = 24

export class GobernadorDeCalidad {
  private suma = 0
  private n = 0
  private desde = 0
  constructor(
    public calidad: Calidad,
    private readonly ventanaMs = 2500,
    private readonly limiteMs = EXCESO_MAXIMO_MS
  ) {}

  muestra(dtMs: number, ahora: number, esperaMs = 0): Calidad | null {
    // Una pausa larga (pestaña oculta, hoja encima) no es lentitud.
    if (!Number.isFinite(dtMs) || dtMs > 400) {
      this.reiniciar(ahora)
      return null
    }
    if (this.n === 0) this.desde = ahora
    this.suma += Math.max(0, dtMs - esperaMs)
    this.n += 1
    if (ahora - this.desde < this.ventanaMs || this.n < 20) return null
    const media = this.suma / this.n
    this.reiniciar(ahora)
    if (media > this.limiteMs && this.calidad !== 'baja') {
      this.calidad = calidadMasBaja(this.calidad)
      return this.calidad
    }
    return null
  }

  private reiniciar(ahora: number) {
    this.suma = 0
    this.n = 0
    this.desde = ahora
  }
}
