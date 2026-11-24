// Ejecuta en Node frontend/src/player/components/mapa/movimientoLigero.ts (el mapa más ligero mientras la cámara se mueve)
// con un mapa de mentira y relojes manuales, y vuelca un JSON para tests/test_mapa_ligero.py. Mismo método que conmutadores_mapa.cjs.
//
// Uso: node tests/js/mapa_ligero.cjs   (imprime un JSON por stdout)
const path = require('path')
const vm = require('vm')

const RAIZ = path.resolve(__dirname, '..', '..')
const { transpilar } = require('./cargarTs.cjs')
const fuente = path.join(RAIZ, 'frontend', 'src', 'player', 'components', 'mapa', 'movimientoLigero.ts')

function mundo() {
  let ahora = 0
  let idSig = 1
  const pendientes = new Map()
  const win = {
    setTimeout: (f, ms) => {
      const id = idSig++
      pendientes.set(id, { f, en: ahora + ms })
      return id
    },
    clearTimeout: (id) => pendientes.delete(id),
  }
  const avanzar = (ms) => {
    const fin = ahora + ms
    for (;;) {
      const sig = [...pendientes.entries()].filter(([, v]) => v.en <= fin).sort((a, b) => a[1].en - b[1].en)[0]
      if (!sig) break
      ahora = Math.max(ahora, sig[1].en)
      pendientes.delete(sig[0])
      sig[1].f()
    }
    ahora = fin
  }
  const modulo = { exports: {} }
  vm.runInNewContext(transpilar(fuente), { module: modulo, exports: modulo.exports, require, window: win, performance: { now: () => ahora }, Math })
  const oyentes = {}
  const registro = { redibujos: 0, tamanos: [], setPixelRatio: [] }
  const mapa = {
    _overridePixelRatio: null,
    _movimiento: false,
    getPixelRatio() {
      return this._overridePixelRatio ?? 3
    },
    _resizeInternal() {
      registro.tamanos.push(this.getPixelRatio())
    },
    setPixelRatio(r) {
      registro.setPixelRatio.push(r)
      this._overridePixelRatio = r
    },
    redraw() {
      registro.redibujos++
    },
    isMoving() {
      return this._movimiento
    },
    on(e, f) {
      ;(oyentes[e] = oyentes[e] || new Set()).add(f)
    },
    off(e, f) {
      oyentes[e]?.delete(f)
    },
  }
  const emitir = (e) => [...(oyentes[e] || [])].forEach((f) => f())
  const fotograma = (ms) => {
    avanzar(ms)
    emitir('render')
  }
  return { m: modulo.exports, mapa, emitir, avanzar, registro, oyentes, fotograma }
}

const empezar = (w) => {
  w.mapa._movimiento = true
  w.emitir('movestart')
  w.avanzar(w.m.ARRANQUE_MS + 1)
}
const acabar = (w) => {
  w.mapa._movimiento = false
  w.emitir('moveend')
}
// n fotogramas separados `ms` milisegundos (el primero sólo fija la hora: hacen falta 9 para una ventana de 8)
const fotogramas = (w, n, ms) => {
  for (let i = 0; i < n; i++) w.fotograma(ms)
}

const salida = {}

// Funciones puras
{
  const { m } = mundo()
  salida.puras = {
    mediana: [m.medianaDe([5, 1, 9]), m.medianaDe([]), m.medianaDe([40, 10, 20, 30])],
    densidad: [0, 1, 2].map((e) => m.pixelRatioDelEscalon(3, e)),
    densidad2: [0, 1, 2].map((e) => m.pixelRatioDelEscalon(2, e)),
    densidadBaja: [m.pixelRatioDelEscalon(1, 2), m.pixelRatioDelEscalon(0.75, 2), m.pixelRatioDelEscalon(1.2, 2), m.pixelRatioDelEscalon(0, 1)],
    densidadFueraDeRango: [m.pixelRatioDelEscalon(3, -4), m.pixelRatioDelEscalon(3, 9)],
    sube: [m.escalonTrasMedir(1, 80), m.escalonTrasMedir(2, 500), m.escalonTrasMedir(1, 20), m.escalonTrasMedir(1, m.PRESUPUESTO_FOTOGRAMA_MS)],
    siguiente: [m.escalonInicialDelSiguiente(2, 15), m.escalonInicialDelSiguiente(2, 30), m.escalonInicialDelSiguiente(0, 10), m.escalonInicialDelSiguiente(1, 0)],
    constantes: { reposo: m.REPOSO_MS, arranque: m.ARRANQUE_MS, presupuesto: m.PRESUPUESTO_FOTOGRAMA_MS, max: m.ESCALON_MAXIMO },
  }
}

// Un movimiento corto (un jumpTo de seguirte) no toca nada
{
  const w = mundo()
  const l = w.m.aligerarMientrasSeMueve(w.mapa)
  w.mapa._movimiento = true
  w.emitir('movestart')
  acabar(w)
  w.avanzar(2000)
  salida.corto = { tamanos: w.registro.tamanos, redibujos: w.registro.redibujos, estado: l.estado() }
}

// Un móvil que va sobrado (16 ms por fotograma) NUNCA ve ningún cambio de densidad
{
  const w = mundo()
  const l = w.m.aligerarMientrasSeMueve(w.mapa)
  empezar(w)
  fotogramas(w, 40, 16)
  const enGesto = l.estado()
  acabar(w)
  w.avanzar(2000)
  salida.sobrado = { enGesto, final: l.estado(), tamanos: w.registro.tamanos, redibujos: w.registro.redibujos }
}

