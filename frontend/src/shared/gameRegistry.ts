// Acceso tipado al registro único de minijuegos (shared/game_registry.json en
// la raíz del repo). Es la MISMA fuente que lee el backend
// (backend/app/runtime/game_registry.py): añadir un juego es una entrada allí.
// Ver docs/como-anadir-un-minijuego.md.
//
// Los ids (game_id, familia técnica, familia de presentación) son `string` a
// propósito: ya no hay una unión de literales que mantener a mano en cada
// fichero. Que un id sea válido lo garantizan el registro y los tests
// parametrizados (tests/test_registro_de_minijuegos.py).
import registryJson from '../../../shared/game_registry.json'

export type RegistryDisplayFamily = {
  id: string
  label: string
  icon: string
  description: string
}

export type RegistryFamily = {
  id: string
  label: string
  icon: string
  detail: string
  spec_label: string
  admin_label: string
  admin_icon: string
  display_fallback: string
}

export type RegistryGame = {
  id: string
  /** false: existe sólo para mapas de familia (legacy), sin ficha en el catálogo. */
  catalog?: boolean
  title?: string
  icon?: string
  family: string
  display_family: string
  /** Por qué cae en esa familia de presentación (documentación, no se usa en runtime). */
  display_note?: string
  note?: string
  category?: string
  difficulty?: string
  duration?: string
  runtime_status?: string
  offline_status?: string
  completion_method?: string
  node_kind?: string
  custom_editor?: boolean
  hide_guided_keys?: boolean
  extra_guided_keys?: string[]
  qr_kind?: string
  hard_floor?: string
  config_policy?: 'keep_unknown' | 'strict'
  config_keys?: string[]
  offline_note?: string
  summary?: string
  player_goal?: string
  editor_hint?: string
  default_config?: Record<string, unknown>
  content?: string
  messages?: { hint: string; gps_unavailable: string; locked: string }
}

export type GameRegistry = {
  schema_version: number
  category_order: string[]
  display_families: RegistryDisplayFamily[]
  family_card_order: string[]
  families: RegistryFamily[]
  extra_type_labels: Record<string, { label: string; icon: string }>
  supported_types: string[]
  legacy_type_display_fallback: Record<string, string>
  type_aliases: Record<string, { type: string; game_id: string }>
  config_policy: { default: 'keep_unknown' | 'strict' }
  games: RegistryGame[]
}

export const gameRegistry = registryJson as unknown as GameRegistry

export const registryGames: RegistryGame[] = gameRegistry.games

/** Sólo los juegos con ficha en el catálogo del admin, en el orden del registro. */
export const registryCatalogGames: RegistryGame[] = registryGames.filter(
  (game) => game.catalog !== false
)

const gamesById = new Map<string, RegistryGame>(registryGames.map((game) => [game.id, game]))

export function getRegistryGame(gameId: unknown): RegistryGame | undefined {
  return typeof gameId === 'string' ? gamesById.get(gameId) : undefined
}
