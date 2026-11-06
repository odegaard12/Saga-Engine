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
// Con el nodo en medio: ningún retrato a menos de un ancho de la chincheta.
let casosNodo = 0
let tapanNodo = 0
for (const n of [1, 2, 4, 6]) {
  for (const zoom of [15, 16, 17, 18]) {
    for (const [inclinacion, rumbo] of [[0, 0], [55, 120]]) {
      const jugadores = Array.from({ length: n }, (_, i) => {
        const r = 1 + azar() * 10
        const a = azar() * 2 * Math.PI
        return { user: 'n' + i, display_name: 'x', presence: 'live', lat: base.lat + (Math.cos(a) * r) / mLat, lon: base.lon + (Math.sin(a) * r) / mLon }
      })
      const plan = m.planDeJugadores(jugadores, zoom, new Set(), { retratos: true, inclinacion, rumbo, evitar: [base] })
      const nodo = pantalla(base, zoom, inclinacion, rumbo)
      const ancho = m.anchoDeRetratoPx(zoom)
      casosNodo += 1
      if (plan.some((el) => { const q = pantalla(m.conCorro(el, el.corro), zoom, inclinacion, rumbo); return Math.hypot(q.x - nodo.x, q.y - nodo.y) < ancho * 0.95 })) tapanNodo += 1
    }
  }
}
peoresDos.sort((a, b) => a.minimo / a.ancho - b.minimo / b.ancho)
peores.sort((a, b) => a.minimo / a.ancho - b.minimo / b.ancho)
process.stdout.write(JSON.stringify({ casos, solapes, peores: peores.slice(0, 12), casosDos, solapesDos, peoresDos: peoresDos.slice(0, 12), casosNodo, tapanNodo }))
