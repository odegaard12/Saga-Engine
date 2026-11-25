// 24/11/2026: GPS propio estable y sin saltos con poca cobertura. `SuavizadoPropio` (movimientoSuave.ts: dónde se dibuja TU muñeco
// sobre las lecturas crudas aceptadas, sin tocar FiltroGps del juego) y la puesta al día de los compañeros tras un corte
// (`alcanceTrasPausa`: se deslizan, no se funden). Lo comprueba tests/test_mapa_estable_24_11.py.
'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')

const ent = crearEntorno()
const S = ent.cargar('src/player/avatares/movimientoSuave.ts')
const F = ent.cargar('src/player/posicion/fuentePosicion.ts')
const base = { lat: 42.66, lon: -8.69 }
const mLat = 111320
const mLon = 111320 * Math.cos((base.lat * Math.PI) / 180)
const en = (e, n) => ({ lat: base.lat + n / mLat, lon: base.lon + e / mLon })
const aM = (p) => ({ e: (p.lon - base.lon) * mLon, n: (p.lat - base.lat) * mLat })
const r2 = (x) => Math.round(x * 100) / 100
let semilla = 2411
const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648)
const disco = (r) => { const a = azar() * 2 * Math.PI, d = Math.sqrt(azar()) * r; return { e: Math.cos(a) * d, n: Math.sin(a) * d } }
const out = {}

// ---- 1. Tú parado 120 s con ±8 m de ruido blanco (un fix por segundo): tu muñeco no se mueve ni un paso.
{
  const s = new S.SuavizadoPropio()
  let primero = null, movidas = 0, maxM = 0
  for (let t = 0; t <= 120000; t += 1000) {
    const r = disco(8)
    const o = s.poner(en(r.e, r.n), t, 8)
    if (!primero) primero = o
    const d = Math.hypot(aM(o).e - aM(primero).e, aM(o).n - aM(primero).n)
    if (d > 0.01) movidas += 1
    maxM = Math.max(maxM, d)
  }
  out.quieto = { movidas, maxM: r2(maxM), velocidad: s.velocidad() }
}

// ---- 2. Andando 1,3 m/s con ±3 y ±8 m de ruido: sigue el camino sin pararse y, ya andando, a pocos metros de la verdad.
function andar(ruido) {
  const s = new S.SuavizadoPropio()
  let paradas = 0, quietoPrev = null, lagMax = 0
  for (let t = 0; t <= 120000; t += 1000) {
    const x = Math.max(0, t / 1000 - 10) * 1.3
    const r = disco(ruido)
    const o = aM(s.poner(en(x + r.e, r.n), t, ruido))
    const parado = s.velocidad() === 0
    if (t > 30000) {
      if (parado && quietoPrev === false) paradas += 1
      lagMax = Math.max(lagMax, Math.hypot(o.e - x, o.n))
    }
    quietoPrev = parado
  }
  return { paradas, lagMaxM: r2(lagMax), velocidad: r2(s.velocidad()) }
}
out.andar3 = andar(3)
out.andar8 = andar(8)

// ---- 3. Modo prueba (precisión <= 2 m): pasa tal cual.
{
  const s = new S.SuavizadoPropio()
  s.poner(en(0, 0), 0, 0.1)
  const o = s.poner(en(30, 0), 1000, 0.1)
  out.prueba = r2(aM(o).e)
}

// ---- 4. 15 compañeros andando (latido 30 s) que se quedan sin señal 2-5 min a la vez y vuelven: ningún fundido, se ponen al
// día deslizándose sin pasar de ~5 m/s, y su clip no corre por ponerse al día.
{
  const fu = new F.FuentePosicion()
  const gente = Array.from({ length: 15 }, (_, i) => ({ id: 'A' + i, a: azar() * 2 * Math.PI, v: 0.8 + azar() * 1.2, corte: 120 + 30 * (4 + Math.floor(azar() * 7)), proximo: Math.floor(azar() * 30000), prev: null }))
  let fundidos = 0, vMax = 0, clipMax = 0
  for (let t = 0; t <= 600000; t += 100) {
    const s = t / 1000
    for (const g of gente) {
      if (t >= g.proximo) {
        g.proximo += 30000
        if (!(s >= 120 && s < g.corte)) {
          const d = s * g.v
          fu.fijar(g.id, 'jugador', en(Math.cos(g.a) * d, Math.sin(g.a) * d), t)
        }
      }
      if (t % 1000 === 0 && g.ultimo) fu.fijar(g.id, 'jugador', g.ultimo, t)
    }
    let f = 0
    for (const g of gente) {
      if (fu.desvanecer(g.id, t) < 1) f += 1
      const p = fu.real(g.id, t)
      if (g.prev && p) { const v = F.metrosEntre(g.prev, p) / 0.1; if (v < 50) vMax = Math.max(vMax, v) }
      g.prev = p
      const c = fu.velocidadReal(g.id, t)
      if (typeof c === 'number') clipMax = Math.max(clipMax, c)
    }
    fundidos = Math.max(fundidos, f)
  }
  // Y lo que a pie no se hace, sí se funde: 300 m en 30 s.
  const fu2 = new F.FuentePosicion()
  fu2.fijar('X', 'jugador', en(0, 0), 0)
  fu2.fijar('X', 'jugador', en(300, 0), 30000)
  out.corte = { fundidosALaVez: fundidos, velDibujoMax: r2(vMax), clipMax: r2(clipMax), imposibleSeFunde: fu2.desvanecer('X', 30000) }
}

process.stdout.write(JSON.stringify(out))
