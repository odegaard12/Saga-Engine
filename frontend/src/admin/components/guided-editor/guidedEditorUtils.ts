import {
  adminGameCatalog,
  getAdminGame,
  type AdminGameCatalogItem,
  type AdminGameId,
} from '../../lib/gameCatalog'
import type { PhysicalQrKind } from '../PhysicalQrCardsPanel'
import type { QrCardDesign } from '../QrCardStudio'

export type StageLike = Record<string, any>

export type GuidedNodeEditorFlowProps = {
  stage: StageLike
  onPatch: (patch: Record<string, any>) => void
  onClose: () => void
  onDelete: () => void
  onRequestChangeType?: () => void
  stages?: StageLike[]
}

export type StepKey = 'rules' | 'config' | 'content'
export type EditorMode = 'game' | 'qr' | 'map_collectible'

export const STEPS: Array<{ key: StepKey; label: string; icon: string }> = [
  { key: 'rules', label: '1. Tipo y Reglas', icon: '🎯' },
  { key: 'config', label: '2. Ajustes del Juego', icon: '⚙️' },
  { key: 'content', label: '3. Historia y Pistas', icon: '📜' },
]

export const READY_STATUSES = new Set(['runtime_ready'])

export const TECHNICAL_CONFIG_KEYS = new Set([
  'completion_method',
  'game_id',
  'game_title',
  'objective',
  'source_lat',
  'source_lon',
  'max_signal',
  'noise_floor',
  'jitter',
  'decay_curve',
  'timeout_ms',
  'update_rate_ms',
  'use_audio',
  'use_vibration',
  'use_direction_hint',
  'false_peaks',
  'dead_zones',
  'seed',
  'path_cells',
  'pattern_mode',
  'shuffle_choices',
  'hint_text',
  'max_attempts',
  'image_data_url',
  'image_alt',
  'grid_size',
  'preview_ms',
  'max_moves',
  'require_final_question',
  'final_question',
  'final_choices',
  'final_correct_index',
])

export const LEGACY_MESSAGE_FALLBACKS: Record<string, string> = {
  'GPS unavailable message.': 'Activa GPS para localizar la señal.',
  'Move closer to unlock this node.': 'Acércate más al punto para desbloquear el nodo.',
  'Complete this node to continue.': 'Completa este nodo para continuar.',
}

export const QR_KIND_BY_GAME_ID: Partial<Record<AdminGameId, PhysicalQrKind>> = {
  qr_collectible: 'collectible',
  qr_key_gate: 'requirement',
  clue_card: 'clue',
  bonus_cache: 'bonus',
}

export const QR_GAME_BY_KIND: Record<PhysicalQrKind, AdminGameId> = {
  collectible: 'qr_collectible',
  requirement: 'qr_key_gate',
  clue: 'clue_card',
  bonus: 'bonus_cache',
  qr: 'qr_collectible',
}

export const CONFIG_FIELD_META: Record<
  string,
  {
    label: string
    help: string
    type: 'text' | 'number' | 'select' | 'sequence'
    options?: Array<{ value: string; label: string }>
  }
