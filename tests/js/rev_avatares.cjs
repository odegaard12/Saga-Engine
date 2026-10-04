// Lógica pura de la revisión del 04/10: tamaño de los avatares en el mapa, deslizamiento a ritmo
// de fixes, rumbo suave, velocidad de paso y área visible de la tienda. Vuelca un JSON para
// tests/test_revision_avatares_y_tienda.py.
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const RAIZ = path.resolve(__dirname, '..', '..')
const SRC = path.join(RAIZ, 'frontend', 'src', 'player')
const ts = require(path.join(RAIZ, 'frontend', 'node_modules', 'typescript'))

const cache = {}
function cargar(ruta) {
  const abs = path.join(SRC, ruta + '.ts')
  if (cache[abs]) return cache[abs]
  const js = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const modulo = { exports: {} }
  const requerir = (n) => {
    if (n === 'react') return { useEffect() {} }
    if (!n.startsWith('.')) throw new Error('import no permitido en un módulo puro: ' + n)
    return cargar(path.relative(SRC, path.resolve(path.dirname(abs), n)).split(path.sep).join('/'))
  }
  vm.runInNewContext(js, {
    module: modulo, exports: modulo.exports, require: requerir,
    Math, Number, String, Array, Set, Map, Boolean, Object, JSON, Infinity, Error, isFinite: Number.isFinite,
  })
  cache[abs] = modulo.exports
  return modulo.exports
}

const L = cargar('avatares3d/mixamo/lodAvatares')
const D = cargar('avatares/movimientoSuave')
const A = cargar('avatares3d/mixamo/areaVisible')
const out = {}
const LAT = 42.6

// --- tamaño en pantalla ---
{
  const zs = []
  for (let z = 12; z <= 20.001; z += 0.5) zs.push(z)
  const px = zs.map((z) => L.alturaEnPantallaPx(z, LAT))
  out.tamano = {
    z12: L.alturaEnPantallaPx(12, LAT), z16: L.alturaEnPantallaPx(16, LAT), z17: L.alturaEnPantallaPx(17, LAT),
    z18: L.alturaEnPantallaPx(18, LAT), z20: L.alturaEnPantallaPx(20, LAT), z22: L.alturaEnPantallaPx(22, LAT),
    min: Math.min(...px), max: Math.max(...px),
    creciente: px.every((v, i) => i === 0 || v >= px[i - 1] - 1e-9),
    // en metros y dividido entre lo que mide un píxel vuelve a salir el alto en pantalla
    coherente: zs.every((z) => Math.abs(L.alturaVirtualM(z, LAT) / L.metrosPorPixel(z, LAT) - L.alturaEnPantallaPx(z, LAT)) < 1e-6),
    // del mismo tamaño a cualquier latitud (la escala la absorbe)
    latitudes: [0, 42.6, 60].map((la) => Math.round(L.alturaEnPantallaPx(18, la) * 10) / 10),
    realMinimo: L.alturaVirtualM(30, LAT),
    pasoMaxEntreMediosZooms: Math.max(...px.map((v, i) => (i ? Math.abs(v - px[i - 1]) : 0))),
  }
}

out.entrada = { cero: L.factorDeEntrada(0), neg: L.factorDeEntrada(-5), nan: L.factorDeEntrada(Number.NaN), mitad: L.factorDeEntrada(110), fin: L.factorDeEntrada(220), despues: L.factorDeEntrada(5000) }

// --- a quién se toca ---
{
  const S = (clave, x, pies, alto, esYo = false) => ({ clave, esYo, x, pies, cabeza: pies - alto })
  const uno = [S('a', 200, 400, 34)]
  out.tocado = {
    cuerpo: L.elegirTocado(uno, 200, 380), pies: L.elegirTocado(uno, 205, 405),
    lado: L.elegirTocado(uno, 200 + 30, 380), encima: L.elegirTocado(uno, 200, 400 - 60), debajo: L.elegirTocado(uno, 200, 420),
    grande: L.elegirTocado([S('g', 100, 500, 120)], 100 + 20, 500 - 100),
    yoPrimero: L.elegirTocado([S('a', 200, 420, 40), S('yo', 205, 400, 40, true)], 203, 395),
    elDeDelante: L.elegirTocado([S('lejos', 200, 380, 40), S('cerca', 210, 400, 40)], 205, 385),
    ignoraNaN: L.elegirTocado([{ clave: 'x', esYo: false, x: Number.NaN, pies: 1, cabeza: 0 }, S('a', 200, 400, 34)], 200, 380),
    vacio: L.elegirTocado([], 1, 1),
  }
}

