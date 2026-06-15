import type { AdminReactOverviewStage } from './adminApi'
import {
  getAdminFamilyIcon,
  getAdminFamilyLabel,
  getDefaultAdminConfigForFamily,
  type FamilyId,
} from './familyConfigs'

export type AdminGameId =
  | 'shake_antenna_charge'
  | 'gps_signal_lock'
  | 'hot_cold_search'
  | 'bearing_compass'
  | 'three_bearing_triangle'
  | 'logic_circuit'
  | 'sequence_code'
  | 'qr_collectible'
  | 'qr_key_gate'
  | 'clue_card'
  | 'photo_scout'
  | 'team_relay'
  | 'manual_password'
  | 'bonus_cache'

export type AdminGameRuntimeStatus = 'runtime_ready' | 'runtime_partial' | 'preset_only' | 'planned'
export type AdminGameOfflineStatus = 'offline_ready' | 'offline_partial' | 'offline_planned'
export type AdminGameCompletionMethod =
  | 'proximity'
  | 'hold'
  | 'bearing'
  | 'puzzle'
  | 'manual_code'
  | 'sequence'
  | 'qr_complete'
  | 'photo'
  | 'inventory_only'
  | 'team'
  | 'motion'

export type MissionTemplateId =
  | 'qr_route'
  | 'clue_hunt'
  | 'urban_escape'
  | 'family_gymkhana'

export type AdminGameCatalogItem = {
  id: AdminGameId
  title: string
  icon: string
  family: FamilyId
  category: 'gps' | 'compass' | 'logic' | 'physical' | 'photo' | 'team' | 'motion'
  difficulty: 'Fácil' | 'Media' | 'Alta'
  duration: string
  runtimeStatus: AdminGameRuntimeStatus
  offlineStatus: AdminGameOfflineStatus
  completionMethod: AdminGameCompletionMethod
  offlineNote: string
  summary: string
  playerGoal: string
  editorHint: string
  config: Record<string, unknown>
  content: string
  messages: {
    hint: string
    gps_unavailable: string
    locked: string
  }
}

export type MissionTemplateStage = {
  gameId: AdminGameId
  title: string
  content: string
  radius?: number
  offsetLat: number
  offsetLon: number
  physicalKind?: 'collectible' | 'requirement' | 'clue' | 'bonus'
  itemLabel?: string
  requiresPreviousItem?: boolean
}

export type MissionTemplate = {
  id: MissionTemplateId
  title: string
  icon: string
  summary: string
  goodFor: string
  stages: MissionTemplateStage[]
}