> = {
  objective: {
    label: 'Objetivo interno',
    help: 'Define que intenta resolver el juego. Normalmente viene de la plantilla.',
    type: 'text',
  },
  completion_method: {
    label: 'Cómo se completa',
    help: 'Forma principal de cerrar el nodo en el móvil del jugador.',
    type: 'select',
    options: [
      { value: 'proximity', label: 'Llegar a la zona' },
      { value: 'hold', label: 'Mantenerse en la zona' },
      { value: 'bearing', label: 'Rumbo / brújula' },
      { value: 'puzzle', label: 'Puzzle visual' },
      { value: 'manual_code', label: 'Código manual' },
      { value: 'sequence', label: 'Secuencia' },
      { value: 'qr_complete', label: 'QR completa el nodo' },
      { value: 'photo', label: 'Foto' },
      { value: 'inventory_only', label: 'Objeto/mochila' },
      { value: 'team', label: 'Equipo' },
      { value: 'motion', label: 'Movimiento / sensor' },
    ],
  },
  source_radius_m: {
    label: 'Radio de señal',
    help: 'Zona aproximada donde la señal empieza a funcionar.',
    type: 'number',
  },
  lock_threshold: {
    label: 'Umbral de bloqueo',
    help: 'Valor de señal o precisión necesario para dar el nodo por válido.',
    type: 'number',
  },
  hold_ms: {
    label: 'Tiempo de espera',
    help: 'Milisegundos que debe mantenerse la condición antes de completar.',
    type: 'number',
  },
  target_bearing_deg: {
    label: 'Rumbo objetivo',
    help: 'Dirección en grados: 0 norte, 90 este, 180 sur, 270 oeste.',
    type: 'number',
  },
  tolerance_deg: {
    label: 'Tolerancia de rumbo',
    help: 'Margen permitido alrededor del rumbo objetivo.',
    type: 'number',
  },
  grid_cols: {
    label: 'Columnas',
    help: 'Tamaño horizontal del puzzle lógico.',
    type: 'number',
  },
  grid_rows: {
    label: 'Filas',
    help: 'Tamaño vertical del puzzle lógico.',
    type: 'number',
  },
  difficulty: {
    label: 'Dificultad',
    help: 'Nivel de dificultad del reto.',
    type: 'select',
    options: [
      { value: 'easy', label: 'Fácil' },
      { value: 'normal', label: 'Normal' },
      { value: 'hard', label: 'Difícil' },
    ],
  },
  expected_code: {
    label: 'Código esperado',
    help: 'Palabra o código que deberá introducir el jugador.',
    type: 'text',
  },
  sequence: {
    label: 'Secuencia',
    help: 'Lista de valores separados por coma.',
    type: 'sequence',
  },
  game_id: {
    label: 'ID de juego',
    help: 'Identificador del catálogo. No suele hacer falta tocarlo.',
    type: 'text',
  },
  game_title: {
    label: 'Nombre de juego',
    help: 'Nombre de referencia de la plantilla.',
    type: 'text',
  },
}

export const CONFIG_ORDER = [
  'objective',
  'completion_method',
  'source_radius_m',
  'lock_threshold',
  'hold_ms',
  'target_bearing_deg',
  'tolerance_deg',
  'grid_cols',
  'grid_rows',
  'difficulty',
  'expected_code',
  'sequence',
  'game_id',
  'game_title',
]

export function configOf(stage: StageLike): Record<string, unknown> {
  return stage.config && typeof stage.config === 'object' ? stage.config : {}
}

export function titleOf(stage: StageLike) {
  return String(stage.title || stage.name || 'NEW NODE')
}

export function nodeNumber(stage: StageLike) {
  if (typeof stage.index === 'number') return String(stage.index + 1)
  const raw = String(stage.title || stage.name || stage.id || stage.node_id || '')
  return raw.match(/\d+/)?.[0] || ''
}

export function displayTitle(stage: StageLike) {
  const title = titleOf(stage)
  return title.replace(/^\d+\.\s*/, '')
}

export function normalizeQrKind(value: unknown): PhysicalQrKind {
  const raw = String(value || 'collectible')
  if (raw === 'object') return 'collectible'
  if (raw === 'key') return 'requirement'
  if (raw === 'requirement' || raw === 'clue' || raw === 'bonus' || raw === 'collectible')
    return raw
  return 'collectible'
}

export function hasExplicitQrMarker(stage: StageLike): boolean {
  return Boolean(
    stage.physical_qr ||
    stage.physical_node_kind ||
    stage.physical_item_kind ||
    stage.physical_item_id ||
    stage.physical_item_label ||
    stage.qr_payload ||
    String(stage.game_family || '').includes('physical') ||
    String(stage.game_type || '').includes('qr_') ||
    String(stage.game_template_id || '').includes('qr_')
  )
}

export function gameFromStage(stage: StageLike): AdminGameCatalogItem {
  const config = configOf(stage)

  const configId = typeof config.game_id === 'string' ? config.game_id : ''

  const gameTypeId = typeof stage.game_type === 'string' ? stage.game_type : ''

  const templateId = typeof stage.game_template_id === 'string' ? stage.game_template_id : ''

  const byConfig = configId ? adminGameCatalog.find((game) => game.id === configId) : null

  const byGameType = gameTypeId ? adminGameCatalog.find((game) => game.id === gameTypeId) : null

  const byTemplate = templateId ? adminGameCatalog.find((game) => game.id === templateId) : null

  // Al cambiar de juego, los dos identificadores superiores
  // se actualizan juntos. Si coinciden, son la identidad más
  // reciente y evitan mostrar un editor antiguo por config obsoleta.
  if (byGameType && byTemplate && byGameType.id === byTemplate.id) {
    return byGameType
  }

  if (byConfig) return byConfig
  if (byTemplate) return byTemplate
  if (byGameType) return byGameType

  // Legacy: los nodos antiguos signal_hunt sin game_id eran GPS/señal.
  // Como hemos quitado GPS del catálogo visible, NO deben caer en el primer signal_hunt físico/QR.
  if (stage.type === 'signal_hunt' && !hasExplicitQrMarker(stage)) {
    return (
      adminGameCatalog.find((game) => game.id === 'shake_antenna_charge') || adminGameCatalog[0]
    )
  }

  return (
    adminGameCatalog.find((game) => game.family === stage.type && game.category !== 'physical') ||
    adminGameCatalog.find((game) => game.family === stage.type) ||
    adminGameCatalog[0]
  )
}

