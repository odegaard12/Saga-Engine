/**
 * Nodos encima o demasiado pegados (26/10/2026). La misma cuenta que el servidor (backend/app/runtime/nodos_cercanos.py).
 *
 * Óscar: «nunca pueden estar encima o tan pegados; si no, en admin que salga aviso». Dos nodos en el mismo punto se
 * dibujaban uno sobre otro en el mapa del jugador, y a menos del radio de apertura (35 m) al llegar a uno se abre
 * también el otro.
 */

/** Por debajo de esto, «encima»: el guardado pide confirmación. */
export const ENCIMA_M = 3
/** Por debajo de esto se avisa en ámbar. */
export const MINIMO_M = 15

export type NodoCercano = {
  /** Posiciones (0-based) en la lista de nodos. */
  a: number
  b: number
  a_titulo?: string
  b_titulo?: string
  metros: number
  encima: boolean
}

type ConCoordenadas = { lat?: number | null; lon?: number | null; title?: string }

function metrosEntre(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Cada par de nodos a menos de `minimo` metros. */
export function nodosCercanos(stages: ConCoordenadas[], minimo = MINIMO_M): NodoCercano[] {
  const puntos = stages
    .map((nodo, indice) => ({ nodo, indice }))
    .filter(({ nodo }) => typeof nodo.lat === 'number' && typeof nodo.lon === 'number')
  const pares: NodoCercano[] = []
  for (let x = 0; x < puntos.length; x += 1) {
    for (let y = x + 1; y < puntos.length; y += 1) {
      const a = puntos[x]
      const b = puntos[y]
      const metros = metrosEntre(
        a.nodo as { lat: number; lon: number },
        b.nodo as { lat: number; lon: number }
      )
      if (metros < minimo) {
        pares.push({
          a: a.indice,
          b: b.indice,
          a_titulo: a.nodo.title || '',
          b_titulo: b.nodo.title || '',
          metros: Math.round(metros * 10) / 10,
          encima: metros < ENCIMA_M,
        })
      }
    }
  }
  return pares
}

function nombre(indice: number, titulo?: string): string {
  return titulo ? `nodo ${indice + 1} «${titulo}»` : `nodo ${indice + 1}`
}

/** Una línea por par: «nodo 2 «Fuente» y nodo 3 «Banco»: 1,2 m (encima)». */
export function describirPar(par: NodoCercano): string {
  const metros = par.metros.toLocaleString('es-ES', { maximumFractionDigits: 1 })
  return `${nombre(par.a, par.a_titulo)} y ${nombre(par.b, par.b_titulo)}: ${metros} m${par.encima ? ' (encima)' : ''}`
}

/** El texto de la confirmación al guardar con nodos encima. */
export function describirNodosEncima(pares: NodoCercano[]): string {
  const encima = pares.filter((par) => par.encima)
  return (
    `Hay ${encima.length === 1 ? 'dos nodos uno encima del otro' : `${encima.length} pares de nodos uno encima del otro`} ` +
    `(a menos de ${ENCIMA_M} m):\n\n${encima.map((par) => `• ${describirPar(par)}`).join('\n')}\n\n` +
    'En el mapa del jugador se taparían y, al llegar, se abrirían los dos a la vez. ' +
    'Sepáralos al menos ' +
    `${MINIMO_M} m. ¿Guardar igualmente?`
  )
}
