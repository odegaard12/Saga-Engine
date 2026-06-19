# Changelog

## v0.5.4 — Tools and QR Studio release
2026-06-19

- Redesigns player Tools to match the established SAGA mobile visual system.
- Removes duplicated copy while preserving GPS, language, login, fallback and diagnostics.
- Adds one unified offline preparation action for mission data, map tiles, games and field photographs.
- Keeps gallery-oriented photograph downloads as a separate action.
- Preserves the existing bottom navigation and safe-area behaviour.
- Adds QR card presets for clear, dark and photographic layouts.
- Adds configurable card accent and square or rounded presentation.
- Keeps the QR itself on a high-contrast white surface with error-correction level H.
- Adds camera validation that compares the scanned payload exactly before enabling PNG export.
- Invalidates QR validation whenever the payload or visual design changes.
- Keeps QR validation isolated from player inventory, node completion and progress.
- Coordinates the player service-worker cache as `saga-player-shell-v518-tools-copy-cleanup`.
- Adds and updates guards for Tools hierarchy, unified offline preparation, QR design and camera validation.
- Validates runtime contracts in Docker, TypeScript/Vite, npm audit, candidate-first deployment and production smoke checks.

## v0.5.3 — Offline GPS and field map release
2026-06-19

- Starts the player from a fresh GPS fix and rejects stale stored coordinates for initial centring.
- Preserves free map exploration and adds a predictable compass overview/follow cycle.
- Keeps player tracking stable while new GPS readings arrive.
- Uses explicit mission-node semantics: completed green, next active yellow and locked future red.
- Restricts the animated mission halo to the next active node.
- Keeps a visible number on every node and uses one compact QR type badge without duplicate lock symbols.
- Adds a road-following mission guide through OSRM when routing is available.
- Caches road-route geometry locally and avoids drawing a misleading straight-line fallback.
- Redesigns Tools and offline preparation around mission/map download, progress save and synchronization.
- Coordinates the player service-worker cache as `saga-player-shell-v516-road-guide-tools`.
- Adds guards for map markers, routing, offline recovery, GPS hardening and Tools UI.
- Validates runtime contracts in Docker, TypeScript/Vite, npm audit and candidate-first deployment.

## v0.5.0 — Tilt Maze production release

- Adds Tilt Maze as the fourth production-ready reusable game.
- Generates validated mazes automatically; manual wall editing is not required.
- Supports 7×7, 9×9 and 11×11 layouts.
- Supports a fixed maze for all players or a new maze per game.
- Adds mobile tilt control using orientation and motion sensor APIs.
- Maps sensor axes to portrait and landscape screen orientation.
- Adds recalibration, sensor-status feedback and touch-control fallback.
- Adds configurable time, lives, holes and required objects.
- Adds dedicated visual authoring and maze preview in Mission Control.
- Fixes desktop clipping in the Tilt Maze, Place Mosaic and Circuit Pattern editors.
- Gives desktop game editors a single natural vertical scroll area.
- Removes duplicated title, game label, player name and instructions from native-game panels.
- Expands the usable player game area.
- Keeps emergency node fallback only in Tools.
- Preserves offline completion and later synchronization.
- Updates backend normalization and runtime contracts for Tilt Maze.

## v0.4.0 — Place Mosaic production release

- Adds Place Mosaic as the third production-ready reusable game.
- Adds a visual Mission Control editor for uploading and optimizing photographs.
- Supports 2×2, 3×3 and 4×4 mosaics.
- Supports configurable photograph preview time and movement limits.
- Adds optional real-world observation questions after reconstructing the image.
- Adds an explicit completed-image step before the final question or route advance.
- Removes the distracting tile resize animation.
- Adds immediate tile exchange, progress feedback and mobile haptics.
- Preserves offline play and later event synchronization.
- Adds backend normalization and regression contracts for mosaic configuration.
- Updates the player service-worker cache.

## v0.3.1 — Vite security update

- Updates Vite from 8.0.10 to 8.0.16.
- Resolves CVE-2026-53571.
- Resolves CVE-2026-53632.
- Keeps gameplay, mission data and runtime contracts unchanged.
- Validates a zero-vulnerability npm audit.
- Rebuilds and verifies the production frontend.

## v0.3.0 — Sequence Code production release

- Adds Sequence Code as the second production-ready game.
- Adds visual sequence authoring, attempts and contextual hints.
- Validates exact backend persistence after every Mission Control save.
- Fixes stale Player/PWA loading after mission edits and deployments.
- Confirms wrong answers do not advance and correct completion loads the next node.
- Aligns Sequence Code with the SAGA/Circuit Matrix visual system.

## v0.0.1 — Public foundation release
2026-05-29

First public foundation release of SAGA Engine.

Includes Mission Control, player map flow, offline-first game catalog, QR inventory cards, admin player progress controls, runtime storage separation, Docker deployment guidance, and repository privacy/security guards.
