# SAGA Engine v0.5.0 — Tilt Maze production release

SAGA Engine adds its fourth production-ready reusable game:
**Tilt Maze / Laberinto de equilibrio**.

## Tilt Maze

- Automatically generates valid mazes.
- Requires no manual wall editing.
- Supports short 7×7, medium 9×9 and long 11×11 layouts.
- Supports one fixed maze for all players or a new maze per game.
- Includes configurable time, lives, holes and required objects.
- Validates generated routes and runtime configuration.
- Works offline and uses the normal mission completion flow.

## Mobile control

- Uses mobile orientation and motion sensor APIs.
- Supports portrait and landscape screen orientation.
- Includes recalibration and clear sensor-status feedback.
- Uses a reduced movement threshold for practical phone control.
- Keeps touch controls as an accessibility and compatibility fallback.
- Detects browsers that are not providing usable sensor data.

## Mission Control

- Adds a dedicated visual Tilt Maze editor.
- Shows a generated maze preview.
- Allows administrators to generate another maze.
- Keeps maze design automatic instead of exposing manual wall editing.
- Fixes desktop clipping in Tilt Maze, Place Mosaic and Circuit Pattern.
- Uses one natural vertical scroll area for large desktop game editors.
- Preserves the existing mobile editor layouts.

## Player experience

- Native games open directly into their own game interface.
- Removes duplicated outer title, game label, player name and instructions.
- Gives the game itself more usable screen space.
- Keeps a small close control.
- Removes Fallback and SOS controls from the game panel.
- Keeps emergency node fallback exclusively in Tools.

## Completion and offline behaviour

Circuit Matrix, Sequence Code, Place Mosaic and Tilt Maze all use the
standard native-game completion callback. A successful game completes the
current node, closes the interaction, refreshes mission state and loads the
next node. Existing offline queue and later synchronization behaviour remain
active.

## Production support

| Feature | Status |
|---|---|
| Circuit Matrix | Production-ready |
| Sequence Code | Production-ready |
| Place Mosaic | Production-ready |
| Tilt Maze | Production-ready |
| QR objects, keys, clues and bonuses | Production-ready |
| Guided Mission Control | Production-ready |
| Offline progress and synchronization | Production-ready foundation |
| GPS Signal Hunt | Experimental; field validation pending |
| Bearing Hunt | Experimental; redesign pending |
| Motion Challenge | Parked experimental prototype |

## Validation

- Repository privacy guard.
- Protected-files guard.
- Python compilation.
- TypeScript and Vite production build.
- npm security audit.
- Backend and gameplay runtime contracts.
- Candidate-first Docker deployment.
- Production smoke checks for `/`, `/admin-react` and the player route.
- External SQLite mission and player data preserved.
