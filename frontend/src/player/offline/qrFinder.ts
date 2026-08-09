/**
 * Localizador de códigos QR por patrones de posición.
 *
 * Las pegatinas de SAGA llevan el logo encima de la información de formato, así
 * que ningún decodificador estándar puede leerlas. Para poder identificarlas
 * igualmente hace falta, primero, SABER DÓNDE ESTÁ el código con precisión: la
 * versión anterior usaba la caja de píxeles oscuros de la imagen, con lo que en
 * una foto del poste medía el poste y devolvía ruido.
 *
 * Aquí se implementa la localización de verdad: los tres cuadrados de las
 * esquinas de un QR tienen siempre la proporción 1:1:3:1:1 de oscuro/claro al
 * cruzarlos por el centro. Buscando esa firma por filas y confirmándola por
 * columnas se obtienen los tres centros, y con ellos la rejilla exacta de
 * módulos.
 */

export type FinderCenter = { x: number; y: number; moduleSize: number }

/** Binariza a blanco/negro con umbral por bloques (tolera luz irregular). */
export function binarize(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const lum = new Uint8Array(width * height)
  for (let i = 0, p = 0; p < data.length; p += 4, i++) {
    lum[i] = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000
  }

  const out = new Uint8Array(width * height)
  const block = 16

  let globalSum = 0
  for (let i = 0; i < lum.length; i++) globalSum += lum[i]
  const globalMean = globalSum / Math.max(1, lum.length)

  for (let by = 0; by < height; by += block) {
    for (let bx = 0; bx < width; bx += block) {
      let min = 255
      let max = 0
      let sum = 0
      let count = 0

      const yEnd = Math.min(by + block, height)
      const xEnd = Math.min(bx + block, width)

      for (let y = by; y < yEnd; y++) {
        for (let x = bx; x < xEnd; x++) {
          const v = lum[y * width + x]
          if (v < min) min = v
          if (v > max) max = v
          sum += v
          count++
        }
      }

      const mean = sum / Math.max(1, count)

      if (max - min > 24) {
        const threshold = (min + max) / 2
        for (let y = by; y < yEnd; y++) {
          for (let x = bx; x < xEnd; x++) {
            out[y * width + x] = lum[y * width + x] < threshold ? 1 : 0
          }
        }
      } else {
        // Bloque plano: NO puede umbralizarse contra su propia media. Dentro
        // del cuadrado macizo de un patrón de posición todos los píxeles
        // quedaban por encima del umbral y el patrón DESAPARECÍA, que era la
        // razón real de que no se localizara ningún código.
        const uniform = mean < globalMean * 0.85 ? 1 : 0
        for (let y = by; y < yEnd; y++) {
          for (let x = bx; x < xEnd; x++) {
            out[y * width + x] = uniform
          }
        }
      }
    }
  }

  return out
}

/** ¿Los cinco tramos siguen la proporción 1:1:3:1:1? */
function matchesRatio(runs: number[]): number | null {
  const total = runs.reduce((acc, value) => acc + value, 0)
  if (total < 7) return null

  const moduleSize = total / 7
  const tolerance = moduleSize * 0.6

  const expected = [1, 1, 3, 1, 1]
  for (let i = 0; i < 5; i++) {
    if (Math.abs(runs[i] - expected[i] * moduleSize) > tolerance * expected[i]) return null
  }

  return moduleSize
}

/** Confirma el patrón cruzando verticalmente por el centro candidato. */
function confirmVertical(
  bits: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number
): number | null {
  if (bits[cy * width + cx] !== 1) return null

  const runs = [0, 0, 0, 0, 0]

  // centro hacia arriba
  let y = cy
  while (y >= 0 && bits[y * width + cx] === 1) {
    runs[2]++
    y--
  }
  while (y >= 0 && bits[y * width + cx] === 0) {
    runs[1]++
    y--
  }
  while (y >= 0 && bits[y * width + cx] === 1) {
    runs[0]++
    y--
  }

  // centro hacia abajo
  y = cy + 1
  while (y < height && bits[y * width + cx] === 1) {
    runs[2]++
    y++
  }
  while (y < height && bits[y * width + cx] === 0) {
    runs[3]++
    y++
  }
  while (y < height && bits[y * width + cx] === 1) {
    runs[4]++
    y++
  }

  return matchesRatio(runs)
}

/** Encuentra los centros de los patrones de posición del QR. */
export function findFinderCenters(
  bits: Uint8Array,
  width: number,
  height: number
): FinderCenter[] {
  const candidates: FinderCenter[] = []

  for (let y = 0; y < height; y += 2) {
    let runs = [0, 0, 0, 0, 0]
    let current = 0
    let x = 0

    // saltar el claro inicial
    while (x < width && bits[y * width + x] === 0) x++

    while (x < width) {
      const bit = bits[y * width + x]
      const expectDark = current % 2 === 0

      if ((bit === 1) === expectDark) {
        runs[current]++
      } else if (current === 4) {
        const moduleSize = matchesRatio(runs)
        if (moduleSize !== null) {
          const centerX = Math.round(x - runs[4] - runs[3] - runs[2] / 2)
          const verticalModule = confirmVertical(bits, width, height, centerX, y)
          if (verticalModule !== null) {
            candidates.push({ x: centerX, y, moduleSize: (moduleSize + verticalModule) / 2 })
          }
        }
        runs = [runs[2], runs[3], runs[4], 1, 0]
        current = 3
      } else {
        current++
        runs[current] = 1
      }
      x++
    }
  }

  // Agrupar candidatos cercanos (la misma esquina se detecta en varias filas)
  const merged: Array<FinderCenter & { count: number }> = []
  for (const candidate of candidates) {
    const near = merged.find(
      (m) =>
        Math.abs(m.x / m.count - candidate.x) < candidate.moduleSize * 3 &&
        Math.abs(m.y / m.count - candidate.y) < candidate.moduleSize * 3
    )
    if (near) {
      near.x += candidate.x
      near.y += candidate.y
      near.moduleSize += candidate.moduleSize
      near.count++
    } else {
      merged.push({ ...candidate, count: 1 })
    }
  }

  return merged
    .filter((m) => m.count >= 2)
    .map((m) => ({
      x: m.x / m.count,
      y: m.y / m.count,
      moduleSize: m.moduleSize / m.count,
    }))
}