// --- deslizamiento ---
function rutaAndada(intervaloMs, pasoM, fixes, dLonPorM = 1 / (111320 * Math.cos((LAT * Math.PI) / 180))) {
  const d = new D.Deslizador()
  let lon = -8.8
  d.poner({ lat: LAT, lon }, 0)
  const trazas = []
  for (let n = 1; n <= fixes; n += 1) {
    const t = n * intervaloMs
    lon += pasoM * dLonPorM
    d.poner({ lat: LAT, lon }, t)
    trazas.push({ t, dur: d.duracionMs() })
  }
  return { d, trazas, dLonPorM, lon }
}
{
  const dLon0 = 1 / (111320 * Math.cos((LAT * Math.PI) / 180))
  const m = (a, b) => D.distanciaM(a, b)
  // Un fix cada 4 s a 1,4 m/s (5,6 m por fix): velocidad de dibujo, paso a paso (como los fotogramas).
  const vivo = new D.Deslizador()
  let lon = -8.8
  const dLon = 1 / (111320 * Math.cos((LAT * Math.PI) / 180))
  vivo.poner({ lat: LAT, lon }, 0)
  const vs = []
  let parado = 0
  let total = 0
  let previa = vivo.posicion(0)
  let durUltima = 0
  for (let t = 100; t <= 28000; t += 100) {
    if (t % 4000 === 0 && t <= 24000) {
      lon += 5.6 * dLon
      vivo.poner({ lat: LAT, lon }, t)
      durUltima = vivo.duracionMs()
    }
    const p = vivo.posicion(t)
    if (t > 8000 && t <= 24000) {
      const v = m(previa, p) / 0.1
      vs.push(v)
      total += 1
      if (v < 0.001) parado += 1
    }
    previa = p
  }
  out.desliz4s = {
    duracion: durUltima,
    vMax: Math.max(...vs), vMin: Math.min(...vs), fraccionParado: parado / total,
  }
  // Un fix por segundo (el propio móvil) a 1,4 m/s.
  const s = rutaAndada(1000, 1.4, 10)
  out.desliz1s = { duracion: s.trazas[9].dur }
  // Tramo larguísimo para el ritmo: no se supera el trote.
  const rap = rutaAndada(1000, 40, 3)
  out.dslizRapido = { duracion: rap.trazas[2].dur, v: 40 / (rap.trazas[2].dur / 1000) }
  // Cámara y muñeco duran lo mismo: lo que dice duracionMs()
  const cam = rutaAndada(4000, 5.6, 6)
  out.camara = { igual: cam.d.duracionMs() === cam.trazas[5].dur }
  // Parado y reanuda tras 40 s: no se arrastra la pausa como ritmo.
  const q = rutaAndada(1000, 1.4, 5)
  q.d.poner({ lat: LAT, lon: q.lon + 1.4 * q.dLonPorM }, 5000 + 40000)
  out.trasPausa = { duracion: q.d.duracionMs() }
  // Un compañero manda un fix cada 4 s, pero la pantalla repite sus datos cada segundo (al moverte tú): no cuenta como ritmo.
  {
    const d = new D.Deslizador()
    let lon = -8.8
    d.poner({ lat: LAT, lon }, 0)
    let dur = 0
    for (let t = 1000; t <= 24000; t += 1000) {
      if (t % 4000 === 0) { lon += 5.6 * dLon0; d.poner({ lat: LAT, lon }, t); dur = d.duracionMs() } else d.poner({ lat: LAT, lon }, t)
    }
    out.duplicados = { duracion: dur }
  }
  // Salto grande: sin deslizar
  const j = new D.Deslizador()
  j.poner({ lat: LAT, lon: -8.8 }, 0)
  j.poner({ lat: LAT, lon: -8.7 }, 1000)
  out.salto = { enMov: j.enMovimiento(1001) }
  out.duracionDeTramo = { corto: D.duracionDeTramo(1, 1000), largo: D.duracionDeTramo(100, 1000), tope: D.duracionDeTramo(5000, 20000), lento: D.duracionDeTramo(5, 4000) }
}

// --- rumbo suave ---
{
  const d = new D.Deslizador()
  d.poner({ lat: LAT, lon: -8.8 }, 0)
  // al norte, luego al este: el rumbo real salta 90 grados
  d.poner({ lat: LAT + 0.0001, lon: -8.8 }, 1000)
  d.poner({ lat: LAT + 0.0002, lon: -8.8 }, 2000)
  let antes = null
  for (let t = 1000; t < 3000; t += 16) antes = d.rumboSuave(t)
  d.poner({ lat: LAT + 0.0002, lon: -8.7998 }, 3000)
  const real = d.rumbo(3000)
  const serie = {}
  for (let t = 3000; t <= 4500; t += 16) {
    const v = d.rumboSuave(t)
    if (t === 3000 + 16 * 1) serie.t16 = v
    if (t === 3000 + 16 * 19) serie.t300 = v
    if (t === 3000 + 16 * 93) serie.t1500 = v
  }
  const { t16, t300, t1500 } = serie
  out.rumbo = { antes, real, t16, t300, t1500, desaparece: d.rumboSuave(3000 + 25000) }
  // por el lado corto: de 350 a 10 grados no da la vuelta
  const e = new D.Deslizador()
  e.poner({ lat: LAT, lon: -8.8 }, 0)
  e.poner({ lat: LAT + 0.0001, lon: -8.8 - 0.00002 }, 1000)
  let a = null
  for (let t = 1000; t <= 1600; t += 16) a = e.rumboSuave(t)
  e.poner({ lat: LAT + 0.0002, lon: -8.8 + 0.00001 }, 2000)
  let b = null
  const camino = []
  for (let t = 2000; t <= 2400; t += 16) { b = e.rumboSuave(t); camino.push(b) }
  // nunca se aleja del destino pasando por el otro lado (todos los valores cerca de 350..360 o 0..15)
  out.rumbo.ladoCorto = { a, b, real: e.rumbo(2400), pasaPorElLadoLargo: camino.some((v) => v > 20 && v < 340) }
}

