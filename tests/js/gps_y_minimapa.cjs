// 22/11 «GPS y minimapa»: trazas de GPS simuladas contra el filtro (hooks/gpsDecisiones.ts) y las reglas del radio
// (gps/decisiones.ts). Salida: JSON con lo medido; las cuentas las comprueba tests/test_gps_y_minimapa.py.
'use strict'
const { crearCargador } = require('./cargarTs.cjs')

const cargar = crearCargador({ Math, Number, Date, Map, Set, JSON, Object, Array, String, Infinity, NaN })
const g = cargar('src/player/hooks/gpsDecisiones.ts')
const d = cargar('src/player/gps/decisiones.ts')
const ms = cargar('src/player/avatares/movimientoSuave.ts')

// Ruido reproducible (sin Math.random): LCG + Box-Muller.
let semilla = 22112026
function azar() {
  semilla = (semilla * 1664525 + 1013904223) % 4294967296
  return semilla / 4294967296
}
function normal() {
  return Math.sqrt(-2 * Math.log(azar() + 1e-12)) * Math.cos(2 * Math.PI * azar())
}
const BASE = { lat: 42.16, lon: -8.52 }
const M_LAT = 1 / 111320
const M_LON = 1 / (111320 * Math.cos((BASE.lat * Math.PI) / 180))
const punto = (este, norte) => ({ lat: BASE.lat + norte * M_LAT, lon: BASE.lon + este * M_LON })
const ruido = (p, sigma) => ({ lat: p.lat + normal() * sigma * M_LAT, lon: p.lon + normal() * sigma * M_LON })
const r1 = (x) => Math.round(x * 10) / 10

/** Pasa una traza por el filtro: cuántas lecturas cambian el punto publicado y dónde queda. */
function pasar(lecturas) {
  const f = new g.FiltroGps()
  let ultimo = null
  let cambios = 0
  let descartadas = 0
  const publicados = []
  for (const l of lecturas) {
    const p = f.leer(l)
    if (!p) {
      descartadas += 1
      publicados.push(ultimo)
      continue
    }
    if (ultimo && ms.distanciaM(ultimo, p) >= 0.05) cambios += 1
    ultimo = p
    publicados.push(p)
  }
  return { cambios, descartadas, ultimo, publicados }
}

const out = {}

// 1 · Quieto 2 min con ruido de ±6 m (precisión declarada 8 m), 1 lectura por segundo.
{
  const quieto = punto(0, 0)
  const lecturas = []
  for (let i = 0; i < 120; i++) lecturas.push({ ...ruido(quieto, 4), precision: 8, t: 1_000_000 + i * 1000 })
  const crudo = lecturas.filter((l, i) => i > 0 && ms.distanciaM(l, lecturas[i - 1]) >= 2).length
  const r = pasar(lecturas)
  out.quieto = { crudo, cambios: r.cambios, errorFinal: r1(ms.distanciaM(r.ultimo, quieto)) }
}

// 2 · Andando a 1,4 m/s hacia el este 2 min, ruido ±2 m (precisión 6 m): el punto sigue sin quedarse atrás.
{
  const lecturas = []
  for (let i = 0; i < 120; i++) lecturas.push({ ...ruido(punto(1.4 * i, 0), 2), precision: 6, t: 2_000_000 + i * 1000 })
  const r = pasar(lecturas)
  // Retraso a lo largo del camino (m al oeste de donde estás de verdad), medio y peor, desde el décimo segundo.
  const retrasos = []
  for (let i = 10; i < 120; i++) retrasos.push(1.4 * i - (r.publicados[i].lon - BASE.lon) / M_LON)
  out.andando = {
    cambios: r.cambios,
    descartadas: r.descartadas,
    retrasoMedio: r1(retrasos.reduce((s, x) => s + x, 0) / retrasos.length),
    peorRetraso: r1(Math.max(...retrasos)),
  }
}

