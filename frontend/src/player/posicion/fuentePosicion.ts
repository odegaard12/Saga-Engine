/**
 * 23/11: UNA sola fuente de verdad de dónde está cada jugador en el mapa (Óscar: «que se queden donde están, mueva la
 * cámara lo que mueva»). Módulo puro (sin DOM, sin mapa, sin cámara): la cámara sólo PROYECTA lo que sale de aquí.
 *
 *   real(id)    UNA cadena por id: fix → banda muerta (compañeros: max(precisión, 12 m)) → deslizamiento entre fixes.
 *   dibujo(id)  = real + apartado, en METROS y sólo con geografía (posiciones reales + postes de los nodos).
 *
 * El apartado existe SÓLO para quien está pegado al poste de un nodo (disco de `R_DISCO_M` en el suelo, igual desde
 * cualquier cámara): se le lleva al borde del disco, como mucho `TOPE_APARTADO_M` de su sitio; lo que no cabe, al
 * abanico. TÚ nunca te apartas (`apartado(yo) = 0`): tu cuerpo es un obstáculo fijo que los demás esquivan. Cada uno
 * elige hueco por el hash de su id (no por el orden de llegada ni por quién más esté), y si el objetivo cambia el
 * apartado se anima de forma continua (`TAU_APARTADO_MS`): nadie se teletransporta.
 *
 * Retrato, cuerpo 3D, imagen fija, abanico, aro y pulso leen `dibujo` y no suman nada.
 */
import { Anclas, Deslizador, distanciaM, type DeslizadorOpciones } from '../avatares/movimientoSuave'

export type Punto = { lat: number; lon: number }
export type Metros = { este: number; norte: number }

/** Radio del disco de suelo alrededor del poste de un nodo donde nadie (salvo tú) se queda. */
export const R_DISCO_M = 5
/** Lo más lejos de su sitio real que se dibuja alguien apartado. */
export const TOPE_APARTADO_M = 8
/** Separación mínima entre dos cuerpos apartados (o de uno con el tuyo). */
export const SEPARACION_M = 1.6
/** Constante de tiempo con la que el apartado alcanza su objetivo (~0,6 s para el 90 %). */
export const TAU_APARTADO_MS = 260
/** Lo que dura el fundido de quien salta más de `saltoM` (teleport de verdad: se funde, no se pinta de golpe). */
export const FUNDIDO_SALTO_MS = 500
/** Banda muerta mínima de un compañero (su precisión, si es mayor): quieto con ruido de GPS, no se mueve. */
export const BANDA_MUERTA_M = 12

/** Cómo desliza un compañero: al ritmo de SU latido (hasta 90 s), sin pasar de un trote; sólo un salto grande es teleport. */
export const OPCIONES_COMPANERO: DeslizadorOpciones = {
  maxMs: 95000,
  pausaRitmoMs: 95000,
  saltoM: 300,
  // El último intervalo manda casi entero: el deslizamiento dura lo que tardó el latido anterior (no una media que se queda corta).
  pesoRitmo: 0.85,
}

const M_LAT = 111320
const mLon = (lat: number) => M_LAT * Math.cos((lat * Math.PI) / 180)

