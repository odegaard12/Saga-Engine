import type { AdminReactOverviewStage } from './adminApi'
import {
  getAdminFamilyIcon,
  getAdminFamilyLabel,
  getDefaultAdminConfigForFamily,
  type FamilyId,
} from './familyConfigs'

export type AdminGameId =
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
  category: 'gps' | 'compass' | 'logic' | 'physical' | 'photo' | 'team'
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
    id: 'gps_signal_lock',
    title: 'Señal GPS',
    icon: '📡',
    family: 'signal_hunt',
    category: 'gps',
    difficulty: 'Fácil',
    duration: '2-4 min',
    runtimeStatus: 'runtime_ready',
    offlineStatus: 'offline_ready',
    completionMethod: 'proximity',
    offlineNote: 'Funciona con misión descargada: GPS, radio y avance local.',
    summary: 'El jugador se acerca al punto y mantiene posición hasta capturar la señal.',
    playerGoal: 'Llegar al radio del nodo y confirmar presencia.',
    editorHint: 'Úsalo como nodo base de ruta. Es el más estable para exterior.',
    config: { objective: 'proximity_lock', source_radius_m: 75, lock_threshold: 65, hold_ms: 1500, game_id: 'gps_signal_lock' },
    content: 'Acércate al punto marcado y mantente dentro del radio hasta capturar la señal.',
    messages: {
      hint: 'Busca el punto marcado en el mapa.',
      gps_unavailable: 'Activa GPS para localizar la señal.',
      locked: 'Acércate más al punto para capturar la señal.',
    },
  },
  {
    id: 'hot_cold_search',
    title: 'Frío / caliente',
    icon: '🌡️',
    family: 'signal_hunt',
    category: 'gps',
    difficulty: 'Fácil',
    duration: '3-6 min',
    runtimeStatus: 'runtime_partial',
    offlineStatus: 'offline_ready',
    completionMethod: 'proximity',
    offlineNote: 'Usa motor GPS offline; falta UI específica de frío/caliente.',
    summary: 'Variante de proximidad para buscar un punto con pistas de distancia.',
    playerGoal: 'Moverse hasta que la señal sea suficientemente fuerte.',
    editorHint: 'Perfecto para parques, plazas o pistas sencillas.',
    config: { objective: 'hot_cold', source_radius_m: 55, lock_threshold: 78, hold_ms: 1200, game_id: 'hot_cold_search' },
    content: 'La señal se hace más fuerte al acercarte. Encuentra el punto exacto.',
    messages: {
      hint: 'La zona está cerca; usa la intensidad de señal.',
      gps_unavailable: 'Sin GPS no se puede calcular la señal.',
      locked: 'La señal aún es débil. Sigue buscando.',
    },
  },
  {
    id: 'bearing_compass',
    title: 'Rumbo con brújula',
    icon: '🧭',
    family: 'bearing_hunt',
    category: 'compass',
    difficulty: 'Media',
    duration: '3-5 min',
    runtimeStatus: 'runtime_ready',
    offlineStatus: 'offline_ready',
    completionMethod: 'bearing',
    offlineNote: 'Funciona offline con brújula/local runtime.',
    summary: 'El jugador debe orientarse hacia un rumbo concreto.',
    playerGoal: 'Apuntar el móvil en la dirección correcta y mantener el rumbo.',
    editorHint: 'Funciona bien para orientación y caminos visibles.',
    config: { objective: 'single_lock', target_bearing_deg: 270, tolerance_deg: 12, hold_ms: 1200, game_id: 'bearing_compass' },
    content: 'Usa la brújula y apunta hacia el rumbo indicado.',
    messages: {
      hint: 'Gira despacio hasta alinear la brújula.',
      gps_unavailable: 'La brújula puede necesitar movimiento o permisos.',
      locked: 'Aún no estás en el rumbo correcto.',
    },
  },
  {
    id: 'three_bearing_triangle',
    title: 'Triangulación',
    icon: '📐',
    family: 'bearing_hunt',
    category: 'compass',
    difficulty: 'Alta',
    duration: '5-8 min',
    runtimeStatus: 'preset_only',
    offlineStatus: 'offline_planned',
    completionMethod: 'bearing',
    offlineNote: 'Plantilla de orientación; falta runtime de triangulación offline.',
    summary: 'Variante narrativa: comparar rumbos y decidir hacia dónde avanzar.',
    playerGoal: 'Leer pistas y orientarse con varios rumbos.',
    editorHint: 'Úsalo como puzzle de orientación; por ahora usa el motor de rumbo simple.',
    config: { objective: 'triangulation_hint', target_bearing_deg: 45, tolerance_deg: 15, hold_ms: 1400, game_id: 'three_bearing_triangle' },
    content: 'Tres señales apuntan a una zona. Elige el rumbo más coherente y avanza.',
    messages: {
      hint: 'Piensa en la intersección de las pistas.',
      gps_unavailable: 'La brújula no está lista.',
      locked: 'Todavía no coincide el rumbo.',
    },
  },
  {
    id: 'logic_circuit',
    title: 'Circuito lógico',
    icon: '🧩',
    family: 'circuit_matrix',
    category: 'logic',
    difficulty: 'Media',
    duration: '4-7 min',
    runtimeStatus: 'runtime_partial',
    offlineStatus: 'offline_ready',
    completionMethod: 'puzzle',
    offlineNote: 'Tiene familia runtime; falta pulir variantes visuales.',
    summary: 'Puzzle visual de reparación, secuencia o matriz.',
    playerGoal: 'Resolver una lógica para desbloquear el nodo.',
    editorHint: 'Úsalo cuando quieras un descanso mental entre puntos GPS.',
    config: { objective: 'path_restore', grid_cols: 5, grid_rows: 5, difficulty: 2, game_id: 'logic_circuit' },
    content: 'Repara el circuito para abrir el siguiente tramo.',
    messages: {
      hint: 'Busca continuidad entre las piezas.',
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
    offlineNote: 'Debe guardar foto en cola local y sincronizar cuando vuelva conexión.',
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
    offlineNote: 'Primero debe funcionar como modo capitán offline.',
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
    offlineNote: 'Debe validar código local y sincronizar node_completed después.',
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
    title: 'Ruta con QR',
    icon: '⭐',
    summary: 'Ruta sencilla con una llave QR y un nodo que la pide después.',
    goodFor: 'Primer juego público, rutas cortas, pruebas con tarjetas físicas.',
    stages: [
      { gameId: 'gps_signal_lock', title: 'Inicio de ruta', content: 'Llega al punto inicial y activa la misión.', offsetLat: 0, offsetLon: 0, radius: 55 },
      { gameId: 'qr_key_gate', title: 'Llave del camino', content: 'Escanea la llave QR física.', offsetLat: 0.00045, offsetLon: 0.00028, radius: 45, physicalKind: 'requirement', itemLabel: 'Llave del camino' },
      { gameId: 'gps_signal_lock', title: 'Puerta bloqueada', content: 'Este nodo pide la llave anterior.', offsetLat: 0.00088, offsetLon: 0.00062, radius: 55, requiresPreviousItem: true },
      { gameId: 'bonus_cache', title: 'Bonus final', content: 'Extra opcional al terminar la ruta.', offsetLat: 0.00118, offsetLon: 0.00092, radius: 45, physicalKind: 'bonus', itemLabel: 'Bonus final' },
    ],
  },
  {
    id: 'clue_hunt',
    title: 'Búsqueda de pistas',
    icon: '🧩',
    summary: 'Cadena de pistas QR y un puzzle final.',
    goodFor: 'Misterio, historia local, pruebas familiares.',
    stages: [
      { gameId: 'clue_card', title: 'Pista 1', content: 'Escanea la primera pista.', offsetLat: 0, offsetLon: 0, radius: 50, physicalKind: 'clue', itemLabel: 'Pista 1' },
      { gameId: 'hot_cold_search', title: 'Busca la señal', content: 'Usa frío/caliente para encontrar la zona.', offsetLat: 0.00042, offsetLon: -0.00030, radius: 55 },
      { gameId: 'sequence_code', title: 'Ordena las pistas', content: 'Combina las pistas anteriores.', offsetLat: 0.00080, offsetLon: -0.00058, radius: 50 },
      { gameId: 'photo_scout', title: 'Prueba fotográfica', content: 'Haz una foto de campo como cierre.', offsetLat: 0.00108, offsetLon: -0.00088, radius: 50 },
    ],
  },
  {
    id: 'urban_escape',
    title: 'Escape urbano',
    icon: '🔐',
    summary: 'Llave, contraseña y puzzle lógico final.',
    goodFor: 'Juego con historia, ciudad, instituto, evento.',
    stages: [
      { gameId: 'manual_password', title: 'La contraseña', content: 'Encuentra la palabra clave en el entorno.', offsetLat: 0, offsetLon: 0, radius: 45 },
      { gameId: 'qr_key_gate', title: 'Llave QR', content: 'Escanea la llave física.', offsetLat: -0.00040, offsetLon: 0.00036, radius: 45, physicalKind: 'requirement', itemLabel: 'Llave QR' },
      { gameId: 'logic_circuit', title: 'Circuito de salida', content: 'Resuelve el circuito final.', offsetLat: -0.00075, offsetLon: 0.00068, radius: 50, requiresPreviousItem: true },
      { gameId: 'photo_scout', title: 'Foto de escape', content: 'Foto final del equipo.', offsetLat: -0.00105, offsetLon: 0.00095, radius: 50 },
    ],
  },
  {
    id: 'family_gymkhana',
    title: 'Gymkhana familiar',
    icon: '🎁',
    summary: 'Ritmo variado: GPS, brújula, foto y bonus.',
    goodFor: 'Niños, familias, grupos pequeños.',
    stages: [
      { gameId: 'gps_signal_lock', title: 'Punto de salida', content: 'Empieza la gymkhana.', offsetLat: 0, offsetLon: 0, radius: 60 },
      { gameId: 'bearing_compass', title: 'Mira al oeste', content: 'Usa la brújula para encontrar el rumbo.', offsetLat: 0.00035, offsetLon: 0.00035, radius: 55 },
      { gameId: 'photo_scout', title: 'Foto divertida', content: 'Haz una foto de campo con el equipo.', offsetLat: 0.00065, offsetLon: 0.00070, radius: 55 },
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

  return adminGameCatalog.find((game) => game.family === type) || adminGameCatalog[0]
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