// 3 · Un rebote suelto a 3 km (con «precisión» de 15 m) en mitad de un paseo: no se publica; el paseo sigue.
{
  const lecturas = []
  for (let i = 0; i < 30; i++) lecturas.push({ ...punto(1.4 * i, 0), precision: 6, t: 3_000_000 + i * 1000 })
  lecturas.push({ ...punto(3000, 0), precision: 15, t: 3_030_000 })
  for (let i = 31; i < 40; i++) lecturas.push({ ...punto(1.4 * i, 0), precision: 6, t: 3_000_000 + i * 1000 })
  const r = pasar(lecturas)
  out.rebote = { descartadas: r.descartadas, alFinal: r1(ms.distanciaM(r.ultimo, punto(1.4 * 39, 0))) }
}

// 4 · Un salto de verdad (la primera lectura era de antena; luego el satélite, 2 km más allá): a la segunda se acepta.
{
  const lejos = punto(2000, 0)
  const r = pasar([
    { ...punto(0, 0), precision: 20, t: 4_000_000 },
    { ...lejos, precision: 10, t: 4_002_000 },
    { ...ruido(lejos, 2), precision: 10, t: 4_003_000 },
    { ...ruido(lejos, 2), precision: 10, t: 4_004_000 },
  ])
  out.saltoReal = { descartadas: r.descartadas, alFinal: r1(ms.distanciaM(r.ultimo, lejos)) }
}

// 5 · Lectura atrasada (la de caché de un rearranque, de hace 8 s, llega después): no hace volver atrás el punto.
{
  const r = pasar([
    { ...punto(0, 0), precision: 6, t: 5_000_000 },
    { ...punto(40, 0), precision: 6, t: 5_030_000 },
    { ...punto(30, 0), precision: 6, t: 5_022_000 },
  ])
  out.atrasada = { descartadas: r.descartadas, alFinal: r1(ms.distanciaM(r.ultimo, punto(40, 0))) }
  // Una hora «antes» no es caché: el reloj del móvil cambió. Se acepta (si no, el GPS quedaría mudo para siempre).
  const reloj = pasar([
    { ...punto(0, 0), precision: 6, t: 9_000_000 },
    { ...punto(0, 0), precision: 6, t: 9_000_000 - 3_600_000 },
  ])
  out.relojAtras = reloj.descartadas
}

// 6 · Pérdida y vuelta: 5 min sin GPS (túnel de árboles, segundo plano) y reaparece 300 m más allá.
{
  const r = pasar([
    { ...punto(0, 0), precision: 8, t: 6_000_000 },
    { ...punto(300, 0), precision: 25, t: 6_300_000 },
    { ...punto(301, 0), precision: 12, t: 6_301_000 },
  ])
  out.perdida = { descartadas: r.descartadas, alFinal: r1(ms.distanciaM(r.ultimo, punto(301, 0))) }
}

// 7 · Parado en el borde de un nodo de 50 m (precisión 5 m, la distancia baila 50-60 m): sin histéresis el nodo se
// abre y se cierra; con ella, una vez dentro no sale hasta pasar de 50 + 5 + 10.
{
  const distancias = []
  for (let i = 0; i < 60; i++) distancias.push(55 + normal() * 3)
  let antes = false
  let sinH = 0
  let conH = 0
  let dentro = false
  for (const m of distancias) {
    const crudo = d.estaDentro(m, 50, 5)
    if (crudo !== antes) sinH += 1
    antes = crudo
    const nuevo = d.sigueDentro(m, 50, 5, dentro)
    if (nuevo !== dentro) conH += 1
    dentro = nuevo
  }
  out.borde = {
    sinH,
    conH,
    sale: d.sigueDentro(50 + 5 + d.HISTERESIS_DEL_RADIO_M + 0.5, 50, 5, true),
    noEntraDeMas: d.sigueDentro(56, 50, 5, false),
    margenMaximo: 35 + d.HISTERESIS_DEL_RADIO_M,
  }
}

// 8 · Respaldo para abrir: una de satélite regular sí; una de antena no.
out.respaldo = [d.precisionValeDeRespaldo(60), d.precisionValeDeRespaldo(150), d.precisionValeDeRespaldo(1500), d.precisionValeDeRespaldo(null)]

// 9 · La hora de la lectura: del futuro no; la de caché, la suya; sin hora, ahora.
out.hora = [g.horaDeLaLectura(10_000, 5_000), g.horaDeLaLectura(4_000, 5_000), g.horaDeLaLectura(undefined, 5_000), g.horaDeLaLectura(NaN, 5_000)]

console.log(JSON.stringify(out))
