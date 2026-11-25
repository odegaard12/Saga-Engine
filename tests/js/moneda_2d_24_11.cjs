// 24/11/2026: en 2D los retratos de los demás esquivan la moneda del nodo (fuentePosicion.ts `monedas`/`pesoMoneda` +
// jugadoresEnMapa.ts `medirMonedas`/`radioDeMonedaPx`). Lo comprueba tests/test_moneda_2d_24_11.py. Sin mapa ni cámara.
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
let semilla = 2412
const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648)
const mezclar = (xs) => { const r = [...xs]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [r[i], r[j]] = [r[j], r[i]] } return r }
const ESTADOS = ['actual', 'siguiente', 'pendiente', 'hecho']
const ZOOMS = [16, 16.5, 17, 17.5, 18, 18.5, 19, 19.5]
const poste = (e, n, estado) => ({ ...en(e, n), monedaPx: J.radioDeMonedaPx(estado), toquePx: estado === 'actual' ? 36 : 0 })
const medida = (z) => { const x = { mpp: 0, escala: 0, retratoPx: 0 }; J.medirMonedas(z, base.lat, x); return x }
// Lo que se ve en pantalla (2D, sin inclinar): el hueco entre el canto de la moneda (o su toque) y el del retrato, en px.
const huecoPx = (z, p, q) => {
  const mpp = J.metrosPorPixel(z, base.lat)
  return m(p, q) / mpp - Math.max(p.monedaPx * J.factorDeTamanoDeNodo(z), p.toquePx || 0) - J.radioDeRetratoPx(z)
}
const huecoRetratosPx = (z, a, b) => m(a, b) / J.metrosPorPixel(z, base.lat) - 2 * J.radioDeRetratoPx(z)
const out = {}

// Un mundo asentado: la fuente con peso de moneda `w` (1 = 2D con retratos), tras varios segundos.
function asentado({ yo, otros, postes, z, w = 1, orden = false }) {
  const fu = new F.FuentePosicion()
  fu.postes = postes
  fu.separacionM = J.separacionEntreJugadoresM(z, base.lat)
  J.medirMonedas(z, base.lat, fu.monedas)
  fu.pesoMoneda = typeof w === 'function' ? w : () => w
  if (yo) fu.fijar('yo', 'yo', yo, 0)
  for (const o of orden ? mezclar(otros) : otros) fu.fijar(o.id, 'jugador', o.p, 0)
  fu.calcular(0)
  fu.calcular(100000)
  return fu.puestos(200000)
}

// ---- 1. Uno solo, a 0..1,3 radios de la moneda, todos los estados y zooms: nunca la tapa y se aparta lo justo (radial).
{
  let casos = 0, peorHueco = Infinity, peorExceso = 0, quietosMovidos = 0, yoMovido = 0
  const porZoom = {}
  for (const z of ZOOMS) for (const estado of ESTADOS) {
    const p = poste(0, 0, estado)
    const R = F.radioDeMonedaM(p, medida(z))
    for (const f of [0, 0.02, 0.3, 0.6, 0.9, 0.99, 1.01, 1.3]) for (const ang of [0, 2, 4]) {
      const real = en(Math.cos(ang) * f * R, Math.sin(ang) * f * R)
      // Tú lejos (a 5 radios): un obstáculo fijo que no estorba.
      const pu = asentado({ yo: en(5 * R, 0), otros: [{ id: 'COMPI', p: real }], postes: [p], z })
      const o = pu.get('COMPI')
      const h = huecoPx(z, p, o.dibujo)
      casos += 1
      peorHueco = Math.min(peorHueco, h)
      porZoom[z] = Math.min(porZoom[z] ?? Infinity, h)
      yoMovido = Math.max(yoMovido, m(pu.get('yo').dibujo, en(5 * R, 0)))
      const mov = m(o.dibujo, o.real)
      if (f > 1) quietosMovidos += mov > 1e-9 ? 1 : 0
      // Lo mínimo: del sitio al borde de la moneda (R − d), hacia fuera. A menos de 1 m del poste va por su hash (la regla del poste).
      else if (f * R >= 1) peorExceso = Math.max(peorExceso, mov - (R - f * R))
    }
  }
  out.uno = { casos, peorHuecoPx: r2(peorHueco), porZoom: Object.fromEntries(Object.entries(porZoom).map(([k, v]) => [k, r2(v)])), peorExcesoM: r2(peorExceso), quietosMovidos, yoMovido, margen: J.MARGEN_MONEDA_PX }
}

