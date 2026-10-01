/**
 * La celebración al completar un nodo: qué toca y cuándo.
 *
 * Al completar un nodo el mapa hace un festejo corto sobre él (onda en el
 * suelo, brillo, chispas y una insignia que «rebota») y, después, vuela al
 * siguiente nodo para enseñarlo. Todo junto < 2,5 s, y se corta en seco si
 * el jugador toca el mapa.
 *
 * Aquí está la parte que se puede probar sin navegador: CUÁNDO celebrar
 * (`decidirCelebracion`), la máquina de fases (`Celebracion`) y las curvas de
 * cada efecto. Dibujar es cosa de MapSurfaceGL.
 */

/** Lo que dura el festejo sobre el nodo hecho. */
export const DURACION_FESTEJO_MS = 1000
/** Lo que dura el vuelo al siguiente nodo (lo pasa a `flyTo`/`fitBounds`). */
export const DURACION_VUELO_MS = 1300
/** Tope de todo el conjunto. */
export const DURACION_MAXIMA_MS = 2500
/** Cuánto se espera a que dejen de tapar el mapa antes de dar la celebración por perdida. */
export const CADUCA_ESPERANDO_MS = 15000

export type FaseCelebracion = 'inactiva' | 'festejo' | 'vuelo'

export type PlanCelebracion = {
  /** Índice (desde 0) del nodo que se acaba de completar. */
  nodoHecho: number
  /** Con «reducir movimiento» no hay chispas, rebote ni vuelo: sólo un destello quieto. */
  reducido: boolean
  /** Hay un siguiente nodo al que volar. */
  conVuelo: boolean
}

export type EntradaDeCelebracion = {
  /** Nivel de antes y de ahora; `null` si aún no se había visto ninguno (primera lectura). */
  previo: number | null
  actual: number
  totalNodos: number
  reducido: boolean
  /** El nodo que toca ahora es de mapa mudo: su posición exacta es secreta. */
  siguienteEsMapaMudo: boolean
  /** El mapa ya ha pintado la primera vista. */
  mapaListo: boolean
}

/**
 * ¿Toca celebrar? Sólo al pasar EXACTAMENTE de un nivel al siguiente con el
 * mapa ya pintado: la primera lectura (entrar en la app con la partida a
 * medias) y los saltos de varios niveles (una cola de avances que sube de
 * golpe, el administrador moviendo al equipo) no son un nodo completado ante
 * tus ojos.
 *
 * Mapa mudo: NUNCA se vuela a un nodo cuya posición es secreta. El festejo sí
 * se hace (el nodo hecho ya está resuelto) pero sin vuelo.
 */
export function decidirCelebracion(e: EntradaDeCelebracion): PlanCelebracion | null {
  if (!e.mapaListo || e.previo === null) return null
  if (e.actual !== e.previo + 1) return null
  if (e.actual < 1 || e.actual > e.totalNodos) return null
  const haySiguiente = e.actual < e.totalNodos
  return {
    nodoHecho: e.actual - 1,
    reducido: e.reducido,
    conVuelo: haySiguiente && !e.siguienteEsMapaMudo && !e.reducido,
  }
}

/**
 * Las fases de una celebración. El tiempo entra por parámetro.
 *
 *   inactiva -> festejo -> vuelo -> inactiva
 *
 * `avanzar(ahora)` devuelve la fase en la que está y si ACABA DE CAMBIAR: el
 * bucle de dibujo arranca el vuelo cuando ve `cambio` con `vuelo`, una sola
 * vez. `cancelar()` la corta en cualquier punto (el jugador tocó el mapa).
 */
export class Celebracion {
  private inicio = 0
  private faseActual: FaseCelebracion = 'inactiva'
  private planActual: PlanCelebracion | null = null

  iniciar(plan: PlanCelebracion, ahora: number): void {
    this.planActual = plan
    this.inicio = ahora
    this.faseActual = 'festejo'
  }

  get fase(): FaseCelebracion {
    return this.faseActual
  }

  get plan(): PlanCelebracion | null {
    return this.planActual
  }

  /** De 0 a 1 mientras dura el festejo; 1 después. */
  progresoFestejo(ahora: number): number {
    if (this.faseActual === 'inactiva') return 1
    return Math.min(1, Math.max(0, (ahora - this.inicio) / DURACION_FESTEJO_MS))
  }

