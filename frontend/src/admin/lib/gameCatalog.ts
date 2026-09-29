import { gameRegistry, registryCatalogGames } from '../../shared/gameRegistry'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import {
  getAdminFamilyIcon,
  getAdminFamilyLabel,
  getDefaultAdminConfigForFamily,
  type FamilyId,
} from './familyConfigs'

// Ya no es una unión de literales a mano: los ids salen del registro único
// (shared/game_registry.json) y los valida tests/test_registro_de_minijuegos.py.
// 'shake_antenna_charge' es una marca legacy sin ficha propia en el catálogo:
// runtime-bridge.ts (jugador) y getAdminGameForStage (abajo) la redirigen a
// logic_circuit.
export type AdminGameId = string

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
  // "Trampa de palabras": varias rondas de pregunta con 4 opciones.
  | 'quiz'

export type MissionTemplateId = 'qr_route' | 'clue_hunt' | 'urban_escape' | 'family_gymkhana'

export type AdminGameCatalogItem = {
  id: AdminGameId
  title: string
  icon: string
  family: FamilyId
  category: 'gps' | 'compass' | 'logic' | 'physical' | 'photo' | 'team' | 'motion' | 'quiz'
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

// Derivado del registro único: título, familia, estado, config por defecto,
// mensajes... viven en shared/game_registry.json. El ORDEN del registro es el
// orden de este array y NO debe tocarse (getAdminGameForStage lo usa como
// fallback por familia).
export const adminGameCatalog: AdminGameCatalogItem[] = registryCatalogGames.map((game) => ({
  id: game.id,
  title: game.title as string,
  icon: game.icon as string,
  family: game.family as FamilyId,
  category: game.category as AdminGameCatalogItem['category'],
  difficulty: game.difficulty as AdminGameCatalogItem['difficulty'],
  duration: game.duration as string,
  runtimeStatus: game.runtime_status as AdminGameRuntimeStatus,
  offlineStatus: game.offline_status as AdminGameOfflineStatus,
  completionMethod: game.completion_method as AdminGameCompletionMethod,
  offlineNote: game.offline_note as string,
  summary: game.summary as string,
  playerGoal: game.player_goal as string,
  editorHint: game.editor_hint as string,
  // Copia profunda: el catálogo se muta en el editor y el registro no.
  config: JSON.parse(JSON.stringify(game.default_config || {})) as Record<string, unknown>,
  content: game.content as string,
  messages: JSON.parse(JSON.stringify(game.messages)) as AdminGameCatalogItem['messages'],
}))

export const missionTemplates: MissionTemplate[] = [
  {
    id: 'qr_route',
    title: 'Ruta QR con llave',
    icon: '🔑',
    summary: 'Juego base listo: ruta GPS, llave QR, nodo bloqueado y bonus opcional.',
    goodFor: 'Primer juego real, rutas cortas, grupos pequeños, pruebas con tarjetas físicas.',
    stages: [
      {
        gameId: 'logic_circuit',
        title: 'Inicio de ruta',
        content: 'Llega al punto inicial y activa la misión.',
        offsetLat: 0,
        offsetLon: 0,
        radius: 55,
      },
      {
        gameId: 'qr_key_gate',
        title: 'Llave del camino',
        content: 'Escanea la llave QR física.',
        offsetLat: 0.00045,
        offsetLon: 0.00028,
        radius: 45,
        physicalKind: 'requirement',
        itemLabel: 'Llave del camino',
      },
      {
        gameId: 'logic_circuit',
        title: 'Puerta bloqueada',
        content: 'Este nodo pide la llave anterior.',
        offsetLat: 0.00088,
        offsetLon: 0.00062,
        radius: 55,
        requiresPreviousItem: true,
      },
      {
        gameId: 'bonus_cache',
        title: 'Bonus final',
        content: 'Extra opcional al terminar la ruta.',
        offsetLat: 0.00118,
        offsetLon: 0.00092,
        radius: 45,
        physicalKind: 'bonus',
        itemLabel: 'Bonus final',
      },
    ],
  },
  {
    id: 'clue_hunt',
    title: 'Ruta de pistas QR',
    icon: '🧩',
    summary: 'Cadena jugable de pistas físicas y búsqueda GPS, sin puzzles pendientes.',
    goodFor: 'Misterio sencillo, historia local, juego familiar, rutas con tarjetas.',
    stages: [
      {
        gameId: 'logic_circuit',
        title: 'Punto de inicio',
        content: 'Llega al punto de salida y abre la primera pista.',
        offsetLat: 0,
        offsetLon: 0,
        radius: 55,
      },
      {
        gameId: 'clue_card',
        title: 'Pista 1',
        content: 'Escanea la primera pista QR.',
        offsetLat: 0.00042,
        offsetLon: -0.0003,
        radius: 45,
        physicalKind: 'clue',
        itemLabel: 'Pista 1',
      },
      {
        gameId: 'logic_circuit',
        title: 'Busca la señal',
        content: 'La señal se hace más fuerte al acercarte.',
        offsetLat: 0.0008,
        offsetLon: -0.00058,
        radius: 55,
      },
      {
        gameId: 'bonus_cache',
        title: 'Recompensa oculta',
        content: 'Encuentra el bonus final.',
        offsetLat: 0.00108,
        offsetLon: -0.00088,
        radius: 45,
        physicalKind: 'bonus',
        itemLabel: 'Recompensa oculta',
      },
    ],
  },
  {
    id: 'urban_escape',
    title: 'Escape QR corto',
    icon: '🔐',
    summary: 'Escape urbano simple con llave física y cierre GPS; evita pruebas aún planificadas.',
    goodFor: 'Cidade, instituto, evento corto, juego con historia sin depender de conexión.',
    stages: [
      {
        gameId: 'logic_circuit',
        title: 'Entrada',
        content: 'Activa el punto de entrada del escape.',
        offsetLat: 0,
        offsetLon: 0,
        radius: 50,
      },
      {
        gameId: 'qr_key_gate',
        title: 'Llave QR',
        content: 'Escanea la llave física para abrir la salida.',
        offsetLat: -0.0004,
        offsetLon: 0.00036,
        radius: 45,
        physicalKind: 'requirement',
        itemLabel: 'Llave QR',
      },
      {
        gameId: 'logic_circuit',
        title: 'Salida bloqueada',
        content: 'Usa la llave anterior y llega al punto de salida.',
        offsetLat: -0.00075,
        offsetLon: 0.00068,
        radius: 55,
        requiresPreviousItem: true,
      },
      {
        gameId: 'clue_card',
        title: 'Epílogo',
        content: 'Escanea la tarjeta final de historia.',
        offsetLat: -0.00105,
        offsetLon: 0.00095,
        radius: 45,
        physicalKind: 'clue',
        itemLabel: 'Epílogo',
      },
    ],
  },
  {
    id: 'family_gymkhana',
    title: 'Gymkhana familiar',
    icon: '🎁',
    summary: 'Ritmo variado con mosaico, lógica, objeto QR y bonus, todo jugable offline.',
    goodFor: 'Niños, familias, grupos pequeños, parques y rutas sencillas.',
    stages: [
      {
        gameId: 'logic_circuit',
        title: 'Punto de salida',
        content: 'Empieza la gymkhana.',
        offsetLat: 0,
        offsetLon: 0,
        radius: 60,
      },
      {
        gameId: 'place_mosaic',
        title: 'Observa el lugar',
        content: 'Reconstruye la imagen usando el elemento real como referencia.',
        offsetLat: 0.00035,
        offsetLon: 0.00035,
        radius: 55,
      },
      {
        gameId: 'qr_collectible',
        title: 'Objeto del equipo',
        content: 'Escanea el objeto QR del equipo.',
        offsetLat: 0.00065,
        offsetLon: 0.0007,
        radius: 45,
        physicalKind: 'collectible',
        itemLabel: 'Objeto del equipo',
      },
      {
        gameId: 'bonus_cache',
        title: 'Regalo oculto',
        content: 'Busca el bonus final.',
        offsetLat: 0.00095,
        offsetLon: 0.00105,
        radius: 45,
        physicalKind: 'bonus',
        itemLabel: 'Regalo oculto',
      },
    ],
  },
]

// Orden con sentido para quien navega la lista -no el orden en que se fue
// añadiendo al catálogo, que es el que usan las funciones de abajo para su
// fallback por familia (getAdminGameForStage) y no debe tocarse: cambiar el
// ORDEN DEL ARRAY podría cambiar A QUÉ JUEGO cae una misión vieja sin
// game_id. Este es solo para mostrar, nunca para resolver identidad.
const ORDEN_DE_CATEGORIA: Record<string, number> = Object.fromEntries(
  gameRegistry.category_order.map((category, index) => [category, index])
)

export function sortedByCategoryForDisplay(
  games: AdminGameCatalogItem[]
): AdminGameCatalogItem[] {
  return games
    .slice()
    .sort((a, b) => ORDEN_DE_CATEGORIA[a.category] - ORDEN_DE_CATEGORIA[b.category])
}

export function getAdminGame(gameId?: string | null): AdminGameCatalogItem {
  return adminGameCatalog.find((game) => game.id === gameId) || adminGameCatalog[0]
}

export function getAdminGameForStage(
  type?: string | null,
  config?: Record<string, unknown> | null
): AdminGameCatalogItem {
  const gameId = typeof config?.game_id === 'string' ? config.game_id : ''
  let explicit = adminGameCatalog.find((game) => game.id === gameId)
  if (explicit) return explicit

  explicit = adminGameCatalog.find((game) => game.id === type)
  if (explicit) return explicit

  // Legacy: signal_hunt sin game_id ya no debe caer en QR físico. La misma
  // migración que runtime-bridge.ts hace en el jugador: al puzle de
  // circuitos, no a un catálogo con la etiqueta 'shake_antenna_charge' que
  // nunca existió como preset propio.
  if (type === 'signal_hunt') {
    return adminGameCatalog.find((game) => game.id === 'logic_circuit') || adminGameCatalog[0]
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
    ...(game.id === 'sequence_code' ? {} : getDefaultAdminConfigForFamily(game.family)),
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
