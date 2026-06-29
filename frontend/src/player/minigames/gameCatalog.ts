export type GameCatalogFamily = 'signal_hunt' | 'bearing_hunt' | 'circuit_matrix'

export type GameCatalogItem = {
  id: GameCatalogFamily
  type: GameCatalogFamily
  family: GameCatalogFamily
  label: string
  title: string
  name: string
  description: string
  status: 'native'
  runtime: 'family-native'
  emoji: string
  tags: string[]
}

export const FAMILY_NATIVE_GAME_CATALOG: GameCatalogItem[] = [
  {
    id: 'signal_hunt',
    type: 'signal_hunt',
    family: 'signal_hunt',
    label: 'Signal Hunt',
    title: 'Signal Hunt',
    name: 'Signal Hunt',
    description: 'Proximity/search gameplay for source finding, hot/cold signal feedback and GPS lock.',
    status: 'native',
    runtime: 'family-native',
    emoji: '📡',
    tags: ['gps', 'proximity', 'signal', 'search'],
  },
  {
    id: 'bearing_hunt',
    type: 'bearing_hunt',
    family: 'bearing_hunt',
    label: 'Bearing Hunt',
    title: 'Bearing Hunt',
    name: 'Bearing Hunt',
    description: 'Compass/orientation gameplay for bearing lock, sector scan and heading challenges.',
    status: 'native',
    runtime: 'family-native',
    emoji: '🧭',
    tags: ['compass', 'bearing', 'sensor', 'orientation'],
  },
  {
    id: 'circuit_matrix',
    type: 'circuit_matrix',
    family: 'circuit_matrix',
    label: 'Circuit Matrix',
    title: 'Circuit Matrix',
    name: 'Circuit Matrix',
    description: 'Logic/grid gameplay for path restore, switch logic, route repair and power balance.',
    status: 'native',
    runtime: 'family-native',
    emoji: '🧩',
    tags: ['logic', 'grid', 'circuit', 'puzzle'],
  },
]

export const GAME_CATALOG = FAMILY_NATIVE_GAME_CATALOG
export const gameCatalog = FAMILY_NATIVE_GAME_CATALOG
export const MINIGAME_CATALOG = FAMILY_NATIVE_GAME_CATALOG
export const minigameCatalog = FAMILY_NATIVE_GAME_CATALOG

export function listGameCatalogItems(): GameCatalogItem[] {
  return FAMILY_NATIVE_GAME_CATALOG
}

export function getGameCatalogItem(type: string | null | undefined): GameCatalogItem | null {
  const normalized = String(type || '').trim().toLowerCase()
  return FAMILY_NATIVE_GAME_CATALOG.find((item) => item.id === normalized) || null
}

export function isFamilyNativeCatalogType(type: string | null | undefined): type is GameCatalogFamily {
  return Boolean(getGameCatalogItem(type))
}
