// Ejecuta en Node el lector de QR y el generador de códigos, y vuelca en JSON
// lo que hacen, para que tests/test_motor_qr.py compruebe COMPORTAMIENTO.
//
// Los .ts se transpilan al vuelo con el `typescript` de frontend/node_modules
// (no hay runner de JS en el repo) y se importan desde una carpeta temporal.
//
// Uso: node tests/js/lector_qr.mjs   (imprime un JSON por stdout)
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const FRONT = join(RAIZ, 'frontend')
const requerir = createRequire(join(FRONT, 'package.json'))
const ts = requerir('typescript')
const jsQR = requerir('jsqr')
const React = requerir('react')
const { renderToStaticMarkup } = requerir('react-dom/server')
const { QRCodeSVG } = requerir('qrcode.react')

const temporal = mkdtempSync(join(tmpdir(), 'saga-qr-'))
async function cargar(relativo) {
  const fuente = readFileSync(join(FRONT, relativo), 'utf8')
  const js = ts.transpileModule(fuente, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const destino = join(temporal, relativo.replace(/[\\/]/g, '_') + '.mjs')
  writeFileSync(destino, js)
  return import(pathToFileURL(destino).href)
}

const nucleo = await cargar('src/player/offline/qrNucleo.ts')
const clasificar = await cargar('src/player/offline/clasificarQr.ts')
const generador = await cargar('src/shared/qrPayload.ts')

const tarjeta = readFileSync(join(FRONT, 'src', 'shared', 'qrCard.tsx'), 'utf8')
const constante = (nombre) => Number(new RegExp(`const ${nombre} = ([0-9]+)`).exec(tarjeta)?.[1])
const AJUSTES = {
  level: 'H',
  marginSize: constante('ZONA_DE_SILENCIO'),
  minVersion: constante('VERSION_MINIMA'),
  bgColor: '#ffffff',
  fgColor: '#000000',
}

/** Raster del código tal y como lo dibuja la tarjeta, a `escala` px por módulo. */
function rasterizar(payload, escala = 6) {
  const svg = renderToStaticMarkup(React.createElement(QRCodeSVG, { value: payload, ...AJUSTES }))
  const lado = Number(/viewBox="0 0 (\d+) (\d+)"/.exec(svg)[1])
  const d = (/<path[^>]*fill="#000000"[^>]*d="([^"]+)"/.exec(svg) || /<path[^>]*d="([^"]+)"[^>]*fill="#000000"/.exec(svg))[1]
  const px = lado * escala
  const g = new Uint8Array(px * px).fill(255)
  for (const c of d.matchAll(/M(\d+)[ ,](\d+)\s*h(\d+)v(\d+)/g)) {
    const [x0, y0, w, h] = c.slice(1, 5).map(Number)
    for (let y = y0 * escala; y < (y0 + h) * escala; y += 1)
      for (let x = x0 * escala; x < (x0 + w) * escala; x += 1) g[y * px + x] = 0
  }
  return { gris: { px: g, ancho: px, alto: px }, modulos: lado - 2 * AJUSTES.marginSize }
}

function conRuido(g, sigma, luz = 1, semilla = 7) {
  let s = semilla
  const azar = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const px = new Uint8Array(g.px.length)
  for (let i = 0; i < px.length; i += 1) {
    const n = Math.sqrt(-2 * Math.log(azar() + 1e-9)) * Math.cos(2 * Math.PI * azar())
    px[i] = Math.max(0, Math.min(255, (40 + g.px[i] * 0.75) * luz + n * sigma))
  }
  return { px, ancho: g.ancho, alto: g.alto }
}

const salida = {}

// --- Generador de códigos ---------------------------------------------------
const generados = Array.from({ length: 300 }, () => generador.generarPayloadQr())
salida.generador = {
  formatoOk: generados.every((p) => /^SAGA[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(p)),
  distintos: new Set(generados).size,
  sinAvisos: generados.every((p) => generador.revisarPayloadQr(p, { titulo: 'Fuente vieja', indice: 3, id: 12 }).length === 0),
  determinista: generador.generarPayloadQr((b) => b.fill(0)),
}
const ejemplo = rasterizar(generados[0])
salida.generador.modulosDelCodigo = ejemplo.modulos
salida.generador.leeLimpio = nucleo.leerConEstrategias(ejemplo.gris, ['suavizada'], jsQR)?.texto === generados[0]

salida.revisar = {
  numerado: generador.revisarPayloadQr('SAGA-01', { indice: 0 }),
  numeradoQr: generador.revisarPayloadQr('SAGA_QR_7'),
  conTitulo: generador.revisarPayloadQr('SAGA1:ITEM:fuente_vieja:Fuente vieja', { titulo: 'Fuente vieja' }),
  largo: generador.revisarPayloadQr('SAGA' + 'X7'.repeat(30)),
  datos: generador.revisarPayloadQr('https://ejemplo.invalid/?u=alguien@ejemplo.invalid'),
  vacio: generador.revisarPayloadQr('   '),
  bueno: generador.revisarPayloadQr('SAGAK7Q2MX', { titulo: 'Fuente vieja', indice: 0, id: 'nodo_a' }),
}

// --- Clasificar lo leído ----------------------------------------------------
const nodos = [['SAGAAAAAAA'], [], ['SAGABBBBBB', 'saga-bbbbbb'], ['SAGACCCCCC']]
const c = (texto, formato = 'text', indiceActual = 2, activo = 'SAGABBBBBB') =>
  clasificar.clasificarQr(texto, { activo, nodos, indiceActual, formato })
salida.clasificar = {
  actual: c('SAGABBBBBB'),
  actualSinGuiones: c('saga bbbbbb'),
  siguiente: c('SAGACCCCCC'),
  anterior: c('SAGAAAAAAA'),
  objeto: c('SAGA1:ITEM:llave:Llave', 'item'),
  ajeno: c('https://ejemplo.invalid/cartel'),
  vacio: c('   '),
  sinActivoPeroDelNodo: c('SAGABBBBBB', 'text', 2, null),
  payloadsDeNodo: clasificar.payloadsDeNodo({
    qr_payload: ' SAGAX ',
    config: { qr_payload: 'SAGAY' },
    physical_qr: { payload: 'SAGAZ' },
  }),
}

// --- Núcleo del lector: estrategias en casos difíciles ----------------------
const payload = 'SAGAK7Q2MX'
const { gris } = rasterizar(payload, 6)
const lee = (g, estrategias) => nucleo.leerConEstrategias(g, estrategias, jsQR)?.texto === payload

const invertido = nucleo.invertir(gris)
const oscuro = conRuido(gris, 3, 0.1)
const ruidoso = conRuido(gris, 28)
salida.nucleo = {
  estrategias: [...nucleo.ESTRATEGIAS],
  rotacion: [...nucleo.ROTACION_DEL_BUCLE],
  limpioPrimerFotograma: lee(gris, [nucleo.ROTACION_DEL_BUCLE[0]]),
  // jsQR 1.4 revienta con `onlyInvert`: la estrategia invertida no debe lanzar.
  invertidoSoloConInvertida: !lee(invertido, ['suavizada']) && lee(invertido, ['invertida']),
  oscuroConTodas: lee(oscuro, nucleo.ESTRATEGIAS),
  ruidosoConTodas: lee(ruidoso, nucleo.ESTRATEGIAS),
  imagenDegeneradaNoLanza: (() => {
    try {
      return nucleo.leerConEstrategias({ px: new Uint8Array(16 * 16), ancho: 16, alto: 16 }, nucleo.ESTRATEGIAS, jsQR) === null
    } catch {
      return false
    }
  })(),
  consejoOscuro: nucleo.consejoPara(nucleo.medirLuz(conRuido(gris, 2, 0.15))),
  consejoBorroso: nucleo.consejoPara({ media: 140, contraste: 120, nitidez: 1 }),
  consejoNormal: nucleo.consejoPara({ media: 140, contraste: 160, nitidez: 30 }),
}

rmSync(temporal, { recursive: true, force: true })
process.stdout.write(JSON.stringify(salida))
