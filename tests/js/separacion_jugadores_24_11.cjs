// 24/11/2026: las personas no se pisan (fuentePosicion.ts `separacionM` + jugadoresEnMapa.ts `separacionEntreJugadoresM`).
// Lo comprueba tests/test_separacion_jugadores_24_11.py. Sin mapa ni cÃ¡mara: la separaciÃ³n sÃ³lo mira el mundo.
'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')

const ent = crearEntorno()
const F = ent.cargar('src/player/posicion/fuentePosicion.ts')
const J = ent.cargar('src/player/components/jugadoresEnMapa.ts')
const L = ent.cargar('src/player/avatares3d/mixamo/lodAvatares.ts')
const base = { lat: 42.71, lon: -8.69 }
const mLat = 111320
const mLon = 111320 * Math.cos((base.lat * Math.PI) / 180)
const en = (e, n) => ({ lat: base.lat + n / mLat, lon: base.lon + e / mLon })
const m = (a, b) => Math.hypot((a.lon - b.lon) * mLon, (a.lat - b.lat) * mLat)
const r2 = (x) => Math.round(x * 100) / 100
let semilla = 2411
const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648)
const mezclar = (xs) => { const r = [...xs]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [r[i], r[j]] = [r[j], r[i]] } return r }
const ZOOMS = [16, 17.5, 19, 20]
const out = {}

// Un mundo asentado (lejos de cualquier poste) con la separaciÃ³n de este zoom.
function asentado(yo, otros, sep, orden = false) {
  const fu = new F.FuentePosicion()
  fu.separacionM = sep
  if (yo) fu.fijar('yo', 'yo', yo, 0)
  for (const o of orden ? mezclar(otros) : otros) fu.fijar(o.id, 'jugador', o.p, 0)
  fu.calcular(0)
  fu.calcular(100000)
  return fu.puestos(200000)
}

// ---- 1. La huella: metros de separaciÃ³n por zoom (continua, 0 lejos, la misma con cualquier rumbo: no lo recibe).
out.huella = Object.fromEntries(ZOOMS.map((z) => [z, r2(J.separacionEntreJugadoresM(z, base.lat))]))
{
  let peorSalto = 0, prev = J.separacionEntreJugadoresM(14, base.lat)
  for (let z = 14.001; z <= 21; z += 0.001) {
    const s = J.separacionEntreJugadoresM(z, base.lat)
    peorSalto = Math.max(peorSalto, Math.abs(s - prev))
    prev = s
  }
  out.huellaContinua = { peorSaltoPorMilesimaDeZoom: r2(peorSalto), z15: J.separacionEntreJugadoresM(15, base.lat), z14: J.separacionEntreJugadoresM(14, base.lat) }
  // En pÃ­xeles: la separaciÃ³n cubre el retrato (el mayor) y el aro del cuerpo, con margen.
  out.huellaPx = Object.fromEntries(ZOOMS.map((z) => {
    const mpp = J.metrosPorPixel(z, base.lat)
    return [z, { sepPx: r2(J.separacionEntreJugadoresM(z, base.lat) / mpp), retratoPx: r2(J.anchoDeRetratoPx(z)), aroPx: r2(J.ARO_EN_ALTOS * L.alturaEnPantallaPx(z, base.lat)) }]
  }))
}

