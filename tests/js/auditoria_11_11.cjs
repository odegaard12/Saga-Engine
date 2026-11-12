// 11/11/2026: arreglos de la auditoría, lógica pura del cliente. Lo comprueba tests/test_auditoria_11_11.py.
'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')

const ent = crearEntorno()
const out = {}

async function principal() {
  // --- 4 · Entrada: por qué no se pudo entrar -----------------------------------------------------------------
  const api = ent.cargar('src/shared/api.ts')
  const m = (status, detalle, retry) => {
    const f = api.motivoDeEntrada(status, detalle || '', retry === undefined ? null : retry)
    return [f.motivo, f.esperaS === undefined ? null : f.esperaS]
  }
  out.entrada = {
    pinMal: m(403, 'wrong player or pin'),
    claveMal: m(403, 'wrong mission password'),
    origen: m(403, 'cross-site request blocked (origin)'),
    sinDetalle403: m(403, ''),
    pinBloqueado: m(429, 'too many attempts; retry in 420s'),
    limitador: m(429, 'rate limit exceeded', '7'),
    sinSegundos: m(429, ''),
    claveCaducada: m(401, 'mission key required'),
    caido502: m(502, ''),
    caido530: m(530, ''),
    otro: m(400, 'invalid body'),
    espera: [api.textoDeEspera(7), api.textoDeEspera(89), api.textoDeEspera(420)],
  }
  // De punta a punta, con el `fetch` del entorno: lo que ve la pantalla.
  const probar = async (respuesta) => {
    ent.servidor = () => respuesta
    try {
      await api.entrarComoJugador('PRUEBA01', '1234')
      return 'dentro'
    } catch (e) {
      return e instanceof api.FalloDeEntrada ? e.motivo : 'otro:' + String(e)
    }
  }
  const json = (status, cuerpo) =>
    new Response(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo), {
      status,
      headers: { 'content-type': typeof cuerpo === 'string' ? 'text/html' : 'application/json' },
    })
  out.entradaPuntaAPunta = {}
  try {
    out.entradaPuntaAPunta.ok = await probar(json(200, { status: 'ok' }))
    out.entradaPuntaAPunta.pinMal = await probar(json(403, { detail: 'wrong player or pin' }))
    out.entradaPuntaAPunta.caido = await probar(json(502, 'Bad gateway'))
    out.entradaPuntaAPunta.clave = await probar(json(401, { status: 'error', detail: 'mission key required' }))
    out.entradaPuntaAPunta.sinRed = await probar(null)
  } catch (e) {
    out.entradaPuntaAPunta.error = String(e)
  }

  // --- 5 · Laberinto: el generador llega a 17×17 y siempre se puede terminar ----------------------------------
  const tm = ent.cargar('src/shared/tiltMaze.ts')
  const laberintos = []
  for (const lado of [9, 11, 13, 15, 17, 25]) {
    for (const semilla of ['a', 'b', 'c']) {
      const lab = tm.generateTiltMaze({ rows: lado, cols: lado, seed: 'aud-' + semilla, holeCount: lado + 3, collectibleCount: 4 })
      // ¿Se llega de la salida a la meta sin pisar un agujero, y a todos los objetos?
      const agujeros = new Set(lab.holes)
      const visto = new Set([lab.start])
      const cola = [lab.start]
      for (let i = 0; i < cola.length; i += 1) {
        for (const dir of ['up', 'right', 'down', 'left']) {
          const sig = tm.nextTiltMazeCell(lab, cola[i], dir)
          if (sig === null || sig === undefined || visto.has(sig) || agujeros.has(sig)) continue
          visto.add(sig)
          cola.push(sig)
        }
      }
      laberintos.push({
        pedido: lado,
        filas: lab.rows,
        cols: lab.cols,
        meta: visto.has(lab.goal),
        objetos: lab.collectibles.every((c) => visto.has(c)),
        agujeros: lab.holes.length,
      })
    }
  }
  out.laberintos = laberintos
  out.vecinas = [tm.sonVecinas(0, 1, 9), tm.sonVecinas(0, 9, 9), tm.sonVecinas(8, 9, 9), tm.sonVecinas(40, 0, 9), tm.sonVecinas(5, 5, 9)]

  // --- 9 y 10 · Caza-Señales ----------------------------------------------------------------------------------
  const sr = ent.cargar('src/player/minigames/families/sparkRadar/reglas.ts')
  out.radar = {
    cero: [sr.readNumberOCero({ echo_ratio: 0 }, 'echo_ratio', 0.28), sr.readNumberOCero({ echo_penalty_s: '0' }, 'echo_penalty_s', 2)],
    falta: [sr.readNumberOCero({}, 'echo_ratio', 0.28), sr.readNumberOCero({ echo_ratio: null }, 'echo_ratio', 0.28), sr.readNumberOCero({ echo_ratio: '' }, 'echo_ratio', 0.28)],
    basura: [sr.readNumberOCero({ echo_ratio: -1 }, 'echo_ratio', 0.28), sr.readNumberOCero({ echo_ratio: 'x' }, 'echo_ratio', 0.28)],
    valor: sr.readNumberOCero({ echo_ratio: 0.4 }, 'echo_ratio', 0.28),
    gracia: sr.GRACIA_SENAL_APAGADA_MS,
    // Una señal real apagada en (50, 50) en t=1000; radio de la chispa 12 % del radar.
    reciente: sr.tocaSenalRecienApagada([{ x: 50, y: 50, t: 1000 }], 55, 52, 1150, 12),
    tarde: sr.tocaSenalRecienApagada([{ x: 50, y: 50, t: 1000 }], 55, 52, 1000 + sr.GRACIA_SENAL_APAGADA_MS + 1, 12),
    lejos: sr.tocaSenalRecienApagada([{ x: 50, y: 50, t: 1000 }], 80, 80, 1100, 12),
    vacio: sr.tocaSenalRecienApagada([], 50, 50, 1000, 12),
  }

  // --- 7 · GPS: lecturas sintéticas ---------------------------------------------------------------------------
  const gps = ent.cargar('src/player/hooks/gpsDecisiones.ts')
  const buena = { precision: 8, t: 100_000 }
  out.gps = {
    // La barata (600 m de error) llega 20 s después de la de satélite (8 m): no la pisa.
    barataTrasBuena: gps.esLecturaMuchoPeor(buena, 600, 120_000),
    // Pasado el minuto, la buena ya no manda.
    barataTrasUnMinuto: gps.esLecturaMuchoPeor(buena, 600, 100_000 + gps.VIGENCIA_DE_LA_BUENA_MS),
    // El baile normal del GPS (8 → 25 m, 8 → 60 m) se publica.
    baileNormal: [gps.esLecturaMuchoPeor(buena, 25, 105_000), gps.esLecturaMuchoPeor(buena, 60, 105_000)],
    // Dos lecturas malas seguidas (150 → 250 m): no es «más del doble»; se publica.
    malaTrasMala: gps.esLecturaMuchoPeor({ precision: 150, t: 100_000 }, 250, 105_000),
    sinPrecision: [gps.esLecturaMuchoPeor({ precision: null, t: 100_000 }, 600, 105_000), gps.esLecturaMuchoPeor(buena, null, 105_000), gps.esLecturaMuchoPeor(null, 600, 105_000)],
    // Subir a preciso: sólo desde barato, con lectura fiable y a 250 m o menos.
    subir: gps.debeSubirAPreciso('barato', 180, 12),
    subirEnElBorde: gps.debeSubirAPreciso('barato', gps.DISTANCIA_MODO_PRECISO_M, gps.PRECISION_FIABLE_M),
    lejos: gps.debeSubirAPreciso('barato', 400, 12),
    pocoFiable: gps.debeSubirAPreciso('barato', 180, 400),
    sinDatos: [gps.debeSubirAPreciso('barato', null, 12), gps.debeSubirAPreciso('barato', 180, null)],
    yaPreciso: gps.debeSubirAPreciso('preciso', 50, 5),
    porRed: gps.debeSubirAPreciso('por_red', 50, 5),
  }

  // --- 1 · La apertura del nodo viaja con el avance -----------------------------------------------------------
  const ev = ent.cargar('src/player/avance/evidencia.ts')
  const sin = ev.construirEvidencia({ nodo: 'n1', code: 'OK' })
  ev.marcarApertura('n1')
  const con = ev.construirEvidencia({ nodo: 'n1', code: 'OK' })
  const primera = con.abierto_ms
  ev.marcarApertura('n1') // la segunda no la mueve
  const otra = ev.construirEvidencia({ nodo: 'n2', code: 'OK' })
  ev.olvidarEvidencia('n1')
  out.apertura = {
    sin: 'abierto_ms' in sin,
    con: typeof primera === 'number' && primera > 0,
    estable: ev.construirEvidencia({ nodo: 'n1', code: 'OK' }).abierto_ms === undefined,
    otroNodo: 'abierto_ms' in otra,
  }
  ev.marcarApertura(null)
  ev.marcarApertura('')
  out.apertura.vacia = 'abierto_ms' in ev.construirEvidencia({ nodo: '', code: 'OK' })
}

principal()
  .then(() => process.stdout.write(JSON.stringify(out)))
  .catch((e) => {
    process.stderr.write(String(e && e.stack ? e.stack : e))
    process.exit(1)
  })
