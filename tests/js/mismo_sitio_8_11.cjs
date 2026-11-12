// 8/11/2026: tú y dos compañeros en el MISMO sitio (en casa), con el GPS bailando. Lo comprueba tests/test_mismo_sitio_8_11.py.
'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')

const ent = crearEntorno()
const m = ent.cargar('src/player/components/jugadoresEnMapa.ts')
const L = ent.cargar('src/player/avatares3d/mixamo/lodAvatares.ts')
const S = ent.cargar('src/player/avatares/movimientoSuave.ts')
const base = { lat: 42.6, lon: -8.7 }
const mLat = 111320
const mLon = 111320 * Math.cos((base.lat * Math.PI) / 180)
const out = {}
let semilla = 7
const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647)
const mover = (p, r) => { const a = azar() * 2 * Math.PI, d = azar() * r; return { lat: p.lat + (Math.cos(a) * d) / mLat, lon: p.lon + (Math.sin(a) * d) / mLon } }
const jugadores = (pos) => pos.map((p, i) => ({ user: 'PRUEBA0' + (i + 1), display_name: 'x', presence: 'live', lat: p.lat, lon: p.lon }))

function plan(otros, propio, zoom, tresD) {
  const cuerpos = tresD ? new Set([m.CLAVE_PROPIO_EN_PLAN, ...otros.map((_, i) => 'PRUEBA0' + (i + 1))]) : null
  return m.planDeJugadores(jugadores(otros), zoom, { cuerpos, propio })
}
// Separación mínima entre dos cualesquiera (en anchos de retrato o de cuerpo), en pantalla plana.
function separacion(p, zoom, tresD) {
  const mpp = m.metrosPorPixel(zoom, base.lat)
  const ancho = tresD ? L.alturaEnPantallaPx(zoom, base.lat) * 0.88 * 0.5 : m.anchoDeRetratoPx(zoom)
  const px = p.map((el) => { const q = m.conCorro(el, el.corro); return { x: ((q.lon - base.lon) * mLon) / mpp, y: ((q.lat - base.lat) * mLat) / mpp } })
  let min = Infinity
  for (let a = 0; a < px.length; a++) for (let b = a + 1; b < px.length; b++) min = Math.min(min, Math.hypot(px[a].x - px[b].x, px[a].y - px[b].y) / ancho)
  return { n: p.length, min: Math.round(min * 100) / 100 }
}

// Los tres en el mismo punto exacto: nadie encima de nadie (2D y 3D).
out.exacto = {}
for (const [nombre, zoom, tresD] of [['2D z17', 17, false], ['2D z19', 19, false], ['3D z16.5', 16.5, true], ['3D z19', 19, true]]) {
  out.exacto[nombre] = separacion(plan([base, base], base, zoom, tresD), zoom, tresD)
}

// Parados con el GPS bailando ±8 m en cada latido: ¿cuántas veces cambia el reparto (y todos se deslizan y se cruzan)?
function cambiosDelReparto(anclar, zoom, tresD) {
  const anclas = new S.Anclas()
  let antes = null, cambios = 0
  for (let ronda = 0; ronda < 20; ronda += 1) {
    const fix = [mover(base, 8), mover(base, 8)]
    const yo = mover(base, 8)
    const otros = anclar ? fix.map((p, i) => anclas.fijar('PRUEBA0' + (i + 1), p)) : fix
    const propio = anclar ? anclas.fijar('yo', yo, 8) : yo
    const ahora = JSON.stringify(plan(otros, propio, zoom, tresD).map((el) => { const q = m.conCorro(el, el.corro); return [el.clave, q.lat.toFixed(7), q.lon.toFixed(7)] }))
    if (antes !== null && ahora !== antes) cambios += 1
    antes = ahora
  }
  return cambios
}
out.temblor = {
  crudo2D: cambiosDelReparto(false, 19, false),
  anclado2D: cambiosDelReparto(true, 19, false),
  crudo3D: cambiosDelReparto(false, 19, true),
  anclado3D: cambiosDelReparto(true, 19, true),
}
// Andando sí se mueve: un fix a 30 m mueve el ancla.
{
  const a = new S.Anclas()
  a.fijar('x', base, 8)
  const lejos = { lat: base.lat + 30 / mLat, lon: base.lon }
  out.andar = a.fijar('x', lejos, 8).lat === lejos.lat
}
// 11/11: andar SEGUIDO (1,4 m por fix, precisión 8 m): el ancla echa a andar y luego va pegada al fix (antes se quedaba
// hasta 2 × ruido por detrás y saltaba). Y al parar (el GPS vuelve a bailar), el ancla se queda quieta.
{
  const a = new S.Anclas()
  a.fijar('x', base, 8)
  const retrasos = []
  let fix = base
  for (let i = 1; i <= 40; i += 1) {
    fix = { lat: base.lat + (i * 1.4) / mLat, lon: base.lon + (Math.sin(i) * 0.4) / mLon }
    const an = a.fijar('x', fix, 8)
    retrasos.push(Math.hypot((an.lat - fix.lat) * mLat, (an.lon - fix.lon) * mLon))
  }
  const fin = fix
  let movidas = 0
  let antes = a.fijar('x', fin, 8)
  for (let i = 0; i < 20; i += 1) {
    const an = a.fijar('x', mover(fin, 6), 8)
    if (an.lat !== antes.lat || an.lon !== antes.lon) movidas += 1
    antes = an
  }
  out.andarSeguido = {
    arranque: Math.round(Math.max(...retrasos.slice(0, 15)) * 10) / 10,
    enMarcha: Math.round(Math.max(...retrasos.slice(15)) * 10) / 10,
    movidasAlParar: movidas,
  }
}
// 11/11: con el GPS bailando y las anclas, ningún reparto deja a nadie encima de nadie (0 solapes en todas las rondas).
{
  out.solapesBailando = {}
  for (const [nombre, zoom, tresD] of [['2D z17', 17, false], ['2D z19', 19, false], ['3D z16.5', 16.5, true], ['3D z19', 19, true]]) {
    const anclas = new S.Anclas()
    let malos = 0
    for (let ronda = 0; ronda < 30; ronda += 1) {
      const otros = [mover(base, 8), mover(base, 8), mover(base, 8)].map((q, i) => anclas.fijar('PRUEBA0' + (i + 1), q))
      const propio = anclas.fijar('yo', mover(base, 8), 8)
      const r = separacion(plan(otros, propio, zoom, tresD), zoom, tresD)
      if (r.n !== 4 || r.min < 0.9) malos += 1
    }
    out.solapesBailando[nombre] = malos
  }
}
// El mismo fix pedido dos veces (lo piden tu punto y el reparto) da la misma ancla: si no, se dibujaba en un sitio y se
// repartía con otro (solape fijo).
{
  const a = new S.Anclas()
  a.fijar('yo', base, 8)
  const fuera = { lat: base.lat + 11 / mLat, lon: base.lon }
  const r1 = a.fijar('yo', fuera, 8), r2 = a.fijar('yo', fuera, 8), r3 = a.fijar('yo', fuera, 8)
  out.idempotente = r1.lat === r2.lat && r2.lat === r3.lat && r1.lat === base.lat
}
process.stdout.write(JSON.stringify(out))
