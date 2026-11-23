// 23/11/2026: la fuente única de posición (frontend/src/player/posicion/fuentePosicion.ts), en Node y sin mapa ni cámara.
// Lo comprueba tests/test_posicion_fuente.py. Propiedades: `dibujo` no depende del orden de llegada ni de quién esté lejos;
// `dibujo(yo) = real(yo)`; apartado <= 8 m y sólo junto a un poste; sin saltos; jitter sin movimiento; llegadas tardías suaves.
'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')

const F = crearEntorno().cargar('src/player/posicion/fuentePosicion.ts')
const base = { lat: 42.19081, lon: -8.51958 }
const mLat = 111320
const mLon = 111320 * Math.cos((base.lat * Math.PI) / 180)
const en = (e, n, p = base) => ({ lat: p.lat + n / mLat, lon: p.lon + e / mLon })
const m = (a, b) => Math.hypot((a.lon - b.lon) * mLon, (a.lat - b.lat) * mLat)
let semilla = 4242
const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648)
const mezclar = (xs) => { const r = [...xs]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [r[i], r[j]] = [r[j], r[i]] } return r }
const out = {}

// ---- 1. Puro: mismo mundo, cualquier orden de llegada => mismo dibujo. Sin cámara entre las entradas (por construcción).
{
  let casos = 0, distintos = 0
  for (let k = 0; k < 200; k++) {
    const n = 1 + Math.floor(azar() * 12)
    const otros = Array.from({ length: n }, (_, i) => ({ id: 'J' + Math.floor(azar() * 1e6) + '_' + i, real: en((azar() - 0.5) * 16, (azar() - 0.5) * 16) }))
    const yo = azar() < 0.5 ? en((azar() - 0.5) * 8, (azar() - 0.5) * 8) : null
    const a = F.apartadosDelMundo({ yo, otros, postes: [base] })
    const b = F.apartadosDelMundo({ yo, otros: mezclar(otros), postes: [base] })
    casos += 1
    for (const o of otros) { const x = a.get(o.id), y = b.get(o.id); if (x.este !== y.este || x.norte !== y.norte || Boolean(x.abanico) !== Boolean(y.abanico)) { distintos += 1; break } }
  }
  out.ordenDeLlegada = { casos, distintos }
}

// ---- 2. Un mundo completo vía FuentePosicion, asentado: dibujo(yo) == real(yo) y desplazamiento máximo <= 8 m.
function mundo(ids, yoPos, orden) {
  const fu = new F.FuentePosicion()
  fu.postes = [base]
  if (yoPos) fu.fijar('yo', 'yo', yoPos, 0)
  for (const id of orden ? mezclar(ids) : ids) fu.fijar(id.id, 'jugador', id.p, 0)
  fu.calcular(0)
  fu.calcular(100000) // asentado: apartado animado ya en su objetivo
  return fu
}
{
  let maxApartado = 0, yoMovido = 0, casos = 0, pegados = 0, fueraDelDisco = 0, enAbanico = 0
  for (let k = 0; k < 300; k++) {
    const n = 1 + Math.floor(azar() * 15)
    const ids = Array.from({ length: n }, (_, i) => ({ id: 'P' + i + '_' + k, p: en((azar() - 0.5) * 20, (azar() - 0.5) * 20) }))
    const yoPos = en((azar() - 0.5) * 10, (azar() - 0.5) * 10)
    const fu = mundo(ids, yoPos, true)
    const t = 200000
    const pu = fu.puestos(t)
    casos += 1
    const yo = pu.get('yo')
    if (m(yo.dibujo, yo.real) > 1e-9) yoMovido += 1
    const sep = []
    for (const q of ids) {
      const e = pu.get(q.id)
      const d = m(e.dibujo, e.real)
      maxApartado = Math.max(maxApartado, d)
      if (e.abanico) enAbanico += 1
      // Sólo se aparta quien está dentro del disco del poste.
      if (d > 1e-6 && m(e.real, base) >= F.R_DISCO_M + 1e-6) fueraDelDisco += 1
      if (d > 1e-6) sep.push(e.dibujo)
    }
    const todos = [...sep, yo.dibujo]
    for (let a = 0; a < todos.length; a++) for (let b = a + 1; b < todos.length; b++) if (m(todos[a], todos[b]) < F.SEPARACION_M - 1e-6) pegados += 1
  }
  out.mundo = { casos, maxApartado: Math.round(maxApartado * 100) / 100, yoMovido, fueraDelDisco, pegados, enAbanico, TOPE: F.TOPE_APARTADO_M }
}

