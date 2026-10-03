// Ejecuta en Node la lógica pura de los avatares 3D (catálogo, aspecto <-> parts, presupuesto
// por calidad, velocidad por ventana) y vuelca un JSON para tests/test_avatares_mixamo.py.
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

const C = cargar('avatares3d/mixamo/catalogo')
const L = cargar('avatares3d/mixamo/lodAvatares')
const T = cargar('avatares3d/mixamo/textosTienda')
const AC = cargar('avatares/avatarConfig')
const P = cargar('avatares/personajes')
const out = {}

// --- catálogo ---
out.ids = [...C.MX_IDS]
out.nombres = C.MX_NOMBRES
out.legacy = C.MX_LEGACY
out.deLegacy = C.MX_DE_LEGACY
out.deLegacyInyectivo = new Set(Object.values(C.MX_DE_LEGACY)).size === Object.keys(C.MX_DE_LEGACY).length
out.legacyValidos = Object.values(C.MX_LEGACY).every((p) => P.esPersonaje(p))
out.coloresRopa = C.COLORES_DE_ROPA.length
out.coloresPelo = C.COLORES_DE_PELO.length
out.hexValidos = [...C.COLORES_DE_ROPA, ...C.COLORES_DE_PELO].every((c) => /^#[0-9a-f]{6}$/.test(c.tint) && c.amt > 0 && c.amt <= 1)
out.huecos = Object.fromEntries(C.HUECOS.map((h) => [h.clave, [...h.items]]))
out.complementos = Object.fromEntries(Object.entries(C.COMPLEMENTOS).map(([k, v]) => [k, { hueco: v.hueco, ocupa: [...v.ocupa] }]))
out.gestos = C.GESTOS.map((g) => g.clip)
out.festejo = [...C.GESTOS_DE_FESTEJO]
out.conjuntos = C.CONJUNTOS.length
out.nombresEsGl = C.GESTOS.every((g) => g.es && g.gl) && C.CONJUNTOS.every((c) => c.es && c.gl) &&
  C.COLORES_DE_ROPA.every((c) => c.es && c.gl) && Object.values(C.COMPLEMENTOS).every((c) => c.es && c.gl)

// --- aspecto <-> parts ---
const base = { mx: 'Ch22', top: 3, pants: 10, hair: 4, items: { cabeza: 'boina', manoD: 'bordon' } }
const parts = C.aspectoAParts(base)
out.parts = parts
out.roundTrip = C.partsAAspecto(parts)
out.config = C.configDeAspecto(base)
out.configNormaliza = AC.normalizarAvatar(C.configDeAspecto(base))
out.claveDistintaPorColor = AC.claveDeAvatar(C.configDeAspecto(base)) !== AC.claveDeAvatar(C.configDeAspecto({ ...base, top: 4 }))
out.claveIgual = AC.claveDeAvatar(C.configDeAspecto(base)) === AC.claveDeAvatar(C.configDeAspecto({ ...base, items: { manoD: 'bordon', cabeza: 'boina' } }))
const rechazar = (p) => C.partsAAspecto(p) === null
out.rechazos = {
  sinMx: rechazar({ top: 1 }),
  mxFalso: rechazar({ mx: 'Ch99' }),
  colorFuera: rechazar({ mx: 'Ch01', top: 17 }),
  colorNegativo: rechazar({ mx: 'Ch01', pants: -1 }),
  colorFraccion: rechazar({ mx: 'Ch01', hair: 1.5 }),
  pelo: rechazar({ mx: 'Ch01', hair: 8 }),
  objetoInventado: rechazar({ mx: 'Ch01', cabeza: 'corona' }),
  objetoEnOtroHueco: rechazar({ mx: 'Ch01', cabeza: 'bordon' }),
  gaitaYBordon: rechazar({ mx: 'Ch01', dos: 'gaita', manoD: 'bordon' }),
  gaitaYCesta: rechazar({ mx: 'Ch01', dos: 'gaita', manoI: 'cesta' }),
  noObjeto: rechazar('Ch01'),
  nulo: rechazar(null),
}
out.valido = !rechazar({ mx: 'Ch01' }) // sólo mx: el resto, de serie
out.deSerie = C.partsAAspecto({ mx: 'Ch01' })

// --- manos ---
const ocupa = (items) => [...C.manosOcupadas(items)].sort()
out.manos = {
  gaita: ocupa({ dos: 'gaita' }),
  bordon: ocupa({ manoD: 'bordon' }),
  dos: ocupa({ manoD: 'bordon', manoI: 'cesta' }),
  gorro: ocupa({ cabeza: 'boina', espalda: 'mochila' }),
}
out.bloqueos = {
  gaitaConBordon: C.bloqueadoPor('gaita', { manoD: 'bordon' }),
  gaitaConCesta: C.bloqueadoPor('gaita', { manoI: 'cesta' }),
  bordonConGaita: C.bloqueadoPor('bordon', { dos: 'gaita' }),
  cestaConBordon: C.bloqueadoPor('cesta', { manoD: 'bordon' }),
  cambiarBordonPorParaguas: C.bloqueadoPor('paraguas', { manoD: 'bordon' }),
  boina: C.bloqueadoPor('boina', { dos: 'gaita' }),
}
const conGaita = C.conComplemento({ manoD: 'bordon' }, 'gaita')
out.conComplemento = {
  gaitaNoCabe: conGaita,
  paraguasSustituyeBordon: C.conComplemento({ manoD: 'bordon' }, 'paraguas'),
  quitar: C.sinComplemento({ manoD: 'bordon', cabeza: 'boina' }, 'bordon'),
}

// --- conjuntos ---
out.conjuntosValidos = C.CONJUNTOS.every((c) => {
  const a = C.aplicarConjunto({ mx: 'Ch01', top: 0, pants: 0, hair: 0, items: {} }, c)
  return C.partsAAspecto(C.aspectoAParts(a)) !== null
})
out.conjuntoNoCambiaElPersonaje = C.aplicarConjunto({ mx: 'Ch37', top: 0, pants: 0, hair: 0, items: {} }, C.CONJUNTOS[2]).mx === 'Ch37'

// --- por defecto: estable, válido y repartido ---
const ids = ['Ana', 'prueba1', 'prueba2', 'Óscar', 'niño-ñ', '']
out.defectos = ids.map((i) => [i, C.aspectoPorDefecto(i)])
out.defectoEstable = JSON.stringify(C.aspectoPorDefecto('Ana')) === JSON.stringify(C.aspectoPorDefecto('Ana'))
out.defectosValidos = Array.from({ length: 300 }, (_, i) => C.aspectoPorDefecto('jugador-' + i)).every(
  (a) => C.partsAAspecto(C.aspectoAParts(a)) !== null && Object.keys(a.items).length === 0
)
out.defectoReparte = new Set(Array.from({ length: 300 }, (_, i) => C.aspectoPorDefecto('jugador-' + i).mx)).size
out.aspectoDe = {
  conAvatar: C.aspectoDe({ user: 'x', avatar: { character: 'peregrino', parts } }).mx,
  // Quien no ha elegido: el que le toca por su id, aunque el servidor le ponga un `character` de defecto.
  sinElegir: C.aspectoDe({ user: 'Ana', character_chosen: false, character: 'can', avatar: { character: 'can' } }).mx === C.aspectoPorDefecto('Ana').mx,
  partsMalos: C.aspectoDe({ user: 'Ana', character_chosen: true, avatar: { character: 'can', parts: { mx: 'Ch99' } } }).mx === 'Ch28',
  // Quien eligió en la versión 2D (sólo `character`) pasa a su personaje 3D, con los colores de serie.
  deLaVersion2D: C.aspectoDe({ user: 'Ana', character_chosen: true, avatar: { character: 'vikingo' } }),
  deLaVersion2DPlano: C.aspectoDe({ user: 'Ana', character_chosen: true, character: 'bruxa' }).mx,
}

// --- calidad y reparto 2D/3D ---
out.tope = L.TOPE_DE_AVATARES
out.calidadInicial = {
  movilViejo: L.calidadInicial({ memoriaGB: 2, nucleos: 4 }),
  nucleosJustos: L.calidadInicial({ memoriaGB: null, nucleos: 4 }),
  medio: L.calidadInicial({ memoriaGB: 4, nucleos: 8 }),
  potente: L.calidadInicial({ memoriaGB: 8, nucleos: 8 }),
  sinDatos: L.calidadInicial({}),
}
out.forma = {
  lejos: L.formaQuePermiteTresD(13, 55),
  justo: L.formaQuePermiteTresD(16, 55),
  cenital: L.formaQuePermiteTresD(17, 0),
  cerca: L.formaQuePermiteTresD(19, 55),
}
const cand = (clave, distancia, extra = {}) => ({ clave, esYo: false, distancia, disponible: true, ...extra })
const grupo = [cand('lejos', 9), cand('cerca', 1), cand('yo', 5, { esYo: true }), cand('medio', 3), cand('sinModelo', 0.1, { disponible: false }),
  cand('otro1', 4), cand('otro2', 6), cand('otro3', 7), cand('otro4', 8)]
out.lod = {
  baja: L.elegirEnTresD(grupo, 'baja'),
  media: L.elegirEnTresD(grupo, 'media'),
  alta: L.elegirEnTresD(grupo, 'alta'),
  yoSinModelo: L.elegirEnTresD([cand('yo', 0, { esYo: true, disponible: false }), cand('a', 1)], 'baja'),
  vacio: L.elegirEnTresD([], 'alta'),
}
out.lodMuchos = L.elegirEnTresD(Array.from({ length: 40 }, (_, i) => cand('j' + i, i)), 'alta').tresD.length

// --- velocidad por ventana ---
const ruta = (vx, ms, paso = 100) => {
  const m = []
  for (let t = 0; t <= ms; t += paso) L.anadirMuestra(m, { t, x: (vx * t) / 1000, y: 0 })
  return m
}
out.velocidad = {
  parado: L.velocidadPorVentana(ruta(0, 4000), 4000),
  ruidoGps: L.velocidadPorVentana(ruta(0.2, 4000), 4000),
  andando: Math.round(L.velocidadPorVentana(ruta(1.4, 4000), 4000) * 10) / 10,
  corriendo: Math.round(L.velocidadPorVentana(ruta(3.4, 4000), 4000) * 10) / 10,
  unaMuestra: L.velocidadPorVentana([{ t: 0, x: 0, y: 0 }], 0),
  topeAbsurdo: L.velocidadPorVentana(ruta(60, 4000), 4000),
}
// El GPS manda un punto cada pocos segundos y el muñeco se desliza 1,4 s entre dos: la velocidad no debe parpadear.
{
  const m = []
  const x = (t) => 1.4 * (Math.floor(t / 4000) * 4 + Math.min(1.4, (t % 4000) / 1000))
  for (let t = 0; t <= 12000; t += 100) L.anadirMuestra(m, { t, x: x(t), y: 0 })
  const lecturas = []
  for (let t = 8000; t <= 12000; t += 500) lecturas.push(L.velocidadPorVentana(m.filter((s) => s.t <= t), t))
  out.velocidad.sinParpadeo = lecturas.every((v) => v > 0.5)
}
{
  const m = []
  for (let t = 0; t < 30000; t += 100) L.anadirMuestra(m, { t, x: 1, y: 1 })
  out.muestrasAcotadas = m.length
}

// --- gobernador de calidad: mide el EXCESO sobre la espera pedida al mapa ---
{
  const correr = (calidad, dt, espera, hasta = 12000) => {
    const g = new L.GobernadorDeCalidad(calidad)
    const cambios = []
    for (let now = 0; now < hasta; now += dt) {
      const r = g.muestra(dt, now, espera)
      if (r) cambios.push(r)
    }
    return cambios
  }
  out.gobernador = {
    // A ritmo (33 ms pedidos, 33 reales) y en reposo (53 pedidos, 55 reales): nada que bajar.
    sano: correr('alta', 33, 33),
    reposo: correr('alta', 55, 53),
    // Tarda 100 ms con 40 pedidos: baja de uno en uno hasta el suelo.
    lento: correr('alta', 100, 40),
    // Con el mapa en marcha (rAF, 16 ms) aunque no se pida espera: no es lentitud.
    mapaEnMarcha: correr('alta', 16, 40),
    sigueBaja: correr('baja', 200, 40).length === 0,
    // Pestaña oculta: no es lentitud.
    pausa: correr('alta', 5000, 33),
  }
}

const claves = (o) => Object.keys(o).sort()
out.textos = {
  tienda: [claves(T.TEXTOS_TIENDA.es), claves(T.TEXTOS_TIENDA.gl)],
  pestanas: [claves(T.TEXTOS_TIENDA.es.pestanas), claves(T.TEXTOS_TIENDA.gl.pestanas)],
  gestos: [claves(T.TEXTOS_MENU_GESTOS.es), claves(T.TEXTOS_MENU_GESTOS.gl)],
  vacios: Object.values(T.TEXTOS_TIENDA.es).concat(Object.values(T.TEXTOS_TIENDA.gl)).filter((v) => v === '').length,
  idiomas: [T.idiomaDeTienda('es'), T.idiomaDeTienda('gl'), T.idiomaDeTienda('en'), T.idiomaDeTienda('')],
}
out.alturaVirtual = { z13: L.alturaVirtualM(13), z17: L.alturaVirtualM(17), z19: L.alturaVirtualM(19), z25: L.alturaVirtualM(25) }
process.stdout.write(JSON.stringify(out))
