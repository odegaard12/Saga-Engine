export type CellKey = `${number}:${number}`

type Point = {
  row: number
  col: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function keyOf(point: Point): CellKey {
  return `${point.row}:${point.col}` as CellKey
}

function hashSeed(input: string): number {
  let hash = 2166136261

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

function createRandom(seed: string): () => number {
  let state = hashSeed(seed) || 0x6d2b79f5

  return () => {
    state += 0x6d2b79f5
    let value = state

    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(values: T[], random: () => number): T[] {
  const result = [...values]

  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    const current = result[index]
    result[index] = result[target]
    result[target] = current
  }

  return result
}

function neighbors(point: Point, rows: number, cols: number): Point[] {
  return [
    { row: point.row - 1, col: point.col },
    { row: point.row + 1, col: point.col },
    { row: point.row, col: point.col - 1 },
    { row: point.row, col: point.col + 1 },
  ].filter(
    (candidate) =>
      candidate.row >= 0 &&
      candidate.row < rows &&
      candidate.col >= 0 &&
      candidate.col < cols,
  )
}

function perimeter(rows: number, cols: number): Point[] {
  const points: Point[] = []

  for (let col = 0; col < cols; col += 1) {
    points.push({ row: 0, col })
    if (rows > 1) points.push({ row: rows - 1, col })
  }

  for (let row = 1; row < rows - 1; row += 1) {
    points.push({ row, col: 0 })
    if (cols > 1) points.push({ row, col: cols - 1 })
  }

  return points
}

function searchPath(
  current: Point,
  targetLength: number,
  rows: number,
  cols: number,
  path: Point[],
  visited: Set<CellKey>,
  random: () => number,
): boolean {
  if (path.length >= targetLength) return true

  const candidates = shuffle(
    neighbors(current, rows, cols).filter(
      (candidate) => !visited.has(keyOf(candidate)),
    ),
    random,
  )

  for (const candidate of candidates) {
    const key = keyOf(candidate)

    visited.add(key)
    path.push(candidate)

    if (
      searchPath(
        candidate,
        targetLength,
        rows,
        cols,
        path,
        visited,
        random,
      )
    ) {
      return true
    }

    path.pop()
    visited.delete(key)
  }

  return false
}

function fallbackPath(rows: number, cols: number, length: number): CellKey[] {
  const cells: CellKey[] = []

  for (let row = 0; row < rows; row += 1) {
    if (row % 2 === 0) {
      for (let col = 0; col < cols; col += 1) {
        cells.push(`${row}:${col}`)
      }
    } else {
      for (let col = cols - 1; col >= 0; col -= 1) {
        cells.push(`${row}:${col}`)
      }
    }
  }

  return cells.slice(0, length)
}

export function buildCircuitPath(
  rawRows: number,
  rawCols: number,
  rawLength: number,
  seed: string,
): CellKey[] {
  const rows = clamp(Math.round(rawRows), 4, 6)
  const cols = clamp(Math.round(rawCols), 4, 6)
  const targetLength = clamp(Math.round(rawLength), 4, rows * cols)
  const edgeCells = perimeter(rows, cols)

  for (let attempt = 0; attempt < 32; attempt += 1) {
    const random = createRandom(`${seed}:${rows}:${cols}:${attempt}`)
    const start = edgeCells[Math.floor(random() * edgeCells.length)]

    const path: Point[] = [start]
    const visited = new Set<CellKey>([keyOf(start)])

    if (
      searchPath(
        start,
        targetLength,
        rows,
        cols,
        path,
        visited,
        random,
      )
    ) {
      return path.map(keyOf)
    }
  }

  return fallbackPath(rows, cols, targetLength)
}

export function isCircuitPathValid(
  path: CellKey[],
  rows: number,
  cols: number,
): boolean {
  if (path.length < 4) return false

  const seen = new Set<CellKey>()

  for (let index = 0; index < path.length; index += 1) {
    const [row, col] = path[index].split(':').map(Number)

    if (
      !Number.isInteger(row) ||
      !Number.isInteger(col) ||
      row < 0 ||
      row >= rows ||
      col < 0 ||
      col >= cols ||
      seen.has(path[index])
    ) {
      return false
    }

    seen.add(path[index])

    if (index > 0) {
      const [previousRow, previousCol] = path[index - 1]
        .split(':')
        .map(Number)

      if (
        Math.abs(row - previousRow) + Math.abs(col - previousCol) !== 1
      ) {
        return false
      }
    }
  }

  return true
}
