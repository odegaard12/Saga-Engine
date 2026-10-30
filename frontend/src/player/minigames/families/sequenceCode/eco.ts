/**
 * Motor del Eco rítmico (30/10), sin React: genera la ronda y juzga el ritmo.
 *
 * Una ronda son `largo` golpes; cada golpe es una ficha y lo que dura hasta el
 * siguiente (1 = corto, 2 = largo, en pulsos). El último siempre es corto: lo
 * que dura no se puede medir sin un golpe detrás.
 */
export type Ronda = { fichas: number[]; pulsos: number[] }

function generador(semilla: string) {
  let hash = 2166136261
  for (let i = 0; i < semilla.length; i++) {
    hash ^= semilla.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  let estado = hash >>> 0
  return () => {
    estado = (Math.imul(estado, 1664525) + 1013904223) >>> 0
    return estado / 4294967296
  }
}

export function generarRonda(
  semilla: string,
  largo: number,
  fichas: number,
  largasPct: number
): Ronda {
  const azar = generador(semilla)
  const out: Ronda = { fichas: [], pulsos: [] }
  for (let i = 0; i < largo; i++) {
    let ficha = Math.floor(azar() * fichas)
    // Nunca tres iguales seguidas: con el ritmo encima se vuelve ilegible.
    if (i >= 2 && ficha === out.fichas[i - 1] && ficha === out.fichas[i - 2])
      ficha = (ficha + 1) % fichas
    out.fichas.push(ficha)
    out.pulsos.push(i < largo - 1 && azar() * 100 < largasPct ? 2 : 1)
  }
  // Con notas largas pedidas, que cada ronda tenga al menos una: si no, el ritmo no cuenta.
  if (largasPct > 0 && largo >= 3 && !out.pulsos.includes(2))
    out.pulsos[Math.floor((largo - 1) / 2)] = 2
  return out
}

/**
 * ¿Repitió el ritmo? `intervalos[i]` = ms entre el golpe i y el i+1. Se mide contra el pulso del PROPIO jugador
 * (la mediana de sus cortos), no contra el reloj: quien toca todo un poco lento no falla por eso. Un largo tiene que
 * durar al menos 1,45 cortos y un corto menos.
 */
export function ritmoCorrecto(pulsos: number[], intervalos: number[], pulsoMs: number): boolean {
  const esperados = pulsos.slice(0, intervalos.length)
  if (!esperados.includes(2)) return true
  const cortos = intervalos.filter((_, i) => esperados[i] === 1).sort((a, b) => a - b)
  const ref = cortos.length ? cortos[Math.floor(cortos.length / 2)] : pulsoMs
  const umbral = Math.max(ref, 120) * 1.45
  return esperados.every((p, i) => (p === 2 ? intervalos[i] >= umbral : intervalos[i] < umbral))
}
