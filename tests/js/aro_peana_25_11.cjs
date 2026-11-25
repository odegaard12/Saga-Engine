// 25/11/2026 (Óscar, al ver la hoja 5: «nadie sobre la peana, tampoco yo»). En 3D tu CUERPO sale de la peana lo mínimo
// (fuentePosicion.ts `apartadoPropioDePeanas`, con `pesoCuerpo`); tu real no cambia; sin saltos al cambiar de vista; los
// demás esquivan tu cuerpo. Lo comprueba tests/test_aro_peana_25_11.py.
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
const POSTE = en(0, 0)
const CERCA = [[0, 0], [6, 3], [-5, -2], [3, -6], [-2, 5], [10, -8]]

function mundo({ yo, otros = [], z, cuerpo }) {
  const fu = new F.FuentePosicion()
  fu.postes = [POSTE]
  fu.separacionM = J.separacionEntreJugadoresM(z, base.lat)
  fu.peanaM = J.radioDePeanaM(z, base.lat)
  fu.pesoCuerpo = () => cuerpo.w
  fu.fijar('yo', 'yo', yo, 0)
  otros.forEach((p, i) => fu.fijar('o' + i, 'jugador', p, 0))
  fu.calcular(0)
  fu.calcular(100000)
  return fu
}

const out = { casos: 0, peorDentroM: Infinity, peorExcesoM: 0, realMovido: 0, en2D: 0, fueraMovido: 0, otrosSobreTiM: Infinity }
for (const z of [16, 17.5, 19]) {
  const R = J.radioDePeanaM(z, base.lat)
  for (const f of [0, 0.03, 0.5, 0.95, 1.05, 1.5]) for (const ang of [0, 2, 4]) {
    const yo = en(Math.cos(ang) * R * f, Math.sin(ang) * R * f)
    const fu = mundo({ yo, otros: CERCA.map(([e, n]) => en(e, n)), z, cuerpo: { w: 1 } })
    const t = 100000
    const cuerpo = fu.retratoPropio('yo', t)
    out.casos += 1
    out.realMovido = Math.max(out.realMovido, m(fu.real('yo', t), yo), m(fu.dibujo('yo', t), yo))
    if (f < 1) {
      out.peorDentroM = Math.min(out.peorDentroM, m(cuerpo, POSTE) - R)
      out.peorExcesoM = Math.max(out.peorExcesoM, m(cuerpo, POSTE) - R - 0.01)
    } else out.fueraMovido = Math.max(out.fueraMovido, m(cuerpo, yo))
    CERCA.forEach((_, i) => { if (!fu.abanico('o' + i)) out.otrosSobreTiM = Math.min(out.otrosSobreTiM, m(fu.dibujo('o' + i, t), cuerpo) - fu.separacionM) })
    // En 2D (sin cuerpo) la peana no te mueve.
    const dos = mundo({ yo, z, cuerpo: { w: 0 } })
    out.en2D = Math.max(out.en2D, m(dos.retratoPropio('yo', t), yo))
  }
}
// Cambio de vista: el cuerpo entra y sale con el fundido (16 ms por fotograma, 24 fotogramas), sin saltos.
{
  const z = 17.5
  const mpp = J.metrosPorPixel ? J.metrosPorPixel(z, base.lat) : 78271.517 * Math.cos((base.lat * Math.PI) / 180) / 2 ** z
  const cuerpo = { w: 0 }
  const fu = mundo({ yo: en(1, 1), z, cuerpo })
  let prev = fu.retratoPropio('yo', 100000)
  let peor = 0
  for (let i = 1; i <= 120; i += 1) {
    cuerpo.w = Math.min(1, i / 24)
    const t = 100000 + i * 16
    fu.calcular(t)
    const p = fu.retratoPropio('yo', t)
    peor = Math.max(peor, m(p, prev) / mpp)
    prev = p
  }
  out.fundidoPeorPasoPx = r2(peor)
  out.fundidoFinalM = r2(m(prev, POSTE))
}
for (const k of ['peorDentroM', 'peorExcesoM', 'realMovido', 'en2D', 'fueraMovido', 'otrosSobreTiM']) out[k] = r2(out[k])
process.stdout.write(JSON.stringify(out))
