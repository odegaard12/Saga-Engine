// 12/11/2026: pulido de los personajes del mapa (rendimiento y que no quede forzado). Lo comprueba tests/test_pulido_12_11.py.
'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')

const ent = crearEntorno()
const m = ent.cargar('src/player/components/jugadoresEnMapa.ts')
const out = {}
// La forma del racimo se guarda por proporción: escalarla da lo mismo que calcularla de nuevo.
const a = m.racimo(5, 10, 12)
const b = m.racimo(5, 20, 24)
out.escala = a.every((q, i) => Math.abs(b[i].x - 2 * q.x) < 1e-9 && Math.abs(b[i].y - 2 * q.y) < 1e-9)
out.repetible = JSON.stringify(m.racimo(5, 10, 12)) === JSON.stringify(a)
// Retratos juntos (2D): siguen sin solaparse con el racimo girado, y el giro es el mismo plan tras plan.
const base = { lat: 42.6, lon: -8.7 }
const mLat = 111320
const mLon = 111320 * Math.cos((base.lat * Math.PI) / 180)
const otros = Array.from({ length: 4 }, (_, i) => ({ user: 'PRUEBA0' + (i + 1), display_name: 'x', presence: 'live', lat: base.lat, lon: base.lon }))
const plan = () => m.planDeJugadores(otros, 18, { propio: base }).map((el) => m.conCorro(el, el.corro))
const p1 = plan()
out.estable = JSON.stringify(p1) === JSON.stringify(plan())
const mpp = m.metrosPorPixel(18, base.lat)
const w = m.anchoDeRetratoPx(18)
const px = p1.map((q) => ({ x: ((q.lon - base.lon) * mLon) / mpp, y: ((q.lat - base.lat) * mLat) / mpp }))
let minimo = Infinity
let filasDeRegla = 0
for (let i = 0; i < px.length; i++)
  for (let j = i + 1; j < px.length; j++) {
    minimo = Math.min(minimo, Math.hypot(px[j].x - px[i].x, px[j].y - px[i].y) / w)
    if (Math.abs(px[j].y - px[i].y) < 0.5) filasDeRegla += 1
  }
out.separacion = Math.round(minimo * 100) / 100
out.filasDeRegla = filasDeRegla
console.log(JSON.stringify(out))
