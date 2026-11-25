// 24/11/2026 (Óscar: «que los jugadores se muevan con sentido: si alguien se mueve 5 o 10 m, que no se ponga a correr»).
// La lógica pura del movimiento, en Node y sin mapa: el clip (lodAvatares.ts `elegirMarcha`/`pasoDeMarcha`), la velocidad por
// ventana y el deslizamiento de los compañeros (fuentePosicion.ts `OPCIONES_COMPANERO`, movimientoSuave.ts `Deslizador`).
// Lo comprueba tests/test_movimiento_24_11.py. Medido en el navegador con el motor de verdad: scratchpad movimiento (banco).
'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')

const ent = crearEntorno()
const L = ent.cargar('src/player/avatares3d/mixamo/lodAvatares.ts')
const F = ent.cargar('src/player/posicion/fuentePosicion.ts')
const base = { lat: 42.66, lon: -8.69 }
const mLat = 111320
const mLon = 111320 * Math.cos((base.lat * Math.PI) / 180)
const en = (e, n) => ({ lat: base.lat + n / mLat, lon: base.lon + e / mLon })
const r2 = (x) => Math.round(x * 100) / 100
const out = {}

// ---- 1. El clip por la velocidad real: una secuencia de velocidades cada 100 ms -> marchas y cuándo cambian.
function secuencia(vs, reducido = false) {
  const s = { marcha: 'quieto', rapidaDesde: NaN }
  const marchas = []
  vs.forEach((v, i) => marchas.push(L.elegirMarcha(s, v, i * 100, reducido)))
  return marchas
}
const repetir = (v, segundos) => Array.from({ length: Math.round(segundos * 10) }, () => v)
{
  const andar = secuencia(repetir(1.3, 20))
  const correr = secuencia([...repetir(3, 10), ...repetir(2.2, 5), ...repetir(1.9, 2), ...repetir(0, 1)])
  const primera = correr.indexOf('correr')
  // Un tramo corto a 3,2 m/s (el que se pone al día: 10 m en 3 s) no es correr.
  const ponerseAlDia = secuencia([...repetir(0, 1), ...repetir(3.2, 3.1), ...repetir(0, 2)])
  // Bailando entre 2,4 y 2,6 m/s cada medio segundo: nunca sostenido, nunca corre.
  const baile = secuencia(Array.from({ length: 200 }, (_, i) => (Math.floor(i / 5) % 2 ? 2.6 : 2.4)))
  const cambios = (xs) => xs.reduce((n, x, i) => n + (i && x !== xs[i - 1] ? 1 : 0), 0)
  out.marcha = {
    andar: [...new Set(andar)],
    primeraCorridaS: primera / 10,
    sigueCorriendoA22: correr[140],
    dejaDeCorrerA19: correr[160],
    quietoA0: correr[correr.length - 1],
    cambiosCorrer: cambios(correr),
    ponerseAlDia: [...new Set(ponerseAlDia)],
    baile: [...new Set(baile)],
    reducido: [...new Set(secuencia(repetir(3, 20), true))],
  }
  out.paso = {
    quieto: L.pasoDeMarcha('quieto', 1, 17),
    andarLento: r2(L.pasoDeMarcha('andar', 0.6, 17)),
    andarDeCercaRapido: r2(L.pasoDeMarcha('andar', 3.2, 1)),
    correrDeLejos: r2(L.pasoDeMarcha('correr', 3, 17)),
    correrDeCerca: r2(L.pasoDeMarcha('correr', 4, 1)),
  }
}

// ---- 2. La ventana: a 0,6 m/s anda (antes hacía falta 0,9 y patinaba quieto); a 0,2 m/s, quieto.
{
  const v = (mps) => {
    const ms = []
    for (let t = 0; t <= 3000; t += 100) L.anadirMuestra(ms, { t, x: (t / 1000) * mps, y: 0 })
    return r2(L.velocidadPorVentana(ms, 3000))
  }
  out.ventana = { a06: v(0.6), a02: v(0.2), a13: v(1.3) }
}

// ---- 3. Un compañero: quieto 150 s (el mapa le repite el fix cada segundo) y luego se mueve. La velocidad máxima de su
// punto (fotogramas de 100 ms) y cuándo llega.
function compa(pasos, hasta = 400000) {
  const fu = new F.FuentePosicion()
  let i = 0
  let ultimo = null
  let prev = null
  let vMax = 0
  let fundido = 1
  const llegadas = []
  for (let t = 0; t <= hasta; t += 100) {
    while (i < pasos.length && pasos[i].t <= t) {
      ultimo = pasos[i]
      llegadas.push(null)
      i += 1
    }
    if (ultimo && t % 1000 === 0) fu.fijar('C', 'jugador', ultimo.p, t)
    const p = fu.real('C', t)
    if (prev && p) {
      const v = F.metrosEntre(prev, p) / 0.1
      if (v < 50) vMax = Math.max(vMax, v)
    }
    if (p && ultimo && llegadas[llegadas.length - 1] === null && F.metrosEntre(p, ultimo.p) < 0.05) llegadas[llegadas.length - 1] = (t - ultimo.t) / 1000
    fundido = Math.min(fundido, fu.desvanecer('C', t))
    prev = p
  }
  return { vMax: r2(vMax), llegaEnS: llegadas[llegadas.length - 1], fundido: r2(fundido) }
}
{
  const quieto = [{ t: 0, p: en(0, 0) }]
  out.compa = {
    // 39 m (andaba 1,3 m/s) tras 150 s quieto: antes 3,2 m/s en 12 s.
    m39: compa([...quieto, { t: 150000, p: en(39, 0) }]),
    // Latido de 90 s y 30 m por latido (0,33 m/s): anda despacio (0,6 m/s) en vez de patinar quieto 89 s.
    lento: compa([...quieto, { t: 90000, p: en(30, 0) }, { t: 180000, p: en(60, 0) }]),
    // 200 m en 30 s: a pie no se llega -> fundido, sin deslizar.
    m200: compa([...quieto, { t: 30000, p: en(200, 0) }]),
    // Corriendo 3 m/s con latido de 60 s: 180 m, se desliza (no es teleport).
    m180: compa([...quieto, { t: 30000, p: en(0, 30) }, { t: 90000, p: en(180, 30) }]),
    // 10 min sin señal y 300 m: fundido.
    offline: compa([...quieto, { t: 30000, p: en(0, 30) }, { t: 630000, p: en(300, 30) }], 700000),
  }
}

// ---- 4. Andando, un fix suelto que retrocede (ruido) no para el ancla; dos seguidos, sí. El mismo fix repetido no cuenta.
{
  const S = ent.cargar('src/player/avatares/movimientoSuave.ts')
  const andar = (pasosE) => {
    const an = new S.Anclas()
    an.fijar('A', en(0, 0), 5)
    an.fijar('A', en(12, 0), 5) // sale del ruido (>= 2 × 5 m): echa a andar
    let a = null
    for (const e of pasosE) {
      a = an.fijar('A', en(e, 0), 5)
      an.fijar('A', en(e, 0), 5) // el mapa repite el mismo fix
    }
    return r2((a.lon - base.lon) * mLon)
  }
  out.anclas = { unoAtras: andar([13.5, 13, 14.6, 16]), dosAtras: andar([13.5, 13, 12.8, 16]) }
}

process.stdout.write(JSON.stringify(out))
