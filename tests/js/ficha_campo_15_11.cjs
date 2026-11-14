// 15/11: la ficha de campo y la lista con prioridad — piezas puras (chips, atención, resumen) y mensajes del panel.
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const RAIZ = path.resolve(__dirname, '..', '..')
const SRC = path.join(RAIZ, 'frontend', 'src')
const ts = require(path.join(RAIZ, 'frontend', 'node_modules', 'typescript'))

function cargarTS(abs, cache = new Map()) {
  if (cache.has(abs)) return cache.get(abs).exports
  const js = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const m = { exports: {} }
  cache.set(abs, m)
  const req = (spec) => {
    if (spec === 'react') return { useSyncExternalStore: () => [], useEffect() {}, useState: () => [] }
    if (!spec.startsWith('.')) throw new Error('módulo no resuelto: ' + spec)
    const p = path.resolve(path.dirname(abs), spec)
    for (const ext of ['.ts', '.tsx', '/index.ts']) if (fs.existsSync(p + ext)) return cargarTS(p + ext, cache)
    throw new Error('no existe ' + p)
  }
  vm.runInNewContext(js, { module: m, exports: m.exports, require: req, console, window: {}, document: {}, navigator: {} })
  return m.exports
}

const e = cargarTS(path.join(SRC, 'admin', 'lib', 'estadoDeJugador.ts'))
const m = cargarTS(path.join(SRC, 'admin', 'lib', 'mensajesDelPanel.ts'))
const SERVER_TS = 1_800_000_000
const vivo = (extra) => ({ user: 'A', presence: 'live', last_seen: SERVER_TS - 45, gps_status: 'ok', level: 4, ...extra })
const salida = {}

salida.nodo = [e.textoDeNodo(4, 13, 'Pulso de hierro', false), e.textoDeNodo(4, 13, null, false), e.textoDeNodo(13, 13, 'x', true)]

salida.presencia = [
  e.textoDePresencia('live', 45), e.textoDePresencia('live', 5),
  e.textoDePresencia('stale', 240),
  e.textoDePresencia('offline', 1500),
  e.textoDePresencia('offline', null),
]

salida.atencion = {
  normal: e.atencionDe({ vivo: vivo(), serverTs: SERVER_TS, terminado: false }),
  offline: e.atencionDe({ vivo: vivo({ presence: 'offline' }), serverTs: SERVER_TS, terminado: false }),
  gps: e.atencionDe({ vivo: vivo({ gps_status: 'denied' }), serverTs: SERVER_TS, terminado: false }),
  vieja: e.atencionDe({ vivo: vivo({ presence: 'stale' }), serverTs: SERVER_TS, terminado: false }),
  terminado: e.atencionDe({ vivo: vivo({ presence: 'offline' }), serverTs: SERVER_TS, terminado: true }),
  sinDatos: e.atencionDe({ vivo: undefined, serverTs: SERVER_TS, terminado: false }),
  atascado: e.atencionDe({ vivo: vivo({ en_nodo_desde: SERVER_TS - 30 * 60 }), serverTs: SERVER_TS, terminado: false }),
}

const filas = [
  { id: 'fin', a: 'terminado' },
  { id: 'ok1', a: 'normal' },
  { id: 'off', a: 'sin_conexion' },
  { id: 'ok2', a: 'normal' },
  { id: 'atasc', a: 'atascado' },
]
salida.orden = e.ordenarPorAtencion(filas, (f) => f.a).map((f) => f.id)
salida.resumen = e.resumenDeLista(filas.map((f) => f.a))

const chips = e.chipsDeJugador({ vivo: vivo({ precision_m: 8, en_nodo_desde: SERVER_TS - 7 * 60 }), serverTs: SERVER_TS, terminado: false, tiempoTexto: '6 min 48 s', estrellas: 3 })
salida.chips = chips.map((c) => `${c.clave}:${c.tono}:${c.texto}`)
salida.chipGpsFloja = e.chipDeGps(vivo({ precision_m: 120 }))
salida.chipsFilaTerminado = e.chipsDeFila({ vivo: vivo(), serverTs: SERVER_TS, terminado: true }).map((c) => c.texto)

salida.entrega = e.entregaDeNodo({ physical_node_kind: 'collectible', physical_item_id: 'llave', physical_item_label: 'Llave vieja' })
salida.entregaSinNodo = e.entregaDeNodo(undefined)

salida.mensajes = {
  avanza: m.textoDeResultado('level_next', 'Marta Rivas', 'un nodo adelante', { previous_level: 3, level: 4, entregado: [{ item_id: 'llave', label: 'Llave vieja', quantity: 1 }] }),
  conTiempo: m.textoDeResultado('level_next', 'Marta Rivas', 'un nodo adelante', { nodo_antes: { indice: 4, total: 13 }, nodo_despues: { indice: 5, total: 13 }, tiempo_cobrado_ms: 300000 }),
  repetida: m.textoDeResultado('level_prev', 'Marta Rivas', 'un nodo atrás', { previous_level: 4, level: 3 }, true),
  dar: m.textoDeResultado('give_item:casco', 'Marta Rivas', 'objeto entregado', { entregado: [{ label: 'Casco', quantity: 1 }], mueve_nivel: { de: 4, a: 5 } }),
  pendiente: m.textoDePendiente('Marta Rivas', 'un nodo adelante', 'sin_red'),
  opIdReusado: m.traducirDetalleDelServidor('op_id reused'),
  itemInvalido: m.traducirDetalleDelServidor('invalid item id'),
  desconocido: m.traducirDetalleDelServidor('algo raro'),
  tiempoElegido: [m.textoDeTiempoElegido({ modo: 'ninguno', ms: 0 }), m.textoDeTiempoElegido({ modo: 'respaldo', ms: 0 }), m.textoDeTiempoElegido({ modo: 'cifra', ms: 300000 })],
}

console.log(JSON.stringify(salida))