export function isMapCollectibleStage(stage: StageLike): boolean {
  const config = configOf(stage)

  // Checkpoints and QR-based nodes must never be treated as map collectibles.
  if (
    stage.type === 'signal_hunt' ||
    String(stage.game_type || '') === 'simple_checkpoint' ||
    String(stage.game_template_id || '') === 'simple_checkpoint' ||
    String(config.game_id || '') === 'simple_checkpoint' ||
    String(stage.game_type || '').startsWith('qr_') ||
    String(stage.game_template_id || '').startsWith('qr_') ||
    String(config.game_id || '').startsWith('qr_') ||
    stage.physical_qr ||
    stage.qr_payload
  ) {
    return false
  }

  return Boolean(
    config.is_map_collectible ||
      stage.is_map_collectible ||
      Boolean(config.reward_item_id)
  )
}

export function isQrStage(stage: StageLike): boolean {
  if (isMapCollectibleStage(stage)) return false
  const config = configOf(stage)
  const gameId =
    typeof config.game_id === 'string'
      ? config.game_id
      : typeof stage.game_type === 'string'
        ? stage.game_type
        : typeof stage.game_template_id === 'string'
          ? stage.game_template_id
          : ''
  const explicit = gameId ? adminGameCatalog.find((game) => game.id === gameId) : null

  return Boolean(hasExplicitQrMarker(stage) || explicit?.category === 'physical')
}

export function gameOptions(showExperimental = false): AdminGameCatalogItem[] {
  return adminGameCatalog.filter((game) => {
    if (game.category === 'physical') return false
    if (game.id === 'simple_checkpoint') return false
    if (showExperimental) return true
    return isPlayableNow(game)
  })
}

export function qrOptions(): AdminGameCatalogItem[] {
  return adminGameCatalog.filter((game) => game.category === 'physical')
}

export function statusLabel(game: AdminGameCatalogItem) {
  if (game.runtimeStatus === 'runtime_ready') return 'Jugable'
  if (game.runtimeStatus === 'runtime_partial') return 'Experimental'
  if (game.runtimeStatus === 'preset_only') return 'Plantilla'
  return 'No listo'
}

export function offlineLabel(game: AdminGameCatalogItem) {
  if (game.offlineStatus === 'offline_ready') return 'Offline listo'
  if (game.offlineStatus === 'offline_partial') return 'Offline parcial'
  return 'Offline pendiente'
}

export function isPlayableNow(game: AdminGameCatalogItem) {
  return READY_STATUSES.has(game.runtimeStatus)
}

export function usesLocationRadius(game: AdminGameCatalogItem) {
  return (
    game.category === 'gps' ||
    game.category === 'compass' ||
    game.category === 'photo' ||
    game.category === 'team' ||
    game.completionMethod === 'proximity' ||
    game.completionMethod === 'hold' ||
    game.completionMethod === 'bearing'
  )
}

export function normalizeDifficultyForEditor(value: unknown) {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()

  if (raw === 'easy' || raw === 'facil' || raw === 'fácil' || raw === '1') {
    return 'easy'
  }

  if (
    raw === 'hard' ||
    raw === 'dificil' ||
    raw === 'difícil' ||
    raw === '3' ||
    raw === '4' ||
    raw === '5'
  ) {
    return 'hard'
  }

  return 'normal'
}

export function isValidFixedCircuitConfig(config: Record<string, unknown>) {
  if (config.pattern_mode !== 'fixed') return true
  if (!Array.isArray(config.path_cells)) return false
  if (config.path_cells.length < 4) return false

  const rows = Math.max(4, Math.min(6, Number(config.grid_rows || 5)))

  const cols = Math.max(4, Math.min(6, Number(config.grid_cols || 5)))

  const seen = new Set<string>()
  let previous: [number, number] | null = null

  for (const rawCell of config.path_cells) {
    const cell = String(rawCell)

    if (!/^\d+:\d+$/.test(cell)) return false
    if (seen.has(cell)) return false

    const [row, col] = cell.split(':').map(Number)

    if (row < 0 || row >= rows || col < 0 || col >= cols) {
      return false
    }

    if (previous && Math.abs(row - previous[0]) + Math.abs(col - previous[1]) !== 1) {
      return false
    }

    seen.add(cell)
    previous = [row, col]
  }

  return true
}

