// 24/11/2026 (Óscar: «no debo estar encima de la moneda, ni translúcido: mi retrato al lado, como los demás»). En 2D tu RETRATO
// sale de la moneda lo mínimo (fuentePosicion.ts `apartadoPropioDeMonedas`/`retratoPropio`); tu cuerpo 3D y tu real no se mueven,
// la gente no te empuja y los demás esquivan tu retrato apartado. Lo comprueba tests/test_tu_al_lado_24_11.py.
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
const poste = (e, n, estado = 'actual') => ({ ...en(e, n), monedaPx: J.radioDeMonedaPx(estado), toquePx: estado === 'actual' ? 36 : 0 })
const out = {}

function mundo({ yo, otros = [], postes, z, w = 1, wOtros = w, t = 0 }) {
  const fu = new F.FuentePosicion()
  fu.postes = postes
  fu.separacionM = J.separacionEntreJugadoresM(z, base.lat)
  J.medirMonedas(z, base.lat, fu.monedas)
  fu.pesoMoneda = (id) => (id === 'yo' ? w : wOtros)
  fu.fijar('yo', 'yo', yo, t)
  for (const o of otros) fu.fijar(o.id, 'jugador', o.p, t)
  fu.calcular(t)
  fu.calcular(t + 100000)
  return fu
}

// ---- 1. Tú a 0..1,3 radios de la moneda, a z16, z17,5 y z19: tu retrato fuera de ella, lo justo, y tu real quieto.
{
  let casos = 0, peorDentro = Infinity, peorExceso = 0, fueraMovido = 0, realMovido = 0, en3D = 0
  for (const z of [16, 17.5, 19]) {
    const p = poste(0, 0)
    const med = { mpp: 0, escala: 0, retratoPx: 0 }
    J.medirMonedas(z, base.lat, med)
    const R = F.radioDeMonedaM(p, med)
    for (const f of [0, 0.02, 0.3, 0.6, 0.99, 1.01, 1.3]) for (const ang of [0, 2, 4]) {
      const yo = en(Math.cos(ang) * f * R, Math.sin(ang) * f * R)
      const fu = mundo({ yo, postes: [p], z })
      const ret = fu.retratoPropio('yo', 100000)
      casos += 1
      peorDentro = Math.min(peorDentro, m(ret, p) - R)
      realMovido = Math.max(realMovido, m(fu.dibujo('yo', 100000), yo))
      if (f > 1) fueraMovido = Math.max(fueraMovido, m(ret, yo))
      else if (f * R >= F.TU_CERCA_DEL_POSTE_M) peorExceso = Math.max(peorExceso, m(ret, yo) - (R - f * R))
      // Con tu cuerpo 3D (peso 0) el retrato no se aparta.
      en3D = Math.max(en3D, m(mundo({ yo, postes: [p], z, w: 0 }).retratoPropio('yo', 100000), yo))
    }
  }
  out.uno = { casos, peorDentroM: r2(peorDentro), peorExcesoM: r2(peorExceso), fueraMovido: r2(fueraMovido), realMovido, en3D: r2(en3D) }
}

// ---- 2. La gente no te empuja (con o sin ellos encima, tu retrato va al mismo sitio) y nadie pisa tu retrato apartado.
{
  let empuje = 0, peorHueco = Infinity, casos = 0
  for (const z of [16, 17.5, 19]) {
    const p = poste(0, 0)
    const yo = en(1.5, 2)
    const solo = mundo({ yo, postes: [p], z }).retratoPropio('yo', 100000)
    const otros = [0, 1, 2, 3, 4, 5].map((i) => ({ id: 'O' + i, p: { lat: solo.lat + (i - 2) * 2e-6, lon: solo.lon + (i % 3) * 3e-6 } }))
    const fu = mundo({ yo, otros, postes: [p], z })
    const ret = fu.retratoPropio('yo', 100000)
    empuje = Math.max(empuje, m(ret, solo))
    const sep = J.separacionEntreJugadoresM(z, base.lat)
    for (const o of otros) {
      if (fu.abanico(o.id)) continue
      peorHueco = Math.min(peorHueco, m(fu.dibujo(o.id, 100000), ret) - sep)
      casos += 1
    }
  }
  out.gente = { empujeM: r2(empuje), peorHuecoM: r2(peorHueco), casos }
}

// ---- 3. Encima del poste: sale hacia donde venías (llegas andando hacia el norte: tu retrato, al sur); sin rumbo, por tu hash.
{
  const p = poste(0, 0)
  const fu = new F.FuentePosicion()
  fu.postes = [p]
  fu.separacionM = J.separacionEntreJugadoresM(17.5, base.lat)
  J.medirMonedas(17.5, base.lat, fu.monedas)
  fu.pesoMoneda = () => 1
  fu.fijar('yo', 'yo', en(0, -30), 0)
  fu.fijar('yo', 'yo', en(0, 0.3), 20000)
  fu.calcular(20000)
  fu.calcular(200000)
  const ret = fu.retratoPropio('yo', 200000)
  const sinRumbo = mundo({ yo: en(0, 0.3), postes: [p], z: 17.5 }).retratoPropio('yo', 100000)
  const otraVez = mundo({ yo: en(0, 0.3), postes: [p], z: 17.5 }).retratoPropio('yo', 100000)
  out.poste = { norteM: r2((ret.lat - base.lat) * mLat), esteM: r2((ret.lon - base.lon) * mLon), estable: m(sinRumbo, otraVez) }
}

// ---- 4. Sin saltos: pellizco z16 -> z19 -> z16 en 3 s a 60 fps y el fundido 3D -> 2D (peso 0 -> 1 en 250 ms): paso por fotograma.
{
  const p = poste(0, 0)
  const yo = en(2, 1)
  const fu = new F.FuentePosicion()
  fu.postes = [p]
  let w = 1
  fu.pesoMoneda = () => w
  fu.fijar('yo', 'yo', yo, 0)
  const paso = (t, z) => {
    fu.separacionM = J.separacionEntreJugadoresM(z, base.lat)
    J.medirMonedas(z, base.lat, fu.monedas)
    fu.calcular(t)
    return fu.retratoPropio('yo', t)
  }
  let prev = paso(0, 16)
  let peorPellizco = 0
  for (let t = 16; t <= 3000; t += 16) {
    const u = t / 3000
    const z = u < 0.5 ? 16 + 6 * u : 19 - 6 * (u - 0.5)
    const r = paso(t, z)
    peorPellizco = Math.max(peorPellizco, m(r, prev) / J.metrosPorPixel(z, base.lat))
    prev = r
  }
  w = 0
  for (let t = 3016; t <= 6000; t += 16) prev = paso(t, 17.5)
  let peorFundido = 0
  for (let t = 6016; t <= 8000; t += 16) {
    w = Math.min(1, (t - 6000) / 250)
    const r = paso(t, 17.5)
    peorFundido = Math.max(peorFundido, m(r, prev) / J.metrosPorPixel(17.5, base.lat))
    prev = r
  }
  out.continuo = { pellizcoPeorPasoPx: r2(peorPellizco), fundidoPeorPasoPx: r2(peorFundido), realMovido: m(fu.dibujo('yo', 8000), yo) }
}

process.stdout.write(JSON.stringify(out))
