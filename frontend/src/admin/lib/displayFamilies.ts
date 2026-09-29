// Agrupación de PRESENTACIÓN para el admin: 6 familias claras en español que
// organizan el selector de juegos y las tarjetas de familia.
//
// Esto NO cambia ningún id que viaje en datos de misión: interaction_type,
// game_id, o la familia nativa que usan el resolver/runtime del jugador
// (frontend/src/player/minigames/core/resolver.ts) y el anti-cheat siguen
// siendo los técnicos de siempre (signal_hunt, circuit_matrix,
// motion_challenge, bearing_hunt, audio_challenge, word_trap). Una misión
// existente carga y juega exactamente igual que antes.
//
// Grupo de destino (owner-approved):
//   1. Llegar y escanear — checkpoint/señal + QR/físico
//   2. Puzles            — circuitos, secuencias, mosaicos, palabra clave
//   3. Movimiento        — agitar/inclinar el móvil
//   4. Orientación       — brújula
//   5. Sonido            — micrófono
//   6. Desafío           — preguntas trampa contrarreloj (familia TÉCNICA
//                          nueva, word_trap/trampa_palabras: ninguna de las
//                          5 de arriba encajaba)
import { gameRegistry, registryGames } from '../../shared/gameRegistry'
import type { AdminGameId } from './gameCatalog'

// Ahora los ids y las tarjetas salen de shared/game_registry.json; añadir una
// familia de presentación o asignar un juego a una es editar el registro.
export type DisplayFamilyId = string

export type DisplayFamilyCard = {
  id: DisplayFamilyId
  icon: string
  title: string
  description: string
}

export const displayFamilyCards: DisplayFamilyCard[] = gameRegistry.display_families.map((family) => ({
  id: family.id,
  icon: family.icon,
  title: family.label,
  description: family.description,
}))

// Mapa 1:1 con los juegos del registro (incluido el legacy
// shake_antenna_charge, sin ficha en el catálogo, que comparte grupo con
// logic_circuit porque runtime-bridge.ts la redirige allí). El test
// parametrizado tests/test_registro_de_minijuegos.py comprueba que cada juego
// cae en exactamente una de las familias de presentación.
export const DISPLAY_FAMILY_BY_GAME_ID: Record<AdminGameId, DisplayFamilyId> = Object.fromEntries(
  registryGames.map((game) => [game.id, game.display_family])
)

export function getDisplayFamily(gameId: AdminGameId): DisplayFamilyId {
  return DISPLAY_FAMILY_BY_GAME_ID[gameId] || 'llegar_y_escanear'
}

export function getDisplayFamilyCard(id: DisplayFamilyId): DisplayFamilyCard {
  return displayFamilyCards.find((card) => card.id === id) || displayFamilyCards[0]
}
