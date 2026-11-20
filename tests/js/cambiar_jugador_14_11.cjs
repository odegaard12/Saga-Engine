// 14/11: «Cambiar de jugador» no podía cambiar de jugador. Tras olvidar al recordado, el repintado de la partida llamaba a
// getPlayerNameFromLocation(), que lo volvía a escribir antes de que la navegación terminara. Ejecutado en Node con un
// navegador de mentira; imprime un JSON que comprueba tests/test_cambiar_jugador_14_11.py.
const path = require('path')
const RAIZ = path.resolve(__dirname, '..', '..')
const FRONT = path.join(RAIZ, 'frontend', 'src')
const { crearCargador } = require('./cargarTs.cjs')

function entorno(extra = {}) {
  const sandbox = { console, setTimeout, clearTimeout, URLSearchParams, ...extra }
  sandbox.globalThis = sandbox
  const cargar = crearCargador(sandbox)
  return { modulo: (r) => cargar(path.join(FRONT, r)) }
}

function navegador(pathname, search) {
  const datos = {}
  const localStorage = {
    getItem: (k) => (k in datos ? datos[k] : null),
    setItem: (k, v) => { datos[k] = String(v) },
    removeItem: (k) => { delete datos[k] },
  }
  const window = { localStorage, location: { pathname, search } }
  window.window = window
  return { window, localStorage, datos }
}

const CLAVE = 'saga_remembered_player'
const res = {}

// Entrar en la partida de SIM_01 lo recuerda.
{
  const nav = navegador('/player/SIM_01', '?user=SIM_01')
  const e = entorno({ window: nav.window, localStorage: nav.localStorage })
  const ruta = e.modulo('shared/playerRoute.ts')
  const rec = e.modulo('shared/jugadorRecordado.ts')
  res.nombre = ruta.getPlayerNameFromLocation()
  res.recordadoAlEntrar = rec.leerJugadorRecordado()
  // «Cambiar de jugador»: se olvida y, ANTES de que la navegación termine, la partida se repinta una o varias veces.
  rec.olvidarJugadorRecordado()
  for (let i = 0; i < 3; i += 1) ruta.getPlayerNameFromLocation()
  res.recordadoTrasRepintar = rec.leerJugadorRecordado()
  res.claveEnAlmacen = CLAVE in nav.datos
}

// Una página recién cargada (sin haber olvidado nada) sí recuerda: el nuevo jugador elegido queda recordado.
{
  const nav = navegador('/player/PRUEBA02', '')
  const e = entorno({ window: nav.window, localStorage: nav.localStorage })
  const ruta = e.modulo('shared/playerRoute.ts')
  const rec = e.modulo('shared/jugadorRecordado.ts')
  ruta.getPlayerNameFromLocation()
  res.otroJugador = rec.leerJugadorRecordado()
}

console.log(JSON.stringify(res))