// ---- 2. Muchos (15, tú incluido) alrededor de 3 nodos pegados (actual, siguiente, hecho), a cada zoom: ningún retrato
//         tapa una moneda ni otro retrato; tú quieto.
{
  const filas = []
  for (const z of ZOOMS) {
    const sep = J.separacionEntreJugadoresM(z, base.lat)
    // Las monedas, como las deja el reparto (a ~1 moneda y media entre centros a z17,5).
    const postes = [poste(0, 0, 'actual'), poste(30, 8, 'siguiente'), poste(-26, 20, 'hecho')]
    for (let k = 0; k < 4; k++) {
      const yo = en((azar() - 0.5) * 10, (azar() - 0.5) * 10)
      const otros = Array.from({ length: 14 }, (_, i) => ({ id: 'P' + k + '_' + i, p: en((azar() - 0.5) * 60, (azar() - 0.5) * 50) }))
      const pu = asentado({ yo, otros, postes, z })
      let hMon = Infinity, hRet = Infinity
      const ids = ['yo', ...otros.map((o) => o.id)].filter((id) => !pu.get(id).abanico)
      for (const id of ids) if (id !== 'yo') for (const p of postes) hMon = Math.min(hMon, huecoPx(z, p, pu.get(id).dibujo))
      for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) hRet = Math.min(hRet, huecoRetratosPx(z, pu.get(ids[a]).dibujo, pu.get(ids[b]).dibujo))
      filas.push({ z, hMon, hRet, yo: m(pu.get('yo').dibujo, yo), sepPx: sep / J.metrosPorPixel(z, base.lat) })
    }
  }
  out.muchos = {
    casos: filas.length,
    peorHuecoMonedaPx: r2(Math.min(...filas.map((f) => f.hMon))),
    peorHuecoRetratosPx: r2(Math.min(...filas.map((f) => f.hRet))),
    yoMovido: Math.max(...filas.map((f) => f.yo)),
  }
}

// ---- 2b. Monedas que en pantalla se pisan entre sí (de lejos, z16-z17: el reparto sólo las separa a z17,5) con gente encima de
//          todas: nadie queda dentro de ninguna (salen al punto libre más cercano de la unión, no rebotan de una a otra).
{
  let peor = Infinity, casos = 0, peorRet = Infinity
  const postes = [poste(0, 0, 'hecho'), poste(70, 10, 'hecho'), poste(140, 0, 'actual'), poste(170, 25, 'siguiente'), poste(120, 45, 'pendiente')]
  const sitios = [[140, 0], [146, 3], [128, -4], [155, 12], [170, 25], [121, 44], [0, 0], [74, 8], [138, 5], [143, -6], [135, -2], [141, 2], [100, 20], [35, 5]]
  for (const z of [16, 16.25, 16.5, 16.75, 17, 17.25, 17.5]) for (const yo of [en(100, -30), en(141, 1)]) {
    const pu = asentado({ yo, otros: sitios.map(([e, n], i) => ({ id: 'U' + i, p: en(e, n) })), postes, z })
    for (let i = 0; i < sitios.length; i++) for (const p of postes) { peor = Math.min(peor, huecoPx(z, p, pu.get('U' + i).dibujo)) }
    const ids = ['yo', ...sitios.map((_, i) => 'U' + i)]
    for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) peorRet = Math.min(peorRet, huecoRetratosPx(z, pu.get(ids[a]).dibujo, pu.get(ids[b]).dibujo))
    casos += 1
  }
  out.pegadas = { casos, peorHuecoMonedaPx: r2(peor), peorHuecoRetratosPx: r2(peorRet) }
}

// ---- 3. Tú encima de la moneda (juegas en el nodo) y un compañero pegado a ti: tú no te mueves; él no tapa ni la moneda ni a ti.
{
  let peorMon = Infinity, peorRet = Infinity, yoMovido = 0, casos = 0
  for (const z of ZOOMS) for (const d of [0, 1, 3]) {
    const p = poste(0, 0, 'actual')
    const yo = en(2, 1)
    const pu = asentado({ yo, otros: [{ id: 'COMPI', p: en(2 + d, 1) }], postes: [p], z })
    casos += 1
    yoMovido = Math.max(yoMovido, m(pu.get('yo').dibujo, yo))
    peorMon = Math.min(peorMon, huecoPx(z, p, pu.get('COMPI').dibujo))
    peorRet = Math.min(peorRet, huecoRetratosPx(z, pu.get('COMPI').dibujo, yo))
  }
  out.tuEncima = { casos, yoMovido, peorHuecoMonedaPx: r2(peorMon), peorHuecoRetratosPx: r2(peorRet) }
}

