// Lógica pura de Dinamo (motionChallenge/dinamo.ts) y Faros (bearingHunt/faros.ts). Vuelca un JSON para
// tests/test_dinamo_faros.py.
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const RAIZ = path.resolve(__dirname, '..', '..')
const ts = require(path.join(RAIZ, 'frontend', 'node_modules', 'typescript'))
const cargar = (...rel) => {
  const js = ts.transpileModule(fs.readFileSync(path.join(RAIZ, 'frontend', 'src', 'player', 'minigames', 'families', ...rel), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const modulo = { exports: {} }
  vm.runInNewContext(js, { module: modulo, exports: modulo.exports, Math, Number, String, Array, Object, JSON })
  return modulo.exports
}
const d = cargar('motionChallenge', 'dinamo.ts')
const f = cargar('bearingHunt', 'faros.ts')

// Dinamo: siguiendo el centro de cada fase se termina en fases × segundos; quieto o a lo bestia, nunca.
const fases = d.fasesDinamo(3, 0.5)
const jugar = (ritmo, maxMs) => {
  let e = { fase: 0, carga: 0, enZonaMs: 0 }
  let t = 0
  while (e.fase < fases.length && t < maxMs) {
    e = d.pasoDinamo(e, ritmo(e), 50, fases, 20)
    t += 50
  }
  return { fase: e.fase, t }
}
const bien = jugar((e) => fases[Math.min(e.fase, fases.length - 1)].centro, 600000)
const quieto = jugar(() => 0, 300000)
const bestia = jugar(() => 3, 300000)
// Fuera de zona se pierde poco: 10 s fuera no vacían 10 s dentro.
let e = { fase: 0, carga: 0, enZonaMs: 0 }
for (let i = 0; i < 200; i += 1) e = d.pasoDinamo(e, 1, 50, fases, 20)
const cargaDentro = e.carga
for (let i = 0; i < 200; i += 1) e = d.pasoDinamo(e, 0, 50, fases, 20)

// Faros
const semillas = Array.from({ length: 300 }, (_, i) => `p-${i}:0`)
let separados = true
let lejosDelFrente = true
const distintos = new Set()
for (const n of [3, 4, 5, 6]) {
  for (const s of semillas) {
    const fs_ = f.generarFaros(s, n)
    if (fs_.length !== n) separados = false
    for (const a of fs_) if (Math.abs(f.delta(0, a)) < 40) lejosDelFrente = false
    for (let i = 0; i < fs_.length; i += 1)
      for (let j = i + 1; j < fs_.length; j += 1) if (Math.abs(f.delta(fs_[i], fs_[j])) < 360 / (n + 1)) separados = false
    distintos.add(JSON.stringify(fs_))
  }
}
// Señuelos: lejos de cada faro y entre sí; pistas que se debilitan con cada faro.
let barcosLejos = true
for (const sm of semillas) {
  const fs_ = f.generarFaros(sm, 6)
  const bs = f.generarSenuelos(sm, fs_, 2, 24)
  if (bs.length !== 2) barcosLejos = false
  for (const b of bs) for (const x of [...fs_, ...bs.filter((y) => y !== b)]) if (Math.abs(f.delta(x, b)) < 24) barcosLejos = false
}
console.log(JSON.stringify({
  dinamo: {
    fases: fases.map((x) => x.centro),
    anchos: fases.map((x) => x.ancho),
    bienMs: bien.t, bienFase: bien.fase, quietoFase: quieto.fase, bestiaFase: bestia.fase,
    cargaDentro, cargaTrasFuera: e.carga,
    base: [d.baseCalibrada([]), d.baseCalibrada([0.1, 0.2]), d.baseCalibrada([3, 5])],
  },
  faros: {
    separados, lejosDelFrente, distintos: distintos.size, total: semillas.length * 4,
    mismo: JSON.stringify(f.generarFaros('x', 4)) === JSON.stringify(f.generarFaros('x', 4)),
    temps: [f.temperatura(5, 12), f.temperatura(-30, 12), f.temperatura(70, 12), f.temperatura(170, 12)],
    delta: [f.delta(350, 10), f.delta(10, 350), f.delta(0, 180)],
    cercano: f.masCercano(100, [90, 300], [false, false]),
    cercanoSinPrimero: f.masCercano(100, [90, 300], [true, false]),
    // Móvil vertical (gravedad en y) girando sobre uno mismo = giro en torno a y (gamma); plano (gravedad en z) = alpha.
    barcosLejos,
    debiles: [f.temperatura(18, 12, 0), f.temperatura(18, 12, 1), f.temperatura(60, 12, 0), f.temperatura(60, 12, 1)],
    giro: [f.giroVertical({ alpha: 0, beta: 0, gamma: 30 }, { x: 0, y: 9.8, z: 0 }), f.giroVertical({ alpha: 45, beta: 0, gamma: 0 }, { x: 0, y: 0, z: 9.8 }), f.giroVertical({ alpha: 45 }, { x: 0, y: 0, z: 0 })],
  },
}))
