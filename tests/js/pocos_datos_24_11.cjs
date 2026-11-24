// 24/11/2026: modo pocos datos del panel. Ejecuta los módulos TS tal cual y vuelca en JSON lo que hacen; lo comprueba
// tests/test_pocos_datos_24_11.py.
'use strict'

const { crearEntorno } = require('./entorno_navegador.cjs')

const espera = (ms) => new Promise((r) => setTimeout(r, ms))

/* El sondeo compacto convertido en la lista de siempre: fichas enteras, sólo las cambiadas, orden y posiciones. */
function compacto() {
  const m = crearEntorno().cargar('src/admin/lib/estadoEnVivo.ts')
  const vacio = { fichas: new Map(), orden: [], posiciones: new Map() }
  const f = [
    { user: 'A', display_name: 'Ana', presence: 'live', level: 2 },
    { user: 'B', display_name: 'Beto', presence: 'offline', level: 1, last_seen: 900 },
  ]
  const r1 = m.aplicarCompacto(vacio, { status: 'ok', v: 2, server_ts: 1000, f, o: [4200000, -860000], p: [[0, 10, -20, 4], [1, 0, 0, 100]] })
  // Andando: sólo posiciones (A se movió); la hora de su señal es la de la posición.
  const r2 = m.aplicarCompacto(r1, { status: 'ok', v: 2, server_ts: 1015, o: [4200000, -860000], p: [[0, 30, -20, 2], [1, 0, 0, 115]] })
  // Nada cambió: A sigue «en vivo» según el servidor → su señal es de ahora; B (sin conexión) conserva la suya.
  const r3 = m.aplicarCompacto(r2, { status: 'ok', v: 2, server_ts: 1030 })
  // Sólo la ficha de B (pasa de nodo) y C entra nuevo: llegan `fd` e `ids`.
  const r4 = m.aplicarCompacto(r3, { status: 'ok', v: 2, server_ts: 1045, fd: [{ user: 'B', presence: 'live', level: 2 }, { user: 'C', presence: 'live', level: 0 }], ids: ['A', 'B', 'C'] })
  // A sale de la misión.
  const r5 = m.aplicarCompacto(r4, { status: 'ok', v: 2, server_ts: 1060, fd: [], ids: ['B', 'C'] })
  const resumen = (r) => r.perfiles.map((p) => [p.user, p.level, p.presence, p.lat, p.lon, p.last_seen])
  return {
    r1: resumen(r1), r2: resumen(r2), r3: resumen(r3), r4: resumen(r4), r5: resumen(r5),
    cambios: [r1.cambio, r2.cambio, r3.cambio, r4.cambio],
  }
}

/* El ritmo: el de la red; 45 s si nada cambia en 3 sondeos o con «Pocos datos»; 10 s el minuto siguiente a una acción. */
function ritmo() {
  const m = crearEntorno().cargar('src/admin/lib/estadoEnVivo.ts')
  const a = (o) => m.intervaloAdaptativo({ calidad: 'buena', ahoraMs: 1_000_000, ...o })
  return {
    normal: a({}),
    media: a({ calidad: 'media' }),
    dosQuietos: a({ sinCambiosSeguidos: 2 }),
    tresQuietos: a({ sinCambiosSeguidos: 3 }),
    pocos: a({ pocos: true }),
    trasAccion: a({ rapidoHastaMs: 1_030_000, pocos: true }),
    accionPasada: a({ rapidoHastaMs: 999_000 }),
    lentoTrasAccion: a({ rapidoHastaMs: 1_030_000, ultimaDuracionMs: 5_000 }),
    tope: a({ calidad: 'mala', ultimaDuracionMs: 60_000, sinCambiosSeguidos: 9 }),
  }
}

/* Datos viejos: más de dos turnos (y de un minuto) sin respuesta buena. */
function viejos() {
  const m = crearEntorno().cargar('src/admin/lib/estadoEnVivo.ts')
  const e = (pedidoMs) => ({ perfiles: [], pedidoMs })
  return {
    reciente: m.datosViejosS(e(100_000), 140_000, 15_000),
    unMinutoJusto: m.datosViejosS(e(100_000), 160_000, 15_000),
    viejo: m.datosViejosS(e(100_000), 280_000, 15_000),
    turnoLargo: m.datosViejosS(e(100_000), 180_000, 45_000),
    sinDatos: m.datosViejosS({ perfiles: null, pedidoMs: 0 }, 999_999, 15_000),
    textos: [40, 180, 7200].map((s) => m.textoDatosDeHace(s)),
  }
}

