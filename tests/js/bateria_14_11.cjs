// 14/11 (batería): `cadaMientrasVisible` con un reloj y un `document` falsos. Salida: JSON con los casos.
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const RAIZ = path.resolve(__dirname, '..', '..')
const ts = require(path.join(RAIZ, 'frontend', 'node_modules', 'typescript'))
const abs = path.join(RAIZ, 'frontend', 'src', 'shared', 'cadaMientrasVisible.ts')
const js = ts.transpileModule(fs.readFileSync(abs, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText

function entorno() {
  const intervalos = new Map()
  let n = 0
  const oyentes = []
  const document = {
    visibilityState: 'visible',
    addEventListener: (t, f) => oyentes.push([t, f]),
    removeEventListener: (t, f) => { const i = oyentes.findIndex((o) => o[0] === t && o[1] === f); if (i >= 0) oyentes.splice(i, 1) },
  }
  const window = {
    setInterval: (f) => { n += 1; intervalos.set(n, f); return n },
    clearInterval: (id) => intervalos.delete(id),
  }
  const m = { exports: {} }
  vm.runInNewContext(js, { module: m, exports: m.exports, window, document })
  const cambiar = (v) => { document.visibilityState = v; for (const [t, f] of [...oyentes]) if (t === 'visibilitychange') f() }
  return { cada: m.exports.cadaMientrasVisible, intervalos, oyentes, cambiar, tic: () => { for (const f of [...intervalos.values()]) f() } }
}

const salida = {}
{ // visible: corre; oculta: se para; al volver: se pone al día y sigue
  const e = entorno(); let llamadas = 0
  const parar = e.cada(() => { llamadas += 1 }, 5000)
  e.tic()
  const activoVisible = e.intervalos.size
  e.cambiar('hidden')
  const activoOculto = e.intervalos.size
  e.cambiar('visible')
  salida.visible = { activoVisible, activoOculto, alVolverLlamo: llamadas === 2, activoAlVolver: e.intervalos.size }
  parar()
  salida.limpia = { intervalos: e.intervalos.size, oyentes: e.oyentes.length }
}
{ // arrancar con la pantalla oculta no crea el intervalo hasta volver
  const e = entorno(); e.cambiar('hidden')
  const parar = e.cada(() => {}, 1000)
  const antes = e.intervalos.size
  e.cambiar('visible')
  salida.arrancaOculta = { antes, despues: e.intervalos.size }
  parar()
}
console.log(JSON.stringify(salida))
