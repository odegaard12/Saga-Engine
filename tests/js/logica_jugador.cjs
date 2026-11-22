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
const path = require('path')

const RAIZ = path.resolve(__dirname, '..', '..')
const FRONT = path.join(RAIZ, 'frontend', 'src')
const { crearCargador } = require('./cargarTs.cjs')


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
  const cargar = crearCargador(sandbox)
  const contexto = cargar.contexto


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
// 1. Salidas de la app (autobloqueo, permisos, reglas, 6 s).
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
    // Se fue de verdad: tocó la pantalla hace 2 s y estuvo fuera 7 s.
    deliberada: caso({ toqueHaceMs: 2_000, duraMs: 7_000 }),
    // El móvil se apagó solo: la última pulsación era de hace 40 s.
    autobloqueo: caso({ toqueHaceMs: 40_000, duraMs: 60_000 }),
    // Justo en el borde de la ventana de interacción.
    bordeVentanaDentro: caso({ toqueHaceMs: n.VENTANA_INTERACCION_MS - 1, duraMs: 7_000 }),
    bordeVentanaFuera: caso({ toqueHaceMs: n.VENTANA_INTERACCION_MS, duraMs: 7_000 }),
    // La regla del umbral mínimo (14/11: 6 s, antes 1,5 s).
    cortaMenosDe6000: caso({ toqueHaceMs: 1_000, duraMs: 5_999 }),
    justo6000: caso({ toqueHaceMs: 1_000, duraMs: 6_000 }),
    // La propia app pidiendo un permiso.
    permisoPropio: caso({ toqueHaceMs: 500, duraMs: 8_000, permiso: true }),
    // Pantalla de reglas / resultado.
    sinReto: caso({ toqueHaceMs: 500, duraMs: 8_000, sinReto: true }),
    // Multitarea de Android (blur sin hidden).
    selectorApps: caso({ toqueHaceMs: 500, duraMs: 7_000, motivo: 'selector_apps' }),
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
    t += 7_000
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
    t += 7_000
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

  // Pantalla final: a igual tiempo gana quien acabó antes (finished_at del servidor, en ms).
  const finalEmpatado = nombres(
    c.ordenarPorTiempoTotal([
      p('Zeta', { finished: true, total_time_ms: 700_000, finished_at: 1_790_000_200_000 }),
      p('Beta', { finished: true, total_time_ms: 700_000, finished_at: 1_790_000_300_000 }),
      p('SinHora', { finished: true, total_time_ms: 700_000 }),
    ])
  )

  salida.clasificacion = {
    finalEmpatado,
    finalConCero: nombres(finalConCero),
    finalConCeroAlReves: nombres(finalConCeroAlReves),
    finalSinNumeros: nombres(finalSinNumeros),
    empateTresLatidos,
    empateAlReves,
    mismoNombre,
    porHoraDeFin,
    ordenGeneral,
    // Los mismos cuatro jugadores que tests/test_revision_19_10_servidor.py
    // pone en el panel de Tiempos y en la exportación: los tres sitios, un orden.
    totalCero: nombres(
      c.ordenarClasificacion([
        p('SIN_EMPEZAR', { level: 0, total_time_ms: 0 }),
        p('EMPEZADO', { level: 0, total_time_ms: 0 }),
        p('CERO', { finished: true, level: 6, total_time_ms: 0 }),
        p('CINCO', { finished: true, level: 6, total_time_ms: 5_000 }),
      ])
    ),
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
  const planos = { es: hojasDeTextos(todos.es), gl: hojasDeTextos(todos.gl) }
  const clavesEs = Object.keys(planos.es).sort()
  const diferencias = {}
  for (const idioma of ['gl']) {
    const claves = Object.keys(planos[idioma]).sort()
    diferencias[idioma] = {
      faltan: clavesEs.filter((k) => !claves.includes(k)),
      sobran: claves.filter((k) => !clavesEs.includes(k)),
    }
  }
  const vacios = {}
  for (const idioma of ['es', 'gl']) {
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
  for (const idioma of ['es', 'gl']) {
    const x = todos[idioma]
    conDatos[idioma] = {
      salioApp: x.antiTrampas.salioApp(30),
      selectorApps: x.antiTrampas.selectorApps(30),
      circuitoQuedan1: x.circuit.marca(1),
      circuitoQuedan3: x.circuit.marca(3),
    }
  }

  // Los avisos de anti-trampas se distinguen y llevan los 30 s.
  const distintos = new Set(['es', 'gl'].map((i) => todos[i].antiTrampas.salioApp(30)))

  const p = e.modulo('player/components/textosDePantallas.ts')
  const pantallas = p.TEXTOS_DE_PANTALLAS
  const conDatosPantallas = {}
  for (const idioma of ['es', 'gl']) {
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
    cerrarEnLosTres: [todos.es.hoja.cerrar, todos.gl.hoja.cerrar],
    coloresSimon: [todos.es.coloresDePulso.length, todos.gl.coloresDePulso.length],
  }
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
  const casi = j('c', yo.lat + 0.000018, yo.lon) // ~2 m
  const lejos = j('d', yo.lat + 0.005, yo.lon) // ~550 m
  const propio = j('yo', yo.lat, yo.lon, { is_self: true })
  // 11/11: el plan es siempre el de retratos (medido en pantalla): los que se taparían, en racimo; el resto, en su sitio.
  const plan19 = m.planDeJugadores([encima, otroEncima, casi, lejos, propio], 19)
  const por = (plan, user) => plan.find((x) => x.jugadores.some((q) => q.user === user))
  const plan14 = m.planDeJugadores([j('e', yo.lat + 0.01, yo.lon), j('f', yo.lat + 0.0101, yo.lon)], 14)
  const plan18 = m.planDeJugadores([j('g', 42.5, -8.6), j('h', 42.5, -8.6)], 18)
  const corro = (plan, user) => por(plan, user).corro
  const largo = (c) => Math.hypot(c.este, c.norte)
  // 5.52, el «arrastre»: un compañero QUIETO mientras tú andas 50 m (sin estar a su lado). Su sitio dibujado (punto
  // real + corro) es el mismo en cada paso tuyo.
  const quieto = j('q', 42.5, -8.6)
  const sitioDe = (plan, user) => m.conCorro(por(plan, user), corro(plan, user))
  const pasos = [0, 10, 20, 30, 40, 50].map((metros) => {
    const tu = j('yo', 42.5 + metros / 111320, -8.6, { is_self: true })
    const plan = m.planDeJugadores([quieto, tu], 19.5)
    return sitioDe(plan, 'q')
  })
  // Dos que coinciden: lado a lado, simétricos; igual aunque cambie el orden de la lista o llegue otro lejos.
  const par = [j('k1', 42.5, -8.6), j('k2', 42.5 + 0.000005, -8.6)]
  const parA = m.planDeJugadores(par, 18)
  const parB = m.planDeJugadores([...par].reverse().concat([j('z', 42.51, -8.6)]), 18)
  // En anchos de retrato (lo que mide el plan): cuánto se aparta cada uno a este zoom.
  const enRetratos = (c, zoom, lat) => Math.round((largo(c) / (m.anchoDeRetratoPx(zoom) * m.metrosPorPixel(zoom, lat))) * 100) / 100
  salida.mapaSolape = {
    n19: plan19.length,
    sinPropio: plan19.every((x) => x.jugadores[0].user !== 'yo'),
    // a, b y c se taparían: racimo de tres (cada uno a ~0,55 retratos del centro); d, lejos, en su sitio.
    corroEncima: enRetratos(corro(plan19, 'a'), 19, yo.lat),
    corroOtroEncima: enRetratos(corro(plan19, 'b'), 19, yo.lat),
    corroCasi: enRetratos(corro(plan19, 'c'), 19, yo.lat),
    corroLejos: largo(corro(plan19, 'd')),
    distintosEnCorro: new Set(['a', 'b', 'c'].map((u) => JSON.stringify(corro(plan19, u)))).size,
    // La coordenada del elemento es la REAL; el corro va aparte, en metros.
    coordenadasIntactas: plan19.every((x) => {
      const o = x.jugadores[0]
      return x.lat === o.lat && x.lon === o.lon
    }),
    // Dos a 11 m a zoom 14 se taparían: dos retratos lado a lado (ya no un icono de grupo: eso, con más de 10).
    grupoZoom14: plan14.map((x) => [x.tipo, x.jugadores.length]),
    separadosZoom14: Math.round((m.distanciaEnMetros(sitioDe(plan14, 'e'), sitioDe(plan14, 'f')) / (m.anchoDeRetratoPx(14) * m.metrosPorPixel(14, yo.lat))) * 100) / 100,
    porSeparadoZoom18: plan18.map((x) => [x.tipo, enRetratos(x.corro, 18, 42.5), x.lat, x.lon]),
    quietoMientrasAndas: pasos.map((p) => m.distanciaEnMetros(p, pasos[0])),
    // Al centímetro: la latitud media del plan cambia con el tercero y mueve el metro por píxel una pizca.
    parIgualEnCualquierOrden: ['k1', 'k2'].every((u) => Math.abs(corro(parA, u).este - corro(parB, u).este) < 0.01 && Math.abs(corro(parA, u).norte - corro(parB, u).norte) < 0.01),
    parSimetrico: Math.abs(corro(parA, 'k1').este + corro(parA, 'k2').este) < 1e-3 && Math.abs(corro(parA, 'k1').norte + corro(parA, 'k2').norte) < 1e-3,
    loLejanoNoTocaElCorro: largo(corro(parB, 'z')),
    // Se juntan los que se TAPARÍAN en pantalla: a ~700 m, sí a zoom 11 (un retrato son ~2,6 km) y no a zoom 13.
    a700mZ11: m.planDeJugadores([j('p', 42.5, -8.6), j('q', 42.5 + 0.0063, -8.6)], 11).map((x) => [x.tipo, x.jugadores.length, largo(x.corro) > 0]),
    a700mZ13: m.planDeJugadores([j('p', 42.5, -8.6), j('q', 42.5 + 0.0063, -8.6)], 13).map((x) => [x.tipo, x.jugadores.length, largo(x.corro) > 0]),
    a50mZ16: m.planDeJugadores([j('p', 42.5, -8.6), j('q', 42.5 + 0.00045, -8.6)], 17).map((x) => [x.tipo, x.jugadores.length, largo(x.corro) > 0]),
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
  const enorme = f.codificarConTope(4032, 3024, pesado, 500_000)
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
