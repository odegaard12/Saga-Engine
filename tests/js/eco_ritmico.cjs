// Motor del Eco rítmico (frontend/src/player/minigames/families/sequenceCode/eco.ts): rondas y juicio por golpe
// (22/11, punto y raya: cuenta lo que dura el dedo, no el hueco). Vuelca un JSON para tests/test_eco_ritmico.py.
const { crearCargador } = require('./cargarTs.cjs')
const m = crearCargador({ Math })('src/player/minigames/families/sequenceCode/eco.ts')

const r = m.generarRonda('s:r3', 7, 4, 40)
const t620 = m.tiemposDeRonda(620)
const t260 = m.tiemposDeRonda(260)
const t1200 = m.tiemposDeRonda(1200)
// Una ronda conocida: ● punto, ▲ raya, ● punto.
const ronda = { fichas: [0, 1, 0], pulsos: [1, 2, 1] }
const u = t620.umbral
let ultimaLarga = 0
for (let s = 0; s < 200; s++) if (m.generarRonda('x' + s, 5, 4, 40).pulsos[4] === 2) ultimaLarga++
console.log(JSON.stringify({
  igual: JSON.stringify(r) === JSON.stringify(m.generarRonda('s:r3', 7, 4, 40)),
  largo: r.fichas.length,
  rango: r.fichas.every((f) => f >= 0 && f < 4),
  hayLarga: r.pulsos.includes(2),
  sinLargas: m.generarRonda('s:r3', 7, 4, 0).pulsos.includes(2),
  ultimaLarga,
  t620,
  t260,
  t1200,
  // toque normal (120 ms), toque lento de móvil viejo (220 ms), soltar justo al cerrar el aro (umbral - 30), mantener
  toqueNormal: m.esRaya(120, u),
  toqueLento: m.esRaya(220, u),
  alCerrar: m.esRaya(u - 30, u),
  mantener: m.esRaya(u + 200, u),
  puntoBien: m.juzgarGolpe(ronda, 0, 0, 110, u),
  rayaBien: m.juzgarGolpe(ronda, 1, 1, u + 100, u),
  rayaCorta: m.juzgarGolpe(ronda, 1, 1, 110, u),
  puntoLargo: m.juzgarGolpe(ronda, 2, 0, u + 100, u),
  fichaMal: m.juzgarGolpe(ronda, 2, 3, u + 100, u),
}))
