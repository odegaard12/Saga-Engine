// 7/11/2026: la subida del gobernador de calidad (lodAvatares.ts). 23/11: el abanico ya no sale de un reparto en pantalla sino
// de la fuente de posición (tests/js/posicion_fuente.cjs). Lo comprueba tests/test_abanico_7_11.py.
'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')

const ent = crearEntorno()
const m = ent.cargar('src/player/components/jugadoresEnMapa.ts')
const L = ent.cargar('src/player/avatares3d/mixamo/lodAvatares.ts')
const base = { lat: 40.4157, lon: -3.6824 }
const mLat = 111320
const mLon = 111320 * Math.cos((base.lat * Math.PI) / 180)
const out = {}

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