// Un móvil justo: baja sólo cuando la ventana de 8 fotogramas pasa del presupuesto, de uno en uno, y devuelve la densidad tras el reposo
{
  const w = mundo()
  const l = w.m.aligerarMientrasSeMueve(w.mapa)
  w.mapa._movimiento = true
  w.emitir('movestart')
  w.avanzar(w.m.ARRANQUE_MS - 1)
  const antes = l.estado()
  w.avanzar(2)
  fotogramas(w, 8, 100)
  const aMitad = l.estado() // 7 intervalos: la ventana aún no está completa
  fotogramas(w, 1, 100)
  const escalon1 = l.estado()
  fotogramas(w, 8, 100)
  const escalon2 = l.estado()
  fotogramas(w, 20, 100)
  const tope = l.estado()
  acabar(w)
  w.avanzar(w.m.REPOSO_MS - 5)
  const trasMenosDelReposo = l.estado()
  w.avanzar(10)
  const trasElReposo = l.estado()
  salida.lento = {
    antes, aMitad, escalon1, escalon2, tope, trasMenosDelReposo, trasElReposo,
    tamanos: w.registro.tamanos, redibujos: w.registro.redibujos, override: w.mapa._overridePixelRatio,
  }
}

// El siguiente gesto empieza donde acabó el anterior; si fue holgado, baja un escalón para el que viene
{
  const w = mundo()
  const l = w.m.aligerarMientrasSeMueve(w.mapa)
  empezar(w)
  fotogramas(w, 17, 100)
  acabar(w)
  w.avanzar(w.m.REPOSO_MS + 5)
  empezar(w)
  const segundo = l.estado() // arranca en el escalón 2 sin esperar a medir
  fotogramas(w, 12, 10) // holgado: a mitad de gesto no se sube la densidad
  const holgado = l.estado()
  acabar(w)
  w.avanzar(w.m.REPOSO_MS + 5)
  empezar(w)
  const tercero = l.estado()
  salida.siguiente = { segundo, holgado, tercero, tamanos: w.registro.tamanos }
}

// Un gesto que empieza otro antes del reposo NO restaura entre los dos (sin parpadeo)
{
  const w = mundo()
  const l = w.m.aligerarMientrasSeMueve(w.mapa)
  empezar(w)
  fotogramas(w, 9, 100)
  acabar(w)
  w.avanzar(100)
  w.mapa._movimiento = true
  w.emitir('movestart')
  w.avanzar(1000)
  const seguido = l.estado()
  const oyentesDeRender = w.oyentes.render.size
  acabar(w)
  w.avanzar(w.m.REPOSO_MS + 5)
  salida.seguido = { seguido, oyentesDeRender, final: l.estado(), tamanos: w.registro.tamanos }
}

// Pausado: nada se mide ni se baja; pausar a mitad de gesto devuelve la densidad
{
  const w = mundo()
  const l = w.m.aligerarMientrasSeMueve(w.mapa)
  l.pausar(true)
  empezar(w)
  fotogramas(w, 20, 100)
  const pausado = l.estado()
  acabar(w)
  l.pausar(false)
  empezar(w)
  fotogramas(w, 9, 100)
  const bajado = l.estado()
  l.pausar(true)
  salida.pausa = { pausado, bajado, trasPausar: l.estado(), oyentesDeRender: w.oyentes.render.size }
}

// Densidad del propio mapa igual o menor que 1: no hay nada que bajar
{
  const w = mundo()
  w.mapa.getPixelRatio = function () {
    return this._overridePixelRatio ?? 1
  }
  const l = w.m.aligerarMientrasSeMueve(w.mapa)
  empezar(w)
  fotogramas(w, 30, 100)
  acabar(w)
  w.avanzar(w.m.REPOSO_MS + 5)
  salida.densidad1 = { tamanos: w.registro.tamanos, estado: l.estado() }
}

// Con el tope del ahorro de batería (`pr2`, densidad 2 forzada) se devuelve ese mismo valor al soltar
{
  const w = mundo()
  w.mapa._overridePixelRatio = 2
  const l = w.m.aligerarMientrasSeMueve(w.mapa)
  empezar(w)
  fotogramas(w, 9, 100)
  const bajado = l.estado()
  acabar(w)
  w.avanzar(w.m.REPOSO_MS + 5)
  salida.ahorro = { bajado, final: l.estado(), override: w.mapa._overridePixelRatio }
}

// Sin `_resizeInternal` (otra versión de MapLibre) cae en el setPixelRatio público
{
  const w = mundo()
  delete w.mapa._resizeInternal
  delete w.mapa._overridePixelRatio
  w.mapa.getPixelRatio = () => 3
  const l = w.m.aligerarMientrasSeMueve(w.mapa)
  empezar(w)
  fotogramas(w, 9, 100)
  salida.sinPrivado = { llamadas: w.registro.setPixelRatio.slice() }
  l.destruir()
}

// destruir en mitad de un gesto quita los oyentes y devuelve la densidad
{
  const w = mundo()
  const l = w.m.aligerarMientrasSeMueve(w.mapa)
  empezar(w)
  fotogramas(w, 9, 100)
  l.destruir()
  w.avanzar(5000)
  salida.destruir = {
    override: w.mapa._overridePixelRatio,
    oyentes: Object.fromEntries(Object.entries(w.oyentes).map(([k, v]) => [k, v.size])),
    tamanos: w.registro.tamanos,
  }
}

console.log(JSON.stringify(salida))
