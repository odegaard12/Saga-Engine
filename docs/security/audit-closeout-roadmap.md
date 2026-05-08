# Audit closeout roadmap

This document tracks the remaining security/audit work before returning focus to gameplay, PWA/offline, QR/NFC, inventory and team mechanics.

## Closed or mostly closed

- Formal MIT license.
- Classic admin retired; React admin is the primary CMS/Mission Control.
- Real frontend build validation in CI.
- Backend smoke tests and contract checks.
- HttpOnly admin session cookie flow.
- Legacy admin password payload disabled by default.
- Invalid admin login now returns a clean `401`.
- Trusted proxy handling is opt-in.
- JSON storage helpers and transaction helper.
- Event log repository and optional SQLite event adapter.
- Game state repository and optional SQLite game state adapter.
- Live positions repository and optional SQLite positions adapter.
- Heartbeat writes routed through the positions adapter.
- Player progress routes routed through the game state adapter.
- `data/stages.json` protected by CI.
- Repository privacy guard added.

## Remaining before gameplay work resumes

Recommended remaining audit PRs:

1. Extract admin auth helpers from `main.py`.
2. Extract trusted proxy/client IP helpers from `main.py`.
3. Add route-level SQLite smoke tests for event sync/admin event review.
4. Add SQLite backup/migration dry-run documentation.
5. Start splitting `main.py` into route modules after security helpers are isolated.

## Rule for stage content

Do not modify `data/stages.json` in audit, storage, security, CI or backend refactor PRs.

Stage content changes must be explicit mission/content PRs and must use:

`SAGA_ALLOW_PROTECTED_STAGES_CHANGE=1`