// ---- 3. Añadir o quitar un id LEJANO (fuera de todo disco) no mueve a nadie; uno cercano mueve a otros <= 8 m.
{
  let casos = 0, movidosPorLejano = 0, maxPorCercano = 0
  for (let k = 0; k < 150; k++) {
    const n = 2 + Math.floor(azar() * 6)
    const ids = Array.from({ length: n }, (_, i) => ({ id: 'Q' + i + '_' + k, p: en((azar() - 0.5) * 14, (azar() - 0.5) * 14) }))
    const yoPos = en(3, 3)
    const a = mundo(ids, yoPos, false).puestos(200000)
    const lejano = { id: 'LEJOS_' + k, p: en(60 + azar() * 80, (azar() - 0.5) * 100) }
    const b = mundo([...ids, lejano], yoPos, true).puestos(200000)
    const c = mundo(ids.slice(1), yoPos, false).puestos(200000)
    casos += 1
    for (const q of ids) if (m(a.get(q.id).dibujo, b.get(q.id).dibujo) > 1e-9) movidosPorLejano += 1
    // Quitar uno cercano: los demás se recolocan como mucho dentro del tope (no saltan al otro lado del mapa).
    for (const q of ids.slice(1)) maxPorCercano = Math.max(maxPorCercano, m(a.get(q.id).dibujo, c.get(q.id).dibujo))
  }
  out.lejano = { casos, movidosPorLejano, maxPorCercano: Math.round(maxPorCercano * 100) / 100 }
}

// ---- 4. Quieto y asentado: el mismo dibujo en cualquier instante (la cámara ni existe) y sin teleports al llegar otro.
{
  const fu = mundo([{ id: 'A', p: en(2, 1) }, { id: 'B', p: en(-1, 3) }], en(0, -2), false)
  const t1 = fu.puestos(200000), t2 = fu.puestos(300000)
  out.quieto = { igual: ['A', 'B', 'yo'].every((id) => m(t1.get(id).dibujo, t2.get(id).dibujo) < 1e-9) }
  // Llega un tercero pegado al poste: los que ya estaban se animan (sin salto > 2 m por fotograma de 66 ms).
  fu.fijar('0C', 'jugador', en(2.0, 0.9), 300000) // «0C» < «A»: pide hueco antes que ellos
  let prev = ['A', 'B'].map((id) => fu.dibujo(id, 300000)), maxPaso = 0
  fu.calcular(300000)
  prev = ['A', 'B'].map((id) => fu.dibujo(id, 300000))
  for (let t = 300066; t <= 302000; t += 66) {
    fu.calcular(t)
    const ahora = ['A', 'B'].map((id) => fu.dibujo(id, t))
    ahora.forEach((p, i) => { maxPaso = Math.max(maxPaso, m(p, prev[i])) })
    prev = ahora
  }
  out.llegaUnoCerca = { maxPasoPorFotograma: Math.round(maxPaso * 100) / 100 }
}

// ---- 5. Jitter: parado con precisión 8 y ruido de ±10 m: la banda muerta (max(precisión, 12)) no lo mueve.
{
  const fu = new F.FuentePosicion()
  fu.fijar('Z', 'jugador', base, 0, { precisionM: 8 })
  let cambios = 0, ultimo = fu.real('Z', 0)
  for (let i = 1; i <= 60; i++) {
    const a = azar() * 2 * Math.PI, d = azar() * 10
    fu.fijar('Z', 'jugador', en(Math.cos(a) * d, Math.sin(a) * d), i * 30000, { precisionM: 8 })
    const r = fu.real('Z', i * 30000 + 200000)
    if (m(r, ultimo) > 0.05) cambios += 1
    ultimo = r
  }
  out.jitter = { cambios, deriva: Math.round(m(fu.real('Z', 1e9), base) * 100) / 100 }
}

