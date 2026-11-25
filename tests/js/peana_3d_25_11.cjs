// 25/11/2026 (Óscar: «estás probando solo la vista 2D, ¿y en 3D?»). En 3D los demás no se suben a la peana del nodo que se ve
// (fuentePosicion.ts `peanaM`, jugadoresEnMapa.ts `radioDePeanaM`); tú no te mueves; sólo depende del zoom. Lo comprueba
// tests/test_peana_3d_25_11.py.
'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')

const ent = crearEntorno()
const F = ent.cargar('src/player/posicion/fuentePosicion.ts')
const J = ent.cargar('src/player/components/jugadoresEnMapa.ts')
const base = { lat: 42.71, lon: -8.69 }
const mLat = 111320
const mLon = 111320 * Math.cos((base.lat * Math.PI) / 180)
const en = (e, n) => ({ lat: base.lat + n / mLat, lon: base.lon + e / mLon })
const m = (a, b) => Math.hypot((a.lon - b.lon) * mLon, (a.lat - b.lat) * mLat)
const r2 = (x) => Math.round(x * 100) / 100
const CERCA = [[0, 0], [6, 3], [-5, -2], [3, -6], [-2, 5], [10, -8], [-8, 8], [4, 10], [-4, -10], [12, 4], [-14, 2], [1, 2], [15, 12], [-12, -4]]

function mundo({ yo, otros, z, peana = true }) {
  const fu = new F.FuentePosicion()
  fu.postes = [en(0, 0)]
  fu.separacionM = J.separacionEntreJugadoresM(z, base.lat)
  fu.peanaM = peana ? J.radioDePeanaM(z, base.lat) : 0
  fu.fijar('yo', 'yo', yo, 0)
  otros.forEach((p, i) => fu.fijar('o' + i, 'jugador', p, 0))
  fu.calcular(0)
  fu.calcular(100000)
  return fu
}

const out = { radios: {}, casos: 0, peorDentroM: Infinity, yoMovido: 0, antesDentro: 0, peorTopeM: 0 }
for (const z of [16, 17.5, 19]) {
  out.radios[z] = r2(J.radioDePeanaM(z, base.lat))
  for (const n of [1, 6, 14]) for (const yo of [en(1, 1), en(-12, -6), en(-60, -40)]) {
    const otros = CERCA.slice(0, n).map(([e, k]) => en(e, k))
    const fu = mundo({ yo, otros, z })
    const R = J.radioDePeanaM(z, base.lat)
    out.casos += 1
    out.yoMovido = Math.max(out.yoMovido, m(fu.dibujo('yo', 100000), yo))
    otros.forEach((p, i) => {
      const d = fu.dibujo('o' + i, 100000)
      if (!fu.abanico('o' + i)) out.peorDentroM = Math.min(out.peorDentroM, m(d, en(0, 0)) - R)
      out.peorTopeM = Math.max(out.peorTopeM, m(d, p) - (2 * fu.separacionM + R))
    })
    // Sin la peana (como antes) se quedaban encima: a 5 m del poste.
    const viejo = mundo({ yo, otros, z, peana: false })
    otros.forEach((p, i) => { if (m(viejo.dibujo('o' + i, 100000), en(0, 0)) < R - 0.5) out.antesDentro += 1 })
  }
}
out.peorDentroM = r2(out.peorDentroM)
out.yoMovido = r2(out.yoMovido)
out.peorTopeM = r2(out.peorTopeM)
process.stdout.write(JSON.stringify(out))
