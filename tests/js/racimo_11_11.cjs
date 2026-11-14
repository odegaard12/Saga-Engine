// 11/11/2026: juntos, en racimo (triángulo, rombo, panal), nunca en fila. Lo comprueba tests/test_racimo_11_11.py.
'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')

const ent = crearEntorno()
const m = ent.cargar('src/player/components/jugadoresEnMapa.ts')
const L = ent.cargar('src/player/avatares3d/mixamo/lodAvatares.ts')
const base = { lat: 42.6, lon: -8.7 }
const mLat = 111320
const mLon = 111320 * Math.cos((base.lat * Math.PI) / 180)
const out = { vistas: {}, racimo: {} }

function plan(n, zoom, tresD) {
  const otros = Array.from({ length: n }, (_, i) => ({ user: 'PRUEBA0' + (i + 1), display_name: 'x', presence: 'live', lat: base.lat, lon: base.lon }))
  const cuerpos = tresD ? new Set([m.CLAVE_PROPIO_EN_PLAN, ...otros.map((j) => j.user)]) : null
  return m.planDeJugadores(otros, zoom, { cuerpos, propio: base })
}
// El mayor número de centros en una misma recta (con ~3 px de margen) y la separación mínima.
function medir(p, zoom, tresD) {
  const mpp = m.metrosPorPixel(zoom, base.lat)
  const alto = L.alturaEnPantallaPx(zoom, base.lat) * 0.88
  const w = tresD ? alto * 0.5 : m.anchoDeRetratoPx(zoom)
  const h = tresD ? alto : w
  const px = p.map((el) => { const q = m.conCorro(el, el.corro); return { x: ((q.lon - base.lon) * mLon) / mpp, y: ((q.lat - base.lat) * mLat) / mpp } })
  let enFila = Math.min(2, px.length)
  let solapes = 0
  for (let a = 0; a < px.length; a++) for (let b = a + 1; b < px.length; b++) {
    const dx = px[b].x - px[a].x, dy = px[b].y - px[a].y, largo = Math.hypot(dx, dy)
    // Cuerpos (cajas): se montan si se pisan a lo ancho y más de un 8 % a lo alto. Retratos (círculos): a menos de 0,93.
    if (tresD ? Math.abs(dx) < w * 0.96 && h - Math.abs(dy) > 0.08 * h : largo < w * 0.93) solapes += 1
    if (largo < 1) continue
    const enRecta = px.filter((q) => Math.abs((q.x - px[a].x) * dy - (q.y - px[a].y) * dx) / largo < 3).length
    enFila = Math.max(enFila, enRecta)
  }
  const ancho = Math.max(...px.map((q) => q.x)) - Math.min(...px.map((q) => q.x))
  const altoG = Math.max(...px.map((q) => q.y)) - Math.min(...px.map((q) => q.y))
  return { n: px.length, enFila, solapes, ancho: Math.round((ancho / w) * 100) / 100, alto: Math.round((altoG / h) * 100) / 100 }
}
for (const [nombre, zoom, tresD] of [['2D z17', 17, false], ['2D z19', 19, false], ['3D z16.5', 16.5, true], ['3D z19', 19, true]]) {
  out.vistas[nombre] = {}
  // n compañeros en TU mismo punto: tú + n.
  for (const n of [1, 2, 3, 4, 5, 6]) out.vistas[nombre][n] = medir(plan(n, zoom, tresD), zoom, tresD)
}
for (const n of [2, 3, 4, 5, 6, 7]) {
  const r = m.racimo(n, 1, 1)
  let min = Infinity
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) min = Math.min(min, Math.hypot(r[a].x - r[b].x, r[a].y - r[b].y))
  out.racimo[n] = { n: r.length, min: Math.round(min * 1000) / 1000, radio: Math.round(Math.max(...r.map((q) => Math.hypot(q.x, q.y))) * 100) / 100 }
}
process.stdout.write(JSON.stringify(out))
