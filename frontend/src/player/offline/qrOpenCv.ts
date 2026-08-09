/**
 * Localización del QR con OpenCV (WASM), cargado bajo demanda.
 *
 * Por qué hace falta: las pegatinas impresas llevan el logo SAGA sobre la
 * información de formato del código, así que ningún decodificador puede
 * leerlas. Sí se pueden IDENTIFICAR comparando su matriz de módulos con la de
 * los payloads de la misión, pero eso exige localizar el código con precisión.
 *
 * Se probaron un localizador propio por patrones de posición y el Detector de
 * ZXing: ninguno lo consigue sobre las fotos reales. OpenCV localiza el código
 * en las seis fotos de campo, y con su cuadrilátero la comparación da 100% de
 * coincidencia con 13 puntos de ventaja sobre el payload equivocado.
 */

const MODULES = 21
const CELL = 12
const OPENCV_URL = '/opencv.js'

type OpenCv = any

let loadPromise: Promise<OpenCv | null> | null = null

/** Carga opencv.js una sola vez. Es pesado, así que nunca en el arranque. */
export function loadOpenCv(): Promise<OpenCv | null> {
  if (loadPromise) return loadPromise

  loadPromise = new Promise<OpenCv | null>((resolve) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      resolve(null)
      return
    }

    const existing = (window as any).cv
    if (existing?.QRCodeDetector) {
      resolve(existing)
      return
    }

    const script = document.createElement('script')
    script.src = OPENCV_URL
    script.async = true

    const settle = () => {
      const cv = (window as any).cv
      if (!cv) {
        resolve(null)
        return
      }
      // El runtime WASM puede tardar en estar listo tras cargar el script.
      if (cv.Mat) {
        resolve(cv)
        return
      }
      cv.onRuntimeInitialized = () => resolve((window as any).cv || null)
    }

    script.onload = settle
    script.onerror = () => resolve(null)
    document.head.appendChild(script)
  })

  return loadPromise
}

export function isOpenCvReady(): boolean {
  const cv = typeof window !== 'undefined' ? (window as any).cv : null
  return Boolean(cv?.Mat && cv?.QRCodeDetector)
}

/**
 * Localiza el QR y devuelve su matriz de módulos 21x21 rectificada.
 * Devuelve null si no hay ningún código a la vista.
 */
export function detectQrMatrix(image: ImageData): boolean[][] | null {
  const cv = (window as any).cv
  if (!cv?.Mat || !cv?.QRCodeDetector) return null

  const src = cv.matFromImageData(image)
  const gray = new cv.Mat()
  const points = new cv.Mat()
  let warped: any = null
  let bw: any = null
  let transform: any = null
  let srcTri: any = null
  let dstTri: any = null
  let detector: any = null

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

    detector = new cv.QRCodeDetector()
    const found = detector.detect(gray, points)
    if (!found || points.rows * points.cols < 4) return null

    // Los 4 vértices en orden: superior izq, superior der, inferior der, inferior izq
    const corners: number[] = []
    for (let i = 0; i < 4; i++) {
      corners.push(points.data32F[i * 2], points.data32F[i * 2 + 1])
    }

    const size = MODULES * CELL
    srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, corners)
    dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, size, 0, size, size, 0, size])
    transform = cv.getPerspectiveTransform(srcTri, dstTri)

    warped = new cv.Mat()
    cv.warpPerspective(gray, warped, transform, new cv.Size(size, size))

    bw = new cv.Mat()
    cv.threshold(warped, bw, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU)

    const matrix: boolean[][] = []
    for (let r = 0; r < MODULES; r++) {
      const row: boolean[] = []
      for (let c = 0; c < MODULES; c++) {
        // Se promedia el centro del módulo, evitando los bordes
        let dark = 0
        let total = 0
        const y0 = Math.floor((r + 0.25) * CELL)
        const y1 = Math.floor((r + 0.75) * CELL)
        const x0 = Math.floor((c + 0.25) * CELL)
        const x1 = Math.floor((c + 0.75) * CELL)
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            total++
            if (bw.ucharPtr(y, x)[0] < 128) dark++
          }
        }
        row.push(total > 0 && dark * 2 > total)
      }
      matrix.push(row)
    }

    return matrix
  } catch {
    return null
  } finally {
    src?.delete?.()
    gray?.delete?.()
    points?.delete?.()
    warped?.delete?.()
    bw?.delete?.()
    transform?.delete?.()
    srcTri?.delete?.()
    dstTri?.delete?.()
    detector?.delete?.()
  }
}
