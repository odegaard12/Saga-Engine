// 7/11/2026: prueba de estrés de la corona de retratos (jugadoresEnMapa.ts) en pantalla simulada: 2-15 compañeros
// a 1-15 m, z15-z18, mapa girado e inclinado, y movimiento (cada paso, posiciones nuevas). Mide la distancia mínima
// entre retratos en pantalla frente a su ancho. Lo comprueba tests/test_corona_estres_7_11.py.
'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')

const m = crearEntorno().cargar('src/player/components/jugadoresEnMapa.ts')
let semilla = 12345
const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648)
const base = { lat: 40.4157, lon: -3.6824 }
const mLat = 111320
const mLon = 111320 * Math.cos((base.lat * Math.PI) / 180)

function pantalla(p, zoom, inclinacion, rumbo) {
  const mpp = m.metrosPorPixel(zoom, base.lat)
  const este = (p.lon - base.lon) * mLon
  const norte = (p.lat - base.lat) * mLat
  const b = (rumbo * Math.PI) / 180
  // Arriba en pantalla = dirección del rumbo; lo vertical se aplasta con la inclinación.
  const x = (este * Math.cos(b) - norte * Math.sin(b)) / mpp
  const y = ((este * Math.sin(b) + norte * Math.cos(b)) / mpp) * Math.cos((inclinacion * Math.PI) / 180)
  return { x, y }
}