// --- velocidad de ventana ---
{
  const ruta = (f, ms, paso = 100) => {
    const m = []
    for (let t = 0; t <= ms; t += paso) L.anadirMuestra(m, { t, ...f(t) })
    return m
  }
  const anda = (t) => ({ x: (1.4 * t) / 1000, y: 0 })
  // Anda 8 s y para: cuánto tarda en dar 0
  const parar = ruta((t) => ({ x: (1.4 * Math.min(t, 8000)) / 1000, y: 0 }), 12000)
  let hasta = null
  let marcha = true
  for (let t = 8000; t <= 12000; t += 100) {
    const v = L.velocidadPorVentana(parar.filter((s) => s.t <= t), t, undefined, marcha)
    marcha = v > 0.05
    if (v === 0 && hasta === null) hasta = t - 8000
  }
  // Teléfono quieto con ruido (±2 m al azar cada fix de 4 s, deslizado a ritmo constante)
  let semilla = 7
  const azar = () => (((semilla = (semilla * 16807) % 2147483647) / 2147483647) - 0.5) * 4
  const fixes = Array.from({ length: 12 }, azar)
  const ruido = ruta((t) => {
    const i = Math.min(10, Math.floor(t / 4000))
    const f = (t % 4000) / 4000
    return { x: fixes[i] + (fixes[i + 1] - fixes[i]) * f, y: 0 }
  }, 40000)
  let echoAAndar = 0
  let marcha2 = false
  for (let t = 3000; t <= 40000; t += 100) {
    const v = L.velocidadPorVentana(ruido.filter((s) => s.t <= t), t, undefined, marcha2)
    marcha2 = v > 0.05
    if (marcha2) echoAAndar += 1
  }
  // Echa a andar y no se para por una racha lenta (0,9 m/s)
  const lento = ruta((t) => ({ x: (0.9 * t) / 1000, y: 0 }), 6000)
  out.ventana = {
    andando: Math.round(L.velocidadPorVentana(ruta(anda, 4000), 4000, undefined, false) * 10) / 10,
    tardaEnParar: hasta,
    muestrasConRuido: echoAAndar,
    lentoYaEnMarcha: L.velocidadPorVentana(lento, 6000, undefined, true) > 0.5,
  }
}

// --- velocidad de paso ---
{
  const k = (z) => L.alturaVirtualM(z, LAT) / 1.75
  out.paso = {
    parado: L.velocidadDePaso(0, 5), ruido: L.velocidadDePaso(0.04, 5),
    realK1: L.velocidadDePaso(1.4, 1), k10: L.velocidadDePaso(1.4, 10), k25: L.velocidadDePaso(1.4, 25),
    corriendoK10: L.velocidadDePaso(3.4, 10),
    despacio: L.velocidadDePaso(0.3, 20),
    sinEscala: L.velocidadDePaso(1.4, Number.NaN),
    // Cuántas veces más deprisa que el suelo se mueven los pies (1 = pisan firme), andando a 1,4 m/s.
    patinaje: Object.fromEntries([16, 17, 18, 19, 19.5].map((z) => {
      const kk = k(z)
      const nuevo = L.velocidadDePaso(1.4, kk) / (1.4 / kk)
      const antes = 1.4 / (1.4 / kk)
      return [z, { k: Math.round(kk * 10) / 10, antes: Math.round(antes * 10) / 10, ahora: Math.round(nuevo * 10) / 10 }]
    })),
  }
}

// --- área visible ---
out.area = {
  normal: A.variablesDeArea({ height: 780.4, offsetTop: 0 }, 844),
  conBarra: A.variablesDeArea({ height: 700, offsetTop: 30.2 }, 844),
  sinMedida: A.variablesDeArea(null, 667),
  absurda: A.variablesDeArea({ height: 0, offsetTop: -5 }, 0),
  minima: A.variablesDeArea({ height: 80, offsetTop: 0 }, 80),
  nan: A.variablesDeArea({ height: Number.NaN, offsetTop: Number.NaN }, 600),
}
process.stdout.write(JSON.stringify(out))
