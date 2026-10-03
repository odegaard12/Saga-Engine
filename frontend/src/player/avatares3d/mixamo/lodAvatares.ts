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

/** Quien se mueve menos que esto (metros netos en la ventana) está parado: ruido del GPS. */
export const RUIDO_PARADO_M = 1.4
export const VENTANA_VELOCIDAD_MS = 3500

/**
 * Velocidad (m/s) a partir del DESPLAZAMIENTO NETO en los últimos segundos, no de
 * la velocidad instantánea: el GPS da un punto cada pocos segundos y el muñeco
 * se desliza 1,4 s entre dos, así que la instantánea sería «anda, para, anda,
 * para». Con la ventana, quien camina sigue andando y quien baila de un lado a
 * otro con el ruido del GPS no avanza en neto y se queda parado.
 */
export function velocidadPorVentana(
  muestras: readonly MuestraDePosicion[],
  ahora: number,
  ventanaMs = VENTANA_VELOCIDAD_MS
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
  if (neto < RUIDO_PARADO_M) return 0
  return Math.min(7, neto / dt)
}

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

/**
 * Tamaño del avatar en el mundo según el zoom, en metros virtuales de altura.
 * A escala real mediría 2 píxeles a zoom 17; igual que los nodos, el avatar
 * conserva un tamaño de PANTALLA casi constante (algo menos que un nodo) y
 * crece un poco al acercarse.
 */
export function alturaVirtualM(zoom: number): number {
  const base = 46 * Math.pow(2, (17 - zoom) * 0.85)
  return Math.min(900, Math.max(1.75, base))
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
