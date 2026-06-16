# SAGA Engine v0.3.0 — Sequence Code production release

SAGA Engine adds its second production-ready reusable game: **Sequence Code**.

## Sequence Code

- Players reconstruct an ordered sequence from physical clues, stories, maps or triptychs.
- Three to ten configurable words, numbers or symbols.
- Choices are shuffled for every play session.
- Configurable number of attempts.
- Optional contextual hint after the first error.
- Wrong answers do not advance mission progress.
- A correct answer completes the node and loads the following mission node.
- Fully usable offline with later synchronization.
- Visual design aligned with Circuit Matrix and the general SAGA player interface.

## Mission Control

- Dedicated visual Sequence Code editor.
- Add, edit, delete and reorder sequence tokens.
- Stable text inputs that keep focus while typing.
- Clear example for narrative and physical-clue missions.
- Validation for empty, duplicated, short or oversized sequences.
- Save confirmation only after the backend returns the exact stored configuration.
- Verification covers title, order, coordinates, radius, entry mode and minigame configuration.

## Player and PWA reliability

- Player mission data refreshes when returning to the tab.
- Public configuration and version requests bypass stale HTTP caches.
- Navigation uses network-first behavior with an offline fallback.
- Service-worker cache version updated.
- Existing offline mission data remains available when the network is unavailable.

## Validation

- Repository privacy guard.
- Protected-files guard.
- Python compilation.
- TypeScript production build.
- Backend runtime contracts.
- Sequence persistence from administrator to SQLite and player payload.
- Wrong answer remains on the current node.
- Correct `OK` completion advances exactly one level.
- Following node is loaded after completion.
- Candidate-first Docker deployment and smoke tests.
- Manual mobile visual approval.

## Production support

| Feature | Status |
|---|---|
| Circuit Matrix | Production-ready |
| Sequence Code | Production-ready |
| QR objects, keys, clues and bonuses | Production-ready |
| Guided Mission Control | Production-ready |
| Offline progress and synchronization | Production-ready foundation |
| GPS signal and bearing games | Further field validation pending |
| Motion Challenge | Parked experimental prototype |
| Photo and team games | Planned |

## Upgrade notes

Runtime state remains outside the repository. Existing SQLite mission, player,
inventory and progress data is preserved during deployment.
