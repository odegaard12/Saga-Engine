export type TiltDirection = 'up' | 'right' | 'down' | 'left'

export const WALL_UP = 1
export const WALL_RIGHT = 2
export const WALL_DOWN = 4
export const WALL_LEFT = 8

export type TiltMazeCell = {
  walls: number
}

export type GeneratedTiltMaze = {
  rows: number
  cols: number
  cells: TiltMazeCell[]
  start: number
  goal: number
  holes: number[]
  collectibles: number[]
}

type GenerateOptions = {
  rows: number
  cols: number
  seed: string
  holeCount: number
  collectibleCount: number
}

const DIRECTIONS = [
  {
    key: 'up' as const,
    row: -1,
    col: 0,
    wall: WALL_UP,
    opposite: WALL_DOWN,
  },
  {
    key: 'right' as const,
    row: 0,
    col: 1,
    wall: WALL_RIGHT,
    opposite: WALL_LEFT,
  },
  {
    key: 'down' as const,
    row: 1,
    col: 0,
    wall: WALL_DOWN,
    opposite: WALL_UP,
  },
  {
    key: 'left' as const,
    row: 0,
    col: -1,
    wall: WALL_LEFT,
    opposite: WALL_RIGHT,
  },
]

function hashSeed(value: string) {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

function randomFor(seed: string) {
  let state = hashSeed(seed) || 1

  return () => {
    state += 0x6d2b79f5

    let value = state

    value = Math.imul(value ^ (value >>> 15), value | 1)

    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(values: T[], random: () => number) {
  const output = [...values]

  for (let index = output.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))

    ;[output[index], output[other]] = [output[other], output[index]]
  }

  return output
}

function neighbourIndex(index: number, rows: number, cols: number, direction: TiltDirection) {
  const row = Math.floor(index / cols)
  const col = index % cols

  const spec = DIRECTIONS.find((item) => item.key === direction)

  if (!spec) return null

  const nextRow = row + spec.row
  const nextCol = col + spec.col

  if (nextRow < 0 || nextRow >= rows || nextCol < 0 || nextCol >= cols) {
    return null
  }

  return nextRow * cols + nextCol
}

export function nextTiltMazeCell(maze: GeneratedTiltMaze, index: number, direction: TiltDirection) {
  const spec = DIRECTIONS.find((item) => item.key === direction)

  if (!spec) return null

  if (maze.cells[index].walls & spec.wall) {
    return null
  }

  return neighbourIndex(index, maze.rows, maze.cols, direction)
}

function openNeighbours(cells: TiltMazeCell[], rows: number, cols: number, index: number) {
  return DIRECTIONS.map((direction) => {
    if (cells[index].walls & direction.wall) {
      return null
    }

    return neighbourIndex(index, rows, cols, direction.key)
  }).filter((value): value is number => value !== null)
}

/** ¿Dos casillas del tablero se tocan por un lado (o son la misma)? Lo demás es un salto, no un paso. */
export function sonVecinas(a: number, b: number, cols: number): boolean {
  return Math.abs((a % cols) - (b % cols)) + Math.abs(Math.floor(a / cols) - Math.floor(b / cols)) <= 1
}

export function generateTiltMaze({
  rows,
  cols,
  seed,
  holeCount,
  collectibleCount,
}: GenerateOptions): GeneratedTiltMaze {
  // 11/11 (auditoría): el tope era 13 y los niveles 4 y 5 (15×15 y 17×17 en la tabla y en la pantalla) se jugaban
  // en 13×13, como el 3. Mismo tope que el servidor y que RuntimeScreen: 17.
  const safeRows = Math.max(5, Math.min(17, Math.round(rows)))

  const safeCols = Math.max(5, Math.min(17, Math.round(cols)))

  const total = safeRows * safeCols
  const random = randomFor(`${seed}:${safeRows}:${safeCols}`)

  const cells: TiltMazeCell[] = Array.from({ length: total }, () => ({
    walls: WALL_UP | WALL_RIGHT | WALL_DOWN | WALL_LEFT,
  }))

  const visited = new Set<number>([0])
  const stack = [0]

  while (stack.length > 0) {
    const current = stack[stack.length - 1]

    const row = Math.floor(current / safeCols)

    const col = current % safeCols

    const candidates = shuffle(DIRECTIONS, random).filter((direction) => {
      const nextRow = row + direction.row

      const nextCol = col + direction.col

      if (nextRow < 0 || nextRow >= safeRows || nextCol < 0 || nextCol >= safeCols) {
        return false
      }

      return !visited.has(nextRow * safeCols + nextCol)
    })

    if (candidates.length === 0) {
      stack.pop()
      continue
    }

    const direction = candidates[0]

    const next = (row + direction.row) * safeCols + (col + direction.col)

    cells[current].walls &= ~direction.wall

    cells[next].walls &= ~direction.opposite

    visited.add(next)
    stack.push(next)
  }

  const distance = Array(total).fill(-1)

  const parent = Array(total).fill(-1)

  const queue = [0]
  distance[0] = 0

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]

    for (const next of openNeighbours(cells, safeRows, safeCols, current)) {
      if (distance[next] >= 0) {
        continue
      }

      distance[next] = distance[current] + 1

      parent[next] = current
      queue.push(next)
    }
  }

  let goal = 0

  for (let index = 1; index < total; index += 1) {
    if (distance[index] > distance[goal]) {
      goal = index
    }
  }

  const route = new Set<number>()
  let routeCursor = goal

  while (routeCursor >= 0) {
    route.add(routeCursor)

    if (routeCursor === 0) {
      break
    }

    routeCursor = parent[routeCursor]
  }

  const allIndices = Array.from({ length: total }, (_, index) => index)

  /**
   * Los agujeros van PEGADOS al camino, no repartidos por el tablero.
   *
   * Se elegian al azar entre todas las casillas que no son del camino bueno, y
   * en un tablero de once por once la mayoria caian en rincones por los que no
   * se pasa nunca: daba igual poner seis que catorce, el recorrido seguia
   * siendo un pasillo limpio y se cruzaba sin mirar. De ahi que subir el numero
   * no cambiase nada.
   *
   * Ahora se llenan primero las casillas a las que se puede entrar desde el
   * camino de un solo movimiento. Cada paso en falso cae en uno, que es donde
   * de verdad se nota. El camino bueno sigue intacto, asi que el laberinto se
   * puede terminar siempre.
   */
  const beiraDoCamino = new Set<number>()

  for (const celda of route) {
    for (const veciño of openNeighbours(cells, safeRows, safeCols, celda)) {
      if (veciño !== 0 && veciño !== goal && !route.has(veciño)) {
        beiraDoCamino.add(veciño)
      }
    }
  }

  const libres = allIndices.filter(
    (index) => index !== 0 && index !== goal && !route.has(index)
  )

  const holeCandidates = [
    ...shuffle(libres.filter((index) => beiraDoCamino.has(index)), random),
    ...shuffle(libres.filter((index) => !beiraDoCamino.has(index)), random),
  ]

  const holes = holeCandidates.slice(
    0,
    Math.max(0, Math.min(holeCandidates.length, Math.round(holeCount)))
  )

  const holeSet = new Set(holes)

  const routeCandidates = shuffle(
    [...route].filter((index) => index !== 0 && index !== goal),
    random
  )

  const extraCandidates = shuffle(
    allIndices.filter(
      (index) => index !== 0 && index !== goal && !route.has(index) && !holeSet.has(index)
    ),
    random
  )

  const collectibleCandidates = [...routeCandidates, ...extraCandidates]

  const collectibles = collectibleCandidates.slice(
    0,
    Math.max(0, Math.min(collectibleCandidates.length, Math.round(collectibleCount)))
  )

  return {
    rows: safeRows,
    cols: safeCols,
    cells,
    start: 0,
    goal,
    holes,
    collectibles,
  }
}
