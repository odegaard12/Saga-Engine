// 14/11 (admin con poca cobertura): la cola de acciones del panel, con un `fetch` falso y un servidor falso que aplica una vez
// por `op_id`. Carga los .ts reales (transpilados) con un `require` que resuelve rutas relativas.
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const RAIZ = path.resolve(__dirname, '..', '..')
const SRC = path.join(RAIZ, 'frontend', 'src')
const ts = require(path.join(RAIZ, 'frontend', 'node_modules', 'typescript'))

function cargarTS(abs, ctx, cache = new Map()) {
  if (cache.has(abs)) return cache.get(abs).exports
  const js = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const m = { exports: {} }
  cache.set(abs, m)
  const req = (spec) => {
    if (spec === 'react') return { useSyncExternalStore: () => [] }
    if (!spec.startsWith('.')) throw new Error('módulo no resuelto: ' + spec)
    const p = path.resolve(path.dirname(abs), spec)
    for (const ext of ['.ts', '.tsx', '/index.ts']) if (fs.existsSync(p + ext)) return cargarTS(p + ext, ctx, cache)
    throw new Error('no existe ' + p)
  }
  vm.runInNewContext(js, { module: m, exports: m.exports, require: req, console, ...ctx })
  return m.exports
}

function almacen() {
  const d = new Map()
  return {
    getItem: (k) => (d.has(k) ? d.get(k) : null),
    setItem: (k, v) => d.set(k, String(v)),
    removeItem: (k) => d.delete(k),
    _d: d,
  }
}

// Respuestas
const json = (status, cuerpo) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => cuerpo,
  text: async () => JSON.stringify(cuerpo),
})

/**
 * Un servidor falso con la idempotencia de verdad: aplica UNA vez por (jugador, op_id) y repite el resultado anotado.
 * `plan` es lo que pasa con cada petición, en orden: 'ok' | 'red' (no llega) | 'perdida' (se aplica y la respuesta se
 * pierde) | 'sesion' (403) | 'servidor' (502) | 'no_existe' (404) | 'cortada' (200 con cuerpo roto).
 */