/* El bucle de verdad contra un servidor falso: manda las huellas, entiende el formato viejo y cuenta los avisos. */
async function bucle() {
  const e = crearEntorno()
  const cuerpos = []
  let turno = 0
  e.servidor = (url, init) => {
    if (url.pathname !== '/api/admin/mission-status') return new Response('{}', { status: 404 })
    cuerpos.push(JSON.parse(init.body))
    turno += 1
    const r = turno === 1
      ? { status: 'ok', v: 2, server_ts: 10, e: 'E1', q: 'Q1', a: 3, f: [{ user: 'A', presence: 'live', level: 1 }], o: [100, 200], p: [[0, 1, 2, 0]] }
      : turno === 2
        ? { status: 'ok', v: 2, server_ts: 25, e: 'E1', q: 'Q1', a: 4 }
        : { status: 'ok', server_ts: 40, profiles: [{ user: 'A', level: 7 }], etag: 'VIEJO' }
    return new Response(JSON.stringify(r), { headers: { 'Content-Type': 'application/json' } })
  }
  const m = e.cargar('src/admin/lib/estadoEnVivo.ts')
  const vistos = []
  const dejar = m.suscribirEstadoEnVivo((s) => vistos.push({ n: s.perfiles && s.perfiles.length, nivel: s.perfiles && s.perfiles[0] && s.perfiles[0].level, avisos: s.avisos, lat: s.perfiles && s.perfiles[0] && s.perfiles[0].lat }))
  await espera(40)
  m.refrescarEstadoEnVivo(); await espera(40)
  m.refrescarEstadoEnVivo(); await espera(40)
  m.refrescarEstadoEnVivo(); await espera(40)
  dejar()
  return { cuerpos, vistos }
}

/* «Pocos datos»: lo elegido manda; sin elegir, el ahorro de datos o el 2G lo encienden. */
function interruptor() {
  const red = (conexion) => {
    const e = crearEntorno()
    e.sandbox.navigator.connection = conexion
    return e
  }
  const e1 = red({ saveData: true })
  const m1 = e1.cargar('src/admin/lib/pocosDatos.ts')
  const porLaRed = [m1.pocosDatosActivo(), m1.pocosDatosPorLaRed()]
  m1.fijarPocosDatos(false)
  const apagadoAMano = [m1.pocosDatosActivo(), m1.pocosDatosPorLaRed(), e1.local.getItem('saga:admin:pocos-datos')]
  const m2 = red({ effectiveType: '4g' }).cargar('src/admin/lib/pocosDatos.ts')
  const m3 = red({ effectiveType: 'slow-2g' }).cargar('src/admin/lib/pocosDatos.ts')
  return {
    porLaRed,
    apagadoAMano,
    cuatroG: m2.pocosDatosActivo(),
    dosG: m3.pocosDatosActivo(),
    funcion: [m2.redPidePocosDatos(null), m2.redPidePocosDatos({ effectiveType: '2g' }), m2.redPidePocosDatos({ effectiveType: '3g' })],
  }
}

/* Los fallos de red que se cuentan: sólo `/api/` del propio dominio (Overpass también tiene `/api/interpreter`). */
function vigilancia() {
  const m = crearEntorno().cargar('src/shared/reportarErrores.ts')
  const o = 'https://saga.example'
  return {
    propia: m.esPeticionVigilada('/api/admin/mission-status', o),
    propiaEntera: m.esPeticionVigilada('https://saga.example/api/advance', o),
    overpass: m.esPeticionVigilada('https://overpass-api.de/api/interpreter?data=x', o),
    envio: m.esPeticionVigilada('/api/client-errors', o),
    teselas: m.esPeticionVigilada('/map-tiles/1/2/3.png', o),
  }
}

async function main() {
  const salida = {}
  for (const [nombre, fn] of Object.entries({ compacto, ritmo, viejos, bucle, interruptor, vigilancia })) {
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
