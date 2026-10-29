// Antitrampas V2 (26/10), ejecutado en Node con un navegador de mentira: la pantalla retenida decide si una salida
// cuenta SIN exigir un toque reciente. Imprime un JSON que comprueba tests/test_antitrampas_v2.py.
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const RAIZ = path.resolve(__dirname, '..', '..')
const FRONT = path.join(RAIZ, 'frontend', 'src')
const ts = require(path.join(RAIZ, 'frontend', 'node_modules', 'typescript'))

function resolver(desde, spec) {
  const base = path.resolve(path.dirname(desde), spec)
  for (const c of [base, base + '.ts', base + '.tsx']) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c
  throw new Error('no resuelve ' + spec)
}
function entorno(extra = {}) {
  const reloj = { t: 1_700_000_000_000 }
  const Real = Date
  function FakeDate(...a) { return new Real(...a) }
  FakeDate.now = () => reloj.t
  const sandbox = { console, Date: FakeDate, setTimeout, ...extra }
  sandbox.globalThis = sandbox
  const ctx = vm.createContext(sandbox)
  const cache = new Map()
  function cargar(f) {
    if (cache.has(f)) return cache.get(f).exports
    const mod = { exports: {} }
    cache.set(f, mod)
    const js = ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
    const req = (s) => (s.startsWith('.') ? cargar(resolver(f, s)) : {})
    vm.runInContext('(function (module, exports, require) {' + js + '\n})', ctx)(mod, mod.exports, req)
    return mod.exports
  }
  return { reloj, modulo: (r) => cargar(path.join(FRONT, r)) }
}
function objetivo() {
  const o = new Map()
  return {
    addEventListener(t, f) { if (!o.has(t)) o.set(t, new Set()); o.get(t).add(f) },
    removeEventListener(t, f) { o.get(t)?.delete(f) },
    emitir(t) { for (const f of [...(o.get(t) || [])]) f({ type: t }) },
  }
}
function centinela() {
  const oy = []
  return { release() { return Promise.resolve() }, addEventListener(t, f) { if (t === 'release') oy.push(f) }, soltarPorElSistema() { oy.forEach((f) => f()) } }
}
function nav({ rechazar = false } = {}) {
  const centinelas = []
  const wakeLock = { request() { if (rechazar) return Promise.reject(new Error('NotAllowedError')); const c = centinela(); centinelas.push(c); return Promise.resolve(c) } }
  const documento = objetivo(); documento.visibilityState = 'visible'
  return { wakeLock, documento, ventana: objetivo(), centinelas }
}
const micro = () => new Promise((r) => setTimeout(r, 0))

async function correr() {
  const res = {}
  // 1) Retenida al salir: el sistema suelta el bloqueo AL OCULTARSE -> sigue contando como retenida; vuelve y se pide otra vez.
  {
    const e = entorno(); const m = e.modulo('player/hooks/useWakeLock.ts'); const n = nav()
    const g = m.crearGestorDeWakeLock({ ...n, ahora: () => e.reloj.t })
    const antes = g.retenidaAlSalir()
    const suelta = g.pedir(); await micro()
    const conLock = g.retenidaAlSalir()
    n.documento.visibilityState = 'hidden'; n.centinelas[0].soltarPorElSistema(); n.documento.emitir('visibilitychange'); await micro()
    const alSalirOculta = g.retenidaAlSalir()
    n.documento.visibilityState = 'visible'; n.documento.emitir('visibilitychange'); await micro()
    const alVolver = g.retenidaAlSalir()
    suelta()
    res.retenida = { antes, conLock, alSalirOculta, alVolver, tras: g.retenidaAlSalir() }
  }
  // 2) El sistema lo suelta con la página VISIBLE (ahorro de batería): ya no se puede fiar.
  {
    const e = entorno(); const m = e.modulo('player/hooks/useWakeLock.ts'); const n = nav()
    const g = m.crearGestorDeWakeLock({ ...n, ahora: () => e.reloj.t })
    g.pedir(); await micro()
    n.centinelas[0].soltarPorElSistema()
    res.sueltoVisible = g.retenidaAlSalir()
  }
  // 3) Petición rechazada: nunca retenida.
  {
    const e = entorno(); const m = e.modulo('player/hooks/useWakeLock.ts'); const n = nav({ rechazar: true })
    const g = m.crearGestorDeWakeLock({ ...n, ahora: () => e.reloj.t })
    g.pedir(); await micro()
    res.rechazada = g.retenidaAlSalir()
  }
  // 4) La regla: con la pantalla retenida la salida cuenta sin toque reciente; sin ella, la regla de los 10 s.
  {
    const e = entorno(); const s = e.modulo('player/hooks/salidasDeLaApp.ts')
    function salida({ retenida, toqueHaceMs }) {
      s.usarPantallaRetenida(() => retenida)
      const reg = s.crearRegistroDeInteraccion(() => e.reloj.t)
      reg.marcar(); e.reloj.t += toqueHaceMs
      let t0 = e.reloj.t
      const v = s.crearVigilanteDeSalidas({ ahora: () => e.reloj.t, permisoPropio: () => false, interaccionReciente: () => retenida || reg.reciente(), sinReto: () => false })
      v.empezar('salio_app'); e.reloj.t += 4000
      return v.terminar() !== null
    }
    res.regla = {
      retenidaSinToque: salida({ retenida: true, toqueHaceMs: 60_000 }),
      sinRetenerSinToque: salida({ retenida: false, toqueHaceMs: 60_000 }),
      sinRetenerConToque: salida({ retenida: false, toqueHaceMs: 2_000 }),
    }
    s.usarPantallaRetenida(() => true)
    res.salidaCuentaRetenida = s.salidaCuenta()
    s.usarPantallaRetenida(() => false)
    res.salidaCuentaNoRetenida = s.salidaCuenta()
    // Una salida de menos de 1,5 s no cuenta ni con la pantalla retenida.
    s.usarPantallaRetenida(() => true)
    const v = s.crearVigilanteDeSalidas({ ahora: () => e.reloj.t, permisoPropio: () => false, interaccionReciente: () => s.salidaCuenta(), sinReto: () => false })
    v.empezar('salio_app'); e.reloj.t += 800
    res.cortaRetenida = v.terminar() !== null
    // Sin reto en pantalla tampoco.
    const w = s.crearVigilanteDeSalidas({ ahora: () => e.reloj.t, permisoPropio: () => false, interaccionReciente: () => s.salidaCuenta(), sinReto: () => true })
    w.empezar('salio_app'); e.reloj.t += 5000
    res.sinRetoRetenida = w.terminar() !== null
  }
  return res
}
correr().then((r) => console.log(JSON.stringify(r))).catch((x) => { console.error(x && x.stack ? x.stack : String(x)); process.exit(1) })