  avanzar(ahora: number): { fase: FaseCelebracion; cambio: boolean } {
    const antes = this.faseActual
    const t = ahora - this.inicio
    if (this.faseActual === 'festejo' && t >= DURACION_FESTEJO_MS) {
      this.faseActual = this.planActual?.conVuelo ? 'vuelo' : 'inactiva'
    }
    if (this.faseActual === 'vuelo' && t >= Math.min(DURACION_MAXIMA_MS, DURACION_FESTEJO_MS + DURACION_VUELO_MS)) {
      this.faseActual = 'inactiva'
    }
    if (this.faseActual === 'inactiva') this.planActual = null
    return { fase: this.faseActual, cambio: this.faseActual !== antes }
  }

  /** Corta la celebración (toque del jugador). Devuelve si había algo en marcha. */
  cancelar(): boolean {
    const habia = this.faseActual !== 'inactiva'
    this.faseActual = 'inactiva'
    this.planActual = null
    return habia
  }
}

// ---------------------------------------------------------------- curvas

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/** Sale rápido y frena: 0 -> 1. */
export function salidaSuave(t: number): number {
  const x = 1 - clamp01(t)
  return 1 - x * x * x
}

/**
 * La insignia «rebota»: entra con una sobreoscilación (0 -> ~1,25 -> 1) y se
 * apaga al final. Devuelve la escala y la opacidad; nada se mueve de sitio,
 * así que no hace falta desplazar nada en pantalla.
 */
export function rebote(t: number): { escala: number; opacidad: number } {
  const x = clamp01(t)
  // Elástico amortiguado: 1 - e^(-7x) * cos(3x·2π/ ... ) acotado para que no baje de 0.
  const escala = x <= 0 ? 0 : 1 - Math.exp(-6 * x) * Math.cos(x * 9.5)
  const opacidad = x < 0.7 ? 1 : 1 - (x - 0.7) / 0.3
  return { escala: Math.max(0, escala), opacidad: clamp01(opacidad) }
}

/** La onda del suelo: crece y se desvanece. `retraso` (0..1) escalona dos ondas. */
export function onda(t: number, retraso = 0): { escala: number; opacidad: number } {
  const x = clamp01((t - retraso) / (1 - retraso))
  if (x <= 0) return { escala: 0.3, opacidad: 0 }
  return { escala: 0.4 + 3.4 * salidaSuave(x), opacidad: 0.85 * (1 - x) }
}

/** El brillo del nodo: sube deprisa, baja despacio. */
export function brillo(t: number): { escala: number; opacidad: number } {
  const x = clamp01(t)
  const sube = x < 0.22 ? x / 0.22 : 1 - (x - 0.22) / 0.78
  return { escala: 1 + 0.35 * Math.sin(x * Math.PI), opacidad: clamp01(sube) * 0.95 }
}

export type Chispa = {
  /** Desplazamiento en píxeles de pantalla respecto al nodo (este, norte). */
  dx: number
  dy: number
  escala: number
  opacidad: number
}

/** Generador determinista (para que la prueba repita exactamente el mismo estallido). */
function aleatorio(semilla: number): () => number {
  let s = semilla >>> 0 || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

/**
 * Las chispas del estallido en el instante `t` (0..1) del festejo: salen en
 * abanico, frenan y se apagan. Sobre el suelo: dx/dy son píxeles que el mapa
 * convierte a metros con el zoom de ese momento.
 */
export function chispas(t: number, cuantas = 14, semilla = 7): Chispa[] {
  const azar = aleatorio(semilla)
  const x = clamp01(t)
  const lista: Chispa[] = []
  for (let i = 0; i < cuantas; i += 1) {
    const angulo = (i / cuantas) * Math.PI * 2 + azar() * 0.4
    const alcance = 34 + azar() * 40
    const retraso = azar() * 0.18
    const y = clamp01((x - retraso) / (1 - retraso))
    const recorrido = alcance * salidaSuave(y)
    lista.push({
      dx: Math.cos(angulo) * recorrido,
      dy: Math.sin(angulo) * recorrido,
      escala: 0.55 + azar() * 0.6 * (1 - y * 0.5),
      opacidad: y <= 0 ? 0 : clamp01(1 - y * y),
    })
  }
  return lista
}

/** ¿El jugador pide menos movimiento? (navegador con `prefers-reduced-motion: reduce`). */
export function prefiereMenosMovimiento(
  matchMedia: ((consulta: string) => { matches: boolean }) | undefined
): boolean {
  try {
    return Boolean(matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)
  } catch {
    return false
  }
}
