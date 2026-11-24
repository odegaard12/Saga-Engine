// 24/11 (acceso al panel con poca cobertura): el script en línea de admin.html (el formulario que se pinta antes que el
// código) y `tomarLoginAdelantado` (adminApi.ts), que recoge el login que ese script ya mandó. Navegador de mentira;
// imprime un JSON que comprueba tests/test_acceso_rapido_panel_24_11.py.
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const { crearCargador } = require('./cargarTs.cjs')

const RAIZ = path.resolve(__dirname, '..', '..')
const html = fs.readFileSync(path.join(RAIZ, 'frontend', 'admin.html'), 'utf8')
const script = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).filter((s) => s.trim())

function pagina(clave) {
  const oyentes = {}
  const al = (nombre) => (tipo, fn) => { oyentes[nombre + ':' + tipo] = fn }
  const clave_ = { value: clave, type: 'password', readOnly: false }
  const ver = { textContent: 'Ver', attrs: {}, addEventListener: al('ver'), setAttribute(k, v) { this.attrs[k] = v } }
  const boton = { disabled: false, textContent: 'Entrar' }
  const attrs = {}
  const form = {
    elements: { namedItem: (n) => ({ password: clave_, ver, mantener: { checked: true } })[n] },
    addEventListener: al('form'),
    setAttribute: (k, v) => { attrs[k] = v },
    getAttribute: (k) => attrs[k] ?? null,
    querySelector: () => boton,
  }
  const pedidos = []
  const win = {}
  const ctx = vm.createContext({
    document: { getElementById: (id) => (id === 'saga-entrada-previa' ? form : null) },
    window: win,
    JSON,
    String,
    fetch: (url, init) => { pedidos.push({ url, init }); return Promise.resolve({ ok: true }) },
  })
  vm.runInContext(script[0], ctx)
  let prevenidos = 0
  const enviar = () => oyentes['form:submit']({ preventDefault: () => { prevenidos += 1 } })
  return { oyentes, clave_, ver, boton, attrs, pedidos, win, enviar, prevenidos: () => prevenidos }
}

async function correr() {
  const res = { scripts: script.length }

  // Entrar: no navega, manda UN login (aunque se pulse dos veces) con la clave recortada, «mantener» y arranque.
  const p = pagina('  prueba-1234 ')
  p.oyentes['ver:click']()
  res.verMuestra = p.clave_.type === 'text' && p.ver.textContent === 'Ocultar' && p.ver.attrs['aria-pressed'] === 'true'
  p.enviar(); p.enviar()
  res.prevenidos = p.prevenidos()
  res.pedidos = p.pedidos.map((x) => ({ url: x.url, metodo: x.init.method, cred: x.init.credentials, cuerpo: JSON.parse(x.init.body) }))
  res.enviado = p.attrs['data-enviado']
  res.soloLectura = p.clave_.readOnly
  res.boton = { apagado: p.boton.disabled, texto: p.boton.textContent }
  res.promesaGuardada = typeof p.win.__sagaLoginPrevio?.then === 'function'

  // Sin clave no se manda nada.
  const vacia = pagina('   ')
  vacia.enviar()
  res.vaciaPedidos = vacia.pedidos.length
  res.vaciaEnviado = vacia.attrs['data-enviado'] ?? null

  // tomarLoginAdelantado: una sola vez, y los errores como los de loginAdmin (con su estado, para el bloqueo).
  const win = { dispatchEvent: () => true }
  const cargar = crearCargador(vm.createContext({ console, window: win, CustomEvent: class { constructor(t, i) { this.type = t; this.detail = i && i.detail } } }))
  const api = cargar(path.join(RAIZ, 'frontend', 'src', 'admin', 'lib', 'adminApi.ts'))
  res.sinPrevio = api.tomarLoginAdelantado() === null
  win.__sagaLoginPrevio = Promise.resolve({ ok: true, json: async () => ({ status: 'ok', session_expires_at: 9 }) })
  res.bueno = await api.tomarLoginAdelantado()
  res.segundaVez = api.tomarLoginAdelantado() === null
  win.__sagaLoginPrevio = Promise.resolve({ ok: false, status: 429, json: async () => ({ detail: 'locked:30' }) })
  try {
    await api.tomarLoginAdelantado()
    res.error = null
  } catch (e) {
    res.error = { status: e.status, detail: e.detail }
  }
  console.log(JSON.stringify(res))
}

correr().catch((e) => { console.error(e); process.exit(1) })
