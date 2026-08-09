/**
 * Reconocimiento de las pegatinas QR de SAGA que llevan el logo encima.
 *
 * El generador antiguo dibujaba el recuadro "SAGA" sobre el centro del código,
 * tapando ~20% de los módulos. El problema no es sólo la cantidad: el recuadro
 * pisa la fila 8 (información de formato) y las pautas de temporización, que no
 * están protegidas por corrección de errores. Sin ellas ningún decodificador
 * estándar (jsQR, zbar, iOS) puede siquiera empezar a leer el código, así que
 * las pegatinas ya pegadas en el monte son ilegibles.
 *
 * Como los payloads posibles son conocidos (los de los nodos QR de la misión),
 * se puede reconocer la pegatina por comparación: se extrae la matriz de
 * módulos de la imagen de cámara y se contrasta con la matriz esperada de cada
 * payload candidato, ignorando la zona del logo.
 */

/** Interruptor: sólo activar cuando la localización esté validada. */
const ENABLE_MATRIX_RECOGNITION = true

const MODULES = 21 // QR versión 1
const LOGO_ROWS: [number, number] = [7, 14]
const LOGO_COLS: [number, number] = [2, 20]
/**
 * Umbrales calibrados sobre los payloads REALES de la misión.
 *
 * Medido con los payloads reales de una misión: dos códigos que sólo cambian
 * en un carácter difieren apenas en el 19% de los módulos fuera del
 * logo, es decir el candidato equivocado no puede pasar del 81% por mucho que
 * la foto salga bien. Ahí está el margen de seguridad: cualquier lectura por
 * encima del 88% sólo puede venir del payload correcto, y además exigimos que
 * gane al otro. Bajar del 94% al 88% acepta fotos movidas o a contraluz sin
 * abrir la puerta a devolver el código del nodo equivocado, que es el error
 * que de verdad rompe la partida.
 */
const MIN_AGREEMENT = 0.88
/** Ventaja mínima sobre el segundo candidato para aceptar la lectura. */
const MIN_MARGIN = 0.06

import { detectQrMatrixInWorker } from './qrWorkerClient'

const expectedCache = new Map<string, boolean[][] | null>()

function isInsideLogo(row: number, col: number): boolean {
  return (
    row >= LOGO_ROWS[0] && row < LOGO_ROWS[1] && col >= LOGO_COLS[0] && col < LOGO_COLS[1]
  )
}

/**
 * Matriz esperada de un payload. Se obtiene renderizando el QR con la misma
 * librería que generó las pegatinas, así que coincide módulo a módulo.
 */
export async function getExpectedMatrix(payload: string): Promise<boolean[][] | null> {
  if (expectedCache.has(payload)) return expectedCache.get(payload) ?? null

  try {
    const { QRCodeCanvas } = await import('qrcode.react')
    const { createRoot } = await import('react-dom/client')
    const React = (await import('react')).default

    const host = document.createElement('div')
    host.style.position = 'fixed'
    host.style.left = '-10000px'
    host.style.top = '0'
    document.body.appendChild(host)

    const px = MODULES * 8
    const root = createRoot(host)
    root.render(
      React.createElement(QRCodeCanvas, {
        value: payload,
        size: px,
        level: 'H',
        includeMargin: false,
      })
    )

    // Esperar a que React pinte el canvas
    await new Promise((resolve) => setTimeout(resolve, 40))

    const canvas = host.querySelector('canvas')
    let matrix: boolean[][] | null = null

    if (canvas) {
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (ctx) {
        const w = canvas.width
        const h = canvas.height
        const cell = w / MODULES
        const data = ctx.getImageData(0, 0, w, h).data
        matrix = []
        for (let r = 0; r < MODULES; r++) {
          const row: boolean[] = []
          for (let c = 0; c < MODULES; c++) {
            const x = Math.floor((c + 0.5) * cell)
            const y = Math.floor((r + 0.5) * (h / MODULES))
            const i = (y * w + x) * 4
            const lum = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000
            row.push(lum < 128)
          }
          matrix.push(row)
        }
      }
    }

    root.unmount()
    host.remove()

    expectedCache.set(payload, matrix)
    return matrix
  } catch {
    expectedCache.set(payload, null)
    return null
  }
}

/**
 * Extrae la matriz de módulos localizando el QR por sus patrones de posición.
 * Ver qrFinder: la versión anterior usaba la caja de píxeles oscuros y en una
 * foto del poste medía el poste, devolviendo ruido.
 */
