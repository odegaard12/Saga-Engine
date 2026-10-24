// Revisión del 24/10/2026 del panel del organizador. Ejecuta los módulos TS tal cual (entorno_navegador.cjs) y
// vuelca en JSON lo que hacen; lo comprueba tests/test_panel_24_10_js.py.
'use strict'

const { crearEntorno } = require('./entorno_navegador.cjs')

const espera = (ms) => new Promise((r) => setTimeout(r, ms))

/*
 * El sondeo del estado en vivo: uno solo para todos los que miran, parado con la pestaña oculta, pide al volver,
 * sin red se queda lo último bueno (y cuenta el fallo), y se para cuando ya no mira nadie.
 * En este entorno los temporizadores de más de 100 ms duran 200 ms.
 */
async function sondeo() {
  const e = crearEntorno()
  let pedidas = 0
  let sinRed = false
  e.servidor = (url) => {
    if (url.pathname !== '/api/admin/mission-status') return new Response('{}', { status: 404 })
    pedidas += 1
    if (sinRed) return null
    const cuerpo = { status: 'ok', server_ts: 5000, profiles: [{ user: 'A', level: pedidas }] }
    return new Response(JSON.stringify(cuerpo), { headers: { 'Content-Type': 'application/json' } })
  }
  const m = e.cargar('src/admin/lib/estadoEnVivo.ts')
  const uno = []
  const dos = []
  const quitarUno = m.suscribirEstadoEnVivo((s) => uno.push(s))
  const quitarDos = m.suscribirEstadoEnVivo((s) => dos.push(s))
  await espera(60)
  const trasSuscribirDos = pedidas

  const visibilidad = e.eventosDeDocumento.filter(([tipo]) => tipo === 'visibilitychange').map(([, fn]) => fn)
  e.sandbox.document.visibilityState = 'hidden'
  visibilidad.forEach((fn) => fn())
  await espera(500)
  const conLaPestanaOculta = pedidas - trasSuscribirDos

  e.sandbox.document.visibilityState = 'visible'
  visibilidad.forEach((fn) => fn())
  await espera(60)
  const alVolver = pedidas - trasSuscribirDos

  sinRed = true
  m.refrescarEstadoEnVivo()
  await espera(60)
  const trasFallo = uno[uno.length - 1]

  quitarUno()
  quitarDos()
  const alQuitar = pedidas
  await espera(500)

  return {
    trasSuscribirDos,
    conLaPestanaOculta,
    alVolver,
    dosRecibe: dos.length > 0,
    fallos: trasFallo.fallos,
    sigueElUltimoBueno: trasFallo.perfiles && trasFallo.perfiles[0].level,
    serverTs: trasFallo.serverTs,
    oyentesDeVisibilidad: visibilidad.length,
    trasQuitarATodos: pedidas - alQuitar,
    esperas: [0, 1, 2, 3, 10].map((f) => m.esperaTrasFallos(f)),
  }
}

/* Minutos en el nodo con la hora del servidor, y quién está atascado. */
function atascos() {
  const m = crearEntorno().cargar('src/admin/lib/estadoEnVivo.ts')
  const ahora = 100_000
  const p = (minutos, extra = {}) => ({ user: 'A', presence: 'live', en_nodo_desde: ahora - minutos * 60, ...extra })
  return {
    minutos: m.minutosEnElNodo(p(25), ahora),
    sinDato: m.minutosEnElNodo({ user: 'A' }, ahora),
    sinHora: m.minutosEnElNodo(p(25), null),
    terminado: m.minutosEnElNodo(p(25, { finished: true }), ahora),
    atascado: m.estaAtascado(p(25), ahora),
    reciente: m.estaAtascado(p(10), ahora),
    enElLimite: m.estaAtascado(p(20), ahora),
    sinConexion: m.estaAtascado(p(90, { presence: 'offline' }), ahora),
    umbral: m.MINUTOS_ATASCADO,
  }
}

/* El nivel del sondeo no devuelve atrás lo que acaba de hacer el panel. */
function progreso() {
  const { progresoMasFiable: f } = crearEntorno().cargar('src/admin/lib/estadoEnVivo.ts')
  const panel = { level: 4, finished: false }
  const vivo = { user: 'A', level: 3, finished: false }
  return {
    sinAcciones: f(vivo, 1000, undefined, panel),
    pedidoAntesDeAcabar: f(vivo, 1000, 2000, panel),
    enCurso: f(vivo, 1000, Infinity, panel),
    pedidoDespues: f(vivo, 3000, 2000, panel),
    sinSondeo: f(undefined, 3000, 0, panel),
  }
}

/* Lo que se pregunta antes de mover a un jugador: con el coste dicho. */
function confirmaciones() {
  const { confirmacionDeAccion: c, textoSinJugadores } = crearEntorno().cargar('src/admin/lib/adminRouteGuards.ts')
  return {
    avanzar: c('level_next', 'Ana'),
    finalizar: c('mark_finished', 'Ana'),
    retroceder: c('level_prev', 'Ana'),
    reiniciar: c('reset_profile', 'Ana'),
    restaurar: c('restore_node', 'Ana'),
    darObjeto: c('give_item', 'Ana'),
    vacioAtascado: textoSinJugadores('atascado', false),
  }
}

/* El aviso de jugadores sin PIN y el texto del álbum. */
function avisos() {
  const e = crearEntorno()
  const { avisoJugadoresSinPin: a } = e.cargar('src/admin/lib/pinesDelPanel.ts')
  const { textoFotosGuardadas: t, LIMITE_FOTOS } = e.cargar('src/admin/lib/fotosDelPanel.ts')
  return {
    nadie: a([]),
    sinDato: a(undefined),
    uno: a(['ANA']),
    muchos: a(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']),
    fotos: { cero: t(0), una: t(1), pocas: t(12), llenas: t(LIMITE_FOTOS), limite: LIMITE_FOTOS },
  }
}

async function main() {
  const salida = {}
  const casos = { sondeo, atascos, progreso, confirmaciones, avisos }
  for (const [nombre, fn] of Object.entries(casos)) {
    try {
      salida[nombre] = await fn()
    } catch (error) {
      salida[nombre] = { __error: String((error && error.stack) || error) }
    }
  }
  process.stdout.write(JSON.stringify(salida))
  process.exit(0)
}

main()