export const adminGameCatalog: AdminGameCatalogItem[] = [
  {
    id: 'logic_circuit',
    title: 'Matriz de circuitos',
    icon: '🧩',
    family: 'circuit_matrix',
    category: 'logic',
    difficulty: 'Media',
    duration: '4-7 min',
    runtimeStatus: 'runtime_ready',
    offlineStatus: 'offline_ready',
    completionMethod: 'puzzle',
    offlineNote: 'Funciona completamente en local y sincroniza el resultado después.',
    summary: 'Juego táctil de reparar una ruta de energía en una matriz.',
    playerGoal: 'Memorizar una ruta y repetirla en el orden exacto.',
    editorHint: 'Úsalo cuando quieras un descanso mental entre puntos GPS.',
    config: {
      objective: 'path_restore',
      completion_method: 'puzzle',
      grid_cols: 5,
      grid_rows: 5,
      difficulty: 'normal',
      max_errors: 3,
      preview_cell_ms: 460,
      path_length: 11,
      seed: '',
      pattern_mode: 'random_each_game',
      path_cells: [],
      game_id: 'logic_circuit',
    },
    content: 'Memoriza la ruta de energía y repítela en el mismo orden.',
    messages: {
      hint: 'Memoriza la secuencia. Después repítela sin guía.',
      gps_unavailable: 'Este reto puede jugarse sin GPS si el nodo ya está abierto.',
      locked: 'Completa el circuito para continuar.',
    },
  },
  {
    id: 'sequence_code',
    title: 'Código secuencial',
    icon: '🔢',
    family: 'circuit_matrix',
    category: 'logic',
    difficulty: 'Media',
    duration: '3-6 min',
    runtimeStatus: 'planned',
    offlineStatus: 'offline_planned',
    completionMethod: 'sequence',
    offlineNote: 'Debe validar secuencia local y sincronizar después.',
    summary: 'Ordenar símbolos, palabras o números encontrados en ruta.',
    playerGoal: 'Introducir o deducir una secuencia correcta.',
    editorHint: 'Muy bueno para pistas físicas, carteles o QR previos.',
    config: { objective: 'sequence', sequence: ['norte', 'rio', 'torre'], difficulty: 2, game_id: 'sequence_code' },
    content: 'Ordena las pistas encontradas y desbloquea la secuencia.',
    messages: {
      hint: 'El orden importa. Revisa pistas anteriores.',
      gps_unavailable: 'Este puzzle no depende de GPS.',
      locked: 'La secuencia aún no encaja.',
    },
  },
  {
    id: 'qr_collectible',
    title: 'Objeto QR',
    icon: '⭐',
    family: 'signal_hunt',
    category: 'physical',
    difficulty: 'Fácil',
    duration: '1-2 min',
    runtimeStatus: 'runtime_ready',
    offlineStatus: 'offline_ready',
    completionMethod: 'inventory_only',
    offlineNote: 'Crea tarjeta QR en admin, se exporta, el player la lee offline y guarda el objeto en mochila local.',
    summary: 'Tarjeta física opcional que se guarda en la mochila.',
    playerGoal: 'Escanear una tarjeta QR y conservar el objeto.',
    editorHint: 'Úsalo para coleccionables, logros o pistas secundarias.',
    config: { objective: 'physical_collectible', completion_method: 'inventory_only', game_id: 'qr_collectible' },
    content: 'Encuentra y escanea la tarjeta QR física.',
    messages: {
      hint: 'Busca una tarjeta o símbolo físico cerca.',
      gps_unavailable: 'Acércate al punto para escanear el QR.',
      locked: 'Necesitas estar en la zona del QR.',
    },
  },
  {
    id: 'qr_key_gate',
    title: 'Llave QR',
    icon: '🔑',
    family: 'signal_hunt',
    category: 'physical',
    difficulty: 'Fácil',
    duration: '1-3 min',
    runtimeStatus: 'runtime_ready',
    offlineStatus: 'offline_ready',
    completionMethod: 'inventory_only',
    offlineNote: 'Crea llave QR en admin, se exporta, el player la lee offline y guarda la llave para requisitos.',
    summary: 'Objeto QR pensado para abrir otro nodo posterior.',
    playerGoal: 'Conseguir una llave física para desbloquear una prueba.',
    editorHint: 'Úsalo junto con Requisito de entrada en un nodo posterior.',
    config: { objective: 'physical_key', completion_method: 'inventory_only', game_id: 'qr_key_gate' },
    content: 'Escanea la llave QR. Podría hacer falta más adelante.',
    messages: {
      hint: 'Busca la llave física.',
      gps_unavailable: 'Activa GPS o usa el modo permitido para abrir el QR.',
      locked: 'Acércate para registrar la llave.',
    },
  },
  {
    id: 'clue_card',
    title: 'Pista QR',
    icon: '🧩',
    family: 'signal_hunt',
    category: 'physical',
    difficulty: 'Fácil',
    duration: '1-2 min',
    runtimeStatus: 'runtime_ready',
    offlineStatus: 'offline_ready',
    completionMethod: 'inventory_only',
    offlineNote: 'Crea pista QR en admin, se exporta, el player la lee offline y guarda la pista consultable en mochila.',
    summary: 'Tarjeta que entrega información para resolver otro reto.',
    playerGoal: 'Escanear una pista y leer la información.',
    editorHint: 'Ideal para rutas de misterio o escape.',
    config: { objective: 'physical_clue', completion_method: 'inventory_only', game_id: 'clue_card' },
    content: 'Escanea la pista y úsala en un nodo posterior.',
    messages: {
      hint: 'La pista no está lejos del punto.',
      gps_unavailable: 'Necesitas abrir el nodo para escanear la pista.',
      locked: 'Acércate para consultar la pista.',
    },
  },
  {
    id: 'photo_scout',
    title: 'Foto de exploración',
    icon: '📷',
    family: 'signal_hunt',
    category: 'photo',
    difficulty: 'Fácil',
    duration: '2-4 min',
    runtimeStatus: 'planned',
    offlineStatus: 'offline_planned',
    completionMethod: 'photo',
    offlineNote: 'No se ofrece en plantillas jugables todavía: falta completar el flujo de cierre por foto.',
    summary: 'El equipo debe hacer una foto de campo en la zona.',
    playerGoal: 'Capturar una foto compartida en el mapa.',
    editorHint: 'Funciona muy bien con el sistema de fotos de campo.',
    config: { objective: 'photo_proof', completion_method: 'photo', game_id: 'photo_scout' },
    content: 'Haz una foto de campo que demuestre que encontraste la zona.',
    messages: {
      hint: 'Busca un elemento reconocible del entorno.',
      gps_unavailable: 'Necesitas ubicación para anclar la foto al mapa.',
      locked: 'Acércate antes de hacer la foto.',
    },
  },
  {
    id: 'team_relay',
    title: 'Relevo de equipo',
    icon: '👥',
    family: 'signal_hunt',
    category: 'team',
    difficulty: 'Media',
    duration: '5-8 min',
    runtimeStatus: 'planned',
    offlineStatus: 'offline_planned',
    completionMethod: 'team',
    offlineNote: 'No se ofrece en plantillas jugables todavía: falta cerrar modo equipo/capitán offline.',
    summary: 'Prueba pensada para varios jugadores o roles.',
    playerGoal: 'Coordinarse para llegar, registrar prueba o compartir pista.',
    editorHint: 'Úsalo si quieres que varios jugadores participen.',
    config: { objective: 'team_relay', source_radius_m: 80, lock_threshold: 60, hold_ms: 1500, game_id: 'team_relay' },
    content: 'El equipo debe coordinarse para completar esta parada.',
    messages: {
      hint: 'Reparte roles: mapa, pista y foto.',
      gps_unavailable: 'Al menos un jugador debe tener posición.',
      locked: 'El equipo aún no está listo.',
    },
  },
  {
    id: 'manual_password',
    title: 'Palabra clave',
    icon: '🔐',
    family: 'circuit_matrix',
    category: 'logic',
    difficulty: 'Media',
    duration: '2-5 min',
    runtimeStatus: 'planned',
    offlineStatus: 'offline_planned',
    completionMethod: 'manual_code',
    offlineNote: 'No se ofrece en plantillas jugables todavía: falta validación local de código.',
    summary: 'Resolver una palabra o código a partir de pistas.',
    playerGoal: 'Descubrir una contraseña narrativa.',
    editorHint: 'Bueno para carteles, acertijos y escape urbano.',
    config: { objective: 'manual_code', completion_method: 'manual_code', expected_code: 'SAGA', difficulty: 1, game_id: 'manual_password' },
    content: 'Encuentra la palabra clave y úsala para continuar.',
    messages: {
      hint: 'La palabra está escondida en la escena.',
      gps_unavailable: 'Este reto puede jugarse sin GPS si está desbloqueado.',
      locked: 'La palabra clave no es correcta todavía.',
    },
  },
  {
    id: 'bonus_cache',
    title: 'Bonus oculto',
    icon: '🎁',
    family: 'signal_hunt',
    category: 'physical',
    difficulty: 'Fácil',
    duration: '1-3 min',
    runtimeStatus: 'runtime_ready',
    offlineStatus: 'offline_ready',
    completionMethod: 'inventory_only',
    offlineNote: 'Crea bonus QR en admin, se exporta, el player lo lee offline y guarda la recompensa en mochila.',
    summary: 'Extra opcional para recompensas, bromas o contenido secreto.',
    playerGoal: 'Encontrar un extra no obligatorio.',
    editorHint: 'Úsalo para dar vida al mapa sin bloquear la ruta.',
    config: { objective: 'bonus_cache', completion_method: 'inventory_only', game_id: 'bonus_cache' },
    content: 'Has encontrado un bonus oculto.',
    messages: {
      hint: 'Hay algo extra cerca.',
      gps_unavailable: 'Acércate para registrar el bonus.',
      locked: 'El bonus aún no está a tu alcance.',
    },
  },
]

