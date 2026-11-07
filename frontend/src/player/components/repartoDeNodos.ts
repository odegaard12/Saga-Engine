import { metrosPorPixel, tamanoDeNodoPx } from './jugadoresEnMapa'

type Punto = { lat: number; lon: number }
/** `tamano`: el diámetro de su moneda respecto a la normal (la del nodo en juego es mayor, la de un pendiente menor). */
export type NodoParaRepartir = Punto & { clave: string; tamano?: number }
/**
 * La proyección REAL del mapa (`map.project`/`unproject`): con el mapa inclinado, la perspectiva y el relieve deciden
 * qué se tapa en pantalla, y el modelo plano (inclinación = aplastar lo vertical) se queda corto. Sin ella (pruebas),
 * el modelo plano.
 *
 * Con postes (3D inclinado): `alzado` es cuánto sube el centro de la moneda sobre su punto (px a escala 1) y `escala`
 * la perspectiva de MapLibre en ese punto (`0,5 + 0,5 × distancia al centro / distancia al punto`, la del sombreador
 * de símbolos): de cerca, moneda más grande y más alta; de lejos, al revés. Es la moneda la que no debe taparse.
 */
export type ProyeccionDelMapa = {
  aPantalla: (p: Punto) => { x: number; y: number }
  alSuelo: (x: number, y: number) => Punto
  escala?: (p: Punto) => number
  alzado?: number
}

/**
 * 7/11 (Óscar: «los nodos agrupados, que se abran en arco alrededor del punto, sin solapar otros nodos, bien
 * distribuidos… si los distribuyes lejos de la zona puede confundir»). Cada nodo, en pantalla, a su tamaño de moneda:
 * los que están en el MISMO sitio (menos de 1/5 de moneda) salen en corona compacta alrededor de él; después, cada par
 * que se tapa se separa a partes iguales, poco a poco, sin pasar de ~1 moneda de su sitio real (o del radio de su
 * corona, si estaban apilados). Así se abren en arco donde hace falta y el recorrido conserva su forma.
 *
 * Devuelve, por nodo, el punto del suelo donde se dibuja (el real si no hace falta moverlo).
 */
export function repartirNodos(
  nodos: readonly NodoParaRepartir[],
  zoom: number,
  inclinacion = 0,
  rumbo = 0,
  proyeccion?: ProyeccionDelMapa
): Map<string, Punto> {
  const salida = new Map<string, Punto>()
  if (!nodos.length) return salida
  const lat0 = nodos[0].lat
  const lon0 = nodos[0].lon
  const mpp = metrosPorPixel(zoom, lat0)
  const aplastado = Math.max(
    0.35,
    Math.cos((Math.min(80, Math.max(0, inclinacion)) * Math.PI) / 180)
  )
  const b = (rumbo * Math.PI) / 180
  const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
  const alzado = proyeccion?.alzado ?? 0
  const k = nodos.map((p) => (proyeccion?.escala ? proyeccion.escala(p) : 1))
  const real = nodos.map((p, i) => {
    if (proyeccion) {
      const q = proyeccion.aPantalla(p)
      return { x: q.x, y: q.y - alzado * k[i] }
    }
    const e = (p.lon - lon0) * mLon
    const n = (p.lat - lat0) * 111320
    return {
      x: (e * Math.cos(b) - n * Math.sin(b)) / mpp,
      y: ((e * Math.sin(b) + n * Math.cos(b)) / mpp) * aplastado,
    }
  })
  const D = tamanoDeNodoPx(zoom).ancho
  // Diámetro de cada moneda en pantalla, y la distancia mínima entre dos: la media de los dos, con un 5 % de holgura.
  const lado = nodos.map((p, i) => D * (p.tamano ?? 1) * k[i])
  const sep = (a: number, c: number) => 0.95 * ((lado[a] + lado[c]) / 2)
  const sitio = real.map((q) => ({ ...q }))
  const tope = lado.slice()
  const usados = new Set<number>()
  real.forEach((q, a) => {
    if (usados.has(a)) return
    const pila = real
      .map((_, c) => c)
      .filter(
        (c) =>
          !usados.has(c) &&
          Math.hypot(real[c].x - q.x, real[c].y - q.y) < Math.min(lado[a], lado[c]) * 0.2
      )
    if (pila.length < 2) return
    const medio = pila.reduce((s, c) => s + lado[c], 0) / pila.length
    const r = (0.95 * medio) / (2 * Math.sin(Math.PI / pila.length))
    pila.forEach((c, i) => {
      usados.add(c)
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / pila.length
      sitio[c] = { x: q.x + Math.cos(ang) * r, y: q.y + Math.sin(ang) * r }
      tope[c] = Math.max(lado[c], r * 1.1)
    })
  })
  for (let vuelta = 0; vuelta < 120; vuelta += 1) {
    let movido = false
    for (let a = 0; a < sitio.length; a += 1) {
      for (let c = a + 1; c < sitio.length; c += 1) {
        const dx = sitio[c].x - sitio[a].x
        const dy = sitio[c].y - sitio[a].y
        const d = Math.hypot(dx, dy)
        const minimo = sep(a, c)
        if (d >= minimo) continue
        // Dos en el mismo píxel: se separan en horizontal (por orden, para que sea estable).
        const ux = d > 0.01 ? dx / d : 1
        const uy = d > 0.01 ? dy / d : 0
        const empuje = ((minimo - d) / 2) * 0.6 + 0.01
        sitio[a].x -= ux * empuje
        sitio[a].y -= uy * empuje
        sitio[c].x += ux * empuje
        sitio[c].y += uy * empuje
        movido = true
      }
    }
    sitio.forEach((q, i) => {
      const ex = q.x - real[i].x
      const ey = q.y - real[i].y
      const e = Math.hypot(ex, ey)
      if (e > tope[i]) {
        q.x = real[i].x + (ex / e) * tope[i]
        q.y = real[i].y + (ey / e) * tope[i]
      }
    })
    if (!movido) break
  }
  nodos.forEach((p, i) => {
    const dx = sitio[i].x - real[i].x
    const dy = sitio[i].y - real[i].y
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      salida.set(p.clave, { lat: p.lat, lon: p.lon })
      return
    }
    if (proyeccion) {
      // La moneda va donde toca; su punto del suelo, `alzado` por debajo. Al moverlo cambia su perspectiva (y con ella
      // lo que sube el poste): se repite un par de veces hasta que la moneda cae donde se ha repartido.
      let suelo = proyeccion.alSuelo(sitio[i].x, sitio[i].y + alzado * k[i])
      if (proyeccion.escala && alzado) {
        for (let r = 0; r < 3; r += 1) suelo = proyeccion.alSuelo(sitio[i].x, sitio[i].y + alzado * proyeccion.escala(suelo))
      }
      salida.set(p.clave, suelo)
      return
    }
    // De la pantalla al suelo (el giro al revés y lo vertical sin aplastar).
    const sx = dx * mpp
    const sy = (dy * mpp) / aplastado
    const este = sx * Math.cos(b) + sy * Math.sin(b)
    const norte = -sx * Math.sin(b) + sy * Math.cos(b)
    salida.set(p.clave, { lat: p.lat + norte / 111320, lon: p.lon + este / mLon })
  })
  return salida
}