export function isValidSequenceCodeConfig(config: Record<string, unknown>) {
  if (!Array.isArray(config.sequence)) {
    return false
  }

  const sequence = config.sequence.map((item) => String(item).trim())

  if (sequence.length < 3 || sequence.length > 10) {
    return false
  }

  if (sequence.some((item) => !item || item.length > 32)) {
    return false
  }

  const unique = new Set(sequence.map((item) => item.toLocaleLowerCase()))

  if (unique.size !== sequence.length) {
    return false
  }

  const maxAttempts = Number(config.max_attempts ?? 3)

  return Number.isInteger(maxAttempts) && maxAttempts >= 1 && maxAttempts <= 8
}

export function isValidTiltMazeConfig(config: Record<string, unknown>) {
  const rows = Number(config.grid_rows ?? 9)

  const cols = Number(config.grid_cols ?? 9)

  const timeLimit = Number(config.time_limit_s ?? 75)

  const lives = Number(config.lives ?? 3)

  return (
    Number.isInteger(rows) &&
    rows >= 5 &&
    rows <= 13 &&
    Number.isInteger(cols) &&
    cols >= 5 &&
    cols <= 13 &&
    Number.isInteger(timeLimit) &&
    timeLimit >= 20 &&
    timeLimit <= 180 &&
    Number.isInteger(lives) &&
    lives >= 1 &&
    lives <= 5
  )
}

export function isValidPlaceMosaicConfig(config: Record<string, unknown>) {
  const image = String(config.image_data_url || '').trim()

  const imageValid =
    image.length <= 600000 &&
    (image.startsWith('data:image/jpeg;base64,') ||
      image.startsWith('data:image/png;base64,') ||
      image.startsWith('data:image/webp;base64,'))

  const gridSize = Number(config.grid_size ?? config.grid_cols ?? 3)

  if (!imageValid || !Number.isInteger(gridSize) || gridSize < 2 || gridSize > 4) {
    return false
  }

  if (config.require_final_question !== true) {
    return true
  }

  const question = String(config.final_question || '').trim()

  const choices = Array.isArray(config.final_choices)
    ? config.final_choices.map((item) => String(item).trim()).filter(Boolean)
    : []

  const correctIndex = Number(config.final_correct_index ?? 0)

  return (
    question.length >= 3 &&
    choices.length >= 2 &&
    choices.length <= 4 &&
    Number.isInteger(correctIndex) &&
    correctIndex >= 0 &&
    correctIndex < choices.length
  )
}

export function normalizeCopy(value: unknown) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase()
}

export function shouldReplaceGeneratedGameTitle(value: unknown) {
  const title = normalizeCopy(value)

  if (!title) return true
  if (/^new node(?:\s+\d+)?$/.test(title)) return true
  if (/^nuevo nodo(?:\s+\d+)?$/.test(title)) return true

  return new Set([
    'restaurar el circuito',
    'matriz de circuitos',
    'código secuencial',
    'codigo secuencial',
    'la clave del tríptico',
    'la clave del triptico',
    'mosaico del lugar',
    'laberinto de equilibrio',
  ]).has(title)
}

export function shouldReplaceSequenceTitle(value: unknown) {
  return shouldReplaceGeneratedGameTitle(value)
}

export function shouldReplacePlaceMosaicTitle(value: unknown) {
  return shouldReplaceGeneratedGameTitle(value)
}

export function isLegacySequenceCopy(value: unknown) {
  const content = normalizeCopy(value)

  if (!content) return true

  return (
    content.includes('memoriza la secuencia') ||
    content.includes('memoriza la ruta de energía') ||
    content.includes('memoriza la ruta de energia') ||
    content.includes('busca el punto marcado') ||
    content === 'ordena las fichas para reconstruir el código.' ||
    content === 'ordena las fichas para reconstruir el codigo.'
  )
}

export function isLegacySequenceHint(value: unknown) {
  const hint = normalizeCopy(value)

  if (!hint) return true

  return (
    hint.includes('memoriza la secuencia') ||
    hint.includes('recuerda el orden en el que encontraste')
  )
}

export function isExperimentalOrPlanned(game: AdminGameCatalogItem) {
  return !isPlayableNow(game)
}

