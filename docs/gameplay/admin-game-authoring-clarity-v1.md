# Admin Game Authoring Clarity v1

This document defines the post-v0.0.1 direction for making SAGA mission authoring easier and less technical.

## Goal

Mission Control should help a non-technical game master create playable missions without understanding internal runtime fields.

The editor should clearly separate:

1. **Game type**: what the player does.
2. **Completion**: how the node is completed.
3. **Requirement**: what must already be collected/unlocked.
4. **Reward**: what the player receives.
5. **Offline status**: whether the node can be played without network.

## Authoring model

```text
Family -> Preset/Game -> Completion method -> Requirement -> Reward
```

## Current families

| Family | Purpose | Current maturity |
|---|---|---|
| `signal_hunt` | GPS/radius/proximity gameplay | playable foundation |
| `bearing_hunt` | compass/bearing gameplay | playable foundation |
| `circuit_matrix` | logic/puzzle gameplay | partial foundation |

## Editor copy rules

Use player-facing words first and internal fields second.

Good:

- "Player reaches this area"
- "Player scans this QR card"
- "Requires a key collected earlier"
- "Gives an inventory reward"

Avoid as primary copy:

- `proximity_lock`
- `completion_method`
- `physical_qr`
- `config.game_id`

Internal names can remain in advanced/debug areas.

## Recommended game presets

Near-term catalog should include:

| Preset | Family | Offline goal |
|---|---|---|
| GPS Signal | `signal_hunt` | ready |
| Hot / Cold Search | `signal_hunt` | ready after UI polish |
| Compass Bearing | `bearing_hunt` | ready |
| Triangulation | `bearing_hunt` | planned runtime |
| Circuit Logic | `circuit_matrix` | partial |
| Sequential Code | `circuit_matrix` or new family | planned |
| QR Object | inventory | ready |
| QR Key | inventory | ready |
| QR Clue | inventory | ready |
| Hidden Bonus | inventory | ready |
| Field Photo | field media | planned |
| Team Relay | team/co-op | planned |
| Keyword Answer | puzzle/input | planned |

## Next implementation steps

1. Improve the Game tab layout.
2. Make game cards shorter and easier to scan.
3. Add a compact "How this node plays" summary.
4. Add clearer labels for completion, requirement and reward.
5. Move technical fields lower under an advanced section.
6. Keep all changes admin-side only first.
7. Do not change player QR completion behavior in this PR.
