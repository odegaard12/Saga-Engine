// 24/10/2026: la clasificación nueva (tu carrera + tabla) y los efectos puntuales del mapa. Ejecuta los módulos TS
// tal cual (entorno_navegador.cjs) y vuelca en JSON lo que hacen; lo comprueba
// tests/test_clasificacion_y_efectos_24_10.py.
'use strict'

const { crearEntorno } = require('./entorno_navegador.cjs')

const j = (user, level, ms, extra = {}) => ({ user, display_name: user, level, total_time_ms: ms, finished: false, total_nodes: 4, ...extra })

function clasificacion() {
  const c = crearEntorno().cargar('src/player/components/clasificacion.ts')
  const fin = j('PRUEBA01', 4, 348000, { finished: true })
  const fin2 = j('PRUEBA02', 4, 380000, { finished: true })
  const n2a = j('PRUEBA05', 2, 165000)
  const n2b = j('PRUEBA06', 2, 175000)
  const n1rapido = j('PRUEBA07', 1, 90000)
  const quieto = j('PRUEBA09', 0, 0)
  const ordenados = c.ordenarClasificacion([quieto, n1rapido, n2b, fin2, n2a, fin])
  return {
    mismoNodo: c.distanciaAlDeDelante(n2a, n2b, 4),
    nodosDistintos: c.distanciaAlDeDelante(n2b, n1rapido, 4),
    dosNodos: c.distanciaAlDeDelante(fin, n2a, 4),
    terminados: c.distanciaAlDeDelante(fin, fin2, 4),
    empate: c.distanciaAlDeDelante(n2a, j('PRUEBA08', 2, 165000), 4),
    sinTiempoDelante: c.distanciaAlDeDelante(j('PRUEBA04', 2, 0), n2b, 4),
    sinEmpezar: c.distanciaAlDeDelante(n1rapido, quieto, 4),
    primero: c.distanciaAlDeDelante(undefined, fin, 4),
    // La barra: nodos hechos, no el tiempo comparado con el primero.
    tramosRapidoEnNodo1: c.nodosHechos(n1rapido, 4),
    tramosTerminado: c.nodosHechos(fin, 4),
    tramosDeMas: c.nodosHechos(j('PRUEBA03', 9, 1000), 4),
    total: c.totalDeNodos([j('A', 1, 1, { total_nodes: undefined }), j('B', 1, 1, { total_nodes: 6 })]),
    totalSinDato: c.totalDeNodos([j('A', 1, 1, { total_nodes: undefined })]),
    orden: ordenados.map((x) => x.user),
    puestos: c.puestosDe(ordenados),
    sube: c.puestosGanados({ PRUEBA06: 6 }, ordenados, 'PRUEBA06'),
    baja: c.puestosGanados({ PRUEBA01: 1, PRUEBA02: 1 }, ordenados, 'PRUEBA02'),
    igual: c.puestosGanados({ PRUEBA01: 1 }, ordenados, 'PRUEBA01'),
    nuevo: c.puestosGanados({}, ordenados, 'PRUEBA01'),
    sinUsuario: c.puestosGanados({ PRUEBA01: 3 }, ordenados, undefined),
  }
}

/** Un mapa de mentira que apunta lo que le piden, y un DOM mínimo para las piezas. */
function entornoConMapa(reducido) {
  const e = crearEntorno()
  const piezas = []
  e.sandbox.performance = { now: () => 0 }
  e.sandbox.requestAnimationFrame = () => 0
  e.sandbox.document.createElement = () => {
    const el = { style: {}, dataset: {}, setAttribute() {}, remove() {}, animaciones: 0 }
    el.animate = () => {
      el.animaciones += 1
      return {}
    }
    return el
  }
  const llamadas = []
  const mapa = {
    easeTo: (o) => llamadas.push(['easeTo', o]),
    fitBounds: (caja, o) => llamadas.push(['fitBounds', o, caja]),
    getZoom: () => 16,
    getPitch: () => 50,
    getBearing: () => 30,
    getContainer: () => ({ clientHeight: 800, appendChild: (el) => piezas.push(el) }),
    project: () => ({ x: 10, y: 20 }),
  }
  const m = e.cargar('src/player/components/efectosDelMapa.ts')
  const medios = () => ({ matches: reducido })
  return { m, mapa, llamadas, piezas, medios }
}

function efectos(reducido) {
  const tocar = entornoConMapa(reducido)
  const anima = tocar.m.encuadrarJugador(tocar.mapa, { lat: 40.4, lon: -3.6 }, tocar.medios)
  const sello = entornoConMapa(reducido)
  const sellado = sello.m.sellarNodo(sello.mapa, { lat: 40.4, lon: -3.6 }, sello.medios)
  const ruta = entornoConMapa(reducido)
  const nodos = [{ lat: 40.41, lon: -3.69 }, { lat: 40.42, lon: -3.68 }, { lat: 'x', lon: 1 }, { lat: 40.4, lon: -3.7 }]
  const vista = ruta.m.verRutaEntera(ruta.mapa, nodos, ruta.medios)
  const corta = ruta.m.verRutaEntera(ruta.mapa, [{ lat: 1, lon: 2 }], ruta.medios)
  const [, o] = tocar.llamadas[0]
  const [, of, caja] = ruta.llamadas[0]
  return {
    tocar: { anima, llamadas: tocar.llamadas.length, duracion: o.duration, zoom: o.zoom, offset: o.offset, pitch: 'pitch' in o, piezas: tocar.piezas.length, animaciones: tocar.piezas.reduce((n, p) => n + p.animaciones, 0) },
    sello: { sellado, piezas: sello.piezas.length, texto: sello.piezas[0] && sello.piezas[0].textContent },
    ruta: { vista, corta, llamadas: ruta.llamadas.length, duracion: of.duration, caja, pitch: of.pitch, bearing: of.bearing },
    constantes: { ENCUADRE_MS: tocar.m.ENCUADRE_MS, VER_RUTA_MS: tocar.m.VER_RUTA_MS, SELLO_MS: tocar.m.SELLO_MS },
  }
}

const salida = {}
const casos = { clasificacion, efectos: () => efectos(false), efectosReducido: () => efectos(true) }
for (const [nombre, fn] of Object.entries(casos)) {
  try {
    salida[nombre] = fn()
  } catch (error) {
    salida[nombre] = { __error: String((error && error.stack) || error) }
  }
}
process.stdout.write(JSON.stringify(salida))