export function normalizeMessage(value: unknown, fallback: string) {
  const raw = String(value || '').trim()
  if (!raw) return fallback
  return LEGACY_MESSAGE_FALLBACKS[raw] || raw
}

export const CUSTOM_GAME_EDITOR_IDS = new Set([
  'logic_circuit',
  'sequence_code',
  'place_mosaic',
  'tilt_maze',
])

export function hasCustomGameEditor(game: AdminGameCatalogItem) {
  return CUSTOM_GAME_EDITOR_IDS.has(game.id)
}

export function guidedConfigKeysForGame(game: AdminGameCatalogItem, config: Record<string, unknown>) {
  if (game.id === 'sequence_code' || game.id === 'place_mosaic' || game.id === 'tilt_maze') {
    return []
  }

  const keys = new Set<string>()

  if (
    game.category === 'gps' ||
    game.completionMethod === 'proximity' ||
    game.completionMethod === 'hold' ||
    game.completionMethod === 'team'
  ) {
    for (const key of ['source_radius_m', 'lock_threshold', 'hold_ms']) {
      if (key in config) keys.add(key)
    }
  }

  if (game.category === 'compass' || game.completionMethod === 'bearing') {
    for (const key of ['target_bearing_deg', 'tolerance_deg', 'hold_ms']) {
      if (key in config) keys.add(key)
    }
  }

  if (game.category === 'logic' || game.completionMethod === 'puzzle') {
    for (const key of ['grid_cols', 'grid_rows', 'difficulty']) {
      if (key in config) keys.add(key)
    }
  }

  if (game.category === 'motion' || game.completionMethod === 'motion') {
    for (const key of ['difficulty', 'time_limit_ms', 'stabilize_ms']) {
      if (key in config) keys.add(key)
    }
  }

  if (game.completionMethod === 'manual_code') {
    for (const key of ['expected_code', 'difficulty']) {
      if (key in config) keys.add(key)
    }
  }

  if (game.completionMethod === 'sequence') {
    for (const key of ['sequence', 'difficulty']) {
      if (key in config) keys.add(key)
    }
  }

  return Array.from(keys).filter((key) => !TECHNICAL_CONFIG_KEYS.has(key))
}

export function slugOf(value: unknown) {
  return (
    String(value || 'item')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'objeto_saga'
  )
}

export function fallbackCode(stage: StageLike) {
  const config = configOf(stage)
  const raw = String(
    stage.fallback_code ||
      stage.physical_fallback_code ||
      config.success_code ||
      config.fallback_code ||
      ''
  )
  if (raw) return raw.toUpperCase()
  const n = nodeNumber(stage) || '00'
  return `SAGA-${n.padStart(2, '0')}`
}

export function qrKindForGame(game: AdminGameCatalogItem): PhysicalQrKind {
  return QR_KIND_BY_GAME_ID[game.id] || normalizeQrKind('collectible')
}

export function qrGameForKind(kind: PhysicalQrKind): AdminGameCatalogItem {
  return getAdminGame(QR_GAME_BY_KIND[kind])
}

export function qrLabel(stage: StageLike) {
  return String(stage.physical_item_label || stage.title || 'Objeto SAGA')
}

export function qrItemId(stage: StageLike) {
  return String(stage.physical_item_id || slugOf(stage.id || stage.node_id || qrLabel(stage)))
}

export function qrPayload(stage: StageLike) {
  return String(stage.qr_payload || `SAGA1:ITEM:${qrItemId(stage)}:${qrLabel(stage)}`)
}

export function qrDesignFromConfig(config: Record<string, unknown>): QrCardDesign {
  const preset = String(config.qr_card_preset || 'clean')

  const shape = String(config.qr_card_shape || 'rounded')

  const accent = String(config.qr_card_accent || '#2563eb')

  const imageDataUrl = String(config.qr_card_image_data_url || '')

  return {
    preset: preset === 'dark' || preset === 'photo' ? preset : 'clean',
    shape: shape === 'square' ? 'square' : 'rounded',
    accent: /^#[0-9a-f]{6}$/i.test(accent) ? accent : '#2563eb',
    imageDataUrl,
  }
}

export function formatConfigValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ')
  if (value === undefined || value === null) return ''
  return String(value)
}

export function parseConfigValue(key: string, value: string): unknown {
  const meta = CONFIG_FIELD_META[key]
  if (meta?.type === 'number') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (meta?.type === 'sequence') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return value
}

export function copyText(value: string, onDone: (message: string) => void) {
  void navigator.clipboard
    .writeText(value)
    .then(() => onDone('Copiado'))
    .catch(() => onDone('No se pudo copiar'))
}

