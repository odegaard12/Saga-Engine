// 7/11/2026: el abanico de 3D (jugadoresEnMapa.ts, `abanico`) y la subida del gobernador de calidad (lodAvatares.ts).
// Pantalla plana simulada (sin proyección). Lo comprueba tests/test_abanico_7_11.py.
'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')

const ent = crearEntorno()
const m = ent.cargar('src/player/components/jugadoresEnMapa.ts')
const L = ent.cargar('src/player/avatares3d/mixamo/lodAvatares.ts')
const base = { lat: 40.4157, lon: -3.6824 }
const mLat = 111320
const mLon = 111320 * Math.cos((base.lat * Math.PI) / 180)
const out = {}

function plan(n, zoom, nodos, radioM) {
  const jugadores = Array.from({ length: n }, (_, i) => {
    const a = (i / Math.max(1, n)) * 2 * Math.PI
    return { user: 'c' + i, display_name: 'x', presence: 'live', lat: base.lat + (Math.cos(a) * radioM) / mLat, lon: base.lon + (Math.sin(a) * radioM) / mLon }
  })
  const cuerpos = new Set(jugadores.map((j) => j.user).concat([m.CLAVE_PROPIO_EN_PLAN]))
  const p = m.planDeJugadores(jugadores, zoom, { cuerpos, evitar: nodos, propio: base })
  const mpp = m.metrosPorPixel(zoom, base.lat)
  const px = (q) => ({ x: ((q.lon - base.lon) * mLon) / mpp, y: ((q.lat - base.lat) * mLat) / mpp })
  const anchoCuerpo = 0.5 * 0.88 * Math.max(64, 80 * 2 ** (0.17 * (zoom - 16)))
  const ancho = m.anchoDeRetratoPx(zoom)
  const t = m.tamanoDeNodoPx(zoom)
  const sobreNodo = (A) => nodos.some((nd) => { const q = px(nd); return Math.abs(A.x - q.x) < (A.w + t.ancho * 1.6) / 2 && Math.min(A.y + A.h, q.y + t.alto * 1.2) > Math.max(A.y, q.y - t.ancho * 0.3) })
  const tapan = (A, B) => Math.abs(A.x - B.x) < (A.w + B.w) * 0.45 && Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y) > 0.1 * Math.min(A.h, B.h)
  const enMapa = p.filter((el) => !el.abanico).map((el) => { const q = px(m.conCorro(el, el.corro)); return { x: q.x, y: q.y, w: anchoCuerpo, h: anchoCuerpo / 0.5 } })
  const ids = [...new Set(p.filter((el) => el.abanico).map((el) => el.abanico.id))]
  const abanicos = ids.map((id) => { const a = p.find((el) => el.abanico && el.abanico.id === id).abanico; const q = px(a); return { x: q.x, y: q.y, w: ancho * 1.3, h: ancho * 1.05 } })
  let solapes = 0, nodo = 0
  for (let a = 0; a < enMapa.length; a++) for (let b = a + 1; b < enMapa.length; b++) if (tapan(enMapa[a], enMapa[b])) solapes += 1
  for (const A of enMapa) if (sobreNodo(A)) nodo += 1
  let abanicoSobre = 0
  for (const A of abanicos) if (sobreNodo(A) || enMapa.some((B) => tapan(A, B))) abanicoSobre += 1
  return {
    total: p.length,
    enAbanico: p.filter((el) => el.abanico).length,
    abanicos: ids.length,
    propioEnAbanico: p.some((el) => el.clave === m.CLAVE_PROPIO_EN_PLAN && el.abanico),
    solapes,
    nodo,
    abanicoSobre,
  }
}

// Repartidos y sin nodo cerca: nadie va al abanico (el abanico es SOLO para quien no tiene sitio).
out.holgados = plan(4, 16.5, [{ lat: base.lat + 300 / mLat, lon: base.lon }], 25)
// 30 en el mismo punto, encima de un nodo y con un anillo de nodos alrededor: no caben todos.
const apretados = [{ lat: base.lat, lon: base.lon }]
for (let k = 0; k < 10; k += 1) apretados.push({ lat: base.lat + (Math.cos(k * 0.628) * 9) / mLat, lon: base.lon + (Math.sin(k * 0.628) * 9) / mLon })
out.apretados = plan(30, 16, apretados, 0.5)
// 8/11: 30 juntos ya caben buscando más lejos; el abanico queda para cuando de verdad no hay hueco (150).
out.desbordados = plan(150, 16, apretados, 0.5)
// 2D / retratos: nunca abanico (no cambia nada por debajo de los cuerpos).
{
  const jugadores = Array.from({ length: 10 }, (_, i) => ({ user: 'r' + i, display_name: 'x', presence: 'live', lat: base.lat, lon: base.lon }))
  out.sinCuerpos = m.planDeJugadores(jugadores, 17, { evitar: apretados, propio: base }).filter((el) => el.abanico).length
}

// Gobernador: baja con lentitud, vuelve a subir un escalón tras un buen rato holgado, y nunca por encima del techo.
{
  const correr = (g, desde, hasta, dt, espera) => {
    const cambios = []
    for (let now = desde; now < hasta; now += dt) { const r = g.muestra(dt, now, espera); if (r) cambios.push([Math.round(now / 1000), r]) }
    return cambios
  }
  const g = new L.GobernadorDeCalidad('alta')
  const baja = correr(g, 0, 6000, 100, 40) // lento: baja
  const pronto = correr(g, 6000, 30000, 33, 33) // holgado pero aún dentro de la espera tras bajar
  const luego = correr(g, 30000, 120000, 33, 33) // holgado mucho rato: sube hasta su techo y no más
  out.gobernador = { baja, pronto, luego, final: g.calidad }
  const v = new L.GobernadorDeCalidad('media')
  out.gobernadorTecho = correr(v, 0, 120000, 33, 33).length
  const f = new L.GobernadorDeCalidad('alta')
  f.calidad = 'baja'; f.techo = 'baja'
  out.gobernadorFijado = correr(f, 0, 120000, 33, 33).length
  // Holgado a ratos (cada 6 s un tirón): no sube.
  const t = new L.GobernadorDeCalidad('alta')
  correr(t, 0, 6000, 100, 40)
  const tirones = []
  for (let now = 6000; now < 120000; now += 33) { const r = t.muestra(Math.floor(now / 2500) % 3 === 0 ? 50 : 33, now, 33); if (r) tirones.push(r) }
  out.gobernadorTirones = tirones
  // 11/11: un móvil que NO aguanta «alta» (va lento siempre que está en alta): no la reintenta sin parar; cada vez
  // espera el doble. En 20 minutos, pocas subidas (antes, una cada ~45 s: 26).
  const o = new L.GobernadorDeCalidad('alta')
  let subidas = 0
  for (let now = 0; now < 20 * 60000; now += 40) {
    const antes = o.calidad
    const r = o.muestra(antes === 'alta' ? 100 : 33, now, antes === 'alta' ? 40 : 33)
    if (r === 'alta') subidas += 1
  }
  out.gobernadorVaiven = subidas
}
process.stdout.write(JSON.stringify(out))
