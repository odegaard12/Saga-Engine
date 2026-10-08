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
 *  - Siempre cuenta primero el tuyo (y no gasta plaza del tope), y luego los más cercanos al centro de la
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
  /** Ya se pinta en 3D: desempata a su favor (histéresis) para que no parpadee al cruzarse dos distancias. */
  yaEnTresD?: boolean
}

export type Seleccion = {
  /** Los que se pintan en 3D, en orden de prioridad. */
  tresD: string[]
  /** Los que tienen modelo pero se quedaron fuera por el tope de la calidad. */
  porTope: string[]
}

/** Cuánto cuenta a favor estar ya en 3D: su distancia se multiplica por esto (0,8 = 20 % de ventaja). */
export const VENTAJA_DE_QUIEN_YA_ES_TRES_D = 0.8

/**
 * Quién va en 3D. Tú SIEMPRE (si tu modelo está disponible) y TU PLAZA NO CUENTA para el tope: antes, con la
 * calidad baja (3), tú y dos más agotaban el reparto y el resto del grupo se quedaba en retrato por mucho que
 * ampliara el zoom. Después, los de menor distancia al centro de la pantalla, hasta el tope de la calidad.
 * Los que no tienen el modelo disponible no ocupan plaza: siguen con su retrato redondo.
 *
 * 5.49: ya NO se deja en retrato a quien caería encima de otro cuerpo. Eso hacía que, al alejar el
 * zoom, uno pasara a retrato a una altura y otro a otra según dónde cayera (y el de detrás de ti se
 * quedaba en retrato tapado por tu cuerpo, con su aro asomando). Ahora el paso 3D <-> retrato es
 * sólo cosa del zoom y la inclinación (`formaQuePermiteTresD`), igual para todos, y los que caen
 * juntos se abren en corro (en el suelo, en metros: ver `corroEnMetros` en jugadoresEnMapa.ts).
 */
export function elegirEnTresD(candidatos: readonly CandidatoLod[], calidad: Calidad): Seleccion {
  const tope = TOPE_DE_AVATARES[calidad]
  const peso = (c: CandidatoLod) => c.distancia * (c.yaEnTresD ? VENTAJA_DE_QUIEN_YA_ES_TRES_D : 1)
  const quedan = candidatos.filter((c) => c.disponible)
  const yo = quedan.filter((c) => c.esYo)
  const otros = quedan
    .filter((c) => !c.esYo)
    .sort((a, b) => peso(a) - peso(b) || (a.clave < b.clave ? -1 : 1))
  return {
    tresD: [...yo, ...otros.slice(0, tope)].map((c) => c.clave),
    porTope: otros.slice(tope).map((c) => c.clave),
  }
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

/** Lo que tarda en irse un avatar cuyo jugador deja de estar (se encoge en vez de desaparecer de golpe). */
export const SALIDA_MS = 200
/** Fracción del tamaño a los `ms` de empezar a irse: de 1 a 0 con suavidad. */
export function factorDeSalida(ms: number): number {
  if (!(ms > 0)) return 1
  const t = Math.min(1, ms / SALIDA_MS)
  return 1 - t * t * (3 - 2 * t)
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
 * El `icon-size` del retrato de un jugador a este zoom: la misma curva que `TAMANO_JUGADOR` en el mapa
 * (interpolación exponencial de base 1,25 entre 0,8 a z12 y 1,9 a z20). Sirve para que el cuerpo 3D se
 * abra en corro EXACTAMENTE lo mismo que su retrato (`icon-offset` se multiplica por el `icon-size`).
 */
export const TAMANO_JUGADOR_CURVA = { base: 1.25, z0: 12, t0: 0.8, z1: 20, t1: 1.9 } as const
export function tamanoJugador(zoom: number): number {
  const { base, z0, t0, z1, t1 } = TAMANO_JUGADOR_CURVA
  const z = Math.min(z1, Math.max(z0, Number.isFinite(zoom) ? zoom : z0))
  const f = (base ** (z - z0) - 1) / (base ** (z1 - z0) - 1)
  return t0 + (t1 - t0) * f
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
