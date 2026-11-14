// 14/11 (decisiones de Óscar): salidas de la app (umbral de 6 s, sospecha desde la segunda), Caza-Señales que devuelve el
// tiempo de una salida corta y entrada directa de la PWA en el jugador recordado. Ejecutado en Node con un navegador de
// mentira; imprime un JSON que comprueba tests/test_decisiones_14_11.py.
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
  const sandbox = { console, setTimeout, clearTimeout, AbortController, URLSearchParams, Promise, ...extra }
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
  return { modulo: (r) => cargar(path.join(FRONT, r)) }
}

function almacen(inicial = {}) {
  const datos = { ...inicial }
  return {
    getItem: (k) => (k in datos ? datos[k] : null),
    setItem: (k, v) => { datos[k] = String(v) },
    removeItem: (k) => { delete datos[k] },
    datos,
  }
}

async function correr() {
  const res = {}

  // 1) Salidas de la app: 5 s no cuenta, 7 s cuenta; la sospecha sólo desde la segunda salida del nodo.
  {
    const e = entorno()
    const n = e.modulo('player/hooks/salidasDeLaApp.ts')
    function salida(duraMs) {
      let t = 0
      const v = n.crearVigilanteDeSalidas({ ahora: () => t, permisoPropio: () => false, interaccionReciente: () => true, sinReto: () => false })
      v.empezar('salio_app')
      t += duraMs
      return v.terminar() !== null
    }
    res.salidas = {
      minimaMs: n.SALIDA_MINIMA_MS,
      de5s: salida(5_000),
      de5999: salida(5_999),
      de6000: salida(6_000),
      de7s: salida(7_000),
      penalizacionMs: n.PENALIZACION_POR_SALIDA_MS,
      sospecha: [0, 1, 2, 3].map((i) => n.debeReportarSospecha(i)),
    }
    // Dos salidas largas seguidas en el mismo nodo: la primera cuesta pero no se reporta; la segunda sí.
    let t = 0
    const v = n.crearVigilanteDeSalidas({ ahora: () => t, permisoPropio: () => false, interaccionReciente: () => true, sinReto: () => false })
    const eventos = []
    for (const dura of [7_000, 4_000, 8_000]) {
      v.empezar('salio_app'); t += dura
      const ev = v.terminar()
      if (ev) eventos.push(ev)
      t += 1_000
    }
    res.dosSalidas = {
      cuentan: eventos.length,
      reportadas: eventos.map((_, i) => n.debeReportarSospecha(i)),
    }
  }

  // 2) Caza-Señales: una salida corta devuelve el tiempo fuera; una larga no (esa ya cuenta y rehace el reto).
  {
    const e = entorno()
    const r = e.modulo('player/minigames/families/sparkRadar/reglas.ts')
    res.radar = {
      corta3s: r.finTrasSalida(100_000, 10_000, 13_000, 6_000),
      justoMenos: r.finTrasSalida(100_000, 10_000, 15_999, 6_000),
      larga6s: r.finTrasSalida(100_000, 10_000, 16_000, 6_000),
      larga20s: r.finTrasSalida(100_000, 10_000, 30_000, 6_000),
      sinTiempo: r.finTrasSalida(100_000, 10_000, 10_000, 6_000),
      relojAtras: r.finTrasSalida(100_000, 10_000, 9_000, 6_000),
    }
  }

  // 3) Entrada directa de la PWA en el jugador recordado.
  {
    const ls = almacen({ saga_remembered_player: '  Ana  ' })
    const e = entorno({ window: { localStorage: ls } })
    const m = e.modulo('shared/jugadorRecordado.ts')
    res.recordado = {
      leido: m.leerJugadorRecordado(),
      posible: {
        portada: m.entradaDirectaPosible('/', '', 'Ana'),
        portadaPlayer: m.entradaDirectaPosible('/player/', '', 'Ana'),
        sinRecordado: m.entradaDirectaPosible('/', '', null),
        conPin: m.entradaDirectaPosible('/', '?pin=1234', 'Ana'),
        conCambiar: m.entradaDirectaPosible('/player/', '?cambiar=1', 'Ana'),
        enOtraRuta: m.entradaDirectaPosible('/player/Ana', '', 'Ana'),
        enAdmin: m.entradaDirectaPosible('/admin-react', '', 'Ana'),
      },
    }
    m.olvidarJugadorRecordado()
    res.recordado.trasOlvidar = m.leerJugadorRecordado()

    const respuesta = (status) => async () => ({ ok: status >= 200 && status < 300, status })
    const colgado = () => (url, opciones) => new Promise((_, rechazar) => { opciones.signal.addEventListener('abort', () => rechazar(new Error('abortado'))) })
    const pedidas = []
    const espia = async (url, opciones) => { pedidas.push({ url, cache: opciones.cache }); return { ok: true, status: 200 } }
    res.recordado.sesion = {
      valida: await m.comprobarSesionDelJugador('Ana', 50, respuesta(200)),
      sin403: await m.comprobarSesionDelJugador('Ana', 50, respuesta(403)),
      sin401: await m.comprobarSesionDelJugador('Ana', 50, respuesta(401)),
      sin404: await m.comprobarSesionDelJugador('Ana', 50, respuesta(404)),
      servidorCaido: await m.comprobarSesionDelJugador('Ana', 50, respuesta(502)),
      redCaida: await m.comprobarSesionDelJugador('Ana', 50, async () => { throw new TypeError('Failed to fetch') }),
      tiempoAgotado: await m.comprobarSesionDelJugador('Ana', 30, colgado()),
    }
    await m.comprobarSesionDelJugador('Ana López', 50, espia)
    res.recordado.pedida = pedidas[0]

    // 14/11: mira el paquete guardado de verdad (IndexedDB), con el lector inyectado: sólo Ana lo tiene.
    const guardados = new Set(['Ana'])
    const leer = async (id) => (guardados.has(id) ? { payload: {} } : null)
    res.recordado.datosSinRed = { ana: await m.tieneDatosSinRed('Ana', leer), luis: await m.tieneDatosSinRed('Luis', leer), otro: await m.tieneDatosSinRed('Eva', leer) }
    res.recordado.decision = {
      valida: m.decidirEntrada('valida', false),
      invalidaConDatos: m.decidirEntrada('invalida', true),
      sinRedConDatos: m.decidirEntrada('sin-red', true),
      sinRedSinDatos: m.decidirEntrada('sin-red', false),
    }
  }
  return res
}
correr().then((r) => console.log(JSON.stringify(r))).catch((x) => { console.error(x && x.stack ? x.stack : String(x)); process.exit(1) })