function montar({ plan = [], onLine = true } = {}) {
  const llamadas = []
  const aplicadas = new Map()
  const niveles = {}
  const esperas = []
  let i = 0
  const fetchFalso = async (url, init) => {
    const cuerpo = JSON.parse(init.body)
    llamadas.push({ url, cuerpo })
    const paso = plan[i] ?? 'ok'
    i += 1
    if (paso === 'red') throw new TypeError('Failed to fetch')
    if (paso === 'sesion') return json(403, { detail: 'forbidden' })
    if (paso === 'servidor') return json(502, {})
    if (paso === 'no_existe') return json(404, { detail: 'unknown profile' })
    if (paso === 'colgada') {
      return new Promise((_, rechazar) => init.signal.addEventListener('abort', () => rechazar(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
    }
    const clave = cuerpo.profile_id + '|' + cuerpo.op_id
    let resultado
    let repetida = false
    if (aplicadas.has(clave)) {
      resultado = aplicadas.get(clave)
      repetida = true
    } else {
      if (cuerpo.action === 'level_next') niveles[cuerpo.profile_id] = (niveles[cuerpo.profile_id] || 0) + 1
      if (cuerpo.action === 'level_prev') niveles[cuerpo.profile_id] = Math.max(0, (niveles[cuerpo.profile_id] || 0) - 1)
      resultado = { status: 'ok', profile_id: cuerpo.profile_id, action: cuerpo.action || 'ajuste_de_tiempo', level: niveles[cuerpo.profile_id] || 0 }
      aplicadas.set(clave, resultado)
    }
    if (paso === 'perdida') throw new TypeError('Failed to fetch')
    if (paso === 'cortada') return { ok: true, status: 200, json: async () => { throw new SyntaxError('truncado') } }
    return json(200, { ...resultado, ...(repetida ? { repetida: true } : {}) })
  }
  const ctx = {
    fetch: fetchFalso,
    localStorage: almacen(),
    navigator: { get onLine() { return onLine } },
    AbortController,
    setTimeout,
    clearTimeout,
    CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail } },
    window: { dispatchEvent() {}, addEventListener() {} },
    document: { visibilityState: 'visible', addEventListener() {} },
    crypto: { randomUUID: () => 'aaaaaaaa-bbbb-cccc-dddd-' + Math.random().toString(16).slice(2, 14) },
    globalThis: undefined,
  }
  ctx.globalThis = ctx
  const mod = cargarTS(path.join(SRC, 'admin', 'lib', 'accionesDeJugador.ts'), ctx)
  mod.entorno.esperar = async (ms) => { esperas.push(ms) }
  mod.entorno.tiempoEsperaMs = 40
  const eventos = []
  mod.suscribirOperaciones((e) => eventos.push(e.tipo + ':' + e.op.accion + (e.repetida ? ':repetida' : '')))
  return { mod, ctx, llamadas, niveles, esperas, eventos, ponerOnLine: (v) => { onLine = v } }
}

const perfil = (accion, extra = {}) => ({ tipo: 'perfil', profileId: 'ANA', accion, cuerpo: { profile_id: 'ANA', action: accion }, etiqueta: accion, ...extra })
const salida = {}

;(async () => {
  // 1. Camino feliz: un POST con op_id, resuelve «hecha» y la cola queda vacía.
  {
    const s = montar()
    const r = await s.mod.lanzarOperacion(perfil('level_next'))
    salida.feliz = { estado: r.estado, nivel: r.data && r.data.level, peticiones: s.llamadas.length, conOpId: /^op-/.test(s.llamadas[0].cuerpo.op_id), cola: s.mod.operacionesPendientes().length, eventos: s.eventos }
  }

  // 2. Dos fallos de red y luego bien: el MISMO op_id en los tres intentos, esperas crecientes y avanza UNA vez.
  {
    const s = montar({ plan: ['red', 'red', 'ok'] })
    const r = await s.mod.lanzarOperacion(perfil('level_next'))
    const ids = [...new Set(s.llamadas.map((c) => c.cuerpo.op_id))]
    salida.reintento = { estado: r.estado, peticiones: s.llamadas.length, idsDistintos: ids.length, esperas: s.esperas, nivel: s.niveles.ANA }
  }

  // 3. LA RESPUESTA SE PIERDE tras aplicarse: el reintento no repite; el nivel sube 1 y no 2.
  {
    const s = montar({ plan: ['perdida', 'ok'] })
    const r = await s.mod.lanzarOperacion(perfil('level_next'))
    salida.respuestaPerdida = { estado: r.estado, repetida: r.repetida, nivel: s.niveles.ANA, peticiones: s.llamadas.length, eventos: s.eventos }
  }

  // 4. Cuerpo cortado a la mitad con 200: se trata como fallo de red y se reintenta (idempotente).
  {
    const s = montar({ plan: ['cortada', 'ok'] })
    const r = await s.mod.lanzarOperacion(perfil('level_next'))
    salida.cuerpoCortado = { estado: r.estado, repetida: r.repetida, nivel: s.niveles.ANA }
  }

  // 5. Todo falla: queda PENDIENTE, guardada en el navegador; al volver la red se envía sola y sube UNA vez.
  {
    const s = montar({ plan: ['red', 'red', 'red', 'red'] })
    const r = await s.mod.lanzarOperacion(perfil('level_next'))
    const guardada = JSON.parse(s.ctx.localStorage.getItem('saga-admin-cola-v1') || '[]')
    const antes = { estado: r.estado, motivo: r.motivo, guardadas: guardada.length, enCola: guardada[0] && guardada[0].enCola, intentos: s.llamadas.length, nivel: s.niveles.ANA || 0 }
    await s.mod.procesarCola()
    salida.pendienteYVuelta = { antes, despues: { cola: s.mod.operacionesPendientes().length, nivel: s.niveles.ANA, eventos: s.eventos } }
  }

  // 6. Sobrevive a recargar la página: otra instancia del módulo lee la cola guardada y la envía.
  {
    const s = montar({ plan: ['red', 'red', 'red', 'red'] })
    await s.mod.lanzarOperacion(perfil('level_next'))
    const guardado = s.ctx.localStorage.getItem('saga-admin-cola-v1')
    const nuevo = montar()
    nuevo.ctx.localStorage.setItem('saga-admin-cola-v1', guardado)
    nuevo.mod.recargarColaGuardada()
    const leidas = nuevo.mod.operacionesPendientes().length
    await nuevo.mod.procesarCola()
    salida.recarga = { leidas, trasEnviar: nuevo.mod.operacionesPendientes().length, nivel: nuevo.niveles.ANA, eventos: nuevo.eventos }
  }

  // 7. Sin red desde el principio: pendiente al momento, SIN ninguna petición.
  {
    const s = montar({ onLine: false })
    const r = await s.mod.lanzarOperacion(perfil('level_next'))
    salida.sinRed = { estado: r.estado, motivo: r.motivo, peticiones: s.llamadas.length, cola: s.mod.operacionesPendientes().length }
  }

  // 8. Sesión caducada (403): no insiste; queda esperando hasta reanudar (volver a entrar).
  {
    const s = montar({ plan: ['sesion', 'ok'] })
    const r = await s.mod.lanzarOperacion(perfil('level_next'))
    const trasPrimera = s.llamadas.length
    const enPausa = s.mod.colaEnPausaPorSesion()
    const trasPrimeraCola = { cola: s.mod.operacionesPendientes().length, nivel: s.niveles.ANA || 0 }
    s.mod.reanudarCola() // el organizador vuelve a entrar
    await new Promise((r2) => setTimeout(r2, 20))
    salida.sesionCaducada = { estado: r.estado, motivo: r.motivo, peticionesTrasPrimera: trasPrimera, enPausa, trasPrimeraCola, pausaTrasReanudar: s.mod.colaEnPausaPorSesion(), trasReanudar: { cola: s.mod.operacionesPendientes().length, nivel: s.niveles.ANA || 0 } }
  }

  // 9. Rechazo definitivo (404): no se reintenta ni se queda en la cola.
  {
    const s = montar({ plan: ['no_existe'] })
    const r = await s.mod.lanzarOperacion(perfil('level_next'))
    salida.rechazo = { estado: r.estado, httpStatus: r.httpStatus, peticiones: s.llamadas.length, cola: s.mod.operacionesPendientes().length, texto: r.error }
  }

  // 10. Servidor reiniciando (502): se reintenta y acaba pendiente si sigue.
  {
    const s = montar({ plan: ['servidor', 'servidor', 'servidor', 'servidor'] })
    const r = await s.mod.lanzarOperacion(perfil('level_next'))
    salida.servidor502 = { estado: r.estado, motivo: r.motivo, peticiones: s.llamadas.length }
  }

  // 11. Más de 25 s (aquí 40 ms) sin respuesta: se aborta y se reintenta.
  {
    const s = montar({ plan: ['colgada', 'ok'] })
    const r = await s.mod.lanzarOperacion(perfil('level_next'))
    salida.tiempoAgotado = { estado: r.estado, peticiones: s.llamadas.length, nivel: s.niveles.ANA }
  }

  // 12. Orden: «+1» pendiente y luego «−1» del mismo jugador: la segunda va DETRÁS, no se adelanta; se envían en orden.
  {
    const s = montar({ plan: ['red', 'red', 'red', 'red'] })
    await s.mod.lanzarOperacion(perfil('level_next'))
    const n1 = s.llamadas.length
    const r2 = await s.mod.lanzarOperacion(perfil('level_prev'))
    const trasSegunda = { estado: r2.estado, peticionesNuevas: s.llamadas.length - n1, cola: s.mod.operacionesPendientes().map((o) => o.accion) }
    await s.mod.procesarCola()
    salida.orden = { trasSegunda, enviadas: s.llamadas.slice(n1).map((c) => c.cuerpo.action), cola: s.mod.operacionesPendientes().length, nivel: s.niveles.ANA }
  }

  // 13. Descartar una pendiente: no se envía.
  {
    const s = montar({ plan: ['red', 'red', 'red', 'red'] })
    await s.mod.lanzarOperacion(perfil('level_next'))
    const op = s.mod.operacionesPendientes()[0]
    s.mod.descartarOperacion(op.opId)
    await s.mod.procesarCola()
    salida.descartar = { cola: s.mod.operacionesPendientes().length, nivel: s.niveles.ANA || 0 }
  }

  // 14. Almacenamiento lleno: la cola sigue viva en memoria y se avisa de que no se puede guardar.
  {
    const s = montar({ plan: ['red', 'red', 'red', 'red'] })
    s.ctx.localStorage.setItem = () => { throw new Error('QuotaExceededError') }
    await s.mod.lanzarOperacion(perfil('level_next'))
    salida.almacenLleno = { cola: s.mod.operacionesPendientes().length, noSePuedeGuardar: s.mod.colaNoSePuedeGuardar() }
  }

  // 15. Sumar tiempo por el mismo camino (otra URL) con su op_id.
  {
    const s = montar({ plan: ['perdida', 'ok'] })
    const r = await s.mod.lanzarOperacion({ tipo: 'tiempo', profileId: 'ANA', accion: 'ajuste_de_tiempo', cuerpo: { profile_id: 'ANA', segundos: 45 }, etiqueta: 'sumar 45 s' })
    salida.tiempo = { estado: r.estado, repetida: r.repetida, url: s.llamadas[0].url, segundos: s.llamadas[0].cuerpo.segundos, mismoOp: s.llamadas[0].cuerpo.op_id === s.llamadas[1].cuerpo.op_id }
  }

  // 16. Piezas puras: leer segundos, etiquetas y la foto.
  {
    const ctx = {}
    const aj = cargarTS(path.join(SRC, 'admin', 'lib', 'ajusteDeTiempo.ts'), ctx)
    const ve = cargarTS(path.join(SRC, 'admin', 'lib', 'adminConfigVerify.ts'), ctx)
    salida.puras = {
      leer: ['45', '-30', '1:30', '+2:00', '−45', '0', '', 'abc', '1:99', '99999999', ' 12,5 '].map((t) => aj.leerSegundos(t)),
      etiquetas: [45, 60, 90, 3725, 7200].map(aj.etiquetaDeSegundos),
      ajustes: [0, 45000, -60000, 90000].map(aj.ajusteConSigno),
      pregunta: aj.preguntaDeAjuste('Ana', -30, 'se equivocó'),
      foto: {
        igual: ve.mismaFoto('/api/admin/foto/A?v=1', '/api/admin/foto/A?v=1'),
        nuevaVuelveComoUrl: ve.mismaFoto('data:image/jpeg;base64,AAAA', '/api/admin/foto/A?v=1'),
        nuevaTirada: ve.mismaFoto('data:image/jpeg;base64,AAAA', ''),
        cambiaUrl: ve.mismaFoto('/api/admin/foto/A?v=1', '/api/admin/foto/B?v=2'),
        quitada: ve.mismaFoto('', '/api/admin/foto/A?v=1'),
      },
    }
  }

  // 17. 15/11: recarga A MITAD de los reintentos inmediatos (la operación se guardó sin `enCola`): la nueva página la lee,
  // la considera en cola y la envía UNA vez con el mismo op_id.
  {
    const s = montar({ plan: ['red'] })
    s.mod.entorno.esperar = () => new Promise(() => {}) // se queda esperando entre intentos, como los 1,5 s reales
    s.mod.lanzarOperacion({ tipo: 'tiempo', profileId: 'ANA', accion: 'ajuste_de_tiempo', cuerpo: { profile_id: 'ANA', segundos: 60 }, etiqueta: 'sumar 1 min' })
    await new Promise((r) => setTimeout(r, 20))
    const guardado = s.ctx.localStorage.getItem('saga-admin-cola-v1')
    const opGuardada = JSON.parse(guardado)[0]
    const nuevo = montar()
    nuevo.ctx.localStorage.setItem('saga-admin-cola-v1', guardado)
    nuevo.mod.recargarColaGuardada()
    const leidas = nuevo.mod.operacionesPendientes()
    await nuevo.mod.procesarCola()
    salida.recargaAMitad = {
      guardadaSinEnCola: !opGuardada.enCola,
      leidasEnCola: leidas.length === 1 && leidas[0].enCola === true,
      peticiones: nuevo.llamadas.length,
      mismoOp: nuevo.llamadas[0] && nuevo.llamadas[0].cuerpo.op_id === opGuardada.opId,
      cola: nuevo.mod.operacionesPendientes().length,
      eventos: nuevo.eventos,
    }
  }

  console.log(JSON.stringify(salida))
  // Los relojes de la cola (reintentos de 10-60 s) mantendrían vivo el proceso: ya está todo dicho.
  process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })
