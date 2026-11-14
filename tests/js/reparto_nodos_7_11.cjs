// 7/11/2026: reparto de nodos cercanos en arco (repartoDeNodos.ts) y retratos que esquivan la moneda 2D
// (jugadoresEnMapa.ts, `nodosPlanos`). Lo comprueba tests/test_nodos_monedas_7_11.py.
'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')

const e = crearEntorno()
const r = e.cargar('src/player/components/repartoDeNodos.ts')
const j = e.cargar('src/player/components/jugadoresEnMapa.ts')
const base = { lat: 40.4157, lon: -3.6824 }
const mLat = 111320
const mLon = 111320 * Math.cos((base.lat * Math.PI) / 180)
let semilla = 777
const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648)
function pantalla(p, zoom, inclinacion, rumbo) {
  const mpp = j.metrosPorPixel(zoom, base.lat)
  const este = (p.lon - base.lon) * mLon
  const norte = (p.lat - base.lat) * mLat
  const b = (rumbo * Math.PI) / 180
  const ap = Math.max(0.35, Math.cos((inclinacion * Math.PI) / 180))
  return { x: (este * Math.cos(b) - norte * Math.sin(b)) / mpp, y: ((este * Math.sin(b) + norte * Math.cos(b)) / mpp) * ap }
}
let casos = 0
let solapes = 0
let lejos = 0
let maxDist = 0
const peores = []
for (const zoom of [15, 16, 17, 18]) {
  for (const [inclinacion, rumbo] of [[0, 0], [0, 60], [55, 0], [55, 140]]) {
    for (const forma of ['pila', 'cadena', 'mezcla']) {
      for (let paso = 0; paso < 4; paso += 1) {
        const nodos = []
        // Distancias en monedas de ESTE zoom (lo que de verdad decide si se tapan): un recorrido real no mete 8 nodos en una moneda.
        const Dm = j.tamanoDeNodoPx(zoom).ancho * j.metrosPorPixel(zoom, base.lat)
        if (forma === 'pila') {
          // 2-6 nodos en el MISMO sitio (a menos de 3 m: los que antes se escondían).
          const n = 2 + Math.floor(azar() * 5)
          for (let i = 0; i < n; i += 1) nodos.push({ clave: 'p' + i, lat: base.lat + (azar() * 2 - 1) / mLat, lon: base.lon + (azar() * 2 - 1) / mLon })
        } else if (forma === 'cadena') {
          // Un recorrido de 10 nodos, cada 0,4-1,5 monedas.
          let la = base.lat
          let lo = base.lon
          for (let i = 0; i < 10; i += 1) {
            const d = (0.4 + azar() * 1.1) * Dm
            const a = azar() * Math.PI
            la += (Math.cos(a) * d) / mLat
            lo += (Math.sin(a) * d) / mLon
            nodos.push({ clave: 'c' + i, lat: la, lon: lo })
          }
        } else {
          // 8 nodos sueltos en un cuadrado de 4 × 4 monedas, y uno apilado sobre el primero.
          for (let i = 0; i < 8; i += 1) nodos.push({ clave: 'm' + i, lat: base.lat + ((azar() * 2 - 1) * 2 * Dm) / mLat, lon: base.lon + ((azar() * 2 - 1) * 2 * Dm) / mLon })
          nodos.push({ clave: 'm8', lat: nodos[0].lat, lon: nodos[0].lon })
        }
        const sitios = r.repartirNodos(nodos, zoom, inclinacion, rumbo)
        const D = j.tamanoDeNodoPx(zoom).ancho
        const pts = nodos.map((n) => pantalla(sitios.get(n.clave), zoom, inclinacion, rumbo))
        const reales = nodos.map((n) => pantalla(n, zoom, inclinacion, rumbo))
        const apilados = nodos.map((_, i) => reales.filter((q) => Math.hypot(q.x - reales[i].x, q.y - reales[i].y) < D * 0.2).length)
        casos += 1
        let mal = false
        for (let a = 0; a < pts.length; a += 1) for (let b = a + 1; b < pts.length; b += 1) if (Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y) < D * 0.85) mal = true
        if (mal) { solapes += 1; peores.push({ zoom, inclinacion, rumbo, forma }) }
        pts.forEach((q, i) => {
          const d = Math.hypot(q.x - reales[i].x, q.y - reales[i].y) / D
          maxDist = Math.max(maxDist, d)
          // Como mucho ~1 moneda; si estaba apilado, el radio de su corona compacta.
          const tope = apilados[i] > 1 ? Math.max(1, (0.95 / (2 * Math.sin(Math.PI / apilados[i]))) * 1.1) : 1
          if (d > tope + 0.02) lejos += 1
        })
      }
    }
  }
}
// Retratos alrededor de un nodo en moneda (2D): ninguno encima de la moneda.
let casosRetrato = 0
let tapanMoneda = 0
for (const zoom of [15, 16, 17, 18]) {
  for (const n of [1, 2, 4, 6]) {
    for (let paso = 0; paso < 6; paso += 1) {
      const jugadores = Array.from({ length: n }, (_, i) => {
        const d = azar() * 6
        const a = azar() * 2 * Math.PI
        return { user: 'r' + i, display_name: 'x', presence: 'live', lat: base.lat + (Math.cos(a) * d) / mLat, lon: base.lon + (Math.sin(a) * d) / mLon }
      })
      const plan = j.planDeJugadores(jugadores, zoom, { evitar: [base], nodosPlanos: true })
      const ancho = j.anchoDeRetratoPx(zoom)
      const D = j.tamanoDeNodoPx(zoom).ancho
      const c = pantalla(base, zoom, 0, 0)
      casosRetrato += 1
      if (plan.some((el) => { const q = pantalla(j.conCorro(el, el.corro), zoom, 0, 0); return Math.abs(q.x - c.x) < (ancho + D) / 2 && Math.min(q.y + ancho / 2, c.y + D / 2) > Math.max(q.y - ancho / 2, c.y - D / 2) })) tapanMoneda += 1
    }
  }
}
// TU retrato, justo sobre la moneda de un nodo (2D) y con compañeros alrededor: sale fuera del rectangulo de la moneda.
let casosPropio = 0
let propioTapa = 0
let propioLejos = 0
for (const zoom of [15, 16, 17, 18]) {
  for (const n of [0, 2, 5]) {
    for (let paso = 0; paso < 6; paso += 1) {
      const jugadores = Array.from({ length: n }, (_, i) => {
        const d = azar() * 8
        const a = azar() * 2 * Math.PI
        return { user: 'r' + i, display_name: 'x', presence: 'live', lat: base.lat + (Math.cos(a) * d) / mLat, lon: base.lon + (Math.sin(a) * d) / mLon }
      })
      const plan = j.planDeJugadores(jugadores, zoom, { evitar: [base], nodosPlanos: true, propio: base })
      const yo = plan.find((el) => el.clave === j.CLAVE_PROPIO_EN_PLAN)
      const ancho = j.anchoDeRetratoPx(zoom)
      const D = j.tamanoDeNodoPx(zoom).ancho * 1.17
      const c = pantalla(base, zoom, 0, 0)
      const q = pantalla(j.conCorro(yo, yo.corro), zoom, 0, 0)
      casosPropio += 1
      if (Math.abs(q.x - c.x) < (ancho + D) / 2 && Math.min(q.y + ancho / 2, c.y + D / 2) > Math.max(q.y - ancho / 2, c.y - D / 2)) propioTapa += 1
      if (Math.hypot(q.x - c.x, q.y - c.y) / ancho > 2.6) propioLejos += 1
    }
  }
}
process.stdout.write(JSON.stringify({ casosPropio, propioTapa, propioLejos, casos, solapes, lejos, maxDist: Math.round(maxDist * 100) / 100, peores: peores.slice(0, 8), casosRetrato, tapanMoneda }))
