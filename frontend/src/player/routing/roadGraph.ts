/**
 * Rutas por caminos en el móvil, sin cobertura.
 *
 * El grafo lo prepara el panel (`/api/admin/road-graph/build`) a partir de
 * OpenStreetMap y viaja en el paquete offline como `/api/road-graph`. Aquí
 * se carga una vez, se indexa por celdas para encontrar el nodo más cercano
 * en un instante, y se calcula el camino más corto con A*.
 *
 * Es lo que hace que la guía, cuando el jugador se sale del trazado, vaya
 * por carreteras y caminos hasta el punto más cercano de la ruta en vez de
 * cruzar el monte en línea recta.
 */

export type Punto = { lat: number; lon: number }

/** [a, b, metros, forma intermedia, clase de vía (0 si la red es vieja)]. */
type Tramo = [number, number, number, [number, number][], number?]

type Vecino = { a: number; peso: number; tramo: number; sentido: 1 | -1; clase: number }

export type GrafoDeCaminos = {
  nodos: [number, number][]
  tramos: Tramo[]
  vecinos: Vecino[][]
  celdas: Map<string, number[]>
}

const TAMANO_CELDA = 0.004 // ~440 m de lado a 42° de latitud

function clave(lat: number, lon: number): string {
  return `${Math.floor(lat / TAMANO_CELDA)}:${Math.floor(lon / TAMANO_CELDA)}`
}

export function metrosEntre(a: Punto, b: Punto): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(h))
}

/** Del JSON del servidor al grafo indexado. Puro: sirve para los tests. */
export function indexarGrafo(cuerpo: { nodos: [number, number][]; tramos: Tramo[] }): GrafoDeCaminos {
  const nodos = cuerpo.nodos
  const tramos = cuerpo.tramos
  const vecinos: Vecino[][] = nodos.map(() => [])
  tramos.forEach(([a, b, peso, , clase], indice) => {
    const c = typeof clase === 'number' ? clase : 0
    vecinos[a].push({ a: b, peso, tramo: indice, sentido: 1, clase: c })
    vecinos[b].push({ a, peso, tramo: indice, sentido: -1, clase: c })
  })
  const celdas = new Map<string, number[]>()
  nodos.forEach(([lat, lon], indice) => {
    const k = clave(lat, lon)
    const lista = celdas.get(k)
    if (lista) lista.push(indice)
    else celdas.set(k, [indice])
  })
  return { nodos, tramos, vecinos, celdas }
}

let grafoCargado: GrafoDeCaminos | null = null
let cargaEnCurso: Promise<GrafoDeCaminos | null> | null = null

/** Carga el grafo una vez. Sin grafo (no preparado, o sin red y sin paquete) devuelve null. */
export function cargarGrafo(): Promise<GrafoDeCaminos | null> {
  if (grafoCargado) return Promise.resolve(grafoCargado)
  if (cargaEnCurso) return cargaEnCurso
  cargaEnCurso = (async () => {
    try {
      const respuesta = await fetch('/api/road-graph')
      if (!respuesta.ok) return null
      const cuerpo = (await respuesta.json()) as { nodos?: [number, number][]; tramos?: Tramo[] }
      if (!Array.isArray(cuerpo.nodos) || !Array.isArray(cuerpo.tramos)) return null
      grafoCargado = indexarGrafo({ nodos: cuerpo.nodos, tramos: cuerpo.tramos })
      return grafoCargado
    } catch {
      return null
    } finally {
      cargaEnCurso = null
    }
  })()
  return cargaEnCurso
}

/** El nodo del grafo más cercano a un punto, si está a menos de `maximoM`. */
export function nodoMasCercano(grafo: GrafoDeCaminos, punto: Punto, maximoM: number): number | null {
  const anillos = Math.max(1, Math.ceil(maximoM / (TAMANO_CELDA * 111320)))
  const ci = Math.floor(punto.lat / TAMANO_CELDA)
  const cj = Math.floor(punto.lon / TAMANO_CELDA)
  let mejor: number | null = null
  let mejorM = maximoM
  for (let di = -anillos; di <= anillos; di += 1) {
    for (let dj = -anillos; dj <= anillos; dj += 1) {
      const lista = grafo.celdas.get(`${ci + di}:${cj + dj}`)
      if (!lista) continue
      for (const indice of lista) {
        const [lat, lon] = grafo.nodos[indice]
        const m = metrosEntre(punto, { lat, lon })
        if (m < mejorM) {
          mejorM = m
          mejor = indice
        }
      }
    }
  }
  return mejor
}

