/* eslint-disable no-undef */
/**
 * Worker de visión para las pegatinas QR con el logo encima.
 *
 * OpenCV son ~11 MB de WASM. Cargarlo en el hilo principal, con la página
 * sosteniendo además el vídeo de la cámara, agotaba la memoria del móvil y
 * cerraba la pestaña entera. Aquí vive aislado: si se queda sin memoria muere
 * el worker y la app sigue viva, cayendo al código de respaldo.
 *
 * El worker sólo LOCALIZA y muestrea la matriz de módulos; la comparación con
 * los payloads se hace en el hilo principal, que es barata.
 */

const MODULES = 21
const CELL = 12

let ready = false
let initPromise = null

/**
 * Arranca OpenCV una sola vez.
 *
 * ⚠️ NUNCA hacer `await self.cv`.
 *
 * El módulo de Emscripten es "thenable": tiene un `then` que llama al callback
 * pasándole el propio módulo. `await` sobre eso vuelve a ver un thenable y lo
 * encadena otra vez, en bucle infinito: el worker se queda al 100% de CPU y no
 * responde nunca. Medido en Chrome y en Node: el arranque no terminaba jamás.
 * Con `.then(callback)` explícito se ejecuta una sola vez y funciona.
 *
 * Además se cachea la promesa: sin eso cada mensaje relanzaba importScripts y
 * volvía a instanciar 11 MB de WASM.
 */
function initOpenCv() {
  if (initPromise) return initPromise

  initPromise = new Promise((resolve) => {
    let settled = false

    const done = (mod) => {
      if (settled) return
      settled = true
      if (mod && mod.Mat) self.cv = mod
      ready = !!(self.cv && self.cv.Mat)
      resolve(ready)
    }

    const giveUp = () => {
      if (settled) return
      settled = true
      resolve(false)
    }

    try {
      self.Module = { onRuntimeInitialized: () => done(self.Module) }
      self.importScripts('/opencv.js')

      const loaded = self.cv
      if (loaded && loaded.Mat) {
        done(loaded)
        return
      }
      if (loaded && typeof loaded.then === 'function') {
        loaded.then(done, giveUp)
      }
      // Si no, llegará por onRuntimeInitialized.
    } catch (err) {
      giveUp()
      return
    }

    // Red de seguridad: antes que dejar al jugador esperando para siempre,
    // se abandona y la app cae al código de respaldo.
    setTimeout(giveUp, 90000)
  })

  return initPromise
}

/**
 * ¿La matriz tiene de verdad los tres patrones de localización de un QR?
 *
 * Sin esta comprobación el detector devolvía a veces un cuadrilátero que no
 * era el código (el borde de la pegatina, una sombra) y salía una matriz de
 * ruido que luego empataba al 79% con los dos payloads. Mejor descartarla y
 * probar otro realce.
 */
function hasFinderPatterns(matrix) {
  const corners = [
    [0, 0],
    [0, MODULES - 7],
    [MODULES - 7, 0],
  ]

  for (const [row, col] of corners) {
    let hits = 0
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const ring = r === 0 || r === 6 || c === 0 || c === 6
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4
        if (matrix[row + r][col + c] === (ring || core)) hits++
      }
    }
    if (hits / 49 < 0.9) return false
  }
  return true
}

/** Muestrea la matriz 21x21 a partir de un gris ya localizado y enderezado. */
function sampleMatrix(cv, gray, points) {
  let warped = null
  let bw = null
  let transform = null
  let srcTri = null
  let dstTri = null

  try {
    if (points.data32F.length < 8) return null

    const corners = []
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

    const matrix = []
    for (let r = 0; r < MODULES; r++) {
      const row = []
      for (let c = 0; c < MODULES; c++) {
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
  } catch (err) {
    return null
  } finally {
    for (const mat of [warped, bw, transform, srcTri, dstTri]) {
      if (mat) {
        try {
          mat.delete()
        } catch (e) {
          // el Mat ya estaba liberado
        }
      }
    }
  }
}

/**
 * Localiza el QR y devuelve su matriz de módulos.
 *
 * Se prueban varios realces porque el detector de OpenCV falla con códigos
 * pequeños o con poco contraste, que es exactamente lo que sale en las fotos
 * de campo: el mismo código que a plena resolución se lee al 100% no se
 * localizaba en cuanto la pegatina salía algo más lejos.
 */
function detectMatrix(imageData) {
  const cv = self.cv
  if (!cv || !cv.QRCodeDetector) return null

  let src = null
  let gray = null
  let detector = null

  try {
    src = cv.matFromImageData(imageData)
    gray = new cv.Mat()
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    detector = new cv.QRCodeDetector()

    const variants = [
      { name: 'directo', build: null },
      { name: 'contraste', build: (input, out) => cv.equalizeHist(input, out) },
      {
        name: 'x2',
        build: (input, out) =>
          cv.resize(input, out, new cv.Size(0, 0), 2, 2, cv.INTER_CUBIC),
      },
    ]

    let fallback = null

    for (const variant of variants) {
      let work = gray
      let owned = null

      if (variant.build) {
        owned = new cv.Mat()
        try {
          variant.build(gray, owned)
          work = owned
        } catch (err) {
          owned.delete()
          continue
        }
      }

      const points = new cv.Mat()
      try {
        if (detector.detect(work, points)) {
          const matrix = sampleMatrix(cv, work, points)
          if (matrix) {
            // Con patrones de localización válidos la lectura es de fiar y se
            // devuelve ya. Si no, se guarda por si ningún realce da algo mejor.
            if (hasFinderPatterns(matrix)) return matrix
            if (!fallback) fallback = matrix
          }
        }
      } catch (err) {
        // realce descartado, se prueba el siguiente
      } finally {
        points.delete()
        if (owned) owned.delete()
      }
    }

    return fallback
  } catch (err) {
    return null
  } finally {
    if (src) src.delete()
    if (gray) gray.delete()
    if (detector) detector.delete()
  }
}

self.onmessage = async (event) => {
  const data = event.data || {}
  const id = data.id

  if (data.type === 'warmup') {
    const ok = await initOpenCv()
    self.postMessage({ id, type: 'warmup', ok })
    return
  }

  if (data.type === 'detect') {
    const ok = await initOpenCv()
    if (!ok) {
      self.postMessage({ id, type: 'detect', matrix: null, error: 'engine_unavailable' })
      return
    }
    const imageData = {
      data: new Uint8ClampedArray(data.buffer),
      width: data.width,
      height: data.height,
    }
    const matrix = detectMatrix(imageData)
    self.postMessage({ id, type: 'detect', matrix })
  }
}
