# Changelog

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