// ---- 4. Orden de llegada: el mismo mundo en cualquier orden => exactamente el mismo dibujo.
{
  let casos = 0, distintos = 0
  for (let k = 0; k < 200; k++) {
    const z = 16 + azar() * 3.5
    const sep = J.separacionEntreJugadoresM(z, base.lat)
    const n = 1 + Math.floor(azar() * 14)
    const otros = Array.from({ length: n }, (_, i) => ({ id: 'J' + Math.floor(azar() * 1e6) + '_' + i, real: en((azar() - 0.5) * 3 * sep, (azar() - 0.5) * 3 * sep) }))
    const yo = azar() < 0.7 ? en((azar() - 0.5) * sep, (azar() - 0.5) * sep) : null
    const postes = Array.from({ length: 1 + Math.floor(azar() * 3) }, () => poste((azar() - 0.5) * 2 * sep, (azar() - 0.5) * 2 * sep, ESTADOS[Math.floor(azar() * 4)]))
    const e = { yo, postes, separacionM: sep, monedas: medida(z) }
    const a = F.apartadosDelMundo({ ...e, otros })
    const b = F.apartadosDelMundo({ ...e, otros: mezclar(otros), postes: mezclar(postes) })
    casos += 1
    for (const o of otros) { const x = a.get(o.id), y = b.get(o.id); if (Math.abs(x.este - y.este) > 1e-9 || Math.abs(x.norte - y.norte) > 1e-9) { distintos += 1; break } }
  }
  out.orden = { casos, distintos }
}

// ---- 5. 3D sin cambios: con peso 0 (cuerpo 3D, o postes) el dibujo es EXACTAMENTE el de antes (sin monedas).
{
  let distintos = 0, casos = 0
  for (const z of ZOOMS) {
    const postes = [poste(0, 0, 'actual'), poste(25, -10, 'pendiente')]
    const otros = [{ id: 'A', p: en(3, 2) }, { id: 'B', p: en(20, -6) }, { id: 'C', p: en(-4, 9) }]
    const sin = asentado({ yo: en(0, -1), otros, postes: postes.map((p) => ({ lat: p.lat, lon: p.lon })), z, w: 0 })
    const con = asentado({ yo: en(0, -1), otros, postes, z, w: 0 })
    for (const o of otros) { casos += 1; if (m(sin.get(o.id).dibujo, con.get(o.id).dibujo) > 1e-12) distintos += 1 }
  }
  out.tresD = { casos, distintos }
}

// ---- 6. Lejos (por debajo de z15) nadie se aparta por la moneda; entre z15 y z16 entra poco a poco (como la separación).
{
  const z14 = medida(14.5), z15 = medida(15), z155 = medida(15.5), z16 = medida(16)
  out.lejos = { mpp14: z14.mpp, mpp15: z15.mpp, mediaEn155: r2(z155.mpp / J.metrosPorPixel(15.5, base.lat)), enteraEn16: r2(z16.mpp / J.metrosPorPixel(16, base.lat)) }
}

