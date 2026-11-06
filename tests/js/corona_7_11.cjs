// 7/11/2026: los retratos de compañeros juntos se abren en corona medida en PANTALLA. Lo comprueba
// tests/test_movil_7_11.py. Ejecuta src/player/components/jugadoresEnMapa.ts tal cual.
'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')

const m = crearEntorno().cargar('src/player/components/jugadoresEnMapa.ts')
const j = (id, lat, lon) => ({ user: id, display_name: id, lat, lon, presence: 'live' })
const base = { lat: 40.4157, lon: -3.6824 }
const juntos = [j('a', base.lat, base.lon), j('b', base.lat + 0.00006, base.lon + 0.00002), j('c', base.lat - 0.00004, base.lon + 0.00007), j('d', base.lat + 0.00002, base.lon - 0.00009)]
const salida = {}
for (const z of [15, 16, 17, 18]) {
  const plan = m.planDeJugadores(juntos, z, new Set(), { retratos: true })
  const mpp = m.metrosPorPixel(z, base.lat)
  const pts = plan.map((el) => {
    const s = m.conCorro(el, el.corro)
    return { x: (s.lon - base.lon) * 111320 * Math.cos((base.lat * Math.PI) / 180) / mpp, y: (s.lat - base.lat) * 111320 / mpp }
  })
  let peor = Infinity
  for (let a = 0; a < pts.length; a += 1) for (let b = a + 1; b < pts.length; b += 1) peor = Math.min(peor, Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y))
  salida['z' + z] = { tipos: plan.map((el) => el.tipo), minimaPx: Math.round(peor), ancho: Math.round(m.anchoDeRetratoPx(z)), lineas: m.lineasDeCorona(plan).features.length }
}
// Sin la opción (3D con cuerpos), el corro de siempre: 2,2 m.
salida.sinRetratos = m.planDeJugadores([j('a', 42.5, -8.6), j('b', 42.5, -8.6)], 18).map((el) => Math.round(Math.hypot(el.corro.este, el.corro.norte) * 10) / 10)
// Muchos juntos: un solo icono con el número.
const muchos = Array.from({ length: 8 }, (_, i) => j('m' + i, base.lat + i * 0.00001, base.lon))
salida.muchos = m.planDeJugadores(muchos, 17, new Set(), { retratos: true }).map((el) => [el.tipo, el.jugadores.length])
// Uno solo: en su sitio, sin línea.
salida.solo = m.planDeJugadores([j('s', base.lat, base.lon)], 17, new Set(), { retratos: true }).map((el) => [el.corro.este, el.corro.norte])
process.stdout.write(JSON.stringify(salida))
