// La vista tras el teclado del iPhone (5.49), con un navegador de mentira.
//
// Ejecuta frontend/src/player/utils/vistaTrasTeclado.ts y depurarVista.ts tal cual (transpilados al vuelo) en un
// contexto de `vm` con lo justo: eventos, foco, visual viewport, scroll y MutationObserver. Vuelca un JSON que lee
// tests/test_vista_teclado_iphone.py. Sin jsdom: no hay runner de JS en el repo.
'use strict'

const fs = require('fs')
const path = require('path')
const vm = require('vm')
const RAIZ = path.resolve(__dirname, '..', '..')
const SRC = path.join(RAIZ, 'frontend', 'src', 'player')
const ts = require(path.join(RAIZ, 'frontend', 'node_modules', 'typescript'))

function js(ruta) {
  return ts.transpileModule(fs.readFileSync(path.join(SRC, ruta), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
}
const JS_VISTA = js('utils/vistaTrasTeclado.ts')
const JS_DEPURAR = js('utils/depurarVista.ts')

/** Un mundo nuevo: ventana de 390x844, visual viewport movible, y un reloj que se avanza a mano. */
function crearMundo() {
  let ahora = 1_000_000
  const tareas = [] // { en, f, id }
  let sigId = 1
  const programar = (f, ms) => {
    const id = sigId++
    tareas.push({ en: ahora + (ms || 0), f, id })
    return id
  }
  const cancelar = (id) => {
    const i = tareas.findIndex((t) => t.id === id)
    if (i >= 0) tareas.splice(i, 1)
  }
  const avanzar = (ms) => {
    const fin = ahora + ms
    for (;;) {
      tareas.sort((a, b) => a.en - b.en)
      const t = tareas[0]
      if (!t || t.en > fin) break
      tareas.shift()
      ahora = t.en
      t.f()
    }
    ahora = fin
  }

  class Elemento extends EventTarget {
    constructor(tag, campo) {
      super()
      this.tagName = tag.toUpperCase()
      this.isContentEditable = false
      this.isConnected = true
      this.style = { display: '' }
      this.esCampo = campo
      this.offsetHeight = 0
    }
  }
  class HTMLElement extends Elemento {}
  class HTMLInputElement extends HTMLElement {
    constructor() {
      super('input', true)
      this.type = 'text'
    }
  }
  class HTMLTextAreaElement extends HTMLElement {
    constructor() {
      super('textarea', true)
    }
  }
  class HTMLSelectElement extends HTMLElement {}

  // Date.now() es el reloj del mundo; `new Date()` sigue siendo una fecha normal.
  class FechaFalsa extends Date {
    static now() {
      return ahora
    }
  }

  const estilosRaiz = new Map()
  const documentElement = new HTMLElement('html')
  documentElement.dataset = {}
  documentElement.scrollTop = 0
  documentElement.style = {
    setProperty: (n, v) => estilosRaiz.set(n, v),
    removeProperty: (n) => estilosRaiz.delete(n),
    getPropertyValue: (n) => estilosRaiz.get(n) || '',
  }
  const body = new HTMLElement('body')
  body.scrollTop = 0
  const rootApp = new HTMLElement('div')
  let sanados = 0
  Object.defineProperty(rootApp, 'offsetHeight', {
    get() {
      if (rootApp.style.display === 'none') sanados += 1
      return 0
    },
  })

  const observadores = new Set()
  class MutationObserver {
    constructor(cb) {
      this.cb = cb
    }
    observe() {
      observadores.add(this)
    }
    disconnect() {
      observadores.delete(this)
    }
  }

  const document = new EventTarget()
  document.documentElement = documentElement
  document.body = body
  document.scrollingElement = documentElement
  document.activeElement = body
  document.visibilityState = 'visible'
  document.getElementById = (id) => (id === 'root' ? rootApp : null)

  const vv = new EventTarget()
  vv.height = 844
  vv.offsetTop = 0
  vv.pageTop = 0

  const window = new EventTarget()
  window.innerHeight = 844
  window.innerWidth = 390
  window.scrollX = 0
  window.scrollY = 0
  window.visualViewport = vv
  window.setTimeout = programar
  window.clearTimeout = cancelar
  window.requestAnimationFrame = (f) => programar(f, 16)
  window.cancelAnimationFrame = cancelar
  window.location = { search: '' }
  const llamadasScroll = []
  window.scrollTo = (x, y) => {
    llamadasScroll.push([x, y])
    window.scrollX = x
    window.scrollY = y
  }
  const almacen = new Map()
  window.sessionStorage = {
    getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
    setItem: (k, v) => almacen.set(k, String(v)),
    removeItem: (k) => almacen.delete(k),
  }
  const avisos = []
  window.addEventListener('saga:vista', (e) => avisos.push(e.detail))
  let resizes = 0
  window.addEventListener('resize', () => (resizes += 1))

  const ctx = {
    window, document, HTMLElement, HTMLInputElement, HTMLTextAreaElement, HTMLSelectElement, MutationObserver,
    Event, CustomEvent, EventTarget, URLSearchParams, Date: FechaFalsa, Math, Number, String, Array,
    Object, Set, Map, JSON, Error, console,
  }
  const cargar = (codigo) => {
    const modulo = { exports: {} }
    vm.runInNewContext(codigo, { ...ctx, module: modulo, exports: modulo.exports, require: (n) => {
      if (n === './vistaTrasTeclado') return cargarVista()
      throw new Error('import no esperado ' + n)
    } })
    return modulo.exports
  }
  let vista = null
  const cargarVista = () => (vista ||= cargar(JS_VISTA))

  // --- Acciones del «usuario» ---
  const enfocar = (campo) => {
    const antes = document.activeElement
    // Como un navegador: al pasar de un campo a otro, el focusout llega con el foco ya en el nuevo.
    document.activeElement = campo
    if (antes && antes !== body) {
      const fuera = new Event('focusout')
      Object.defineProperty(fuera, 'target', { value: antes })
      document.dispatchEvent(fuera)
    }
    const e = new Event('focusin')
    Object.defineProperty(e, 'target', { value: campo })
    document.dispatchEvent(e)
  }
  const desenfocar = () => {
    const campo = document.activeElement
    document.activeElement = body
    const e = new Event('focusout')
    Object.defineProperty(e, 'target', { value: campo })
    document.dispatchEvent(e)
  }
  /** Quitar del DOM un campo enfocado: SIN focusout (como iOS), sólo cambia el DOM. */
  const quitarDelDom = (campo) => {
    campo.isConnected = false
    if (document.activeElement === campo) document.activeElement = body
    for (const o of [...observadores]) o.cb([])
  }
  const abrirTeclado = () => {
    vv.height = 500
    vv.offsetTop = 260
    window.scrollY = 40
    vv.dispatchEvent(new Event('resize'))
  }
  /** El teclado se va, pero iOS 26 deja el visual viewport corrido y 24 px corto. */
  const cerrarTecladoAtascado = () => {
    vv.height = 820
    vv.offsetTop = 24
    vv.dispatchEvent(new Event('resize'))
  }
  const cerrarTecladoLimpio = () => {
    vv.height = 844
    vv.offsetTop = 0
    vv.dispatchEvent(new Event('resize'))
  }
  // Un `blur()` de verdad lanza focusout.
  for (const C of [HTMLInputElement, HTMLTextAreaElement]) {
    C.prototype.blur = function () {
      if (document.activeElement === this) desenfocar()
    }
  }

  return {
    window, document, vv, avanzar, enfocar, desenfocar, quitarDelDom, abrirTeclado, cerrarTecladoAtascado,
    cerrarTecladoLimpio, avisos, llamadasScroll, estilosRaiz, HTMLInputElement, HTMLTextAreaElement,
    get resizes() { return resizes },
    get sanados() { return sanados },
    vista: cargarVista,
    depurar: () => cargar(JS_DEPURAR),
  }
}

const out = {}
const fases = (m) => m.avisos.map((a) => `${a.fase}:${a.motivo}`)

// 1) Salir del campo con el teclado que vuelve bien: vigila, devuelve a (0,0) y da la vista por normal.
{
  const m = crearMundo()
  const quitar = m.vista().instalarVistaTrasTeclado()
  const campo = new m.HTMLInputElement()
  m.enfocar(campo)
  m.abrirTeclado()
  const conTeclado = { teclado: m.document.documentElement.dataset.teclado, comp: [...m.estilosRaiz.keys()] }
  m.desenfocar()
  m.avanzar(50)
  m.cerrarTecladoLimpio()
  m.avanzar(400)
  out.salir = { conTeclado, fases: fases(m), scrollY: m.window.scrollY, resizes: m.resizes, comp: [...m.estilosRaiz.keys()] }
  quitar()
}

// 2) Quitar del DOM la nota enfocada (sin focusout): el observador lo ve y vigila igual.
{
  const m = crearMundo()
  const quitar = m.vista().instalarVistaTrasTeclado()
  const nota = new m.HTMLTextAreaElement()
  m.enfocar(nota)
  m.abrirTeclado()
  m.quitarDelDom(nota)
  m.avanzar(30)
  m.cerrarTecladoLimpio()
  m.avanzar(400)
  out.quitado = { fases: fases(m), scrollY: m.window.scrollY }
  quitar()
}

// 3) reponerTrasTeclado (X, guardar, Hecho): quita el foco ANTES y vigila.
{
  const m = crearMundo()
  const V = m.vista()
  const quitar = V.instalarVistaTrasTeclado()
  const nota = new m.HTMLTextAreaElement()
  m.enfocar(nota)
  m.abrirTeclado()
  V.reponerTrasTeclado()
  const focoTras = m.document.activeElement === nota ? 'nota' : 'fuera'
  m.cerrarTecladoLimpio()
  m.avanzar(400)
  out.pedido = { focoTras, fases: fases(m) }
  quitar()
}

// 4) iOS 26 atascado: no vuelve solo → compensa la raíz con lo que se ve y, al final, «sana» una vez.
{
  const m = crearMundo()
  const V = m.vista()
  const quitar = V.instalarVistaTrasTeclado()
  const nota = new m.HTMLTextAreaElement()
  m.enfocar(nota)
  m.abrirTeclado()
  m.desenfocar()
  m.avanzar(100)
  m.cerrarTecladoAtascado()
  m.avanzar(200)
  const compDurante = Object.fromEntries(m.estilosRaiz)
  m.avanzar(3000)
  out.atascado = { compDurante, fases: fases(m), sanados: m.sanados, scrollY: m.window.scrollY }
  // Y cuando por fin vuelve (otro resize del visual viewport), la compensación se quita.
  m.cerrarTecladoLimpio()
  out.atascado.compDespues = Object.fromEntries(m.estilosRaiz)
  quitar()
}

// 5) Pasar de un campo a otro: no se repone nada mientras se escribe.
{
  const m = crearMundo()
  const quitar = m.vista().instalarVistaTrasTeclado()
  const a = new m.HTMLInputElement()
  const b = new m.HTMLInputElement()
  m.enfocar(a)
  m.abrirTeclado()
  m.enfocar(b)
  m.avanzar(600)
  out.deCampoACampo = { fases: fases(m), scrollY: m.window.scrollY, llamadasScroll: m.llamadasScroll.length }
  quitar()
}

// 6) La desinstalación limpia variables y marca.
{
  const m = crearMundo()
  const quitar = m.vista().instalarVistaTrasTeclado()
  m.estilosRaiz.set('--saga-vista-top', '5px')
  quitar()
  out.limpio = { comp: [...m.estilosRaiz.keys()], marca: 'teclado' in m.document.documentElement.dataset }
}

// 7) Piezas puras.
{
  const V = crearMundo().vista()
  out.puras = {
    normal: V.vistaNormal({ medida: { height: 844, offsetTop: 0 }, alturaVentana: 844, alturaBase: 844, scrollX: 0, scrollY: 0 }),
    corta: V.vistaNormal({ medida: { height: 820, offsetTop: 24 }, alturaVentana: 844, alturaBase: 844, scrollX: 0, scrollY: 0 }),
    encogida: V.vistaNormal({ medida: { height: 785, offsetTop: 0 }, alturaVentana: 785, alturaBase: 844, scrollX: 0, scrollY: 0 }),
    compAtascada: V.compensacionDeVista({ height: 820, offsetTop: 24 }, 844, false),
    compNormal: V.compensacionDeVista({ height: 844, offsetTop: 0 }, 844, false),
    compEscribiendo: V.compensacionDeVista({ height: 820, offsetTop: 24 }, 844, true),
    compTeclado: V.compensacionDeVista({ height: 500, offsetTop: 260 }, 844, false),
    compSinMedida: V.compensacionDeVista(null, 844, false),
    // Corrido 24 px con el área entera: lo visible acaba 24 px por debajo de la ventana → la raíz se alarga.
    compPasada: V.compensacionDeVista({ height: 844, offsetTop: 24 }, 844, false),
    compAbsurda: V.compensacionDeVista({ height: 844, offsetTop: 0 }, 600, false),
  }
}

// 8) El modo depuración sólo con el parámetro.
{
  const m = crearMundo()
  const D = m.depurar()
  const pedida = (q, r) => D.depuracionPedida(q, r)
  out.depurar = {
    sinNada: pedida('', null),
    otroParametro: pedida('?jugador=1&depurar=1', null),
    conParametro: pedida('?depurar-vista', null),
    conValor: pedida('?x=1&depurar-vista=1', null),
    apagado: pedida('?depurar-vista=0', '1'),
    recordado: pedida('', '1'),
    basura: pedida('', 'si'),
  }
  // La función que lee la dirección: sin parámetro → no; con él → sí y lo recuerda; con =0 → lo olvida.
  m.window.location.search = ''
  const a = D.depuracionActiva()
  m.window.location.search = '?depurar-vista'
  const b = D.depuracionActiva()
  m.window.location.search = '/'
  const c = D.depuracionActiva()
  m.window.location.search = '?depurar-vista=0'
  const d = D.depuracionActiva()
  m.window.location.search = ''
  const e = D.depuracionActiva()
  out.depurar.activa = [a, b, c, d, e]
  // Registro con hora y texto para copiar.
  D.vaciarRegistro()
  D.anotar('focusin textarea', 'in 390x844', new Date(2026, 9, 5, 9, 8, 7, 6))
  for (let i = 0; i < D.MAX_REGISTRO + 10; i++) D.anotar('vv-scroll', 'x')
  out.depurar.registro = { n: D.leerRegistro().length, max: D.MAX_REGISTRO }
  D.vaciarRegistro()
  D.anotar('blur', 'vv 820@24', new Date(2026, 9, 5, 9, 8, 7, 6))
  out.depurar.texto = D.textoParaCopiar(
    { innerHeight: 844, innerWidth: 390, outerHeight: 844, clientHeight: 844, vvHeight: 820, vvOffsetTop: 24,
      vvPageTop: 24, scrollY: 0, raizTop: 0, raizAlto: 844, safeTop: 47, safeBottom: 34, modo: 'standalone',
      teclado: '-', compensacion: '-', foco: '-' },
    'UA de prueba', '5.49.0'
  )
}

process.stdout.write(JSON.stringify(out))