// ---- 7. Continuidad: pellizco z15 -> z19,5 -> z15 en 3 s (16 ms) con uno sobre la moneda y otro al lado; y el fundido de vista
//         (peso 1 -> 0 -> 1 en 250 ms, el de `pasoDeMezcla`): nadie salta; el objetivo con el zoom es continuo.
{
  const postes = [poste(0, 0, 'actual')]
  const fu = new F.FuentePosicion()
  fu.postes = postes
  let w = 1
  fu.pesoMoneda = () => w
  fu.fijar('yo', 'yo', en(-6, -40), 0)
  fu.fijar('COMPI', 'jugador', en(2, 1), 0)
  fu.fijar('PEPE', 'jugador', en(-3, 4), 0)
  let t = 0, prev = null, peorPaso = 0, yoMovido = 0
  const pasos = 94
  const paso = (z) => {
    fu.separacionM = J.separacionEntreJugadoresM(z, base.lat)
    J.medirMonedas(z, base.lat, fu.monedas)
    fu.calcular(t)
    const ahora = ['COMPI', 'PEPE'].map((id) => fu.dibujo(id, t))
    // En píxeles de pantalla de ese zoom: un salto se vería de decenas.
    if (prev) ahora.forEach((p, k) => { peorPaso = Math.max(peorPaso, m(p, prev[k]) / J.metrosPorPixel(z, base.lat)) })
    yoMovido = Math.max(yoMovido, m(fu.dibujo('yo', t), en(-6, -40)))
    prev = ahora
    t += 16
  }
  for (let i = 0; i <= 2 * pasos; i++) paso(i <= pasos ? 15 + (4.5 * i) / pasos : 19.5 - (4.5 * (i - pasos)) / pasos)
  const pellizco = peorPaso
  peorPaso = 0
  for (let i = 0; i < 40; i++) { w = Math.max(0, 1 - (i * 16) / 250); paso(17.5) }
  for (let i = 0; i < 40; i++) { w = Math.min(1, (i * 16) / 250); paso(17.5) }
  const fundido = peorPaso
  // El objetivo (sin suavizado) a z y z + 0,001: continuo salvo justo encima del poste (dirección por hash: fija).
  let peorObjetivo = 0
  const otros = [{ id: 'COMPI', real: en(2, 1) }, { id: 'PEPE', real: en(-3, 4) }]
  for (let z = 15; z < 19.5; z += 0.01) {
    const a = F.apartadosDelMundo({ yo: en(-6, -40), otros, postes, separacionM: J.separacionEntreJugadoresM(z, base.lat), monedas: medida(z) })
    const b = F.apartadosDelMundo({ yo: en(-6, -40), otros, postes, separacionM: J.separacionEntreJugadoresM(z + 0.001, base.lat), monedas: medida(z + 0.001) })
    for (const o of otros) peorObjetivo = Math.max(peorObjetivo, Math.hypot(a.get(o.id).este - b.get(o.id).este, a.get(o.id).norte - b.get(o.id).norte) / J.metrosPorPixel(z, base.lat))
  }
  out.continuo = { pellizcoPeorPasoPx: r2(pellizco), fundidoPeorPasoPx: r2(fundido), objetivoPorMilesimaPx: r2(peorObjetivo), yoMovido }
}

// ---- 8. Coste: 15 jugadores y 20 nodos (cada 80 m, en zigzag), un cálculo por fotograma (los dos mundos, 2D y 3D).
{
  const postes = Array.from({ length: 20 }, (_, i) => poste(i * 60 - 600, (i % 2) * 50, ESTADOS[i % 4]))
  const fu = new F.FuentePosicion()
  fu.postes = postes
  fu.pesoMoneda = () => 1
  fu.separacionM = J.separacionEntreJugadoresM(17.5, base.lat)
  J.medirMonedas(17.5, base.lat, fu.monedas)
  fu.fijar('yo', 'yo', en(0, 0), 0)
  // Casi todos juntos en tres nodos (como en una partida: van en grupo), unos pocos sueltos.
  for (let i = 0; i < 14; i++) {
    const c = i < 11 ? postes[[3, 4, 10][i % 3]] : en((azar() - 0.5) * 1200, (azar() - 0.5) * 100)
    fu.fijar('P' + i, 'jugador', { lat: c.lat + ((azar() - 0.5) * 30) / mLat, lon: c.lon + ((azar() - 0.5) * 30) / mLon }, 0)
  }
  for (let i = 1; i < 200; i++) fu.calcular(i * 16)
  const N = 2000
  const t0 = process.hrtime.bigint()
  for (let i = 0; i < N; i++) fu.calcular(4000 + i * 16)
  const conMs = Number(process.hrtime.bigint() - t0) / 1e6 / N
  fu.pesoMoneda = () => 0
  const t1 = process.hrtime.bigint()
  for (let i = 0; i < N; i++) fu.calcular(40000 + i * 16)
  const sinMs = Number(process.hrtime.bigint() - t1) / 1e6 / N
  out.coste = { msPorFotogramaCon: Math.round(conMs * 1000) / 1000, msPorFotogramaSin: Math.round(sinMs * 1000) / 1000 }
}

process.stdout.write(JSON.stringify(out))
