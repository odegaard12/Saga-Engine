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