/** Hash FNV-1a de 32 bits: estable entre sesiones y móviles (la ranura de cada id no depende del orden de llegada). */
export function hashDeId(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

export type ApartadoDe = { este: number; norte: number; abanico: { id: string; lat: number; lon: number } | null }

/**
 * Función pura: cuánto se aparta cada compañero de su sitio real (metros) y quién va al abanico. Sólo mira posiciones
 * reales y postes: ni cámara, ni zoom, ni orden de llegada. `yo` es obstáculo fijo (nunca se aparta).
 */
export function apartadosDelMundo(entrada: {
  yo: Punto | null
  otros: readonly { id: string; real: Punto }[]
  postes: readonly Punto[]
}): Map<string, ApartadoDe> {
  const salida = new Map<string, ApartadoDe>()
  const { yo, otros, postes } = entrada
  const porPoste = new Map<number, { id: string; e: number; n: number }[]>()
  for (const o of otros) {
    salida.set(o.id, { este: 0, norte: 0, abanico: null })
    let mejor = -1
    let dMejor = R_DISCO_M
    let ve = 0
    let vn = 0
    postes.forEach((p, i) => {
      const e = (o.real.lon - p.lon) * mLon(p.lat)
      const n = (o.real.lat - p.lat) * M_LAT
      const d = Math.hypot(e, n)
      if (d < dMejor) {
        dMejor = d
        mejor = i
        ve = e
        vn = n
      }
    })
    if (mejor >= 0) porPoste.set(mejor, [...(porPoste.get(mejor) ?? []), { id: o.id, e: ve, n: vn }])
  }
  for (const [i, lista] of porPoste) {
    const poste = postes[i]
    const tuyo = yo ? { e: (yo.lon - poste.lon) * mLon(poste.lat), n: (yo.lat - poste.lat) * M_LAT } : null
    const colocados: { e: number; n: number }[] = tuyo ? [tuyo] : []
    // Por id: quién se coloca antes sólo importa entre los que comparten poste (y sólo si chocan).
    lista.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    const idAbanico = `abanico-poste-${poste.lat.toFixed(6)}-${poste.lon.toFixed(6)}`
    const aH = (hashDeId(idAbanico) % 360) * (Math.PI / 180)
    const sitioAbanico = {
      lat: poste.lat + (Math.sin(aH) * R_DISCO_M) / M_LAT,
      lon: poste.lon + (Math.cos(aH) * R_DISCO_M) / mLon(poste.lat),
    }
    for (const q of lista) {
      const libre = (c: { e: number; n: number }) =>
        Math.hypot(c.e - q.e, c.n - q.n) <= TOPE_APARTADO_M && colocados.every((o) => Math.hypot(o.e - c.e, o.n - c.n) >= SEPARACION_M)
      const candidatos: { e: number; n: number }[] = []
      // 1) Hacia fuera desde donde está (lo mínimo que se mueve); sin dirección (encima del poste), por su hash.
      const a0 = Math.hypot(q.e, q.n) >= 1 ? Math.atan2(q.n, q.e) : (hashDeId(q.id) % 3600) * (Math.PI / 1800)
      candidatos.push({ e: Math.cos(a0) * R_DISCO_M, n: Math.sin(a0) * R_DISCO_M })
      // 2) Su ranura por hash en anillos cada vez más anchos (hasta el tope); si choca, la contigua.
      const h = hashDeId(q.id)
      for (const rho of [R_DISCO_M, R_DISCO_M + 1.5, TOPE_APARTADO_M - 0.5]) {
        const k = Math.max(6, Math.floor((2 * Math.PI * rho) / SEPARACION_M))
        const base = h % k
        for (let j = 0; j < k; j += 1) {
          const idx = (base + (j % 2 ? -(j + 1) / 2 : j / 2) + 2 * k) % k
          candidatos.push({ e: Math.cos((2 * Math.PI * idx) / k) * rho, n: Math.sin((2 * Math.PI * idx) / k) * rho })
        }
      }
      const c = candidatos.find(libre)
      const fila = salida.get(q.id) as ApartadoDe
      if (!c) {
        fila.abanico = { id: idAbanico, ...sitioAbanico }
        continue
      }
      colocados.push(c)
      fila.este = c.e - q.e
      fila.norte = c.n - q.n
    }
  }
  return salida
}

type Cadena = {
  tipo: 'yo' | 'jugador' | 'grupo'
  d: Deslizador
  ap: Metros
  objetivo: ApartadoDe
  rumboMovil: number | null
  nuevo: boolean
}

export type PuestoDeJugador = {
  id: string
  real: Punto
  dibujo: Punto
  rumbo: number | null
  andando: boolean
  apartado: Metros
  abanico: { id: string; lat: number; lon: number } | null
}

/** El punto desplazado `m` metros (este, norte). */
export function desplazar(p: Punto, m: Metros): Punto {
  if (!m.este && !m.norte) return { lat: p.lat, lon: p.lon }
  return { lat: p.lat + m.norte / M_LAT, lon: p.lon + m.este / mLon(p.lat) }
}

/**
 * El estado de la fuente: una cadena por id. El mapa llama a `fijar` cuando llega un fix, a `calcular` una vez por
 * dibujo y lee `dibujo`/`real`/`rumbo`. Las pruebas usan `posicionesDelMundo`.
 */
export class FuentePosicion {
  private readonly cadenas = new Map<string, Cadena>()
  private readonly anclas = new Anclas()
  private calculadoEn = -1e12
  postes: readonly Punto[] = []
  /** Apartados que decide otro sitio (el racimo de retratos de la vista 2D): sustituyen al de los postes. */
  forzados: ReadonlyMap<string, Metros> | null = null

  private cadena(id: string, tipo: Cadena['tipo']): Cadena {
    let c = this.cadenas.get(id)
    if (!c) {
      c = { tipo, d: new Deslizador(tipo === 'jugador' || tipo === 'grupo' ? OPCIONES_COMPANERO : undefined), ap: { este: 0, norte: 0 }, objetivo: { este: 0, norte: 0, abanico: null }, rumboMovil: null, nuevo: true }
      this.cadenas.set(id, c)
    }
    return c
  }

  /** El deslizador de este id (la cámara que te sigue y el rumbo de tu flecha lo leen). */
  deslizador(id: string, tipo: Cadena['tipo'] = id === 'yo' ? 'yo' : 'jugador'): Deslizador {
    return this.cadena(id, tipo).d
  }

  /** Llega un fix. Tú ya vienes filtrado (FiltroGps); un compañero pasa por la banda muerta max(precisión, 12 m). */
  fijar(id: string, tipo: Cadena['tipo'], fix: Punto, ahora: number, opts: { precisionM?: number | null; heading?: number | null } = {}): Punto {
    const c = this.cadena(id, tipo)
    c.rumboMovil = typeof opts.heading === 'number' && Number.isFinite(opts.heading) ? opts.heading : null
    if (tipo === 'jugador') {
      const p = typeof opts.precisionM === 'number' && Number.isFinite(opts.precisionM) ? opts.precisionM : 0
      const a = this.anclas.fijar(id, fix, Math.max(p, BANDA_MUERTA_M))
      c.d.poner(a, ahora, p || null)
      return a
    }
    c.d.poner(fix, ahora, opts.precisionM)
    return fix
  }

  existe(id: string): boolean {
    return this.cadenas.has(id)
  }

  /** Opacidad (0-1) por el fundido de un salto grande: 1 salvo los ~0,5 s siguientes a un teleport. */
  desvanecer(id: string, ahora: number): number {
    const s = this.cadenas.get(id)?.d.saltoEn
    return s == null ? 1 : Math.min(1, Math.max(0, (ahora - s) / FUNDIDO_SALTO_MS))
  }

  /** ¿Este id se está deslizando o apartando ahora mismo? */
  moviendose(id: string, ahora: number): boolean {
    const c = this.cadenas.get(id)
    return Boolean(c && (c.d.enMovimiento(ahora) || this.desvanecer(id, ahora) < 1 || Math.hypot(c.objetivo.este - c.ap.este, c.objetivo.norte - c.ap.norte) > 0.01))
  }

  /** Quita a quien no está en `vivas` (y a quien se fue). */
  podar(vivas: ReadonlySet<string>): void {
    for (const k of [...this.cadenas.keys()]) if (!vivas.has(k)) this.cadenas.delete(k)
    this.anclas.podar(vivas)
  }

  olvidar(id: string): void {
    this.cadenas.delete(id)
    this.anclas.podar(new Set([...this.cadenas.keys()]))
  }

  real(id: string, ahora: number): Punto | null {
    return this.cadenas.get(id)?.d.posicion(ahora) ?? null
  }

  rumbo(id: string, ahora: number): number | null {
    const c = this.cadenas.get(id)
    return c ? (c.rumboMovil ?? c.d.rumbo(ahora)) : null
  }

  /** Recalcula los apartados con las posiciones reales de `ahora` y los acerca a su objetivo (animación continua). */
  calcular(ahora: number): void {
    if (ahora === this.calculadoEn) return
    const dt = Math.min(1000, Math.max(0, ahora - this.calculadoEn))
    this.calculadoEn = ahora
    const otros: { id: string; real: Punto }[] = []
    let yo: Punto | null = null
    for (const [id, c] of this.cadenas) {
      const real = c.d.posicion(ahora)
      if (!real) continue
      if (c.tipo === 'yo') yo = real
      else if (c.tipo === 'jugador') otros.push({ id, real })
    }
    const objetivos = this.postes.length ? apartadosDelMundo({ yo, otros, postes: this.postes }) : null
    const alfa = 1 - Math.exp(-dt / TAU_APARTADO_MS)
    for (const [id, c] of this.cadenas) {
      if (c.tipo === 'yo') continue
      const forzado = this.forzados?.get(id)
      const o = forzado ? { este: forzado.este, norte: forzado.norte, abanico: null } : (objetivos?.get(id) ?? { este: 0, norte: 0, abanico: null })
      c.objetivo = o
      if (c.nuevo) {
        c.ap = { este: o.este, norte: o.norte }
        c.nuevo = false
      } else {
        c.ap = { este: c.ap.este + (o.este - c.ap.este) * alfa, norte: c.ap.norte + (o.norte - c.ap.norte) * alfa }
        if (Math.hypot(o.este - c.ap.este, o.norte - c.ap.norte) < 0.01) c.ap = { este: o.este, norte: o.norte }
      }
    }
  }

  /** ¿Algún apartado sigue animándose o algún compañero deslizándose? (el bucle de dibujo sigue). */
  animando(ahora: number): boolean {
    for (const c of this.cadenas.values()) {
      if (c.d.enMovimiento(ahora)) return true
      if (Math.hypot(c.objetivo.este - c.ap.este, c.objetivo.norte - c.ap.norte) > 0.01) return true
    }
    return false
  }

  /** Apartado en metros (0 para ti y para los grupos). */
  apartado(id: string): Metros {
    const c = this.cadenas.get(id)
    return c && c.tipo !== 'yo' ? c.ap : { este: 0, norte: 0 }
  }

  /** Dónde se dibuja (retrato, cuerpo, imagen fija, aro, pulso): real + apartado. Tú, siempre tu real filtrado. */
  dibujo(id: string, ahora: number): Punto | null {
    const real = this.real(id, ahora)
    return real ? desplazar(real, this.apartado(id)) : null
  }

  abanico(id: string): { id: string; lat: number; lon: number } | null {
    return this.cadenas.get(id)?.objetivo.abanico ?? null
  }

  /** Todo el mundo, para depurar y para las pruebas. */
  puestos(ahora: number): Map<string, PuestoDeJugador> {
    this.calcular(ahora)
    const salida = new Map<string, PuestoDeJugador>()
    for (const [id, c] of this.cadenas) {
      const real = c.d.posicion(ahora)
      if (!real) continue
      salida.set(id, { id, real, dibujo: this.dibujo(id, ahora) as Punto, rumbo: this.rumbo(id, ahora), andando: c.d.enMovimiento(ahora), apartado: this.apartado(id), abanico: c.objetivo.abanico })
    }
    return salida
  }
}

/**
 * `posicionesDelMundo({yo, otros, nodos, ahora})`: la API de una llamada. Con `fuente` (la del mapa) conserva las
 * cadenas entre llamadas (banda muerta y deslizamiento); sin ella, un mundo nuevo (el estado inicial: sin deslizar).
 */
export function posicionesDelMundo(
  entrada: {
    yo: { fix: Punto; precisionM?: number | null } | null
    otros: readonly { id: string; fix: Punto; heading?: number | null; precisionM?: number | null }[]
    nodos: readonly Punto[]
    ahora: number
  },
  fuente: FuentePosicion = new FuentePosicion()
): Map<string, PuestoDeJugador> {
  fuente.postes = entrada.nodos
  const vivas = new Set<string>(entrada.otros.map((o) => o.id))
  if (entrada.yo) {
    vivas.add('yo')
    fuente.fijar('yo', 'yo', entrada.yo.fix, entrada.ahora, { precisionM: entrada.yo.precisionM })
  }
  for (const o of entrada.otros) fuente.fijar(o.id, 'jugador', o.fix, entrada.ahora, { heading: o.heading, precisionM: o.precisionM })
  fuente.podar(vivas)
  return fuente.puestos(entrada.ahora)
}

/** Distancia en metros entre dos puntos (para los tests y la depuración). */
export const metrosEntre = distanciaM
