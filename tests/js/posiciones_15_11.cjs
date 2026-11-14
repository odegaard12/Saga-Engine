// Posiciones 15/11: la regla de saltar latidos sin cobertura (frontend/src/player/offline/saltoDeLatido.ts).
// Salida: JSON con los casos. Se compara con la regla de ANTES (ventana de 45 s tras un fallo, uno de cada cuatro).
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const RAIZ = path.resolve(__dirname, '..', '..')
const ts = require(path.join(RAIZ, 'frontend', 'node_modules', 'typescript'))

function cargarTs(rel) {
  const js = ts.transpileModule(fs.readFileSync(path.join(RAIZ, 'frontend', 'src', rel), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const m = { exports: {} }
  vm.runInNewContext(js, { module: m, exports: m.exports })
  return m.exports
}
const { debeSaltarLatido, REINTENTO_MIN_MS } = cargarTs('player/offline/saltoDeLatido.ts')

const salida = { reintentoMinMs: REINTENTO_MIN_MS }
const base = { sinInterfaz: false, latidosSinInterfaz: 0, fallosSeguidos: 0, ahora: 100_000, ultimoIntento: 70_000 }
salida.unFalloNoSalta = debeSaltarLatido({ ...base, fallosSeguidos: 1 })
salida.dosFallosSaltaAl30 = debeSaltarLatido({ ...base, fallosSeguidos: 2 }) // ultimo intento hace 30 s
salida.dosFallosReintentaAl60 = debeSaltarLatido({ ...base, fallosSeguidos: 2, ultimoIntento: 40_000 }) // hace 60 s
salida.sinFallosNoSalta = debeSaltarLatido(base)
salida.avion = [1, 2, 3, 4, 5, 8].map((n) => debeSaltarLatido({ ...base, sinInterfaz: true, latidosSinInterfaz: n }))
// Con el intervalo de 60 s (ahorro) un fallo muerto reintenta en cada vuelta: 60 s >= 55 s.
salida.intervalo60 = debeSaltarLatido({ ...base, fallosSeguidos: 5, ultimoIntento: 40_000 })

// Simulación: latidos cada 30 s, 30 % de pérdida independiente (semilla fija). Cuántos llegan con la regla de antes y con la nueva.
function sembrar(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
function simular(regla, perdida, ticks, seed) {
  const rnd = sembrar(seed)
  let t = 0, ultimoFallo = 0, ultimoExito = 0, latidosSinRed = 0, fallosSeguidos = 0, ultimoIntento = 0, ok = 0, intentos = 0
  for (let i = 0; i < ticks; i++) {
    t += 30_000
    if (regla === 'antes') {
      const sin = ultimoFallo > ultimoExito && t - ultimoFallo < 45_000
      latidosSinRed = sin ? latidosSinRed + 1 : 0
      if (latidosSinRed % 4 !== 0) continue
    } else {
      if (debeSaltarLatido({ sinInterfaz: false, latidosSinInterfaz: 0, fallosSeguidos, ahora: t, ultimoIntento })) continue
      ultimoIntento = t
    }
    intentos++
    if (rnd() < perdida) { ultimoFallo = t; fallosSeguidos++ } else { ultimoExito = t; fallosSeguidos = 0; ok++ }
  }
  return { ok, intentos }
}
salida.sim = {}
for (const p of [0, 0.3, 0.9]) salida.sim['p' + p] = { antes: simular('antes', p, 2000, 7), ahora: simular('ahora', p, 2000, 7) }
console.log(JSON.stringify(salida))
