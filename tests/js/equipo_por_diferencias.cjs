// Fusiona rondas de la tabla de equipo por diferencias (equipoPorDiferencias.ts, módulo puro) y vuelca las tablas
// resultantes para tests/test_latido_por_diferencias.py. Entrada (stdin): {user, rondas: [<team del latido>, ...]}.
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const RAIZ = path.resolve(__dirname, '..', '..')
const ts = require(path.join(RAIZ, 'frontend', 'node_modules', 'typescript'))
const fuente = path.join(RAIZ, 'frontend', 'src', 'player', 'offline', 'equipoPorDiferencias.ts')
const js = ts.transpileModule(fs.readFileSync(fuente, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const m = { exports: {} }
vm.runInNewContext(js, { module: m, exports: m.exports, Map, Array, String, Boolean })
const { esPorDiferencias, fusionarEquipo, conIsSelf } = m.exports
const entrada = JSON.parse(fs.readFileSync(0, 'utf8'))
let estado = null
const tablas = []
const pidenCompleta = []
for (const team of entrada.rondas) {
  if (!esPorDiferencias(team)) {
    tablas.push(team.profiles)
    estado = null
    pidenCompleta.push(false)
    continue
  }
  estado = fusionarEquipo(estado, team)
  pidenCompleta.push(estado === null)
  tablas.push(estado ? conIsSelf(estado.perfiles, team.user || entrada.user) : null)
}
console.log(JSON.stringify({ tablas, pidenCompleta }))
