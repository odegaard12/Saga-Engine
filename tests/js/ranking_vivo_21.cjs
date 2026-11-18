// 18/11/2026 (6.11.9): la clasificación en directo (rankingVivo.ts): reorden, chips ▲/▼, arranque de FLIP, cuenta de
// tiempos. Ejecuta el módulo TS tal cual; lo comprueba tests/test_ranking_vivo.py.
'use strict'

const { crearEntorno } = require('./entorno_navegador.cjs')
const { ordenarClasificacion, puestosDe } = crearEntorno().cargar('src/player/components/clasificacion.ts')
const r = crearEntorno().cargar('src/player/components/rankingVivo.ts')

const j = (user, level, ms, extra = {}) => ({ user, display_name: user, level, total_time_ms: ms, finished: false, total_nodes: 4, ...extra })

function reorden() {
  const a = j('A', 2, 100000), b = j('B', 2, 120000), c = j('C', 1, 50000), d = j('D', 0, 0)
  const antes = puestosDe(ordenarClasificacion([a, b, c, d])) // A1 B2 C3 D4
  // C avanza un nodo y pasa a A y B; D queda quieto
  const c2 = j('C', 3, 130000)
  const ahora = ordenarClasificacion([a, b, c2, d]) // C1 A2 B3 D4
  const movs = r.movimientos(antes, ahora)
  return {
    antes, orden: ahora.map((x) => x.user), movs,
    sinCambio: r.movimientos(puestosDe(ahora), ahora),
    nuloAntes: r.movimientos(null, ahora),
    nuevo: r.movimientos({ A: 1 }, ahora), // solo A estaba, y sigue en 2: sube/baja -1
    repetidos: r.movimientos({ A: 2 }, [{ user: 'A' }, { user: 'A' }, { user: 'B' }]),
    firmaIgual: r.firmaDeOrden(ordenarClasificacion([a, b, c, d])) === r.firmaDeOrden(ordenarClasificacion([{ ...a, last_seen: 99 }, b, c, d])),
    fijos: r.fijosDeApertura(antes, ahora),
    fijosTrasMover: r.quitarFijos({ C: 2, Z: 1 }, movs),
    fijosSinTocar: (() => { const f = { Z: 1 }; return r.quitarFijos(f, movs) === f })(),
    repetidosFuera: r.sinRepetidos([{ user: 'A', n: 1 }, { user: 'B', n: 2 }, { user: 'A', n: 3 }]),
    sinRepetidosMismo: (() => { const l = [{ user: 'A' }]; return r.sinRepetidos(l) === l })(),
    firmaCambia: r.firmaDeOrden(ahora) !== r.firmaDeOrden(ordenarClasificacion([a, b, c, d])),
  }
}

function guardados() {
  return {
    ok: r.puestosGuardados('{"A":1,"B":2}'),
    roto: r.puestosGuardados('{no'),
    nulo: r.puestosGuardados(null),
    lista: r.puestosGuardados('[1,2]'),
    basura: r.puestosGuardados('{"A":0,"B":-1,"C":"x","D":1.5,"E":"3","F":null}'),
    numero: r.puestosGuardados('7'),
  }
}

function chips() {
  const m = (user, delta) => ({ user, desde: 3, hasta: 3 - delta, delta })
  const t0 = 1000
  let v = r.sumarChips({}, [m('A', 2), m('B', -1)], t0)
  const suma = r.sumarChips(v, [m('A', 1)], t0 + 2000)
  const anula = r.sumarChips(v, [m('B', 1)], t0 + 2000)
  const sinCaducar = r.caducarChips(v, t0 + 5999)
  const caduca = r.caducarChips(suma, t0 + 6000)
  const mixto = r.caducarChips(suma, t0 + 7999)
  return {
    inicial: v,
    suma, anula,
    mismoObjetoSinCaducar: sinCaducar === v,
    caduca, mixto,
    msChip: r.MS_CHIP,
  }
}

function animacion() {
  return {
    arranque: [r.arranqueDeFila(0, 4, 1, 56), r.arranqueDeFila(0, 1, 4, 56), r.arranqueDeFila(0, 2, 2, 56)],
    continuaDesdeDondeSeVe: r.arranqueDeFila(30, 3, 2, 56),
    seAnula: r.arranqueDeFila(56, 2, 3, 56),
    escalon: [0, 1, 5, 10, 14, 20].map(r.retardoDeEntrada),
    negativo: r.retardoDeEntrada(-3),
    cuenta: [0, 0.5, 1, 2, -1].map((t) => r.valorContado(100000, t)),
    cuentaCero: r.valorContado(0, 0.5),
    topeFilas: r.MAX_FILAS_ANIMADAS,
  }
}

const salida = {}
for (const [nombre, fn] of Object.entries({ reorden, guardados, chips, animacion })) {
  try {
    salida[nombre] = fn()
  } catch (error) {
    salida[nombre] = { __error: String((error && error.stack) || error) }
  }
}
process.stdout.write(JSON.stringify(salida))