// ---- 2. TÃº + 1 a 0 / 0,5 / 1 / 1,6 / 3 m, a cada zoom: tÃº no te mueves, el otro queda justo a la separaciÃ³n (lo mÃ­nimo).
{
  const filas = []
  for (const z of ZOOMS) {
    const sep = J.separacionEntreJugadoresM(z, base.lat)
    for (const d of [0, 0.5, 1, 1.6, 3]) {
      const pu = asentado(en(0, 0), [{ id: 'COMPI', p: en(d, 0) }], sep)
      const yo = pu.get('yo'), o = pu.get('COMPI')
      filas.push({ z, d, yoMovido: m(yo.dibujo, yo.real), dist: m(o.dibujo, yo.dibujo), sep, apartado: m(o.dibujo, o.real), minimo: Math.max(0, sep - d) })
    }
  }
  out.dos = {
    casos: filas.length,
    yoMovido: Math.max(...filas.map((f) => f.yoMovido)),
    peorHueco: r2(Math.min(...filas.map((f) => f.dist - f.sep))),
    peorExceso: r2(Math.max(...filas.filter((f) => f.d > 0).map((f) => f.apartado - f.minimo))),
    ejemplo: filas.filter((f) => f.d === 1).map((f) => ({ z: f.z, apartadoM: r2(f.apartado), sepM: r2(f.sep) })),
  }
}

// ---- 3. Cuatro a menos de 2 m (y tÃº en medio), a cada zoom: nadie se pisa, tÃº quieto, nadie pasa del tope (2 separaciones).
{
  const cuatro = [[0.5, 0.3], [-0.8, 0.6], [0.3, -1.2], [-0.4, -0.5]].map(([e, n], i) => ({ id: 'C' + i, p: en(e, n) }))
  const filas = []
  for (const z of ZOOMS) {
    const sep = J.separacionEntreJugadoresM(z, base.lat)
    for (const conmigo of [true, false]) {
      const pu = asentado(conmigo ? en(0, 0) : null, cuatro, sep)
      const ids = [...(conmigo ? ['yo'] : []), ...cuatro.map((c) => c.id)]
      let minimo = Infinity
      for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) minimo = Math.min(minimo, m(pu.get(ids[a]).dibujo, pu.get(ids[b]).dibujo))
      filas.push({ z, conmigo, minRel: minimo / sep, maxApartadoRel: Math.max(...cuatro.map((c) => m(pu.get(c.id).dibujo, pu.get(c.id).real))) / sep, yo: conmigo ? m(pu.get('yo').dibujo, pu.get('yo').real) : 0 })
    }
  }
  out.cuatro = { casos: filas.length, minRel: r2(Math.min(...filas.map((f) => f.minRel))), maxApartadoRel: r2(Math.max(...filas.map((f) => f.maxApartadoRel))), yoMovido: Math.max(...filas.map((f) => f.yo)), TOPE: F.TOPE_GENTE_POR_SEPARACION }
}

// ---- 4. Orden de llegada: el mismo mundo en cualquier orden => exactamente el mismo dibujo (y con postes cerca tambiÃ©n).
{
  let casos = 0, distintos = 0
  for (let k = 0; k < 200; k++) {
    const n = 1 + Math.floor(azar() * 9)
    const sep = 5 + azar() * 40
    const otros = Array.from({ length: n }, (_, i) => ({ id: 'J' + Math.floor(azar() * 1e6) + '_' + i, real: en((azar() - 0.5) * 3 * sep, (azar() - 0.5) * 3 * sep) }))
    const yo = azar() < 0.7 ? en((azar() - 0.5) * sep, (azar() - 0.5) * sep) : null
    const postes = azar() < 0.4 ? [en((azar() - 0.5) * sep, (azar() - 0.5) * sep)] : []
    const a = F.apartadosDelMundo({ yo, otros, postes, separacionM: sep })
    const b = F.apartadosDelMundo({ yo, otros: mezclar(otros), postes, separacionM: sep })
    casos += 1
    for (const o of otros) { const x = a.get(o.id), y = b.get(o.id); if (x.este !== y.este || x.norte !== y.norte) { distintos += 1; break } }
  }
  out.orden = { casos, distintos }
}