// 7/11 (4): distancia de cada retrato a su sitio REAL, en retratos (Óscar: «no superlejos»).
const distancias = []
const medirDistancias = (plan, zoom, inclinacion, rumbo) => {
  const ancho = m.anchoDeRetratoPx(zoom)
  for (const el of plan) {
    if (el.tipo !== 'jugador') continue
    const a = pantalla(m.conCorro(el, el.corro), zoom, inclinacion, rumbo)
    const r = pantalla(el, zoom, inclinacion, rumbo)
    distancias.push(Math.hypot(a.x - r.x, a.y - r.y) / ancho)
  }
}
const peores = []
let casos = 0
let solapes = 0
for (const n of [2, 4, 6, 8, 10, 15]) {
  for (const zoom of [15, 16, 17, 18]) {
    for (const [inclinacion, rumbo] of [[0, 0], [0, 45], [55, 0], [55, 120], [70, 200]]) {
      for (let paso = 0; paso < 6; paso += 1) {
        const jugadores = Array.from({ length: n }, (_, i) => {
          const r = 1 + azar() * 14
          const a = azar() * 2 * Math.PI
          return { user: 'j' + i, display_name: 'j' + i, presence: 'live', lat: base.lat + (Math.cos(a) * r) / mLat, lon: base.lon + (Math.sin(a) * r) / mLon }
        })
        const plan = m.planDeJugadores(jugadores, zoom, new Set(), { retratos: true, inclinacion, rumbo })
        medirDistancias(plan, zoom, inclinacion, rumbo)
        const pts = plan.map((el) => pantalla(m.conCorro(el, el.corro), zoom, inclinacion, rumbo))
        let minimo = Infinity
        for (let a = 0; a < pts.length; a += 1) for (let b = a + 1; b < pts.length; b += 1) minimo = Math.min(minimo, Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y))
        const ancho = m.anchoDeRetratoPx(zoom)
        casos += 1
        const iconos = plan.length
        if (iconos > 1 && minimo < ancho * 0.9) {
          solapes += 1
          peores.push({ n, zoom, inclinacion, rumbo, iconos, minimo: Math.round(minimo), ancho: Math.round(ancho) })
        }
      }
    }
  }
}
// Dos corros a 15-120 m uno de otro (cada uno de 2 a 5): ¿la corona de uno cae encima del otro?
const peoresDos = []
let casosDos = 0
let solapesDos = 0
for (const zoom of [15, 16, 17, 18]) {
  for (const [inclinacion, rumbo] of [[0, 0], [55, 0], [55, 120], [70, 200]]) {
    for (const separacion of [15, 25, 40, 60, 90, 120]) {
      for (let paso = 0; paso < 6; paso += 1) {
        const jugadores = []
        for (const [k, cuantos] of [[0, 2 + Math.floor(azar() * 4)], [1, 2 + Math.floor(azar() * 4)]]) {
          for (let i = 0; i < cuantos; i += 1) {
            const r = 1 + azar() * 6
            const a = azar() * 2 * Math.PI
            jugadores.push({ user: `g${k}j${i}`, display_name: 'x', presence: 'live', lat: base.lat + (Math.cos(a) * r) / mLat, lon: base.lon + (k * separacion + Math.sin(a) * r) / mLon })
          }
        }
        const plan = m.planDeJugadores(jugadores, zoom, new Set(), { retratos: true, inclinacion, rumbo })
        const pts = plan.map((el) => pantalla(m.conCorro(el, el.corro), zoom, inclinacion, rumbo))
        let minimo = Infinity
        for (let a = 0; a < pts.length; a += 1) for (let b = a + 1; b < pts.length; b += 1) minimo = Math.min(minimo, Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y))
        const ancho = m.anchoDeRetratoPx(zoom)
        casosDos += 1
        if (plan.length > 1 && minimo < ancho * 0.9) {
          solapesDos += 1
          peoresDos.push({ zoom, inclinacion, rumbo, separacion, iconos: plan.length, minimo: Math.round(minimo), ancho: Math.round(ancho) })
        }
      }
    }
  }
}
// Con el nodo en medio y un VECINO a 30-90 m: ningún retrato encima de ninguna chincheta (rectángulo alto sobre su
// punto: poste, cubo y moneda, ver tamanoDeNodoPx).
let casosNodo = 0
let tapanNodo = 0
let tapanVecino = 0
const distNodo = []
const peoresNodo = []
for (const n of [1, 2, 4, 6, 9]) {
  for (const zoom of [15, 16, 17, 18]) {
    for (const [inclinacion, rumbo] of [[0, 0], [0, 60], [55, 120]]) {
      for (const vecino of [30, 60, 90]) {
        const jugadores = Array.from({ length: n }, (_, i) => {
          const r = 1 + azar() * 10
          const a = azar() * 2 * Math.PI
          return { user: 'n' + i, display_name: 'x', presence: 'live', lat: base.lat + (Math.cos(a) * r) / mLat, lon: base.lon + (Math.sin(a) * r) / mLon }
        })
        const nodos = [base, { lat: base.lat - (vecino * 0.6) / mLat, lon: base.lon + (vecino * 0.8) / mLon }]
        const plan = m.planDeJugadores(jugadores, zoom, new Set(), { retratos: true, inclinacion, rumbo, evitar: nodos })
        const t = m.tamanoDeNodoPx(zoom)
        const ancho = m.anchoDeRetratoPx(zoom)
        const np = nodos.map((x) => pantalla(x, zoom, inclinacion, rumbo))
        casosNodo += 1
        const encima = (nodo) => plan.some((el) => { const q = pantalla(m.conCorro(el, el.corro), zoom, inclinacion, rumbo); return Math.abs(q.x - nodo.x) < (ancho + t.ancho) / 2 && Math.min(q.y + ancho * 1.14, nodo.y + t.alto) > Math.max(q.y, nodo.y) })
        // 7/11 (4): la chincheta de SU nodo, nunca; la moneda del vecino, se tolera un poco (antes eso que alejarlos).
        if (encima(np[0])) { tapanNodo += 1; peoresNodo.push({ n, zoom, inclinacion, rumbo, vecino }) }
        if (encima(np[1])) tapanVecino += 1
        for (const el of plan) if (el.tipo === 'jugador') { const a = pantalla(m.conCorro(el, el.corro), zoom, inclinacion, rumbo); const r = pantalla(el, zoom, inclinacion, rumbo); distNodo.push(Math.hypot(a.x - r.x, a.y - r.y) / ancho) }
      }
    }
  }
}
// Junto al borde: el corro (con su nodo) a 20-60 px de un borde o bajo el HUD; ningún retrato fuera de la zona libre.
let casosBorde = 0
let cortados = 0
const vistaDe = (centro) => ({ centro, ancho: 390, alto: 844, arriba: 130, abajo: 260 })
for (const n of [2, 4, 6]) {
  for (const zoom of [15, 16, 17, 18]) {
    const mpp = m.metrosPorPixel(zoom, base.lat)
    for (const [dx, dy] of [[175, 0], [-175, 0], [0, -230], [0, 140]]) {
      const jugadores = Array.from({ length: n }, (_, i) => {
        const r = 1 + azar() * 6
        const a = azar() * 2 * Math.PI
        return { user: 'b' + i, display_name: 'x', presence: 'live', lat: base.lat + (Math.cos(a) * r) / mLat, lon: base.lon + (Math.sin(a) * r) / mLon }
      })
      // El centro del mapa, desplazado para que el corro quede (dx, dy) px del centro de la pantalla (dy hacia abajo).
      const centro = { lat: base.lat + (dy * mpp) / mLat, lon: base.lon - (dx * mpp) / mLon }
      const vista = vistaDe(centro)
      const plan = m.planDeJugadores(jugadores, zoom, new Set(), { retratos: true, vista })
      const ancho = m.anchoDeRetratoPx(zoom)
      const c = pantalla(centro, zoom, 0, 0)
      casosBorde += 1
      if (plan.some((el) => { const q = pantalla(m.conCorro(el, el.corro), zoom, 0, 0); const x = 195 + (q.x - c.x), y = 422 - (q.y - c.y); return x - ancho / 2 < 0 || x + ancho / 2 > 390 || y - ancho * 1.14 < 130 || y > 844 - 260 })) cortados += 1
    }
  }
}
peoresDos.sort((a, b) => a.minimo / a.ancho - b.minimo / b.ancho)
peores.sort((a, b) => a.minimo / a.ancho - b.minimo / b.ancho)
const resumen = (xs) => { const o = [...xs].sort((a, b) => a - b); return { media: Math.round((o.reduce((s, x) => s + x, 0) / o.length) * 100) / 100, p95: Math.round(o[Math.floor(o.length * 0.95)] * 100) / 100, max: Math.round(o[o.length - 1] * 100) / 100 } }
process.stdout.write(JSON.stringify({ distancia: resumen(distancias), distanciaNodo: resumen(distNodo), tapanVecino, casos, solapes, peores: peores.slice(0, 12), casosDos, solapesDos, peoresDos: peoresDos.slice(0, 12), casosNodo, tapanNodo, peoresNodo: peoresNodo.slice(0, 8), casosBorde, cortados }))
