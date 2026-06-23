# Family Schema Contract

SAGA Engine should grow through **families + presets + variants + schemas**, not through many unrelated minigame implementations.

This contract is the first admin/frontend foundation for describing what each family supports.

## Current families

- `signal_hunt`
- `bearing_hunt`
- `circuit_matrix`

These are mechanic families, not a hard limit of three games.

## Contract goals

The schema contract defines:

- editable fields per family
- required fields
- default config
- supported presets
- basic validation rules
- future-friendly metadata for the admin UI

## Presets

Initial presets:

### signal_hunt

- `proximity_lock`
- `hot_cold_search`
- `signal_lock`

### bearing_hunt

- `single_lock`
- `sector_scan`
- `directional_sequence`

### circuit_matrix

- `sequence`
- `grid_restore`
- `energy_balance`

## Safety boundary

This contract is frontend/admin metadata only.

It does not:

- change backend APIs
- change player runtime behavior
- touch live mission data
- require changes to `data/stages.json`
- expose fallback answers, runes or private runtime data

## Next steps

Recommended follow-up PRs:

1. Add preset picker to the node editor.
2. Add visual validation before saving nodes.
3. Mirror the contract in backend validation or generate shared fixtures.
4. Use schemas to drive richer family-native player runtimes.
5. Add Physical Kit metadata for QR/NFC/object interactions.
