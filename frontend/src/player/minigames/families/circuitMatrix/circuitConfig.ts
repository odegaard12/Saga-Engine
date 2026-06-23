import {
  isCircuitPathValid,
  type CellKey,
} from './circuitPath'
export type CircuitDifficulty = 'easy' | 'normal' | 'hard'

export interface CircuitRuntimeConfig {
  rows: number
  cols: number
  difficulty: CircuitDifficulty
  pathLength: number
  previewCellMs: number
  maxErrors: number
  seed: string
  patternMode: 'random_each_game' | 'fixed'
  fixedPath: CellKey[]
}

const PROFILES: Record<
  CircuitDifficulty,
  Omit<
    CircuitRuntimeConfig,
    'difficulty' | 'seed' | 'patternMode' | 'fixedPath'
  >
> = {
  easy: {
    rows: 4,
    cols: 4,
    pathLength: 7,
    previewCellMs: 650,
    maxErrors: 4,
  },
  normal: {
    rows: 5,
    cols: 5,
    pathLength: 11,
    previewCellMs: 460,
    maxErrors: 3,
  },
  hard: {
    rows: 6,
    cols: 6,
    pathLength: 15,
    previewCellMs: 330,
    maxErrors: 2,
  },
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function integerValue(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback
}

function normalizeDifficulty(value: unknown): CircuitDifficulty {
  const text = String(value ?? '').trim().toLowerCase()

  if (
    text === 'easy' ||
    text === 'facil' ||
    text === 'fácil' ||
    text === '1'
  ) {
    return 'easy'
  }

  if (
    text === 'hard' ||
    text === 'dificil' ||
    text === 'difícil' ||
    text === '3' ||
    text === '4' ||
    text === '5'
  ) {
    return 'hard'
  }

  return 'normal'
}

export function normalizeCircuitConfig(
  raw: Record<string, unknown>,
  fallbackSeed: string,
): CircuitRuntimeConfig {
  const difficulty = normalizeDifficulty(raw.difficulty)
  const profile = PROFILES[difficulty]

  const rows = clamp(
    integerValue(raw.grid_rows ?? raw.grid_size, profile.rows),
    4,
    6,
  )

  const cols = clamp(
    integerValue(raw.grid_cols ?? raw.grid_size, profile.cols),
    4,
    6,
  )

  const maxCells = rows * cols

  const pathLength = clamp(
    integerValue(raw.path_length, profile.pathLength),
    Math.min(4, maxCells),
    maxCells,
  )

  const previewCellMs = clamp(
    integerValue(raw.preview_cell_ms, profile.previewCellMs),
    220,
    900,
  )

  const maxErrors = clamp(
    integerValue(raw.max_errors, profile.maxErrors),
    1,
    6,
  )

  const configuredSeed = String(raw.seed ?? '').trim()

  const candidate = Array.isArray(raw.path_cells)
    ? raw.path_cells
        .map(String)
        .filter(
          (item): item is CellKey => /^\d+:\d+$/.test(item),
        )
    : []

  const patternMode =
    raw.pattern_mode === 'fixed' ||
    candidate.length >= 4
      ? 'fixed'
      : 'random_each_game'

  const fixedPath = isCircuitPathValid(
    candidate,
    rows,
    cols,
  )
    ? candidate
    : []

  return {
    rows,
    cols,
    difficulty,
    pathLength,
    previewCellMs,
    maxErrors,
    seed: configuredSeed || fallbackSeed || 'saga-circuit',
    patternMode,
    fixedPath,
  }
}