export const missionTemplates: MissionTemplate[] = [
  {
    id: 'qr_route',
    title: 'Ruta QR con llave',
    icon: '🔑',
    summary: 'Juego base listo: ruta GPS, llave QR, nodo bloqueado y bonus opcional.',
    goodFor: 'Primer juego real, rutas cortas, grupos pequeños, pruebas con tarjetas físicas.',
    stages: [
      { gameId: 'logic_circuit', title: 'Inicio de ruta', content: 'Llega al punto inicial y activa la misión.', offsetLat: 0, offsetLon: 0, radius: 55 },
      { gameId: 'qr_key_gate', title: 'Llave del camino', content: 'Escanea la llave QR física.', offsetLat: 0.00045, offsetLon: 0.00028, radius: 45, physicalKind: 'requirement', itemLabel: 'Llave del camino' },
      { gameId: 'logic_circuit', title: 'Puerta bloqueada', content: 'Este nodo pide la llave anterior.', offsetLat: 0.00088, offsetLon: 0.00062, radius: 55, requiresPreviousItem: true },
      { gameId: 'bonus_cache', title: 'Bonus final', content: 'Extra opcional al terminar la ruta.', offsetLat: 0.00118, offsetLon: 0.00092, radius: 45, physicalKind: 'bonus', itemLabel: 'Bonus final' },
    ],
  },
  {
    id: 'clue_hunt',
    title: 'Ruta de pistas QR',
    icon: '🧩',
    summary: 'Cadena jugable de pistas físicas y búsqueda GPS, sin puzzles pendientes.',
    goodFor: 'Misterio sencillo, historia local, juego familiar, rutas con tarjetas.',
    stages: [
      { gameId: 'logic_circuit', title: 'Punto de inicio', content: 'Llega al punto de salida y abre la primera pista.', offsetLat: 0, offsetLon: 0, radius: 55 },
      { gameId: 'clue_card', title: 'Pista 1', content: 'Escanea la primera pista QR.', offsetLat: 0.00042, offsetLon: -0.00030, radius: 45, physicalKind: 'clue', itemLabel: 'Pista 1' },
      { gameId: 'logic_circuit', title: 'Busca la señal', content: 'La señal se hace más fuerte al acercarte.', offsetLat: 0.00080, offsetLon: -0.00058, radius: 55 },
      { gameId: 'bonus_cache', title: 'Recompensa oculta', content: 'Encuentra el bonus final.', offsetLat: 0.00108, offsetLon: -0.00088, radius: 45, physicalKind: 'bonus', itemLabel: 'Recompensa oculta' },
    ],
  },
  {
    id: 'urban_escape',
    title: 'Escape QR corto',
    icon: '🔐',
    summary: 'Escape urbano simple con llave física y cierre GPS; evita pruebas aún planificadas.',
    goodFor: 'Cidade, instituto, evento corto, juego con historia sin depender de conexión.',
    stages: [
      { gameId: 'logic_circuit', title: 'Entrada', content: 'Activa el punto de entrada del escape.', offsetLat: 0, offsetLon: 0, radius: 50 },
      { gameId: 'qr_key_gate', title: 'Llave QR', content: 'Escanea la llave física para abrir la salida.', offsetLat: -0.00040, offsetLon: 0.00036, radius: 45, physicalKind: 'requirement', itemLabel: 'Llave QR' },
      { gameId: 'logic_circuit', title: 'Salida bloqueada', content: 'Usa la llave anterior y llega al punto de salida.', offsetLat: -0.00075, offsetLon: 0.00068, radius: 55, requiresPreviousItem: true },
      { gameId: 'clue_card', title: 'Epílogo', content: 'Escanea la tarjeta final de historia.', offsetLat: -0.00105, offsetLon: 0.00095, radius: 45, physicalKind: 'clue', itemLabel: 'Epílogo' },
    ],
  },
  {
    id: 'family_gymkhana',
    title: 'Gymkhana familiar',
    icon: '🎁',
    summary: 'Ritmo variado con GPS, brújula, objeto QR y bonus, todo jugable offline.',
    goodFor: 'Niños, familias, grupos pequeños, parques y rutas sencillas.',
    stages: [
      { gameId: 'logic_circuit', title: 'Punto de salida', content: 'Empieza la gymkhana.', offsetLat: 0, offsetLon: 0, radius: 60 },
      { gameId: 'logic_circuit', title: 'Rumbo de explorador', content: 'Usa la brújula para orientar la búsqueda.', offsetLat: 0.00035, offsetLon: 0.00035, radius: 55 },
      { gameId: 'qr_collectible', title: 'Objeto del equipo', content: 'Escanea el objeto QR del equipo.', offsetLat: 0.00065, offsetLon: 0.00070, radius: 45, physicalKind: 'collectible', itemLabel: 'Objeto del equipo' },
      { gameId: 'bonus_cache', title: 'Regalo oculto', content: 'Busca el bonus final.', offsetLat: 0.00095, offsetLon: 0.00105, radius: 45, physicalKind: 'bonus', itemLabel: 'Regalo oculto' },
    ],
  },
]

