// Ejecuta en Node frontend/src/player/components/conmutadoresMapa.ts (los conmutadores de diagnóstico `?mapa=`)
// y vuelca en JSON lo que hace, para tests/test_conmutadores_mapa.py. Mismo método que logica_jugador.cjs:
// se transpila con el `typescript` de frontend/node_modules (el módulo sólo importa TIPOS de maplibre-gl).
//
// Uso: node tests/js/conmutadores_mapa.cjs   (imprime un JSON por stdout)
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const RAIZ = path.resolve(__dirname, '..', '..')
const ts = require(path.join(RAIZ, 'frontend', 'node_modules', 'typescript'))
const fuente = fs.readFileSync(path.join(RAIZ, 'frontend', 'src', 'player', 'components', 'conmutadoresMapa.ts'), 'utf8')
const js = ts.transpileModule(fuente, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const modulo = { exports: {} }
vm.runInNewContext(js, { module: modulo, exports: modulo.exports, require, URLSearchParams })
const m = modulo.exports

function almacen() {
  const datos = new Map()
  return {
    datos,
    getItem: (k) => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => datos.set(k, String(v)),
    removeItem: (k) => datos.delete(k),
  }
}

// Un estilo con la misma forma que el de MapSurfaceGL (ids inventados: se reconocen por tipo).
function estilo() {
  return {
    version: 8,
    sources: {
      sat: { type: 'raster', tiles: ['https://ejemplo.test/map-tiles/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19 },
      dem: { type: 'raster-dem', tiles: ['https://ejemplo.test/dem-tiles/{z}/{x}/{y}.png'], maxzoom: 14 },
      demSombras: { type: 'raster-dem', tiles: ['https://ejemplo.test/dem-tiles/{z}/{x}/{y}.png'], maxzoom: 14 },
      casas: { type: 'geojson', data: 'https://ejemplo.test/api/edificios' },
      ruta: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      nodosVolumen: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    },
    layers: [
      {
        id: 'sat-capa',
        type: 'raster',
        source: 'sat',
        paint: {
          'raster-fade-duration': 0,
          'raster-contrast': ['step', ['zoom'], 0, 10.5, 0.12],
          'raster-saturation': ['step', ['zoom'], 0, 10.5, 0.18],
          'raster-brightness-min': ['step', ['zoom'], 0, 10.5, 0.02],
        },
      },
      { id: 'sombras', type: 'hillshade', source: 'demSombras', paint: { 'hillshade-exaggeration': 0.55 } },
      { id: 'casas-capa', type: 'fill-extrusion', source: 'casas', minzoom: 15, paint: {} },
      { id: 'ruta-capa', type: 'line', source: 'ruta', paint: {} },
      { id: 'nodos-volumen', type: 'fill-extrusion', source: 'nodosVolumen', paint: {} },
    ],
    terrain: { source: 'dem', exaggeration: 1.5 },
    sky: { 'sky-color': '#5b9bd5' },
  }
}

const resumen = (e) => ({
  satTiles: e.sources.sat.tiles,
  satAttr: e.sources.sat.attribution || null,
  demMaxzoom: e.sources.dem ? e.sources.dem.maxzoom : null,
  sombrasMaxzoom: e.sources.demSombras ? e.sources.demSombras.maxzoom : null,
  fuentes: Object.keys(e.sources),
  capas: e.layers.map((c) => c.id),
  pinturaSat: Object.keys(e.layers.find((c) => c.type === 'raster').paint),
  terreno: e.terrain || null,
  sky: Boolean(e.sky),
})

const salida = {}

// Sin nada: ninguno, el MISMO objeto y la sesión intacta.
{
  const a = almacen()
  const lista = m.leerConmutadores('', a)
  const base = estilo()
  const fuera = m.aplicarConmutadores(base, lista)
  salida.sinNada = {
    lista,
    mismoObjeto: fuera === base,
    igual: JSON.stringify(fuera) === JSON.stringify(estilo()),
    guardado: [...a.datos.entries()],
    pixelRatio: m.pixelRatioDelMapa(lista, 3) ?? null,
  }
}

// Cada conmutador por separado.
salida.cada = {}
for (const nombre of m.NOMBRES_DE_CONMUTADORES) {
  const base = estilo()
  const antes = JSON.stringify(base)
  const fuera = m.aplicarConmutadores(base, [nombre])
  salida.cada[nombre] = { ...resumen(fuera), baseIntacta: JSON.stringify(base) === antes, pixelRatio: m.pixelRatioDelMapa([nombre], 3) ?? null }
}
salida.nombres = m.NOMBRES_DE_CONMUTADORES

// Todos a la vez.
salida.todos = resumen(m.aplicarConmutadores(estilo(), m.NOMBRES_DE_CONMUTADORES))

// La dirección manda y se guarda; sin ella, lo guardado; `?mapa=normal` lo borra; lo desconocido se ignora.
{
  const a = almacen()
  const primera = m.leerConmutadores('?depurar-mapa=1&mapa=ESRI, terreno12 ,inventado,esri', a)
  const recarga = m.leerConmutadores('', a)
  const borrar = m.leerConmutadores('?mapa=normal', a)
  const tras = m.leerConmutadores('', a)
  const otro = almacen()
  m.leerConmutadores('?mapa=pr2', otro)
  const vacio = m.leerConmutadores('?mapa=', otro)
  salida.sesion = { primera, recarga, borrar, tras, vacio, guardadoTrasVacio: [...otro.datos.entries()], sinAlmacen: m.leerConmutadores('?mapa=fade', null) }
}

process.stdout.write(JSON.stringify(salida))
