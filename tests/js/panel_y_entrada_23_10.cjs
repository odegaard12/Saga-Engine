// Revisión del 23/10/2026: panel del organizador y entrada del jugador. Ejecuta los módulos TS tal cual
// (entorno_navegador.cjs) y vuelca en JSON lo que hacen; lo comprueba tests/test_panel_y_entrada_23_10_js.py.
'use strict'

// El panel se mira desde España: las horas se comprueban en su zona, sea cual sea la de la máquina.
process.env.TZ = 'Europe/Madrid'

const { crearEntorno } = require('./entorno_navegador.cjs')

/* Los PIN que se ven: una respuesta vacía no borra los que se acaban de dar; «quitar» sí los quita. */
function pines() {
  const { pinesAEnsenar } = crearEntorno().cargar('src/admin/lib/pinesDelPanel.ts')
  const dados = pinesAEnsenar({}, 'generar', { A: '111111', B: '222222' })
  return {
    dados,
    trasVacia: pinesAEnsenar(dados, 'generar', {}),
    trasOtro: pinesAEnsenar(dados, 'generar', { C: '333333' }),
    trasRehacer: pinesAEnsenar(dados, 'generar', { A: '999999', B: '888888' }),
    trasEstado: pinesAEnsenar(dados, 'estado', {}),
    trasQuitar: pinesAEnsenar(dados, 'quitar', {}),
  }
}

/* El contador de pendientes de Actividad baja al marcar un evento como leído. */
function pendientes() {
  const { pendientesTrasMarcar } = crearEntorno().cargar('src/admin/lib/adminEventsView.ts')
  return {
    leido: pendientesTrasMarcar(5, 'pending', 'synced'),
    yaLeido: pendientesTrasMarcar(5, 'synced', 'synced'),
    enCero: pendientesTrasMarcar(0, 'pending', 'synced'),
    sinTotal: pendientesTrasMarcar(null, 'pending', 'synced'),
    reabierto: pendientesTrasMarcar(5, 'failed', 'pending'),
  }
}

/* Sesión que ya no vale con PIN: a la portada con `replace`, para que «atrás» no vuelva a la partida y rebote. */
async function sesionCaducada() {
  const e = crearEntorno()
  const saltos = []
  e.sandbox.location.assign = (url) => saltos.push(['assign', url])
  e.sandbox.location.replace = (url) => saltos.push(['replace', url])
  e.sandbox.location.pathname = '/player/Mart%C3%ADn%20G'
  e.local.setItem('saga_offline_public_config_v1', JSON.stringify({ config: { player_pins_required: true } }))
  e.servidor = () => new Response('{"detail":"x"}', { status: 403 })
  const api = e.cargar('src/shared/api.ts')
  let estado = null
  try {
    await api.fetchPlayerGame('Martín G')
  } catch (error) {
    estado = error.status
  }
  return { estado, saltos }
}

/* La hora de «Preparado el …» (mapa 3D, red de caminos): la del servidor en UTC, enseñada en la de aquí. */
function fechaDelServidor() {
  const { fechaDelServidor: f } = crearEntorno().cargar('src/admin/lib/adminHelpers.tsx')
  return {
    utc: f('2026-10-23T08:00:00+0000'),
    conDosPuntos: f('2026-10-23T08:00:00+00:00'),
    madrid: f('2026-10-23T10:00:00+0200'),
    raro: f('ayer'),
    vacio: f(undefined),
  }
}

async function main() {
  const salida = {}
  const casos = { pines, pendientes, sesionCaducada, fechaDelServidor }
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