export function getAdminGame(gameId?: string | null): AdminGameCatalogItem {
  return adminGameCatalog.find((game) => game.id === gameId) || adminGameCatalog[0]
}

export function getAdminGameForStage(type?: string | null, config?: Record<string, unknown> | null): AdminGameCatalogItem {
  const gameId = typeof config?.game_id === 'string' ? config.game_id : ''
  const explicit = adminGameCatalog.find((game) => game.id === gameId)
  if (explicit) return explicit

  // Legacy: signal_hunt sin game_id ya no debe caer en QR físico.
  if (type === 'signal_hunt') {
    return adminGameCatalog.find((game) => game.id === 'shake_antenna_charge') || adminGameCatalog[0]
  }

  return (
    adminGameCatalog.find((game) => game.family === type && game.category !== 'physical') ||
    adminGameCatalog.find((game) => game.family === type) ||
    adminGameCatalog[0]
  )
}

export function getMissionTemplateById(templateId: MissionTemplateId): MissionTemplate {
  return missionTemplates.find((template) => template.id === templateId) || missionTemplates[0]
}

export function getDefaultAdminStagePatchForGame(gameId: AdminGameId) {
  const game = getAdminGame(gameId)
  const config: Record<string, unknown> = {
    ...getDefaultAdminConfigForFamily(game.family),
    ...game.config,
    game_id: game.id,
    game_title: game.title,
  }

  return {
    type: game.family,
    label: game.title,
    icon: getAdminFamilyIcon(game.family),
    objective: String((config as Record<string, unknown>).objective || ''),
    content: game.content,
    config,
    config_summary: Object.keys(config),
    messages: game.messages,
  }
}

export function getRuntimeFamilyCopy(family: FamilyId) {
  return `${getAdminFamilyIcon(family)} ${getAdminFamilyLabel(family)}`
}
