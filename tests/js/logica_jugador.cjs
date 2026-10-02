// Ejecuta en Node la lógica del jugador que no depende de React y vuelca en
// JSON lo que hace, para que tests/test_logica_del_jugador.py compruebe el
// COMPORTAMIENTO y no sólo que el código contenga tal o cual cadena.
//
// No hay runner de JS en el repo: se transpila al vuelo con el `typescript` de
// frontend/node_modules (mismo método que registro_frontend.cjs). Cada módulo
// se carga dentro de un contexto de `vm` con un navegador de mentira
// (`window`, `document`, `navigator`, un DOM mínimo, un reloj que manda el
// test): así se pueden recorrer situaciones que en un móvil son imposibles de
// repetir a voluntad, como «el móvil se apagó solo a los 30 s».
//
// Uso: node tests/js/logica_jugador.cjs   (imprime un JSON por stdout)
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const RAIZ = path.resolve(__dirname, '..', '..')
const FRONT = path.join(RAIZ, 'frontend', 'src')
const ts = require(path.join(RAIZ, 'frontend', 'node_modules', 'typescript'))

function resolver(desde, spec) {
  const base = path.resolve(path.dirname(desde), spec)
  for (const c of [base, base + '.ts', base + '.tsx', path.join(base, 'index.ts')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c
  }
  throw new Error('no resuelve ' + spec + ' desde ' + desde)
}

// ---------------------------------------------------------------------------
// Un entorno = un contexto de vm nuevo, con su caché de módulos y su reloj.
// ---------------------------------------------------------------------------
function nuevoEntorno(extra = {}) {
  const reloj = { t: 1_700_000_000_000 }
  const RealDate = Date
  function FakeDate(...args) {
    return new RealDate(...args)
  }
  FakeDate.now = () => reloj.t
  FakeDate.parse = RealDate.parse
  FakeDate.UTC = RealDate.UTC

  const sandbox = { console, Date: FakeDate, ...extra }
  sandbox.globalThis = sandbox
  const contexto = vm.createContext(sandbox)
  const cache = new Map()

  function cargar(fichero) {
    if (cache.has(fichero)) return cache.get(fichero).exports
    const mod = { exports: {} }
    cache.set(fichero, mod)
    const fuente = fs.readFileSync(fichero, 'utf8')
    const js = ts.transpileModule(fuente, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: 'react-jsx' },
    }).outputText
    // Los imports que no son relativos (react...) se sustituyen por un objeto
    // vacío: sólo se cargan módulos que no ejecutan React al importarse.
    const req = (s) => (s.startsWith('.') ? cargar(resolver(fichero, s)) : {})
    const envoltura = vm.runInContext('(function (module, exports, require) {' + js + '\n})', contexto)
    envoltura(mod, mod.exports, req)
    return mod.exports
  }

  return {
    reloj,
    sandbox,
    contexto,
    avanzar: (ms) => {
      reloj.t += ms
    },
    modulo: (rel) => cargar(path.join(FRONT, rel)),
  }
}

// ---------------------------------------------------------------------------
// Un EventTarget de mentira.
// ---------------------------------------------------------------------------
function crearObjetivo() {
  const oyentes = new Map()
  return {
    oyentes,
    addEventListener(tipo, fn) {
      if (!oyentes.has(tipo)) oyentes.set(tipo, new Set())
      oyentes.get(tipo).add(fn)
    },
    removeEventListener(tipo, fn) {
      oyentes.get(tipo)?.delete(fn)
    },
    emitir(tipo) {
      for (const fn of [...(oyentes.get(tipo) || [])]) fn({ type: tipo })
    },
    cuantos() {
      let n = 0
      for (const set of oyentes.values()) n += set.size
      return n
    },
    tipos() {
      return [...oyentes.entries()].filter(([, set]) => set.size > 0).map(([tipo]) => tipo).sort()
    },
  }
}

const salida = {}

