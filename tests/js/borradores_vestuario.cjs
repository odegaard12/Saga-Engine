// Panel de desbloqueables: qué borradores se tiran al recargar tras un guardado.
// Transpila vestuarioComun.ts con el `typescript` de frontend/node_modules (mismo
// método que admin_frontend.cjs) y vuelca un JSON para
// tests/test_borradores_vestuario_js.py.
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const RAIZ = path.resolve(__dirname, '..', '..')
const ts = require(path.join(RAIZ, 'frontend', 'node_modules', 'typescript'))
const fichero = path.join(RAIZ, 'frontend/src/admin/components/vestuario/vestuarioComun.ts')
const js = ts.transpileModule(fs.readFileSync(fichero, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: 'ES2020' },
}).outputText
const mod = { exports: {} }
new vm.Script('(function (module, exports, require) {' + js + '\n})').runInNewContext({})(mod, mod.exports, () => ({}))
const V = mod.exports

process.stdout.write(
  JSON.stringify({
    catalogo: V.seccionesGuardadas({ revision: 3, bloqueados: ['item:casco'] }),
    reglas: V.seccionesGuardadas({ revision: 3, reglas: [], aplicar_a_lo_jugado: true }),
    estrellas: V.seccionesGuardadas({ revision: 3, estrellas: { por_nodo: 1, precios: {} } }),
    interruptor: V.seccionesGuardadas({ revision: 3, activos: true }),
    recargaSola: V.seccionesGuardadas(undefined),
  })
)