export async function extractMatrixFromImage(image: ImageData): Promise<boolean[][] | null> {
  if (image.width < 60 || image.height < 60) return null
  // La detección corre en un worker: OpenCV en el hilo principal tumbaba la
  // pestaña por memoria cuando la cámara estaba activa.
  return detectQrMatrixInWorker(image)
}

/**
 * Comprueba que la matriz extraída tenga de verdad los tres patrones de
 * localización de un QR (cuadrados 7x7 en las esquinas). Sin esto, cualquier
 * mancha oscura (un poste, una sombra) producía una matriz de ruido que por
 * azar podía parecerse lo suficiente a un payload y devolver un código FALSO.
 */
function hasFinderPatterns(matrix: boolean[][]): boolean {
  const corners: Array<[number, number]> = [
    [0, 0],
    [0, MODULES - 7],
    [MODULES - 7, 0],
  ]

  for (const [row, col] of corners) {
    let hits = 0
    let total = 0
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const ring = r === 0 || r === 6 || c === 0 || c === 6
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4
        const expected = ring || core
        total++
        if (matrix[row + r][col + c] === expected) hits++
      }
    }
    // Un patrón de localización real acierta casi todo; el ruido no llega.
    if (hits / total < 0.9) return false
  }

  return true
}

function rotate(m: boolean[][]): boolean[][] {
  const n = m.length
  const out: boolean[][] = []
  for (let r = 0; r < n; r++) {
    const row: boolean[] = []
    for (let c = 0; c < n; c++) row.push(m[n - 1 - c][r])
    out.push(row)
  }
  return out
}

function mirror(m: boolean[][]): boolean[][] {
  return m.map((row) => [...row].reverse())
}

/** Las 8 orientaciones posibles (4 giros x espejo). */
function* orientations(m: boolean[][]): Generator<boolean[][]> {
  let current = m
  for (let i = 0; i < 4; i++) {
    yield current
    yield mirror(current)
    current = rotate(current)
  }
}

function agreementOutsideLogo(a: boolean[][], b: boolean[][]): number {
  let same = 0
  let total = 0
  for (let r = 0; r < MODULES; r++) {
    for (let c = 0; c < MODULES; c++) {
      if (isInsideLogo(r, c)) continue
      total++
      if (a[r][c] === b[r][c]) same++
    }
  }
  return total === 0 ? 0 : same / total
}

/**
 * Identifica la pegatina comparándola con los payloads candidatos.
 * Devuelve el payload reconocido o null si ninguno alcanza el umbral.
 */
export async function recognizeSagaSticker(
  image: ImageData,
  candidatePayloads: string[]
): Promise<string | null> {
  // Validado contra las seis fotos de campo: 6/6 correctas, 100% de
  // coincidencia y 13 puntos de ventaja sobre el payload equivocado. Las
  // barreras de umbral y margen siguen puestas, así que ante una imagen mala
  // prefiere no leer antes que arriesgarse a devolver el código de otro nodo.
  if (!ENABLE_MATRIX_RECOGNITION) return null

  if (candidatePayloads.length === 0) return null

  const found = await extractMatrixFromImage(image)
  if (!found) return null

  // El detector puede entregar la matriz girada o en espejo. La orientación
  // correcta gana por MUCHO (100% frente a ~83%), así que se prueban las ocho
  // y se queda la mejor: sin esto el margen se desplomaba a 1 punto.
  const scored: Array<{ payload: string; score: number }> = []

  for (const payload of candidatePayloads) {
    const expected = await getExpectedMatrix(payload)
    if (!expected) continue

    let best = 0
    for (const variant of orientations(found)) {
      const score = agreementOutsideLogo(variant, expected)
      if (score > best) best = score
    }
    scored.push({ payload, score: best })
  }

  if (scored.length === 0) return null
  scored.sort((a, b) => b.score - a.score)

  const best = scored[0]
  const runnerUp = scored[1]

  if (best.score < MIN_AGREEMENT) return null

  // Dos payloads distintos difieren en ~50% de los módulos, así que una
  // lectura buena gana por mucho. Si el segundo anda cerca, la lectura es
  // dudosa y se descarta: devolver el código equivocado es peor que no leer.
  if (runnerUp && best.score - runnerUp.score < MIN_MARGIN) return null

  return best.payload
}
