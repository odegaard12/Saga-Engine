// Prueba offline/cambiosDelPanel.ts (24/11): la escucha de cambios del panel y el freno del chip. Salida: JSON.
'use strict'
const { crearCargador } = require('./cargarTs.cjs')

const cargar = crearCargador({ Math, Date, Number, String, Boolean, Promise, setTimeout, clearTimeout, AbortController })
const M = cargar('src/player/offline/cambiosDelPanel.ts')

const tic = () => new Promise((r) => setImmediate(r))

async function escenario(respuestas, { visible = () => true } = {}) {
  const pedidas = []
  const cambios = []
  const cola = [...respuestas]
  const escucha = M.crearEscuchaDeCambios({
    esperar: (desde, signal) => {
      pedidas.push(desde)
      const siguiente = cola.shift()
      if (siguiente === undefined) {
        // Queda abierta hasta que la aborten.
        return new Promise((_, rechazar) => signal.addEventListener('abort', () => rechazar(new Error('abortada'))))
      }
      return siguiente instanceof Error ? Promise.reject(siguiente) : Promise.resolve(siguiente)
    },
    alCambiar: (rev, origen) => cambios.push([rev, origen]),
    puedeEscuchar: visible,
    dormir: () => Promise.resolve(),
  })
  return { escucha, pedidas, cambios }
}

;(async () => {
  const out = {}

  // Sin latido todavía no se escucha (no se sabe la revisión de partida).
  {
    const e = await escenario([])
    await tic()
    out.sinLatidoNoEscucha = e.pedidas.length
    e.escucha.cerrar()
  }

  // Primer latido: se apunta la revisión SIN avisar; la escucha arranca con ella. Un 204 y otro, y luego un cambio.
  {
    const e = await escenario([{}, {}, { rev: 'a.1' }])
    e.escucha.trasLatido('a.0')
    for (let i = 0; i < 10; i++) await tic()
    out.primerLatido = { cambios: e.cambios, pedidas: e.pedidas, conocida: e.escucha.conocida() }
    // Un latido con la MISMA revisión no avisa ni abre una segunda escucha.
    e.escucha.trasLatido('a.1')
    await tic()
    out.mismaRevisionNoDobla = { cambios: e.cambios.length, pedidas: e.pedidas.length }
    // Un latido que trae otra (la escucha estaba cortada, o la otra Pi): avisa como «latido».
    e.escucha.trasLatido('b.0')
    out.cambioPorLatido = e.cambios[e.cambios.length - 1]
    e.escucha.cerrar()
  }

  // Sin red: la escucha se para y NO reintenta sola; la rearma el siguiente latido bueno.
  {
    const e = await escenario([new Error('sin red')])
    e.escucha.trasLatido('a.0')
    for (let i = 0; i < 5; i++) await tic()
    out.sinRedSePara = e.pedidas.length
    e.escucha.trasLatido('a.0')
    await tic()
    out.rearmadaPorLatido = e.pedidas.length
    e.escucha.cerrar()
  }

  // Con la app oculta no se abre; un 429 espera y sigue.
  {
    const oculta = await escenario([], { visible: () => false })
    oculta.escucha.trasLatido('a.0')
    await tic()
    out.ocultaNoEscucha = oculta.pedidas.length
    const ritmo = await escenario([{ reintentar_s: 2 }, { rev: 'a.1' }])
    ritmo.escucha.trasLatido('a.0')
    for (let i = 0; i < 10; i++) await tic()
    out.tras429Sigue = ritmo.cambios
    ritmo.escucha.cerrar()
  }

  // `parar` corta la que hay en vuelo (pantalla apagada) y no deja otra.
  {
    const e = await escenario([])
    e.escucha.trasLatido('a.0')
    await tic()
    e.escucha.parar()
    for (let i = 0; i < 5; i++) await tic()
    out.pararCorta = e.pedidas.length
    e.escucha.cerrar()
  }

  const h = (o) => M.huellaVisible(o)
  const base = { nivel: 2, terminada: false, tiempoMs: 60000, mochila: [{ item_id: 'llave', quantity: 1 }] }
  out.huellas = {
    igual: h(base) === h({ ...base, mochila: [{ item_id: 'llave', quantity: 1 }] }),
    tiempo: h(base) !== h({ ...base, tiempoMs: 120000 }),
    nodo: h(base) !== h({ ...base, nivel: 3 }),
    objeto: h(base) !== h({ ...base, mochila: [...base.mochila, { item_id: 'gema', quantity: 1 }] }),
    ordenDaIgual:
      h({ ...base, mochila: [{ item_id: 'a' }, { item_id: 'b' }] }) === h({ ...base, mochila: [{ item_id: 'b' }, { item_id: 'a' }] }),
  }
  out.avisar = {
    sinCambioVisible: M.debeAvisar('x', 'x', 0, 1e9),
    conCambio: M.debeAvisar('x', 'y', 0, 1e9),
    frenado: M.debeAvisar('x', 'y', 1e9 - 10000, 1e9),
    trasElFreno: M.debeAvisar('x', 'y', 1e9 - M.FRENO_DEL_AVISO_MS, 1e9),
  }
  console.log(JSON.stringify(out))
})()