/** Cola de prioridad mínima, lo justo para A*. */
class Monticulo {
  private datos: { k: number; v: number }[] = []
  get tamano() {
    return this.datos.length
  }
  meter(k: number, v: number) {
    const d = this.datos
    d.push({ k, v })
    let i = d.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (d[p].k <= d[i].k) break
      ;[d[p], d[i]] = [d[i], d[p]]
      i = p
    }
  }
  sacar(): number {
    const d = this.datos
    const cima = d[0].v
    const ultimo = d.pop()!
    if (d.length) {
      d[0] = ultimo
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < d.length && d[l].k < d[m].k) m = l
        if (r < d.length && d[r].k < d[m].k) m = r
        if (m === i) break
        ;[d[m], d[i]] = [d[i], d[m]]
        i = m
      }
    }
    return cima
  }
}

/**
 * Camino más corto por el grafo entre dos puntos, como lista de [lon, lat]
 * (el orden de GeoJSON). Los puntos se pegan al nodo más cercano a menos
 * de `pegadoM`; si alguno queda más lejos, no hay ruta y se devuelve null.
 */
/**
 * Cuánto cuesta cada clase de vía según lo lejos que estés del trazado.
 *
 * Clases: 0 desconocida, 1 autovía, 2 primaria, 3 secundaria, 4 terciaria,
 * 5 calle o local, 6 servicio, 7 pista, 8 senda. A menos de 3 km del
 * trazado vale casi todo, que a pie se va por pistas; a partir de 8 km
 * -en casa, yendo en coche- una pista cuesta tres veces y media su
 * longitud y una senda cinco: la guía va por carretera. Entre medias,
 * a escala. Todos los factores son >= 1 para que la heurística de A*
 * (línea recta en metros) siga siendo válida.
 */
export function factorPorLejania(lejaniaM: number): (clase: number) => number {
  const t = Math.max(0, Math.min(1, (lejaniaM - 3000) / 5000))
  const cerca = [1.2, 1.0, 1.0, 1.0, 1.0, 1.0, 1.05, 1.1, 1.2]
  const lejos = [1.6, 1.0, 1.0, 1.0, 1.05, 1.15, 1.8, 3.5, 5.0]
  return (clase) => {
    const c = clase >= 0 && clase < cerca.length ? clase : 0
    return cerca[c] + (lejos[c] - cerca[c]) * t
  }
}

export function rutaPorCaminos(
  grafo: GrafoDeCaminos,
  desde: Punto,
  hasta: Punto,
  pegadoM = 400,
  factor: (clase: number) => number = () => 1
): [number, number][] | null {
  const origen = nodoMasCercano(grafo, desde, pegadoM)
  const destino = nodoMasCercano(grafo, hasta, pegadoM)
  if (origen === null || destino === null) return null
  if (origen === destino) {
    const [lat, lon] = grafo.nodos[origen]
    return [[lon, lat]]
  }

  const meta = { lat: grafo.nodos[destino][0], lon: grafo.nodos[destino][1] }
  const coste = new Map<number, number>([[origen, 0]])
  const de = new Map<number, { nodo: number; tramo: number; sentido: 1 | -1 }>()
  const abiertos = new Monticulo()
  abiertos.meter(0, origen)
  let expansiones = 0

  while (abiertos.tamano) {
    const actual = abiertos.sacar()
    if (actual === destino) break
    // Desde casa, a 30 km, hacen falta muchas más expansiones que desde
    // el monte. Va en un worker: no bloquea nada.
    if (expansiones++ > 900000) return null
    const gActual = coste.get(actual) ?? Infinity
    for (const v of grafo.vecinos[actual]) {
      const g = gActual + v.peso * factor(v.clase)
      if (g >= (coste.get(v.a) ?? Infinity)) continue
      coste.set(v.a, g)
      de.set(v.a, { nodo: actual, tramo: v.tramo, sentido: v.sentido })
      const [lat, lon] = grafo.nodos[v.a]
      abiertos.meter(g + metrosEntre({ lat, lon }, meta), v.a)
    }
  }
  if (!de.has(destino)) return null

  // Reconstruir hacia atrás, con la forma de cada tramo en su sentido.
  const salida: [number, number][] = []
  let cursor = destino
  while (cursor !== origen) {
    const paso = de.get(cursor)!
    const [, , , intermedios] = grafo.tramos[paso.tramo]
    const [lat, lon] = grafo.nodos[cursor]
    salida.push([lon, lat])
    const forma = paso.sentido === 1 ? [...intermedios].reverse() : intermedios
    for (const [plat, plon] of forma) salida.push([plon, plat])
    cursor = paso.nodo
  }
  const [lat0, lon0] = grafo.nodos[origen]
  salida.push([lon0, lat0])
  salida.reverse()
  return salida
}
