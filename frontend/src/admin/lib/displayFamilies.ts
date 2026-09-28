// Agrupación de PRESENTACIÓN para el admin: 5 familias claras en español que
// organizan el selector de juegos y las tarjetas de familia.
//
// Esto NO cambia ningún id que viaje en datos de misión: interaction_type,
// game_id, o la familia nativa que usan el resolver/runtime del jugador
// (frontend/src/player/minigames/core/resolver.ts) y el anti-cheat siguen
// siendo los técnicos de siempre (signal_hunt, circuit_matrix,
// motion_challenge, bearing_hunt, audio_challenge). Una misión existente
// carga y juega exactamente igual que antes.
//
// Grupo de destino (owner-approved):
//   1. Llegar y escanear — checkpoint/señal + QR/físico
//   2. Puzles            — circuitos, secuencias, mosaicos, palabra clave
//   3. Movimiento        — agitar/inclinar el móvil
//   4. Orientación       — brújula
//   5. Sonido            — micrófono
import type { AdminGameId } from './gameCatalog'

export type DisplayFamilyId = 'llegar_y_escanear' | 'puzles' | 'movimiento' | 'orientacion' | 'sonido'

export type DisplayFamilyCard = {
  id: DisplayFamilyId
  icon: string
  title: string
  description: string
}

export const displayFamilyCards: DisplayFamilyCard[] = [
  {
    id: 'llegar_y_escanear',
    icon: '📍',
    title: 'Llegar y escanear',
    description: 'Checkpoints GPS y objetos físicos con tarjeta QR (llave, pista, bonus o coleccionable).',
  },
  {
    id: 'puzles',
    icon: '🧩',
    title: 'Puzles',
    description: 'Retos de lógica y memoria: matriz de circuitos, Simón Dice, mosaico y palabra clave.',
  },
  {
    id: 'movimiento',
    icon: '📳',
    title: 'Movimiento',
    description: 'Retos que usan el acelerómetro o el equilibrio del móvil: agitar y laberinto de bola.',
  },
  {
    id: 'orientacion',
    icon: '🧭',
    title: 'Orientación',
    description: 'Reto de brújula: girar el móvil hasta un rumbo objetivo y mantenerlo.',
  },
  {
    id: 'sonido',
    icon: '🎤',
    title: 'Sonido',
    description: 'Reto de micrófono: soplar o hacer ruido para cargar una barra.',
  },
]

// Mapa 1:1 con los 17 AdminGameId del catálogo (adminGameCatalog en
// gameCatalog.ts). El test de cobertura recorre ese catálogo y comprueba que
// cada juego cae en exactamente una de las 5 familias.
export const DISPLAY_FAMILY_BY_GAME_ID: Record<AdminGameId, DisplayFamilyId> = {
  simple_checkpoint: 'llegar_y_escanear',
  qr_collectible: 'llegar_y_escanear',
  qr_key_gate: 'llegar_y_escanear',
  clue_card: 'llegar_y_escanear',
  // Mapa mudo completa por proximidad GPS igual que un checkpoint (reutiliza
  // el runtime de signal_hunt): mismo grupo que el resto de "llegar y
  // escanear" aunque no muestre el pin exacto.
  mapa_mudo: 'llegar_y_escanear',
  bonus_cache: 'llegar_y_escanear',
  photo_scout: 'llegar_y_escanear',
  // Relevo de equipo depende de proximidad GPS de varios jugadores: mismo
  // grupo que el resto de retos de "llegar" aunque su family técnica sea
  // signal_hunt.
  team_relay: 'llegar_y_escanear',
  // Cuenta las señales: se juega EN el punto real (require_proximity: true,
  // igual que un checkpoint) y no es un puzle de lógica -no hay tablero ni
  // memoria, solo mirar alrededor y contar-, así que cae en "Llegar y
  // escanear" con el resto de juegos que se completan al llegar, aunque su
  // family técnica (heredada, como mapa_mudo/team_relay) sea signal_hunt.
  cuenta_senales: 'llegar_y_escanear',
  logic_circuit: 'puzles',
  sequence_code: 'puzles',
  place_mosaic: 'puzles',
  manual_password: 'puzles',
  tilt_maze: 'movimiento',
  // Caza-Señales es un reto de reflejos con el dedo, no de GPS ni de
  // circuitos: por dinámica real cae en Movimiento, aunque su family
  // técnica (heredada) sea circuit_matrix.
  spark_radar: 'movimiento',
  shake_charge: 'movimiento',
  bearing_hunt: 'orientacion',
  // Segundo game_id de la familia bearing_hunt (owner-approved "Rumbo
  // doble"): mismo grupo de presentación que Caza de rumbo.
  rumbo_doble: 'orientacion',
  audio_challenge: 'sonido',
  // Legacy: sin entrada propia en adminGameCatalog a propósito (ver el
  // comentario de AdminGameId en gameCatalog.ts). Se mapea igual por si
  // algún día se recorre el tipo AdminGameId completo; runtime-bridge.ts la
  // redirige siempre a logic_circuit, así que comparte grupo con ese juego.
  shake_antenna_charge: 'puzles',
}

export function getDisplayFamily(gameId: AdminGameId): DisplayFamilyId {
  return DISPLAY_FAMILY_BY_GAME_ID[gameId] || 'llegar_y_escanear'
}

export function getDisplayFamilyCard(id: DisplayFamilyId): DisplayFamilyCard {
  return displayFamilyCards.find((card) => card.id === id) || displayFamilyCards[0]
}
