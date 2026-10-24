// Ejecuta en Node apartarDelNodo.ts (módulo puro) con unos casos y vuelca un JSON para tests/test_nodo_cubo_y_apartado.py.
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const RAIZ = path.resolve(__dirname, '..', '..')
const ts = require(path.join(RAIZ, 'frontend', 'node_modules', 'typescript'))
const fuente = path.join(RAIZ, 'frontend', 'src', 'player', 'avatares3d', 'mixamo', 'apartarDelNodo.ts')
const js = ts.transpileModule(fs.readFileSync(fuente, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const m = { exports: {} }
vm.runInNewContext(js, { module: m, exports: m.exports, Math })
const A = m.exports
const poste = { x: 1000, y: 1000 }
const r = (av, rumbo = 0, apartado = false, postes = [poste]) => A.apartarDelPoste(av, postes, rumbo, apartado)
console.log(JSON.stringify({
  constantes: { APARTA_PX: A.APARTA_PX, VUELVE_PX: A.VUELVE_PX, LADO_PX: A.LADO_PX, DELANTE_PX: A.DELANTE_PX },
  encima: r({ x: 1000, y: 1000 }),
  cerca: r({ x: 1020, y: 990 }),
  lejos: r({ x: 1060, y: 1000 }),
  sinPostes: r({ x: 1000, y: 1000 }, 0, false, []),
  // En la franja 40-48 px: no entra si estaba fuera, no sale si ya estaba apartado.
  franjaFuera: r({ x: 1044, y: 1000 }),
  franjaDentro: r({ x: 1044, y: 1000 }, 0, true),
  girado90: r({ x: 1000, y: 1000 }, Math.PI / 2),
  masCercano: r({ x: 1030, y: 1000 }, 0, false, [poste, { x: 1035, y: 1000 }]),
}))