// ---- 6. Llegada tardía: el compañero manda cada 30 s; un fix de 25 m se desliza al ritmo del latido (nunca más deprisa que
// un trote) y sólo más de 300 m es un salto. Se mide el paso de cada fotograma de 100 ms.
{
  const fu = new F.FuentePosicion()
  fu.fijar('T', 'jugador', base, 0)
  fu.fijar('T', 'jugador', en(0, 25), 30000)
  fu.fijar('T', 'jugador', en(0, 50), 60000)
  let prev = fu.real('T', 60000), maxV = 0, llegaEn = null
  for (let t = 60100; t <= 130000; t += 100) {
    const p = fu.real('T', t)
    maxV = Math.max(maxV, m(p, prev) / 0.1)
    if (llegaEn === null && m(p, en(0, 50)) < 0.05) llegaEn = t - 60000
    prev = p
  }
  out.tarde = { velocidadMaxMps: Math.round(maxV * 100) / 100, llegaEnMs: llegaEn }
  const fu2 = new F.FuentePosicion()
  fu2.fijar('S', 'jugador', base, 0)
  fu2.fijar('S', 'jugador', en(0, 600), 30000) // > 300 m: salto sin deslizar
  out.salto = { sinDeslizar: m(fu2.real('S', 30001), en(0, 600)) < 0.05, fundido: [30000, 30250, 30500, 31000].map((x) => Math.round(fu2.desvanecer('S', x) * 100) / 100), sinFundirSiNoSalta: fu.desvanecer('T', 130000) }
}

// ---- 7. Tú nunca te apartas aunque estés encima del poste; y los demás te esquivan (>= SEPARACION_M de ti).
{
  const fu = mundo([{ id: 'X', p: en(0.2, 0.1) }, { id: 'Y', p: en(-0.3, 0.2) }, { id: 'W', p: en(0.1, -0.2) }], en(0, 0), false)
  const pu = fu.puestos(200000)
  out.encimaDelPoste = {
    yoApartado: m(pu.get('yo').dibujo, pu.get('yo').real),
    minAlYo: Math.min(...['X', 'Y', 'W'].map((id) => m(pu.get(id).dibujo, pu.get('yo').dibujo))),
    maxApartado: Math.max(...['X', 'Y', 'W'].map((id) => m(pu.get(id).dibujo, pu.get(id).real))),
  }
}

// ---- 8. Abanico: 80 en el mismo punto no caben en el anillo (tope 8 m): los que no, al abanico; nadie a más de 8 m.
{
  const ids = Array.from({ length: 80 }, (_, i) => ({ id: 'M' + String(i).padStart(2, '0'), p: en(0.1 * (i % 5), 0.1 * (i % 3)) }))
  const pu = mundo(ids, en(0, 0), true).puestos(200000)
  const todos = ids.map((q) => pu.get(q.id))
  out.abanico = {
    enAbanico: todos.filter((e) => e.abanico).length,
    maxApartado: Math.round(Math.max(...todos.map((e) => m(e.dibujo, e.real))) * 100) / 100,
    abanicosDistintos: new Set(todos.filter((e) => e.abanico).map((e) => e.abanico.id)).size,
  }
}
// ---- 9. Cruzar z16: quien iba en un grupo no salta al deshacerse (el umbral de agrupar se funde a 0 hacia z16).
{
  const J = crearEntorno().cargar('src/player/components/jugadoresEnMapa.ts')
  let peor = 0
  for (let k = 0; k < 200; k++) {
    const n = 2 + Math.floor(azar() * 6)
    const js = Array.from({ length: n }, (_, i) => ({ user: 'u' + i, display_name: 'x', presence: 'live', ...en((azar() - 0.5) * 400, (azar() - 0.5) * 400) }))
    const lejos = J.planDeJugadores(js, 15.99)
    for (const j of js) {
      const el = lejos.find((e) => e.jugadores.some((x) => x.user === j.user))
      peor = Math.max(peor, m({ lat: el.lat, lon: el.lon }, j))
    }
  }
  out.cruceZ16 = { peorSaltoM: Math.round(peor * 100) / 100, fundido: [15, 15.5, 16].map((z) => Math.round(J.fundidoDelGrupo(z) * 1000) / 1000) }
}
process.stdout.write(JSON.stringify(out))
