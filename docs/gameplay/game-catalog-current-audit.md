# SAGA Game Catalog Current Audit

## Purpose

Audit current game presets after `v0.0.1` and before changing player runtime behavior.

This is a planning PR only. It does not change QR completion, player progression or runtime game rules.

## Current decision

SAGA should not expose every idea as if it were fully playable.

The admin catalog should be grouped into:

1. **Playable now**
2. **Partial / needs polish**
3. **Incubator / planned**

## Keep visible as playable/foundation

| Preset | Decision | Reason |
|---|---|---|
| GPS Signal | keep | Core outdoor route mechanic. |
| Compass Bearing | keep | Useful navigation mechanic. |
| QR Object | keep | Inventory foundation. |
| QR Key | keep | Unlock/requirement foundation. |
| QR Clue | keep | Mission clue foundation. |
| Hidden Bonus | keep | Optional rewards and side content. |

## Keep but mark partial

| Preset | Decision | Reason |
|---|---|---|
| Hot / Cold Search | partial | GPS foundation exists; needs clearer player UI. |
| Circuit Logic | partial | Good concept; needs runtime and UX review. |

## Move to incubator/planned

These should not be presented as main playable games yet.

| Preset | Decision | Reason |
|---|---|---|
| Triangulation | incubator | Needs explicit runtime and UX. |
| Sequential Code | incubator | Needs answer/input runtime. |
| Field Photo | incubator | Needs media/proof rules. |
| Team Relay | incubator | Needs team-state model. |
| Keyword Answer | incubator | Needs answer validation runtime. |

## Offline multiplayer model

Do not require real-time networking for field play.

Preferred model:

1. Each device records local events.
2. QR/inventory/progress events are valid offline.
3. Team games use shared physical tokens, QR cards, words or role cards.
4. When network returns, events sync to the backend.
5. Admin resolves team progress from synced events.

This supports multiplayer without assuming WebSocket/live internet in the field.

## Immediate next PR

Implement admin UI catalog grouping:

- `Playable now`
- `Partial / needs polish`
- `Incubator / planned`

Rules for the next PR:

- Admin-side only first.
- Do not change QR route completion behavior.
- Do not make planned games look playable.
- Keep technical fields under advanced sections.
- Make the Game tab easier to understand before adding more runtime.

## Static detection

- Admin catalog: `frontend/src/admin/lib/gameCatalog.ts`
- Detected catalog strings:
  - `gps_signal_lock`
  - `hot_cold_search`
  - `bearing_compass`
  - `three_bearing_triangle`
  - `logic_circuit`
  - `sequence_code`
  - `qr_collectible`
  - `qr_key_gate`
  - `clue_card`
  - `photo_scout`
  - `team_relay`
  - `manual_password`
  - `bonus_cache`
  - `qr_route`
  - `clue_hunt`
  - `urban_escape`
  - `family_gymkhana`
  - `Señal GPS`
  - `Frío / caliente`
  - `Rumbo con brújula`
  - `Triangulación`
  - `Circuito lógico`
  - `Código secuencial`
  - `Objeto QR`
  - `Llave QR`
  - `Pista QR`
  - `Foto de exploración`
  - `Relevo de equipo`
  - `Palabra clave`
  - `Bonus oculto`
  - `Ruta con QR`
  - `Inicio de ruta`
  - `Llave del camino`
  - `Puerta bloqueada`
  - `Bonus final`
  - `Búsqueda de pistas`
  - `Pista 1`
  - `Busca la señal`
  - `Ordena las pistas`
  - `Prueba fotográfica`
  - `Escape urbano`
  - `La contraseña`
  - `Circuito de salida`
  - `Foto de escape`
  - `Gymkhana familiar`
  - `Punto de salida`
  - `Mira al oeste`
  - `Foto divertida`
  - `Regalo oculto`
  - `signal_hunt`
  - `bearing_hunt`
  - `circuit_matrix`
- Player runtime catalog: `frontend/src/player/minigames/gameCatalog.ts`
  - runtime id: `bearing_hunt`
  - runtime id: `circuit_matrix`
  - runtime id: `signal_hunt`
- Node editor: `frontend/src/admin/components/NodeDetailDrawer.tsx`
  - `completion_method` occurrences: 2
  - `reward` occurrences: 10
  - `requirement` occurrences: 15
  - `game_id` occurrences: 3
  - `offline` occurrences: 6
