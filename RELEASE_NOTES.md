# SAGA Engine v0.2.0 — First production gameplay release

This release turns SAGA Engine from a platform foundation into a usable
self-hosted system for authoring and playing real-world missions.

## Highlights

### First production-ready game: Circuit Matrix

- Complete touch-based memory puzzle runtime.
- Clean mobile player interface.
- Fixed pattern mode: the administrator draws or generates one route and every
  player receives exactly the same route.
- Random mode: a different valid route is generated whenever a game starts.
- Mission Control visual pattern editor with generate, draw, undo and clear.
- Configurable 4×4 to 6×6 board.
- Configurable difficulty, preview timing, path length and allowed errors.
- Deterministic persistence of fixed routes through SQLite and the player API.
- Strict backend validation for invalid cells, repeated cells and non-adjacent
  jumps.
- Offline-ready completion and later synchronization.
- Protection against duplicate completion submissions.

### Physical QR nodes

- QR collectible objects.
- QR keys that can unlock later node requirements.
- QR clue cards.
- Optional QR bonus rewards.
- QR preview and PNG export from Mission Control.
- Local/offline inventory storage.

### Mission Control

- Guided game and node editor.
- Playable games shown separately from planned or experimental games.
- Clear per-game settings instead of raw configuration fields.
- Unified editing for normal nodes and physical QR cards.
- Responsive desktop and mobile editor improvements.
- Large visual editor for Circuit Matrix patterns.
- Cleaner node texts, requirements and completion configuration.

### Player and offline foundations

- Map-first player flow.
- Geolocated node opening.
- Local player progress.
- Offline event queue and deduplication.
- Mission preload/fallback foundations.
- Version and commit visibility.
- `/api/version` reports the public release version, commit and build time.
- Safe candidate-first Docker deployment.

## Production support

| Feature | Status |
|---|---|
| Circuit Matrix | Production-ready |
| QR object/key/clue/bonus nodes | Production-ready |
| Guided Mission Control | Production-ready |
| Offline progress/synchronization | Production-ready foundation |
| GPS signal game | Further field validation pending |
| Bearing/compass game | Further field validation pending |
| Sequence code | Planned |
| Photo challenge | Planned |
| Team challenge | Planned |
| Motion Challenge | Parked experimental prototype |

## Validation performed

- Repository privacy guard.
- Protected-file guard.
- Python compilation.
- Backend runtime contract checks.
- Fixed Circuit Matrix pattern persisted through SQLite.
- Fixed pattern delivered unchanged through the player API.
- Invalid repeated and jumping paths rejected.
- Frontend TypeScript production build.
- Candidate Docker deployment.
- Smoke tests for:
  - `/`
  - `/admin-react`
  - `/player/PLAYER%201`
- Manual desktop and mobile gameplay validation.
- Successful player completion and continuation.

## Upgrade notes

Runtime data remains outside the repository. Existing SQLite player, mission,
inventory and progress data is preserved during the upgrade.

CodeQL remains manual-only while the hosted GitHub initialization issue is
unresolved. Local guards, builds, runtime contracts and candidate deployment are
the release gates.

## Source

Clean release integration produced from tested gameplay snapshot:

- source commit: `65d3c87`
- integration strategy: squash onto current `main`
- release branch: `release/0.2.0-circuit-matrix`