// ---- 5. Lejos unos de otros (mÃ¡s de la separaciÃ³n): cada uno EXACTAMENTE en su sitio; y uno lejano no mueve a nadie.
{
  let movidos = 0, casos = 0, porLejano = 0
  for (const z of ZOOMS) {
    const sep = J.separacionEntreJugadoresM(z, base.lat)
    const otros = [0, 1, 2, 3].map((i) => ({ id: 'L' + i, p: en((i + 1) * sep * 1.05, (i % 2) * 0.3) }))
    const pu = asentado(en(0, 0), otros, sep)
    casos += 1
    for (const o of otros) if (m(pu.get(o.id).dibujo, pu.get(o.id).real) !== 0) movidos += 1
    const juntos = [{ id: 'A', p: en(0.5, 0) }, { id: 'B', p: en(-0.5, 0.4) }]
    const sin = asentado(en(0, 0), juntos, sep), con = asentado(en(0, 0), [...juntos, { id: 'LEJOS', p: en(10 * sep, 3 * sep) }], sep)
    for (const q of juntos) if (m(sin.get(q.id).dibujo, con.get(q.id).dibujo) > 1e-9) porLejano += 1
  }
  out.lejos = { casos, movidos, porLejano }
}

// ---- 6. Zoom continuo (pellizco de z16 a z20 y vuelta en 2 s, fotogramas de 16 ms): nadie da un salto; tÃº nunca te mueves.
{
  const fu = new F.FuentePosicion()
  fu.fijar('yo', 'yo', en(0, 0), 0)
  fu.fijar('COMPI', 'jugador', en(1, 0), 0)
  fu.fijar('PEPE', 'jugador', en(-0.6, 0.8), 0)
  let t = 0, prev = null, peorPaso = 0, yoMovido = 0
  const pasos = 125
  for (let i = 0; i <= 2 * pasos; i++) {
    const z = i <= pasos ? 16 + (4 * i) / pasos : 20 - (4 * (i - pasos)) / pasos
    fu.separacionM = J.separacionEntreJugadoresM(z, base.lat)
    fu.calcular(t)
    const ahora = ['COMPI', 'PEPE'].map((id) => fu.dibujo(id, t))
    if (prev) ahora.forEach((p, k) => { peorPaso = Math.max(peorPaso, m(p, prev[k]) / fu.separacionM) })
    yoMovido = Math.max(yoMovido, m(fu.dibujo('yo', t), en(0, 0)))
    prev = ahora
    t += 16
  }
  // Paso por fotograma relativo a la separaciÃ³n de ese momento (lo que se ve en pantalla): un salto serÃ­a ~1.
  out.zoomContinuo = { peorPasoRel: r2(peorPaso), yoMovido }
}

// ---- 7. Sin separaciÃ³n (0) todo es como antes: sÃ³lo los postes apartan.
{
  const pu = asentado(en(0, 0), [{ id: 'COMPI', p: en(1, 0) }], 0)
  out.sinSeparacion = { apartado: m(pu.get('COMPI').dibujo, pu.get('COMPI').real) }
}

// ---- 8. El fundido cuerpo/retrato: 250 ms en lÃ­nea recta; con Â«reducir movimientoÂ», de golpe.
{
  let x = 0, t = 0
  while (x < 1 && t < 2000) { x = L.pasoDeMezcla(x, 1, 16); t += 16 }
  out.fundido = { ms: L.FUNDIDO_VISTA_MS, llegaEnMs: t, a125ms: r2(L.pasoDeMezcla(0, 1, 125)), reducido: L.pasoDeMezcla(0.3, 0, 16, true), vuelta: r2(L.pasoDeMezcla(1, 0, 125)), aMedias: r2(L.pasoDeMezcla(0.4, 1, 125)), pasado: L.pasoDeMezcla(0, 1, 5000) }
  out.vista = {
    manda2D: L.formaQuePermiteTresD(19, 55, false),
    manda3DConLaCamaraAunPlana: L.formaQuePermiteTresD(19, 0, true),
    sinVistaUmbral: [L.formaQuePermiteTresD(19, 19), L.formaQuePermiteTresD(19, 20)],
    lejosNunca: L.formaQuePermiteTresD(15.9, 55, true),
  }
}
process.stdout.write(JSON.stringify(out))