// ---------------------------------------------------------------------------
// 1. Salidas de la app (autobloqueo, permisos, reglas, 1,5 s).
// ---------------------------------------------------------------------------
{
  const e = nuevoEntorno()
  const n = e.modulo('player/hooks/salidasDeLaApp.ts')

  function caso({ toqueHaceMs, duraMs, permiso = false, sinReto = false, motivo = 'salio_app' }) {
    let t = 0
    const vigilante = n.crearVigilanteDeSalidas({
      ahora: () => t,
      permisoPropio: () => permiso,
      interaccionReciente: () => toqueHaceMs < n.VENTANA_INTERACCION_MS,
      sinReto: () => sinReto,
    })
    vigilante.empezar(motivo)
    t += duraMs
    return vigilante.terminar()
  }

  salida.salidas = {
    constantes: {
      minimaMs: n.SALIDA_MINIMA_MS,
      ventanaMs: n.VENTANA_INTERACCION_MS,
      penalizacionMs: n.PENALIZACION_POR_SALIDA_MS,
    },
    // Se fue de verdad: tocó la pantalla hace 2 s y estuvo fuera 5 s.
    deliberada: caso({ toqueHaceMs: 2_000, duraMs: 5_000 }),
    // El móvil se apagó solo: la última pulsación era de hace 40 s.
    autobloqueo: caso({ toqueHaceMs: 40_000, duraMs: 60_000 }),
    // Justo en el borde de la ventana de interacción.
    bordeVentanaDentro: caso({ toqueHaceMs: n.VENTANA_INTERACCION_MS - 1, duraMs: 5_000 }),
    bordeVentanaFuera: caso({ toqueHaceMs: n.VENTANA_INTERACCION_MS, duraMs: 5_000 }),
    // La regla de los 1,5 s se mantiene.
    cortaMenosDe1500: caso({ toqueHaceMs: 1_000, duraMs: 1_499 }),
    justo1500: caso({ toqueHaceMs: 1_000, duraMs: 1_500 }),
    // La propia app pidiendo un permiso.
    permisoPropio: caso({ toqueHaceMs: 500, duraMs: 8_000, permiso: true }),
    // Pantalla de reglas / resultado.
    sinReto: caso({ toqueHaceMs: 500, duraMs: 8_000, sinReto: true }),
    // Multitarea de Android (blur sin hidden).
    selectorApps: caso({ toqueHaceMs: 500, duraMs: 3_000, motivo: 'selector_apps' }),
  }

  // La primera señal manda: hidden y blur para la misma salida.
  {
    let t = 0
    const v = n.crearVigilanteDeSalidas({
      ahora: () => t,
      permisoPropio: () => false,
      interaccionReciente: () => true,
      sinReto: () => false,
    })
    v.empezar('selector_apps')
    t += 100
    v.empezar('salio_app')
    t += 4_000
    const evento = v.terminar()
    const segundo = v.terminar()
    salida.salidas.primeraSenalManda = { motivo: evento && evento.motivo, segundoTerminar: segundo }
  }

  // Una salida que empezó con reto delante se cuenta aunque el juego pase a
  // «fallado» (sin reto) mientras la página está oculta.
  {
    let t = 0
    let sinReto = false
    const v = n.crearVigilanteDeSalidas({
      ahora: () => t,
      permisoPropio: () => false,
      interaccionReciente: () => true,
      sinReto: () => sinReto,
    })
    v.empezar('salio_app')
    sinReto = true
    t += 3_000
    salida.salidas.cuentaAunqueElJuegoCambieDeFase = v.terminar()
  }

  // El registro de interacción y sus oyentes.
  {
    const e2 = nuevoEntorno()
    const n2 = e2.modulo('player/hooks/salidasDeLaApp.ts')
    const ventana = crearObjetivo()
    const libera1 = n2.vigilarInteraccion(ventana)
    const tiposActivos = ventana.tipos()
    const oyentesTrasPrimero = ventana.cuantos()
    const libera2 = n2.vigilarInteraccion(ventana)
    const oyentesTrasSegundo = ventana.cuantos()

    e2.avanzar(60_000)
    const recienteSinToques = n2.hayInteraccionReciente()
    ventana.emitir('pointerdown')
    const recienteTrasToque = n2.hayInteraccionReciente()
    e2.avanzar(n2.VENTANA_INTERACCION_MS + 1)
    const recienteDiezSegundosDespues = n2.hayInteraccionReciente()
    // Mover el móvil no es tocar la pantalla.
    ventana.emitir('deviceorientation')
    ventana.emitir('devicemotion')
    const recientesTrasMoverElMovil = n2.hayInteraccionReciente()

    libera1()
    const oyentesTrasSoltarUno = ventana.cuantos()
    libera1() // idempotente
    libera2()
    const oyentesTrasSoltarTodo = ventana.cuantos()

    // esSalidaDeliberada junta las dos reglas.
    salida.interaccion = {
      tiposActivos,
      oyentesTrasPrimero,
      oyentesTrasSegundo,
      recienteSinToques,
      recienteTrasToque,
      recienteDiezSegundosDespues,
      recientesTrasMoverElMovil,
      oyentesTrasSoltarUno,
      oyentesTrasSoltarTodo,
      deliberadaSiTodoBien: n2.esSalidaDeliberada(() => false, () => true),
      noDeliberadaSinToque: n2.esSalidaDeliberada(() => false, () => false),
      noDeliberadaEnPermiso: n2.esSalidaDeliberada(() => true, () => true),
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Wake Lock: cuenta, visibilidad, rechazos y navegador sin soporte.
// ---------------------------------------------------------------------------
{
  function centinela(alSoltar) {
    const oyentes = []
    return {
      soltado: 0,
      release() {
        this.soltado += 1
        if (alSoltar) alSoltar()
        return Promise.resolve()
      },
      addEventListener(tipo, fn) {
        if (tipo === 'release') oyentes.push(fn)
      },
      // Lo suelta el sistema (p. ej. al ocultarse la página).
      soltarPorElSistema() {
        this.soltado += 1
        oyentes.forEach((fn) => fn())
      },
    }
  }

  function navegador({ rechazar = false, sinSoporte = false, lanzar = false } = {}) {
    const centinelas = []
    const wakeLock = sinSoporte
      ? undefined
      : {
          peticiones: 0,
          request(tipo) {
            this.peticiones += 1
            if (lanzar) throw new Error('boom')
            if (rechazar) return Promise.reject(new Error('NotAllowedError'))
            const c = centinela()
            c.tipo = tipo
            centinelas.push(c)
            return Promise.resolve(c)
          },
        }
    const documento = crearObjetivo()
    documento.visibilityState = 'visible'
    const ventana = crearObjetivo()
    return { wakeLock, documento, ventana, centinelas }
  }

  const micro = () => new Promise((r) => setTimeout(r, 0))

  async function correr() {
    const res = {}

    // a) Dos peticiones (mapa + hoja), una sola petición al navegador; se suelta con la última.
    {
      const e = nuevoEntorno({ setTimeout })
      const m = e.modulo('player/hooks/useWakeLock.ts')
      const nav = navegador()
      const g = m.crearGestorDeWakeLock({ ...nav, ahora: () => e.reloj.t })
      const sueltaMapa = g.pedir()
      await micro()
      const sueltaHoja = g.pedir()
      await micro()
      const trasDos = { ...g.estado(), peticiones: nav.wakeLock.peticiones, tipo: nav.centinelas[0] && nav.centinelas[0].tipo }
      sueltaMapa()
      const trasSoltarUno = { ...g.estado(), soltados: nav.centinelas[0].soltado }
      sueltaMapa() // idempotente
      sueltaHoja()
      await micro()
      res.cuenta = {
        trasDos,
        trasSoltarUno,
        alFinal: { ...g.estado(), soltados: nav.centinelas[0].soltado },
        oyentesAlFinal: nav.documento.cuantos() + nav.ventana.cuantos(),
      }
    }

    // b) La página se oculta: el sistema lo suelta; al volver se vuelve a pedir.
    {
      const e = nuevoEntorno({ setTimeout })
      const m = e.modulo('player/hooks/useWakeLock.ts')
      const nav = navegador()
      const g = m.crearGestorDeWakeLock({ ...nav, ahora: () => e.reloj.t })
      g.pedir()
      await micro()
      nav.documento.visibilityState = 'hidden'
      nav.centinelas[0].soltarPorElSistema()
      nav.documento.emitir('visibilitychange')
      await micro()
      const estando = { ...g.estado(), peticiones: nav.wakeLock.peticiones }
      nav.documento.visibilityState = 'visible'
      nav.documento.emitir('visibilitychange')
      await micro()
      res.ocultarYVolver = {
        estando,
        alVolver: { ...g.estado(), peticiones: nav.wakeLock.peticiones },
      }
    }

    // c) Rechazada (sin gesto): no rompe; se reintenta en el siguiente toque, con freno.
    {
      const e = nuevoEntorno({ setTimeout })
      const m = e.modulo('player/hooks/useWakeLock.ts')
      const nav = navegador({ rechazar: true })
      const g = m.crearGestorDeWakeLock({ ...nav, ahora: () => e.reloj.t })
      g.pedir()
      await micro()
      const trasRechazo = { ...g.estado(), peticiones: nav.wakeLock.peticiones }
      // Un toque enseguida: dentro del freno, no reintenta.
      nav.ventana.emitir('pointerdown')
      await micro()
      const toqueDentroDelFreno = nav.wakeLock.peticiones
      e.avanzar(m.REINTENTO_MINIMO_MS + 1)
      nav.ventana.emitir('pointerdown')
      await micro()
      res.rechazada = {
        trasRechazo,
        toqueDentroDelFreno,
        toqueTrasElFreno: nav.wakeLock.peticiones,
      }
    }

    // d) Sin soporte, o request que lanza: el juego no se entera.
    {
      const e = nuevoEntorno({ setTimeout })
      const m = e.modulo('player/hooks/useWakeLock.ts')
      const nav = navegador({ sinSoporte: true })
      const g = m.crearGestorDeWakeLock({ ...nav, ahora: () => e.reloj.t })
      const suelta = g.pedir()
      suelta()
      const navLanza = navegador({ lanzar: true })
      const g2 = m.crearGestorDeWakeLock({ ...navLanza, ahora: () => e.reloj.t })
      let lanzo = false
      try {
        const s2 = g2.pedir()
        s2()
      } catch {
        lanzo = true
      }
      res.sinSoporte = { soportado: g.soportado(), lanzoElQueNoLoSoporta: false, lanzoElQueLanza: lanzo }
    }

    // e) Se suelta antes de que llegue la respuesta: el centinela tardío se libera solo.
    {
      const e = nuevoEntorno({ setTimeout })
      const m = e.modulo('player/hooks/useWakeLock.ts')
      const nav = navegador()
      let resolver
      nav.wakeLock.request = function () {
        this.peticiones += 1
        return new Promise((r) => {
          resolver = r
        })
      }
      const g = m.crearGestorDeWakeLock({ ...nav, ahora: () => e.reloj.t })
      const suelta = g.pedir()
      suelta()
      const c = centinela()
      resolver(c)
      await micro()
      res.sueltoAntesDeLlegar = { soltadoAlLlegar: c.soltado, estado: g.estado() }
    }

    // f) Con la página oculta al pedir no se pide nada; al volver, sí.
    {
      const e = nuevoEntorno({ setTimeout })
      const m = e.modulo('player/hooks/useWakeLock.ts')
      const nav = navegador()
      nav.documento.visibilityState = 'hidden'
      const g = m.crearGestorDeWakeLock({ ...nav, ahora: () => e.reloj.t })
      g.pedir()
      await micro()
      const oculta = nav.wakeLock.peticiones
      nav.documento.visibilityState = 'visible'
      nav.documento.emitir('visibilitychange')
      await micro()
      res.pedirOculta = { alPedirOculta: oculta, alVolver: nav.wakeLock.peticiones }
    }

    return res
  }

  salida._wakeLockPromesa = correr()
}

// ---------------------------------------------------------------------------
// 3. El mapa cubierto (hojas y minijuegos declaran que lo tapan).
// ---------------------------------------------------------------------------
{
  const e = nuevoEntorno()
  const c = e.modulo('player/hooks/useCubreElMapa.ts')
  const avisos = []
  const dejar = c.alCambiarCoberturaDelMapa((v) => avisos.push(v))
  const inicial = c.mapaCubierto()
  const sueltaHoja = c.cubrirMapa()
  const sueltaJuego = c.cubrirMapa()
  const conDos = c.mapaCubierto()
  sueltaHoja()
  sueltaHoja() // idempotente: no descuenta dos veces
  const conUnoTrasSoltarDosVeces = c.mapaCubierto()
  sueltaJuego()
  const alFinal = c.mapaCubierto()
  dejar()
  c.cubrirMapa()()
  salida.cobertura = { inicial, conDos, conUnoTrasSoltarDosVeces, alFinal, avisos, avisosTrasDejarDeEscuchar: avisos.length }
}

// ---------------------------------------------------------------------------
// 4. Clasificación (S11 cliente).
// ---------------------------------------------------------------------------
{
  const e = nuevoEntorno()
  const c = e.modulo('player/components/clasificacion.ts')
  const p = (user, extra = {}) => ({ user, display_name: user, ...extra })
  const nombres = (lista) => lista.map((x) => x.user)

  // Pantalla final: total_time_ms = 0 no gana.
  const finalConCero = c.ordenarPorTiempoTotal([
    p('Cero', { finished: true, total_time_ms: 0 }),
    p('Lento', { finished: true, total_time_ms: 900_000 }),
    p('Rapido', { finished: true, total_time_ms: 600_000 }),
    p('Jugando', { finished: false, level: 3, total_time_ms: 5_000 }),
  ])
  const finalConCeroAlReves = c.ordenarPorTiempoTotal([
    p('Jugando', { finished: false, level: 3, total_time_ms: 5_000 }),
    p('Rapido', { finished: true, total_time_ms: 600_000 }),
    p('Lento', { finished: true, total_time_ms: 900_000 }),
    p('Cero', { finished: true, total_time_ms: 0 }),
  ])
  const finalSinNumeros = c.ordenarPorTiempoTotal([
    p('B', { finished: true }),
    p('A', { finished: true, total_time_ms: null }),
    p('C', { finished: true, total_time_ms: 300_000 }),
    p('D', { finished: true, total_time_ms: -5 }),
    p('E', { finished: true, total_time_ms: NaN }),
  ])

  // Hoja de la clasificación: el desempate no puede depender de last_seen.
  const empate = (lastA, lastB) =>
    nombres(
      c.ordenarClasificacion([
        p('Beatriz', { level: 4, total_time_ms: 500_000, last_seen: lastA }),
        p('Ana', { level: 4, total_time_ms: 500_000, last_seen: lastB }),
      ])
    )
  const empateTresLatidos = [empate(1, 2), empate(2, 1), empate(1000, 5), empate(5, 1000)]
  const empateAlReves = nombres(
    c.ordenarClasificacion([
      p('Ana', { level: 4, total_time_ms: 500_000, last_seen: 9 }),
      p('Beatriz', { level: 4, total_time_ms: 500_000, last_seen: 1 }),
    ])
  )
  // Mismo nombre: el id manda.
  const mismoNombre = nombres(
    c.ordenarClasificacion([
      { user: 'u2', display_name: 'Igual', level: 2, total_time_ms: 1 },
      { user: 'u1', display_name: 'Igual', level: 2, total_time_ms: 1 },
    ])
  )
  // La hora de fin, si existe, sí desempata (no cambia).
  const porHoraDeFin = nombres(
    c.ordenarClasificacion([
      p('Tarde', { finished: true, total_time_ms: 700_000, finished_at: '2026-09-30T12:10:00.123456+00:00' }),
      p('Pronto', { finished: true, total_time_ms: 700_000, finished_at: '2026-09-30T12:05:00.123456+00:00' }),
    ])
  )
  // Sin tiempo conocido va detrás de quien lo tiene en el mismo nodo; puntos y nodo mandan antes.
  const ordenGeneral = nombres(
    c.ordenarClasificacion([
      p('SinTiempo', { level: 5, total_time_ms: 0 }),
      p('ConTiempo', { level: 5, total_time_ms: 800_000 }),
      p('MasNodos', { level: 7, total_time_ms: 2_000_000 }),
      p('ConPuntos', { level: 1, score: 50 }),
      p('Terminado', { finished: true, level: 9, total_time_ms: 3_000_000 }),
    ])
  )

  salida.clasificacion = {
    finalConCero: nombres(finalConCero),
    finalConCeroAlReves: nombres(finalConCeroAlReves),
    finalSinNumeros: nombres(finalSinNumeros),
    empateTresLatidos,
    empateAlReves,
    mismoNombre,
    porHoraDeFin,
    ordenGeneral,
    tiempoConocido: [c.tiempoConocido(0), c.tiempoConocido(-1), c.tiempoConocido('12'), c.tiempoConocido(undefined), c.tiempoConocido(1500)],
  }
}

// ---------------------------------------------------------------------------
// 5. Notas del Simón: un solo AudioContext.
// ---------------------------------------------------------------------------
{
  const e = nuevoEntorno()
  const t = e.modulo('player/minigames/core/tonos.ts')

  function fabricaDeAudio({ estado = 'running', sinAudio = false } = {}) {
    const cuenta = { creados: 0, osciladores: 0, cerrados: 0, despertados: 0 }
    const fabrica = () => {
      if (sinAudio) return null
      cuenta.creados += 1
      const param = () => ({ value: 0, exponentialRampToValueAtTime() {} })
      return {
        currentTime: 0,
        destination: {},
        state: estado,
        createOscillator() {
          cuenta.osciladores += 1
          return { type: '', frequency: { value: 0 }, connect() {}, start() {}, stop() {} }
        },
        createGain() {
          return { gain: param(), connect() {} }
        },
        resume() {
          cuenta.despertados += 1
          return Promise.resolve()
        },
        close() {
          cuenta.cerrados += 1
          return Promise.resolve()
        },
      }
    }
    return { cuenta, fabrica }
  }

  // Un nivel de 7 notas, dos toques y otra tanda: siempre el mismo contexto.
  const a = fabricaDeAudio({ estado: 'suspended' })
  const r = t.crearReproductorDeTonos(a.fabrica)
  r.preparar()
  for (let i = 0; i < 7; i++) r.tono(300 + i * 20, 300)
  r.tono(440, 220)
  r.tono(330, 220)
  for (let i = 0; i < 5; i++) r.tono(260, 300)
  const antesDeCerrar = { ...a.cuenta }
  r.cerrar()
  r.cerrar()
  const trasCerrar = { ...a.cuenta }

  // Sin audio en el navegador: no lanza y no insiste.
  const b = fabricaDeAudio({ sinAudio: true })
  let intentosSinAudio = 0
  const rb = t.crearReproductorDeTonos(() => {
    intentosSinAudio += 1
    return b.fabrica()
  })
  rb.preparar()
  for (let i = 0; i < 6; i++) rb.tono(300, 200)
  rb.cerrar()

  // Una fábrica que lanza tampoco rompe el juego.
  let lanzo = false
  try {
    const rc = t.crearReproductorDeTonos(() => {
      throw new Error('sin audio')
    })
    rc.preparar()
    rc.tono(300, 200)
  } catch {
    lanzo = true
  }

  salida.tonos = { antesDeCerrar, trasCerrar, intentosSinAudio, lanzoSinAudio: lanzo }
}

// ---------------------------------------------------------------------------
// 6. Textos: los tres idiomas dicen lo mismo y no se mezclan.
// ---------------------------------------------------------------------------
function hojasDeTextos(objeto, prefijo = '') {
  const planos = {}
  for (const [clave, valor] of Object.entries(objeto)) {
    const ruta = prefijo ? prefijo + '.' + clave : clave
    if (Array.isArray(valor)) {
      valor.forEach((v, i) => {
        planos[ruta + '[' + i + ']'] = v
      })
    } else if (typeof valor === 'function') {
      // Se llama con argumentos reconocibles para ver qué pinta. Las funciones
      // que esperan un texto reciben uno (no un número).
      const conTexto = valor.length >= 1 && /^(nodo|nodos|nombres|objeto|cuando|distancia|segundos)$/.test(
        (valor.toString().match(/\(([^)]*)\)/) || ['', ''])[1].split(',')[0].trim()
      )
      planos[ruta] = conTexto ? valor('X', 7) : valor(3, 7)
    } else if (valor && typeof valor === 'object') {
      Object.assign(planos, hojasDeTextos(valor, ruta))
    } else {
      planos[ruta] = valor
    }
  }
  return planos
}

// Palabras que delatan el idioma equivocado.
const marcasGallegas = /\b(saíches|abriches|comeza|súmanse|volves|xogo|non|ningún|pechar|gardando|obxecto|dispoñible|quenda|fallaches|rematou|chegaches|percorriches|axente|agardando)\b/i
const marcasCastellanas = /\b(saliste|abriste|empieza|vuelves|juego|objeto|disponible|guardando|fallaste|perdiste|recorrido|agente|esperando)\b/i

function analizarTextos(todos) {
  const planos = { es: hojasDeTextos(todos.es), gl: hojasDeTextos(todos.gl), en: hojasDeTextos(todos.en) }
  const clavesEs = Object.keys(planos.es).sort()
  const diferencias = {}
  for (const idioma of ['gl', 'en']) {
    const claves = Object.keys(planos[idioma]).sort()
    diferencias[idioma] = {
      faltan: clavesEs.filter((k) => !claves.includes(k)),
      sobran: claves.filter((k) => !clavesEs.includes(k)),
    }
  }
  const vacios = {}
  for (const idioma of ['es', 'gl', 'en']) {
    vacios[idioma] = Object.entries(planos[idioma])
      .filter(([, v]) => typeof v !== 'string' || v.trim() === '')
      .map(([k]) => k)
  }
  return {
    claves: clavesEs.length,
    diferencias,
    vacios,
    gallegoEnCastellano: Object.entries(planos.es)
      .filter(([, v]) => marcasGallegas.test(v))
      .map(([k, v]) => k + ': ' + v),
    castellanoEnGallego: Object.entries(planos.gl)
      .filter(([, v]) => marcasCastellanas.test(v))
      .map(([k, v]) => k + ': ' + v),
  }
}

{
  const e = nuevoEntorno()
  const t = e.modulo('player/minigames/core/textos.ts')
  const todos = t.TEXTOS_DEL_JUGADOR

  // Los números de los avisos con datos llegan a los tres idiomas.
  const conDatos = {}
  for (const idioma of ['es', 'gl', 'en']) {
    const x = todos[idioma]
    conDatos[idioma] = {
      salioApp: x.antiTrampas.salioApp(30),
      selectorApps: x.antiTrampas.selectorApps(30),
      observa: x.simon.observa(2, 5),
      desbloqueado: x.simon.nivelDesbloqueado(4),
      circuitoQuedan1: x.circuit.marca(1),
      circuitoQuedan3: x.circuit.marca(3),
    }
  }

  // Los avisos de anti-trampas se distinguen y llevan los 30 s.
  const distintos = new Set(['es', 'gl', 'en'].map((i) => todos[i].antiTrampas.salioApp(30)))

  const p = e.modulo('player/components/textosDePantallas.ts')
  const pantallas = p.TEXTOS_DE_PANTALLAS
  const conDatosPantallas = {}
  for (const idioma of ['es', 'gl', 'en']) {
    const x = pantallas[idioma]
    conDatosPantallas[idioma] = {
      jugadores1: x.clasificacion.jugadores(1),
      jugadores5: x.clasificacion.jugadores(5),
      enLinea: x.clasificacion.enLinea(2),
      guardado1: x.escaner.guardado(1),
      guardado3: x.escaner.guardado(3),
      nodoTiempo: x.popup.nodoTiempo('3 / 10', '12:34'),
      hace: [x.popup.haceSegundos(5), x.popup.haceMinutos(3), x.popup.haceHoras(2)],
    }
  }

  salida.textos = {
    minijuegos: analizarTextos(todos),
    pantallas: analizarTextos(pantallas),
    conDatos,
    conDatosPantallas,
    idiomasDistintos: distintos.size,
    desconocidoCaeEnEs:
      t.textosDe('xx') === todos.es && t.textosDe(undefined) === todos.es && t.textosDe(null) === todos.es,
    pantallasDesconocidoCaeEnEs: p.textosDePantallasDe('xx') === pantallas.es,
    cerrarEnLosTres: [todos.es.hoja.cerrar, todos.gl.hoja.cerrar, todos.en.hoja.cerrar],
    coloresSimon: [todos.es.simon.colores.length, todos.gl.simon.colores.length, todos.en.simon.colores.length],
  }
}

// ---------------------------------------------------------------------------
// 7. El puente de idioma con un DOM de mentira: no congela textos de React,
//    no da vueltas a 60 Hz y no recorre la página entera por cada cambio.
// ---------------------------------------------------------------------------
{
  const pendientesDeEntrega = []
  let observador = null
  let idSiguiente = 1
  const frames = []
  const contadores = { walkers: 0, nodosRecorridos: 0, raicesDeWalker: [] }

  class FNodo {
    constructor(tipo) {
      this.nodeType = tipo
      this.parentElement = null
      this.hijos = []
      this._id = idSiguiente++
    }
    get isConnected() {
      let n = this
      while (n) {
        if (n === cuerpo) return true
        n = n.parentElement
      }
      return false
    }
  }
  class FTexto extends FNodo {
    constructor(v) {
      super(3)
      this._v = v
    }
    get nodeValue() {
      return this._v
    }
    set nodeValue(v) {
      this._v = v
      pendientesDeEntrega.push({ type: 'characterData', target: this })
    }
  }
  class FElemento extends FNodo {
    constructor(etiqueta) {
      super(1)
      this.etiqueta = etiqueta
      this.attrs = {}
    }
    appendChild(n) {
      n.parentElement = this
      this.hijos.push(n)
      pendientesDeEntrega.push({ type: 'childList', target: this, addedNodes: [n] })
      return n
    }
    getAttribute(k) {
      return k in this.attrs ? this.attrs[k] : null
    }
    setAttribute(k, v) {
      this.attrs[k] = String(v)
      pendientesDeEntrega.push({ type: 'attributes', target: this, attributeName: k })
    }
    matches() {
      return ['placeholder', 'aria-label', 'title'].some((k) => k in this.attrs)
    }
    descendientes() {
      const salidaDesc = []
      for (const h of this.hijos) {
        salidaDesc.push(h)
        if (h.nodeType === 1) salidaDesc.push(...h.descendientes())
      }
      return salidaDesc
    }
    querySelectorAll() {
      return this.descendientes().filter((n) => n.nodeType === 1 && n.matches())
    }
    contains(otro) {
      let n = otro
      while (n) {
        if (n === this) return true
        n = n.parentElement
      }
      return false
    }
    closest() {
      let n = this
      while (n) {
        if (n.etiqueta === 'style' || n.etiqueta === 'script' || 'data-saga-i18n-skip' in n.attrs) return n
        n = n.parentElement
      }
      return null
    }
  }

  const cuerpo = new FElemento('body')
  cuerpo.parentElement = null
  Object.defineProperty(cuerpo, 'isConnected', { get: () => true })

  const ventana = crearObjetivo()
  ventana.localStorage = {
    datos: { saga_locale: 'gl' },
    getItem(k) {
      return k in this.datos ? this.datos[k] : null
    },
    setItem(k, v) {
      this.datos[k] = v
    },
  }
  ventana.requestAnimationFrame = (fn) => {
    frames.push(fn)
    return frames.length
  }
  ventana.dispatchEvent = (ev) => ventana.emitir(ev.type)

  const documento = {
    body: cuerpo,
    createTreeWalker(raiz) {
      contadores.walkers += 1
      contadores.raicesDeWalker.push(raiz === cuerpo ? 'body' : 'subarbol')
      const lista = raiz.descendientes().filter((n) => n.nodeType === 3)
      let i = 0
      return {
        nextNode() {
          if (i >= lista.length) return null
          contadores.nodosRecorridos += 1
          return lista[i++]
        },
      }
    },
  }

  class FMutationObserver {
    constructor(fn) {
      this.fn = fn
      observador = this
    }
    observe() {}
  }

  const e = nuevoEntorno({
    window: ventana,
    document: documento,
    Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
    NodeFilter: { SHOW_TEXT: 4 },
    Element: FElemento,
    MutationObserver: FMutationObserver,
    CustomEvent: class {
      constructor(tipo, init) {
        this.type = tipo
        this.detail = init && init.detail
      }
    },
  })

  /** Entrega al observador lo que se ha escrito en el DOM (microtarea real). */
  function entregar() {
    const lote = pendientesDeEntrega.splice(0)
    if (lote.length && observador) observador.fn(lote)
    return lote.length
  }
  /** Un fotograma: lo que estaba esperando a requestAnimationFrame. */
  function fotograma() {
    const cola = frames.splice(0)
    cola.forEach((fn) => fn())
    return cola.length
  }
  /** Fotogramas y entregas hasta que no queda nada (con tope, por si diera vueltas). */
  function asentar() {
    let vueltas = 0
    while ((frames.length || pendientesDeEntrega.length) && vueltas < 20) {
      entregar()
      fotograma()
      vueltas += 1
    }
    return vueltas
  }

  // Una página con bastante contenido fijo.
  const cabecera = cuerpo.appendChild(new FElemento('header'))
  const botonCerrar = cabecera.appendChild(new FElemento('button'))
  const textoCerrar = botonCerrar.appendChild(new FTexto('Cerrar'))
  const lista = cuerpo.appendChild(new FElemento('ul'))
  for (let i = 0; i < 300; i++) {
    const li = lista.appendChild(new FElemento('li'))
    li.appendChild(new FTexto('Fila número ' + i))
  }
  const reloj = cuerpo.appendChild(new FElemento('div'))
  const textoReloj = reloj.appendChild(new FTexto('00:01'))
  pendientesDeEntrega.length = 0

  const puente = e.modulo('i18n/legacySpanishBridge.ts')
  puente.setupLegacySpanishBridge()
  const vueltasIniciales = asentar()
  const inicial = {
    vueltas: vueltasIniciales,
    cerrar: textoCerrar.nodeValue,
    walkers: contadores.walkers,
    recorridos: contadores.nodosRecorridos,
    framesPendientes: frames.length,
  }

  // 1) React cambia un texto traducido: el puente acepta el nuevo, no lo "descongela".
  contadores.walkers = 0
  contadores.nodosRecorridos = 0
  textoCerrar.nodeValue = 'Guardar' // lo escribe React
  asentar()
  const cambioDeReact = {
    texto: textoCerrar.nodeValue,
    walkers: contadores.walkers,
    recorridos: contadores.nodosRecorridos,
    framesPendientes: frames.length,
  }

  // 2) React pone un texto que no se traduce: se queda como lo puso React.
  textoCerrar.nodeValue = 'Hola de React'
  asentar()
  const textoNuevoDeReact = textoCerrar.nodeValue

  // 3) El reloj cambia cada 250 ms: ni un solo recorrido de árbol.
  contadores.walkers = 0
  contadores.nodosRecorridos = 0
  let vueltasReloj = 0
  for (let i = 2; i < 12; i++) {
    textoReloj.nodeValue = '00:0' + (i % 10)
    vueltasReloj += asentar()
  }
  const relojCadaFotograma = {
    walkers: contadores.walkers,
    recorridos: contadores.nodosRecorridos,
    vueltas: vueltasReloj,
    final: textoReloj.nodeValue,
  }

  // 4) Un elemento nuevo: sólo se recorre su rama, no las 300 filas.
  contadores.walkers = 0
  contadores.nodosRecorridos = 0
  contadores.raicesDeWalker = []
  const tarjeta = new FElemento('section')
  tarjeta.setAttribute('title', 'Cerrar')
  tarjeta.appendChild(new FTexto('Guardar'))
  cuerpo.appendChild(tarjeta)
  asentar()
  const elementoNuevo = {
    texto: tarjeta.hijos[0].nodeValue,
    titulo: tarjeta.getAttribute('title'),
    walkers: contadores.walkers,
    raices: [...contadores.raicesDeWalker],
    recorridos: contadores.nodosRecorridos,
  }

  // 5) El puente no se despierta por lo que escribe él mismo (sin bucle a 60 Hz):
  //    React escribe «Cerrar»; el puente lo traduce en un fotograma; el eco de
  //    ESA escritura llega al observador y no debe pedir otro fotograma.
  textoCerrar.nodeValue = 'Cerrar'
  entregar()
  fotograma()
  const escrituras = pendientesDeEntrega.length
  const textoTraducido = textoCerrar.nodeValue
  const eco = entregar()
  const echoPendiente = { escrituras, textoTraducido, eco, framesTrasElEco: frames.length }

  // 6) Cambio de idioma: aquí sí, un recorrido entero, y todo vuelve al castellano.
  contadores.walkers = 0
  contadores.nodosRecorridos = 0
  ventana.localStorage.datos.saga_locale = 'es'
  ventana.emitir('saga:locale-change')
  asentar()
  const cambioDeIdioma = {
    walkers: contadores.walkers,
    recorridosMinimos: contadores.nodosRecorridos >= 300,
    cerrar: textoCerrar.nodeValue,
    tarjeta: tarjeta.hijos[0].nodeValue,
    tituloTarjeta: tarjeta.getAttribute('title'),
    framesPendientes: frames.length,
  }

  salida.puente = { inicial, cambioDeReact, textoNuevoDeReact, relojCadaFotograma, elementoNuevo, echoPendiente, cambioDeIdioma }
}

// ---------------------------------------------------------------------------
// Mapa: compañeros que no tapan tu marcador, distancias legibles, micrófono de la ruta.
// ---------------------------------------------------------------------------
{
  const e = nuevoEntorno()
  const m = e.modulo('player/components/jugadoresEnMapa.ts')
  const motor = e.modulo('player/offline/motorDeCarga.ts')
  // Compañeros como símbolos del mapa: posición REAL siempre; los solapados, hueco en pantalla.
  const yo = { lat: 42.4333, lon: -8.65 }
  const j = (user, lat, lon, extra = {}) => ({ user, display_name: user, lat, lon, presence: 'live', ...extra })
  const encima = j('a', yo.lat, yo.lon)
  const otroEncima = j('b', yo.lat, yo.lon)
  const casi = j('c', yo.lat + 0.000027, yo.lon) // ~3 m
  const lejos = j('d', yo.lat + 0.005, yo.lon) // ~550 m
  const propio = j('yo', yo.lat, yo.lon, { is_self: true })
  const plan19 = m.planDeJugadores([encima, otroEncima, casi, lejos, propio], 19, yo)
  const por = (plan, user) => plan.find((x) => x.jugadores[0].user === user)
  const plan14 = m.planDeJugadores([j('e', yo.lat + 0.01, yo.lon), j('f', yo.lat + 0.0101, yo.lon)], 14, null)
  const plan18sinYo = m.planDeJugadores([j('g', 42.5, -8.6), j('h', 42.5, -8.6)], 18, null)
  const huecosDistintos = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((h) => m.desplazamientoDeHueco(h).join(',')))
  salida.mapaSolape = {
    n19: plan19.length,
    sinPropio: plan19.every((x) => x.jugadores[0].user !== 'yo'),
    huecoEncima: por(plan19, 'a').hueco,
    huecoOtroEncima: por(plan19, 'b').hueco,
    huecoCasi: por(plan19, 'c').hueco,
    huecoLejos: por(plan19, 'd').hueco,
    // Nadie se mueve: la coordenada es la del jugador, exacta.
    coordenadasIntactas: plan19.every((x) => {
      const o = x.jugadores[0]
      return x.lat === o.lat && x.lon === o.lon
    }),
    grupoZoom14: plan14.map((x) => [x.tipo, x.jugadores.length]),
    grupoCentroZoom14: [plan14[0].lat, plan14[0].lon],
    porSeparadoZoom18: plan18sinYo.map((x) => [x.tipo, x.hueco, x.lat, x.lon]),
    // Zoom bajo: se agrupa por PANTALLA (30 px), no por metros fijos.
    radios: [10, 11, 13, 15, 16, 17, 19].map((z) => [z, Math.round(m.radioDeAgrupacion(z, 42.5))]),
    a700mZ11: m.planDeJugadores([j('p', 42.5, -8.6), j('q', 42.5 + 0.0063, -8.6)], 11, null).map((x) => [x.tipo, x.jugadores.length, x.hueco]),
    a700mZ13: m.planDeJugadores([j('p', 42.5, -8.6), j('q', 42.5 + 0.0063, -8.6)], 13, null).map((x) => [x.tipo, x.jugadores.length, x.hueco]),
    a50mZ16: m.planDeJugadores([j('p', 42.5, -8.6), j('q', 42.5 + 0.00045, -8.6)], 16, null).map((x) => [x.tipo, x.jugadores.length, x.hueco]),
    huecosDistintos: huecosDistintos.size,
    radioDeHuecos: Math.hypot(...m.desplazamientoDeHueco(3)),
    huecoCero: m.desplazamientoDeHueco(0),
    metrosPorPixelZ19: m.metrosPorPixel(19, 0),
    ordenPresencia: [m.ordenDePresencia('offline'), m.ordenDePresencia('recent'), m.ordenDePresencia('live')],
    metros: [m.distanciaLegible(3), m.distanciaLegible(47), m.distanciaLegible(1234)],
  }
  salida.microfonoDeLaRuta = {
    sinAudio: motor.rutaUsaMicrofono([{ type: 'checkpoint' }, { type: 'qr_collectible' }]),
    conAudio: motor.rutaUsaMicrofono([{ type: 'checkpoint' }, { type: 'audio_challenge' }]),
    porGameId: motor.rutaUsaMicrofono([{ type: 'minigame', game_id: 'audio_challenge' }]),
    sinDatos: motor.rutaUsaMicrofono(undefined),
    vacia: motor.rutaUsaMicrofono([]),
  }
}

// ---------------------------------------------------------------------------
// Calidad de las fotos de campo: tamaño, calidad y tope de peso.
// ---------------------------------------------------------------------------
{
  const e = nuevoEntorno()
  const f = e.modulo('player/utils/calidadDeFoto.ts')
  const llamadas = []
  // Codificador de mentira: pesa según la calidad y los píxeles.
  const pesado = (w, h, q) => {
    llamadas.push([w, h, q])
    const bytes = Math.round(w * h * q * 0.6)
    return 'data:image/jpeg;base64,' + 'A'.repeat(Math.ceil((bytes * 4) / 3))
  }
  const normal = f.codificarConTope(4032, 3024, (w, h, q) => 'data:image/jpeg;base64,' + 'A'.repeat(1000))
  llamadas.length = 0
  const enorme = f.codificarConTope(4032, 3024, pesado, 900_000)
  salida.calidadDeFoto = {
    lado: f.LADO_FOTO_PX,
    calidad: f.CALIDAD_FOTO,
    dim4032: f.dimensionesDeFoto(4032, 3024),
    dimVertical: f.dimensionesDeFoto(3024, 4032),
    dimPequena: f.dimensionesDeFoto(800, 600),
    bytes: f.bytesDeDataUrl('data:image/jpeg;base64,QUJD'),
    normal: { ancho: normal.ancho, alto: normal.alto, calidad: normal.calidad },
    enorme: { ancho: enorme.ancho, alto: enorme.alto, calidad: enorme.calidad, bytes: f.bytesDeDataUrl(enorme.dataUrl) },
    intentos: llamadas.length,
    camara: f.restriccionesDeCamara('environment'),
    viewport: [e.modulo('player/utils/sinZoomDePagina.ts').VIEWPORT_SIN_ZOOM, e.modulo('player/utils/sinZoomDePagina.ts').VIEWPORT_CON_ZOOM],
  }
}

Promise.resolve(salida._wakeLockPromesa)
  .then((wake) => {
    delete salida._wakeLockPromesa
    salida.wakeLock = wake
    console.log(JSON.stringify(salida))
  })
  .catch((error) => {
    console.error(error && error.stack ? error.stack : String(error))
    process.exit(1)
  })
