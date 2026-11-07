// 7/11/2026: reparto de z16+ en 3D (jugadoresEnMapa.ts, `cuerpos`): sin grupos, nadie tapa a nadie ni a un nodo, y
// cerca de su sitio. Pantalla plana simulada (sin proyección). Lo comprueba tests/test_reparto_cuerpos_7_11.py.
'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')

const m = crearEntorno().cargar('src/player/components/jugadoresEnMapa.ts')
let semilla = 777
const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648)
const base = { lat: 40.4157, lon: -3.6824 }
const mLat = 111320
const mLon = 111320 * Math.cos((base.lat * Math.PI) / 180)
let casos = 0, grupos = 0, faltan = 0, tapan = 0, sobreNodo = 0, distMax = 0
for (const n of [2, 6, 10, 15]) {
  for (const zoom of [16, 16.5, 17, 18]) {
    for (const vecino of [0, 25, 60]) {
      const jugadores = Array.from({ length: n }, (_, i) => {
        const r = 1 + azar() * 14
        const a = azar() * 2 * Math.PI
        return { user: 'c' + i, display_name: 'x', presence: 'live', lat: base.lat + (Math.cos(a) * r) / mLat, lon: base.lon + (Math.sin(a) * r) / mLon }
      })
      const cuerpos = new Set(jugadores.filter((_, i) => i % 2 === 0).map((j) => j.user).concat([m.CLAVE_PROPIO_EN_PLAN]))
      const nodos = [{ lat: base.lat + vecino / mLat, lon: base.lon }]
      const plan = m.planDeJugadores(jugadores, zoom, new Set(), { retratos: true, cuerpos, evitar: nodos, propio: base })
      casos += 1
      grupos += plan.filter((el) => el.tipo === 'grupo').length
      if (plan.length !== n + 1) faltan += 1
      const mpp = m.metrosPorPixel(zoom, base.lat)
      const px = (p) => ({ x: ((p.lon - base.lon) * mLon) / mpp, y: ((p.lat - base.lat) * mLat) / mpp })
      const ancho = m.anchoDeRetratoPx(zoom)
      const anchoCuerpo = 0.5 * 0.88 * Math.max(64, 80 * 2 ** (0.17 * (zoom - 16)))
      const cajas = plan.map((el) => {
        const q = px(m.conCorro(el, el.corro))
        const c = cuerpos.has(el.clave)
        const w = c ? anchoCuerpo : ancho
        const h = c ? anchoCuerpo / 0.5 : ancho * 1.14
        distMax = Math.max(distMax, Math.hypot(q.x - px(el).x, q.y - px(el).y) / anchoCuerpo)
        return { x: q.x, y: q.y, w, h }
      })
      for (let a = 0; a < cajas.length; a++) for (let b = a + 1; b < cajas.length; b++) {
        const A = cajas[a], B = cajas[b]
        if (Math.abs(A.x - B.x) < (A.w + B.w) * 0.45 && Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y) > 0.1 * Math.min(A.h, B.h)) tapan += 1
      }
      const t = m.tamanoDeNodoPx(zoom)
      const nq = px(nodos[0])
      for (const A of cajas) if (Math.abs(A.x - nq.x) < (A.w + t.ancho * 1.6) / 2 && Math.min(A.y + A.h, nq.y + t.alto) > Math.max(A.y, nq.y - t.ancho * 0.3)) sobreNodo += 1
    }
  }
}
process.stdout.write(JSON.stringify({ casos, grupos, faltan, tapan, sobreNodo, distMax: Math.round(distMax * 100) / 100 }))
