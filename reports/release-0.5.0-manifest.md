# SAGA Engine v0.5.0 release manifest

- Target version: `v0.5.0`
- Source branch: `gameplay/tilt-maze-v050`
- Source head: `6956c3e8387ab2f9d5cfd29bd034bfc363ad72b0`
- Base main: `8918ecc1e8faf9c5d8bca627761a1adfe25d5193`
- Prepared at: `2026-06-17T11:58:17Z`

## Integrated commits

- `556a1a4` gameplay: add generated tilt maze challenge
- `a200ad3` admin: fit custom game editors on desktop
- `abef8c2` admin: use natural desktop scrolling for game editors
- `9bc14d0` player: remove duplicated minigame sheet header
- `6956c3e` player: keep node fallback only in tools

## Release scope

- Generated Tilt Maze gameplay runtime.
- Automatic maze generation without manual wall editing.
- DeviceOrientation and DeviceMotion control.
- Portrait and landscape sensor-axis mapping.
- Touch-control fallback and recalibration.
- Time, lives, holes and required-object configuration.
- Mission Control visual editor and preview.
- Desktop custom-editor scrolling and clipping fixes.
- Immersive native-game interaction panels.
- Node fallback centralized in Tools.
- Backend normalization and contract coverage.

## Runtime data

Mission, player, inventory, progress and SQLite data remain
outside the public repository and Docker image.
