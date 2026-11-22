// Cargador común de módulos TS del frontend para las pruebas .cjs.
//
// Transpila al vuelo con el `typescript` de frontend/node_modules (una vez por
// fichero) y ejecuta el resultado en un contexto de `vm`, resolviendo los
// imports relativos (.ts, .tsx, .json, index.ts, `?raw`, .css vacío). Los
// imports no relativos (react...) los decide `externo` (por defecto, {}).
//
//   const { crearCargador } = require('./cargarTs.cjs')
//   const cargar = crearCargador({ Math, Date })        // globales del contexto
//   const m = cargar('src/player/offline/missionPack.ts') // relativo a frontend/
//
// Cada `crearCargador` es un mundo nuevo (contexto y caché de módulos propios).
'use strict'

const fs = require('fs')
const path = require('path')
const vm = require('vm')

const RAIZ = path.resolve(__dirname, '..', '..')
const FRONT = path.join(RAIZ, 'frontend')
const SRC = path.join(FRONT, 'src')
const ts = require(path.join(FRONT, 'node_modules', 'typescript'))

const JS_DE = new Map()

function transpilar(fichero) {
  if (!JS_DE.has(fichero)) {
    const opciones = { module: ts.ModuleKind.CommonJS, target: 'ES2020', esModuleInterop: true, jsx: 'react-jsx' }
    JS_DE.set(fichero, ts.transpileModule(fs.readFileSync(fichero, 'utf8'), { compilerOptions: opciones }).outputText)
  }
  return JS_DE.get(fichero)
}

function resolver(desde, spec) {
  const base = path.resolve(path.dirname(desde), spec)
  for (const c of [base, base + '.ts', base + '.tsx', base + '.json', path.join(base, 'index.ts')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c
  }
  throw new Error('no resuelve ' + spec + ' desde ' + desde)
}

/**
 * @param globales contexto de vm ya creado, u objeto con los globales del contexto nuevo
 * @param opciones.externo (spec, desde) => exports de un import no relativo
 * @returns cargar(ruta): ruta absoluta o relativa a frontend/
 */
function crearCargador(globales = {}, { externo = () => ({}) } = {}) {
  const contexto = vm.isContext(globales) ? globales : vm.createContext(globales)
  const modulos = new Map()

  function cargarFichero(fichero) {
    if (modulos.has(fichero)) return modulos.get(fichero).exports
    const mod = { exports: {} }
    modulos.set(fichero, mod)
    if (fichero.endsWith('.css')) return mod.exports
    if (fichero.endsWith('.json')) {
      mod.exports = JSON.parse(fs.readFileSync(fichero, 'utf8'))
      return mod.exports
    }
    const envoltura = vm.runInContext('(function (module, exports, require) {' + transpilar(fichero) + '\n})', contexto, {
      filename: fichero,
    })
    const req = (spec) => {
      // `import x from './f.svg?raw'` (Vite): el texto del fichero.
      if (spec.startsWith('.') && spec.endsWith('?raw'))
        return { __esModule: true, default: fs.readFileSync(path.resolve(path.dirname(fichero), spec.slice(0, -4)), 'utf8') }
      if (spec.startsWith('.')) return cargarFichero(resolver(fichero, spec))
      return externo(spec, fichero)
    }
    envoltura(mod, mod.exports, req)
    return mod.exports
  }

  const cargar = (ruta) => cargarFichero(path.isAbsolute(ruta) ? ruta : path.join(FRONT, ruta))
  cargar.contexto = contexto
  return cargar
}

module.exports = { crearCargador, transpilar, resolver, RAIZ, FRONT, SRC }
