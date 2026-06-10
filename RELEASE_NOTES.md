# SAGA Engine v0.1.0 — Guided Mission Control editor

This release upgrades Mission Control from a technical node editor into a guided game-authoring workflow.

## Highlights

- Guided node editor with six steps: Type, Mode, Settings, Texts, Rules and Review.
- Real `adminGameCatalog` integration.
- Playable games shown by default.
- Experimental/planned games behind an explicit toggle.
- Guided per-game settings instead of raw technical config.
- Player-facing text and message editing in one place.
- Unified normal-node and physical-QR editing.
- QR preview and PNG export.
- Cleaner desktop and mobile editor behavior.
- Old v2/v3 guided editor paths removed from the active editor.
- Mission Control Builder/sidebar preserved.

## Validation

Validated before release:

- CodeQL automatic runs are temporarily parked as manual-only after a GitHub runner/token initialization issue; product validation remains green.
- privacy guard
- protected-file guard
- Python compile
- frontend production build
- candidate deploy smoke
- production deploy smoke
- `/`, `/admin-react`, `/player/PLAYER%201`

## Follow-up

Next work:

1. Validate GPS signal lock end-to-end.
2. Validate compass/bearing end-to-end.
3. Create a gameplay validation matrix.
4. Polish only specific game settings that fail real testing.
5. Add new minigames after GPS and bearing are stable.


---

# SAGA Engine v0.0.1

First public foundation release.

SAGA Engine is a self-hosted engine for real-world, geolocated games and interactive routes.

## Highlights

- FastAPI backend.
- React/Vite/TypeScript frontend.
- React Mission Control admin.
- Leaflet map UI.
- Player game flow.
- Offline-first game catalog.
- QR inventory cards: object, key, clue and bonus.
- Admin controls to reset, advance, rewind or finish a player run.
- JSON runtime storage by default.
- Optional SQLite runtime adapters.
- Docker production deployment guidance.
- Privacy/security repository guards.

## Privacy and safety

This release intentionally excludes:

- real `.env` files;
- secrets or tokens;
- private keys;
- logs;
- backups;
- local databases;
- runtime player state;
- private production files.

Runtime data must be mounted separately outside `/app`.

## Status

This is the first public baseline release. It is intended as a stable foundation before continuing with richer game authoring and gameplay features.