/**
 * Ordena tres centros en (esquina superior izquierda, superior derecha,
 * inferior izquierda) usando el ángulo recto que forman.
 */
/** Elige los 3 candidatos que de verdad forman las esquinas de un QR. */
function bestTriplet(centers: FinderCenter[]): FinderCenter[] | null {
  if (centers.length === 3) return centers
  let best: FinderCenter[] | null = null
  let bestScore = Infinity

  const dist = (p: FinderCenter, q: FinderCenter) => Math.hypot(p.x - q.x, p.y - q.y)

  for (let i = 0; i < centers.length; i++) {
    for (let j = i + 1; j < centers.length; j++) {
      for (let k = j + 1; k < centers.length; k++) {
        const trio = [centers[i], centers[j], centers[k]]
        const mods = trio.map((c) => c.moduleSize)
        const modVar = (Math.max(...mods) - Math.min(...mods)) / Math.max(...mods)
        if (modVar > 0.45) continue

        const sides = [
          dist(trio[0], trio[1]),
          dist(trio[1], trio[2]),
          dist(trio[0], trio[2]),
        ].sort((a, b) => a - b)
        if (sides[0] <= 0) continue

        // dos catetos iguales, hipotenusa = cateto * raíz(2), lado ~14 módulos
        const legErr = Math.abs(sides[0] - sides[1]) / sides[1]
        const hypErr = Math.abs(sides[2] - sides[1] * Math.SQRT2) / sides[2]
        const avgMod = mods.reduce((a, b) => a + b, 0) / 3
        const scaleErr = Math.abs(sides[1] - 14 * avgMod) / sides[1]

        const score = modVar + legErr * 2 + hypErr * 2 + scaleErr
        if (score < bestScore) {
          bestScore = score
          best = trio
        }
      }
    }
  }

  return best
}

export function orderFinders(
  centers: FinderCenter[]
): { topLeft: FinderCenter; topRight: FinderCenter; bottomLeft: FinderCenter } | null {
  if (centers.length < 3) return null

  const trio = bestTriplet(centers)
  if (!trio) return null
  const [a, b, c] = trio
  const dist = (p: FinderCenter, q: FinderCenter) => (p.x - q.x) ** 2 + (p.y - q.y) ** 2

  const ab = dist(a, b)
  const bc = dist(b, c)
  const ac = dist(a, c)

  // La hipotenusa une superior-derecha con inferior-izquierda; el vértice
  // opuesto es la esquina superior izquierda.
  let topLeft: FinderCenter
  let other1: FinderCenter
  let other2: FinderCenter

  if (bc >= ab && bc >= ac) {
    topLeft = a
    other1 = b
    other2 = c
  } else if (ac >= ab && ac >= bc) {
    topLeft = b
    other1 = a
    other2 = c
  } else {
    topLeft = c
    other1 = a
    other2 = b
  }

  // Producto vectorial para saber cuál va arriba a la derecha
  const cross =
    (other1.x - topLeft.x) * (other2.y - topLeft.y) -
    (other1.y - topLeft.y) * (other2.x - topLeft.x)

  return cross < 0
    ? { topLeft, topRight: other1, bottomLeft: other2 }
    : { topLeft, topRight: other2, bottomLeft: other1 }
}

/**
 * Extrae la matriz de módulos usando los tres centros. Cada centro está en el
 * módulo (3.5, 3.5) de su esquina, lo que fija la rejilla con precisión.
 */
export function sampleMatrix(
  bits: Uint8Array,
  width: number,
  height: number,
  modules: number
): boolean[][] | null {
  const centers = findFinderCenters(bits, width, height)
  const ordered = orderFinders(centers)
  if (!ordered) return null

  const { topLeft, topRight, bottomLeft } = ordered
  const span = modules - 7 // distancia en módulos entre centros de esquinas

  // Vectores de avance por módulo
  const colStep = {
    x: (topRight.x - topLeft.x) / span,
    y: (topRight.y - topLeft.y) / span,
  }
  const rowStep = {
    x: (bottomLeft.x - topLeft.x) / span,
    y: (bottomLeft.y - topLeft.y) / span,
  }

  const originX = topLeft.x - 3.5 * colStep.x - 3.5 * rowStep.x
  const originY = topLeft.y - 3.5 * colStep.y - 3.5 * rowStep.y

  const matrix: boolean[][] = []

  for (let r = 0; r < modules; r++) {
    const row: boolean[] = []
    for (let c = 0; c < modules; c++) {
      const sx = originX + (c + 0.5) * colStep.x + (r + 0.5) * rowStep.x
      const sy = originY + (c + 0.5) * colStep.y + (r + 0.5) * rowStep.y

      // Voto de 3x3 alrededor del centro del módulo
      let dark = 0
      let total = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = Math.round(sx) + dx
          const y = Math.round(sy) + dy
          if (x < 0 || y < 0 || x >= width || y >= height) continue
          total++
          if (bits[y * width + x] === 1) dark++
        }
      }

      if (total === 0) return null
      row.push(dark * 2 > total)
    }
    matrix.push(row)
  }

  return matrix
}
