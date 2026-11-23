// 16/11/2026 (Óscar: «el marcador y los nodos no están en su sitio a vista de Galicia; el tamaño de los nodos no
// escala»): a cualquier zoom, tú, los compañeros y los nodos están en su coordenada; lejos sólo se agrupa; el tamaño de
// los nodos sigue al zoom. Lo comprueba tests/test_mapa_zoom_16_11.py.
'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')
const e = crearEntorno()
const j = e.cargar('src/player/components/jugadoresEnMapa.ts')
const r = e.cargar('src/player/components/repartoDeNodos.ts')
const yo = { lat: 42.19, lon: -8.52 }
const mLat = 111320
const mLon = 111320 * Math.cos((yo.lat * Math.PI) / 180)
const metros = (a, b) => Math.hypot((a.lon - b.lon) * mLon, (a.lat - b.lat) * mLat)
const out = { desvioJugadores: {}, desvioNodos: {}, grupos: {}, determinista: true, tamanos: {}, tresD: {} }
const comp = [
  { user: 'A', display_name: 'a', presence: 'live', lat: yo.lat - 0.00006, lon: yo.lon },
  { user: 'B', display_name: 'b', presence: 'live', lat: yo.lat + 0.0004, lon: yo.lon + 0.0003 },
]
const nodos = [
  { clave: '0', lat: 41.89, lon: -8.5 }, { clave: '1', lat: 42.1903, lon: -8.52 },
  { clave: '2', lat: 42.1905, lon: -8.5201 }, { clave: '3', lat: 42.19, lon: -8.24 }, { clave: '4', lat: 42.45, lon: -8.75 },
]
for (const zoom of [6, 8, 11, 14, 14.9]) {
  const plan = j.planDeJugadores(comp, zoom, { propio: yo, evitar: nodos })
  const otra = j.planDeJugadores(comp, zoom, { propio: yo, evitar: nodos })
  if (JSON.stringify(plan) !== JSON.stringify(otra)) out.determinista = false
  // Desvío máximo (m) de cada elemento respecto de su punto real (yo y cada compañero suelto; el grupo, a su centroide).
  let peor = 0
  for (const el of plan) {
    const dibujado = j.desplazar(el, el.corro)
    const real = el.clave === j.CLAVE_PROPIO_EN_PLAN ? yo : el.tipo === 'grupo' ? { lat: el.jugadores.reduce((s, q) => s + q.lat, 0) / el.jugadores.length, lon: el.jugadores.reduce((s, q) => s + q.lon, 0) / el.jugadores.length } : el.jugadores[0]
    peor = Math.max(peor, metros(dibujado, real))
  }
  out.desvioJugadores[zoom] = peor
  out.grupos[zoom] = plan.filter((el) => el.tipo === 'grupo').map((el) => el.jugadores.length)
  const sitios = r.repartirNodos(nodos, zoom, 55, 20)
  let pn = 0
  for (const n of nodos) { const s = sitios.get(n.clave) ?? n; pn = Math.max(pn, metros(s, n)) }
  out.desvioNodos[zoom] = pn
}
// A z18 sin solapes un jugador aislado (a 30 m) sigue exactamente en su punto.
{
  const plan = j.planDeJugadores([{ user: 'Z', display_name: 'z', presence: 'live', lat: yo.lat + 0.0003, lon: yo.lon }], 18, { propio: yo })
  const z = plan.find((el) => el.clave === 'Z')
  out.aisladoZ18 = metros(j.desplazar(z, z.corro), { lat: yo.lat + 0.0003, lon: yo.lon })
}
let prev = -1; let monotono = true
for (let z = 4; z <= 20; z += 0.25) {
  const t = j.tamanoDeNodoPx(z).ancho
  if (t < prev - 1e-9) monotono = false
  prev = t
}
out.tamanos = { monotono, z8: j.tamanoDeNodoPx(8).ancho, z11: j.tamanoDeNodoPx(11).ancho, z12: j.tamanoDeNodoPx(12).ancho, z16: j.tamanoDeNodoPx(16).ancho, z19: j.tamanoDeNodoPx(19.5).ancho, z4: j.tamanoDeNodoPx(4).ancho }
let m3 = true; let p3 = -1
for (let z = 4; z <= 20; z += 0.1) { const f = j.factorTresDDeNodo(z); if (f < p3 - 1e-9) m3 = false; p3 = f }
out.tresD = { monotono: m3, z8: j.factorTresDDeNodo(8), z11: j.factorTresDDeNodo(11), z13: j.factorTresDDeNodo(13), z16: j.factorTresDDeNodo(16), z18: j.factorTresDDeNodo(18) }
// Histéresis en z15: entrada 14,8 al alejar, salida 15,2 al acercar.
out.histeresis = { alejando: [15.1, 14.9, 14.7].map((z, i, a) => a.slice(0, i + 1).reduce((s, zz) => j.estaLejos(zz, s), undefined)), acercando: [14.5, 15.1, 15.3].map((z, i, a) => a.slice(0, i + 1).reduce((s, zz) => j.estaLejos(zz, s), undefined)), inicial: [j.estaLejos(14.9), j.estaLejos(15.1)] }
// Clúster de nodos: al centroide REAL, determinista, y se abre al acercarse.
{
  const cl = (z, lista = nodos) => r.agruparNodosLejos(lista, z)
  const a = cl(8)
  const b = cl(8, [...nodos].reverse())
  out.clusters = {
    z8: a.map((c) => [c.miembros, c.lat, c.lon]),
    igual: JSON.stringify(a) === JSON.stringify(b),
    z18: cl(18).length,
    centroideOk: a.every((c) => Math.abs(c.lat - c.miembros.reduce((s, k) => s + nodos.find((n) => n.clave === k).lat, 0) / c.miembros.length) < 1e-12),
    // Estable al mover el mapa: mismo resultado para el mismo estado y zoom.
    repetido: JSON.stringify(cl(8)) === JSON.stringify(cl(8)),
  }
}
process.stdout.write(JSON.stringify(out))
