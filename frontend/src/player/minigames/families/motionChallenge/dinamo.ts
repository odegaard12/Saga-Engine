/**
 * Dinamo (30/10/2026, sustituye la mecánica de «Agita para cargar»). Lógica pura, sin React: se prueba en Node
 * (tests/js/dinamo_faros.cjs).
 *
 * Antes cargaba quien agitaba más fuerte, y cada móvil mide el meneo distinto. Ahora al empezar se calibra el ritmo
 * cómodo del jugador (su «1») y la carga sólo sube con la aguja DENTRO de la zona verde, que cambia de sitio y se
 * estrecha en cada fase: lo que cuenta es dominar el ritmo, no la fuerza ni el móvil.
 */

export type FaseDinamo = { centro: number; ancho: number }
export type EstadoDinamo = { fase: number; carga: number; enZonaMs: number }

/** Dónde va la zona verde en cada fase (relativo al ritmo calibrado = 1) y su ancho. */
export function fasesDinamo(n: number, ancho: number): FaseDinamo[] {
  const centros = [1, 0.75, 1.3, 0.85, 1.2, 0.7]
  const fases = Math.max(1, Math.min(6, Math.round(n)))
  return Array.from({ length: fases }, (_, i) => ({
    centro: centros[i % centros.length],
    ancho: Math.max(0.16, ancho * (1 - 0.08 * i)),
  }))
}

/** La base calibrada: media de lo medido, con suelo para que un móvil casi quieto no deje la zona en cero. */
export function baseCalibrada(muestras: number[], suelo = 1.2): number {
  const validas = muestras.filter((x) => Number.isFinite(x) && x > 0.3)
  if (validas.length === 0) return suelo
  return Math.max(suelo, validas.reduce((a, b) => a + b, 0) / validas.length)
}

/** Suavizado exponencial con constante de tiempo `tau` (s): la aguja no tiembla con cada lectura. */
export function suavizar(previo: number, nuevo: number, dt: number, tau = 0.4): number {
  const k = 1 - Math.exp(-Math.max(0, dt) / tau)
  return previo + (nuevo - previo) * k
}

export function enZona(relativo: number, fase: FaseDinamo): boolean {
  return Math.abs(relativo - fase.centro) <= fase.ancho / 2
}

/**
 * Un paso de la carga. `relativo` = intensidad / base. Dentro de la zona suma tiempo; fuera se descarga a algo más
 * de la mitad de ese ritmo (nunca bloquea). Al llenar la fase (`segundosPorFase`) pasa a la siguiente con la carga a cero.
 */
export function pasoDinamo(
  estado: EstadoDinamo,
  relativo: number,
  dtMs: number,
  fases: FaseDinamo[],
  segundosPorFase: number,
  perdidaPorSegundo = 0.6
): EstadoDinamo {
  if (estado.fase >= fases.length) return estado
  const dt = Math.max(0, Math.min(250, dtMs)) / 1000
  const dentro = enZona(relativo, fases[estado.fase])
  let carga = dentro
    ? estado.carga + dt / segundosPorFase
    : Math.max(0, estado.carga - (dt * perdidaPorSegundo) / segundosPorFase)
  let fase = estado.fase
  if (carga >= 1) {
    fase += 1
    carga = 0
  }
  return { fase, carga, enZonaMs: estado.enZonaMs + (dentro ? dt * 1000 : 0) }
}

/** Intensidad del meneo a partir de la aceleración SIN gravedad (m/s²). */
export function intensidad(ax: number, ay: number, az: number): number {
  return Math.sqrt(ax * ax + ay * ay + az * az)
}
