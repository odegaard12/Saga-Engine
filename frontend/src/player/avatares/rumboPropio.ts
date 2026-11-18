/**
 * Hacia dónde mira TU muñeco, para mandarlo en el latido: así los demás te ven orientado como tu
 * teléfono (el rumbo sale de tus fixes de GPS, que llegan cada segundo, y no de los latidos, que
 * llegan cada cinco y darían un rumbo tardío y a saltos).
 *
 * El mapa lo apunta en cada dibujo (`anotarRumboPropio`); el latido lo lee (`rumboParaLatido`).
 * Lógica pura: el tiempo entra por parámetro para poder probarlo en Node.
 */

/** Un rumbo apuntado hace más de esto ya no vale (te has parado o el mapa no se dibuja). */
export const RUMBO_PROPIO_CADUCA_MS = 15000

let ultimo: { grados: number; en: number } | null = null
/** 20/11: la última brújula del móvil (suavizada) y si te estás moviendo de verdad (lo apunta la capa de avatares). */
let brujula: { grados: number; en: number } | null = null
let andandoPropio = false
/** Una brújula más vieja que esto ya no vale (sin permiso de orientación no llega ninguna). */
export const BRUJULA_CADUCA_MS = 3000
/** Por debajo de esta diferencia la brújula no mueve el cuerpo (el temblor del sensor). */
export const BRUJULA_ZONA_MUERTA = 4

export function anotarRumboPropio(grados: number | null, ahoraMs: number): void {
  if (grados === null || !Number.isFinite(grados)) return
  ultimo = { grados: ((grados % 360) + 360) % 360, en: ahoraMs }
}

/** Grados (0 = norte, horario, redondeados) o `undefined` si no hay uno reciente. */
export function rumboParaLatido(ahoraMs: number): number | undefined {
  const gps = ultimo && ahoraMs - ultimo.en <= RUMBO_PROPIO_CADUCA_MS ? ultimo.grados : null
  const r = rumboDelCuerpo({ brujula: brujulaVigente(ahoraMs), gps, andando: andandoPropio, ultimo: ultimo?.grados ?? null })
  return r === null ? undefined : Math.round(r) % 360
}

/** Sólo para las pruebas. */
export function olvidarRumboPropio(): void {
  ultimo = null
  brujula = null
  andandoPropio = false
}

const diferencia = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180

/** Rumbo (grados, 0 = norte, horario) de un evento de orientación, o null: iOS `webkitCompassHeading`; Android, alpha absoluto. */
export function rumboDeEvento(e: { webkitCompassHeading?: number; absolute?: boolean; alpha?: number | null }): number | null {
  if (typeof e.webkitCompassHeading === 'number' && Number.isFinite(e.webkitCompassHeading)) return ((e.webkitCompassHeading % 360) + 360) % 360
  if (e.absolute && typeof e.alpha === 'number' && Number.isFinite(e.alpha)) return (((360 - e.alpha) % 360) + 360) % 360
  return null
}

/** Apunta una lectura de la brújula: suavizada por el lado corto (sin saltos de 360°) y con zona muerta. */
export function anotarBrujula(grados: number | null, ahoraMs: number): void {
  if (grados === null || !Number.isFinite(grados)) return
  const g = ((grados % 360) + 360) % 360
  if (!brujula || ahoraMs - brujula.en > BRUJULA_CADUCA_MS) {
    brujula = { grados: g, en: ahoraMs }
    return
  }
  const d = diferencia(brujula.grados, g)
  const nuevo = Math.abs(d) < BRUJULA_ZONA_MUERTA ? brujula.grados : (brujula.grados + d * 0.35 + 360) % 360
  brujula = { grados: nuevo, en: ahoraMs }
}

export function anotarAndandoPropio(si: boolean): void {
  andandoPropio = si
}

/**
 * 20/11 (Óscar: «deben estar ubicados con la dirección del teléfono»): hacia dónde MIRA un cuerpo en el MUNDO. Nada de la
 * cámara del mapa. Andando de verdad: el rumbo del GPS; quieto: la brújula del móvil si es reciente; si no, el rumbo GPS
 * vigente y, a falta, el último conocido (`ultimo`); sin nada, null (la capa pone el norte).
 */
export function rumboDelCuerpo(o: {
  brujula: number | null
  gps: number | null
  andando: boolean
  ultimo: number | null
}): number | null {
  if (o.andando && o.gps !== null) return o.gps
  if (o.brujula !== null) return o.brujula
  return o.gps ?? o.ultimo
}

/** La brújula vigente (grados) o null. */
export function brujulaVigente(ahoraMs: number): number | null {
  return brujula && ahoraMs - brujula.en <= BRUJULA_CADUCA_MS ? brujula.grados : null
}

let escuchando = false
/** Empieza a leer la brújula del móvil (una vez). Sin permiso (iOS) simplemente no llega nada: se cae al GPS. */
export function escucharBrujula(): void {
  if (escuchando || typeof window === 'undefined') return
  escuchando = true
  const alGirar = (e: Event) => anotarBrujula(rumboDeEvento(e as never), performance.now())
  window.addEventListener('deviceorientationabsolute', alGirar)
  window.addEventListener('deviceorientation', alGirar)
}
