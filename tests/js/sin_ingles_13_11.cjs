// 13/11: sin inglés. Un `en` guardado (localStorage o perfil) cae a `es` sin error. Salida: JSON con los casos.
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const RAIZ = path.resolve(__dirname, '..', '..')
const ts = require(path.join(RAIZ, 'frontend', 'node_modules', 'typescript'))

function cargar(ruta, ctx) {
  const js = ts.transpileModule(fs.readFileSync(path.join(RAIZ, 'frontend', 'src', ruta), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const m = { exports: {} }
  vm.runInNewContext(js, { module: m, exports: m.exports, require: ctx.require || (() => ({})), ...ctx })
  return m.exports
}

// Un `window` mínimo con localStorage y eventos.
function ventana(guardado) {
  const almacen = new Map(Object.entries(guardado))
  const eventos = []
  return {
    almacen,
    eventos,
    window: {
      localStorage: {
        getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
        setItem: (k, v) => almacen.set(k, String(v)),
        removeItem: (k) => almacen.delete(k),
      },
      dispatchEvent: (e) => eventos.push(e.detail),
    },
  }
}

const salida = {}
for (const [nombre, guardado] of [['en', { saga_locale: 'en' }], ['gl', { saga_locale: 'gl' }], ['vacio', {}]]) {
  const v = ventana(guardado)
  const i18n = cargar('i18n/index.ts', { window: v.window, CustomEvent: class { constructor(t, o) { this.detail = o && o.detail } } })
  salida[nombre] = {
    locale: i18n.getLocale(),
    isLocale: ['es', 'gl', 'en', null].map((x) => i18n.isLocale(x)),
    guardadoDespues: v.almacen.has('saga_locale') ? v.almacen.get('saga_locale') : null,
    traduce: i18n.t('common.save', i18n.getLocale()),
    sinLlaveEn: Object.keys(i18n.messages),
  }
}
// La misión no puede imponer `en`.
{
  const v = ventana({})
  const i18n = cargar('i18n/index.ts', { window: v.window, CustomEvent: class { constructor(t, o) { this.detail = o && o.detail } } })
  i18n.adoptarIdiomaDeLaMision('en')
  salida.misionEn = { locale: i18n.getLocale(), avisos: v.eventos.length }
  i18n.adoptarIdiomaDeLaMision('gl')
  salida.misionGl = { locale: i18n.getLocale() }
}
console.log(JSON.stringify(salida))
